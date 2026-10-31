"""学習側（Python）とアプリ側（TS）の一致を検証するフィクスチャを生成する。

  python3 scripts/vibe_model/make_parity_fixture.py

特徴量（features.py ↔ modelFeatures.ts）と、vibeModelWeights.ts の重みを使った最終スコア
（train.py の blend ↔ vibeAnalyzer.ts の analyzeFrames）を記録する。重みを更新したら再生成すること。
"""
import json
import re
from pathlib import Path

import numpy as np

from features import extract
from train import OUT_TS, blend

OUT = Path(__file__).resolve().parents[2] / 'src' / 'analysis' / '__fixtures__' / 'featureParity.json'


def load_weights():
    src = OUT_TS.read_text(encoding='utf-8')
    get = lambda name: np.array(json.loads(re.search(rf'export const {name} = (.+?);', src).group(1)))  # noqa: E731
    return {k: get(k) for k in ('FEATURE_MEAN', 'FEATURE_STD', 'W1', 'B1', 'W2', 'B2', 'HIDDEN_SIZE')}


def predict(w, f):
    hidden = int(w['HIDDEN_SIZE'])
    x = (f - w['FEATURE_MEAN']) / w['FEATURE_STD']
    h = np.maximum(0, x @ w['W1'].reshape(-1, hidden) + w['B1'])
    p = 1 / (1 + np.exp(-(h @ w['W2'].reshape(hidden, -1) + w['B2'])))
    return blend(f[None], p[None])[0]


def main():
    w = load_weights()
    rng = np.random.default_rng(7)
    cases = []
    for h, wd in [(6, 9), (11, 7), (2, 3), (1, 5), (24, 32)]:
        img = rng.integers(0, 256, (h, wd, 3), dtype=np.uint8)
        img[0, 0] = [128, 128, 128]  # 無彩色・暗部・境界値も含める
        img[-1, -1] = [10, 10, 30]
        if h == 24:  # 実写に近い、なだらかな色の上に細かな変化がある画像
            img = np.clip(np.linspace([20, 80, 140], [200, 160, 90], h)[:, None] + rng.normal(0, 18, (h, wd, 3)),
                          0, 255).astype(np.uint8)
        f = extract(img)
        cases.append({'width': wd, 'height': h, 'rgb': img.ravel().tolist(), 'features': f.tolist(),
                      'profile': predict(w, f).tolist()})
    OUT.write_text(json.dumps(cases) + '\n')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
