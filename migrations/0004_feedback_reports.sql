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
  -- 公開受付経路のため、スキーマ検証を通らない挿入経路へも DB 側の上限を防御層として設ける。
  detail          text NOT NULL CHECK (char_length(detail) BETWEEN 1 AND 1000),
  page_url        text CHECK (page_url IS NULL OR char_length(page_url) <= 500),
  status          varchar(20) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'converted', 'dismissed')),
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX idx_feedback_reports_status ON feedback_reports (status, created_at DESC);
