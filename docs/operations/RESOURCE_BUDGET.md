# 💰 リソース・予算・課金アラート

## 📈 確認項目（2026-08-05 時点）

| 項目 | 確認先 | 基準 | 状態 |
| --- | --- | --- | --- |
| Workers リクエスト数 | Cloudflare ダッシュボード | 月間プラン内 | ⚠️ 初回集計未実施 |
| Pages ビルド・帯域 | Cloudflare ダッシュボード | 月間プラン内 | ⚠️ 初回集計未実施 |
| Neon 容量・接続数 | Neon ダッシュボード | 80% 未満 | ⚠️ 初回集計未実施 |
| zone レート制限ルール | `infra/cloudflare/http-ratelimit.entrypoint.json` | 20 req/10s per IP | ✅ 適用済み・429 実測済み |
| 課金アラート | Cloudflare／Neon の通知設定 | 予算 80% で通知 | ⚠️ 未設定（ユーザー作業） |

## 💱 推奨アラート設定（ユーザー作業）

- Cloudflare: 月間請求額が予算の 80% / 100% に達したらメール通知
- Neon: プロジェクト容量 80% で警告、95% でアラート
- GitHub: Actions 分使用量の通知設定

## 📋 月次確認

- 各ダッシュボードの使用量・料金を確認し、`OPERATIONS_LEDGER.md` へ記録
- レート制限ヒット（429）が増えた場合は `RATE_LIMIT_PER_MINUTE` と zone ルールを調整
