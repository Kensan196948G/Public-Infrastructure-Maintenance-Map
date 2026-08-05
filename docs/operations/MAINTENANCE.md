# 🔧 保守・更新・ローテーション手順（Maintenance）

## 🔐 シークレット管理（2026-08-05 棚卸し）

| Secret | 保管場所 | 用途 | ローテーション周期 | 担当 |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Worker Secret `pimm-api-production` | Neon 接続 | 年1回・漏えい時即時 | 管理者 |
| `CLOUDFLARE_ACCESS_AUD` | Worker Secret | Access JWT aud 検証 | Access アプリ変更時 | 管理者 |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | Worker Secret | JWKS 取得元 | チーム変更時 | 管理者 |
| `ADMIN_EMAILS` / `REVIEWER_EMAILS` | Worker Secret | 管理APIロール | 人事変更時 | 管理者 |
| `NEON_API_KEY` | ローカル/CI 用 | Neon API 操作 | 年1回 | 管理者 |
| GitHub Actions Secret `DATABASE_URL` | GitHub リポジトリ | W05 週次取込 | 年1回 | 管理者（**未設定**） |

> ⚠️ Secrets の値は画面・ログ・PR・commit に出力しない。ローテーション時は各ダッシュボードで再発行し、影響範囲（Worker・CI・ローカル）を確認してから差し替える。

## 🔁 ローテーション手順（概要）

1. 対象 Secret の利用箇所を棚卸し（Worker Secret／GitHub Actions／ローカル）
2. 新値を発行（Neon は接続文字列再発行、Cloudflare はトークン再作成）
3. 旧値の更新を順に実施: 本番 Worker → CI → ローカル
4. 全経路の動作確認（API スモーク・CI 緑）
5. 旧値を無効化し、`docs/DECISION_LOG.md` と本ファイルへ記録

## 📦 依存関係・脆弱性管理

- PR 毎に CI が実行: `gitleaks`（Secret スキャン）＋ `osv-scanner`（依存脆弱性）
- Critical / High は原則リリース前に解消。やむを得ない場合は Issue 化して期限を設定
- `pnpm audit` と `pnpm outdated` を月次で確認（自動化は将来）
- Node.js は `package.json` engines（>=22）・pnpm 10.34.5 固定。EOL 確認は Node リリースカレンダーで実施

## 🪪 証明書・ドメイン・ライセンス

| 対象 | 現状 | 管理方法 | 担当 |
| --- | --- | --- | --- |
| TLS 証明書 | Cloudflare 自動管理（Universal SSL） | 有効期限管理は Cloudflare が自動更新 | 管理者 |
| ドメイン `mirai-dx-platform.com` | Cloudflare zone 管理 | 更新期限はレジストラ側で確認 | 管理者 |
| データソースライセンス | ソース単位で `license` カラム管理 | 取込時に再確認 | データ担当 |
| OSS ライセンス | 依存パッケージ | 月次棚卸し（初回 2026-08 末） | 保守担当 |

## ⏳ EOL 管理

- ランタイム・主要依存（Node.js、Cloudflare 互換日、Neon、React）の EOL を四半期に確認
- EOL 到達前 1 ヶ月以内にアップグレード Issue を作成
