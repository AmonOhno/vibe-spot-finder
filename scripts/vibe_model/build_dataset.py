"""Open Images（人手検証済みラベル付きの Web 写真）から学習用データセットを作る。

ラベル CSV と画像を取得し、アプリと同じく長辺 96px に縮小した RGB 配列を npz に保存する。
取得したデータはリポジトリにコミットしない（作業ディレクトリ WORK_DIR に置く）。

  python3 scripts/vibe_model/build_dataset.py WORK_DIR [--per-vibe 3000] [--background 5000]

前提: WORK_DIR に以下を配置済みであること（README.md 参照）
  classes.csv                                  oidv7-class-descriptions.csv
  {test,validation}-annotations-human-imagelabels.csv
  train-vibe-labels.csv                        train ラベルを Vibe クラスで絞り込んだもの
"""
import argparse
import collections
import csv
import io
import random
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

from labels import VIBE_CLASSES, VIBE_IDS

ANALYSIS_SIZE = 96
IMAGE_URL = 'https://s3.amazonaws.com/open-images-dataset/{split}/{id}.jpg'


def load_positives(work: Path):
    names = {r[1]: r[0] for r in csv.reader(open(work / 'classes.csv', encoding='utf-8'))}
    mid2vibe = collections.defaultdict(set)
    for v, cs in VIBE_CLASSES.items():
        for c in cs:
            mid2vibe[names[c]].add(v)
    labels = collections.defaultdict(set)  # (split, id) -> vibes
    all_test = set()
    files = [('test', 'test-annotations-human-imagelabels.csv'),
             ('validation', 'validation-annotations-human-imagelabels.csv'),
             ('train', 'train-vibe-labels.csv')]
    for split, name in files:
        with open(work / name) as f:
            for row in csv.reader(f):
                if row[0] == 'ImageID':
                    continue
                if split == 'test':
                    all_test.add(row[0])
                if row[3] == '1' and row[2] in mid2vibe:
                    labels[(split, row[0])] |= mid2vibe[row[2]]
    background = [('test', i) for i in sorted(all_test) if ('test', i) not in labels]
    return labels, background


def fetch(cache: Path, key):
    """画像を取得して縮小する。結果は cache に保存し、再実行時は再取得しない。"""
    split, image_id = key
    path = cache / f'{split}_{image_id}.npy'
    miss = cache / f'{split}_{image_id}.missing'
    if path.exists():
        return np.load(path)
    if miss.exists():
        return None
    try:
        with urllib.request.urlopen(IMAGE_URL.format(split=split, id=image_id), timeout=60) as r:
            data = r.read()
        img = Image.open(io.BytesIO(data))
        img.draft('RGB', (ANALYSIS_SIZE * 2, ANALYSIS_SIZE * 2))  # JPEG の DCT 縮小で高速化
        img = img.convert('RGB')
        scale = ANALYSIS_SIZE / max(img.size)
        size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
        arr = np.asarray(img.resize(size, Image.BILINEAR), dtype=np.uint8)
        np.save(path, arr)
        return arr
    except urllib.error.HTTPError as e:
        if e.code == 404:  # train の一部（crowdsource 由来）は S3 に実体がない
            miss.touch()
        print('skip', key, e, file=sys.stderr)
        return None
    except Exception as e:
        print('skip', key, e, file=sys.stderr)
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('work', type=Path)
    ap.add_argument('--per-vibe', type=int, default=3000)
    ap.add_argument('--background', type=int, default=5000)
    ap.add_argument('--seed', type=int, default=0)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    cache = args.work / 'images'
    cache.mkdir(exist_ok=True)

    labels, background = load_positives(args.work)
    pools = {}
    for v in VIBE_IDS:
        pools[v] = sorted(k for k, vs in labels.items() if v in vs)
        rng.shuffle(pools[v])
        print(v, 'pool', len(pools[v]), file=sys.stderr)
    rng.shuffle(background)
    pools['background'] = background
    targets_n = {**{v: args.per_vibe for v in VIBE_IDS}, 'background': args.background}

    images = {}  # key -> array
    tried = set()
    cursor = dict.fromkeys(pools, 0)
    with ThreadPoolExecutor(48) as ex:
        while True:
            # 目標数に満たない Vibe について、不足分（404 を見込んで多め）を追加で取得する
            have = {g: sum(1 for k in images if (g in labels.get(k, ()) if g != 'background' else k not in labels))
                    for g in pools}
            batch = []
            for g, pool in pools.items():
                need = targets_n[g] - have[g]
                while need > 0 and cursor[g] < len(pool):
                    k = pool[cursor[g]]
                    cursor[g] += 1
                    if k not in tried:
                        batch.append(k)
                        tried.add(k)
                        need -= 1
            print('have', have, 'fetching', len(batch), file=sys.stderr)
            if not batch:
                break
            for k, img in zip(batch, ex.map(lambda k: fetch(cache, k), batch)):
                if img is not None:
                    images[k] = img

    keys = sorted(images)
    shapes = np.array([images[k].shape[:2] for k in keys], dtype=np.int32)
    flat = np.concatenate([images[k].reshape(-1, 3) for k in keys])
    targets = np.array([[1.0 if v in labels.get(k, ()) else 0.0 for v in VIBE_IDS] for k in keys], dtype=np.float32)
    # 可変サイズ画像を 1 本の配列に詰めて保存する
    np.savez_compressed(args.work / 'dataset.npz', pixels=flat, shapes=shapes, targets=targets,
                        ids=np.array([f'{s}/{i}' for s, i in keys]))
    print('saved', len(keys), targets.sum(0), file=sys.stderr)


if __name__ == '__main__':
    main()
