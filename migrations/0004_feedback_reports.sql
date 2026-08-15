-- 0004_feedback_reports.sql — public feedback intake (Issue #54)
-- Applied after 0003. General users submit reports (wrong location, broken
-- source link, quality doubts, other) through the rate-limited public API.
-- An admin reviews them in the ops console and either converts them into
-- quality issues or dismisses them; the report itself is never deleted so
-- the decision trail stays intact.

CREATE TABLE feedback_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category        varchar(20) NOT NULL
                  CHECK (category IN ('location', 'link', 'quality', 'other')),
  detail          text NOT NULL,
  page_url        text,
  status          varchar(20) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'converted', 'dismissed')),
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX idx_feedback_reports_status ON feedback_reports (status, created_at DESC);
