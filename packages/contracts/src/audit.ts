import { z } from 'zod';

/**
 * Append-only audit trail with a SHA-256 hash chain (Issue #48).
 *
 * Every administrative mutation records an AuditEvent whose `eventHash`
 * binds the event payload to the previous event's hash, so tampering with
 * (or deleting) any row breaks the chain at the point of modification.
 *
 * The hash is computed with the Web Crypto API (crypto.subtle), which is
 * available on Cloudflare Workers, modern browsers, and Node >= 19, so the
 * same pure functions can run in the API, the repository layers, and tests.
 */

/** Actions that the audit trail records. */
export const AUDIT_ACTIONS = [
  'source.created',
  'source.updated',
  'ingestion.started',
  'quality.resolved',
  'asset.suspended',
  'source.assets.suspended',
  'feedback.received',
] as const;
export const AuditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** 64 hex chars, the digest length of SHA-256. */
export const HASH_PATTERN = /^[0-9a-f]{64}$/u;
export const GENESIS_HASH = '0'.repeat(64);

export const AuditEventSchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  /** Actor email (admin allowlist identity) or 'system' for cron/CLI. */
  actor: z.string().min(1),
  action: AuditActionSchema,
  /** What the event refers to: 'source' | 'asset' | 'ingestion' | 'quality_issue' | 'feedback'. */
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  /** One-line human-readable summary (no PII, no secrets). */
  summary: z.string().min(1).max(500),
  /** Structured context (before/after values etc.); must not contain secrets. */
  detail: z.record(z.string(), z.unknown()).default({}),
  requestId: z.string().nullable(),
  /** eventHash of the preceding row; GENESIS_HASH for the first row. */
  prevHash: z.string().regex(HASH_PATTERN),
  eventHash: z.string().regex(HASH_PATTERN),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** Payload passed when recording a new event (before hashing). */
export type NewAuditEvent = Omit<AuditEvent, 'id' | 'occurredAt' | 'eventHash' | 'prevHash'> & {
  prevHash?: string;
};

export const AuditEventListSchema = z.object({
  items: z.array(AuditEventSchema),
  /**
   * Window-internal chain integrity for the returned slice: every event's
   * eventHash is the digest of its payload+prevHash and consecutive events
   * link correctly. False is an alarm (tampering or deletion), not a routine
   * state. A bounded slice is never required to start at genesis.
   */
  valid: z.boolean(),
});
export type AuditEventList = z.infer<typeof AuditEventListSchema>;

/**
 * Deterministic JSON serialization for the hash payload. PostgreSQL jsonb does
 * not preserve key order, so a naive JSON.stringify would produce different
 * bytes when hashing at write time (in-memory object) vs read-back time (jsonb
 * row) for the same logical detail. Sorting keys recursively makes the digest
 * independent of storage representation.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Deterministic serialization of the event fields that the hash covers.
 * `occurredAt` and `id` are intentionally excluded: they are assigned by the
 * repository (DB timestamp / UUID) and the hash must be reproducible from the
 * stored row plus prevHash alone.
 */
function canonicalPayload(event: {
  actor: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  summary: string;
  detail: Record<string, unknown>;
  requestId: string | null;
  prevHash: string;
}): string {
  return [
    event.actor,
    event.action,
    event.targetType,
    event.targetId,
    event.summary,
    stableStringify(event.detail ?? {}),
    event.requestId ?? '',
    event.prevHash,
  ].join('\n');
}

/**
 * Computes the SHA-256 digest for an event. Pure and environment-agnostic
 * (Web Crypto), so InMemory and Postgres repositories produce identical hashes.
 */
export async function hashAuditEvent(event: {
  actor: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  summary: string;
  detail: Record<string, unknown>;
  requestId: string | null;
  prevHash: string;
}): Promise<string> {
  const data = new TextEncoder().encode(canonicalPayload(event));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies a hash chain over an ordered window of events.
 *
 * The window may be a prefix of the full chain (starting at GENESIS_HASH) or a
 * bounded slice of the newest events (as returned by listAuditEvents), so the
 * verification is window-internal: every event's eventHash must be the digest
 * of its own payload+prevHash, and every event after the first must chain to
 * the previous event's eventHash. The first event's prevHash is not required
 * to be GENESIS — for a slice it legitimately points at an event outside the
 * window. Tampering with a stored row, deleting a row, or rewriting a row's
 * hash all break at least one of these checks.
 */
export async function verifyAuditChain(events: readonly AuditEvent[]): Promise<boolean> {
  // Link continuity is a synchronous check; digest computation is independent
  // per event (prevHash is stored on the event itself), so hashes run in
  // parallel and short-circuit only after a link break is detected.
  for (let i = 1; i < events.length; i += 1) {
    if (events[i]!.prevHash !== events[i - 1]!.eventHash) return false;
  }
  const digests = await Promise.all(
    events.map((event) =>
      hashAuditEvent({
        actor: event.actor,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        summary: event.summary,
        detail: event.detail,
        requestId: event.requestId,
        prevHash: event.prevHash,
      }),
    ),
  );
  return events.every((event, i) => event.eventHash === digests[i]);
}

/**
 * Verifies a full chain from its genesis row: additionally requires the first
 * event's prevHash to be GENESIS_HASH. Use this when the caller holds the
 * entire chain (e.g. an audit export), not a bounded newest-N window.
 */
export async function verifyFullAuditChain(events: readonly AuditEvent[]): Promise<boolean> {
  if (events.length > 0 && events[0]!.prevHash !== GENESIS_HASH) return false;
  return verifyAuditChain(events);
}
