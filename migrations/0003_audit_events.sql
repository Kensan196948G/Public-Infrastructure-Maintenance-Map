-- 0003_audit_events.sql — append-only audit trail with hash chain (Issue #48)
-- Applied after 0002. Adds a dedicated audit_events table recording every
-- administrative mutation (source create/update, ingestion start, quality
-- resolution, publication suspension, feedback receipt) with an actor,
-- request id, structured context, and a SHA-256 hash chain for tamper
-- detection. The chain links each row to the previous row's event_hash
-- (GENESIS = 64 zeros for the first row).

CREATE TABLE audit_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigserial NOT NULL UNIQUE,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor        text NOT NULL,
  action       varchar(40) NOT NULL,
  target_type  varchar(30) NOT NULL,
  target_id    text NOT NULL,
  summary      text NOT NULL,
  detail_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id   text,
  prev_hash    char(64) NOT NULL,
  event_hash   char(64) NOT NULL
);

-- seq is the insertion order: newest-first reads and chain verification must
-- not depend on timestamp precision or UUID ordering.
CREATE INDEX idx_audit_events_seq ON audit_events (seq DESC);
CREATE INDEX idx_audit_events_occurred ON audit_events (occurred_at DESC);
CREATE INDEX idx_audit_events_action ON audit_events (action);
CREATE INDEX idx_audit_events_target ON audit_events (target_type, target_id);

-- Append-only enforcement: the audit trail must never be updated or deleted
-- in place. Rejection raises an exception so accidental tampering via SQL
-- fails loudly instead of silently weakening the chain.
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (%).', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_events_mutation();

-- ─────────────────────────────────────────────
-- ロールバック手順（migration は forward-only 運用のため通常不要）
-- 監査表の削除は監査証跡の破壊を伴う。適用取り消しが必要な場合は
-- 人間の承認を得た上で、適用済み順に以下を実行する:
--   DROP TRIGGER trg_audit_events_append_only ON audit_events;
--   DROP FUNCTION prevent_audit_events_mutation();
--   DROP TABLE audit_events;
-- ─────────────────────────────────────────────
