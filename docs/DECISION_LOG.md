# Decision Log

このファイルは、CTO代行/Supervisor判断で置いた暫定前提・技術判断・運用判断を記録する。
secret、credential、connection string、PII は記載しない。

## 2026-07-19

### DL-001: 管理APIの認証境界

- 判断: 管理APIは Cloudflare Access を外側の認証境界とし、アプリ側では `ADMIN_EMAILS` / `REVIEWER_EMAILS` のサーバ側 allowlist だけでロールを解決する。
- 理由: クライアント supplied role header を信頼しないことで、公開APIと管理APIの境界を単純かつ検証可能にするため。
- 影響: 管理GETは `admin` / `reviewer`、書込系は原則 `admin` に限定する。
- 検証: API test で未認証 401、allowlist外 403、client supplied role header 不信頼を確認。
- Rollback: 管理API route を revert し、公開GET APIのみの運用へ戻す。

### DL-002: Issue #4 の段階的PR分割

- 判断: Issue #4 は一括PRではなく、管理一覧、ソース登録/編集、ソース単位公開停止、Cloudflare domain approval に分割する。
- 理由: 認証・DB・WebUI・DNS/route設定が混在するため、小さく可逆的なPR単位に分ける方がレビューとrollbackが明確になるため。
- 影響: 推奨merge順は `#34 -> #36 -> #37 -> #35` とする。
- 検証: 各PRで format / lint / typecheck / test / build / E2E / PostGIS integration / secret scan / dependency scan を個別確認する。
- Rollback: 影響したPR単位で revert する。

### DL-003: ライセンス変更時のソース単位公開停止

- 判断: ライセンス変更時は、個別資産停止だけでなく `POST /api/v1/admin/sources/:slug/suspend-assets` によるソース単位停止を提供する。
- 理由: FR-14 はライセンス変更時の公開停止制御であり、個別資産操作だけでは運用負荷と漏れのリスクが残るため。
- 影響: 公開GET対象、つまり `publication_status='published'` かつ hidden品質ではない同一source資産を `suspended` に更新し、対象ごとに Q007 quality issue を記録する。
- 検証: API test、repository contract、SettingsDialog test、Playwright E2E、CI PostGIS integration で確認する。
- Rollback: PR #37 を revert する。すでに本番で一括停止を実行済みの場合、再公開は監査付きApproval PRで扱う。

### DL-004: Cloudflare本番ドメイン設定の扱い

- 判断: `mirai-dx-platform.com` 配下の本番ドメイン設定は Approval PR として分離し、通常機能PRとは別に扱う。
- 暫定サブドメイン: WebUI は `pimm.mirai-dx-platform.com`、API は `api.pimm.mirai-dx-platform.com`。
- 理由: custom domain / production route / DNS は高リスク変更であり、実行コマンド・backup・rollback・停止条件を事前に固定する必要があるため。
- 影響: Cloudflare CLI/アカウント接続が確認できるまで、実DNS変更・production route変更は行わない。
- 検証: Approval PR の CI と dry-run 相当確認まで。実Cloudflare上の存在確認は認証接続後に実施する。
- Rollback: Approval PR に記載した route/domain削除と前設定復元手順に従う。

### DL-005: Cloudflare本番スモークをRelease Gateへ追加

- 判断: 本番デプロイ完了判定は、`pnpm smoke:cloudflare` による custom domain / DNS / API / Web / 管理API未認証拒否の確認後に限定する。
- 理由: `mirai-dx-platform.com` はCloudflare NSへ委任済みだが、`pimm.mirai-dx-platform.com` と `api.pimm.mirai-dx-platform.com` は本番反映前に未解決であり、DNS・Access・公開経路の実証をRelease Gateへ明示する必要があるため。
- 影響: 本番前の未完了作業は Issue #38 に集約し、Cloudflare認証・DNS反映・本番スモークの結果を同Issueへ記録する。
- 検証: 認証/DNS反映前は `pnpm smoke:cloudflare:preflight`、反映後は `pnpm smoke:cloudflare` を使用する。
- Rollback: スモーク検証ツールは削除またはPR単位でrevert可能。本番route/domainのrollbackは Cloudflare Domain Approval PR の手順に従う。

