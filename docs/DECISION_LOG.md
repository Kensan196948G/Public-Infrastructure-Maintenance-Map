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

### DL-009: Issue #41 は edge Rate Limiting ルールの IaC 化で対応する

- 判断: 共有レート制限は Durable Object カウンタではなく、zone の `http_ratelimit` フェーズへの Rate Limiting ルール（`infra/cloudflare/http-ratelimit.entrypoint.json` + `scripts/tools/cloudflare-rate-limit.mjs`）で実現する。Free プラン制約（period / mitigation 10 秒固定）に合わせ、既存ポリシー 120 req/分 を 20 req/10s per IP へ等価変換する。
- 理由: Worker コード無変更でランタイムリスクとリクエスト単価増（DO 経由の追加サブリクエスト）を避けられ、ルールがリポジトリでレビュー可能な IaC になるため。in-isolate カウンタは多層防御の内側として維持する。
- 影響: 実際の zone への適用（`--apply`）は本番 WAF 変更のため承認範囲内でのみ実行する。**現行の CLOUDFLARE_API_TOKEN には Zone WAF（Rulesets）権限が無く適用は保留**（2026-07-23 実測で Authentication error）。token へ `Zone > Zone WAF > Edit` を追加するか、ダッシュボードで同内容を設定した後、`--show` / `--verify`（25 連打で 429 を確認）で検証する。
- 検証: `pnpm ratelimit:cloudflare`（dry-run）が構成の妥当性（Free プラン制約・対象ホスト限定・block アクション）を fail-fast で検証する。適用後は `--verify` で実効上限を実測する。
- Rollback: 適用前の entrypoint を `--show` で控え、ルール削除（空 rules の PUT）または該当ルールの `enabled: false` で戻す。
- 2026-07-23 追記: token `pimm-production-deploy` へ Zone WAF Edit を追加後、ユーザー実行の `--apply` で zone へ適用し、`--verify` で 20×200 → 5×429 を実測して完了（Issue #41 close）。あわせて Approval PR #57 により Access アプリ `pimm-admin-api` を作成し、管理APIはフェイルクローズ 500 から Access 302 拒否へ移行した（Issue #38 はブラウザ最終確認のみ残）。

### DL-010: 名称未収録データの表示合成は web 層で行い、DB は改変しない

- 判断: 出典に名称項目が存在しないデータ（例: 国土数値情報 道路 N13 — N13_001〜008 はコード値/日付/メッシュ番号のみで路線名フィールド自体が無い）は、DB の publisher 固定値 `(名称不明)` を保持したまま、web 表示層で「名称未収録の道路（緯度, 経度 付近）」の形式へ合成する（`apps/web/src/lib/display-name.ts`）。
- 理由: 「欠損は不明と表示し推定しない」（設計書 §8.2）の原則を守りつつ、同名 800 行が並ぶ一覧の識別性を座標サフィックスで確保するため。名称の捏造や DB 書き換え（自然キー変化による重複リスク）を避ける。
- 影響: 一覧・詳細タイトルの表示のみ。API 応答・DB・エクスポートは不変。N13 のコード値→名称ラベル変換は、製品仕様書のコードリストを検証確認できた時点で別途検討する。
- 検証: `apps/web/test/display-name.test.ts` で合成規則を固定。既存 unit / E2E は全 PASS。
- Rollback: 該当 PR を revert（表示のみの変更）。

## 2026-07-30

### DL-011: 運用ダッシュボードは既存テーブルの集計 API で提供し、追加 migration を行わない

