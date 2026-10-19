import { defineConfig, devices } from '@playwright/test';

/** RECORD=1 のときは操作をゆっくり実行し、閲覧用に見やすい動画を残す。 */
const record = process.env.RECORD === '1';
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: record ? 1 : undefined,
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['./e2e/reporters/video-archiver.ts', { outputDir: 'e2e/recordings' }],
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { slowMo: record ? 400 : 0 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
