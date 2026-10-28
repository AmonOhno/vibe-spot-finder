# 関東スポットデータの生成

`src/data/kantoSpots.ts` を作るためのスクリプト。仕様は [docs/SPEC.md §4.4.1](../../docs/SPEC.md) を参照。
データは [Overture Maps](https://overturemaps.org/) の公開リリース（`s3://overturemaps-us-west-2`、匿名アクセス）から取得する。

```bash
pip install pyarrow shapely
WORK=/tmp/spots-work && mkdir -p $WORK

# 1. 関東周辺の places（照合用）と base テーマの候補・都県ポリゴンを抽出
python3 scripts/spots/extract_overture.py $WORK/kanto.parquet
python3 scripts/spots/extract_overture_base.py $WORK

# 2. 種別判定・雰囲気付与・選別をして src/data/kantoSpots.ts を生成（既定 2,000 件）
python3 scripts/spots/build_kanto_spots.py $WORK --count 2000
npm run test:unit
```

| ファイル | 内容 |
|---|---|
| `extract_overture.py` | places テーマから関東の矩形内の地点を抽出（代表スポットの照合用） |
| `extract_overture_base.py` | base テーマ（OSM 由来）の観光向きクラスの地物と、都県の行政区域を抽出 |
| `kanto_curated.py` | 代表スポット（雰囲気を手動調整） |
| `build_kanto_spots.py` | 種別判定・除外ルール・知名度による選別・TS 出力 |

リリース名は `--release` で変更できる（既定 `2026-10-21.0`）。古いリリースは S3 から削除されるため、取得できないときは
`https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/` で最新を確認する。
