# 🚀 リリース運用手順書（Release Runbook）

> 📌 対象: **Public Infrastructure Maintenance Map（公開インフラ維持管理マップ）**
> 🔐 原則: **本番反映は、リリースPR（Approval PR）に明記された正確な範囲について、マージ承認 `Y` を得た場合にのみ実行する。** 承認範囲外の本番操作・Secrets 変更・DNS 変更は行わない（初回リリースは PR #46 の承認範囲で 2026-07-23 に実行済み）。
> 🧭 読者: エンジニアだけでなく、運用・意思決定者も流れを追える構成にしています。

---

## 📌 1. 概要とデプロイ対象コンポーネント

本サービスは **公開データのみ**を扱う Web GIS で、3 つのコンポーネントを個別にデプロイします。

| #      | コンポーネント       | 実体                                              | 配信先                 | デプロイ方法                                                                                                                                                                                                                                 |
| ------ | -------------------- | ------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🌐 Web | `apps/web`           | React 19 + MapLibre + Vite（静的 `dist/`）        | **Cloudflare Pages**   | `vite build` → Pages へ配信（手動）。API 接続先はコミット済み `apps/web/.env.production` が供給（Vite の優先順位で検証用 `.env.local` に勝つ）。デプロイ後は `pnpm smoke:cloudflare` の `web-bundle-api-base` で混入なしを必ず確認（DL-014） |
| ⚙️ API | `apps/api`           | Hono / Worker（`src/worker.ts`, name=`pimm-api`） | **Cloudflare Workers** | `wrangler deploy --env production`（手動）                                                                                                                                                                                                   |
| 🗄️ DB  | `migrations/` + 取込 | PostgreSQL + PostGIS                              | **Neon**               | `pnpm db:migrate` / `pnpm ingest --publish`（手動）                                                                                                                                                                                          |

### 🗺️ 構成図

```mermaid
flowchart LR
  U["👤 一般利用者<br/>ブラウザ"] -->|HTTPS| P["🌐 Cloudflare Pages<br/>apps/web (React+MapLibre)<br/>静的 dist/"]
  P -->|"/api/v1 fetch"| W["⚙️ Cloudflare Workers<br/>pimm-api / Hono"]
  W -->|SQL over TLS| N[("🗄️ Neon PostgreSQL<br/>+ PostGIS")]
  M["🔧 pnpm db:migrate"] -->|DDL| N
  I["💻 pnpm ingest --publish"] -->|公開データ書込| N
```

- Web は完全な静的成果物。ブラウザは `import.meta.env.VITE_API_BASE_URL`（未設定時は同一オリジン `/api/v1`）へ問い合わせます。
- API は `DATABASE_URL` **未設定でも起動し、サンプルモード（バンドル済みサンプルソースを取込パイプラインで生成した in-memory データ）で応答**します（＝DB未接続でも 500 にならない）。本番では必ず `DATABASE_URL` を設定してください。

---

## 🔐 2. 前提・必要な権限・シークレット

### 2.1 アカウント / 権限

| 🔑 対象               | 用途                                           | 権限レベルの目安                               |
| --------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Cloudflare アカウント | Workers デプロイ・Pages 配信・WAF              | Workers/Pages の編集権限                       |
| Cloudflare zone       | `mirai-dx-platform.com` の DNS / Custom Domain | Zone DNS 編集権限                              |
| Neon アカウント       | PostgreSQL + PostGIS 本番DB                    | 対象プロジェクトの接続文字列発行・ブランチ操作 |
| GitHub                | ソース・CI（`.github/workflows/ci.yml`）       | リポジトリ書込                                 |

### 2.2 ツール

| 🛠️ ツール | バージョン制約                       | 備考                            |
| --------- | ------------------------------------ | ------------------------------- |
| Node.js   | **>= 22**（`package.json` engines）  | pnpm workspace                  |
| pnpm      | **10.34.5**（`packageManager` 固定） | corepack 推奨                   |
| wrangler  | Cloudflare Workers CLI               | `apps/api/wrangler.toml` を使用 |

