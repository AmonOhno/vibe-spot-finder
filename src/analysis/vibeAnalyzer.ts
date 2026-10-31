import { extractModelFeatures, FEATURE_SIZE, toFrame, type Frame } from './modelFeatures';
import { VIBE_IDS, type AnalysisResult, type ColorFeatures, type VibeId, type VibeProfile } from './types';
import { B1, B2, FEATURE_MEAN, FEATURE_STD, GATE_HIGH, GATE_LOW, HIDDEN_SIZE, W1, W2 } from './vibeModelWeights';

/** dominant に含める最低スコア。これ未満しかなければ「判定不可」とする。 */
export const DOMINANT_THRESHOLD = 0.3;
const MAX_DOMINANT = 3;
const PALETTE_SIZE = 5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

const toHex = (n: number) => n.toString(16).padStart(2, '0');

/**
 * RGBA ピクセル列から色特徴量を計算する。
 * Canvas の ImageData.data をそのまま渡せる。DOM に依存しないためユニットテスト可能。
 */
export function computeFeatures(data: Uint8ClampedArray): ColorFeatures {
  const n = data.length / 4;
  if (n === 0) throw new Error('画像データが空です');

  let sumL = 0;
  let sumL2 = 0;
  let sumS = 0;
  let sumWarmth = 0;
  let blue = 0;
  let green = 0;
  let warm = 0;
  let dark = 0;
  let neon = 0;
  let white = 0;
  const bins = new Map<number, number>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const [h, s, v] = rgbToHsv(r, g, b);
    const l = 0.299 * r + 0.587 * g + 0.114 * b;

    sumL += l;
    sumL2 += l * l;
    sumS += s;
    sumWarmth += r - b;

    if (v < 0.2) dark++;
    else if (v > 0.85 && s < 0.12) white++;
    if (v > 0.7 && s > 0.6) neon++;
    if (s > 0.25 && v > 0.2) {
      if (h >= 180 && h <= 250) blue++;
      else if (h >= 70 && h < 170) green++;
      else if ((h < 50 || h > 330) && s > 0.45 && v > 0.25) warm++;
    }

    // 各チャンネル上位 3bit で量子化して代表色を数える
    const key = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }

  const brightness = sumL / n;
  const palette = [...bins.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PALETTE_SIZE)
    .map(([key]) => {
      const c = (q: number) => (q << 5) + 16;
      return `#${toHex(c(key >> 6))}${toHex(c((key >> 3) & 7))}${toHex(c(key & 7))}`;
    });

  return {
    brightness,
    saturation: sumS / n,
    contrast: Math.sqrt(Math.max(0, sumL2 / n - brightness * brightness)),
    warmth: sumWarmth / n,
    blueRatio: blue / n,
    greenRatio: green / n,
    warmRatio: warm / n,
    darkRatio: dark / n,
    neonRatio: neon / n,
    whiteRatio: white / n,
    palette,
  };
}

/**
 * 色特徴量をルールで Vibe スコアに変換する（v0.1 の方式）。ルールは docs/SPEC.md §4.2 を参照。
 * 学習モデルの分布外となる平坦な画像（単色・グラデーション等）の判定に使う。
 */
export function scoreVibes(f: ColorFeatures): VibeProfile {
  const midBrightness = f.brightness >= 0.25 && f.brightness <= 0.8 ? 1 : 0.3;
  return {
    ocean: clamp01(f.blueRatio * 1.6) * (f.brightness > 0.25 ? 1 : 0.4),
    forest: clamp01(f.greenRatio * 1.6),
    sunset: clamp01(f.warmRatio * 1.4) * midBrightness,
    night: clamp01(f.darkRatio * 1.2) * (0.6 + 0.4 * clamp01(f.neonRatio * 5)),
    snow: clamp01(f.whiteRatio * 1.5),
    retro: clamp01((0.5 - f.saturation) / 0.3) * clamp01(f.warmth * 8) * midBrightness,
    vivid: clamp01((f.saturation - 0.45) / 0.35) * clamp01(f.contrast * 4),
  };
}

/** 特徴ベクトル中の輝度勾配平均の位置（modelFeatures.ts のテクスチャ特徴の先頭）。 */
const GRADIENT_INDEX = 73;

/**
 * 特徴ベクトルを学習済みモデル（84 → 64 → 7 の MLP）で Vibe スコアに変換する。
 * 出力は各 Vibe が写っている確率（0〜1）。学習方法は docs/SPEC.md §4.2 を参照。
 */
export function predictVibes(features: ArrayLike<number>): VibeProfile {
  if (features.length !== FEATURE_SIZE) throw new Error('特徴ベクトルの次元が不正です');
  const hidden = new Float64Array(HIDDEN_SIZE);
  for (let i = 0; i < FEATURE_SIZE; i++) {
    const x = (features[i] - FEATURE_MEAN[i]) / FEATURE_STD[i];
    if (x === 0) continue;
    for (let j = 0; j < HIDDEN_SIZE; j++) hidden[j] += x * W1[i * HIDDEN_SIZE + j];
  }
  const profile = {} as VibeProfile;
  VIBE_IDS.forEach((id, k) => {
    let z = B2[k];
    for (let j = 0; j < HIDDEN_SIZE; j++) z += Math.max(0, hidden[j] + B1[j]) * W2[j * VIBE_IDS.length + k];
    profile[id] = 1 / (1 + Math.exp(-z));
  });
  return profile;
}

export function pickDominant(profile: VibeProfile): VibeId[] {
  return VIBE_IDS.filter((id) => profile[id] >= DOMINANT_THRESHOLD)
    .sort((a, b) => profile[b] - profile[a])
    .slice(0, MAX_DOMINANT);
}

/** 複数フレームの特徴量を平均して 1 つの解析結果にまとめる。 */
export function analyzeFrames(frames: (Frame | Uint8ClampedArray)[]): AnalysisResult {
  if (frames.length === 0) throw new Error('解析対象のフレームがありません');
  const all = frames.map((f) => computeFeatures(toFrame(f).data));
  const avg = (k: Exclude<keyof ColorFeatures, 'palette'>) => all.reduce((s, f) => s + f[k], 0) / all.length;

  const features: ColorFeatures = {
    brightness: avg('brightness'),
    saturation: avg('saturation'),
    contrast: avg('contrast'),
    warmth: avg('warmth'),
    blueRatio: avg('blueRatio'),
    greenRatio: avg('greenRatio'),
    warmRatio: avg('warmRatio'),
    darkRatio: avg('darkRatio'),
    neonRatio: avg('neonRatio'),
    whiteRatio: avg('whiteRatio'),
    // 代表色は各フレームの最頻色を順に集め、重複を除いて上位を使う
    palette: [...new Set(all.flatMap((f) => f.palette))].slice(0, PALETTE_SIZE),
  };
  // モデル入力も各フレームの特徴ベクトルを平均する
  const vector = new Float64Array(FEATURE_SIZE);
  for (const f of frames) extractModelFeatures(f).forEach((v, i) => (vector[i] += v / frames.length));
  // 実写で学習したモデルを使い、テクスチャのほとんどない平坦な画像ほどルールの比重を上げる
  const model = predictVibes(vector);
  const rules = scoreVibes(features);
  const alpha = clamp01((vector[GRADIENT_INDEX] - GATE_LOW) / (GATE_HIGH - GATE_LOW));
  const profile = {} as VibeProfile;
  for (const id of VIBE_IDS) profile[id] = alpha * model[id] + (1 - alpha) * rules[id];
  return { profile, features, dominant: pickDominant(profile), frameCount: frames.length };
}
