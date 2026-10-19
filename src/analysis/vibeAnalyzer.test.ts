import { describe, expect, it } from 'vitest';
import { analyzeFrames, computeFeatures, pickDominant } from './vibeAnalyzer';
import { matchSpots } from './matcher';
import { validateFile } from './media';
import { SPOTS } from '../data/spots';

/** 単色 RGBA ピクセル列を作る。 */
function solid(r: number, g: number, b: number, count = 100) {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
  return data;
}

describe('computeFeatures / analyzeFrames', () => {
  it('青一色は「海・水辺」が最上位になる', () => {
    expect(analyzeFrames([solid(30, 110, 210)]).dominant[0]).toBe('ocean');
  });
  it('緑一色は「森・緑」が最上位になる', () => {
    expect(analyzeFrames([solid(40, 120, 50)]).dominant[0]).toBe('forest');
  });
  it('暗い画像は「夜景・ネオン」が含まれる', () => {
    expect(analyzeFrames([solid(10, 10, 25)]).dominant).toContain('night');
  });
  it('白一色は「雪・ミニマル」が最上位になる', () => {
    expect(analyzeFrames([solid(245, 245, 248)]).dominant[0]).toBe('snow');
  });
  it('中間グレーは雰囲気を判定できない', () => {
    expect(analyzeFrames([solid(128, 128, 128)]).dominant).toEqual([]);
  });
  it('複数フレームは特徴量が平均される', () => {
    const r = analyzeFrames([solid(0, 0, 0), solid(255, 255, 255)]);
    expect(r.frameCount).toBe(2);
    expect(r.features.brightness).toBeCloseTo(0.5, 2);
  });
  it('空データはエラー', () => {
    expect(() => computeFeatures(new Uint8ClampedArray())).toThrow();
    expect(() => analyzeFrames([])).toThrow();
  });
  it('dominant は最大 3 件', () => {
    expect(pickDominant({ ocean: 1, forest: 1, sunset: 1, night: 1, snow: 0, retro: 0, vivid: 0 })).toHaveLength(3);
  });
});

describe('matchSpots', () => {
  const ocean = { ocean: 1, forest: 0, sunset: 0, night: 0, snow: 0, retro: 0, vivid: 0 };
  it('海プロファイルでは海のスポットが上位に来る', () => {
    const top = matchSpots(ocean, SPOTS)[0];
    expect(top.spot.vibes.ocean).toBeGreaterThanOrEqual(0.9);
    expect(top.reasons[0]).toBe('ocean');
    expect(top.mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  });
  it('エリアで絞り込める', () => {
    const r = matchSpots(ocean, SPOTS, { region: '関東' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.spot.region === '関東')).toBe(true);
  });
  it('件数上限は既定 6 件', () => {
    expect(matchSpots({ ...ocean, forest: 1, retro: 1 }, SPOTS)).toHaveLength(6);
  });
  it('ゼロベクトルは空配列', () => {
    expect(matchSpots({ ...ocean, ocean: 0 }, SPOTS)).toEqual([]);
  });
});

describe('validateFile', () => {
  it.each([
    [{ type: 'image/png', size: 1 }, true],
    [{ type: 'video/webm', size: 1 }, true],
    [{ type: 'text/plain', size: 1 }, false],
    [{ type: 'image/png', size: 20 * 1024 * 1024 + 1 }, false],
    [{ type: 'video/mp4', size: 200 * 1024 * 1024 + 1 }, false],
  ])('%o → ok=%s', (file, ok) => {
    expect(validateFile(file).ok).toBe(ok);
  });
});

describe('retro', () => {
  it('低彩度の暖色（セピア調）は「レトロ・落ち着き」になる', () => {
    expect(analyzeFrames([solid(170, 140, 110)]).dominant[0]).toBe('retro');
  });
});