### 2.3 シークレット / 環境変数

| 変数                               | 設定場所                                                                                                                                             |     必須      | 説明                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔒 `DATABASE_URL`                  | **Worker Secret**（`wrangler secret put DATABASE_URL`）／取込時はローカル環境変数                                                                    |    ✅ 本番    | Neon 接続文字列（`sslmode=require`）。未設定だとサンプルモードで公開されるため要注意                                                                          |
| 🛡️ `REQUIRE_DATABASE_URL`          | `wrangler.toml` `[env.production.vars]` に **`"true"` を宣言済み**                                                                                   |    ✅ 本番    | `DATABASE_URL` 未設定時に fail-fast させ、サンプルデータの誤公開を防ぐ。secret 登録忘れで無言に無効化されないよう宣言的に固定済み（手動 `secret put` は不要） |
| 🔑 `CLOUDFLARE_ACCESS_AUD`         | **Worker Secret**                                                                                                                                    |    ✅ 本番    | Access アプリケーションの AUD タグ。Worker が JWT の `aud` 突合に使用する                                                                                     |
| 🏛️ `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | **Worker Secret**（例 `example.cloudflareaccess.com`）                                                                                               |    ✅ 本番    | JWKS 取得元 兼 `iss` 突合先。**未設定だと管理APIは 500 でフェイルクローズ**                                                                                   |
| 🚧 `REQUIRE_ACCESS_JWT`            | `wrangler.toml` の**既定 `[vars]` と `[env.production.vars]` の両方**に `"true"` を宣言済み                                                          |    ✅ 本番    | 上記2つが未設定でもヘッダ信頼へ退行させず 500 を返す安全弁。**既定 env でも `[vars]` に宣言済み**                                                             |
| 🌐 `ALLOWED_ORIGIN`                | `apps/api/wrangler.toml`（既定 `[vars]` は `"http://localhost:5173"`、`[env.production.vars]` は `"https://pimm.mirai-dx-platform.com"` を宣言済み） |  ✅ 宣言済み  | 既定はローカル Vite オリジン限定で wildcard を廃止。`--env production` を付け忘れた deploy でも全オリジン許可の API は公開されない（Issue #42 M-2）           |
| 🔢 `RATE_LIMIT_PER_MINUTE`         | `wrangler.toml` `[vars]`（既定 `"120"`）                                                                                                             |     任意      | in-isolate レート制限の分あたり上限                                                                                                                           |
| 🔐 `ADMIN_EMAILS`                  | Worker Secret / 環境変数                                                                                                                             | 管理API利用時 | Cloudflare Accessで認証されたメールのうち、管理APIの書込操作を許可するカンマ区切り許可リスト                                                                  |
| 👀 `REVIEWER_EMAILS`               | Worker Secret / 環境変数                                                                                                                             | 管理API利用時 | Cloudflare Accessで認証されたメールのうち、管理APIの閲覧・品質レビュー操作を許可するカンマ区切り許可リスト                                                    |
| 🌐 `VITE_API_BASE_URL`             | **Cloudflare Pages の環境変数**（ビルド時）                                                                                                          |     本番      | `https://api.pimm.mirai-dx-platform.com/api/v1`。未設定なら同一オリジン `/api/v1`                                                                             |

