import { describe, expect, it } from 'vitest';
import cases from './__fixtures__/featureParity.json';
import { extractModelFeatures, FEATURE_SIZE } from './modelFeatures';
import { VIBE_IDS } from './types';
import { analyzeFrames } from './vibeAnalyzer';

function toFrame(c: (typeof cases)[number]) {
  const data = new Uint8ClampedArray(c.width * c.height * 4);
  for (let p = 0; p < c.width * c.height; p++) data.set([...c.rgb.slice(p * 3, p * 3 + 3), 255], p * 4);
  return { data, width: c.width, height: c.height };
}

// 学習側（scripts/vibe_model/ の Python 実装）と同じ値になること
describe('extractModelFeatures', () => {
  it.each(cases.map((c, i) => [i, c] as const))('Python 実装と一致する（ケース %i）', (_, c) => {
    const f = extractModelFeatures(toFrame(c));
    expect(f).toHaveLength(FEATURE_SIZE);
    f.forEach((v, i) => expect(v).toBeCloseTo(c.features[i], 9));
  });
  it('空データはエラー', () => {
    expect(() => extractModelFeatures(new Uint8ClampedArray())).toThrow();
  });
});

describe('analyzeFrames（学習モデル + ルールの混合）', () => {
  it.each(cases.map((c, i) => [i, c] as const))('Python 実装と同じスコアになる（ケース %i）', (_, c) => {
    const { profile } = analyzeFrames([toFrame(c)]);
    VIBE_IDS.forEach((id, k) => expect(profile[id]).toBeCloseTo(c.profile[k], 4));
  });
});
