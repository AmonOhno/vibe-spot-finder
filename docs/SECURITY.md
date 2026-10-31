# Vibe Spot Finder セキュリティ要件書

| 項目 | 内容 |
|---|---|
| バージョン | 0.2.0 |
| 最終更新 | 2026-10-28 |
| 関連文書 | [SPEC.md](./SPEC.md)（機能・非機能要件）、[TEST_CASES.md](./TEST_CASES.md)（E2E テスト） |

---

## 1. 目的と適用範囲

本書は Vibe Spot Finder の **セキュリティ上の要件** と、その実装・検証方法を定める。
対象は次の 3 つ。

| 対象 | 内容 |
|---|---|
| Web アプリ | `src/`・`index.html`・`vite.config.ts`（ブラウザで動く静的 SPA） |
| 開発・テスト依存 | `package.json` / `package-lock.json` の npm パッケージ |
| データ生成スクリプト | `scripts/vibe_model/`（学習データ取得・学習）、`scripts/spots/`（スポットデータ生成） |

セキュリティに影響する変更（外部通信・入力形式・ヘッダー・依存関係・データ取得処理の変更など）は、
**同じ変更内で本書を更新** し、対応するテストを追加・更新する。

---

## 2. 前提とリスクの整理

### 2.1 システムの特性
- バックエンドを持たない静的 SPA。ユーザー認証・アカウント・Cookie・サーバー側の保存データはない。
- ユーザーが選ぶ写真・動画は **位置情報（EXIF）や顔・自宅などの個人情報を含み得る**。これが最重要の保護対象である。
- スポットデータ（`src/data/kantoSpots.ts`）は OpenStreetMap 由来の外部データから自動生成しており、内容は信頼できない入力として扱う。

### 2.2 保護対象（資産）

| ID | 資産 | 求める性質 |
|---|---|---|
| A-1 | ユーザーが選んだファイルと、そこから得た解析結果・サムネイル | 機密性（端末外に出さない） |
| A-2 | 配信するアプリのコード・データ | 完全性（改ざん・スクリプト注入がない） |
| A-3 | 開発者・CI の実行環境 | 完全性（依存パッケージやデータ取得処理を経由した侵害がない） |

### 2.3 想定する脅威

| ID | 脅威 | 主な対策 |
|---|---|---|
| T-1 | アプリ（または将来の改修・依存パッケージ）がユーザーのファイルを外部へ送信する | SR-01, SR-10 |
| T-2 | スポット名など外部由来データやファイル名を通じたスクリプト注入（XSS） | SR-02, SR-10 |
| T-3 | 細工したファイル（SVG・HTML 等）をプレビューさせてスクリプトを実行させる | SR-03 |
| T-4 | 巨大・破損・応答しないメディアによる画面の固まり（可用性） | SR-04, SR-05 |
| T-5 | 他サイトへの埋め込み（クリックジャッキング）、リンク先への Referer 漏えい、`window.opener` 悪用 | SR-06, SR-11 |
| T-6 | 脆弱性のある依存パッケージ | SR-30, SR-31 |
| T-7 | データ生成スクリプトが取得する外部ファイル（CSV・画像・parquet）の細工によるパストラバーサル・資源枯渇・任意コード実行 | SR-20〜SR-22 |

---

## 3. セキュリティ要件

### 3.1 データの取り扱い（クライアント）

| ID | 要件 | 実装 | 検証 |
|---|---|---|---|
| SR-01 | 選択したファイル・解析結果・サムネイルを **外部オリジンへ送信しない**。解析処理で外部オリジンへの通信を発生させない（SPEC N-01） | ファイルは `URL.createObjectURL` と Canvas でブラウザ内処理のみ。外部 API・解析タグ・CDN を使わない。CSP `connect-src 'none'` で fetch / XHR / WebSocket を遮断 | TC-17, TC-19 |
| SR-02 | 外部由来の文字列（スポット名・説明・ファイル名・エラーメッセージ）は **テキストとして出力** し、HTML として解釈させない | React の JSX テキスト出力のみを使う。`dangerouslySetInnerHTML`・`innerHTML`・`eval`・`new Function` を使わない。生成スクリプトは文字列を `json.dumps` で JSON リテラルとして書き出す | コードレビュー |
| SR-03 | 受け付けるファイル形式は **ラスター画像と動画に限定** する（SVG・HTML などスクリプトを含み得る形式は受け付けない）。プレビューは `<img>` / `<video>` 要素でのみ行い、`<iframe>` / `<object>` で開かない | `validateFile` の許可リスト（SPEC §4.1）。CSP `object-src 'none'` | ユニットテスト（`validateFile`）、TC-04 |
| SR-04 | ファイルサイズに上限を設け、解析は縮小画像で行う | 画像 20MB / 動画 200MB（SPEC §4.1）、長辺 96px に縮小して解析（SPEC §4.2） | TC-05、ユニットテスト |
| SR-05 | 応答しない・壊れたメディアで **解析中のまま固まらない** こと | 動画の読み込み・シーク 1 回ごとに 15 秒のタイムアウトを設け、超過時は「動画を読み込めませんでした」として `ready` に戻す。終了時は `<video>` の `src` を外して解放する | ユニットテスト（`once`） |
| SR-06 | 外部リンクは新しいタブで開き、リンク元の情報を渡さない | Google マップ・OSM へのリンクは `target="_blank" rel="noopener noreferrer"`。`<meta name="referrer" content="no-referrer">` | TC-13 |
| SR-07 | Google マップ URL のクエリは **URL エンコード** し、スキーム・ホストは固定とする | `googleMapsUrl` で `https://www.google.com/maps/search/?api=1&query=` に `encodeURIComponent` したクエリを付ける | `src/data/spots.test.ts`、TC-13 |
| SR-08 | ユーザーのファイルや解析結果を `localStorage` 等に **永続化しない**。Object URL は不要になったら解放する | 状態は React のメモリ上のみ。`URL.revokeObjectURL` をクリア・差し替え・解析終了時に呼ぶ | コードレビュー |

