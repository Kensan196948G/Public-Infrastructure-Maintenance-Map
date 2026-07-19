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