- 判断: Issue #52（運用コンソール）の第1弾として `GET /api/v1/admin/operations` を追加し、ソース別の最終取込・成功率・公開/停止/隔離件数・未解決品質issue・鮮度を既存の `data_sources` / `infrastructure_assets` / `ingestion_runs` / `quality_issues` から都度集計する。集計テーブルや view の追加 migration は行わない。
- 理由: 現状のデータ規模（数千件・ソース数十以下）では 4 本の bounded な集計 SELECT で十分応答でき、schema 変更ゼロなら rollback は revert だけで完結するため。集計の意味論は contracts の `summarizeOperations` に一元化し、InMemory / Postgres の実装差を repository contract test で塞ぐ。
- 影響: 管理API配下（Cloudflare Access + admin/reviewer allowlist）の read-only エンドポイントが 1 本増える。公開APIと DB スキーマは不変。件数バケットは「隔離（quality hidden）＞公開/下書き/停止」の順で各資産を一意に分類し、公開件数は公開APIの可視性ルールと一致させる。成功率の窓は `OPERATIONS_RECENT_RUN_WINDOW = 20` 実行に固定。
- 検証: contracts unit、repository contract（InMemory 実測 / Postgres は同一テストを integration で共有）、API test（401/認可/合計整合）、SettingsDialog test。Postgres 実 SQL は Neon 上で read-only 実行により構文検証。
- Rollback: 該当 PR を revert（migration なし・データ影響なし）。

### DL-012: brace-expansion GHSA-mh99-v99m-4gvg は dev ツールチェーン限定として scanner 例外で扱う

- 判断: OSV High (CVSS 7.5, DoS) の brace-expansion 1.x 系は、maintenance backport 1.1.17 へ更新した上で、`osv-scanner.toml` の IgnoredVulns（期限 2026-10-31）として扱う。5.x 系は 5.0.9（修正版）へ更新済み。
- 理由: advisory の fixed は 5.0.8 のみで 1.x に認定修正が無い。lockfile 上の 1.x の唯一の依存元は minimatch@3（eslint/glob 等の dev/CI ツールチェーン）で、pnpm override による 1→5 強制昇格は `expand is not a function` を実測しツールチェーンを破壊する。本番成果物（worker bundle / web assets）に brace-expansion が含まれないことを grep で実証しており、本番暴露はない。
- 影響: CI の依存脆弱性スキャンは本 advisory のみ期限付きで無視する。新規 advisory は従来どおり fail する。
- 検証: `grep -c 'brace-expansion\|braceExpand' apps/api/dist/worker.js` = 0、`apps/web/dist/assets/*.js` = 0。lint / test / build 全 PASS（1.1.17 適用後）。
- Rollback: `osv-scanner.toml` の当該エントリ削除。期限到来時に minimatch/eslint の upstream 更新を再確認し、恒久解消できれば即削除する。

### DL-013: 港湾データは KSJ C02(非商用条件) を restricted として全国投入する

- 判断: port カテゴリの初期全国データとして国土数値情報 港湾データ C02 第3.2版(平成26年度・全国994港湾)を採用し、`redistribution='restricted'`・attributionText に非商用条件を明記して取込・公開する。レコード更新日が原典に無いため `sourceUpdatedAt=null`(Q006「鮮度不明」を994件に正しく表示)とし、日付類(政令指定日・設立日)は YYYYMMDD 生値の属性として保持する(ISO への変換・推定はしない)。
- 理由: 当該版の使用許諾条件はデータ詳細ページ上「非商用」であり、CC-BY へ移行済みの新版群(例: N13-24)と異なる。本サイトは非営利公開のため利用可能で、エクスポートは既存のライセンス制御(restricted はエクスポート許可+帰属表示)に従う。ユーザー提示の代替候補は取込不可(損傷マップ=営利利用・複写禁止+機械可読DLなし)または要申請(基盤地図情報・JICE)のため、C02 が唯一の即時投入可能な全国港湾データ。
- 影響: 公開資産に port 994 件が加わる(実測ドライラン: 994 fetched / 994 accepted / 0 quarantined / Q006×994 / 40都道府県)。schema 変更なし。
- 検証: アダプタ unit + pipeline 契約テスト(Q002/Q008/エンティティ/緯度経度入替)、実URLドライラン全件成功。本番 ingest は PR #64 に手順・件数・rollback を明記して承認範囲で実行する。
- Rollback: `POST /api/v1/admin/sources/port-c02/suspend-assets`(ソース単位公開停止・Q007監査付き)。非破壊。

### DL-014: 本番 Web ビルドの API 接続先は .env.production で固定し、スモークでバンドル混入を検証する

