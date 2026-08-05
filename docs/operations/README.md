# 🛠️ 運用ドキュメント（Operations Handbook）

> 📌 対象: Public Infrastructure Maintenance Map（公開インフラ維持管理マップ）
> 🧭 本ディレクトリは、本番運用に必要な監視・バックアップ・障害対応・定期点検・保守・権限管理の「単一の真実」です。

## 📂 文書一覧

| 文書 | 内容 | 一次読者 |
| --- | --- | --- |
| [MONITORING_SLO.md](./MONITORING_SLO.md) | SLI/SLO、アラート閾値、通知先、エスカレーション、一次対応担当 | 運用担当・監視担当 |
| [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | バックアップ方式、RPO/RTO、復元手順、復元試験状況 | 運用担当・DB担当 |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | 重大度分類、障害切り分け、連絡、rollback、復旧、データ訂正 | 全員（Pager/当番） |
| [OPERATIONS_LEDGER.md](./OPERATIONS_LEDGER.md) | 日次/週次/月次/四半期の点検項目・周期・担当・証跡 | 運用担当 |
| [MAINTENANCE.md](./MAINTENANCE.md) | 脆弱性・依存関係・EOL・ライセンス・証明書・Secrets 更新 | 保守担当 |
| [ACCESS_INVENTORY.md](./ACCESS_INVENTORY.md) | 管理者・サービスアカウント・DBロール・外部連携権限の棚卸し | 管理者・監査担当 |
| [RESOURCE_BUDGET.md](./RESOURCE_BUDGET.md) | 使用量・容量・レート制限・予算・課金アラート確認 | 管理者・経理担当 |

## 🎯 運用モデル

- 本番環境: Cloudflare Workers（API）+ Cloudflare Pages（Web）+ Neon PostgreSQL（DB）+ GitHub（CI/CD・週次取込）
- デプロイ: 原則 GitHub PR → main マージ後に手動/半自動デプロイ（詳細は [RELEASE_RUNBOOK.md](../RELEASE_RUNBOOK.md)）
- 変更管理: PR 必須・CI 緑・秘密スキャン通過後にマージ
- 障害時の基本行動: **切り分け → 影響範囲の把握 → 安全な状態への rollback → 原因修正 → 再発防止**

## 🗂️ 証跡保存

- 点検・障害・変更の証跡は GitHub Issue／PR／`docs/DECISION_LOG.md` へ記録する
- 本番操作ログは Cloudflare Workers Logs（Observability）と監査ログテーブル（`audit_logs`）に残る

## ⚠️ 現時点の既知ギャップ（2026-08-05 時点）

- Cloudflare API トークンに **Pages: Edit 権限がない**ため、Web の直接デプロイができない（要ユーザー対応）
- GitHub Actions Secrets（`DATABASE_URL`）が未設定のため、W05 週次取込ワークフローは未実行
- Neon バックアップの API 確認は権限制約により未実施（詳細は BACKUP_RESTORE.md）
- main ブランチ保護（必須レビュー・必須CI）未設定