> ✅ **実装状況の注記**
>
> - Web 向け環境変数は `VITE_API_BASE_URL`（`apps/web/src/api/client.ts`）に統一済みです。Pages 側でも `VITE_API_BASE_URL` を設定してください。
> - `REQUIRE_DATABASE_URL`（未設定時 fail-fast）と、サンプルモード転落時の `sample_mode_fallback` 警告ログは実装済みです。本番では `REQUIRE_DATABASE_URL=true` を設定し、DB未接続のままサンプルデータを公開しない運用にしてください。
>
> 🔒 **管理APIの認証境界（2026-07-19 更新）**
> Worker が `Cf-Access-Jwt-Assertion` の署名・`aud`・`iss`・`exp` を**自前で検証**します。利用者IDは検証済みJWTのクレームからのみ取得し、詐称可能な `CF-Access-Authenticated-User-Email` ヘッダは JWT 強制時には無視します。ロールは引き続き `ADMIN_EMAILS` / `REVIEWER_EMAILS` のサーバ側許可リストからのみ解決します。
>
> これにより Cloudflare Access は「唯一の認証境界」ではなく**多層防御の外層**になりました。Access を迂回して Worker へ直接到達する経路（`*.workers.dev` 等）が生じても、有効な Access JWT なしに管理APIは利用できません。あわせて `workers_dev = false` と `REQUIRE_ACCESS_JWT = "true"` を**既定 env と production env の両方**に宣言しています。`--env production` を付け忘れた deploy でも、到達可能な Worker が公開されることも、ヘッダ信頼へ退行することもありません。

### 2.4 Cloudflare 本番ドメイン

| 用途     | Hostname                         | 設定場所                                              |
| -------- | -------------------------------- | ----------------------------------------------------- |
| 🌐 WebUI | `pimm.mirai-dx-platform.com`     | Cloudflare Pages custom domain                        |
| ⚙️ API   | `api.pimm.mirai-dx-platform.com` | `apps/api/wrangler.toml` production env custom domain |

> ⚠️ ドメイン/route変更は本番影響を持つため、`docs/CLOUDFLARE_DOMAIN_APPROVAL.md` のApproval PRで承認された範囲だけ実行します。

---

## ✅ 3. リリース前チェックリスト

デプロイ着手の前に、以下をすべて満たすことを確認します（未達なら着手しない）。

| #   | 項目                      | 確認方法                                                                               | 状態基準         |
| --- | ------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| ✅  | CI success                | GitHub Actions `ci.yml` が緑                                                           | 3 ジョブ success |
| ✅  | lint / format / typecheck | `pnpm lint` / `pnpm format:check` / `pnpm typecheck`                                   | error 0          |
| ✅  | テスト                    | `pnpm test`（vitest, 全パッケージ）                                                    | 全 pass          |
| ✅  | ビルド                    | `pnpm build`（`-r`, Web の `dist/` 生成）                                              | 成功             |
| 🔐  | シークレットスキャン      | CI `secret-scan`（gitleaks）                                                           | 検出 0           |
| 🔐  | 依存脆弱性スキャン        | CI `dependency-scan`（osv-scanner v2.3.8）                                             | Critical 0       |
| 🗄️  | マイグレーション適用計画  | 未適用 `migrations/*.sql` を棚卸し（`0001_init.sql` / `0002_cross_column_checks.sql`） | 適用対象を把握   |
| 🔁  | ロールバック確認          | §5 の手順・直前デプロイ・Neon 復元点を確認                                             | 手段を用意       |
| 📄  | README / docs 最新        | 利用機能・手順の差分反映                                                               | 反映済み         |
| ⚠️  | 受入基準の現状            | §8 の既知制約を確認（Cloudflare 本番スモーク #38 等）                                  | リスク合意済み   |

> 💡 CI にデプロイジョブは**ありません**（`ci.yml` は quality / secret-scan / dependency-scan の 3 ジョブのみ）。**本番反映は 100% 手動**です。

---

## 🚀 4. デプロイ手順（すべて人間が手動実行）

> 順序が重要です。**DB → 取込 → API → Web** の順に進め、各段階で検証を挟みます。

```mermaid
flowchart TD
  A["① DB マイグレーション<br/>pnpm db:migrate"] --> B["② 実データ取込<br/>pnpm ingest --publish"]
  B --> C["③ API デプロイ<br/>wrangler deploy --env production"]
  C --> D["④ Web デプロイ<br/>vite build → Pages"]
  A -.検証.-> Av["schema_migrations 確認"]
  B -.検証.-> Bv["取込 品質レポート確認"]
  C -.検証.-> Cv["GET /api/v1/health = ok"]
  D -.検証.-> Dv["本番URLで地図・データ表示"]
```

