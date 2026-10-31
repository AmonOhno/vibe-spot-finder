"""Overture Maps の base テーマ（OSM 由来）から、関東周辺の観光スポット候補を抽出する。

  python3 scripts/spots/extract_overture_base.py OUT_DIR [--release 2026-10-21.0]

出力:
  OUT_DIR/base.parquet         名前付きで観光向きクラスの地物（bbox・OSM タグ・Wikidata 付き）
  OUT_DIR/prefectures.parquet  関東 1 都 6 県の行政区域ポリゴン（都県判定用）
"""
import argparse
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq

from extract_overture import BBOX, s3_filesystem

# type ごとに候補とする class（学校・駅・道路などは除外）
CLASSES = {
    'land': ['beach', 'cliff', 'peak', 'cape', 'island', 'islet', 'volcano', 'cave_entrance', 'valley',
             'wetland', 'forest', 'tree', 'grassland', 'rock', 'stone', 'hill', 'ridge', 'plateau', 'dune',
             'shingle', 'bare_rock', 'scrub', 'heath', 'meadow'],
    'land_use': ['park', 'garden', 'theme_park', 'zoo', 'religious', 'winter_sports', 'nature_reserve',
                 'national_park', 'protected_area', 'aquarium', 'water_park', 'retail', 'commercial',
                 'recreation_ground', 'camp_site', 'botanical_garden', 'cemetery', 'grave_yard', 'resort',
                 'beach_resort', 'marina', 'dog_park', 'village_green', 'golf_course', 'stadium', 'orchard',
                 'vineyard', 'flowerbed', 'meadow', 'plaza', 'pedestrian'],
    'water': ['lake', 'waterfall', 'bay', 'pond', 'reservoir', 'lagoon', 'strait', 'cape', 'spring', 'hot_spring',
              'moat', 'canal', 'river', 'rapids', 'oxbow', 'sea', 'ocean'],
    'infrastructure': ['viewpoint', 'communication_tower', 'tower', 'lighthouse', 'artwork', 'cable_car',
                       'gondola', 'observation', 'pier', 'bridge', 'aerialway_station', 'information'],
}
COLUMNS = ['id', 'names', 'subtype', 'class', 'wikidata', 'source_tags', 'bbox']
KANTO_CODES = ['JP-08', 'JP-09', 'JP-10', 'JP-11', 'JP-12', 'JP-13', 'JP-14']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out', type=Path)
    ap.add_argument('--release', default='2026-10-21.0')
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    s3 = s3_filesystem()
    root = f'overturemaps-us-west-2/release/{args.release}'
    b = lambda k: ds.field('bbox', k)  # noqa: E731
    in_bbox = ((b('xmin') >= BBOX['xmin']) & (b('xmax') <= BBOX['xmax'])
               & (b('ymin') >= BBOX['ymin']) & (b('ymax') <= BBOX['ymax']))

    tables = []
    for t, classes in CLASSES.items():
        flt = in_bbox & ds.field('class').isin(classes)
        table = ds.dataset(f'{root}/theme=base/type={t}/', filesystem=s3, format='parquet').to_table(
            columns=COLUMNS, filter=flt)
        table = table.filter(pc.is_valid(pc.struct_field(table['names'], 'primary')))
        table = table.append_column('type', pa.array([t] * table.num_rows))
        print(t, table.num_rows)
        tables.append(table)
    pq.write_table(pa.concat_tables(tables, promote_options='permissive'), args.out / 'base.parquet')

    areas = ds.dataset(f'{root}/theme=divisions/type=division_area/', filesystem=s3, format='parquet')
    pref = areas.to_table(columns=['names', 'region', 'subtype', 'geometry'],
                          filter=(ds.field('country') == 'JP') & (ds.field('subtype') == 'region')
                          & ds.field('region').isin(KANTO_CODES))
    pq.write_table(pref, args.out / 'prefectures.parquet')
    print('prefectures', pref.num_rows)


if __name__ == '__main__':
    main()
