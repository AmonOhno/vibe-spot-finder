/**
 * 学習済みモデル用の特徴量抽出。scripts/vibe_model/features.py と完全に同じ定義を保つこと
 * （一致は modelFeatures.test.ts のフィクスチャで検証している）。
 */

export const FEATURE_SIZE = 84;

/** 解析対象の 1 フレーム。幅が不明な生配列は正方形に近い形とみなす。 */
export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function toFrame(frame: Frame | Uint8ClampedArray): Frame {
  if (!(frame instanceof Uint8ClampedArray)) return frame;
  const n = frame.length / 4;
  const width = Math.max(1, Math.round(Math.sqrt(n)));
  return { data: frame, width, height: Math.max(1, Math.floor(n / width)) };
}

const digitize = (x: number, edges: number[]) => {
  let i = 0;
  while (i < edges.length && x >= edges[i]) i++;
  return i;
};

/** RGBA 画素から FEATURE_SIZE 次元の特徴ベクトルを計算する。 */
export function extractModelFeatures(input: Frame | Uint8ClampedArray): Float64Array {
  const { data, width: W, height: H } = toFrame(input);
  const n = W * H;
  if (n === 0 || data.length < n * 4) throw new Error('画像データが空です');

  const lum = new Float64Array(n);
  const hist = new Float64Array(29);
  const reg = [new Float64Array(9), new Float64Array(9), new Float64Array(9)];
  const sat = new Float64Array(4);
  const lh = new Float64Array(6);
  let sumL = 0, sumL2 = 0, sumS = 0, sumS2 = 0, sumRB = 0, sumG = 0;
  let sumRG = 0, sumRG2 = 0, sumYB = 0, sumYB2 = 0;
  let blue = 0, green = 0, warm = 0, dark = 0, neon = 0, white = 0;

  for (let y = 0; y < H; y++) {
    const region = Math.min(2, Math.floor((3 * y) / H));
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const r = data[p * 4] / 255;
      const g = data[p * 4 + 1] / 255;
      const b = data[p * 4 + 2] / 255;
      const mx = Math.max(r, g, b);
      const d = mx - Math.min(r, g, b);
      let h = 0;
      if (d !== 0) {
        if (mx === r) {
          // 常に 6 を足すと丸め誤差で色相ビンの境界がずれるため、負のときだけ補正する（numpy の mod と一致）
          h = (g - b) / d;
          if (h < 0) h += 6;
        }
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      const s = mx === 0 ? 0 : d / mx;
      const v = mx;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[p] = l;

      const chroma = s >= 0.2 && v >= 0.2;
      const isDark = v < 0.2;
      let coarse: number;
      if (chroma) {
        hist[(Math.floor(h / 30) % 12) * 2 + (v >= 0.6 ? 1 : 0)]++;
        coarse = Math.floor(h / 60) % 6;
      } else if (!isDark) {
        hist[24 + digitize(v, [0.45, 0.7, 0.88])]++;
        coarse = v >= 0.7 ? 6 : 7;
      } else {
        hist[28]++;
        coarse = 8;
      }
      reg[region][coarse]++;
      if (!isDark) sat[digitize(s, [0.15, 0.35, 0.6])]++;
      lh[Math.min(5, Math.floor(l * 6))]++;

      sumL += l;
      sumL2 += l * l;
      sumS += s;
      sumS2 += s * s;
      sumRB += r - b;
      sumG += g - (r + b) / 2;
      const rg = r - g;
      const yb = 0.5 * (r + g) - b;
      sumRG += rg;
      sumRG2 += rg * rg;
      sumYB += yb;
      sumYB2 += yb * yb;

      if (s > 0.25 && v > 0.2) {
        if (h >= 180 && h <= 250) blue++;
        else if (h >= 70 && h < 170) green++;
      }
      if (s > 0.45 && v > 0.25 && (h < 50 || h > 330)) warm++;
      if (isDark) dark++;
      if (v > 0.7 && s > 0.6) neon++;
      if (v > 0.85 && s < 0.12) white++;
    }
  }

  const mean = (sum: number) => sum / n;
  const std = (sum: number, sum2: number) => Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2));
  const colorfulness =
    Math.sqrt(std(sumRG, sumRG2) ** 2 + std(sumYB, sumYB2) ** 2) + 0.3 * Math.sqrt(mean(sumRG) ** 2 + mean(sumYB) ** 2);

  // 輝度勾配（右・下の隣接画素との差の和）
  const grad = [0, 0, 0, 0, 0];
  if (W >= 2 && H >= 2) {
    const half = Math.floor((H - 1) / 2);
    let all = 0, over1 = 0, over2 = 0, top = 0, topN = 0, bottom = 0, bottomN = 0;
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W - 1; x++) {
        const p = y * W + x;
        const gm = Math.abs(lum[p + 1] - lum[p]) + Math.abs(lum[p + W] - lum[p]);
        all += gm;
        if (gm > 0.08) over1++;
        if (gm > 0.25) over2++;
        if (y < half || half === 0) {
          top += gm;
          topN++;
        }
        if (y >= half) {
          bottom += gm;
          bottomN++;
        }
      }
    }
    const m = (W - 1) * (H - 1);
    grad.splice(0, 5, all / m, over1 / m, over2 / m, top / topN, bottom / bottomN);
  }

  const out = new Float64Array(FEATURE_SIZE);
  let i = 0;
  for (const v of hist) out[i++] = v / n;
  for (const r of reg) {
    const total = r.reduce((a, b) => a + b, 0) || 1;
    for (const v of r) out[i++] = v / total;
  }
  for (const v of sat) out[i++] = v / n;
  for (const v of lh) out[i++] = v / n;
  for (const v of [mean(sumL), std(sumL, sumL2), mean(sumS), std(sumS, sumS2), mean(sumRB), mean(sumG), colorfulness]) {
    out[i++] = v;
  }
  for (const v of grad) out[i++] = v;
  for (const v of [blue, green, warm, dark, neon, white]) out[i++] = v / n;
  return out;
}