### ① 🗄️ Neon マイグレーション適用

```bash
# 本番 Neon の接続文字列を安全に読み込む（履歴・ファイルに残さない）
export DATABASE_URL='postgresql://USER:PASSWORD@HOST/DB?sslmode=require'
pnpm db:migrate
```

- 挙動: `schema_migrations` テーブルで適用済みを追跡。**ファイル名昇順・各ファイル 1 トランザクション・冪等**（適用済みは `⏭` スキップ）。`0001_init.sql` は `CREATE EXTENSION postgis / pg_trgm` を含みます。
- 🔎 **検証**: 出力に `🎉 migrations complete`。必要に応じ `SELECT filename, applied_at FROM schema_migrations ORDER BY filename;` で確認。
- ⚠️ `DATABASE_URL` 未設定だと即 `❌ ... Aborting`（migrate 自体は fail-fast）。

### ② 💻 実データ取込（公開データを本番DBへ）

```bash
# まず dry-run（DBに書かず品質レポートのみ）
pnpm ingest --source <slug>

# 問題なければ本番DBへ公開（DATABASE_URL 必須）
DATABASE_URL='postgresql://...sslmode=require' pnpm ingest --source <slug> --publish
```

- `--publish` なしは **dry-run**（品質レポートのみ、書込なし）。`--publish` で Neon へ書込。
- `<slug>` は各ソースアダプターの識別子（例: 熊本県橋梁 / 国土数値情報道路N13 / 大阪市公園・公衆トイレ 等。正確な slug は `packages/source-adapters` の registry で確認）。公開対象ソースを 1 件ずつ流します。
- 🔎 **検証**: dry-run の品質レポートを確認 → `--publish` 後に §4③ の API 経由で `/api/v1/sources`・`/api/v1/assets/summary` を確認。
- 🛡️ **非破壊**: 取込は既存公開データを壊さない設計。失敗時は原因除去のうえ**同一ソースを再実行**（§6 参照）。

### ③ ⚙️ API（Cloudflare Workers）デプロイ

```bash
# 初回・変更時のみ: Worker Secret を登録
cd apps/api
wrangler secret put DATABASE_URL --env production   # プロンプトに Neon 接続文字列を貼付
wrangler secret put CLOUDFLARE_ACCESS_AUD --env production
wrangler secret put CLOUDFLARE_ACCESS_TEAM_DOMAIN --env production
wrangler secret put ADMIN_EMAILS --env production
wrangler secret put REVIEWER_EMAILS --env production
# REQUIRE_DATABASE_URL / REQUIRE_ACCESS_JWT は wrangler.toml で宣言済みのため登録不要

# デプロイ
wrangler deploy --env production   # api.pimm.mirai-dx-platform.com を使用
```

- 🔎 **検証（health）**:

```bash
curl -fsS https://api.pimm.mirai-dx-platform.com/api/v1/health
# 期待: {"status":"ok", ...}
```

> ⚠️ `/health` は **liveness 相当**で、**DB 接続の readiness を厳密には保証しません**。DB 連携の実確認は `/api/v1/assets/summary`・`/api/v1/sources` が**期待どおりの公開データ件数**を返すかで判断してください（サンプルモードでも `health` は応答します）。

### ④ 🌐 Web（Cloudflare Pages）デプロイ

```bash
# Pages のビルド環境変数に設定:
# VITE_API_BASE_URL=https://api.pimm.mirai-dx-platform.com/api/v1
pnpm --filter @pimm/web build     # or: pnpm build（apps/web/dist を生成）
# 生成物 apps/web/dist/ を Cloudflare Pages へ配信（Pages プロジェクト設定に従う）
```

