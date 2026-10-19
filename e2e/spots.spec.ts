import { expect, test } from '@playwright/test';
import { analyze, chooseFile, dominantVibes, holdForRecording, spotItems } from './helpers';

test.describe('スポット提案', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });
  test.afterEach(async ({ page }) => holdForRecording(page));

  test('TC-13 提案スポットに一致度と Google マップリンクが表示される', async ({ page }) => {
    await chooseFile(page, 'ocean.png');
    await analyze(page);
    const items = spotItems(page);
    await expect(items).toHaveCount(6);

    const scores = await items.getByLabel('一致度').allTextContents();
    const values = scores.map((s) => Number(s.replace('%', '')));
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(20);

    for (const link of await items.getByRole('link', { name: 'Google マップで開く' }).all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=.+/);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    }

    // リンクのクエリにはスポット名が含まれる
    const name = await items.first().getByRole('heading', { level: 3 }).textContent();
    const href = await items.first().getByRole('link').getAttribute('href');
    expect(decodeURIComponent(new URL(href!).searchParams.get('query')!)).toContain(name!.split(' ')[0]);
  });

  test('TC-14 エリアで提案スポットを絞り込める', async ({ page }) => {
    await chooseFile(page, 'ocean.png');
    await analyze(page);
    await page.getByLabel('エリア').selectOption('関東');
    const items = spotItems(page);
    await expect(items).not.toHaveCount(0);
    for (const item of await items.all()) await expect(item).toContainText('（関東）');

    await page.getByLabel('エリア').selectOption('all');
    await expect(items).toHaveCount(6);
  });

  test('TC-15 該当スポットがないエリアではメッセージを表示する', async ({ page }) => {
    await chooseFile(page, 'night.png');
    await analyze(page);
    await page.getByLabel('エリア').selectOption('中国・四国');
    await expect(page.getByTestId('no-spots')).toBeVisible();
    await expect(spotItems(page)).toHaveCount(0);
  });

  test('TC-16 別のファイルを選ぶと前回の結果がリセットされる', async ({ page }) => {
    await chooseFile(page, 'ocean.png');
    await analyze(page);
    await page.getByLabel('エリア').selectOption('関東');

    await chooseFile(page, 'forest.jpg');
    await expect(page.getByTestId('vibe-result')).toHaveCount(0);
    await expect(page.getByTestId('spot-section')).toHaveCount(0);

    await analyze(page);
    await expect(dominantVibes(page).first()).toHaveText('森・緑');
    await expect(page.getByLabel('エリア')).toHaveValue('all');
  });
});