- 判断: `apps/web/.env.production`（公開値のみ・secret なし）をコミットして本番 API base を宣言的に固定し、`pnpm smoke:cloudflare` に `web-bundle-api-base`（配信中バンドルへ本番 API base が焼き込まれ、私有 IP/localhost 系 URL が混入していないことの検証）を追加する。
- 理由: 2026-07-30、検証用 `apps/web/.env.local`（LAN URL）が本番ビルドへ混入し、本番ページが `http://192.168.0.185:8790` を参照する障害が発生（Mixed Content + 接続拒否で一覧・サマリ全滅。ローカル検証サーバ稼働中は本番ドメイン上でサンプルデータが表示される、より発見しにくい形でも顕在化）。Vite は `.env.production` を `.env.local` より優先するため、コミット済み宣言が構造的なガードになる（`.env.local` 残存状態での再ビルドで hash 一致のクリーンバンドル生成を実証済み）。
- 影響: 以後の web 本番ビルドは環境変数の付け忘れでも正しい API base になる。スモークは 9 チェックへ増加し、同種の混入を deploy 直後に fail で検出する。
- 検証: 修正デプロイ（Pages `407a6f8b`）で本番復旧を確認。`.env.local` を残したままのビルドがクリーンな `index-BGcv4vYg.js` を再現。新スモーク 9/9 PASS（本 PR の検証結果参照）。
- Rollback: 本 PR revert（`.env.production` 削除でビルド時の明示環境変数運用へ戻る）。

### DL-015: 河川 W05 は都道府県別ソース(47 slug)とし、流路セグメントを riverCode 単位の1河川へ集約する

- 判断: W05 は県別 zip(整備年度が県毎に異なる)のため、実ページのダウンロード表から採取した年度対応表で `river-w05-XX`(47件)を factory 生成する。原典の「流路」セグメントはそのまま資産化せず、riverCode(10桁・全国一意)単位で MultiLineString へ集約して「1河川=1資産」とする。セグメント毎に異なる区間種別・原典資料種別は distinct 集合の属性として保持し、原典の「名称不明」文字列もそのまま保持する(推定・書換をしない)。
- 理由: 実測で北海道1県だけで XML 149MB・流路 49,157 件あり、セグメント資産化は同名行の氾濫と件数爆発を招く。集約により徳島 4,311→672 件など資産粒度が「河川」に一致する。県別ソース化で 1 run のメモリ・時間・書込が有界になり、段階投入と county 単位 rollback(suspend-assets)が可能になる。
- 影響: registry は 8+47 slug。初回投入はパイロット3県(徳島672・東京116・大阪252 = 1,040河川、年式 06/08/09 を各1県)とし、残り44県は同一コマンドの反復で段階投入する(大容量県は個別に所要を確認)。
- 検証: unit/契約テスト(集約・緯度経度入替・名称不明保持・Q002/Q005/Q008)、実データドライラン3県 全件 accepted・隔離0・メモリ≤267MB。
- Rollback: 県単位 `POST /admin/sources/river-w05-XX/suspend-assets`(非破壊)。コードは revert。

## 2026-08-05

### DL-016: 自動取込は Cloudflare Cron Trigger + Worker 内パイプラインとし、大容量ソースは CLI 運用を維持

- 判断: `wrangler.toml` に毎時 Cron Trigger（`0 * * * *`）を追加し、`refresh_cron` が現在時刻に一致する有効ソースを Worker 内で fetch→parse→normalize→publish する。アダプターはトランスポート注入式（`transport.ts` / `worker-http.ts`）へリファクタリングし、Worker バンドルから `node:https` を完全排除した（`dist/worker.js` に node:https 非含有を grep 検証）。
- 理由: 手動 CLI 依存ではスケジュール運用が成立しない一方、河川 W05 は県別 XML 最大149MB で Worker の CPU/メモリ制約を超えるため。Worker 対応は橋梁・大阪2種・道路・港湾の5ソースに限定し、W05 とサンプルはスケジューラ対象外とする。
- 影響: 管理UIの `refresh_cron` が実際の実行スケジュールとして機能する。実行間隔ガード（55分）により同一 Cron 時刻の再実行重複を防止。実行結果は既存の `ingestion_runs` に `triggered_by='cron'` で記録され、監査・運用ダッシュボードにそのまま現れる。
- 検証: scheduler の cron 解析/対象選定ユニットテスト、worker-adapters 登録テスト、worker-http トランスポートテスト、`pnpm build` で Worker バンドル成功。
- Rollback: `wrangler.toml` の triggers 削除 + PR revert（DB スキーマ変更なし）。

