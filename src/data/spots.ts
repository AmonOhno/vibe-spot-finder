import type { VibeId } from '../analysis/types';

export const REGIONS = ['北海道・東北', '関東', '中部', '関西', '中国・四国', '九州・沖縄'] as const;
export type Region = (typeof REGIONS)[number];

export interface Spot {
  id: string;
  name: string;
  prefecture: string;
  region: Region;
  description: string;
  /** スポットが持つ雰囲気の重み（0〜1）。記載のない Vibe は 0 とみなす。 */
  vibes: Partial<Record<VibeId, number>>;
  /** Google マップ検索に使うクエリ。省略時は `${name} ${prefecture}`。 */
  mapQuery?: string;
}

/**
 * 推薦対象スポットの静的データセット（v0.1）。
 * 追加・変更時は docs/SPEC.md §4.4 のデータ要件を満たすこと。
 */
export const SPOTS: Spot[] = [
  { id: 'kabira-bay', name: '川平湾', prefecture: '沖縄県', region: '九州・沖縄', description: 'エメラルドグリーンの海が広がる石垣島の景勝地', vibes: { ocean: 1, vivid: 0.4, forest: 0.2 } },
  { id: 'yonaha-maehama', name: '与那覇前浜ビーチ', prefecture: '沖縄県', region: '九州・沖縄', description: '真っ白な砂浜と遠浅の青い海', vibes: { ocean: 1, snow: 0.3 } },
  { id: 'enoshima', name: '江の島', prefecture: '神奈川県', region: '関東', description: '海と夕日、レトロな参道が楽しめる島', vibes: { ocean: 0.8, sunset: 0.5, retro: 0.4 } },
  { id: 'shirahama', name: '白良浜', prefecture: '和歌山県', region: '関西', description: '白い砂浜と青い海のリゾートビーチ', vibes: { ocean: 0.9, snow: 0.3 } },
  { id: 'yakushima', name: '白谷雲水峡', prefecture: '鹿児島県', region: '九州・沖縄', description: '苔むす原生林が続く屋久島の森', vibes: { forest: 1, retro: 0.2 } },
  { id: 'oirase', name: '奥入瀬渓流', prefecture: '青森県', region: '北海道・東北', description: '新緑と清流が続く渓流散策路', vibes: { forest: 0.9, ocean: 0.3 } },
  { id: 'arashiyama', name: '嵐山 竹林の小径', prefecture: '京都府', region: '関西', description: '空まで伸びる竹林の静かな小道', vibes: { forest: 0.9, retro: 0.4 } },
  { id: 'kamikochi', name: '上高地', prefecture: '長野県', region: '中部', description: '穂高連峰と梓川の澄んだ山岳景観', vibes: { forest: 0.8, ocean: 0.3, snow: 0.3 } },
  { id: 'futami', name: '双海 下灘駅', prefecture: '愛媛県', region: '中国・四国', description: '海に沈む夕日を望む無人駅', vibes: { sunset: 1, ocean: 0.5, retro: 0.6 }, mapQuery: '下灘駅 愛媛県' },
  { id: 'chichibugahama', name: '父母ヶ浜', prefecture: '香川県', region: '中国・四国', description: '夕暮れの潮だまりが空を映す「日本のウユニ塩湖」', vibes: { sunset: 1, ocean: 0.5 } },
  { id: 'otaru-canal', name: '小樽運河', prefecture: '北海道', region: '北海道・東北', description: 'ガス灯と石造倉庫が並ぶノスタルジックな運河', vibes: { retro: 0.8, sunset: 0.5, night: 0.4 } },
  { id: 'ginzan', name: '銀山温泉', prefecture: '山形県', region: '北海道・東北', description: '大正ロマンの木造旅館と雪景色の温泉街', vibes: { retro: 1, snow: 0.6, night: 0.4 } },
  { id: 'kawagoe', name: '川越 蔵造りの町並み', prefecture: '埼玉県', region: '関東', description: '小江戸と呼ばれる蔵造りの町並み', vibes: { retro: 1, sunset: 0.3 } },
  { id: 'kurashiki', name: '倉敷美観地区', prefecture: '岡山県', region: '中国・四国', description: '白壁の町並みと柳並木の運河', vibes: { retro: 0.9, snow: 0.2, forest: 0.2 } },
  { id: 'shinjuku-kabukicho', name: '新宿 歌舞伎町', prefecture: '東京都', region: '関東', description: 'ネオンが輝く眠らない街', vibes: { night: 1, vivid: 0.7 } },
  { id: 'dotonbori', name: '道頓堀', prefecture: '大阪府', region: '関西', description: '巨大看板とネオンが川面に映る繁華街', vibes: { night: 0.9, vivid: 0.9 } },
  { id: 'hakodate-yama', name: '函館山 展望台', prefecture: '北海道', region: '北海道・東北', description: '100万ドルの夜景で知られる展望台', vibes: { night: 1, ocean: 0.2 } },
  { id: 'minatomirai', name: 'みなとみらい', prefecture: '神奈川県', region: '関東', description: '観覧車と高層ビルが彩る港の夜景', vibes: { night: 0.9, ocean: 0.4, vivid: 0.4 } },
  { id: 'shirakawago', name: '白川郷', prefecture: '岐阜県', region: '中部', description: '雪に包まれる合掌造りの集落', vibes: { snow: 1, retro: 0.6 } },
  { id: 'biei-shirogane', name: '美瑛 白金青い池', prefecture: '北海道', region: '北海道・東北', description: '雪と青い水面が織りなす幻想的な池', vibes: { snow: 0.8, ocean: 0.6 }, mapQuery: '白金青い池 北海道' },
  { id: 'zao', name: '蔵王 樹氷', prefecture: '山形県', region: '北海道・東北', description: '一面が白に覆われるスノーモンスター', vibes: { snow: 1 }, mapQuery: '蔵王 樹氷 山形県' },
  { id: 'hitachi-seaside', name: '国営ひたち海浜公園', prefecture: '茨城県', region: '関東', description: 'ネモフィラやコキアが丘を一色に染める', vibes: { vivid: 1, ocean: 0.4, forest: 0.4 } },
  { id: 'takeshita', name: '原宿 竹下通り', prefecture: '東京都', region: '関東', description: 'カラフルなショップが並ぶポップな通り', vibes: { vivid: 1, retro: 0.2 } },
  { id: 'fushimi-inari', name: '伏見稲荷大社', prefecture: '京都府', region: '関西', description: '朱色の千本鳥居が続く参道', vibes: { vivid: 0.7, sunset: 0.7, retro: 0.5, forest: 0.3 } },
];

export function googleMapsUrl(spot: Spot): string {
  const query = spot.mapQuery ?? `${spot.name} ${spot.prefecture}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
