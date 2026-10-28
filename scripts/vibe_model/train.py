"""Vibe 推定モデル（小さな MLP）を学習し、src/analysis/vibeModelWeights.ts に書き出す。

  python3 scripts/vibe_model/train.py WORK_DIR [--write]

WORK_DIR/dataset.npz は build_dataset.py で作成したもの（Open Images の写真を長辺 96px に縮小）。
実写データに加え、単色・グラデーション・図形だけの合成画像を旧ルール（v0.1 の scoreVibes）の
スコアで少量学習させ、写真以外の平坦な画像では旧ルールと整合する挙動を保つ。

評価は学習に使わない実写テスト分割（ImageID のハッシュで 15%）で行い、旧ルールと比較する。
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from features import FEATURE_SIZE, extract
from labels import VIBE_IDS

ROOT = Path(__file__).resolve().parents[2]
OUT_TS = ROOT / 'src' / 'analysis' / 'vibeModelWeights.ts'
DOMINANT_THRESHOLD = 0.3
# 輝度勾配の平均（特徴 73）がこの範囲で、旧ルール → 学習モデルへ線形に切り替える。
# 実写の 98% は 0.02 以上で、単色・グラデーションのような平坦な画像（学習分布外）は旧ルールで判定する。
GATE_LOW, GATE_HIGH = 0.005, 0.03


def clamp01(x):
    return np.clip(x, 0, 1)


def legacy_scores(f):
    """v0.1 のルールベース scoreVibes を特徴ベクトルから再現する（比較・合成ラベル用）。"""
    stats = f[:, 66:73]
    ratios = f[:, 78:84]
    brightness, contrast, saturation, warmth = stats[:, 0], stats[:, 1], stats[:, 2], stats[:, 4]
    blue, green, warm, dark, neon, white = ratios.T
    mid = np.where((brightness >= 0.25) & (brightness <= 0.8), 1, 0.3)
    return np.stack([
        clamp01(blue * 1.6) * np.where(brightness > 0.25, 1, 0.4),
        clamp01(green * 1.6),
        clamp01(warm * 1.4) * mid,
        clamp01(dark * 1.2) * (0.6 + 0.4 * clamp01(neon * 5)),
        clamp01(white * 1.5),
        clamp01((0.5 - saturation) / 0.3) * clamp01(warmth * 8) * mid,
        clamp01((saturation - 0.45) / 0.35) * clamp01(contrast * 4),
    ], 1)


def blend(f, p_model):
    """テクスチャ量に応じて学習モデルと旧ルールを混合する（vibeAnalyzer.ts と同じ式）。"""
    a = clamp01((f[:, 73] - GATE_LOW) / (GATE_HIGH - GATE_LOW))[:, None]
    return a * p_model + (1 - a) * legacy_scores(f)


def synthetic_images(n, rng):
    """単色・グラデーション・矩形・夜景風の平坦な合成画像。"""
    def color():
        # 一様乱数だけでは白・灰・黒付近がほとんど出ないため、3 割は無彩色に近い色にする
        if rng.random() < 0.3:
            return np.clip(rng.integers(0, 256) + rng.integers(-8, 9, 3), 0, 255)
        return rng.integers(0, 256, 3)

    out = []
    for _ in range(n):
        w, h = int(rng.integers(32, 97)), int(rng.integers(32, 97))
        kind = rng.integers(0, 5)
        c1, c2 = color(), color()
        if kind == 0:
            img = np.broadcast_to(c1, (h, w, 3)).copy()
        else:
            t = np.linspace(0, 1, h)[:, None, None]
            img = (c1 * (1 - t) + c2 * t).repeat(w, 1)
        if kind in (2, 3):
            if kind == 3:  # 暗い背景 + 鮮やかな光
                img = np.broadcast_to(rng.integers(0, 40, 3), (h, w, 3)).copy().astype(float)
            for _ in range(int(rng.integers(1, 6))):
                x0, y0 = int(rng.integers(0, w - 4)), int(rng.integers(0, h - 4))
                x1, y1 = x0 + int(rng.integers(3, w // 2 + 4)), y0 + int(rng.integers(2, h // 3 + 3))
                col = color() if kind == 2 else np.roll([255, int(rng.integers(0, 256)), 40], rng.integers(0, 3))
                img[y0:y1, x0:x1] = col
        if kind == 4:
            img = img + rng.integers(-12, 13, img.shape)
        out.append(np.clip(img, 0, 255).astype(np.uint8))
    return out


def average_precision(y, p):
    order = np.argsort(-p)
    y = y[order]
    if y.sum() == 0:
        return float('nan')
    hits = np.cumsum(y)
    return float((hits / np.arange(1, len(y) + 1))[y == 1].mean())


def evaluate(name, y, p):
    """AP（順位付けの質）、閾値 0.3 での F1、ラベル付き画像での Top-1 正解率、ラベルなし画像の棄却率。"""
    aps = [average_precision(y[:, k], p[:, k]) for k in range(len(VIBE_IDS))]
    f1s = []
    for k in range(len(VIBE_IDS)):
        pred = p[:, k] >= DOMINANT_THRESHOLD
        tp = (pred & (y[:, k] == 1)).sum()
        f1s.append(2 * tp / max(1, pred.sum() + y[:, k].sum()))
    labeled = y.sum(1) > 0
    top1 = (y[labeled, p[labeled].argmax(1)] == 1).mean()
    reject = (p[~labeled].max(1) < DOMINANT_THRESHOLD).mean()
    print(f'{name:>8}: mAP={np.nanmean(aps):.3f} macroF1@0.3={np.mean(f1s):.3f} top1={top1:.3f} '
          f'reject(no-label)={reject:.3f}')
    print('          AP ' + ' '.join(f'{v}={a:.2f}' for v, a in zip(VIBE_IDS, aps)))
    return dict(mAP=float(np.nanmean(aps)), macroF1=float(np.mean(f1s)), top1=float(top1), reject=float(reject),
                ap={v: round(a, 3) for v, a in zip(VIBE_IDS, aps)})


class MLP:
    def __init__(self, rng, d_in, d_hidden, d_out):
        self.p = {
            'w1': rng.normal(0, np.sqrt(2 / d_in), (d_in, d_hidden)), 'b1': np.zeros(d_hidden),
            'w2': rng.normal(0, np.sqrt(1 / d_hidden), (d_hidden, d_out)), 'b2': np.zeros(d_out),
        }
        self.m = {k: np.zeros_like(v) for k, v in self.p.items()}
        self.v = {k: np.zeros_like(v) for k, v in self.p.items()}
        self.t = 0

    def forward(self, x):
        h = np.maximum(0, x @ self.p['w1'] + self.p['b1'])
        return h, 1 / (1 + np.exp(-(h @ self.p['w2'] + self.p['b2'])))

    def step(self, x, y, w, lr, l2):
        h, out = self.forward(x)
        # 重み付き BCE の勾配（シグモイド出力）
        d2 = (out - y) * w[:, None] / w.sum()
        grads = {'w2': h.T @ d2 + l2 * self.p['w2'], 'b2': d2.sum(0)}
        d1 = (d2 @ self.p['w2'].T) * (h > 0)
        grads.update({'w1': x.T @ d1 + l2 * self.p['w1'], 'b1': d1.sum(0)})
        self.t += 1
        for k, g in grads.items():
            self.m[k] = 0.9 * self.m[k] + 0.1 * g
            self.v[k] = 0.999 * self.v[k] + 0.001 * g * g
            mh = self.m[k] / (1 - 0.9 ** self.t)
            vh = self.v[k] / (1 - 0.999 ** self.t)
            self.p[k] -= lr * mh / (np.sqrt(vh) + 1e-8)


def split_of(image_id):
    """ImageID のハッシュで train / val / test に固定分割する。"""
    u = int(hashlib.md5(image_id.encode()).hexdigest()[:8], 16) / 2 ** 32
    return 'test' if u < 0.15 else 'val' if u < 0.25 else 'train'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('work', type=Path)
    ap.add_argument('--write', action='store_true', help='学習済み重みを TS に書き出す')
    ap.add_argument('--synthetic', type=int, default=4000)
    ap.add_argument('--synthetic-weight', type=float, default=0.5)
    ap.add_argument('--epochs', type=int, default=300)
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--hidden', type=int, default=64)
    ap.add_argument('--l2', type=float, default=1e-3)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)

    cache = args.work / 'features.npz'
    d = np.load(args.work / 'dataset.npz')
    y, ids = d['targets'], d['ids']
    if cache.exists() and np.load(cache)['x'].shape[0] == len(y):
        x = np.load(cache)['x']
    else:
        pixels, shapes = d['pixels'], d['shapes']  # npz は参照のたびに展開されるため一度だけ読む
        offsets = np.concatenate([[0], np.cumsum(shapes.prod(1))])
        x = np.stack([extract(pixels[offsets[i]:offsets[i + 1]].reshape(*shapes[i], 3)) for i in range(len(shapes))])
        np.savez(cache, x=x)
    split = np.array([split_of(i) for i in ids])
    print('images', len(y), {s: int((split == s).sum()) for s in ('train', 'val', 'test')},
          'positives', dict(zip(VIBE_IDS, y.sum(0).astype(int))))

    syn = np.stack([extract(im) for im in synthetic_images(args.synthetic, rng)])
    syn_y = legacy_scores(syn)

    tr = split == 'train'
    x_tr = np.concatenate([x[tr], syn])
    y_tr = np.concatenate([y[tr], syn_y])
    w_tr = np.concatenate([np.ones(tr.sum()), np.full(len(syn), args.synthetic_weight)])
    mean, std = x_tr.mean(0), x_tr.std(0) + 1e-6
    norm = lambda a: (a - mean) / std  # noqa: E731

    model = MLP(rng, FEATURE_SIZE, args.hidden, len(VIBE_IDS))
    xn, xv, yv = norm(x_tr), norm(x[split == 'val']), y[split == 'val']
    best, best_p, patience = -1, None, 0
    for epoch in range(args.epochs):
        perm = rng.permutation(len(xn))
        lr = 2e-3 if epoch < 100 else 5e-4
        for i in range(0, len(perm), 256):
            idx = perm[i:i + 256]
            model.step(xn[idx], y_tr[idx], w_tr[idx], lr, args.l2)
        pv = model.forward(xv)[1]
        score = np.nanmean([average_precision(yv[:, k], pv[:, k]) for k in range(len(VIBE_IDS))])
        if score > best:
            best, best_p, patience = score, {k: v.copy() for k, v in model.p.items()}, 0
        else:
            patience += 1
            if patience >= 30:
                break
    model.p = best_p
    print(f'best val mAP {best:.3f} (epoch {epoch + 1 - patience})')

    te = split == 'test'
    print('--- 実写テスト分割での比較 ---')
    legacy = evaluate('legacy', y[te], legacy_scores(x[te]))
    evaluate('model', y[te], model.forward(norm(x[te]))[1])
    learned = evaluate('blend', y[te], blend(x[te], model.forward(norm(x[te]))[1]))
    syn_test = np.stack([extract(im) for im in synthetic_images(500, np.random.default_rng(99))])
    agree = (blend(syn_test, model.forward(norm(syn_test))[1]).argmax(1) == legacy_scores(syn_test).argmax(1)).mean()
    print(f'合成画像での旧ルールとの最上位一致率: {agree:.3f}')

    if args.write:
        r = lambda a: [float(f'{v:.5g}') for v in np.asarray(a).ravel()]  # noqa: E731
        meta = {'images': int(len(y)), 'trainImages': int(tr.sum()), 'testImages': int(te.sum()),
                'synthetic': args.synthetic, 'legacy': legacy, 'model': learned}
        body = [
            '// このファイルは scripts/vibe_model/train.py で自動生成している。手で編集しないこと。',
            '// 学習データ: Open Images Dataset（人手検証済みの画像レベルラベル）の写真。docs/SPEC.md §4.2 参照。',
            '',
            '/** 学習時の評価結果（実写テスト分割）。 */',
            f'export const MODEL_METRICS = {json.dumps(meta, ensure_ascii=False)} as const;',
            '',
            f'export const FEATURE_MEAN = {json.dumps(r(mean))};',
            f'export const FEATURE_STD = {json.dumps(r(std))};',
            f'/** 隠れ層の重み（{FEATURE_SIZE} × {args.hidden}、行優先）。 */',
            f'export const W1 = {json.dumps(r(model.p["w1"]))};',
            f'export const B1 = {json.dumps(r(model.p["b1"]))};',
            f'/** 出力層の重み（{args.hidden} × {len(VIBE_IDS)}、行優先）。出力順は VIBE_IDS と同じ。 */',
            f'export const W2 = {json.dumps(r(model.p["w2"]))};',
            f'export const B2 = {json.dumps(r(model.p["b2"]))};',
            f'export const HIDDEN_SIZE = {args.hidden};',
            f'/** 輝度勾配の平均がこの範囲で旧ルール → 学習モデルへ切り替える。 */',
            f'export const GATE_LOW = {GATE_LOW};',
            f'export const GATE_HIGH = {GATE_HIGH};',
        ]
        OUT_TS.write_text('\n'.join(body) + '\n', encoding='utf-8')
        print('wrote', OUT_TS)


if __name__ == '__main__':
    main()
