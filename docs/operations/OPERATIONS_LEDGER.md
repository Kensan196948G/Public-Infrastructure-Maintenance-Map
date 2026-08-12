# 📋 運用台帳（Operations Ledger）

> 📌 定期的な点検・作業の「何を・いつ・誰が・どう記録するか」を一元管理する。
> ⚠️ 将来実施予定の作業を実施済みと記録しない。実績は「実施日＋結果」を追記する。

## 📅 点検項目

### 日次

| 項目 | 手順 | 判定基準 | 担当 | 証跡 | 状態（2026-08-05） |
| --- | --- | --- | --- | --- | --- |
| API 稼働 | `pnpm smoke:cloudflare` または curl `/health`・`/health/ready` | 200 / ok / ready | 管理者 | GitHub Actions `production-smoke.yml` | ✅ 2026-08-12 スモーク 9/9＋10 チェック化・15 分間隔自動監視開始 |
| Cron 取込 | `wrangler tail` で毎時ログ確認（自動化推奨） | エラー 0 | 管理者 | 本ファイル | 🟡 API 死活は自動監視。取込ログの自動集計は未設定・手動確認 |

### 週次

| 項目 | 手順 | 判定基準 | 担当 | 証跡 | 状態 |
| --- | --- | --- | --- | --- | --- |
| W05 河川取込 | GitHub Actions `w05-scheduled-ingest.yml`（日曜 01:00 JST） | run success | 管理者 | GitHub Actions | 🔴 `DATABASE_URL` Secret 未設定のため未実行（Issue #77・`check-secret` ガードで明確化済み） |
| データ鮮度 | `/api/v1/sources` で `fetched_at` 確認 | 24h 以内 95% | 管理者 | 本ファイル | ⚠️ 初回集計未実施 |
| エラー率・SLO | Workers Logs 集計 | 5xx < 1% | 管理者 | 本ファイル | ⚠️ 自動集計未設定 |

### 月次

| 項目 | 手順 | 判定基準 | 担当 | 証跡 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 依存脆弱性 | GitHub Security / `pnpm audit` / CI スキャン | Critical/High 0（例外承認あり） | 保守担当 | GitHub | ⚠️ 定期実行の自動化未設定（CI は PR 毎に実行済） |
| ライセンス | 依存ライセンス棚卸し | 問題 0 | 保守担当 | 本ファイル | ⚠️ 未実施（初回は 2026-08 月末） |
| 容量・課金 | Neon / Cloudflare ダッシュボード | 80% 未満・予算内 | 管理者 | 本ファイル | ⚠️ 初回集計未実施 |
| 証明書・ドメイン | Cloudflare ダッシュボード | 期限 30 日以上 | 管理者 | 本ファイル | ✅ 自動管理（Cloudflare が更新） |

### 四半期

| 項目 | 手順 | 判定基準 | 担当 | 証跡 | 状態 |
| --- | --- | --- | --- | --- | --- |
| DB 復元試験 | BACKUP_RESTORE.md の手順 | 件数・スキーマ一致 | DB 担当 | 本ファイル | ⚠️ 未実施（要 Neon 権限） |
| 権限棚卸し | ACCESS_INVENTORY.md の一覧更新 | 不要権限 0 | 管理者 | 本ファイル | ⚠️ 初回棚卸しは 2026-10 予定 |
| Secrets ローテーション | MAINTENANCE.md の手順 | 全 Secrets 更新 | 管理者 | 本ファイル | ⚠️ 初回は 2026-10 予定 |
| SLO レビュー | 月次実績の四半期集計 | SLO 達成 | 管理者 | 本ファイル | ⚠️ 未実施 |

## 🗂️ 証跡保存先

- 点検結果: `docs/operations/OPERATIONS_LEDGER.md` へ日付付きで追記
- 障害・変更: GitHub Issue / PR / `docs/DECISION_LOG.md`
- 自動化設定: 設定ファイル（`.github/workflows/`、`apps/api/wrangler.toml`）

## 🛠️ 自動化可能な項目（将来）

- Cron 実行監視とエラー通知（Workers Logs + 通知 API）
- 外部 URL 死活監視（Cloudflare Health Checks / Uptime 系）
- 週次鮮度・エラー率レポート（GitHub Actions）