### DL-017: ページングを OFFSET から keyset（name, id）へ移行

- 判断: カーソルのペイロードを「最後に表示した行の (name, id)」へ変更し、Postgres は行値比較 `(a.name, a.id) > ($1, $2)`、InMemory は localeCompare で後続行を特定する。カーソルは UTF-8 対応 base64url 化（日本語名対応）。
- 理由: OFFSET 方式は大ページで遅延し、途中に挿入/削除があると重複・欠落するため。データ規模拡大（河川全国投入等）に先立つ基盤改善。
- 影響: カーソルはバックエンドの照合順序に依存（Postgres と InMemory 間で非互換だが、同一バックエンド内では安定）。API のカーソル形状は不透明のまま。
- 検証: repository contract（InMemory/Postgres 共通）、cursor ユニット、API テスト。
- Rollback: cursor.ts + 各リポジトリの実装を revert。

### DL-018: 検索は複数キーワードAND・都道府県名ルーティング・サジェスト・住所ジオコーディングで強化

- 判断: `q` を空白区切りトークンとして AND 検索に変更。都道府県名と完全一致するトークンは名称一致ではなく `prefecture_code` フィルタへルーティング（「東京都」だけで空結果になる問題を回避）。`GET /suggest`（名称の出現数順サジェスト）と `GET /geocode`（国土地理院 `msearch.gsi.go.jp` の住所ジオコーダをプロキシ、5秒タイムアウト）を追加し、Web は datalist サジェストと住所検索フォームを実装。
- 理由: Issue #50 のうち MVP で効果が高い範囲。外部ジオコーダのキー管理を避けるため GSI 公開 API をサーバ側プロキシし、エラー時は 502 でフェイルクローズ。
- 影響: 公開APIに読み取り専用2エンドポイント追加。DB スキーマ変更なし。
- 検証: contracts / repository contract / API（fetch スタブ）/ web client・hook テストで固定。
- Rollback: PR revert（追加エンドポイントと検索条件変更のみ）。

### DL-019: W05 河川の自動化は GitHub Actions 外部ランナー（週次47県マトリクス）で実装

- 判断: Worker の Cron 対象を軽量5ソースに限定したまま、W05 は `.github/workflows/w05-scheduled-ingest.yml`（毎週土 16:00 UTC = 日曜 01:00 JST、47 県マトリクス、`workflow_dispatch` で県指定可）から既存 `pnpm ingest --publish` を実行する。設計と代替案比較は `docs/W05_AUTOMATION_DESIGN.md` に記載。
- 理由: 149MB XML を Worker で処理できないため。GitHub Actions は Node CLI をそのまま使い、失敗可視化・Secret 管理・不要時停止が容易。
- 影響: `DATABASE_URL` を GitHub Actions Secret に追加する運用が発生。実行は既存品質ゲート経由で、失敗は `ingestion_runs.failed` に記録。
- 検証: ワークフローは PR の CI では実行されない（schedule/dispatch のみ）。ローカル一括スクリプト `scripts/tools/ingest-river-w05-all.mjs` を追加し dry-run/publish/県指定をサポート。
- Rollback: ワークフロー無効化 + DB は県単位 suspend-assets。

### DL-020: OpenAPI コンポーネントは Zod v4 のネイティブ toJSONSchema() で自動生成