## 2026-07-23

### DL-006: Issue #42 本番前ハードニングの実施範囲

- 判断: M-2 は API の既定 `ALLOWED_ORIGIN` を `"*"` からローカル Vite オリジン `http://localhost:5173` へ変更（`config.ts` 既定値と `wrangler.toml` 既定 `[vars]` の両方）。M-3 は `PostgresAssetPublisher` の publish 失敗ログを `error.name` / `error.message` のみに制限し、回帰テストで固定。L-1 は本番ビルドの `sourcemap` を `false` に変更（`hidden` ではなく生成自体を止め、Pages 配信物から `.map` を排除）。
- 理由: 本番 env は固定オリジンを宣言済みのため、既定値の到達経路は `--env production` 忘れの事故デプロイのみ。事故時の露出面を最小化する fail-safe 化が目的。M-3 は Neon ドライバエラーの追加プロパティ（host / db / user）が observability ログへ落ちる経路の遮断。
- 影響: ローカル開発は Vite proxy（同一オリジン）経由のため既定値変更の影響なし。公開 API を第三者サイトから直接 fetch する用途は本番オリジン設定に従う（従来から production は固定済み）。
- 検証: `packages/database/test/publish-error-logging.test.ts` で接続情報がログへ出ないことを回帰テスト化。既存の unit / integration / E2E は全 PASS。
- Rollback: 本PRの該当コミットを revert する。

### DL-007: Issue #41（レート制限の共有カウンタ化）は初回リリースでは対応しない

- 判断: in-isolate レート制限のまま初回リリースする。Durable Object / KV 共有カウンタへの移行、または Cloudflare Rate Limiting ルールの IaC 化は、リリース後の課題として Issue #41 で継続する。
- 理由: 公開 API は読み取り専用の公開データであり、DoS 対策の実効的な防御層は Cloudflare の edge（WAF / DDoS protection）が担う設計を README の既知の制約に明記済み。初回リリースの blocker ではない。
- 影響: 分散実行時の実効上限は isolate 数に比例して緩む（既知の制約として文書化済み）。
- 検証: リリース後に実トラフィックの error rate / latency を監視し、必要になった時点で #41 を実施する。
- Rollback: 該当なし（現状維持の判断）。

### DL-008: 初回本番リリースの実行範囲と管理APIの扱い

- 判断: 初回リリースは (1) Neon project 新規作成（Tokyo リージョン優先、不可なら最寄り）+ `migrations/0001`・`0002` 適用、(2) 実データ 4 ソース（`bridge-kumamoto` / `road-n13` / `facility-osaka-park` / `facility-osaka-toilet`）の `ingest --publish`、(3) Workers（`pimm-api-production`）と Pages の本番デプロイ + custom domain、(4) `pnpm smoke:cloudflare` による検証、で構成する。Cloudflare Access アプリケーションの新規作成は範囲外とする。
- 理由: Access アプリ作成はダッシュボード操作を要する高リスク変更（§17）であり、未作成でも `REQUIRE_ACCESS_JWT=true` により管理APIはフェイルクローズ（500）で閉じたまま公開機能に影響しない。公開データの提供という初回リリースの目的を、承認範囲を最小に保ったまま達成できる。
- 影響: 初回リリース時点では管理APIおよび管理UIは利用不可（意図的にフェイルクローズ）。Access 認証込みの管理経路の開通は Issue #38 で追跡する。
- 検証: デプロイ後スモークで管理APIが未認証拒否（4xx/5xx）を返すことを確認する。
- Rollback: Workers / Pages は直前デプロイへの rollback、DB は forward-only（是正 migration 追加）+ Neon PITR。
