# Cloudflare Domain Approval PR

> 対象: `mirai-dx-platform.com`
> 目的: Public Infrastructure Maintenance Map の WebUI と API を Cloudflare の本番カスタムドメインへ安全に割り当てる。
> 承認方式: このPRのマージ判定 `Y` は、ここに記載した正確な範囲だけを承認したものとして扱う。

## 1. サブドメイン指定状況

| 項目 | 状態 | 判定 |
|---|---|---|
| リポジトリ内の既存指定 | `apps/api/wrangler.toml` に `routes` / `custom_domain` / `zone_name` なし | 未指定 |
| Cloudflare 実アカウント確認 | `wrangler whoami` が未認証で停止 | 未確認 |
| 公開DNSのzone確認 | `mirai-dx-platform.com` のNSは `kareem.ns.cloudflare.com` / `nia.ns.cloudflare.com` | Cloudflare委任済み |
| 公開DNSのサブドメイン確認 | `pimm.mirai-dx-platform.com` / `api.pimm.mirai-dx-platform.com` は未解決 | DNS反映前 |
| 今回のCTO指定 | WebUI: `pimm.mirai-dx-platform.com` / API: `api.pimm.mirai-dx-platform.com` | Approval対象 |

## 2. 正確な対象環境

| 区分 | 対象 |
|---|---|
| Cloudflare zone | `mirai-dx-platform.com` |
| WebUI | Cloudflare Pages project for `apps/web` |
| API | Cloudflare Workers script `pimm-api-production` |
| API route | `api.pimm.mirai-dx-platform.com` |
| Web custom domain | `pimm.mirai-dx-platform.com` |
| API base URL | `https://api.pimm.mirai-dx-platform.com/api/v1` |

## 3. 変更内容

1. `apps/api/wrangler.toml` に production env を追加する。
2. production Worker の custom domain を `api.pimm.mirai-dx-platform.com` に固定する。
3. production CORS origin を `https://pimm.mirai-dx-platform.com` に限定する。
4. Pages 側の custom domain と `VITE_API_BASE_URL` 設定を手順化する。

## 4. 実行予定コマンド

> secret値はプロンプト入力のみ。コマンドライン、ログ、Gitには出力しない。

```bash
# 事前確認
npx wrangler whoami
npx wrangler pages project list

# API secret 登録。本番では必須。
cd apps/api
npx wrangler secret put DATABASE_URL --env production
npx wrangler secret put REQUIRE_DATABASE_URL --env production
npx wrangler secret put CLOUDFLARE_ACCESS_AUD --env production
npx wrangler secret put ADMIN_EMAILS --env production
npx wrangler secret put REVIEWER_EMAILS --env production

# API dry-run
npx wrangler deploy --config wrangler.toml --env production --dry-run

# API deploy + custom domain作成
npx wrangler deploy --config wrangler.toml --env production

# Web build
cd ../..
VITE_API_BASE_URL=https://api.pimm.mirai-dx-platform.com/api/v1 pnpm --filter @pimm/web build
```

Cloudflare Pages は対象プロジェクトの設定で次を登録する。

| 設定 | 値 |
|---|---|
| Custom domain | `pimm.mirai-dx-platform.com` |
| Production branch | `main` |
| Build command | `pnpm --filter @pimm/web build` |
| Build output directory | `apps/web/dist` |
| Environment variable | `VITE_API_BASE_URL=https://api.pimm.mirai-dx-platform.com/api/v1` |

## 5. 影響範囲

| 項目 | 影響 |
|---|---|
| DNS | Cloudflare が custom domain 用レコード/証明書を管理する |
| API | `api.pimm.mirai-dx-platform.com` 全体が Worker に向く |
| WebUI | `pimm.mirai-dx-platform.com` が Pages production deployment に向く |
| CORS | production API は `pimm.mirai-dx-platform.com` からのブラウザアクセスに限定される |
| DB | migrationなし。Neon接続先は `DATABASE_URL` secret のみ |

## 6. Backup

1. 反映前に Cloudflare Workers の現行 deployment ID を記録する。
2. 反映前に Cloudflare Pages の現行 production deployment ID を記録する。
3. DNS records の現在値をスクリーンショットまたはエクスポートで保存する。
4. Neon の production branch / restore point を確認する。

## 7. Rollback

| 対象 | 手順 |
|---|---|
| Workers | Cloudflare Dashboard の Deployments から直前バージョンへ rollback、または直前コミットで `npx wrangler deploy --env production` |
| API custom domain | Worker の Domains & Routes から `api.pimm.mirai-dx-platform.com` を削除 |
| Pages | Pages Deployments から直前 production deployment に rollback |
| Web custom domain | Pages custom domain から `pimm.mirai-dx-platform.com` を解除 |
| DNS | 事前保存したDNS recordsへ戻す |

## 8. 成功条件

```bash
curl -fsS https://api.pimm.mirai-dx-platform.com/api/v1/health
curl -fsS https://api.pimm.mirai-dx-platform.com/api/v1/assets/summary
```

- API `/api/v1/health` が `status: ok` を返す。
- `/api/v1/assets/summary` が想定した本番公開データ件数を返す。
- `https://pimm.mirai-dx-platform.com` で地図、検索、詳細表示が動作する。
- ブラウザNetworkで API 呼び出し先が `https://api.pimm.mirai-dx-platform.com/api/v1` になっている。
- Workers logs に `sample_mode_fallback` が出ない。

## 9. 失敗時の停止条件

- `DATABASE_URL` / `REQUIRE_DATABASE_URL` 未設定で本番APIがサンプルモードへ落ちる。
- `/api/v1/assets/summary` が期待件数と一致しない。
- Cloudflare certificate validation が未完了のまま本番切替が進まない。
- 5xx または CORS error が継続する。
- Cloudflare Access 認証/管理APIの境界に想定外の許可が出る。

## 10. 監視方法

1. Workers Observability で `request`, `unhandled_error`, `sample_mode_fallback` を確認する。
2. Cloudflare Analytics で 4xx / 5xx / request volume を確認する。
3. Pages deployment status と custom domain status を確認する。
4. GitHub Actions の CI 結果を確認する。

## 11. 実行後の検証方法

1. API health と summary を curl で確認する。
2. WebUI を実ブラウザで開き、地図表示、検索、詳細表示を確認する。
3. 管理APIは Cloudflare Access 認証下で、許可メールのみが操作できることを確認する。
4. Workers logs に secret値、接続文字列、PII が出ていないことを確認する。
5. 必要なら本PRへ deployment evidence と smoke test 結果を追記する。
