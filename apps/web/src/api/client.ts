import type {
  AssetCountSummary,
  AssetDetail,
  AssetSearchResponse,
  AssetType,
  AdminAssetPublication,
  AdminCreateSource,
  AdminIngestionDetail,
  AdminIngestionList,
  AdminIngestionRun,
  AdminQualityIssueList,
  AdminQualityIssueRecord,
  AdminResolveQualityIssue,
  AdminSourceResponse,
  AdminUpdateSource,
  HealthResponse,
  QualityStatus,
  SourceListResponse,
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
  limit?: number;
  cursor?: string;
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
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  if (params.cursor) {
    search.set('cursor', params.cursor);
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

  getHealth(): Promise<HealthResponse> {
    return getJson<HealthResponse>(`${this.base}/health`, this.fetchImpl);
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
}

/** Exposed for tests that assert query-string construction. */
export const _internal = { buildAssetQuery };
