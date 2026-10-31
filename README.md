# Vibe Spot Finder

写真や動画を読み込ませると、その **雰囲気（色味・明暗・質感）** を解析し、
**雰囲気が近い国内スポット** を **Google マップのリンク付き** で提案するブラウザアプリです。

- ファイルは **ブラウザ内だけで解析** され、サーバーには送信されません。
- 動画は 5 フレームを抽出して平均的な雰囲気を判定します。
- 解析には Web 上の写真（Open Images Dataset、約 2.2 万枚）で学習した軽量モデルを使います（重みはアプリに同梱）。
- 全国の代表スポットに加え、関東 1 都 6 県の 2,000 スポットから提案します。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | アプリ仕様書（機能・解析ルール・推薦ロジック・非機能要件） |
| [docs/TEST_CASES.md](docs/TEST_CASES.md) | E2E テストケース一覧（TC-01〜TC-19） |
| [docs/SECURITY.md](docs/SECURITY.md) | セキュリティ要件書（脅威・要件・CSP / ヘッダー・検証方法） |
| [e2e/recordings/README.md](e2e/recordings/README.md) | Playwright の操作キャプチャ動画一覧 |

## ディレクトリ構成

```
.
├── docs/
│   ├── SPEC.md                  アプリ仕様書
│   ├── SECURITY.md              セキュリティ要件書
│   └── TEST_CASES.md            テストケース
├── src/                         React アプリ本体
│   ├── analysis/                解析・推薦ロジック（+ Vitest ユニットテスト）
│   ├── components/              UI コンポーネント
│   └── data/                    スポットデータ（spots.ts / 自動生成の kantoSpots.ts）
├── e2e/
│   ├── *.spec.ts                テストケースに沿った Playwright 実装
│   ├── helpers.ts               共通操作（ファイル選択・D&D・解析）
│   ├── fixtures/                テスト用の画像・動画
│   ├── reporters/
│   │   └── video-archiver.ts    操作動画を recordings/ に保管するレポーター
│   └── recordings/              操作キャプチャ動画（TC-xx.webm）と一覧
├── scripts/
│   ├── generate_fixtures.py     フィクスチャ生成スクリプト
│   ├── vibe_model/              解析モデルの学習（README.md に手順）
│   └── spots/                   関東スポットデータの生成（README.md に手順）
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
### CI（GitHub Actions）

PR を作成・更新すると次のワークフローが動きます。

| ワークフロー | 内容 |
|---|---|
| [`e2e.yml`](.github/workflows/e2e.yml) | 型チェック・ユニットテスト・E2E を実行。E2E はリトライなしで **全件パスしなければ失敗**。レポートと動画を Artifact に保存 |
| [`claude-code-review.yml`](.github/workflows/claude-code-review.yml) | Claude Code の公式 `code-review` プラグインでレビューし、指摘を PR にコメント |

Claude のレビューには、リポジトリの Secrets に `ANTHROPIC_API_KEY` か `CLAUDE_CODE_OAUTH_TOKEN` の登録と、
[Claude GitHub App](https://github.com/apps/claude) のインストールが必要です。
E2E を必須チェックにするには、ブランチ保護（Settings → Branches）で `E2E / test` を必須に設定してください。

### フィクスチャの再生成

```bash
npm run fixtures   # Python 3 + Pillow + ffmpeg が必要
```

### 解析モデル・スポットデータの再生成

- 解析モデル: [scripts/vibe_model/README.md](scripts/vibe_model/README.md)
- 関東スポット: [scripts/spots/README.md](scripts/spots/README.md)

## データの出典

- 解析モデルの学習データ: [Open Images Dataset](https://storage.googleapis.com/openimages/web/index.html)（画像は再配布せず、学習済みの重みのみ同梱）
- 関東スポット: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)（[Overture Maps Foundation](https://overturemaps.org/) 経由、ODbL 1.0）
