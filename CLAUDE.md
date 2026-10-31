# CLAUDE.md

## 概要
写真・動画の雰囲気を解析し、近いスポットを Google マップリンクで提案するブラウザアプリ（React + TypeScript + Vite）。

## 作業ルール
- 仕様に影響する変更は **同じ変更内で `docs/SPEC.md` を更新** する。
- E2E テストを追加・変更したら `docs/TEST_CASES.md` を更新し、テストタイトル先頭に `TC-xx` を付ける（ID は表と 1 対 1）。
- E2E を変更したら `npm run test:e2e:record` で `e2e/recordings/` の動画を更新してコミットする。
- 解析ロジック（`src/analysis/vibeAnalyzer.ts`, `matcher.ts`）は DOM 非依存の純粋関数に保ち、Vitest でテストする。
- ユーザーのファイルを外部に送信する実装をしない（SPEC N-01 / TC-17）。
- セキュリティに影響する変更（外部通信・受け付ける形式・CSP / ヘッダー・依存関係・データ取得スクリプト）は `docs/SECURITY.md` を同じ変更内で更新し、`npm audit` で脆弱性 0 件を確認する。

## コマンド
```bash
npm run typecheck && npm run test:unit && npm run test:e2e
```
