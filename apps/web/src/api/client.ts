import type {
  AdminAssetPublication,
  AdminCreateSource,
  AdminFeedbackList,
  AdminIngestionDetail,
  AdminIngestionList,
  AdminIngestionRun,
  AdminOperationsSummary,
  AdminQualityIssueList,
  AdminQualityIssueRecord,
  AdminResolveQualityIssue,
  AdminSourceResponse,
  AdminSourcePublication,
  AdminUpdateSource,
  AssetCountSummary,
  AssetDetail,
  AssetSearchResponse,
  AssetType,
  AuditEventList,
  FeedbackSubmit,
  FeedbackSubmitResponse,
  GeocodeResponse,
  HealthResponse,
  QualityStatus,
  SourceListResponse,
  SuggestResponse,
} from '@pimm/contracts';
import type { BBox } from '@pimm/contracts';

/** Resolves the API base URL from the Vite env, falling back to the dev proxy. */
export function apiBaseUrl(): string {
  const fromEnv =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE_URL : undefined;
  return (fromEnv ?? '/api/v1').replace(/\/$/, '');
}

/** Error carrying the HTTP status so callers can distinguish 404 from 5xx. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface AssetSearchParams {
  bbox?: BBox;
  types?: readonly AssetType[];
  quality?: readonly QualityStatus[];
  q?: string;
  prefectureCode?: string;
  municipalityCode?: string;
  limit?: number;
  cursor?: string;
}

/** Filters shared by search and export; export adds the required `format`. */
export interface ExportParams {
  format: 'csv' | 'geojson';
  bbox?: BBox;
  types?: readonly AssetType[];
  quality?: readonly QualityStatus[];
  q?: string;
  prefectureCode?: string;
  municipalityCode?: string;
  limit?: number;
}

function buildAssetQuery(params: AssetSearchParams): string {
  const search = new URLSearchParams();
  if (params.bbox) {
    search.set('bbox', params.bbox.join(','));
  }
  if (params.types && params.types.length > 0) {
    search.set('types', params.types.join(','));
  }
  if (params.quality && params.quality.length > 0) {
    search.set('quality', params.quality.join(','));
  }
  if (params.q && params.q.trim() !== '') {
    search.set('q', params.q.trim());
  }
  if (params.prefectureCode) {
    search.set('prefectureCode', params.prefectureCode);
  }
  if (params.municipalityCode) {
    search.set('municipalityCode', params.municipalityCode);
  }
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  if (params.cursor) {
    search.set('cursor', params.cursor);
  }
  return search.toString();
}

/** Builds the query string for GET /export (format is required by the API). */
function buildExportQuery(params: ExportParams): string {
  const search = new URLSearchParams();
  search.set('format', params.format);
  if (params.bbox) {
    search.set('bbox', params.bbox.join(','));
  }
  if (params.types && params.types.length > 0) {
    search.set('types', params.types.join(','));
  }
  if (params.quality && params.quality.length > 0) {
    search.set('quality', params.quality.join(','));
  }
  if (params.q && params.q.trim() !== '') {
    search.set('q', params.q.trim());
  }
  if (params.prefectureCode) {
    search.set('prefectureCode', params.prefectureCode);
  }
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  return search.toString();
}

/** Injectable fetch so tests can supply a stub without touching globals. */
export type FetchLike = typeof fetch;

async function getJson<T>(url: string, fetchImpl: FetchLike, init?: RequestInit): Promise<T> {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    ...init,
  });
  return parseJsonResponse<T>(res);
}

async function postJson<T>(url: string, fetchImpl: FetchLike, body?: unknown): Promise<T> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers:
      body === undefined
        ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: 'include',
  });
  return parseJsonResponse<T>(res);
}