- 🔎 **検証**: 本番 URL を開き、地図表示・アセット検索・詳細表示が動作し、`/api/v1` への通信が本番 API を指すことを確認。
- 🌐 **本番URL**: `https://pimm.mirai-dx-platform.com`
- 💡 dev では Vite(:5173) が `/api` → `http://localhost:8787` を proxy しますが、これは開発専用です。

### ⑤ 🧪 Cloudflare 本番スモーク検証

```bash
# Cloudflare login / custom domain / DNS / API / Web / Access境界を厳格に確認
pnpm smoke:cloudflare

# DNS反映前またはwrangler未認証環境で、zone NS と手順だけを事前確認
pnpm smoke:cloudflare:preflight
```

- ✅ 厳格モードは `wrangler whoami`、`pimm.mirai-dx-platform.com` / `api.pimm.mirai-dx-platform.com` のDNS、`/api/v1/health`、`/api/v1/assets/summary`、管理APIの未認証拒否、Webアプリ shell を検証します。
- ⚠️ `pnpm smoke:cloudflare` が失敗する状態では、CTO/Supervisor は本番リリース完了を判定しません。

---

## 🔁 5. ロールバック手順

| 対象                | 手段               | 手順概要                                                                                                                                    |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚙️ Workers          | 直前デプロイへ戻す | Cloudflare ダッシュボード（Workers → Deployments）で直前バージョンへ Rollback、または直前コミットから再 `wrangler deploy --env production`  |
| 🌐 Pages            | 直前デプロイへ切替 | Pages のデプロイ履歴から直前デプロイを **Rollback / 本番昇格**                                                                              |
| 🗄️ DB               | **前方のみ**       | マイグレーションは前方専用（down なし）。破壊的変更はせず、**是正用の新規 `migrations/00NN_*.sql` を追加**して `pnpm db:migrate` で前進修正 |
| 🗄️ DB（データ復旧） | Neon の復元機能    | 誤取込・破損時は **Neon のブランチ作成 / PITR（Point-in-Time Restore）** で健全時点を復元し、接続文字列を切替                               |

- スキーマは「戻す」のではなく「新しいマイグレーションで直す」。`schema_migrations` の整合を崩さないこと。
- Neon PITR/ブランチ復元を行う場合、`DATABASE_URL`（Worker Secret）の向き先変更＝実質 API の切替になるため、切替後に §4③ の検証を再実施。

---

## 🚨 6. 障害対応

### 6.1 まず確認する順序

1. 🩺 `curl https://<api>/api/v1/health` → 応答するか（プロセス生存確認）
2. 📊 Workers Observability のログ（`wrangler.toml [observability] enabled=true`）
   - `wrangler tail` またはダッシュボードで**構造化 JSON ログ**を確認
   - 実在する `event`: **`request`**（アクセスログ: `request_id/method/path/status_code/duration_ms`）、**`unhandled_error`**（想定外例外）、**`sample_mode_fallback`**（DBフォールバック警告）
3. 🗄️ データ異常なら `/api/v1/assets/summary`・`/api/v1/sources` の件数を期待値と突合

### 6.2 症状別

| 症状                               | 想定原因                                                          | 対応                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 公開データが空/古い/明らかに少ない | `DATABASE_URL` 未設定/誤設定で **サンプルモードにフォールバック** | Worker Secret を再設定し `wrangler deploy --env production`。件数を再検証                 |
| 429 が多発                         | レート制限（in-isolate + 本番は Cloudflare WAF）                  | 正常な保護。恒常的なら `RATE_LIMIT_PER_MINUTE` / WAF ルールを調整                         |
| 5xx 増加                           | `unhandled_error` ログに詳細                                      | ログの `request_id` で追跡し原因修正 → 再デプロイ                                         |
| 取込失敗                           | 上流データ変化・品質チェック不合格                                | dry-run で再現・原因除去後、**同一ソースを `--publish` 再実行**（既存公開データは非破壊） |

