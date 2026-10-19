import { expect, test } from '@playwright/test';
import { chooseFile, dropFile, holdForRecording } from './helpers';

test.describe('ファイル入力', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });
  test.afterEach(async ({ page }) => holdForRecording(page));

  test('TC-01 初期表示でアップロードエリアのみが表示される', async ({ page }) => {
    await expect(page).toHaveTitle('Vibe Spot Finder');
    await expect(page.getByRole('heading', { level: 1, name: 'Vibe Spot Finder' })).toBeVisible();
    await expect(page.getByTestId('dropzone')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ファイルを選択' })).toBeEnabled();
    await expect(page.getByText('サーバーには送信されません')).toBeVisible();
    await expect(page.getByTestId('preview')).toHaveCount(0);
    await expect(page.getByTestId('vibe-result')).toHaveCount(0);
    await expect(page.getByTestId('spot-section')).toHaveCount(0);
  });

  test('TC-02 ファイル選択で画像のプレビューが表示される', async ({ page }) => {
    await chooseFile(page, 'ocean.png');
    const preview = page.getByTestId('preview');
    await expect(preview.getByRole('img', { name: '選択した画像のプレビュー' })).toBeVisible();
    await expect(preview.getByText('画像', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '雰囲気を解析する' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'クリア' })).toBeEnabled();
  });

  test('TC-03 ドラッグ＆ドロップで動画を選択できる', async ({ page }) => {
    await dropFile(page, { name: 'ocean.webm', type: 'video/webm' });
    const preview = page.getByTestId('preview');
    await expect(page.getByTestId('file-name')).toHaveText('ocean.webm');
    await expect(preview.locator('video')).toBeVisible();
    await expect(preview.getByText('動画', { exact: true })).toBeVisible();
  });

  test('TC-04 非対応形式のファイルはエラーになる', async ({ page }) => {
    await chooseFile(page, 'not-media.txt', { expectAccepted: false });
    await expect(page.getByRole('alert')).toHaveText(/対応していないファイル形式です/);
    await expect(page.getByTestId('preview')).toHaveCount(0);
  });

  test('TC-05 サイズ上限を超える画像はエラーになる', async ({ page }) => {
    await dropFile(page, { name: 'huge.png', type: 'image/png', bytes: 20 * 1024 * 1024 + 1 });
    await expect(page.getByRole('alert')).toHaveText('画像ファイルは 20MB 以下にしてください');
    await expect(page.getByTestId('preview')).toHaveCount(0);
  });

  test('TC-06 クリアで初期状態に戻る', async ({ page }) => {
    await chooseFile(page, 'ocean.png');
    await page.getByRole('button', { name: '雰囲気を解析する' }).click();
    await expect(page.getByTestId('spot-section')).toBeVisible();
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByTestId('preview')).toHaveCount(0);
    await expect(page.getByTestId('vibe-result')).toHaveCount(0);
    await expect(page.getByTestId('spot-section')).toHaveCount(0);
  });
});
