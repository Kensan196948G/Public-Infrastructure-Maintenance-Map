# 🔑 権限棚卸し（Access Inventory）

> 📌 2026-08-05 時点の棚卸し。四半期毎に見直す。

## 👤 アカウント

| 対象 | 識別子 | 権限 | 用途 | 見直し |
| --- | --- | --- | --- | --- |
| GitHub | `Kensan196948G` | repo / workflow | リポジトリ・CI・PR | 四半期 |
| Cloudflare | kensan1969@gmail.com（Account `4f1e8884...`） | Super Administrator（トークンは Workers 書込可・**Pages 書込不可・Health Checks 作成不可**） | 本番デプロイ | 四半期 |
| Neon | 対象プロジェクト `pimm-production` | DB 接続（`DATABASE_URL`） | 本番 DB | 四半期 |

## 🔑 Cloudflare API トークン

| トークン | 現在の権限 | 問題 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers 編集可・Pages 一覧可・Health Checks 読み取り可・**Pages 編集不可・Health Checks 作成不可** | ⚠️ Web デプロイ不可・Health Check 作成不可（Issue #77）。**「Cloudflare Pages: Edit」と「Zone > Health Checks: Edit」の追加が必要（ユーザー作業）** |

## 🗄️ DB ロール

- 本番 DB は接続文字列（`DATABASE_URL`）でアクセス。最小権限方針を適用し、不要ロールは Neon コンソールで削除する
- ⚠️ ロール詳細の確認は Neon API 権限不足のため未実施（ユーザー対応後に行う）

## 🔗 外部連携

| 連携先 | 用途 | 権限 | 状態 |
| --- | --- | --- | --- |
| GSI ジオコーダ | 住所検索（`/geocode`） | 公開 API（鍵なし） | ✅ 稼働 |
| 公開データソース（橋梁/道路/港湾/大阪/河川 W05） | 取込 | 公開データのみ | ✅ 4 ソース稼働、W05 は CI Secret 待ち |
| GitHub Actions | 週次取込・15 分間隔死活監視 | repo secrets | ⚠️ `DATABASE_URL` 未設定（Issue #77・`check-secret` ガードで明確化）。🔭 死活監視 workflow は 2026-08-12 から稼働 |

## ✅ 2026-08-12 追記

- main ブランチ保護を有効化（必須 CI 6 項目・必須レビュー 1・管理者も適用）
- API 本番デプロイ version `047bfd6a`・スモーク 9/9 PASS
- Web 再配信・`DATABASE_URL` 設定・Neon 復元試験・Access ブラウザ E2E は [Issue #77](https://github.com/Kensan196948G/Public-Infrastructure-Maintenance-Map/issues/77) で追跡

## 🧹 不要権限の除去方針

- 退任・役割変更時は 24 時間以内に関連アカウント・トークンを無効化
- 四半期毎に未使用トークン・未使用連携を棚卸しし、不要分を削除
- 権限変更は GitHub Issue に記録し、`docs/DECISION_LOG.md` へ追記