- 判断: `openapi.ts` の手書きスキーマを廃止し、contracts の各 Zod スキーマから `toJSONSchema()` で生成した JSON Schema（draft 2020-12）を OpenAPI 3.1 の components に展開する。zod-to-json-schema / zod-openapi 等の追加依存は Zod v4 対応状況が不安定だったため不採用（導入・評価して破棄）。
- 理由: 依存ゼロ・Worker バンドル非肥大化・スキーマ差分をテストで検出可能。
- 影響: `/api/v1/openapi.json` の出力が JSON Schema 型（nullable は type 配列等）になる。3.1 ではそのまま有効。
- 検証: API テストで `components.schemas.AssetSummary` / `GeocodeItem` の存在と構造を固定。
- Rollback: 手書きスキーマへ戻す場合は revert。

### DL-021: 住所ジオコーディング結果へ市区町村コードを付与し、一覧・エクスポートの絞り込みに接続

- 判断: GSI ジオコーダは市区町村コードを返さないため、`piuccio/open-data-jp-municipalities`（JIS X 0402、1736件）を5桁コードへ整形して contracts に同梱し、住所文字列の最長一致＋先頭都道府県優先で `municipalityCode` / `municipalityName` を付与する。生成スクリプト `scripts/tools/generate-municipality-codes.mjs` で再生成可能。
- 理由: 住所検索 → 一覧絞り込み → エクスポートの一連の流れを成立させるため。DB スキーマ変更なし。
- 影響: `/geocode` レスポンスにフィールド2件追加。Web は URL（`muni`/`muniN`）に保持し、解除チップ・エクスポート条件へ反映。
- 検証: contracts マッチャー単体、API テスト（fetch スタブ）、url-state 往復テスト。
- Rollback: フィールドと UI を revert（データは同梱のまま無害）。

### DL-022: GSI ジオコーダの本番障害を URL 修正＋実レスポンス形状対応で解消

- 判断: 本番検証で `/geocode` が 502 を返したため、2 段階で修正した。① GSI エンドポイントは `/address/search` ではなく `/address-search/AddressSearch`（404 を実測）。② GSI は `{features:[...]}` ではなく素の Feature 配列を返すため、URL 修正後も items が空になる問題を配列優先＋旧形式互換受容で解消。
- 理由: 本番の住所検索機能が全滅しており、利用者機能として必須だったため。curl・診断 Worker による egress 確認で原因を切り分け、テスト（fetch URL 断言・実形状テスト）で回帰を固定した。
- 影響: `/api/v1/geocode` のみ。DB・スキーマ変更なし。
- 検証: 本番で `東京都千代田区` → 座標 `139.753616, 35.69389` ＋ `municipalityCode=13101` を確認。API テスト 84/84、CI 全ジョブ成功。
- Rollback: PR #72 / #73 を revert（最小差分）。

### DL-023: 2026-08-05 本番運用化ラウンドの判断と未解決ギャップ

- 判断: 機能統合 3 PR（#68/#70/#71）と geocode 修正 2 PR（#72/#73）を main へ統合し、API を本番再デプロイ（Version `771d94f2`）。フルスモーク 9/9 PASS。本番検証（geocode/suggest/export/管理API 302/セキュリティヘッダ）を実施。
- 未解決ギャップ（ユーザー対応事項として明記）:
  1. Cloudflare API トークンに Pages: Edit 権限がなく、Web の現行 main ビルド再配信が不可（現配信は 2026-07-29 頃のビルド）
  2. GitHub Actions Secrets に `DATABASE_URL` 未設定で、W05 週次取込ワークフローが未実行
  3. main ブランチ保護（必須レビュー・必須CI）未設定
  4. 外部死活監視・アラート通知・Neon バックアップ API 確認が未設定（監視/SLO・通知先は docs/operations で定義済み）
- 検証: 本番 curl・スモーク・CI 全成功。Cron Trigger は本番登録済み（実働ログ捕捉は 2026-08-05 14:00 UTC 予定）。

### DL-024: 2026-08-12 総合評価ラウンド（readiness API・W05 ガード・a11y・バンドル・文書）

