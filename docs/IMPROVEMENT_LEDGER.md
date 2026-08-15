# 📒 改善台帳（Improvement Ledger）

> ラウンド: 2026-08-12 総合評価・改善（評価日基準: origin/main `45686dc`）
> 追記: 2026-08-15 監査イベント基盤＋フィードバック受付＋アダプター拡張基盤＋取込差分（PR #80/#84）

## ✅ 実装済み（2026-08-15 ラウンド）

| ID | 分類 | 改善 | 状態 | 検証証跡 | 影響範囲 |
| --- | --- | --- | --- | --- | --- |
| IMP-023 | 監査 | append-only 監査イベントテーブル（`audit_events`）＋ UPDATE/DELETE 禁止トリガー | ✅ 実装・テスト済み | migration 0003、PostGIS integration で append-only と契約を検証 | DB・管理API・監査ログ画面 |
| IMP-024 | 監査 | SHA-256 ハッシュチェーン（Web Crypto・キーソート正規化・ウィンドウ内整合性検証） | ✅ 実装・テスト済み | contracts 46/46（チェーン改ざん・欠落検知 5 件）、repository contract（InMemory/Postgres 共通） | contracts・database |
| IMP-025 | 監査 | `GET /api/v1/admin/audit-events`（最新N件＋整合性フラグ）と監査ログ画面の監査イベント表示 | ✅ 実装・テスト済み | api 93/93・web 130/130・E2E 7/7 | API・Web UI |
| IMP-026 | フィードバック | `POST /api/v1/feedback`（レート制限・1000字上限）で一般利用者の報告を受付 | ✅ 実装・テスト済み | api 93/93（正常 202・不正 400）・E2E で送信→受付表示 | 公開API・FeedbackDialog |
| IMP-027 | フィードバック | `feedback_reports` テーブル＋`/admin/feedback-reports`（一覧・品質issue化/却下） | ✅ 実装・テスト済み | migration 0004、repository contract、api 93/93、監査ログ画面のフィードバック管理 | DB・管理API・Web UI |
| IMP-028 | ダミーデータ | サンプルモードへ監査イベント（正しいハッシュチェーン）とフィードバック報告（open/converted/dismissed）をシード | ✅ 実装・テスト済み | seed 44/44（チェーン整合・3ステータス検証） | source-adapters seed |
| IMP-029 | CI/E2E | Playwright dev server のポートを `E2E_API_PORT`/`E2E_WEB_PORT` で上書き可能にし、Vite proxy ターゲットを `VITE_DEV_API_TARGET` で指定可能に | ✅ 実装・E2E 7/7 PASS | ローカル E2E（別ポート）で全 PASS。CI は既定ポートのため影響なし | playwright.config・vite.config |
| IMP-030 | 拡張基盤 | アダプター追加ガイド・ライセンスチェックリスト・fleet不変条件テスト（Issue #55） | ✅ 実装・テスト済み | source-adapters 50/50・CI | docs・registry 検証 |
| IMP-031 | 取込差分 | `GET /admin/ingestions/diff`＋監査ログ画面の差分UI（Issue #53） | ✅ 実装・テスト済み | api 89/89・web 124/124・PostGIS 75/75・E2E 5/5 | API・管理UI |

## ✅ 実装済み（2026-08-12 ラウンド）

| ID | 分類 | 改善 | 状態 | 検証証跡 | 影響範囲 |
| --- | --- | --- | --- | --- | --- |
| IMP-001 | 監視 | `/api/v1/health/ready`（DB readiness）追加 | ✅ 実装・テスト済み | API テスト 86/86・repository contract・PostGIS integration（CI） | API・契約・OpenAPI・監視手順 |
| IMP-002 | 監視/CI | W05 ワークフローへ `DATABASE_URL` ガード job 追加 | ✅ 実装（CI は PR で検証） | `.github/workflows/w05-scheduled-ingest.yml` | 週次取込の失敗を 1 ジョブで明示 |
| IMP-003 | アクセシビリティ | Modal フォーカストラップ・Escape・フォーカス復元 | ✅ 実装・テスト済み | Modal.test.tsx 3 件（web 122/122 PASS） | Web UI |
| IMP-004 | 性能 | ダイアログ遅延読込・react/maplibre vendor chunk 分割 | ✅ 実装・ビルド確認 | `vite build` で main 401KB・ダイアログ別 chunk 生成 | Web 初回読み込み |
| IMP-005 | 文書 | 評価書・改善台帳・AI 設計・ロードマップ作成、監視/W05/README/DECISION_LOG 更新 | ✅ 実装 | 本 PR の docs 差分 | 運用・監査・再開 |
| IMP-006 | セキュリティ | `js-yaml` 4.3.1・`nanoid` 3.3.17 へ override 更新（GHSA-5p4m-2wfm-xmqj / GHSA-2v37-7h3g-55p8） | ✅ 実装 | pnpm-lock.yaml 更新・CI dependency scan | 依存ツールチェーン |
| IMP-007 | CI/保守 | GitHub Actions を最新化（checkout v5・setup-node v5・pnpm v6・gitleaks v3・osv-scanner v2.5）、未使用 zod 依存を削除、node.ts の `PORT` 対応 | ✅ 実装 | CI 全ジョブ PASS（PR #75 最終コミット） | CI・開発環境 |
| IMP-008 | 監視 | 15 分間隔の本番死活監視ワークフロー追加・スモークに `/health/ready` チェック追加（10 チェック化・`--monitor` 対応） | ✅ 実装 | 本番スモーク 9/9→10 チェック・定期ワークフロー PR | 監視・障害検知 |
| IMP-009 | 運用 | 承認後の本番運用化: PR #75/#76 マージ・API デプロイ（`047bfd6a`）・スモーク 9/9・ブランチ保護有効化・残対応を Issue #77 化 | ✅ 実施 | GitHub 状態（PR merged・protection enabled）・本番スモーク PASS | 本番運用 |

