"""Overture Maps（OSM 由来の base テーマ）の抽出結果から関東のスポットデータを生成する。

  python3 scripts/spots/build_kanto_spots.py OUT_DIR [--count 2000]

OUT_DIR は extract_overture_base.py の出力先。src/data/kantoSpots.ts を上書きする。

スポットの種別（kind）を OSM のクラス・タグと名称の接尾辞から判定し、種別ごとの基本 Vibe 重みに
名称中のキーワード（夜景・夕日・紅葉など）による補正を加える。知名度の目安として Wikidata の有無と
面積を使い、上位から種別ごとの上限を守って選ぶ。
代表的なスポットは kanto_curated.py に手動で雰囲気を調整して定義し、データと照合できたものを優先して採用する。
"""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

import pyarrow.parquet as pq
from shapely import wkb
from shapely.geometry import Point
from shapely.strtree import STRtree

from kanto_curated import CURATED

ROOT = Path(__file__).resolve().parents[2]
OUT_TS = ROOT / 'src' / 'data' / 'kantoSpots.ts'
PREF_NAMES = {'JP-08': '茨城県', 'JP-09': '栃木県', 'JP-10': '群馬県', 'JP-11': '埼玉県', 'JP-12': '千葉県',
              'JP-13': '東京都', 'JP-14': '神奈川県'}

# kind -> (説明文, 基本 Vibe 重み, 上限件数)
KINDS = {
    'beach': ('砂浜と海が広がる海岸', {'ocean': 1, 'sunset': 0.4, 'snow': 0.2}, 150),
    'cape': ('海に突き出した岬。水平線や夕日を望める', {'ocean': 0.9, 'sunset': 0.6, 'forest': 0.2}, 80),
    'island': ('海に浮かぶ島', {'ocean': 0.9, 'forest': 0.4}, 60),
    'bay': ('穏やかな水面が広がる湾・入江', {'ocean': 0.9, 'sunset': 0.4}, 40),
    'lighthouse': ('海を見守る灯台', {'ocean': 0.9, 'sunset': 0.6, 'retro': 0.3}, 40),
    'port': ('船が行き交う港・マリーナ', {'ocean': 0.8, 'sunset': 0.5, 'night': 0.3}, 40),
    'lake': ('山あいや平野に広がる湖', {'ocean': 0.7, 'forest': 0.5, 'sunset': 0.2}, 120),
    'pond': ('水辺の景色を楽しめる池・沼', {'ocean': 0.5, 'forest': 0.5, 'retro': 0.2}, 100),
    'waterfall': ('緑の中を流れ落ちる滝', {'forest': 0.8, 'ocean': 0.5}, 120),
    'valley': ('清流と木々が続く渓谷', {'forest': 0.9, 'ocean': 0.4}, 80),
    'spring': ('澄んだ水が湧き出る湧水地', {'forest': 0.6, 'ocean': 0.5}, 30),
    'wetland': ('木道から自然を眺められる湿原・湿地', {'forest': 0.7, 'ocean': 0.3, 'snow': 0.2}, 30),
    'peak': ('山頂からの眺望が楽しめる山', {'forest': 0.7, 'sunset': 0.3, 'snow': 0.3}, 330),
    'highpeak': ('雪をいただく高山', {'snow': 0.8, 'forest': 0.4, 'sunset': 0.3}, 60),
    'forest': ('木々に包まれる森', {'forest': 1}, 40),
    'nature': ('豊かな自然が残る保護区・自然公園', {'forest': 0.9, 'ocean': 0.2}, 40),
    'tree': ('地域で親しまれる巨木・名木', {'forest': 0.8, 'retro': 0.3}, 30),
    'park': ('緑豊かな公園', {'forest': 0.7, 'vivid': 0.2}, 400),
    'seaside_park': ('海辺の公園', {'ocean': 0.7, 'forest': 0.5, 'sunset': 0.3}, 60),
    'garden': ('四季の景色を楽しめる庭園', {'forest': 0.7, 'retro': 0.5, 'vivid': 0.3}, 100),
    'flower': ('季節の花が咲き誇る花の名所', {'vivid': 0.9, 'forest': 0.5}, 60),
    'theme_park': ('アトラクションが並ぶテーマパーク・遊園地', {'vivid': 1, 'night': 0.4}, 50),
    'zoo': ('動物たちに会える動物園', {'forest': 0.5, 'vivid': 0.5}, 30),
    'aquarium': ('海の生き物を間近に見られる水族館', {'ocean': 0.8, 'vivid': 0.4, 'night': 0.2}, 20),
    'shrine': ('鎮守の森に囲まれた神社', {'retro': 0.8, 'forest': 0.4, 'vivid': 0.2}, 250),
    'temple': ('歴史ある寺院', {'retro': 0.9, 'forest': 0.3}, 200),
    'church': ('趣のある教会', {'retro': 0.6, 'snow': 0.3}, 20),
    'castle': ('城跡・城郭', {'retro': 0.9, 'forest': 0.3}, 40),
    'historic': ('歴史を感じる史跡', {'retro': 0.8, 'forest': 0.3}, 80),
    'onsen': ('湯けむりが立つ温泉', {'retro': 0.7, 'forest': 0.4, 'snow': 0.3}, 40),
    'ski': ('冬は一面の銀世界になるスキー場', {'snow': 1, 'forest': 0.3}, 50),
    'viewpoint': ('景色を一望できる展望スポット', {'sunset': 0.8, 'night': 0.5, 'forest': 0.3}, 120),
    'tower': ('街を見下ろすタワー', {'night': 0.9, 'vivid': 0.4}, 20),
    'bridge': ('水面にかかる橋', {'night': 0.6, 'ocean': 0.5, 'sunset': 0.4}, 60),
    'street': ('店が軒を連ねる商店街・横丁', {'retro': 0.7, 'night': 0.5, 'vivid': 0.4}, 60),
    'shopping': ('買い物や食事を楽しめる繁華街', {'night': 0.7, 'vivid': 0.7}, 60),
    'ropeway': ('空中散歩を楽しめるロープウェイ', {'forest': 0.6, 'sunset': 0.3, 'snow': 0.3}, 20),
    'artwork': ('街なかのパブリックアート', {'vivid': 0.8, 'retro': 0.2}, 30),
    'camp': ('自然の中で過ごせるキャンプ場', {'forest': 0.8, 'night': 0.2}, 40),
}

