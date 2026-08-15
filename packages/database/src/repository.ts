import type {
  AdminAssetPublication,
  AdminCreateSource,
  AdminFeedbackList,
  AdminIngestionDetail,
  AdminIngestionDiff,
  AdminIngestionList,
  AdminIngestionRun,
  AdminOperationsSummary,
  AdminQualityIssueList,
  AdminResolveQualityIssue,
  AdminSourceResponse,
  AdminSourcePublication,
  AdminSuspendAsset,
  AdminSuspendSourceAssets,
  AdminUpdateSource,
  AssetCountSummary,
  AssetDetail,
  AssetSearchResponse,
  AssetType,
  AuditEvent,
  AuditEventList,
  BBox,
  FeedbackSubmit,
  FeedbackSubmitResponse,
  NewAuditEvent,
  QualityStatus,
  SourceInfo,
  SuggestItem,
} from '@pimm/contracts';
import { GENESIS_HASH, hashAuditEvent } from '@pimm/contracts';

/** Filters shared by search / summary / export. */
export interface AssetQueryFilters {
  bbox?: BBox | undefined;
  types?: AssetType[] | undefined;
  q?: string | undefined;
  prefectureCode?: string | undefined;
  municipalityCode?: string | undefined;
  quality?: QualityStatus[] | undefined;
  updatedSince?: string | undefined;
}

export interface AssetSearchInput extends AssetQueryFilters {
  limit: number;
  cursor?: string | undefined;
}

/**
 * Export is a single bounded bulk pull (limit is capped at the API layer), not a
 * cursor-paginated read — so it deliberately has no cursor. Modeled as its own
 * type so a cursor cannot be passed and silently ignored (Issue #9).
 */
export type AssetExportInput = Omit<AssetSearchInput, 'cursor'>;

/** Thrown for malformed cursors so the API can answer 400 instead of 500. */
export class InvalidCursorError extends Error {
  constructor() {
    super('invalid cursor');
    this.name = 'InvalidCursorError';
  }
}

/**
 * Storage abstraction consumed by the API layer.
 * Implementations: InMemoryAssetRepository (sample mode / tests),
 * PostgresAssetRepository (Neon + PostGIS, production).
 * Contract: only publication_status='published' AND quality_status<>'hidden'
 * records are ever returned.
 */
export interface AssetRepository {
  /** Liveness of the underlying storage (used by /health/ready). */
  ping(): Promise<boolean>;
  searchAssets(input: AssetSearchInput): Promise<AssetSearchResponse>;
  getAssetById(id: string): Promise<AssetDetail | null>;
  countByType(filters: Pick<AssetQueryFilters, 'bbox' | 'types'>): Promise<AssetCountSummary>;
  listSources(): Promise<SourceInfo[]>;
  getSourceBySlug(slug: string): Promise<SourceInfo | null>;
  /** Name suggestions for the search box, ordered by occurrence count. */
  suggestNames(q: string, limit: number): Promise<SuggestItem[]>;
  /** Same filters as search, bounded by limit (no pagination); license control happens in the API layer. */
  exportAssets(input: AssetExportInput): Promise<AssetDetail[]>;

  /**
   * Admin surface (Issue #4 / FR-13 / FR-14).
   * These methods are only reachable through /api/v1/admin/* after
   * Cloudflare Access identity and role checks in the API layer.
   */
  createSource(input: AdminCreateSource): Promise<AdminSourceResponse>;
  updateSource(slug: string, input: AdminUpdateSource): Promise<AdminSourceResponse | null>;
  startIngestion(
    sourceSlug: string,
    actor: string,
    correlationId: string,
  ): Promise<AdminIngestionRun | null>;
  listIngestions(limit: number): Promise<AdminIngestionList>;
  getIngestionDetail(id: string): Promise<AdminIngestionDetail | null>;
  /**
   * Ingestion diff (Issue #53): compares the two most recent dataset versions
   * of a source by natural key and reports added/removed/changed records.
   */
  getIngestionDiff(sourceSlug: string): Promise<AdminIngestionDiff>;
  listQualityIssues(limit: number): Promise<AdminQualityIssueList>;
  /** Ops-console dashboard (Issue #52): per-source publication / run / quality rollup. */
  getOperationsSummary(): Promise<AdminOperationsSummary>;
  resolveQualityIssue(
    id: string,
    input: AdminResolveQualityIssue,
    actor: string,
  ): Promise<AdminIngestionDetail['qualityIssues'][number] | null>;
  suspendAsset(
    id: string,
    input: AdminSuspendAsset,
    actor: string,
  ): Promise<AdminAssetPublication | null>;
  suspendAssetsBySource(
    sourceSlug: string,
    input: AdminSuspendSourceAssets,
    actor: string,
  ): Promise<AdminSourcePublication | null>;

  /**
   * Append-only audit trail (Issue #48). Implementations record one event per
   * administrative mutation and return the newest `limit` events together with
   * a chain-integrity verdict for the returned window.
   */
  listAuditEvents(limit: number): Promise<AuditEventList>;

  /**
   * Public feedback intake (Issue #54). Anonymous, rate-limited at the API
   * layer; returns the created report id. requestId is carried into the audit
   * event so the report correlates with the originating request.
   */
  submitFeedback(input: FeedbackSubmit, requestId: string | null): Promise<FeedbackSubmitResponse>;

  /** Admin review list for submitted feedback reports. */
  listFeedbackReports(query: {
    limit: number;
    status?: 'open' | 'converted' | 'dismissed' | undefined;
  }): Promise<AdminFeedbackList>;

  /** Marks a feedback report converted/dismissed with a resolution note. */
  resolveFeedbackReport(
    id: string,
    input: { status: 'converted' | 'dismissed'; reason: string },
    actor: string,
    requestId: string | null,
  ): Promise<AdminFeedbackList['items'][number] | null>;
}

/** Shared implementation of hash-chain recording used by both repositories. */
/**
 * Builds a chained audit event. `prev` is the newest known event (used by the
 * in-memory backend); callers that already resolved the previous hash — e.g.
 * Postgres reading the latest row — may pass it via `payload.prevHash`
 * (NewAuditEvent includes prevHash) with `prev` null.
 */
export async function recordAuditEvent(
  prev: AuditEvent | null,
  payload: NewAuditEvent,
  now: string,
): Promise<AuditEvent> {
  const prevHash = prev ? prev.eventHash : (payload.prevHash ?? GENESIS_HASH);
  const eventHash = await hashAuditEvent({ ...payload, prevHash });
  return { ...payload, id: crypto.randomUUID(), occurredAt: now, prevHash, eventHash };
}
