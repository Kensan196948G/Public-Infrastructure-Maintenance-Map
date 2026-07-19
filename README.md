# 🗺️ Public Infrastructure Maintenance Map

> **公開インフラ維持管理マップ**  
> 橋梁・道路・港湾・河川・公共施設などの公開情報を、一つの地図から探せるWeb GISです。

[![Status](https://img.shields.io/badge/status-MVP%20Phase%201%2F2-blue)](#-現在の状態)
[![Data](https://img.shields.io/badge/data-public%20only-green)](#-データ方針)
[![Platform](https://img.shields.io/badge/platform-Cloudflare%20%2B%20Neon-orange)](#%EF%B8%8F-システム構成)

## 🌱 このプロジェクトについて

インフラの公開情報は、国・自治体・管理主体ごとに分散し、形式や更新頻度もさまざまです。本プロジェクトは、それらを共通形式に整え、地図・検索・一覧・詳細から確認できる「調査の入口」を作ります。

```mermaid
flowchart LR
    A["🔎 探す"] --> B["🗺️ 地図で見る"]
    B --> C["🏗️ 詳細を確認"]
    C --> D["📚 原典へ移動"]
```

> [!IMPORTANT]
> 本システムは参考情報を提供するもので、構造物の健全性、安全性、通行可否、工事可否を判定しません。最新かつ正式な情報は、必ず原典と管理主体へ確認してください。

## ✨ 主な機能

| アイコン | 機能 | 内容 |
| --- | --- | --- |
| 🗺️ | インフラ地図 | 橋梁、道路、港湾、河川、公共施設をレイヤー表示 |
| 🔍 | 横断検索 | 施設名、住所、自治体、管理主体、座標から検索 |
| 🎛️ | 絞り込み | 種別、地域、管理主体、更新日、品質状態で絞り込み |
| 🏗️ | 詳細表示 | 公開属性、位置、更新状況、注意点を表示 |
| 🔗 | 出典追跡 | 提供元、原典URL、取得日時、ライセンスを明示 |
| 🧹 | 品質管理 | 欠損、重複、不正座標、古い情報を検査・表示 |
| 📤 | データ出力 | 許諾された範囲をCSV／GeoJSONで出力 |
| 📊 | 運用監視 | データ取得、エラー、鮮度、品質を管理者が確認 |

## 👥 想定利用者

- 👷 土木建設現場技術者・現場管理者
- 🛠️ インフラ維持管理担当者
- 🔬 土木建設研究者
- 📈 経営・企画担当者
- 💻 IT・DX担当者
- 🧭 公開情報を調べたい一般利用者

## 🧭 できること／できないこと

| ✅ できること | 🚫 できないこと |
| --- | --- |
| 公開インフラ情報の地図・一覧表示 | 健全性、安全性、劣化度の断定 |
| 複数公開データの横断検索 | 法定点検や専門家判断の代替 |
| 出典、鮮度、品質状態の確認 | 非公開・社内台帳の収集 |
| 初期調査対象の洗い出し | 原典にない事実の推測・補完 |
| 正式な原典へのナビゲーション | 最新性・完全性の無条件保証 |

## 🏗️ 対象インフラ

```mermaid
mindmap
  root((公開インフラ))
    🌉 橋梁
    🛣️ 道路
    ⚓ 港湾
    🌊 河川
    🏢 公共施設
```

取得できる属性は公開元により異なります。情報がない項目は「不明」と表示し、推測値では埋めません。

## 🔄 データが地図に届くまで

```mermaid
flowchart TD
    A["🌐 公開API・公開ファイル"] --> B["📥 取得・原本確認"]
    B --> C["🧹 文字・日付・単位・座標を統一"]
    C --> D["🔍 欠損・重複・異常を検査"]
    D --> E{"品質OK?"}
    E -->|はい| F["🗄️ Neonへ公開"]
    E -->|要確認| G["⚠️ 隔離・レビュー"]
    F --> H["🗺️ Web地図"]
```

### 品質バッジ

| バッジ | 意味 |
| --- | --- |
| ✅ 確認済み | 自動品質検査を通過 |
| ⚠️ 要確認 | 欠損、重複、座標、鮮度等に注意 |
| ℹ️ 参考 | 属性が限定的または更新日不明 |
| ⛔ 非公開 | 規約、誤り、障害等により表示停止 |

## 🏛️ システム構成

```mermaid
flowchart TD
    U["👤 利用者"] --> P["☁️ Cloudflare Pages"]
    P --> W["⚙️ Cloudflare Workers API"]
    W --> N["🐘 Neon PostgreSQL + PostGIS"]
    O["🌐 公開データ"] --> I["🧹 取込・品質検査"]
    I --> N
    G["🐙 GitHub"] --> P
    A["🔐 管理者"] --> X["Cloudflare Access"]
    X --> W
```

| 基盤 | 役割 |
| --- | --- |
| 🐧 Claude Code on Linux | 開発作業台。一時作業・ビルド・検証のみ |
| 🐙 GitHub | ソースコード、設計書、READMEの正本 |
| ☁️ Cloudflare | Web公開、API、CDN、管理入口制御 |
| 🐘 Neon | PostgreSQL／PostGISデータの正本 |

## 🛡️ データ方針

本プロジェクトでは、次の情報だけを扱います。

- ✅ 国・自治体・公的機関等の公開データ／公開API
- ✅ 利用条件を確認したオープンデータ
- ✅ テスト用の架空・匿名サンプルデータ
- ❌ AD、Entra ID、HENNGE ONE、SharePoint、DirectCloud等の社内情報
- ❌ 社内ファイルサーバ、社内台帳、案件・顧客・従業員情報
- ❌ 個人を特定できる位置履歴

位置情報は利用者が明示的に許可した場合だけ現在地表示に用い、既定では保存しません。

## 📂 リポジトリ構成

```text
Public-Infrastructure-Maintenance-Map/
├─ apps/
│  ├─ web/                 # 地図Web UI (React + MapLibre)
│  └─ api/                 # Cloudflare Workers API (Hono)
├─ packages/
│  ├─ contracts/           # Zod スキーマ・型・エラー体系（単一の真実）
│  ├─ database/            # リポジトリ抽象・in-memory・Neon/PostGIS
│  ├─ ingestion-core/      # 正規化・品質ルール・重複検出・パイプライン
│  └─ source-adapters/     # 公開元ごとの変換処理 + サンプルデータ
├─ migrations/             # DB migration (SQL)
├─ scripts/                # migration runner 等の運用スクリプト
├─ .github/workflows/      # CI (lint/type/test/build/secret scan)
└─ README.md               # ※テストは各パッケージの test/ に同居
```

## 🚀 開発環境の準備

> [!NOTE]
> 以下は推奨構成です。実装開始時に、リポジトリ内の`package.json`、`.node-version`、公式ドキュメントを確認してください。

### 必要なもの

- Git
- Node.js（リポジトリ指定バージョン）
- pnpm（リポジトリ指定バージョン）
- Cloudflareアカウント／CLI
- Neon PostgreSQL（PostGIS有効）

### セットアップ

```bash
git clone https://github.com/<owner>/Public-Infrastructure-Maintenance-Map.git
cd Public-Infrastructure-Maintenance-Map
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

`.env.local`へ実際の秘密情報を設定します。`.env`および`.env.local`はGitへコミットしません。

### 主なコマンド

| コマンド | 用途 |
| --- | --- |
| `pnpm dev` | Web／APIの開発起動 |
| `pnpm build` | 本番向けビルド |
| `pnpm lint` | コード規約検査 |
| `pnpm typecheck` | 型検査 |
| `pnpm test` | 単体・統合テスト |
| `pnpm test:e2e` | Playwright Chromium で API/Web dev server を起動し、公開地図の初期表示・検索・詳細表示・種別フィルタを検証 |
| `pnpm db:migrate` | DB migration（`DATABASE_URL` 必須） |
| `pnpm ingest --source <slug>` | 指定公開ソースの取込（dry-run。`--publish` で本番DBへ反映） |

## 🔐 環境変数

```dotenv
# 公開値（ブラウザへ公開してよい値）
# Vite は VITE_ 接頭辞の変数のみクライアントバンドルへ公開します。
# 接頭辞を変えると Web アプリは同一オリジンの '/api/v1' へ無言でフォールバックします。
VITE_API_BASE_URL=http://localhost:8787/api/v1

# Secret（実値はGit管理しない）
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
CLOUDFLARE_ACCESS_AUD=
ADMIN_EMAILS=admin@example.com
REVIEWER_EMAILS=reviewer@example.com
```

- `VITE_API_BASE_URL`: Web と API を別オリジン（別ドメインの Cloudflare Pages／Workers 等）で配信する場合に、API のベース URL を指定します。同一オリジン配信なら未設定でよく、既定の `/api/v1` が使われます。ビルド時（`vite build`）に値がバンドルへ焼き込まれるため、デプロイ環境ごとに設定します。
- `ADMIN_EMAILS` / `REVIEWER_EMAILS`: Cloudflare Accessで認証されたメールアドレスに対する管理APIのサーバ側許可リストです。ロールはリクエストヘッダではなく、この設定からのみ解決します。
- 公開データ用APIキーが必要な場合も、ブラウザへ渡さずWorkers側のSecretとして保管します。

## 🧪 テスト方針

```mermaid
flowchart LR
    A["🧩 単体"] --> B["🔌 統合"]
    B --> C["🗺️ E2E"]
    C --> D["🔒 セキュリティ"]
    D --> E["♿ アクセシビリティ"]
```

特に、座標の緯度・経度逆転、座標系の誤認、重複施設、欠損、スキーマ変更、利用条件不明をテストします。

## 🚢 リリースの流れ

```mermaid
flowchart LR
    A["変更"] --> B["Pull Request"]
    B --> C["自動テスト"]
    C --> D["Preview確認"]
    D --> E["承認"]
    E --> F["Cloudflareへ反映"]
```

1. Pull Requestで変更内容と影響を確認します。
2. Lint、型、テスト、ビルド、依存関係、Secret混入を自動検査します。
3. Previewはサンプルデータで確認します。
4. データ利用条件、地図表示、原典リンクを確認してから反映します。

## 📊 現在の状態

| フェーズ | 状態 |
| --- | --- |
| アイデア・目的整理 | ✅ 完了 |
| 要件定義 | ✅ 初版作成 |
| 詳細設計 | ✅ 初版作成 |
| MVP基盤実装（Phase 1: 地図・検索・詳細・出典表示・取込パイプライン・公開API・CI） | ✅ 実装済（全パッケージでテスト整備、CIで検証） |
| 公開データソース選定・アダプター実装 | ✅ 実データ4ソース・3種別（公共施設／橋梁／道路） |
| 実データ取込→公開DB反映（Phase 2） | ✅ 取込→Publish経路を実装（`ingest --publish`）。CI の disposable PostGIS で publish→公開Repository参照を検証 |
| 管理API・管理画面（UI-05/06/07・FR-13/14） | 🟡 管理APIゲート・基本操作・監査ログ画面からの取込記録/詳細確認を実装済。残りの管理UI接続は継続（Issue #4） |
| UAT・本番公開判定 | ⏳ 未着手 |

### 🚦 Release Gate（2026-07-19）

| 項目 | 状態 |
| --- | --- |
| 🧩 統合検証PR | Draft PR [#32](https://github.com/Kensan196948G/Public-Infrastructure-Maintenance-Map/pull/32) で #31 → #26 → #27 → #28 → #29 → #30 の順に統合済み |
| ✅ 統合CI | #32 で lint / typecheck / test / build、Playwright E2E、PostGIS integration、publish PostGIS integration、secret scan、dependency scan、CodeRabbit が成功 |
| 🧭 個別PR | #31、#26、#27、#28、#29、#30 は個別PRとして Ready / CLEAN / CI success。通常マージはユーザーの `Y` 判定後に実施 |
| 🚫 本番操作 | Cloudflare / Neon 本番デプロイ、production migration、production publish は未実行。実行はリリース手順書に従い人間が手動で行う |

推奨マージ順序は **#31 → #26 → #27 → #28 → #29 → #30** です。#32 は統合後状態の検証用Draft PRであり、通常の個別PRマージ承認を置き換えません。

Draft PR [#33](https://github.com/Kensan196948G/Public-Infrastructure-Maintenance-Map/pull/33) では、#32 の統合状態に加えて監査ログ画面から管理APIの取込記録作成・最新取込詳細確認を接続し、全CI成功を確認しています。#33 は #31/#26-#30 の承認・マージ後に通常PRとして整理する後続候補です。

### 実装済みの内容（Phase 1）

- 🗺️ 地図・検索・絞り込み・一覧・詳細・出典表示（サンプルデータ）
- 🧹 取込パイプライン: 正規化（NFC/和暦→ISO 8601/SI単位/座標系→WGS 84）+ 品質ルール Q001〜Q008 + 重複検出
- 🔌 REST API `/api/v1`: bbox検索・詳細・集計・ソース一覧・CSV/GeoJSONエクスポート（ライセンス制御付き）
- 🔒 セキュリティ: レート制限・セキュリティヘッダ・CSV数式インジェクション対策・Problem Details（RFC 9457）
- ⚙️ CI: lint / format / typecheck / test / build / secret scan（gitleaks）/ 依存脆弱性スキャン（osv-scanner）

### 既知の制約（現時点）

- 🐘 `PostgresAssetRepository` は CI の `🗄️ PostGIS integration` で公開可視性・検索・bbox・`getAssetById` 契約を検証する。`PostgresAssetPublisher` の実 Neon 一気通貫検証は Issue #5/#16 の残課題。`DATABASE_URL` 未設定時はサンプルモード（実パイプラインで生成した in-memory データ）で動作する
- 🐘 `PostgresAssetPublisher` は CI の `📤 Publish PostGIS integration` で publish→公開Repository参照・監査ログ記録・rollback・同一自然キーへの並行 publish 回帰を検証する。Neon dev branch での接続先固有検証はリリース手順で実施
- 📥 `pnpm ingest --source <slug>` は既定 dry-run（品質レポートのみ）。`--publish`（要 `DATABASE_URL`）で本番DBへ反映する経路は実装済み。公開前は runbook の手動 publish と API 件数突合を必須とする
- 🛠️ 管理APIは Cloudflare Access 前提の認証ゲート、`admin`／`reviewer` ロール確認、ソース登録・更新、取込トリガー記録、取込詳細、品質issue解決、資産公開停止の基本経路を実装済み。監査ログ画面からはソース別の取込記録作成と最新取込詳細確認まで接続済み。Playwright E2E は公開地図の初期表示・検索・詳細表示・種別フィルタを導入済み。管理画面でのソース編集、品質issue解決、資産公開停止、管理系ブラウザE2Eは継続課題（Issue #4）
- 🔒 レート制限（`RATE_LIMIT_PER_MINUTE`、既定 120/分）は Worker isolate ごとの in-memory カウンタによる「ベストエフォート」実装。分散実行環境では isolate 数だけ実効上限が緩むため、本番環境の実効的な防御層は Cloudflare WAF が担う

## 🗺️ ロードマップ

- **Phase 1 — 基礎**: サンプルデータ、地図、検索、詳細、出典表示
- **Phase 2 — 公開データ**: 3ソース以上、品質検査、管理画面
- **Phase 3 — 活用**: 共有URL、CSV／GeoJSON、更新監視
- **Phase 4 — 発展**: 時系列、PWA、モバイルビューア、他基盤連携

## 📚 設計文書

- `Public-Infrastructure-Maintenance-Map_要件定義書_20260716.md` — 何を、なぜ、どこまで実現するか
- `Public-Infrastructure-Maintenance-Map_詳細設計仕様書_20260716.md` — どのような構造・データ・処理で実装するか

## ⚖️ 利用上の注意

- 各データの著作権・利用条件は提供元に帰属します。
- 本システムの表示と原典が異なる場合は原典を優先します。
- 出力可否はデータセットごとの再配布条件に従います。
- 地図位置や属性には誤差、欠損、更新遅延があり得ます。
- 調査、設計、施工、維持管理上の最終判断は管理主体および専門技術者が行ってください。

## 🤝 コントリビューション

Issueには、対象データソース、再現手順、期待結果、原典URL、画面キャプチャ（機密情報なし）を記載してください。新規データソース追加では、提供元、利用条件、更新頻度、取得方法、項目定義、品質上の注意を必須とします。

---

🗺️ **公開情報を一枚の地図へ。判断を自動化するのではなく、良い判断へ早くたどり着くための入口を作ります。**