# 名称中のキーワードによる Vibe の加算
KEYWORDS = [
    (r'夜景|イルミ|ネオン|ナイト', {'night': 0.5}),
    (r'夕日|夕陽|夕焼|サンセット', {'sunset': 0.5}),
    (r'紅葉|もみじ', {'sunset': 0.4, 'vivid': 0.3}),
    (r'桜|さくら|サクラ|花|フラワー|ばら|バラ|つつじ|あじさい|菖蒲|コスモス|ひまわり', {'vivid': 0.4}),
    (r'雪|スノー|白根|氷', {'snow': 0.4}),
    (r'海|浜|ビーチ|渚|潮|磯|港|マリン|シーサイド', {'ocean': 0.4}),
    (r'森|林|杜|緑|樹', {'forest': 0.3}),
    (r'旧|古|蔵|宿場|城下|門前|史跡|跡|遺跡|古墳|レトロ|昭和|大正|明治', {'retro': 0.4}),
]

# 名称の接尾辞で kind を判定する（OSM クラスより優先度は低い）
NAME_RULES = [
    (r'(海岸|海水浴場|ビーチ|[^横]浜)$', 'beach'),
    (r'(岬|崎|鼻)$', 'cape'),
    (r'(灯台)$', 'lighthouse'),
    (r'(湾|入江|入り江)$', 'bay'),
    (r'(港|漁港|マリーナ)$', 'port'),
    (r'(水族|シーワールド|アクアワールド)', 'aquarium'),
    (r'(製糸場|世界遺産)', 'historic'),
    (r'(湖|ダム湖)$', 'lake'),
    (r'(池|沼|潟)$', 'pond'),
    (r'(滝|大滝)$', 'waterfall'),
    (r'(渓谷|峡谷|峡|渓|谷)$', 'valley'),
    (r'(湧水|清水|泉)$', 'spring'),
    (r'(湿原|湿地)$', 'wetland'),
    (r'(海浜公園|臨海公園|海の公園|海浜緑地)$', 'seaside_park'),
    (r'(植物園|フラワーパーク|花の丘|花畑|花園|ばら園|バラ園)$', 'flower'),
    (r'(バラ|ばら|ぼたん|あやめ|菖蒲|コスモス|ポピー|ダリア|梅園|梅林|つつじ|芝桜|花の|フラワー|花園|花畑|百花園)', 'flower'),
    (r'(庭園|園地|御苑)$', 'garden'),
    (r'(公園|緑地|森林公園|の森|自然園)$', 'park'),
    (r'(遊園地|ランド|テーマパーク)$', 'theme_park'),
    (r'(動物園|ふれあい牧場)$', 'zoo'),
    (r'(水族館|アクアパーク|シーパラダイス)$', 'aquarium'),
    (r'(神社|神宮|大社|宮|稲荷|八幡)$', 'shrine'),
    (r'(寺|寺院|大師|不動尊|観音|観音堂)$', 'temple'),
    (r'(教会|聖堂|カテドラル)$', 'church'),
    (r'(城|城跡|城址)$', 'castle'),
    (r'(古墳|遺跡|史跡|跡|関所|陣屋|貝塚|旧[^\s]+家住宅)$', 'historic'),
    (r'(温泉|温泉郷|湯)$', 'onsen'),
    (r'(スキー場|スノーパーク|スキーリゾート)$', 'ski'),
    (r'(展望台|展望所|展望公園|見晴台|見晴らし台|展望デッキ)$', 'viewpoint'),
    (r'(タワー|ツリー)$', 'tower'),
    (r'(橋|ブリッジ)$', 'bridge'),
    (r'(商店街|横丁|横町|仲見世|通り)$', 'street'),
    (r'(ロープウェイ|ロープウエー|ケーブルカー)$', 'ropeway'),
    (r'(キャンプ場|オートキャンプ場)$', 'camp'),
    (r'(山|岳|峰|ヶ岳|丸|頭)$', 'peak'),
    (r'(島)$', 'island'),
]

