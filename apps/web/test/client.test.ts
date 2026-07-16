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
});
