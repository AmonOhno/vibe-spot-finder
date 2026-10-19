# Vibe Spot Finder

写真や動画を読み込ませると、その **雰囲気（色味・明暗）** を解析し、
**雰囲気が近い国内スポット** を **Google マップのリンク付き** で提案するブラウザアプリです。

- ファイルは **ブラウザ内だけで解析** され、サーバーには送信されません。
- 動画は 5 フレームを抽出して平均的な雰囲気を判定します。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | アプリ仕様書（機能・解析ルール・推薦ロジック・非機能要件） |
| [docs/TEST_CASES.md](docs/TEST_CASES.md) | E2E テストケース一覧（TC-01〜TC-18） |
| [e2e/recordings/README.md](e2e/recordings/README.md) | Playwright の操作キャプチャ動画一覧 |

## ディレクトリ構成

```
.
├── docs/
│   ├── SPEC.md                  アプリ仕様書
│   └── TEST_CASES.md            テストケース
├── src/                         React アプリ本体
│   ├── analysis/                解析・推薦ロジック（+ Vitest ユニットテスト）
│   ├── components/              UI コンポーネント
│   └── data/spots.ts            スポットデータ
├── e2e/
│   ├── *.spec.ts                テストケースに沿った Playwright 実装
│   ├── helpers.ts               共通操作（ファイル選択・D&D・解析）
│   ├── fixtures/                テスト用の画像・動画
│   ├── reporters/
│   │   └── video-archiver.ts    操作動画を recordings/ に保管するレポーター
│   └── recordings/              操作キャプチャ動画（TC-xx.webm）と一覧
├── scripts/generate_fixtures.py フィクスチャ生成スクリプト
└── playwright.config.ts
```

## セットアップ

```bash
npm install
npx playwright install chromium   # 初回のみ
npm run dev                       # http://localhost:5173
```

## テスト

```bash
npm run typecheck      # 型チェック
npm run test:unit      # Vitest（解析・推薦ロジック）
npm run test:e2e       # Playwright（全 TC。動画は e2e/recordings/ に保存）
npm run test:e2e:record  # 録画用: slowMo 付きで 1 ワーカー実行し、見やすい動画を残す
```

### 操作キャプチャ動画の仕組み

1. `playwright.config.ts` で全テストの動画録画（`video: 'on'`）を有効化
2. 独自レポーター `e2e/reporters/video-archiver.ts` が、テストタイトル先頭の `TC-xx` をキーに
   `e2e/recordings/TC-xx.webm` へ動画をコピー
3. 同時に `e2e/recordings/index.json` と `README.md`（一覧表）を再生成

テストケースを追加したら `npm run test:e2e:record` を実行し、更新された動画もコミットしてください。
CI（GitHub Actions）でも同じテストを実行し、動画とレポートを Artifact として保存します。

### フィクスチャの再生成

```bash
npm run fixtures   # Python 3 + Pillow + ffmpeg が必要
```