> ⚠️ **サンプルモード転落の検知**: `DATABASE_URL` が未設定で `REQUIRE_DATABASE_URL` も無効な環境では、API はローカル開発用のサンプルモードで起動します。本番では `REQUIRE_DATABASE_URL=true` による fail-fast を必須とし、あわせて `/api/v1/assets/summary`・`/api/v1/sources` の件数突合で接続先と公開件数を確認してください。

---

## 📊 7. 運用（監視・棚卸し・公開停止）

### 7.1 監視項目

| 📈 指標       | 取得元                                              | 目安                 |
| ------------- | --------------------------------------------------- | -------------------- |
| 取込成功/失敗 | `pnpm ingest` の実行結果・品質レポート              | 失敗は都度対応       |
| データ鮮度    | 取込日時・`/api/v1/sources`                         | ソース更新周期に追随 |
| API 健全性    | `/api/v1/health` + `request`/`unhandled_error` ログ | 5xx・遅延を監視      |
| レート制限    | 429 発生状況（ログ）                                | 異常スパイクを監視   |

### 7.2 定期作業

- 🗓️ **月次棚卸し**: 公開ソースの一覧・鮮度・ライセンス状態を点検。
- 🔐 依存/シークレットスキャンの CI 結果を定期確認。

### 7.3 ライセンス変更時の公開停止

Cloudflare Access で `admin` 権限を持つ運用者が、システム設定から対象ソースを選択し、理由を入力して公開中資産を一括停止する。

- 🛑 該当ソースの**取込を停止**（`--publish` を流さない）
- 🖥️ WebUI: `システム設定` → `対象` でソース選択 → `一括公開停止理由` 入力 → `選択ソースの公開資産を一括停止`
- 🔌 API: `POST /api/v1/admin/sources/:slug/suspend-assets`
- 🧾 監査: 対象資産ごとに Q007 の品質issueを記録し、公開GET/APIから除外されることを確認

---

## ⚠️ 8. 既知の制約とリリース判断

| Issue       | 内容                                                        | 本番判断への影響                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🚀 #38      | Cloudflare custom domain / Access 本番スモーク未完了        | `pimm.mirai-dx-platform.com` / `api.pimm.mirai-dx-platform.com` のDNS、Cloudflare Access、公開API/Webを `pnpm smoke:cloudflare` で検証する。本番デプロイ直前の停止条件             |
| 🧪 #12      | E2E（Playwright）**公開地図の主要回帰を導入済み**           | `pnpm test:e2e` / CI `🗺️ Playwright E2E` で初期表示・検索・詳細表示・種別フィルタを検証。公開前は手動スモークテスト（§4④）も併用                                                   |
| 🗄️ #8       | `PostgresAssetRepository` の PostGIS 統合テストを CI に導入 | 読取経路の公開可視性・検索・bbox・`getAssetById` 契約は `🗄️ PostGIS integration` で検証。Neon dev branch を使った publish 一気通貫は #5/#16 で継続                                 |
| 🔄 #5 / #16 | Publish 経路の PostGIS 統合テストを CI に導入               | `📤 Publish PostGIS integration` で publish→公開Repository参照・監査ログ記録・rollback・同一自然キーへの並行 publish 回帰を検証。実 Neon への流し込みは本 runbook の手動手順で実施 |

### 🚦 リリース判断（Deploy Gate）

```text
✅ CI success（quality / secret-scan / dependency-scan）
✅ test/lint/type/build 全通過・error 0・Critical 脆弱性 0
✅ §3 チェックリスト充足・§4 の各検証合格
⚠️ #38 が未完了なら本番リリース直前で停止
──────────────────────────────
→ CTO/Supervisor は「Release Ready（本番デプロイ承認待ち）」まで判定。実デプロイは人間が §4 を手動実行。
```

> 🔐 **最終原則**: 本番デプロイ・シークレット投入・破壊的変更・データ削除/移行の確定は**人間の最終決断**。自動化はここまで。
