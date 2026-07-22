# fp-desk

FP（ファイナンシャルプランナー）業務支援システム。自分専用のライフプランシミュレーションツール。

- 要件定義: `docs/REQUIREMENTS.md`
- 税・社会保険・年金の計算仕様: `docs/DOMAIN.md`

## 技術スタック

Next.js（`output: "export"` による静的サイト生成）。サーバー・DB・認証なし。GitHub Pages上で完結する。

保存データ（シミュレーション入力）はブラウザの localStorage に保持する。サーバー側には何も送信しない。

## セットアップ

```bash
npm install
```

## 起動

```bash
npm run dev
```

http://localhost:3000 を開く。

- トップページから「新しいシミュレーション」を作成、またはヒアリングウィザードで一問一答から生成する
- 作成したシミュレーションはブラウザの localStorage に保存される（ブラウザ・端末をまたいだ同期はない。ストレージを消すとデータも消える）

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ起動 |
| `npm run build` | 静的サイトビルド（`out/` に出力） |
| `npm run start` | ビルド済みファイルの確認用サーバ起動 |
| `npm test` | テスト実行（vitest） |
| `npm run test:watch` | テストのwatch実行 |
| `npm run type-check` | TypeScript型チェック |
| `npm run lint` | ESLint |

## デプロイ

`main` ブランチへの push で `.github/workflows/deploy.yml` が実行され、GitHub Pages に自動デプロイされる（`npm run build` → `out/` を公開）。`next.config.ts` の `basePath: "/fp-desk"` はリポジトリ名に合わせたパスなので、フォーク・別名運用時は変更が必要。

## 構成

```
data/
  tax-tables/2025.json   税率・料率テーブル（年度データ）
docs/
  REQUIREMENTS.md        要件定義
  DOMAIN.md              計算ドメイン仕様（式・境界・端数処理・検証基準）
src/
  lib/engine/            計算エンジン（UI・保存から独立した純関数群 + テスト。所得税・住民税・社会保険・国保・ローン・教育費・児童手当・資産運用・モンテカルロ等）
  lib/simulations.ts     シミュレーションの保存・呼び出し（localStorage）
  app/                   画面（一覧 / ヒアリングウィザード / シミュレーション編集）
  components/            ヒアリングウィザード・エディタ・結果表示（グラフ・CF表・モンテカルロ）
```

## 税率テーブルの検証状態（重要）

`data/tax-tables/2025.json` の数値は **AIの知識ベース（令和7年度税制改正まで）で投入した初期値**であり、公的機関の公表値との突合はまだ行っていない。全セクションの `meta.verified` が `false` になっている。

本番の顧客提案に使う前に、各セクションを出典と突合して次を行うこと。

1. 数値を公表値と照合し、必要なら修正する
2. `meta.verified` を `true` にする
3. `meta.sourceUrl`（出典URL）と `meta.verifiedDate`（確認日）を追記する

主な出典: 国税庁タックスアンサー（No.2260 税率・No.1410 給与所得控除・No.1199 基礎控除ほか、各セクションの `meta.source` に記載）、協会けんぽ保険料額表、日本年金機構、文部科学省の学習費調査。

国保・介護保険第1号・後期高齢者医療の既定値は概算のプレースホルダなので、**居住自治体の公表料率で必ず上書きする**こと（自治体差が大きい）。

税制改正時はこのJSONを更新（または年度ファイルを追加）するだけで対応する。計算ロジック側に数値は埋め込んでいない。

## データのバックアップ

保存データはブラウザの localStorage のみに存在する（サーバー側にコピーはない）。ブラウザのストレージ消去・端末変更でデータは失われるため、重要なシミュレーションはエクスポート機能（未実装の場合はDevToolsでlocalStorageの値を手動退避）でバックアップすること。