## ⏳ 未実装（優先順・Issue 連携）

| ID | 分類 | 改善 | 依存/理由 | 対応期限 |
| --- | --- | --- | --- | --- |
| IMP-010 | 運用 | GitHub Actions `DATABASE_URL` 設定 | ユーザー操作（Secret 値の投入） | 至急 |
| IMP-011 | 運用 | ブランチ保護（必須 CI・必須レビュー） | ユーザー操作（リポジトリ設定） | 至急 |
| IMP-012 | 運用 | Cloudflare Pages: Edit 権限・Web 再配信 | ユーザー操作（トークン権限） | 至急 |
| IMP-013 | 監視 | 外部死活監視＋通知（`/health/ready` 利用） | 通知先・アカウント | 3 か月以内 |
| IMP-014 | 可用性 | Neon PITR 復元試験 | Neon API 権限 | 3 か月以内 |
| IMP-015 | 検証 | Cloudflare Access 実認証管理 E2E | Issue #38 | 3 か月以内 |
| IMP-020 | 機能 | W05 残 44 県投入 | Secret 設定後 | 3 か月以内 |
| IMP-021 | 機能 | PWA/オフライン・PDF/Excel | 設計 | 6〜12 か月 |
| IMP-022 | AI | AI_DESIGN.md の実装 | Phase 3 | 将来 |

> 📌 IMP-016（監査ハッシュチェーン）・IMP-017（取込差分）・IMP-018（フィードバック→品質issue）・IMP-019（アダプター追加基盤）は 2026-08-15 ラウンドで実装済みのため、未実装表から削除した（実装詳細は IMP-023〜IMP-031 を参照）。残作業（監査の保持期間・エクスポート、フィードバックの Turnstile 等スパム対策）は Issue #48 / #54 のコメントで追跡する。

## 🔬 テスト証跡（2026-08-15 ラウンド）

| 検証 | 結果 |
| --- | --- |
| `pnpm typecheck` | ✅ 6 パッケージ全 PASS |
| `pnpm --filter @pimm/contracts test` | ✅ 46/46（ハッシュチェーン検証 5 件・feedback スキーマ 4 件含む） |
| `pnpm --filter @pimm/database test` | ✅ 51/51（PostGIS 統合は CI で実行） |
| `pnpm --filter @pimm/api test` | ✅ 93/93（audit-events / feedback エンドポイント含む） |
| `pnpm --filter @pimm/web test` | ✅ 130/130（FeedbackDialog 送信・AuditLogDialog 監査/フィードバック含む） |
| `pnpm --filter @pimm/source-adapters test` | ✅ 44/44（seed チェーン整合・3 ステータス含む） |
| PostGIS integration（CI） | ✅ 21/21＋publish 3/3（migration 0003/0004 適用含む） |
| `pnpm test:e2e` | ✅ 7/7（フィードバック送信・監査イベント表示含む） |
| `pnpm build` | ✅ Web/API ビルド成功 |
| `pnpm lint` | ✅ 0 件 |
| CI（PR #80） | ✅ 全ジョブ成功（quality/E2E/PostGIS/publish/secret/dependency） |

## 🔬 テスト証跡（2026-08-12 ラウンド）

| 検証 | 結果 |
| --- | --- |
| `pnpm typecheck` | ✅ 6 パッケージ全 PASS |
| `pnpm --filter @pimm/contracts test` | ✅ 37/37 |
| `pnpm --filter @pimm/database test` | ✅ 49/49（PostGIS 統合は CI で実行） |
| `pnpm --filter @pimm/api test` | ✅ 86/86（health/ready 2 件含む） |
| `pnpm --filter @pimm/web test` | ✅ 122/122（Modal 3 件含む） |
| `pnpm build` | ✅ Web/API ビルド成功（chunk 分割確認） |
| `pnpm lint` | ✅ 0 件 |
| CI（PR #75） | ✅ 全ジョブ成功 |

> 既存ユーザー変更（CLAUDE.md 群・未コミット設定ファイル）は commit 対象外とし保護した。
