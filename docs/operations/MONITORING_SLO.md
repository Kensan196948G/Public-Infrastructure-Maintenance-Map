# 📊 監視・SLO・アラート（Monitoring & SLO）

> 📌 対象: 本番 API `api.pimm.mirai-dx-platform.com` / Web `pimm.mirai-dx-platform.com` / DB（Neon）

## 🎯 SLI / SLO（2026-08-05 策定・測定開始）

| SLI | 定義 | 目標（SLO） | 測定方法 |
| --- | --- | --- | --- |
| 可用性 | `/api/v1/health` が 5xx を返さない割合 | 30日間 99.9% | 外部スモーク＋Workers Logs |
| DB 可用性 | `/api/v1/health/ready` が 200 を返す割合 | 30日間 99.9% | 外部死活監視（推奨: 5 分間隔） |
| 応答時間 | `/api/v1/health`・`/api/v1/assets` の p95 | 3秒以内（GSI 連携を除く） | Workers Logs の `duration_ms` |
| エラー率 | 全 API リクエストに占める 5xx の割合 | 1% 未満 | Workers Logs |
| データ鮮度 | 毎時 Cron 取込の成功率 | 週 95% 以上（外部ソース障害除く） | Cron 実行ログ |
| 定期取込 | 各ソースの `fetched_at` が 24 時間以内 | 95% 以上 | `/api/v1/sources` |

> ⚠️ 本番 URL を外部から監視する定期ジョブ（Uptime Robot / Cloudflare Health Checks 等）は **未設定**。設定はユーザー対応事項。

## 🚨 アラート閾値（未配線・要通知先設定）

| レベル | 条件 | 対応 |
| --- | --- | --- |
| 🔴 Critical | API 5xx が 5 分間継続、または `/health` 不通 | 即時切り分け・rollback 判断（INCIDENT_RESPONSE.md） |
| 🟠 Warning | エラー率 1% 超過、Cron 取込失敗 2 回連続、`fetched_at` 24h 超過 | 原因調査・次回 Cron 監視 |
| 🟡 Info | 依存脆弱性 Critical/High 検出、Secret スキャン検出、Neon 容量 80% | 計画対応（MAINTENANCE.md） |

## 👤 通知先・エスカレーション（2026-08-05 時点）

| 役割 | 担当 | 通知手段 | 状態 |
| --- | --- | --- | --- |
| 一次対応 | プロジェクト管理者（Kensan196948G） | GitHub Issue／メール | 要設定 |
| エスカレーション | Cloudflare／Neon のサポート窓口 | 各ダッシュボード | 契約確認要 |

> ⚠️ 通知試験は未実施。Cloudflare アカウント所有者（kensan1969@gmail.com）へのメール通知と GitHub 連携の設定をユーザー対応事項とする。

## 🔭 監視の実施方法

### API
- Workers Observability（`wrangler.toml` `[observability] enabled = true`）が有効
- 死活・DB 監視は `/api/v1/health/ready` を 5 分間隔で監視（`database: unavailable` 時に 503 を返す）
- 実時間ログ: `npx wrangler tail --env production`（`apps/api` で実行）
- スモーク: `pnpm smoke:cloudflare`（本番 9 チェック）をデプロイ毎に実行

### Cron 取込
- 毎時 0 分に実行（`schedule: 0 * * * *`）
- 実行確認: `wrangler tail --env production` で `triggered_by=cron` のログを確認

### Web
- Pages プロジェクト `pimm-web` の custom domain 応答確認（現状は手動スモーク）

### DB
- Neon ダッシュボードで接続数・容量・レイテンシを確認（詳細: RESOURCE_BUDGET.md）

## 📈 月次レビュー
- 月 1 回、SLO 実績・エラー率・鮮度・容量を確認し、`OPERATIONS_LEDGER.md` へ記録
