import { describe, expect, it } from 'vitest';
import { VIBE_IDS } from '../analysis/types';
import { KANTO_SPOTS } from './kantoSpots';
import { googleMapsUrl, REGIONS, SPOTS } from './spots';

// docs/SPEC.md §4.4 のデータ要件
describe('SPOTS データ要件', () => {
  it('id が一意', () => {
    expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length);
  });
  it.each(VIBE_IDS)('Vibe「%s」の重み 0.8 以上のスポットが 2 件以上ある', (id) => {
    expect(SPOTS.filter((s) => (s.vibes[id] ?? 0) >= 0.8).length).toBeGreaterThanOrEqual(2);
  });
  it.each(REGIONS)('エリア「%s」に 1 件以上ある', (region) => {
    expect(SPOTS.some((s) => s.region === region)).toBe(true);
  });
  it('重みはすべて 0〜1', () => {
    for (const w of SPOTS.flatMap((s) => Object.values(s.vibes))) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
  it('mapQuery があればそれを、なければ「名称 都道府県」を使う', () => {
    expect(googleMapsUrl({ ...SPOTS[0], mapQuery: undefined })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${SPOTS[0].name} ${SPOTS[0].prefecture}`)}`,
    );
    expect(googleMapsUrl({ ...SPOTS[0], mapQuery: 'x y' })).toBe('https://www.google.com/maps/search/?api=1&query=x%20y');
  });
});

describe('関東スポット（kantoSpots.ts）', () => {
  const KANTO = ['東京都', '神奈川県', '埼玉県', '千葉県', '茨城県', '栃木県', '群馬県'];
  it('2000 件あり、SPOTS に含まれる', () => {
    expect(KANTO_SPOTS).toHaveLength(2000);
    expect(SPOTS.filter((s) => s.region === '関東').length).toBeGreaterThanOrEqual(2000);
  });
  it('すべて関東 1 都 6 県のスポットで、名称・説明・雰囲気を持つ', () => {
    for (const s of KANTO_SPOTS) {
      expect(s.region).toBe('関東');
      expect(KANTO).toContain(s.prefecture);
      expect(s.name.length).toBeGreaterThan(1);
      expect(s.description.length).toBeGreaterThan(0);
      expect(Math.max(...Object.values(s.vibes))).toBeGreaterThan(0);
    }
  });
  it.each(KANTO)('%s に 100 件以上ある', (pref) => {
    expect(KANTO_SPOTS.filter((s) => s.prefecture === pref).length).toBeGreaterThanOrEqual(100);
  });
});
