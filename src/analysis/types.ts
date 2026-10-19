/** 雰囲気（Vibe）の識別子。仕様書 docs/SPEC.md §4.2 と一致させること。 */
export const VIBE_IDS = ['ocean', 'forest', 'sunset', 'night', 'snow', 'retro', 'vivid'] as const;
export type VibeId = (typeof VIBE_IDS)[number];

/** 各 Vibe のスコア（0〜1）。 */
export type VibeProfile = Record<VibeId, number>;

export const VIBE_LABELS: Record<VibeId, string> = {
  ocean: '海・水辺',
  forest: '森・緑',
  sunset: '夕焼け・ノスタルジック',
  night: '夜景・ネオン',
  snow: '雪・ミニマル',
  retro: 'レトロ・落ち着き',
  vivid: 'ビビッド・ポップ',
};

/** 画像 1 枚（動画なら 1 フレーム）から抽出した色特徴量。比率はすべて 0〜1。 */
export interface ColorFeatures {
  brightness: number;
  saturation: number;
  contrast: number;
  /** 暖色寄りなら正、寒色寄りなら負（-1〜1）。 */
  warmth: number;
  blueRatio: number;
  greenRatio: number;
  warmRatio: number;
  darkRatio: number;
  neonRatio: number;
  whiteRatio: number;
  /** 出現頻度の高い代表色（#rrggbb）。 */
  palette: string[];
}

export interface AnalysisResult {
  profile: VibeProfile;
  features: ColorFeatures;
  /** スコア上位かつ閾値以上の Vibe（降順）。空なら「雰囲気を判定できない」。 */
  dominant: VibeId[];
  /** 解析に使ったフレーム数（画像は 1）。 */
  frameCount: number;
}