### 3.2 配信設定（ブラウザの防御機構）

| ID | 要件 | 実装 | 検証 |
|---|---|---|---|
| SR-10 | **Content Security Policy** を適用し、自オリジン以外のスクリプト・外部への送信を禁止する | ビルド時に `index.html` へ meta で埋め込む（`vite.config.ts` の `CONTENT_SECURITY_POLICY`、下表）。開発サーバー（`npm run dev`）は HMR のため対象外 | TC-19 |
| SR-11 | 配信時に **セキュリティヘッダー** を付与する | `vite preview` で `SECURITY_HEADERS` を付与（下表）。本番のホスティング（CDN・静的ホスティング）でも同じヘッダーを設定すること | TC-19 |
| SR-12 | 本番は **HTTPS のみ** で配信する | ホスティング側で HTTP→HTTPS リダイレクトと `Strict-Transport-Security: max-age=31536000; includeSubDomains` を設定する（`vite preview` はローカル HTTP のため付与しない） | 公開前チェック（§5） |

CSP（meta / ヘッダー共通）:

| ディレクティブ | 値 | 理由 |
|---|---|---|
| `default-src` | `'none'` | 明示したもの以外はすべて禁止 |
| `script-src` | `'self'` | ビルド済み JS のみ。インラインスクリプト・`eval` は禁止 |
| `style-src` | `'self'` | ビルド済み CSS のみ（React の `style` 属性は CSSOM 経由のため影響しない） |
| `img-src` | `'self' blob: data:` | プレビュー（Object URL）とサムネイル（data URL） |
| `media-src` | `'self' blob:` | 動画プレビュー（Object URL） |
| `connect-src` | `'none'` | fetch / XHR / WebSocket / beacon による送信を禁止（SR-01） |
| `font-src` / `manifest-src` | `'self'` | 自オリジンのみ |
| `base-uri` / `form-action` / `object-src` | `'none'` | `<base>` 差し替え・フォーム送信・プラグインを禁止 |
| `frame-ancestors` | `'none'` | 他サイトへの埋め込み禁止（meta では無効のためヘッダーのみ） |

セキュリティヘッダー:

| ヘッダー | 値 |
|---|---|
| `Content-Security-Policy` | 上表 + `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

### 3.3 データ生成スクリプト（`scripts/`）

スクリプトは外部（Open Images の CSV・画像、Overture Maps の parquet）からデータを取得する。取得物は信頼できない入力として扱う。

| ID | 要件 | 実装 |
|---|---|---|
| SR-20 | 外部データの値を **ファイルパス・URL に埋め込む前に検証** する | `build_dataset.py` は ImageID を `^[0-9a-f]{16}$`、split を `train / validation / test` に限定し、合わない行はスキップする |
| SR-21 | 取得するファイルの **サイズ・画素数に上限** を設ける | 画像は 20MB まで読み、超過は破棄。Pillow の `MAX_IMAGE_PIXELS` を 1 億画素に設定し展開爆弾を拒否する |
| SR-22 | 取得物を **コードとして実行・逆シリアライズしない** | `np.load(..., allow_pickle=False)` を明示。pickle・`eval`・`exec`・シェル経由のコマンド実行を使わない（`subprocess` は引数リスト形式のみ） |
| SR-23 | 生成するソースコード（`kantoSpots.ts` / `vibeModelWeights.ts`）には値を **JSON リテラルとしてのみ** 埋め込む | `json.dumps` で出力。文字列連結でコードを組み立てない。生成物はコミット前に差分をレビューする |
| SR-24 | 取得元は HTTPS / 公式のバケットに固定し、TLS 検証を無効化しない | `https://s3.amazonaws.com/open-images-dataset/…`、`https://storage.googleapis.com/openimages/…`、`overturemaps-us-west-2`（匿名 S3） |
| SR-25 | 取得したデータ（画像・CSV・parquet）を **リポジトリにコミットしない** | 作業ディレクトリ（`WORK_DIR` / `OUT_DIR`）に置く |

