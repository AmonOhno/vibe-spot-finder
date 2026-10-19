import { expect, test } from '@playwright/test';
import { analyze, chooseFile, holdForRecording } from './helpers';

test.describe('非機能要件', () => {
  test.afterEach(async ({ page }) => holdForRecording(page));

  test('TC-17 解析中に外部へのネットワーク通信が発生しない', async ({ page, baseURL }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== new URL(baseURL!).origin) external.push(req.url());
    });
    await page.goto('/');
    await chooseFile(page, 'ocean.webm');
    await analyze(page);
    await expect(page.getByTestId('spot-section')).toBeVisible();
    expect(external).toEqual([]);
  });

  test('TC-18 モバイル幅でも横スクロールせずに結果を表示できる', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await chooseFile(page, 'sunset.webp');
    await analyze(page);
    await page.getByTestId('spot-section').scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
