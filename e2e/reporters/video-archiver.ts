import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

interface Options {
  outputDir?: string;
}

interface Entry {
  id: string;
  title: string;
  file: string;
  status: TestResult['status'];
  durationMs: number;
  recordedAt: string;
}

const ID_PATTERN = /^(TC-\d+)/;

/**
 * Playwright が test-results/ に出力した操作動画を、テストケース ID 名で
 * e2e/recordings/ にコピーして保管するレポーター。
 *
 * - 動画ファイル名: `<TC-ID>.webm`（テストタイトル先頭の ID を使う）
 * - 一覧: `index.json`（機械可読）と `README.md`（閲覧用）を毎回再生成する
 * - 一部のテストだけ実行した場合も、既存エントリは保持してマージする
 */
export default class VideoArchiver implements Reporter {
  private readonly dir: string;
  private readonly entries = new Map<string, Entry>();

  constructor(options: Options = {}) {
    this.dir = path.resolve(options.outputDir ?? 'e2e/recordings');
  }

  onBegin() {
    const indexPath = path.join(this.dir, 'index.json');
    if (!fs.existsSync(indexPath)) return;
    for (const e of JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as Entry[]) this.entries.set(e.id, e);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const id = ID_PATTERN.exec(test.title)?.[1];
    const video = result.attachments.find((a) => a.name === 'video' && a.path);
    if (!id || !video?.path || !fs.existsSync(video.path)) return;

    fs.mkdirSync(this.dir, { recursive: true });
    const file = `${id}.webm`;
    fs.copyFileSync(video.path, path.join(this.dir, file));
    this.entries.set(id, {
      id,
      title: test.title.replace(ID_PATTERN, '').trim(),
      file,
      status: result.status,
      durationMs: result.duration,
      recordedAt: new Date().toISOString(),
    });
  }

  onEnd(_result: FullResult) {
    if (this.entries.size === 0) return;
    const sorted = [...this.entries.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    fs.writeFileSync(path.join(this.dir, 'index.json'), `${JSON.stringify(sorted, null, 2)}\n`);

    const rows = sorted.map(
      (e) => `| ${e.id} | ${e.title} | ${e.status === 'passed' ? '✅' : '❌'} ${e.status} | [${e.file}](./${e.file}) | ${e.recordedAt} |`,
    );
    const md = [
      '# E2E 操作キャプチャ動画',
      '',
      'Playwright 実行時に `e2e/reporters/video-archiver.ts` が自動生成するファイルです。手で編集しないでください。',
      'テストケースの内容は [docs/TEST_CASES.md](../../docs/TEST_CASES.md) を参照してください。',
      '',
      '| ID | テストケース | 結果 | 動画 | 録画日時 (UTC) |',
      '|---|---|---|---|---|',
      ...rows,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(this.dir, 'README.md'), md);
  }

  printsToStdio() {
    return false;
  }
}
