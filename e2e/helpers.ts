import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
export const fixture = (name: string) => path.join(here, 'fixtures', name);

/** 「ファイルを選択」ボタンからファイルダイアログ経由でファイルを選ぶ（実ユーザー操作に近い形で録画される）。 */
export async function chooseFile(page: Page, name: string, { expectAccepted = true } = {}) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'ファイルを選択' }).click();
  await (await chooser).setFiles(fixture(name));
  if (expectAccepted) await expect(page.getByTestId('file-name')).toHaveText(name);
}

/** ドロップゾーンにファイルをドラッグ＆ドロップする。`bytes` を渡すとその内容の File を生成する。 */
export async function dropFile(page: Page, file: { name: string; type: string; bytes?: number }) {
  const base64 = file.bytes === undefined ? fs.readFileSync(fixture(file.name)).toString('base64') : null;
  const dataTransfer = await page.evaluateHandle(
    ({ name, type, base64, bytes }) => {
      const content = base64 ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) : new Uint8Array(bytes ?? 0);
      const dt = new DataTransfer();
      dt.items.add(new File([content], name, { type }));
      return dt;
    },
    { name: file.name, type: file.type, base64, bytes: file.bytes },
  );
  const zone = page.getByTestId('dropzone');
  await zone.dispatchEvent('dragover', { dataTransfer });
  await zone.dispatchEvent('drop', { dataTransfer });
}

export async function analyze(page: Page) {
  await page.getByRole('button', { name: '雰囲気を解析する' }).click();
  await expect(page.getByTestId('vibe-result')).toBeVisible();
}

export const dominantVibes = (page: Page) => page.getByTestId('dominant-vibes').getByRole('listitem');
export const spotItems = (page: Page) => page.getByTestId('spot-item');

/** 録画モードでは最終状態（スポット一覧があればそこまで）を見せるために少し待つ。 */
export async function holdForRecording(page: Page) {
  if (process.env.RECORD !== '1') return;
  const spots = page.getByTestId('spot-section');
  if (await spots.count()) {
    await page.waitForTimeout(800);
    await spots.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  await page.waitForTimeout(1500);
}