# 観光スポットとしては除外する名称
EXCLUDE = re.compile(r'(駐車場|トイレ|便所|案内|学校|学園|大学|病院|霊園|墓地|斎場|処理場|浄水場|配水|調整池|調節池|遊水|'
                     r'貯水|沈澱池|沈殿池|堆積場|溜井|ゴルフ|グラウンド|運動場|テニス|野球場|スタジアム|プール|児童遊園|'
                     r'ちびっこ|団地|住宅|社宅|マンション|公衆|管理|事務所|役所|役場|交番|資材|工場|変電|鉄塔|送電|中継局|'
                     r'送信所|跨線|跨道|高架|陸橋|歩道橋|ガード|トンネル|IC$|JCT$|インター|サービスエリア|パーキング|料金所|'
                     r'研究|機構|地理院|気象庁|協定区域|埋立|ふ頭|埠頭|空港|滑走路|シーバース|ドック|訓練所|クラブ|'
                     r'エホバ|日蓮宗|河原|道の駅|イオン|ららぽーと|アリオ|アウトレット|モール|プラザ|タウン|ホテル|ニッコー|卸売|'
                     r'ゾーン|エリア|科$|人工島|京浜島|昭和島|扇島|^潮見$|^越中島$|^新港$|'
                     r'第[0-9０-９一二三四五六七八九十]+|[0-9０-９]+号|^[0-9０-９A-Za-z\s\-]+$)')
