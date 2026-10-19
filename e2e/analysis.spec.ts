import { expect, test } from '@playwright/test';
import { analyze, chooseFile, dominantVibes, holdForRecording, spotItems } from './helpers';

test.describe('雰囲気解析', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });
  test.afterEach(async ({ page }) => holdForRecording(page));

  test('TC-07 海の画像は「海・水辺」と判定され、海のスポットが提案される', async ({ page }) => {
    await chooseFile(page, 'ocean.png');
    await analyze(page);
    await expect(dominantVibes(page).first()).toHaveText('海・水辺');
    await expect(page.getByTestId('frame-count')).toHaveText('解析フレーム数: 1');
    await expect(page.getByTestId('palette').locator('.swatch')).not.toHaveCount(0);
    await expect(spotItems(page).first()).toContainText('一致した雰囲気: 海・水辺');
  });

  test('TC-08 森の画像（JPEG）は「森・緑」と判定される', async ({ page }) => {
    await chooseFile(page, 'forest.jpg');
    await analyze(page);
    await expect(dominantVibes(page).first()).toHaveText('森・緑');
    await expect(spotItems(page).first()).toContainText('森・緑');
  });

  test('TC-09 夜景の画像は「夜景・ネオン」と判定される', async ({ page }) => {
    await chooseFile(page, 'night.png');
    await analyze(page);
    await expect(dominantVibes(page).first()).toHaveText('夜景・ネオン');
    await expect(spotItems(page).first()).toContainText('夜景・ネオン');
  });

  test('TC-10 夕焼けの画像（WebP）は「夕焼け・ノスタルジック」と判定される', async ({ page }) => {
    await chooseFile(page, 'sunset.webp');
    await analyze(page);
    await expect(dominantVibes(page).first()).toHaveText('夕焼け・ノスタルジック');
    await expect(spotItems(page).first()).toContainText('夕焼け・ノスタルジック');
  });

  test('TC-11 動画は 5 フレームを抽出して解析される', async ({ page }) => {
    await chooseFile(page, 'ocean.webm');
    await analyze(page);
    await expect(page.getByTestId('frame-count')).toHaveText('解析フレーム数: 5');
    await expect(page.getByRole('img', { name: /^解析フレーム \d$/ })).toHaveCount(5);
    await expect(dominantVibes(page).first()).toHaveText('海・水辺');
    await expect(page.getByTestId('spot-section')).toBeVisible();
  });

  test('TC-12 雰囲気を判定できない画像ではスポットを提案しない', async ({ page }) => {
    await chooseFile(page, 'gray.png');
    await analyze(page);
    await expect(page.getByTestId('no-vibe')).toBeVisible();
    await expect(page.getByTestId('dominant-vibes')).toHaveCount(0);
    await expect(page.getByTestId('spot-section')).toHaveCount(0);
  });
});
