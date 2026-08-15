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

describe('buildExportQuery / getExportUrl', () => {
  it('builds an export URL with format and current filters', () => {
    const qs = _internal.buildExportQuery({
      format: 'geojson',
      bbox: [139, 35, 140, 36],
      types: ['bridge'],
      quality: ['verified', 'reference'],
      q: '大橋',
      limit: 1000,
    });
    const params = new URLSearchParams(qs);
    expect(params.get('format')).toBe('geojson');
    expect(params.get('bbox')).toBe('139,35,140,36');
    expect(params.get('types')).toBe('bridge');
    expect(params.get('quality')).toBe('verified,reference');
    expect(params.get('q')).toBe('大橋');
    expect(params.get('limit')).toBe('1000');
  });

  it('omits empty filters from the export URL', () => {
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl: vi.fn() });
    expect(client.getExportUrl({ format: 'csv', types: [], quality: [], q: '  ' })).toBe(
      '/api/v1/export?format=csv',
    );
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

  it('posts a new admin source with credentials', async () => {
    const payload = {
      slug: 'new-source',
      name: '新規ソース',
      providerName: '新規提供者',
      sourceUrl: 'https://example.com/new.geojson',
      accessType: 'file',
      format: 'geojson',
      licenseName: 'CC-BY-4.0',
      licenseUrl: null,
      redistribution: 'allowed',
      attributionText: null,
      refreshCron: null,
      enabled: false,
      lastFetchedAt: null,
      sourceUpdatedAt: null,
      publishedAssetCount: 0,
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(
      client.createAdminSource({
        slug: 'new-source',
        name: '新規ソース',
        providerName: '新規提供者',
        sourceUrl: 'https://example.com/new.geojson',
        accessType: 'file',
        format: 'geojson',
        licenseName: 'CC-BY-4.0',
        licenseUrl: null,
        redistribution: 'allowed',
        attributionText: null,
        refreshCron: null,
        enabled: false,
      }),
    ).resolves.toEqual(payload);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('/api/v1/admin/sources');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: expect.stringContaining('"slug":"new-source"'),
    });
  });

  it('patches an admin source with credentials', async () => {
    const payload = {
      slug: 'sample-bridges',
      name: '更新後ソース',
      providerName: 'テスト提供機関',
      sourceUrl: 'https://example.com/source',
      accessType: 'file',
      format: 'geojson',
      licenseName: 'CC-BY-4.0',
      licenseUrl: null,
      redistribution: 'allowed',
      attributionText: null,
      refreshCron: null,
      enabled: true,
      lastFetchedAt: null,
      sourceUpdatedAt: null,
      publishedAssetCount: 10,
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(
      client.updateAdminSource('sample-bridges', { name: '更新後ソース' }),
    ).resolves.toEqual(payload);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('/api/v1/admin/sources/sample-bridges');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'PATCH',
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: '更新後ソース' }),
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

  it('gets admin ingestion history and quality issue lists with credentials', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/admin/ingestions?')) return jsonResponse({ items: [] });
      if (url.includes('/admin/quality-issues?')) return jsonResponse({ items: [] });
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(client.listAdminIngestions(20)).resolves.toEqual({ items: [] });
    await expect(client.listAdminQualityIssues(50)).resolves.toEqual({ items: [] });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('/api/v1/admin/ingestions?limit=20');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe('/api/v1/admin/quality-issues?limit=50');
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ credentials: 'include' });
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

  it('posts a source-wide suspend reason to the admin source publication endpoint', async () => {
    const payload = {
      sourceSlug: 'sample-bridges',
      publicationStatus: 'suspended',
      suspendedCount: 12,
      reason: 'ライセンス変更のため再確認',
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(
      client.suspendAdminSourceAssets(payload.sourceSlug, payload.reason),
    ).resolves.toEqual(payload);

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      '/api/v1/admin/sources/sample-bridges/suspend-assets',
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

  it('requests name suggestions with limit', async () => {
    const payload = { items: [{ name: 'ふたご橋', count: 2 }] };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(client.suggest('ふたご', 5)).resolves.toEqual(payload);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      '/api/v1/suggest?q=%E3%81%B5%E3%81%9F%E3%81%94&limit=5',
    );
  });

  it('requests address geocoding', async () => {
    const payload = {
      items: [
        {
          title: '千代田区',
          address: null,
          lon: 139.7,
          lat: 35.6,
          municipalityCode: '13101',
          municipalityName: '千代田区',
        },
      ],
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(client.geocode('大阪市北区')).resolves.toEqual(payload);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/api/v1/geocode?q=');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(encodeURIComponent('大阪市北区'));
  });

  it('lists admin audit events with credentials', async () => {
    const payload = {
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          occurredAt: '2026-07-19T00:00:00.000Z',
          actor: 'admin@example.com',
          action: 'source.created',
          targetType: 'source',
          targetId: 'sample-bridges',
          summary: 'ソースを登録',
          detail: {},
          requestId: null,
          prevHash: '0'.repeat(64),
          eventHash: 'a'.repeat(64),
        },
      ],
      valid: true,
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(client.listAdminAuditEvents(30)).resolves.toEqual(payload);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('/api/v1/admin/audit-events?limit=30');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('submits public feedback to the rate-limited endpoint', async () => {
    const payload = {
      id: '00000000-0000-4000-8000-000000000002',
      status: 'received',
      message: '受け付けました',
    };
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(payload),
    );
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(
      client.submitFeedback({ category: 'location', detail: '位置がずれています' }),
    ).resolves.toEqual(payload);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('/api/v1/feedback');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('lists and resolves feedback reports as admin', async () => {
    const report = {
      id: '00000000-0000-4000-8000-000000000003',
      category: 'link',
      detail: 'リンク切れ',
      pageUrl: null,
      status: 'open',
      resolutionNote: null,
      createdAt: '2026-07-19T00:00:00.000Z',
      resolvedAt: null,
    };
    const fetchImpl = vi
      .fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ items: [report] }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [report] }))
      .mockResolvedValueOnce(jsonResponse({ ...report, status: 'converted' }));
    const client = new ApiClient({ baseUrl: '/api/v1', fetchImpl });

    await expect(client.listAdminFeedbackReports(50, 'open')).resolves.toEqual({
      items: [report],
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      '/api/v1/admin/feedback-reports?limit=50&status=open',
    );

    await expect(
      client.resolveAdminFeedback(report.id, { status: 'converted', reason: '品質issue化' }),
    ).resolves.toMatchObject({ status: 'converted' });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe(
      `/api/v1/admin/feedback-reports/${report.id}/resolve`,
    );
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
  });
});