- 判断: 本番運用水準への総合評価を実施し、重大/高リスクのうちコードで解決できるものを最小差分で実装した。① `GET /api/v1/health/ready` を追加し `AssetRepository.ping()`（InMemory=true / Postgres=`SELECT 1`）で DB 可用性を監視可能にした（失敗時 503・内部情報非露出）。② W05 ワークフローに `check-secret` ガード job を追加し、GitHub Actions Secret `DATABASE_URL` 未設定を 1 ジョブで明確に失敗させる（2026-08-08 の週次 failure の原因は Secret 未設定と判定、`gh secret list` 空で確認）。③ Modal にフォーカストラップ・Escape・フォーカス復元を実装（アクセシビリティ）。④ Web のダイアログ群を遅延読込し react/maplibre を vendor chunk へ分割。⑤ 評価書・改善台帳・AI 設計・ロードマップを docs へ追加。
- 理由: 運用停止・検知不能・監査不足リスクを優先し、外部承認/秘密値を要する項目（Secret 設定・Pages 権限・ブランチ保護・監視通知）は実装せずユーザー対応事項として報告するため。
- 影響: API に読み取り専用エンドポイント 1 本追加（DB スキーマ変更なし）。Web は動的 import 化（動作不変）。W05 workflow は Secret 未設定時に失敗箇所が 1 ジョブへ集約。
- 検証: typecheck 全 PASS・API 86/86・database 49/49・contracts 37/37・web 122/122・build 成功（main chunk 401KB・ダイアログ別 chunk）・lint 0。PostGIS 統合・E2E・secret/dependency scan は PR CI で検証。
- Rollback: 該当 PR を revert（API 経路・UI・workflow・docs のみ）。

### DL-025: 2026-08-12 総合評価ラウンド補完（CI Actions 最新化・未使用依存削除・PORT 対応）

- 判断: PR #75 のレビュー監査で、① CI Actions の Node 20 非推奨警告（checkout v4 / setup-node v4 / pnpm v4 / gitleaks v2 / osv-scanner v2.3.8）を最新版へ更新、② `apps/api`・`packages/database` の直接依存 `zod` が未使用（import 実績なし・schemas は @pimm/contracts 経由）のため削除、③ ローカル開発・並列実行で困るポート固定を `PORT` 環境変数対応へ変更した。
- 理由: CI の将来互換性・依存の最小化・開発の並列化は本番運用継続の前提。いずれも動作不変の小さな変更。
- 影響: CI Actions のメジャー更新（v5/v6/gitleaks v3/osv v2.5）は PR CI で検証。`zod` は workspace 解決上 contracts 経由で引き続き利用可能。
- 検証: リンク監査（内部 Markdown リンク全解決）・依存スキャン（js-yaml/nanoid 修正済み）・lint/typecheck/unit/build・PR CI 全ジョブ PASS。
- Rollback: 該当コミット revert（package.json・workflow・node.ts）。

### DL-026: 2026-08-12 承認後の本番運用化（PR #75 マージ・API デプロイ・定期死活監視）

- 判断: ユーザー承認を受けて PR #75 を main へ squash マージ（commit `3de2db3`）し、API を本番デプロイ（version `047bfd6a`）。スモークは 9/9 PASS を確認。あわせて外部死活監視の代替として GitHub Actions `production-smoke.yml`（15 分間隔・`--monitor` モード）と `/health/ready` スモークチェック（計 10 チェック）を追加した。
- 未解決（ユーザー/外部依存）:
  1. Web（Pages）再配信は API トークンに Pages:Edit 権限が無く失敗（wrangler `upload-token` で Authentication error 10000）。トークンへ「Cloudflare Pages: Edit」追加が必要
  2. GitHub Actions `DATABASE_URL` は値が環境・ローカルに存在せず設定不可。Neon API（api.neon.tech）はこの実行環境から DNS 解決不可のため、接続文字列の提示または DNS 解放が必要
  3. Neon PITR 復元試験は API 到達不可のため未実施（手順は BACKUP_RESTORE.md）
  4. Cloudflare Access 実認証のブラウザ E2E は SSO 対話操作が必要。Access アプリ `pimm-admin-api`（ポリシー `pimm-admins`）の存在は API で確認済み・未認証拒否 302 はスモークで確認済み
- 検証: 本番スモーク 9/9 PASS・API デプロイ成功・Access アプリ構成確認。
- Rollback: API は `wrangler rollback --env production`。監視ワークフローは無効化または PR revert。