# それだけでは場所を特定できない一般名詞の名称
GENERIC = {'展望台', '展望デッキ', '展望塔', '展望広場', '展望ひろば', '展望台（閉鎖）', '見晴し台', '見晴広場', '見晴台', '城跡',
           '史跡', '国指定史跡', '県指定史跡', '由緒', '日本庭園', '花畑', '御苑', 'オートキャンプ場', '子どもキャンプ場',
           '海浜公園', '中央公園', '湿原', '自然観察園', 'バードサンクチュアリ', 'バードサンクチュアリー', '鳥類園',
           '保全緑地', '生態園', '花木園', '薬用植物園', 'しょうぶ園', 'ばら園', '樹木観察園', 'お花畑広場', '竹の庭',
           '大刈込', '植物区エリア', 'スカイガーデン', '風の丘', '中央火口', '夜景スポット', '夕陽スポット', '物見台',
           '富士山', 'パノラマ台', '眺望テラス', 'フランス式庭園', '野草園', '子供の森', 'ピクニックの森', 'Gサイト',
           '国会前庭', '新宿', '大橋', '庚申塔', '青面金剛', '不動明王', '南無妙法蓮華経', 'スカイシャトル', 'ゴンドラリフト',
           'パルキャビン', '水神宮', '八幡神社', '神明神社', '神明社', '熊野神社', '諏訪神社', '八坂神社', '白山神社',
           '愛宕神社', '浅間神社', '氷川神社', '若宮神社', '日枝神社', '稲荷神社', '天満宮', '御嶽神社', '鹿島神社',
           '神明宮', '八雲神社', '子安神社', '芝生と植栽', '保存樹林', 'つり橋', '救命艇', '導水管'} | set(PREF_NAMES.values())
# 種別ごとに、名称がこの表現を含まなければ除外する（クラスの誤りを除くため）
REQUIRE = {
    'onsen': r'温泉|湯',
    'bridge': r'(橋|ブリッジ)$',
    'bay': r'(湾|港|入江|浦|水道|灘)$',
    'shopping': r'(街|ヒルズ|中華街|横丁|市場|サカス|シティ)$',
    'tower': r'タワー|ツリー',
    'church': r'教会|聖堂',
    'camp': r'キャンプ|野営|ビレッジ|村|森|里',
    'historic': r'跡|遺跡|古墳|貝塚|関|陣屋|宿|墓|製糸場|館|住宅|門',
    'viewpoint': r'展望|見晴|眺望|テラス|丘|台|峠|岬|タワー|ビュー|スカイ|富士|夕|夜景|遥拝|望|山|岩|平$|園地',
    'island': r'(島|嶋|洲|なぎさ)$',
}


def tags(row):
    return dict(row['source_tags'] or {})