async function patchJson<T>(url: string, fetchImpl: FetchLike, body: unknown): Promise<T> {
  const res = await fetchImpl(url, {
    method: 'PATCH',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return parseJsonResponse<T>(res);
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object' && 'title' in body) {
        detail = String((body as { title: unknown }).title);
      }
    } catch {
      // Non-JSON error body; keep the status text.
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Thin typed wrapper over the public REST API (設計書 §7.2). */
export class ApiClient {
  private readonly base: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: { baseUrl?: string; fetchImpl?: FetchLike } = {}) {
    this.base = (options.baseUrl ?? apiBaseUrl()).replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  searchAssets(params: AssetSearchParams): Promise<AssetSearchResponse> {
    const qs = buildAssetQuery(params);
    return getJson<AssetSearchResponse>(`${this.base}/assets${qs ? `?${qs}` : ''}`, this.fetchImpl);
  }

  getAsset(id: string): Promise<AssetDetail> {
    return getJson<AssetDetail>(`${this.base}/assets/${encodeURIComponent(id)}`, this.fetchImpl);
  }

  getSummary(params: Pick<AssetSearchParams, 'bbox' | 'types'>): Promise<AssetCountSummary> {
    const search = new URLSearchParams();
    if (params.bbox) search.set('bbox', params.bbox.join(','));
    if (params.types && params.types.length > 0) search.set('types', params.types.join(','));
    const qs = search.toString();
    return getJson<AssetCountSummary>(
      `${this.base}/assets/summary${qs ? `?${qs}` : ''}`,
      this.fetchImpl,
    );
  }

  getSources(): Promise<SourceListResponse> {
    return getJson<SourceListResponse>(`${this.base}/sources`, this.fetchImpl);
  }

  suggest(q: string, limit = 10): Promise<SuggestResponse> {
    const qs = new URLSearchParams({ q, limit: String(limit) }).toString();
    return getJson<SuggestResponse>(`${this.base}/suggest?${qs}`, this.fetchImpl);
  }

  geocode(q: string): Promise<GeocodeResponse> {
    const qs = new URLSearchParams({ q }).toString();
    return getJson<GeocodeResponse>(`${this.base}/geocode?${qs}`, this.fetchImpl);
  }

  getHealth(): Promise<HealthResponse> {
    return getJson<HealthResponse>(`${this.base}/health`, this.fetchImpl);
  }

  /**
   * Returns the download URL for the license-controlled export endpoint.
   * The server enforces redistribution policy; excluded sources are reported
   * via the X-Excluded-Sources response header.
   */
  getExportUrl(params: ExportParams): string {
    const qs = buildExportQuery(params);
    return `${this.base}/export${qs ? `?${qs}` : ''}`;
  }

  createAdminSource(input: AdminCreateSource): Promise<AdminSourceResponse> {
    return postJson<AdminSourceResponse>(`${this.base}/admin/sources`, this.fetchImpl, input);
  }

  updateAdminSource(slug: string, input: AdminUpdateSource): Promise<AdminSourceResponse> {
    return patchJson<AdminSourceResponse>(
      `${this.base}/admin/sources/${encodeURIComponent(slug)}`,
      this.fetchImpl,
      input,
    );
  }

  startAdminIngestion(sourceSlug: string): Promise<AdminIngestionRun> {
    return postJson<AdminIngestionRun>(
      `${this.base}/admin/sources/${encodeURIComponent(sourceSlug)}/ingestions`,
      this.fetchImpl,
    );
  }

  getAdminIngestion(id: string): Promise<AdminIngestionDetail> {
    return getJson<AdminIngestionDetail>(
      `${this.base}/admin/ingestions/${encodeURIComponent(id)}`,
      this.fetchImpl,
      { credentials: 'include' },
    );
  }

  listAdminIngestions(limit = 20): Promise<AdminIngestionList> {
    return getJson<AdminIngestionList>(
      `${this.base}/admin/ingestions?limit=${encodeURIComponent(String(limit))}`,
      this.fetchImpl,
      { credentials: 'include' },
    );
  }

  /** Ops-console dashboard rollup (Issue #52); requires admin/reviewer identity. */
  getAdminOperations(): Promise<AdminOperationsSummary> {
    return getJson<AdminOperationsSummary>(`${this.base}/admin/operations`, this.fetchImpl);
  }

  listAdminQualityIssues(limit = 50): Promise<AdminQualityIssueList> {
    return getJson<AdminQualityIssueList>(
      `${this.base}/admin/quality-issues?limit=${encodeURIComponent(String(limit))}`,
      this.fetchImpl,
      { credentials: 'include' },
    );
  }

  suspendAdminAsset(id: string, reason: string): Promise<AdminAssetPublication> {
    return postJson<AdminAssetPublication>(
      `${this.base}/admin/assets/${encodeURIComponent(id)}/suspend`,
      this.fetchImpl,
      { reason },
    );
  }

  suspendAdminSourceAssets(sourceSlug: string, reason: string): Promise<AdminSourcePublication> {
    return postJson<AdminSourcePublication>(
      `${this.base}/admin/sources/${encodeURIComponent(sourceSlug)}/suspend-assets`,
      this.fetchImpl,
      { reason },
    );
  }

  resolveAdminQualityIssue(
    id: string,
    input: AdminResolveQualityIssue,
  ): Promise<AdminQualityIssueRecord> {
    return postJson<AdminQualityIssueRecord>(
      `${this.base}/admin/quality-issues/${encodeURIComponent(id)}/resolve`,
      this.fetchImpl,
      input,
    );
  }

  /** Append-only audit trail (Issue #48); requires admin/reviewer identity. */
  listAdminAuditEvents(limit = 50): Promise<AuditEventList> {
    return getJson<AuditEventList>(
      `${this.base}/admin/audit-events?limit=${encodeURIComponent(String(limit))}`,
      this.fetchImpl,
      { credentials: 'include' },
    );
  }

  /** Public feedback intake (Issue #54) — anonymous, rate-limited. */
  submitFeedback(input: FeedbackSubmit): Promise<FeedbackSubmitResponse> {
    return postJson<FeedbackSubmitResponse>(`${this.base}/feedback`, this.fetchImpl, input);
  }

  /** Admin review list of feedback reports (Issue #54). */
  listAdminFeedbackReports(
    limit = 50,
    status?: 'open' | 'converted' | 'dismissed',
  ): Promise<AdminFeedbackList> {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (status) qs.set('status', status);
    return getJson<AdminFeedbackList>(`${this.base}/admin/feedback-reports?${qs}`, this.fetchImpl, {
      credentials: 'include',
    });
  }

  resolveAdminFeedback(
    id: string,
    input: { status: 'converted' | 'dismissed'; reason: string },
  ): Promise<AdminFeedbackList['items'][number]> {
    return postJson<AdminFeedbackList['items'][number]>(
      `${this.base}/admin/feedback-reports/${encodeURIComponent(id)}/resolve`,
      this.fetchImpl,
      input,
    );
  }
}

/** Exposed for tests that assert query-string construction. */
export const _internal = { buildAssetQuery, buildExportQuery };
