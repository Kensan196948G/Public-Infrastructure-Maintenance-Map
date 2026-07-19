import { describe, expect, it, vi } from 'vitest';
import type { AssetSearchResponse } from '@pimm/contracts';
import { ApiClient, ApiError, _internal } from '../src/api/client.js';

describe('buildAssetQuery', () => {
  it('serializes bbox, types, quality and q', () => {
    const qs = _internal.buildAssetQuery({
      bbox: [139, 35, 140, 36],
      types: ['bridge', 'river'],
      quality: ['verified'],
      q: '大橋',
      limit: 200,
    });
    const params = new URLSearchParams(qs);
    expect(params.get('bbox')).toBe('139,35,140,36');
    expect(params.get('types')).toBe('bridge,river');
    expect(params.get('quality')).toBe('verified');
    expect(params.get('q')).toBe('大橋');
    expect(params.get('limit')).toBe('200');
  });

  it('omits empty filters', () => {
    const qs = _internal.buildAssetQuery({ types: [], quality: [], q: '  ' });
    expect(qs).toBe('');
  });
});

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

describe('ApiClient', () => {
  it('requests /assets with the built query string', async () => {
    const payload: AssetSearchResponse = { items: [], nextCursor: null };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: 'http://x/api/v1', fetchImpl });

    const res = await client.searchAssets({ bbox: [139, 35, 140, 36], types: ['bridge'] });

    expect(res).toEqual(payload);
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0] ?? '');
    expect(calledUrl).toContain('http://x/api/v1/assets?');
    expect(calledUrl).toContain('bbox=139%2C35%2C140%2C36');
    expect(calledUrl).toContain('types=bridge');
  });

  it('encodes the asset id in the detail path', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ id: 'a b' }),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });
    await client.getAsset('a b');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('/api/v1/assets/a%20b');
  });

  it('throws ApiError carrying the HTTP status on failure', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ title: 'Not Found' }, { ok: false, status: 404 }),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });
    await expect(client.getAsset('missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    });
    await expect(client.getAsset('missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('posts to the admin ingestion endpoint with credentials', async () => {
    const payload = {
      id: '00000000-0000-4000-8000-000000000001',
      sourceSlug: 'sample-bridges',
      startedAt: '2026-07-19T00:00:00.000Z',
      finishedAt: null,
      status: 'running',
      fetchedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      warningCount: 0,
      errorCode: null,
      errorSummary: null,
      triggeredBy: 'admin@example.com',
      correlationId: 'req-1',
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(client.startAdminIngestion('sample-bridges')).resolves.toEqual(payload);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      '/api/v1/admin/sources/sample-bridges/ingestions',
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
    });
  });

  it('gets admin ingestion detail with credentials', async () => {
    const payload = {
      run: {
        id: '00000000-0000-4000-8000-000000000001',
        sourceSlug: 'sample-bridges',
        startedAt: '2026-07-19T00:00:00.000Z',
        finishedAt: null,
        status: 'running',
        fetchedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        warningCount: 0,
        errorCode: null,
        errorSummary: null,
        triggeredBy: 'admin@example.com',
        correlationId: 'req-1',
      },
      qualityIssues: [],
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(client.getAdminIngestion(payload.run.id)).resolves.toEqual(payload);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      '/api/v1/admin/ingestions/00000000-0000-4000-8000-000000000001',
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
    });
  });

  it('posts a suspend reason to the admin asset publication endpoint', async () => {
    const payload = {
      id: '11111111-1111-4111-8111-111111111111',
      publicationStatus: 'suspended',
      reason: 'ライセンス確認中',
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(client.suspendAdminAsset(payload.id, payload.reason)).resolves.toEqual(payload);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      '/api/v1/admin/assets/11111111-1111-4111-8111-111111111111/suspend',
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason: payload.reason }),
    });
  });

  it('posts a resolution decision to the admin quality issue endpoint', async () => {
    const payload = {
      id: '00000000-0000-4000-8000-000000000101',
      assetId: null,
      runId: '00000000-0000-4000-8000-000000000001',
      ruleCode: 'Q005',
      severity: 'warning',
      fieldName: 'source_updated_at',
      observedValue: null,
      message: '更新日が不明です',
      resolutionStatus: 'accepted',
      createdAt: '2026-07-19T00:00:00.000Z',
      resolvedAt: '2026-07-19T00:10:00.000Z',
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(
      client.resolveAdminQualityIssue(payload.id, {
        resolutionStatus: 'accepted',
        reason: '原典で確認済み',
      }),
    ).resolves.toEqual(payload);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      '/api/v1/admin/quality-issues/00000000-0000-4000-8000-000000000101/resolve',
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ resolutionStatus: 'accepted', reason: '原典で確認済み' }),
    });
  });
});
