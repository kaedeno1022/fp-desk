# fp-desk

FP（ファイナンシャルプランナー）業務支援システム。自分専用のライフプランシミュレーションツール。

- 要件定義: `docs/REQUIREMENTS.md`
- 税・社会保険・年金の計算仕様: `docs/DOMAIN.md`

## 技術スタック

Next.js + SQLite（better-sqlite3）。外部サービス依存なし・ローカル完結。認証は bcryptjs + jose（JWTセッションCookie）の自前実装。

## セットアップ

```bash
npm install

# セッション署名用シークレットを生成して .env.local に設定する
echo "SESSION_SECRET=$(openssl rand -base64 32)" > .env.local
```

`.env.local` の設定項目は `.env.example` を参照。`DATABASE_PATH` は省略時 `data/fp-desk.db`（初回起動時に自動作成される）。

## 起動

```bash
npm run dev
```

http://localhost:3000 を開く。

- 初回は「アカウント作成」からユーザー登録する（メール確認はない。メールアドレスはID代わり）
- **シングルユーザーモード**: ユーザーが1人でも存在すると以降の新規登録は拒否される
- パスワードを忘れた場合はDBを直接操作するしかない（`data/fp-desk.db` の users テーブル）

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ起動 |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバ起動（要ビルド） |
| `npm test` | テスト実行（vitest） |
| `npm run test:watch` | テストのwatch実行 |
| `npm run type-check` | TypeScript型チェック |
| `npm run lint` | ESLint |

## 構成

```
data/
  tax-tables/2025.json   税率・料率テーブル（年度データ）
  fp-desk.db             SQLite本体（gitignore対象）
docs/
  REQUIREMENTS.md        要件定義
  DOMAIN.md              計算ドメイン仕様（式・境界・端数処理・検証基準）
src/
  lib/engine/            計算エンジン（UI・DBから独立した純関数群 + テスト）
  lib/                   DB接続・認証・セッション・保存CRUD
  app/                   画面（一覧 / シミュレーション編集 / ログイン）
  components/            エディタ・結果表示（グラフ・CF表）
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

DBは `data/fp-desk.db` の単一ファイル。バックアップはこのファイルのコピーで足りる（WALモードのため、確実を期すならサーバ停止後にコピーする）。
