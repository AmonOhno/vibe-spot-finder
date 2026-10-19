import { VIBE_IDS, type AnalysisResult, type ColorFeatures, type VibeId, type VibeProfile } from './types';

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

/** 色特徴量を Vibe スコアに変換する。ルールは docs/SPEC.md §4.2 を参照。 */
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

export function pickDominant(profile: VibeProfile): VibeId[] {
  return VIBE_IDS.filter((id) => profile[id] >= DOMINANT_THRESHOLD)
    .sort((a, b) => profile[b] - profile[a])
    .slice(0, MAX_DOMINANT);
}

/** 複数フレームの特徴量を平均して 1 つの解析結果にまとめる。 */
export function analyzeFrames(frames: Uint8ClampedArray[]): AnalysisResult {
  if (frames.length === 0) throw new Error('解析対象のフレームがありません');
  const all = frames.map(computeFeatures);
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
  const profile = scoreVibes(features);
  return { profile, features, dominant: pickDominant(profile), frameCount: frames.length };
}
