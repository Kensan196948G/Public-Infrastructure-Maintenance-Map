# 🗄️ バックアップ・復元・RPO/RTO（Backup & Restore）

> 📌 対象: Neon PostgreSQL `pimm-production`（PostGIS 有効）

## 📦 バックアップ方式

- Neon はプラットフォーム管理の **自動バックアップ（PITR: Point-in-Time Recovery）** を提供
- デフォルト保持期間: **7 日間**（Neon のプロジェクト設定による）
- バックアップは Neon 側で暗号化・管理され、ユーザー側の手動バックアップは不要

## 🎯 目標値（RPO / RTO）

| 指標 | 目標 | 現状 |
| --- | --- | --- |
| RPO | 15 分以内 | 要確認（Neon 設定値に依存） |
| RTO | 60 分以内（復元＋検証） | 要確認（手順は下記） |

> ⚠️ **2026-08-05 時点: Neon API からのバックアップ設定・復元試験は未実施**（API トークンでプロジェクト一覧が取得できない権限制約のため）。復元試験はユーザー対応後に実施する。

## 🔄 復元手順（Neon コンソール/API 操作）

1. Neon コンソールで `pimm-production` プロジェクトを開く
2. **Branches → Restore**（または PITR で任意の時点を選択）
3. 復元先ブランチ（例: `restore-<日付>`）を作成
4. 復元ブランチの接続文字列で `/api/v1/assets/summary` の件数・主要機能をスモーク
5. 問題なければ本番ブランチを復元結果へ切り替え（または接続文字列を差し替え）
6. API の `DATABASE_URL` Secret を更新し、`wrangler secret put` で反映
7. 復元後スモーク（`pnpm smoke:cloudflare`）を実行

## ⏪ Rollback（デプロイ単位）

| 対象 | 方法 |
| --- | --- |
| API | `wrangler rollback --env production`（直前バージョンへ） |
| Web | Pages の前回デプロイを再配信（要 Pages 権限） |
| DB schema | 未適用 migration の棚卸しと適用停止。データ変更は PITR 復元 |

## 🧪 復元試験（将来実施）

- 頻度: 四半期に 1 回
- 内容: 復元ブランチ作成 → 件数・スキーマ一致確認 → 破棄
- 証跡: `OPERATIONS_LEDGER.md` へ記録
