-- 0002_cross_column_checks.sql — cross-column consistency CHECK constraints (Issue #10)
-- Applied after 0001_init.sql (0001 stays untouched, per the "add a new migration"
-- rule). These guard against inconsistent states that direct SQL could otherwise
-- write; the application layer already avoids them, so every current write path
-- (PostgresAssetPublisher.publish / publishAborted / publishFailed) passes:
--   * publish writes ingestion_runs only with a terminal status + finished_at set;
--   * publish never sets valid_from/valid_to (both NULL);
--   * publish writes quality_issues without resolved_at (NULL).

-- quality_issues: an open issue must not carry a resolution timestamp
-- (resolved_at is set only when an issue leaves the 'open' state).
ALTER TABLE quality_issues
  ADD CONSTRAINT chk_quality_issues_open_unresolved
  CHECK (resolution_status <> 'open' OR resolved_at IS NULL);

-- infrastructure_assets: the validity window must be ordered when both bounds
-- are present (an open-ended window leaves either bound NULL).
ALTER TABLE infrastructure_assets
  ADD CONSTRAINT chk_assets_valid_range
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from);

-- ingestion_runs: a finished (non-'running') run must record when it finished.
ALTER TABLE ingestion_runs
  ADD CONSTRAINT chk_ingestion_runs_finished_at
  CHECK (status = 'running' OR finished_at IS NOT NULL);