def classify(row, name):
    """OSM のクラス・タグ・名称から kind を決める。該当しなければ None。"""
    cls, typ, t = row['class'], row['type'], tags(row)
    ele = _float(t.get('ele'))
    by_class = {
        ('land', 'beach'): 'beach', ('land', 'shingle'): 'beach', ('land', 'dune'): 'beach',
        ('land', 'cape'): 'cape', ('water', 'cape'): 'cape', ('land', 'island'): 'island', ('land', 'islet'): 'island',
        ('water', 'bay'): 'bay', ('water', 'lagoon'): 'bay', ('water', 'strait'): 'bay',
        ('infrastructure', 'lighthouse'): 'lighthouse', ('land_use', 'marina'): 'port', ('infrastructure', 'pier'): 'port',
        ('water', 'lake'): 'lake', ('water', 'reservoir'): 'lake', ('water', 'pond'): 'pond', ('water', 'oxbow'): 'pond',
        ('water', 'waterfall'): 'waterfall', ('water', 'rapids'): 'valley', ('land', 'valley'): 'valley',
        ('water', 'spring'): 'spring', ('water', 'hot_spring'): 'onsen', ('land', 'wetland'): 'wetland',
        ('land', 'peak'): 'peak', ('land', 'volcano'): 'peak', ('land', 'hill'): 'peak', ('land', 'ridge'): 'peak',
        ('land', 'forest'): 'forest', ('land', 'tree'): 'tree', ('land_use', 'nature_reserve'): 'nature',
        ('land_use', 'national_park'): 'nature', ('land_use', 'protected_area'): 'nature',
        ('land_use', 'park'): 'park', ('land_use', 'garden'): 'garden', ('land_use', 'botanical_garden'): 'flower',
        ('land_use', 'theme_park'): 'theme_park', ('land_use', 'water_park'): 'theme_park',
        ('land_use', 'zoo'): 'zoo', ('land_use', 'aquarium'): 'aquarium', ('land_use', 'winter_sports'): 'ski',
        ('infrastructure', 'viewpoint'): 'viewpoint', ('infrastructure', 'communication_tower'): 'tower',
        ('infrastructure', 'tower'): 'tower', ('infrastructure', 'bridge'): 'bridge',
        ('infrastructure', 'cable_car'): 'ropeway', ('infrastructure', 'gondola'): 'ropeway',
        ('infrastructure', 'artwork'): 'artwork', ('land_use', 'camp_site'): 'camp',
        ('land_use', 'retail'): 'shopping', ('land_use', 'commercial'): 'shopping',
    }
    kind = by_class.get((typ, cls))
    by_name = next((k for pat, k in NAME_RULES if re.search(pat, name)), None)

    if typ == 'land_use' and cls == 'religious':
        religion = t.get('religion')
        if religion == 'shinto':
            kind = 'shrine'
        elif religion == 'buddhist':
            kind = 'temple'
        elif religion == 'christian':
            kind = 'church'
        else:
            kind = by_name if by_name in ('shrine', 'temple', 'church') else None
    if t.get('historic') in ('castle', 'ruins', 'archaeological_site', 'monument', 'memorial', 'tomb') and kind in (None, 'park'):
        kind = 'castle' if t.get('historic') == 'castle' or by_name == 'castle' else 'historic'
    if t.get('garden:type') == 'japanese' or t.get('garden:style') == 'japanese':
        kind = 'garden'
    if t.get('tourism') == 'viewpoint':
        kind = 'viewpoint'
    # 一般的なクラス（公園・池・山など）は名称の判定で細分化する
    if kind in (None, 'park', 'pond', 'lake', 'peak', 'shopping', 'garden', 'forest', 'nature', 'wetland',
                'theme_park') and by_name in (
            'seaside_park', 'flower', 'garden', 'theme_park', 'zoo', 'aquarium', 'castle', 'historic', 'viewpoint',
            'street', 'beach', 'onsen', 'ski', 'valley', 'waterfall', 'shrine', 'temple', 'camp', 'wetland'):
        # 庭園→テーマパークのような格上げは誤判定が多いので、具体的な種別への細分化だけを許す
        if not (kind == 'garden' and by_name in ('park', 'camp')):
            kind = by_name
    if kind is None and typ == 'land_use' and cls in ('recreation_ground', 'village_green', 'plaza', 'pedestrian'):
        kind = by_name if by_name in ('park', 'garden', 'street', 'flower') else None
    if kind is None and typ == 'water' and cls in ('canal', 'moat', 'river'):
        kind = by_name if by_name in ('valley', 'waterfall') else None
    if kind == 'shopping' and by_name == 'street':
        kind = 'street'
    if kind == 'bridge' and t.get('railway'):
        return None
    if kind in ('peak',) and (ele or 0) >= 1800:
        kind = 'highpeak'
    return kind


def _float(v):
    try:
        return float(str(v).split()[0].replace('m', ''))
    except (TypeError, ValueError, IndexError):
        return None


def area_ha(bbox):
    lat = math.radians((bbox['ymin'] + bbox['ymax']) / 2)
    w = (bbox['xmax'] - bbox['xmin']) * 111.32 * math.cos(lat)
    h = (bbox['ymax'] - bbox['ymin']) * 110.57
    return w * h * 100  # km² -> ha（bbox 面積なので実面積より大きめ）