### 3.4 依存関係・リポジトリ

| ID | 要件 | 実装・運用 |
|---|---|---|
| SR-30 | `npm audit` で **既知の脆弱性が 0 件**（開発依存を含む）であること | 依存追加・更新時に `npm audit` を実行する。脆弱性が出たら修正版へ更新する |
| SR-31 | 依存バージョンは **完全一致で固定** し、`package-lock.json` をコミットする。CI では `npm ci` を使う | `package.json` は `^` / `~` を使わない |
| SR-32 | ランタイム依存は最小限にする（現状 `react` / `react-dom` のみ） | 新規ランタイム依存の追加時は、外部通信の有無・メンテナンス状況を確認する |
| SR-33 | API キー・トークン・認証情報をリポジトリに含めない | 現状、必要な秘密情報はない（Google マップは API キー不要の URL 形式）。将来 API を使う場合はクライアントに秘密鍵を埋め込まず、バックエンド経由とする |

---

## 4. 将来の拡張時の要件

SPEC §8 のロードマップを実装する際は、以下を満たすこと（いずれも SR-01 の例外となるため、本書と SPEC N-01 の改訂を伴う）。

| 拡張 | 追加要件 |
|---|---|
| AI 画像認識（バックエンド経由） | 送信前にユーザーの明示的な同意を得る。送信前に EXIF（位置情報）を除去し、縮小画像のみ送る。API キーはバックエンドのみが保持する。送信先を CSP `connect-src` に限定して追加する |
| Google Places API | API キーは HTTP リファラー・API で制限するか、バックエンドに置く。現在地は利用時に都度許可を得て、端末外へ送るのは検索に必要な精度までとする |
| お気に入り保存 | 保存するのはスポット ID のみとし、ユーザーのファイルや解析画像は保存しない |

---

## 5. 検証とチェックリスト

| 方法 | 対象 | タイミング |
|---|---|---|
| E2E（TC-17, TC-19） | SR-01, SR-10, SR-11 | 変更ごと（`npm run test:e2e`） |
| ユニットテスト | SR-03, SR-04, SR-05, SR-07 | 変更ごと（`npm run test:unit`） |
| `npm audit` | SR-30 | 依存変更時・定期 |
| コードレビュー | SR-02, SR-08, SR-2x | 変更ごと |

コードレビュー時の確認項目:
- [ ] `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `new Function` / `document.write` を追加していない
- [ ] `fetch` / `XMLHttpRequest` / `navigator.sendBeacon` / WebSocket / 外部スクリプト・画像の読み込みを追加していない
- [ ] 受け付けるファイル形式を増やす場合、スクリプトを含み得る形式（SVG・HTML・PDF 等）ではない
- [ ] `target="_blank"` のリンクに `rel="noopener noreferrer"` がある
- [ ] 生成スクリプトで外部データをパス・URL・コードに埋め込む箇所に検証がある

公開前チェック（ホスティング設定）:
- [ ] HTTPS 強制と HSTS（SR-12）
- [ ] §3.2 のセキュリティヘッダーがすべて付与されている（`curl -I` で確認）
- [ ] ビルド成果物の `index.html` に CSP の meta がある

---

## 6. 既知の制約・残存リスク

| 内容 | 評価 |
|---|---|
| 画像の画素数（解像度）には上限を設けていない。20MB 以下でも極端に高解像度の画像はデコードでメモリを消費する | 影響はユーザー自身のタブに限られ、ブラウザ側の上限で失敗する。高画素のスマートフォン写真を誤って拒否しないため、アプリ側では制限しない |
| MIME タイプはブラウザが拡張子から推定した `File.type` で判定し、ファイル内容（マジックバイト）は検査しない | 内容は `<img>` / `<video>` でのみデコードされ、形式が違えばデコード失敗として扱われるため、実行につながらない |
| CSP は meta で配信するため、`frame-ancestors` と HSTS はホスティング側のヘッダー設定に依存する | §5 の公開前チェックで確認する |
| 開発サーバー（`npm run dev`）には CSP を適用しない | 開発用途のみ。E2E はビルド成果物（`vite preview`）で実行する |

---

## 7. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-10-28 | 初版。CSP・セキュリティヘッダー（SR-10〜12）、動画読み込みのタイムアウト（SR-05）、データ取得スクリプトの入力検証（SR-20〜22）を追加し、vitest を 4.1.12 に更新して既知の脆弱性（tinypool / @vitest/mocker）を解消 |
