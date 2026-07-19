import { beforeAll, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type {
  AssetCountSummary,
  AssetDetail,
  AssetSearchResponse,
  ProblemDetails,
  SourceInfo,
} from '@pimm/contracts';
import { InMemoryAssetRepository } from '@pimm/database';
import { buildSampleSeed } from '@pimm/source-adapters';
import { createApp } from '../src/app.js';
import type { ApiConfig } from '../src/config.js';
import { sanitizeCsvCell } from '../src/csv-export.js';

const CONFIG: ApiConfig = {
  allowedOrigin: '*',
  rateLimitPerMinute: 10_000,
  version: 'test',
  adminEmails: ['admin@example.com'],
  reviewerEmails: ['reviewer@example.com'],
  requireAccessJwt: false,
};

let app: Hono<never>;

beforeAll(async () => {
  const seed = await buildSampleSeed();
  app = createApp(new InMemoryAssetRepository(seed), CONFIG) as unknown as Hono<never>;
});

const get = (path: string, headers?: Record<string, string>) =>
  app.request(`http://localhost${path}`, { headers: headers ?? {} });

const adminHeaders = {
  'CF-Access-Authenticated-User-Email': 'admin@example.com',
};

const reviewerHeaders = {
  'CF-Access-Authenticated-User-Email': 'reviewer@example.com',
};

describe('GET /api/v1/health', () => {
  it('answers ok with version and time', async () => {
    const res = await get('/api/v1/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });
});

describe('GET /api/v1/assets', () => {
  it('returns sample assets inside a Tokyo bbox', async () => {
    const res = await get('/api/v1/assets?bbox=139.6,35.6,139.9,35.8');
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssetSearchResponse;
    expect(body.items.length).toBeGreaterThan(10);
    expect(new Set(body.items.map((i) => i.type))).toEqual(
      new Set(['bridge', 'river', 'public_facility']),
    );
  });

  it('filters by type', async () => {
    const res = await get('/api/v1/assets?types=river');
    const body = (await res.json()) as AssetSearchResponse;
    expect(body.items.length).toBe(3);
    expect(body.items.every((i) => i.type === 'river')).toBe(true);
  });

  it('searches by keyword and reflects duplicate flags', async () => {
    const res = await get('/api/v1/assets?q=ふたご');
    const body = (await res.json()) as AssetSearchResponse;
    expect(body.items).toHaveLength(2);
    expect(body.items.every((i) => i.quality.status === 'review')).toBe(true);
    expect(body.items.every((i) => i.quality.openIssueCodes.includes('Q005'))).toBe(true);
  });

  it('paginates with cursors', async () => {
    const p1raw = await get('/api/v1/assets?limit=5');
    const p1 = (await p1raw.json()) as AssetSearchResponse;
    expect(p1.items).toHaveLength(5);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = (await (
      await get(`/api/v1/assets?limit=5&cursor=${encodeURIComponent(p1.nextCursor!)}`)
    ).json()) as AssetSearchResponse;
    const ids = new Set([...p1.items, ...p2.items].map((i) => i.id));
    expect(ids.size).toBe(p1.items.length + p2.items.length);
  });

  it('rejects malformed bbox with Problem Details', async () => {
    const res = await get('/api/v1/assets?bbox=abc', { 'X-Request-Id': 'req-test-1' });
    expect(res.status).toBe(400);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.requestId).toBe('req-test-1');
  });

  it('rejects an oversized bbox (performance guard)', async () => {
    const res = await get('/api/v1/assets?bbox=125,30,145,45');
    expect(res.status).toBe(400);
  });

  it('rejects a garbage cursor', async () => {
    const res = await get('/api/v1/assets?cursor=%21%21%21');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/assets/:id', () => {
  it('returns full detail with provenance and notices', async () => {
    const list = (await (
      await get('/api/v1/assets?types=bridge&limit=1')
    ).json()) as AssetSearchResponse;
    const id = list.items[0]!.id;
    const res = await get(`/api/v1/assets/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AssetDetail;
    expect(body.source.sourceUrl).toMatch(/^https:/u);
    expect(body.notices.length).toBeGreaterThan(0);
    expect(body.attributes).toBeInstanceOf(Array);
  });

  it('404s for an unknown uuid and 400s for a malformed id', async () => {
    expect((await get('/api/v1/assets/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await get('/api/v1/assets/not-a-uuid')).status).toBe(400);
  });
});

describe('GET /api/v1/assets/summary', () => {
  it('counts by type', async () => {
    const res = await get('/api/v1/assets/summary?bbox=139.6,35.6,139.9,35.8');
    const body = (await res.json()) as AssetCountSummary;
    expect(body.total).toBeGreaterThan(0);
    expect(body.byType.bridge).toBeGreaterThan(0);
  });

  it('rejects an oversized bbox (same performance guard as /assets)', async () => {
    const res = await get('/api/v1/assets/summary?bbox=125,30,145,45');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/sources', () => {
  it('lists the 3 sample sources with license info', async () => {
    const res = await get('/api/v1/sources');
    const body = (await res.json()) as { items: SourceInfo[] };
    expect(body.items).toHaveLength(3);
    expect(body.items.every((s) => s.licenseName.length > 0)).toBe(true);
  });
  it('resolves a source by slug and 404s otherwise', async () => {
    expect((await get('/api/v1/sources/sample-bridges')).status).toBe(200);
    expect((await get('/api/v1/sources/nope')).status).toBe(404);
  });
});

describe('GET /api/v1/export (license control, FR-08)', () => {
  it('exports CSV with BOM and attribution-safe cells', async () => {
    const res = await get('/api/v1/export?format=csv&types=bridge');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes.subarray(3));

    expect(text).toContain('みらい大橋');
  });

  it('excludes prohibited sources (rivers) from export', async () => {
    const res = await get('/api/v1/export?format=geojson&types=river');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Excluded-Sources')).toContain('sample-rivers');
    const body = (await res.json()) as { features: unknown[]; excludedSources: string[] };
    expect(body.features).toHaveLength(0);
    expect(body.excludedSources).toContain('sample-rivers');
  });

  it('includes attributions for exported sources', async () => {
    const res = await get('/api/v1/export?format=geojson&types=public_facility');
    const body = (await res.json()) as { features: unknown[]; attributions: string[] };
    expect(body.features.length).toBeGreaterThan(0);
    expect(body.attributions.some((a) => a.includes('サンプル自治体'))).toBe(true);
  });

  it('requires a format parameter', async () => {
    expect((await get('/api/v1/export')).status).toBe(400);
  });

  it('rejects an oversized bbox (same performance guard as /assets)', async () => {
    const res = await get('/api/v1/export?format=csv&bbox=125,30,145,45');
    expect(res.status).toBe(400);
  });

  it('caps limit at 2000 (reduced from the original 10000 ceiling)', async () => {
    expect((await get('/api/v1/export?format=csv&limit=2000')).status).toBe(200);
    expect((await get('/api/v1/export?format=csv&limit=2001')).status).toBe(400);
  });
});

describe('admin API (Issue #4 / FR-13 / FR-14)', () => {
  it('allows credentialed cross-origin admin preflight when ALLOWED_ORIGIN is fixed', async () => {
    const seed = await buildSampleSeed();
    const corsApp = createApp(new InMemoryAssetRepository(seed), {
      ...CONFIG,
      allowedOrigin: 'https://admin.example.com',
    }) as unknown as Hono<never>;

    const res = await corsApp.request('http://localhost/api/v1/admin/sources/sample/ingestions', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://admin.example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects unauthenticated access before any admin operation', async () => {
    const res = await get('/api/v1/admin/ingestions/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(401);
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('rejects authenticated users outside the server-side admin/reviewer allowlists', async () => {
    const res = await get('/api/v1/admin/ingestions/00000000-0000-4000-8000-000000000000', {
      'CF-Access-Authenticated-User-Email': 'viewer@example.com',
    });
    expect(res.status).toBe(403);
  });

  it('does not trust client-supplied role headers for admin authorization', async () => {
    const res = await get('/api/v1/admin/ingestions/00000000-0000-4000-8000-000000000000', {
      'CF-Access-Authenticated-User-Email': 'viewer@example.com',
      'X-PIMM-Admin-Roles': 'admin',
    });
    expect(res.status).toBe(403);
  });

  it('lets an admin register and update a source', async () => {
    const create = await app.request('http://localhost/api/v1/admin/sources', {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'test-admin-source',
        name: '管理APIテストソース',
        providerName: 'テスト管理者',
        sourceUrl: 'https://example.com/admin-source.json',
        accessType: 'file',
        format: 'json',
        licenseName: 'CC BY 4.0',
        redistribution: 'allowed',
        enabled: false,
      }),
    });
    expect(create.status).toBe(201);

    const patch = await app.request('http://localhost/api/v1/admin/sources/test-admin-source', {
      method: 'PATCH',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as SourceInfo;
    expect(body.enabled).toBe(true);
  });

  it('records an ingestion trigger and exposes the audit detail to reviewers', async () => {
    const trigger = await app.request(
      'http://localhost/api/v1/admin/sources/sample-bridges/ingestions',
      {
        method: 'POST',
        headers: adminHeaders,
      },
    );
    expect(trigger.status).toBe(202);
    const run = (await trigger.json()) as { id: string; triggeredBy: string };
    expect(run.triggeredBy).toBe('admin@example.com');

    const detail = await get(`/api/v1/admin/ingestions/${run.id}`, reviewerHeaders);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { run: { id: string }; qualityIssues: unknown[] };
    expect(body.run.id).toBe(run.id);
    expect(body.qualityIssues).toEqual([]);

    const history = await get('/api/v1/admin/ingestions?limit=10', reviewerHeaders);
    expect(history.status).toBe(200);
    const historyBody = (await history.json()) as { items: { id: string }[] };
    expect(historyBody.items.some((item) => item.id === run.id)).toBe(true);
  });

  it('suspends an asset and removes it from the public detail endpoint', async () => {
    const list = (await (
      await get('/api/v1/assets?types=bridge&limit=1')
    ).json()) as AssetSearchResponse;
    const id = list.items[0]!.id;
    const suspend = await app.request(`http://localhost/api/v1/admin/assets/${id}/suspend`, {
      method: 'POST',
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'ライセンス棚卸しのため一時停止' }),
    });
    expect(suspend.status).toBe(200);
    expect((await get(`/api/v1/assets/${id}`)).status).toBe(404);

    const issues = await get('/api/v1/admin/quality-issues?limit=10', reviewerHeaders);
    expect(issues.status).toBe(200);
    const body = (await issues.json()) as { items: { assetId: string; ruleCode: string }[] };
    expect(body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ assetId: id, ruleCode: 'Q007' })]),
    );
  });

  it('validates admin list limits', async () => {
    expect((await get('/api/v1/admin/ingestions?limit=0', reviewerHeaders)).status).toBe(400);
    expect((await get('/api/v1/admin/quality-issues?limit=201', reviewerHeaders)).status).toBe(400);
  });

  it('suspends all published assets for a source when a license changes', async () => {
    const before = (await (await get('/api/v1/assets?limit=100')).json()) as AssetSearchResponse;
    expect(before.items.some((a) => a.sourceSlug === 'sample-bridges')).toBe(true);

    const suspend = await app.request(
      'http://localhost/api/v1/admin/sources/sample-bridges/suspend-assets',
      {
        method: 'POST',
        headers: { ...adminHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'ライセンス変更のため再確認' }),
      },
    );
    expect(suspend.status).toBe(200);
    const body = (await suspend.json()) as { sourceSlug: string; suspendedCount: number };
    expect(body.sourceSlug).toBe('sample-bridges');
    expect(body.suspendedCount).toBeGreaterThan(0);

    const after = (await (await get('/api/v1/assets?limit=100')).json()) as AssetSearchResponse;
    expect(after.items.some((a) => a.sourceSlug === 'sample-bridges')).toBe(false);
  });
});

describe('security', () => {
  it('sets security headers on every response', async () => {
    const res = await get('/api/v1/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('sanitizes CSV formula injection', () => {
    expect(sanitizeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(sanitizeCsvCell('+1234')).toBe("'+1234");
    expect(sanitizeCsvCell('-5')).toBe("'-5");
    expect(sanitizeCsvCell('@cmd')).toBe("'@cmd");
    expect(sanitizeCsvCell('\tSUM(A1)')).toBe("'\tSUM(A1)");
    expect(sanitizeCsvCell('\rSUM(A1)')).toBe("'\rSUM(A1)");
    expect(sanitizeCsvCell('普通の名称')).toBe('普通の名称');
  });

  it('rate limits after the configured threshold', async () => {
    const seed = await buildSampleSeed();
    const limited = createApp(new InMemoryAssetRepository(seed), {
      ...CONFIG,
      rateLimitPerMinute: 3,
    });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await limited.request('http://localhost/api/v1/health');
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });

  it('answers unknown paths with Problem Details JSON', async () => {
    const res = await get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
  });
});