def prominence(row, kind):
    """知名度の目安。Wikidata・Wikipedia・観光タグ・面積・標高から算出する。"""
    t = tags(row)
    s = 0.0
    if row['wikidata']:
        s += 3
    if t.get('wikipedia') or t.get('wikimedia_commons'):
        s += 1
    if t.get('tourism') in ('attraction', 'viewpoint', 'theme_park', 'zoo', 'aquarium'):
        s += 1
    if t.get('heritage') or t.get('historic'):
        s += 0.5
    s += min(3, math.log10(1 + area_ha(row['bbox'])))
    ele = _float(t.get('ele'))
    if kind in ('peak', 'highpeak') and ele:
        s += min(2, ele / 1000)
    return s


# kind ごとの採用最低ライン（小さな公園・祠などを除く）
MIN_PROMINENCE = {'park': 2.2, 'pond': 1.6, 'shrine': 1.2, 'temple': 1.2, 'peak': 1.0, 'shopping': 3.0,
                  'bridge': 3.0, 'tree': 3.0, 'artwork': 3.0, 'street': 1.0, 'lake': 1.0}


def make_vibes(kind, name, t):
    v = dict(KINDS[kind][1])
    for pat, add in KEYWORDS:
        if re.search(pat, name):
            for k, w in add.items():
                v[k] = v.get(k, 0) + w
    if t.get('heritage') and kind not in ('theme_park', 'shopping'):
        v['retro'] = v.get('retro', 0) + 0.2
    return {k: round(min(1.0, w), 2) for k, w in v.items() if w > 0}


