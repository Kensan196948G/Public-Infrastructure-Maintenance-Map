-- 0001_init.sql — initial schema (設計書 §5)
-- Requires: Neon PostgreSQL with PostGIS available.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────
-- data_sources: 公開データソース台帳 (FR-09)
-- ─────────────────────────────────────────────
CREATE TABLE data_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            varchar(100) NOT NULL UNIQUE,
  name            text NOT NULL,
  provider_name   text NOT NULL,
  source_url      text NOT NULL,
  access_type     varchar(20) NOT NULL CHECK (access_type IN ('api', 'file', 'manual')),
  format          varchar(30) NOT NULL,
  license_name    text NOT NULL,
  license_url     text,
  redistribution  varchar(20) NOT NULL DEFAULT 'unknown'
                  CHECK (redistribution IN ('allowed', 'restricted', 'prohibited', 'unknown')),
  attribution_text text,
  refresh_cron    text,
  enabled         boolean NOT NULL DEFAULT false,
  -- Never store secrets here; API keys live in Workers secrets.
  config_json     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- dataset_versions: 取得した原本のバージョン管理
-- ─────────────────────────────────────────────
CREATE TABLE dataset_versions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid NOT NULL REFERENCES data_sources(id),
  source_updated_at  timestamptz,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  content_hash       char(64) NOT NULL,
  schema_fingerprint char(64) NOT NULL,
  raw_reference      text,
  record_count       integer,
  status             varchar(20) NOT NULL DEFAULT 'fetched'
                     CHECK (status IN ('fetched', 'validated', 'published', 'rejected'))
);

CREATE INDEX idx_dataset_versions_source ON dataset_versions (source_id, fetched_at DESC);

-- ─────────────────────────────────────────────
-- infrastructure_assets: 公開インフラ本体
-- ─────────────────────────────────────────────
CREATE TABLE infrastructure_assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid NOT NULL REFERENCES data_sources(id),
  source_record_id   text NOT NULL,
  asset_type         varchar(30) NOT NULL
                     CHECK (asset_type IN ('bridge', 'road', 'port', 'river', 'public_facility')),
  name               text NOT NULL,
  original_name      text,
  geometry           geometry(Geometry, 4326) NOT NULL,
  prefecture_code    char(2),
  municipality_code  char(5),
  managing_authority text,
  source_updated_at  timestamptz,
  quality_status     varchar(20) NOT NULL DEFAULT 'review'
                     CHECK (quality_status IN ('verified', 'review', 'reference', 'hidden')),
  publication_status varchar(20) NOT NULL DEFAULT 'draft'
                     CHECK (publication_status IN ('draft', 'published', 'suspended')),
  valid_from         timestamptz,
  valid_to           timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_record_id)
);

CREATE INDEX idx_assets_geometry ON infrastructure_assets USING GIST (geometry);
CREATE INDEX idx_assets_type_status
  ON infrastructure_assets (asset_type, publication_status, quality_status);
CREATE INDEX idx_assets_name_trgm ON infrastructure_assets USING GIN (name gin_trgm_ops);

-- ─────────────────────────────────────────────
-- asset_attributes: 正規化済み属性 (原文も保持)
-- ─────────────────────────────────────────────
CREATE TABLE asset_attributes (
  asset_id       uuid NOT NULL REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
  key            varchar(100) NOT NULL,
  value_text     text,
  value_number   numeric,
  unit           varchar(20),
  original_value text,
  source_label   text,
  PRIMARY KEY (asset_id, key)
);

-- ─────────────────────────────────────────────
-- ingestion_runs: 取込監査 (FR-13)
-- ─────────────────────────────────────────────
CREATE TABLE ingestion_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid NOT NULL REFERENCES data_sources(id),
  dataset_version_id uuid REFERENCES dataset_versions(id),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  status             varchar(20) NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  fetched_count      integer NOT NULL DEFAULT 0,
  accepted_count     integer NOT NULL DEFAULT 0,
  rejected_count     integer NOT NULL DEFAULT 0,
  warning_count      integer NOT NULL DEFAULT 0,
  error_code         varchar(50),
  error_summary      text,
  triggered_by       text,
  correlation_id     text
);

CREATE INDEX idx_ingestion_runs_source ON ingestion_runs (source_id, started_at DESC);

-- ─────────────────────────────────────────────
-- quality_issues: 品質検査結果 (FR-12)
-- ─────────────────────────────────────────────
CREATE TABLE quality_issues (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid REFERENCES ingestion_runs(id),
  asset_id          uuid REFERENCES infrastructure_assets(id) ON DELETE CASCADE,
  rule_code         varchar(10) NOT NULL,
  severity          varchar(10) NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  field_name        text,
  observed_value    text,
  message           text NOT NULL,
  resolution_status varchar(20) NOT NULL DEFAULT 'open'
                    CHECK (resolution_status IN ('open', 'accepted', 'fixed', 'dismissed')),
  resolved_by       text,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quality_issues_asset ON quality_issues (asset_id, resolution_status);
CREATE INDEX idx_quality_issues_run ON quality_issues (run_id);
