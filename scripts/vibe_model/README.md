# 解析モデルの学習

`src/analysis/vibeModelWeights.ts`（学習済み重み）を作るためのスクリプト。仕様は [docs/SPEC.md §4.2](../../docs/SPEC.md) を参照。
学習データ（画像）はリポジトリに含めない。作業ディレクトリ `WORK` に取得する（約 0.5GB）。

```bash
pip install numpy pillow
WORK=/tmp/vibe-work && mkdir -p $WORK && cd $WORK

# 1. Open Images のラベル（人手検証済みの画像レベルラベル）を取得
curl -o classes.csv https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv
curl -O https://storage.googleapis.com/openimages/v5/test-annotations-human-imagelabels.csv
curl -O https://storage.googleapis.com/openimages/v5/validation-annotations-human-imagelabels.csv
# train（約 2.4GB）は Vibe に対応するクラスの行だけをストリームで抽出する
python3 -c "
import csv, sys; sys.path.insert(0, '$OLDPWD/scripts/vibe_model')
from labels import VIBE_CLASSES
names = {r[1]: r[0] for r in csv.reader(open('classes.csv', encoding='utf-8'))}
print('\n'.join(',' + names[c] + ',1' for cs in VIBE_CLASSES.values() for c in cs))" > mids.txt
curl -s https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-human-imagelabels.csv \
  | grep -F -f mids.txt > train-vibe-labels.csv
cd -

# 2. 画像を取得し、長辺 96px に縮小して dataset.npz に保存（Vibe ごと最大 3,000 枚 + ラベルなし 5,000 枚）
python3 scripts/vibe_model/build_dataset.py $WORK

# 3. 学習・評価（旧ルールとの比較を表示）。--write で重みを TS に書き出す
python3 scripts/vibe_model/train.py $WORK --write

# 4. Python と TS の一致検証用フィクスチャを再生成し、ユニットテストを実行
python3 scripts/vibe_model/make_parity_fixture.py
npm run test:unit
```

| ファイル | 内容 |
|---|---|
| `labels.py` | Open Images のクラス名と Vibe の対応表 |
| `build_dataset.py` | ラベル CSV から画像を選び、S3 から取得・縮小する（404 の画像は自動で補充） |
| `features.py` | 特徴量抽出（`src/analysis/modelFeatures.ts` と同一定義） |
| `train.py` | MLP の学習・評価・重みの書き出し |
| `make_parity_fixture.py` | `src/analysis/__fixtures__/featureParity.json` の生成 |

特徴量の定義を変えるときは `features.py` と `modelFeatures.ts` を同時に変更し、再学習・フィクスチャ再生成まで行うこと。
