# アーキテクチャ（C4 モデル）

本書は Vibe Spot Finder の構成を [C4 モデル](https://c4model.com/) の Level 1〜3 で示す。
記述はリポジトリ内のコード・設定に基づく。コードから確認できない事項は「未確認」と明記する。

- 仕様: [SPEC.md](SPEC.md) / セキュリティ: [SECURITY.md](SECURITY.md) / テスト: [TEST_CASES.md](TEST_CASES.md)

## 1. 概要

### 目的

写真・動画の **雰囲気（色味・明暗・質感）** をブラウザ内で解析し、雰囲気が近い国内スポットを
**Google マップの検索リンク付き** で提案する。ファイルは端末外へ送信しない（SPEC N-01 / SECURITY SR-01）。

### 主な利用者

| 利用者 | 内容 |
|---|---|
| 一般ユーザー | 写真・動画を選択（またはドラッグ＆ドロップ）し、提案されたスポットを Google マップで開く |
| 開発者 | アプリの開発・テスト、解析モデルの再学習、関東スポットデータの再生成を行う |

### 技術スタック

| 区分 | 技術 | 根拠 |
|---|---|---|
| 言語 | TypeScript 5.9 | `package.json`, `tsconfig*.json` |
| UI | React 19.1（`react`, `react-dom`） | `package.json`, `src/main.tsx` |
| ビルド / 開発サーバー | Vite 7.3 + `@vitejs/plugin-react` | `vite.config.ts` |
| ブラウザ API | Canvas 2D（画素取得）、`<video>`（フレーム抽出）、Object URL | `src/analysis/media.ts` |
| 解析モデル | 84 → 64 → 7 の MLP（重みを TS に同梱、推論は純 TS） | `src/analysis/vibeAnalyzer.ts`, `vibeModelWeights.ts` |
| ユニットテスト | Vitest 4.1（Node 環境） | `vite.config.ts` の `test` |
| E2E テスト | Playwright 1.56（Chromium、全テスト録画） | `playwright.config.ts` |
| CI | GitHub Actions（E2E / Claude Code Review） | `.github/workflows/` |
| データ生成・学習（オフライン） | Python 3（numpy, Pillow, pyarrow, shapely） | `scripts/` |
| バックエンド / DB / 認証 | **なし**（静的 SPA。API・DB・認証のコードは存在しない） | リポジトリ全体 |
| 本番ホスティング | **未確認**（Dockerfile・IaC・デプロイ設定はリポジトリに無い。SECURITY.md は「CDN・静的ホスティング」を想定） | `docs/SECURITY.md` SR-11/12 |

## 2. Level 1: System Context 図

```mermaid
C4Context
  title System Context: Vibe Spot Finder

  Person(user, "一般ユーザー", "写真・動画から雰囲気の近い旅行先を探す")
  Person(dev, "開発者", "アプリ開発・モデル学習・データ生成")

  System(vsf, "Vibe Spot Finder", "ブラウザ内で写真・動画の雰囲気を解析し、近いスポットを提案する静的 Web アプリ")

  System_Ext(gmaps, "Google マップ", "スポットの検索結果を表示（新しいタブでリンクを開くだけ）")
  System_Ext(openimages, "Open Images Dataset", "解析モデルの学習用 Web 写真とラベル")
  System_Ext(overture, "Overture Maps（OSM 由来）", "関東スポットの元データ（S3 公開バケット）")
  System_Ext(github, "GitHub / GitHub Actions", "ソース管理・CI・PR レビュー")

  Rel(user, vsf, "写真・動画を選択し提案を見る", "HTTPS / ブラウザ")
  Rel(user, gmaps, "提案スポットを開く", "リンク遷移")
  Rel(vsf, gmaps, "検索 URL を生成", "https://www.google.com/maps/search/")
  Rel(dev, vsf, "開発・テスト")
  Rel(dev, openimages, "学習データ取得（オフライン）", "HTTPS")
  Rel(dev, overture, "スポットデータ取得（オフライン）", "S3 匿名アクセス")
  Rel(dev, github, "push / PR")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

| 名前 | 種別 | 技術 | 責務 |
|---|---|---|---|
| 一般ユーザー | Person | Web ブラウザ | メディアを読み込ませ、提案されたスポットを閲覧・Google マップで開く |
| 開発者 | Person | Node.js / Python | アプリ開発、モデル再学習、スポットデータ再生成、テスト |
| Vibe Spot Finder | System | React + TypeScript（静的 SPA） | 雰囲気解析とスポット推薦。**実行時の外部通信なし**（CSP `connect-src 'none'`） |
| Google マップ | External System | Web | 生成された検索リンクの遷移先。アプリからの API 呼び出しは無い |
| Open Images Dataset | External System | GCS / S3 上の CSV・画像 | 学習データ源。画像は再配布せず学習済み重みのみ同梱 |
| Overture Maps | External System | S3 上の GeoParquet | 関東 2,000 スポットの元データ（© OpenStreetMap contributors, ODbL） |
| GitHub / GitHub Actions | External System | GitHub | ソース管理と PR 時の CI（型チェック・テスト・E2E・Claude Code Review） |

## 3. Level 2: Container 図

```mermaid
C4Container
  title Container: Vibe Spot Finder

  Person(user, "一般ユーザー")
  Person(dev, "開発者")

  System_Boundary(vsf, "Vibe Spot Finder") {
    Container(spa, "Web アプリ（SPA）", "React 19 / TypeScript / Vite", "UI・メディア読み込み・雰囲気解析・推薦をすべてブラウザ内で実行")
    ContainerDb(bundle, "同梱データ・モデル重み", "TypeScript モジュール", "スポット約 2,000 件超 + MLP 重み（ビルド時にバンドル）")
    Container(host, "静的ファイル配信", "vite preview（ローカル）/ 本番は未確認", "ビルド成果物 dist/ をセキュリティヘッダー付きで配信")
    Container(modelpipe, "モデル学習パイプライン", "Python / numpy / Pillow", "Open Images から学習し vibeModelWeights.ts を生成")
    Container(spotpipe, "スポットデータ生成", "Python / pyarrow / shapely", "Overture Maps から kantoSpots.ts を生成")
    Container(tests, "テスト・CI", "Vitest / Playwright / GitHub Actions", "ユニット・E2E（録画付き）・PR レビュー")
  }

  System_Ext(gmaps, "Google マップ")
  System_Ext(openimages, "Open Images Dataset")
  System_Ext(overture, "Overture Maps")

  Rel(user, host, "ページを取得", "HTTPS")
  Rel(host, spa, "配信")
  Rel(spa, bundle, "import（静的）")
  Rel(user, gmaps, "リンクを開く", "新しいタブ")
  Rel(modelpipe, openimages, "ラベル・画像を取得", "HTTPS")
  Rel(spotpipe, overture, "GeoParquet を取得", "S3")
  Rel(modelpipe, bundle, "重みを書き出し")
  Rel(spotpipe, bundle, "スポットを書き出し")
  Rel(dev, modelpipe, "実行")
  Rel(dev, spotpipe, "実行")
  Rel(tests, host, "build + preview に対して E2E", "http://localhost:4173")

  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

| 名前 | 種別 | 技術 | 責務 |
|---|---|---|---|
| Web アプリ（SPA） | Container | React 19, TypeScript, Vite 7 | ファイル検証、フレーム抽出、特徴量計算、MLP 推論、スポット照合、結果表示。エントリポイントは `index.html` → `src/main.tsx` → `src/App.tsx` |
| 同梱データ・モデル重み | Container（静的データ） | TS モジュール | `src/data/spots.ts`（全国の代表スポット）、`src/data/kantoSpots.ts`（自動生成・関東 2,000 件）、`src/analysis/vibeModelWeights.ts`（自動生成・重み）。**DB は使わない** |
| 静的ファイル配信 | Container | `vite preview`（ポート 4173） / 本番は **未確認** | `vite.config.ts` の `SECURITY_HEADERS`（CSP・X-Frame-Options 等）を付与。ビルド時に CSP を meta で埋め込む |
| モデル学習パイプライン | Container（オフラインバッチ） | Python 3, numpy, Pillow | `scripts/vibe_model/`。データセット構築 → 学習 → TS への重み出力 → TS/Python の特徴量一致フィクスチャ生成 |
| スポットデータ生成 | Container（オフラインバッチ） | Python 3, pyarrow, shapely | `scripts/spots/`。Overture の places / base テーマを抽出し、種別判定・雰囲気付与・選別して TS を出力 |
| テスト・CI | Container | Vitest, Playwright, GitHub Actions | `e2e.yml`（typecheck・unit・E2E、retries=0）、`claude-code-review.yml`（PR レビュー）。E2E 動画は `e2e/recordings/` に保存 |

> サーバーサイド API、データベース、オブジェクトストレージ、認証基盤、外部 SaaS への実行時接続は **存在しない**。

## 4. Level 3: Component 図（Web アプリ）

```mermaid
C4Component
  title Component: Web アプリ（SPA）

  Person(user, "一般ユーザー")
  System_Ext(gmaps, "Google マップ")

  Container_Boundary(spa, "Web アプリ（SPA）") {
    Component(app, "App", "React (src/App.tsx)", "状態管理（idle/ready/analyzing/done）、エリア絞り込み、処理の統括")
    Component(upload, "UploadArea", "React", "ファイル選択・ドラッグ＆ドロップ")
    Component(summary, "VibeSummary", "React", "解析結果（雰囲気スコア・代表色・サムネイル）表示")
    Component(spotlist, "SpotList", "React", "提案スポット一覧と Google マップリンク")
    Component(media, "media", "TS + Canvas / video (analysis/media.ts)", "形式・サイズ検証、画像 1 枚 / 動画 5 フレームを 96px の画素に変換")
    Component(analyzer, "vibeAnalyzer", "TS 純粋関数", "色特徴量のルール判定と MLP 推論をブレンドし Vibe プロファイルを算出")
    Component(features, "modelFeatures", "TS 純粋関数", "84 次元の特徴ベクトルを抽出（Python 版と同一定義）")
    Component(matcher, "matcher", "TS 純粋関数", "コサイン類似度で上位スポットを選定し地図 URL を付与")
    ComponentDb(weights, "vibeModelWeights", "TS 定数（自動生成）", "MLP の重み・正規化パラメータ")
    ComponentDb(spots, "spots / kantoSpots", "TS 定数", "スポットと雰囲気ベクトル、googleMapsUrl()")
  }

  Rel(user, upload, "ファイルを渡す")
  Rel(upload, app, "onFile")
  Rel(app, media, "validateFile / extractFrames")
  Rel(app, analyzer, "analyzeFrames")
  Rel(analyzer, features, "extractModelFeatures")
  Rel(analyzer, weights, "参照")
  Rel(app, matcher, "matchSpots")
  Rel(matcher, spots, "参照")
  Rel(app, summary, "結果を渡す")
  Rel(app, spotlist, "一致結果を渡す")
  Rel(user, gmaps, "リンクを開く")

  UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="1")
```

| 名前 | 種別 | 技術 | 責務 |
|---|---|---|---|
| App | Component | React（`src/App.tsx`） | 選択ファイル・状態・エラー・結果・エリアを保持し、検証 → 抽出 → 解析 → 照合を順に呼ぶ。Object URL の解放、結果への自動スクロール |
| UploadArea | Component | React（`src/components/UploadArea.tsx`） | ファイル入力と D&D を受け付け `onFile` を通知 |
| VibeSummary | Component | React（`src/components/VibeSummary.tsx`） | 雰囲気スコア・代表色・フレームサムネイルを表示 |
| SpotList | Component | React（`src/components/SpotList.tsx`） | 一致度・理由・説明・「Google マップで開く」リンク（`noopener noreferrer`）を表示 |
| media | Component | TS + DOM（`src/analysis/media.ts`） | 許可 MIME（JPEG/PNG/WebP/GIF、MP4/WebM/QuickTime）とサイズ上限（画像 20MB・動画 200MB）を検証。Canvas で画素化、動画は 5 フレーム抽出、イベント待ちは 15 秒でタイムアウト |
| vibeAnalyzer | Component | TS 純粋関数（`src/analysis/vibeAnalyzer.ts`） | 色特徴量（明度・彩度・暖色比率等）のルールスコアと MLP 出力を、輝度勾配に応じた係数でブレンド。主要 Vibe（しきい値 0.3）を選ぶ |
| modelFeatures | Component | TS 純粋関数（`src/analysis/modelFeatures.ts`） | 84 次元特徴ベクトル。`scripts/vibe_model/features.py` と一致することを Vitest のフィクスチャで検証 |
| matcher | Component | TS 純粋関数（`src/analysis/matcher.ts`） | 地域フィルタ、コサイン類似度（最小 0.2）、上位 6 件、寄与上位 2 Vibe を理由として返す |
| vibeModelWeights | Component（データ） | TS 定数 | `scripts/vibe_model/train.py --write` で生成 |
| spots / kantoSpots | Component（データ） | TS 定数 | 全国の代表スポット + `scripts/spots/build_kanto_spots.py` で生成した関東スポット。`googleMapsUrl()` で検索 URL を作る |

Vibe は `ocean / forest / sunset / night / snow / retro / vivid` の 7 種（`src/analysis/types.ts`）。

## 5. 主要なデータフロー

### 5.1 メディア解析とスポット提案（実行時）

```mermaid
sequenceDiagram
  actor U as ユーザー
  participant UA as UploadArea
  participant A as App
  participant M as media
  participant V as vibeAnalyzer
  participant MT as matcher
  participant UI as VibeSummary / SpotList

  U->>UA: ファイルを選択 / D&D
  UA->>A: onFile(file)
  A->>M: validateFile(file)
  M-->>A: kind（image / video）またはエラー
  A->>M: extractFrames(file, kind)
  Note over M: Object URL → Canvas で 96px 画素化<br/>動画は 5 フレーム。端末外へ送信しない
  M-->>A: pixels[] + thumbnails[]
  A->>V: analyzeFrames(pixels)
  Note over V: ルール特徴量 + MLP 推論をブレンド
  V-->>A: AnalysisResult（profile, dominant）
  A->>MT: matchSpots(profile, SPOTS, region)
  MT-->>A: SpotMatch[]（score, reasons, mapsUrl）
  A->>UI: 結果を表示
  U->>UI: 「Google マップで開く」→ 新しいタブで遷移
```

### 5.2 オフラインのデータ・モデル更新

```mermaid
sequenceDiagram
  actor D as 開発者
  participant OI as Open Images
  participant OV as Overture Maps (S3)
  participant VM as scripts/vibe_model
  participant SP as scripts/spots
  participant SRC as src/（TS）
  participant T as Vitest

  D->>VM: build_dataset.py / train.py --write
  VM->>OI: ラベル CSV・画像を取得
  VM->>SRC: vibeModelWeights.ts を生成
  D->>VM: make_parity_fixture.py
  VM->>SRC: __fixtures__/featureParity.json
  D->>SP: extract_overture*.py / build_kanto_spots.py
  SP->>OV: places / base テーマを取得
  SP->>SRC: kantoSpots.ts を生成
  D->>T: npm run test:unit（TS と Python の一致を検証）
```

### 5.3 PR 時の CI

PR の作成・更新で `e2e.yml` が `npm ci` → typecheck → unit → `npm run build && npm run preview` に対する Playwright E2E（retries=0）を実行し、
レポートと動画を Artifact に保存する。`claude-code-review.yml` はドラフト以外の PR で Claude Code のレビューを PR にコメントする。

## 6. ディレクトリ構成

```
.
├── index.html                   エントリ HTML（referrer 無効化、/src/main.tsx を読み込む）
├── vite.config.ts               Vite 設定・CSP / セキュリティヘッダー・Vitest 設定
├── playwright.config.ts         E2E 設定（build + preview、全テスト録画）
├── src/                         Web アプリ本体
│   ├── main.tsx                 React のマウント
│   ├── App.tsx                  画面と処理の統括
│   ├── styles.css               スタイル
│   ├── components/              UI コンポーネント（UploadArea / VibeSummary / SpotList）
│   ├── analysis/                解析・推薦ロジック（DOM 依存は media.ts のみ）と Vitest テスト
│   │   └── __fixtures__/        TS / Python の特徴量一致検証データ
│   └── data/                    スポットデータ（spots.ts、自動生成の kantoSpots.ts）
├── e2e/                         Playwright テスト
│   ├── *.spec.ts                TC-xx に対応するテスト
│   ├── helpers.ts               共通操作
│   ├── fixtures/                テスト用画像・動画・不正ファイル
│   ├── reporters/               録画を recordings/ に保管するレポーター
│   └── recordings/              操作キャプチャ動画と一覧
├── scripts/                     オフラインツール（Python）
│   ├── generate_fixtures.py     E2E フィクスチャ生成
│   ├── vibe_model/              解析モデルの学習
│   └── spots/                   関東スポットデータの生成
├── docs/                        仕様書・セキュリティ要件・テストケース・本書
└── .github/workflows/           CI（E2E、Claude Code Review）
```

## 7. 未確認事項

| 項目 | 状況 |
|---|---|
| 本番のホスティング先・デプロイ手順 | リポジトリに Dockerfile / IaC / デプロイワークフローが無く未確認。SECURITY.md SR-11/12 にヘッダーと HTTPS の要件のみ記載 |
| 本番でのセキュリティヘッダー付与方法 | 同上（`vite preview` での付与のみ確認） |
