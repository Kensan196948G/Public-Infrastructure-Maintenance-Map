# Cloudflare Access Approval PR（管理API本番開通）

> 対象: `api.pimm.mirai-dx-platform.com/api/v1/admin`
> 目的: Issue #38 — 管理APIを Cloudflare Access で本番開通し、フェイルクローズ状態（500）から認証付き運用へ移行する。
> 承認方式: このPRのマージ判定 `Y` は、ここに記載した正確な範囲だけを承認したものとして扱う。

## 1. 変更目的と必要性

管理API（取込記録・品質issue解決・公開停止など）は現在、`REQUIRE_ACCESS_JWT=true` かつ AUD / team domain 未設定のため**意図的にフェイルクローズ（500）**している（DL-008）。運用者が管理UIを使うには、Access アプリケーションの作成と Worker Secrets の登録が必要である。

## 2. 正確な対象環境

| リソース | 値 |
|---|---|
| Cloudflare account | `4f1e888469df7e0b896bb4e211b12633` |
| Zero Trust org（既存） | `winter-lake-f4c9.cloudflareaccess.com`（既存 9 アプリが稼働中の団体を再利用。新規 org 作成はしない） |
| 新規 Access アプリ | name `pimm-admin-api`、type `self_hosted`、domain `api.pimm.mirai-dx-platform.com/api/v1/admin` |
| Worker | `pimm-api-production`（`--env production` の Secrets のみ変更） |

## 3. 変更前後の状態

| | 変更前 | 変更後 |
|---|---|---|
| Access アプリ | なし | `pimm-admin-api`（admin パスのみ） |
| 管理API 未認証アクセス | 500（フェイルクローズ） | Access による 302/401 拒否 |
| 管理API 認証済みアクセス | 不可 | 許可メールのみ（JWT を Worker が再検証） |
| 公開API / WebUI | 影響なし | 影響なし（Access 対象外のまま） |

## 4. 実行予定操作

> Secrets 値・AUD はログ・PR・文書へ出力しない（パイプ登録のみ）。

1. `POST /accounts/{account}/access/apps` — `pimm-admin-api`（self_hosted、上記 domain、session 24h）を作成し、応答から `aud` を取得（表示しない）
2. `POST /accounts/{account}/access/apps/{id}/policies` — decision `allow`、include: email `ADMIN_EMAILS / REVIEWER_EMAILS と同一の運用者メール`
3. `wrangler secret put CLOUDFLARE_ACCESS_AUD --env production`（aud を非表示パイプで登録）
4. `wrangler secret put CLOUDFLARE_ACCESS_TEAM_DOMAIN --env production`（`winter-lake-f4c9.cloudflareaccess.com`）
5. 検証（§11）

## 5. 影響範囲と停止時間

管理API 経路のみ。公開API・WebUI・DB への影響なし。停止時間なし（Secrets 登録で新バージョンが即時有効化）。

## 6. security / data risk

- 設定不備時は現状と同じフェイルクローズへ倒れる（安全側）。
- Worker は AUD / iss / exp / 署名を自前検証するため、Access 側の誤設定だけでは管理APIは開かない（多層防御は PR #40 実装のまま）。
- 新規に外部公開される経路はない（ログイン画面が提示されるのみ）。

## 7. Backup / 退避

変更前状態は「アプリなし・Secrets 2 件未登録」。特別なバックアップは不要（§8 で完全復元可能）。

## 8. Rollback

1. Access アプリ `pimm-admin-api` を削除
2. `wrangler secret delete CLOUDFLARE_ACCESS_AUD --env production`
3. `wrangler secret delete CLOUDFLARE_ACCESS_TEAM_DOMAIN --env production`

→ 管理APIは従来のフェイルクローズ（500）へ戻る。公開機能への影響なし。

## 9. 成功条件

- 未認証の `GET /api/v1/admin/ingestions` が Access の 302/401 を返す
- `pnpm smoke:cloudflare` 全 PASS
- 公開 `/health` `/assets/summary` が変化しない
- 許可メールのブラウザログインで管理画面の一覧取得が成功（人手確認）

## 10. 自動停止条件

アプリ作成 API の失敗、aud 取得不能、Secrets 登録失敗、スモークで公開APIの劣化を検知した場合は中断し、§8 で復元して報告する。

## 11. 実行後の検証方法

`pnpm smoke:cloudflare`（admin 拒否が 500 → 302/401 へ変化することを確認）、公開APIの無変化確認、Workers ログの secret 露出なし確認。結果は Issue #38 へ記録する。

## 12. 担当と監査記録

実行: CTO代行（Claude Code）。監査記録: 本PR、Issue #38、DECISION_LOG。
