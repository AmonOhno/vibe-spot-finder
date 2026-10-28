"""Overture Maps の places（S3 公開データ）から関東周辺のスポット候補を抽出する。

  python3 scripts/spots/extract_overture.py OUT.parquet [--release 2026-10-21.0]

関東 1 都 6 県を含む矩形の行のみを読み、ローカルの parquet に保存する。
"""
import argparse
import os
import urllib.parse

import pyarrow.dataset as ds
import pyarrow.fs as fs
import pyarrow.parquet as pq

# 関東 1 都 6 県を覆う矩形（伊豆諸島・小笠原は対象外）
BBOX = dict(xmin=138.35, xmax=140.95, ymin=34.85, ymax=37.2)
COLUMNS = ['id', 'names', 'confidence', 'basic_category', 'taxonomy', 'addresses', 'bbox', 'websites',
           'socials', 'sources', 'operating_status']


def s3_filesystem():
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    opts = {}
    if proxy:
        p = urllib.parse.urlparse(proxy)
        opts['proxy_options'] = {'scheme': p.scheme, 'host': p.hostname, 'port': p.port}
    return fs.S3FileSystem(anonymous=True, region='us-west-2', **opts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--release', default='2026-10-21.0')
    args = ap.parse_args()
    path = f'overturemaps-us-west-2/release/{args.release}/theme=places/type=place/'
    dataset = ds.dataset(path, filesystem=s3_filesystem(), format='parquet')
    b = lambda k: ds.field('bbox', k)  # noqa: E731
    flt = ((b('xmin') >= BBOX['xmin']) & (b('xmax') <= BBOX['xmax'])
           & (b('ymin') >= BBOX['ymin']) & (b('ymax') <= BBOX['ymax']))
    table = dataset.to_table(columns=COLUMNS, filter=flt)
    pq.write_table(table, args.out)
    print('rows', table.num_rows)


if __name__ == '__main__':
    main()
