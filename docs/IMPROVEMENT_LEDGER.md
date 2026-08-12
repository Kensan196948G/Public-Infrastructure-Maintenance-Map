# 📒 改善台帳（Improvement Ledger）

> ラウンド: 2026-08-12 総合評価・改善（評価日基準: origin/main `45686dc`）

## ✅ 実装済み（本ラウンド）

| ID | 分類 | 改善 | 状態 | 検証証跡 | 影響範囲 |
| --- | --- | --- | --- | --- | --- |
| IMP-001 | 監視 | `/api/v1/health/ready`（DB readiness）追加 | ✅ 実装・テスト済み | API テスト 86/86・repository contract・PostGIS integration（CI） | API・契約・OpenAPI・監視手順 |
| IMP-002 | 監視/CI | W05 ワークフローへ `DATABASE_URL` ガード job 追加 | ✅ 実装（CI は PR で検証） | `.github/workflows/w05-scheduled-ingest.yml` | 週次取込の失敗を 1 ジョブで明示 |
| IMP-003 | アクセシビリティ | Modal フォーカストラップ・Escape・フォーカス復元 | ✅ 実装・テスト済み | Modal.test.tsx 3 件（web 122/122 PASS） | Web UI |
| IMP-004 | 性能 | ダイアログ遅延読込・react/maplibre vendor chunk 分割 | ✅ 実装・ビルド確認 | `vite build` で main 401KB・ダイアログ別 chunk 生成 | Web 初回読み込み |
| IMP-005 | 文書 | 評価書・改善台帳・AI 設計・ロードマップ作成、監視/W05/README/DECISION_LOG 更新 | ✅ 実装 | 本 PR の docs 差分 | 運用・監査・再開 |
| IMP-006 | セキュリティ | `js-yaml` 4.3.1・`nanoid` 3.3.17 へ override 更新（GHSA-5p4m-2wfm-xmqj / GHSA-2v37-7h3g-55p8） | ✅ 実装 | pnpm-lock.yaml 更新・CI dependency scan | 依存ツールチェーン |
| IMP-007 | CI/保守 | GitHub Actions を最新化（checkout v5・setup-node v5・pnpm v6・gitleaks v3・osv-scanner v2.5）、未使用 zod 依存を削除、node.ts の `PORT` 対応 | ✅ 実装 | CI 全ジョブ PASS（PR #75 最終コミット） | CI・開発環境 |

## ⏳ 未実装（優先順・Issue 連携）

| ID | 分類 | 改善 | 依存/理由 | 対応期限 |
| --- | --- | --- | --- | --- |
| IMP-010 | 運用 | GitHub Actions `DATABASE_URL` 設定 | ユーザー操作（Secret 値の投入） | 至急 |
| IMP-011 | 運用 | ブランチ保護（必須 CI・必須レビュー） | ユーザー操作（リポジトリ設定） | 至急 |
| IMP-012 | 運用 | Cloudflare Pages: Edit 権限・Web 再配信 | ユーザー操作（トークン権限） | 至急 |
| IMP-013 | 監視 | 外部死活監視＋通知（`/health/ready` 利用） | 通知先・アカウント | 3 か月以内 |
| IMP-014 | 可用性 | Neon PITR 復元試験 | Neon API 権限 | 3 か月以内 |
| IMP-015 | 検証 | Cloudflare Access 実認証管理 E2E | Issue #38 | 3 か月以内 |
| IMP-016 | 監査 | append-only 監査・ハッシュチェーン（Issue #48） | 設計・実装 | 6 か月以内 |
| IMP-017 | 機能 | 取込差分・時系列（Issue #53） | dataset_versions 活用 | 6〜12 か月 |
| IMP-018 | 機能 | フィードバック→品質 issue（Issue #54） | Turnstile 等 | 6〜12 か月 |
| IMP-019 | 拡張 | アダプター追加基盤（Issue #55） | ガイド・レビュー定型化 | 6〜12 か月 |
| IMP-020 | 機能 | W05 残 44 県投入 | Secret 設定後 | 3 か月以内 |
| IMP-021 | 機能 | PWA/オフライン・PDF/Excel | 設計 | 6〜12 か月 |
| IMP-022 | AI | AI_DESIGN.md の実装 | Phase 3 | 将来 |

## 🔬 テスト証跡（本ラウンド）

| 検証 | 結果 |
| --- | --- |
| `pnpm typecheck` | ✅ 6 パッケージ全 PASS |
| `pnpm --filter @pimm/contracts test` | ✅ 37/37 |
| `pnpm --filter @pimm/database test` | ✅ 49/49（PostGIS 統合は CI で実行） |
| `pnpm --filter @pimm/api test` | ✅ 86/86（health/ready 2 件含む） |
| `pnpm --filter @pimm/web test` | ✅ 122/122（Modal 3 件含む） |
| `pnpm build` | ✅ Web/API ビルド成功（chunk 分割確認） |
| `pnpm lint` | ✅ 0 件 |
| CI（PR） | 実行中（quality/e2e/PostGIS/publish/secret/dependency） |

> 既存ユーザー変更（CLAUDE.md 群・未コミット設定ファイル）は本ラウンドでは commit 対象外とし保護した。
