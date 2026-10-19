import { googleMapsUrl, type Region, type Spot } from '../data/spots';
import { VIBE_IDS, type VibeId, type VibeProfile } from './types';

export const DEFAULT_LIMIT = 6;
/** これ未満の一致度のスポットは提案しない。 */
export const MIN_SCORE = 0.2;

export interface SpotMatch {
  spot: Spot;
  /** コサイン類似度（0〜1）。 */
  score: number;
  /** 一致に最も寄与した Vibe（最大 2 件）。 */
  reasons: VibeId[];
  mapsUrl: string;
}

export interface MatchOptions {
  region?: Region | 'all';
  limit?: number;
}

/** 解析プロファイルとスポットの雰囲気ベクトルのコサイン類似度で上位スポットを返す。 */
export function matchSpots(profile: VibeProfile, spots: Spot[], options: MatchOptions = {}): SpotMatch[] {
  const { region = 'all', limit = DEFAULT_LIMIT } = options;
  const norm = (get: (id: VibeId) => number) => Math.sqrt(VIBE_IDS.reduce((s, id) => s + get(id) ** 2, 0));
  const pNorm = norm((id) => profile[id]);
  if (pNorm === 0) return [];

  return spots
    .filter((spot) => region === 'all' || spot.region === region)
    .map((spot) => {
      const w = (id: VibeId) => spot.vibes[id] ?? 0;
      const contributions = VIBE_IDS.map((id) => [id, profile[id] * w(id)] as const);
      const dot = contributions.reduce((s, [, c]) => s + c, 0);
      const sNorm = norm(w);
      const reasons = contributions
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([id]) => id);
      return { spot, score: sNorm === 0 ? 0 : dot / (pNorm * sNorm), reasons, mapsUrl: googleMapsUrl(spot) };
    })
    .filter((m) => m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.spot.id.localeCompare(b.spot.id))
    .slice(0, limit);
}
