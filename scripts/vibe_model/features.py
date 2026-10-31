"""学習用の特徴量抽出。src/analysis/modelFeatures.ts と完全に同じ定義を保つこと。

入力は (H, W, 3) の uint8 RGB 配列（アプリでは長辺 96px に縮小した Canvas の画素）。
出力は FEATURE_SIZE 次元のベクトル。値はいずれも画素比率・平均などで、フレーム平均が意味を持つ。
"""
import numpy as np

FEATURE_SIZE = 84


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    safe = np.where(d == 0, 1, d)
    h = np.where(mx == r, np.mod((g - b) / safe, 6), np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4))
    h = np.where(d == 0, 0, h * 60)
    h = np.where(h < 0, h + 360, h)
    s = np.where(mx == 0, 0, d / np.where(mx == 0, 1, mx))
    return h, s, mx


def extract(img: np.ndarray) -> np.ndarray:
    rgb = img.astype(np.float64) / 255
    H, W = rgb.shape[:2]
    n = H * W
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h, s, v = rgb_to_hsv(rgb)
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    chroma = (s >= 0.2) & (v >= 0.2)
    achrom = (s < 0.2) & (v >= 0.2)
    dark = v < 0.2
    hue12 = np.floor(h / 30).astype(int) % 12

    # 1. 色ヒストグラム（有彩色 12 色相 × 明暗 2 + 無彩色 4 段階 + 暗部）: 29
    hist = np.zeros(29)
    np.add.at(hist, (hue12 * 2 + (v >= 0.6))[chroma], 1)
    av = np.digitize(v, [0.45, 0.7, 0.88])
    np.add.at(hist, 24 + av[achrom], 1)
    hist[28] = dark.sum()
    hist /= n

    # 2. 上・中・下の 3 領域ごとの粗い色ヒストグラム（6 色相 + 明るい無彩色 + 暗い無彩色 + 暗部）: 27
    coarse = np.where(chroma, np.floor(h / 60).astype(int) % 6,
                      np.where(achrom, np.where(v >= 0.7, 6, 7), 8))
    region = np.minimum(2, (3 * np.arange(H) // H))[:, None].repeat(W, 1)
    reg = np.zeros((3, 9))
    np.add.at(reg, (region, coarse), 1)
    reg /= np.maximum(1, reg.sum(1, keepdims=True))

    # 3. 彩度ヒストグラム（暗部を除く）: 4
    sat = np.zeros(4)
    np.add.at(sat, np.digitize(s, [0.15, 0.35, 0.6])[~dark], 1)
    sat /= n

    # 4. 輝度ヒストグラム: 6
    lh = np.zeros(6)
    np.add.at(lh, np.minimum(5, np.floor(lum * 6).astype(int)), 1)
    lh /= n

    # 5. 統計量: 7
    rg = r - g
    yb = 0.5 * (r + g) - b
    colorfulness = np.sqrt(rg.var() + yb.var()) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)
    stats = [lum.mean(), lum.std(), s.mean(), s.std(), (r - b).mean(), (g - (r + b) / 2).mean(), colorfulness]

    # 6. テクスチャ（輝度勾配）: 5
    if H >= 2 and W >= 2:
        gm = np.abs(lum[:-1, 1:] - lum[:-1, :-1]) + np.abs(lum[1:, :-1] - lum[:-1, :-1])
        top = gm[: (H - 1) // 2] if (H - 1) // 2 > 0 else gm
        bottom = gm[(H - 1) // 2:]
        grad = [gm.mean(), (gm > 0.08).mean(), (gm > 0.25).mean(), top.mean(), bottom.mean()]
    else:
        grad = [0.0] * 5

    # 7. 既存ルールの比率特徴: 6
    blue = ((s > 0.25) & (v > 0.2) & (h >= 180) & (h <= 250)).mean()
    green = ((s > 0.25) & (v > 0.2) & (h >= 70) & (h < 170)).mean()
    warm = ((s > 0.45) & (v > 0.25) & ((h < 50) | (h > 330))).mean()
    neon = ((v > 0.7) & (s > 0.6)).mean()
    white = ((v >= 0.2) & (v > 0.85) & (s < 0.12)).mean()
    ratios = [blue, green, warm, dark.mean(), neon, white]

    out = np.concatenate([hist, reg.ravel(), sat, lh, stats, grad, ratios])
    assert out.shape == (FEATURE_SIZE,)
    return out