def load_names(work: Path):
    """照合用に base と places の (名称, 経度, 緯度) を列挙する。"""
    out = []
    for row in pq.read_table(work / 'base.parquet', columns=['names', 'bbox']).to_pylist():
        b = row['bbox']
        out.append(((row['names'] or {}).get('primary') or '', (b['xmin'] + b['xmax']) / 2, (b['ymin'] + b['ymax']) / 2))
    places = work / 'kanto.parquet'
    if places.exists():
        for row in pq.read_table(places, columns=['names', 'bbox']).to_pylist():
            b = row['bbox']
            out.append(((row['names'] or {}).get('primary') or '', b['xmin'], b['ymin']))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('work', type=Path)
    ap.add_argument('--count', type=int, default=2000)
    args = ap.parse_args()

    prefs = pq.read_table(args.work / 'prefectures.parquet').to_pylist()
    geoms = [wkb.loads(p['geometry']) for p in prefs]
    tree = STRtree(geoms)

    def prefecture(lon, lat):
        pt = Point(lon, lat)
        for i in tree.query(pt):
            if geoms[i].contains(pt):
                return PREF_NAMES[prefs[i]['region']]
        return None

    # 1. 代表スポット: データ上に同名の地物が想定の都県内にあるものだけ採用する
    names = load_names(args.work)
    spots, taken = [], set()
    for sid, name, pref, key, desc, vibes in CURATED:
        hits = [(x, y) for n, x, y in names if key in n]
        if not any(prefecture(x, y) == pref for x, y in hits):
            print('WARN curated not verified:', name, pref, len(hits))
            continue
        spots.append({'id': f'kanto-{sid}', 'name': name, 'prefecture': pref, 'region': '関東', 'description': desc,
                      'vibes': vibes, 'mapQuery': f'{name} {pref}'})
        taken.update({name.replace(' ', ''), key})
    curated_n = len(spots)

    # 2. 自動生成: OSM のクラス・タグ・名称から種別を判定する
    existing = set(re.findall(r"name: '([^']+)'", (ROOT / 'src/data/spots.ts').read_text()))
    candidates = []
    for row in pq.read_table(args.work / 'base.parquet').to_pylist():
        n = row['names'] or {}
        name = (dict(n.get('common') or {}).get('ja') or n.get('primary') or '').strip()
        name = re.sub(r'^\S*(都|道|府|県|区|市|町|村)立\s*', '', name)
        if re.search(r'\s', name):  # 「施設名 区画名」のような名称は場所を特定しにくい
            continue
        if not name or len(name) < 2 or len(name) > 24 or EXCLUDE.search(name) or name in GENERIC:
            continue
        if not re.search(r'[぀-ヿ一-鿿]', name):  # 日本語名のないものは除外
            continue
        if name in existing or name in taken or any(k in name for k in taken if len(k) >= 4):
            continue
        kind = classify(row, name)
        if kind is None or (kind in REQUIRE and not re.search(REQUIRE[kind], name)):
            continue
        score = prominence(row, kind)
        if score < MIN_PROMINENCE.get(kind, 0.5):
            continue
        b = row['bbox']
        candidates.append(dict(row=row, name=name, kind=kind, score=score,
                               lon=(b['xmin'] + b['xmax']) / 2, lat=(b['ymin'] + b['ymax']) / 2))

    # 同名で近接（約 10km 以内）するもの（分割ポリゴンや案内点）は最も知名度の高い 1 件にまとめる
    candidates.sort(key=lambda c: (-c['score'], c['name']))
    auto, by_name, counts = [], {}, {k: 0 for k in KINDS}
    for c in candidates:
        if curated_n + len(auto) >= args.count:
            break
        near = by_name.setdefault(c['name'], [])
        if any(abs(c['lon'] - x) < 0.11 and abs(c['lat'] - y) < 0.09 for x, y in near):
            continue
        if counts[c['kind']] >= KINDS[c['kind']][2]:
            continue
        pref = prefecture(c['lon'], c['lat'])
        if pref is None:
            continue
        near.append((c['lon'], c['lat']))
        counts[c['kind']] += 1
        c['pref'] = pref
        auto.append(c)

    used_ids = {s['id'] for s in spots}
    for c in sorted(auto, key=lambda c: (c['pref'], c['kind'], c['name'])):
        t = tags(c['row'])
        city = t.get('addr:city') or ''
        key = c['row']['wikidata'] or hashlib.sha1(c['row']['id'].encode()).hexdigest()[:10]
        sid = f'kanto-{key.lower()}'
        while sid in used_ids:
            sid += 'x'
        used_ids.add(sid)
        spots.append({
            'id': sid,
            'name': c['name'],
            'prefecture': c['pref'],
            'region': '関東',
            'description': KINDS[c['kind']][0],
            'vibes': make_vibes(c['kind'], c['name'], t),
            # 同名スポットの取り違えを減らすため、住所タグに市区町村があれば検索語に加える
            'mapQuery': f"{c['name']} {c['pref']}{city}",
        })

    lines = [
        '// このファイルは scripts/spots/build_kanto_spots.py で自動生成している。手で編集しないこと。',
        '// 出典: Overture Maps Foundation（base テーマ）経由の OpenStreetMap データ',
        '// © OpenStreetMap contributors（ODbL 1.0） https://www.openstreetmap.org/copyright',
        "import type { Spot } from './spots';",
        '',
        f'/** 関東 1 都 6 県のスポット（{len(spots)} 件。うち代表スポット {curated_n} 件）。 */',
        'export const KANTO_SPOTS: Spot[] = [',
    ]
    for s in spots:
        lines.append('  ' + json.dumps(s, ensure_ascii=False, separators=(',', ':')) + ',')
    lines.append('];')
    OUT_TS.write_text('\n'.join(lines) + '\n', encoding='utf-8')

    print('curated', curated_n, 'auto', len(auto), 'total', len(spots), 'candidates', len(candidates))
    print({k: v for k, v in counts.items()})
    pc = {}
    for s in spots:
        pc[s['prefecture']] = pc.get(s['prefecture'], 0) + 1
    print(pc)


if __name__ == '__main__':
    main()
