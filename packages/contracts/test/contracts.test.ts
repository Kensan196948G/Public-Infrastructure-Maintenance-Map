import { describe, expect, it } from 'vitest';
import {
  AdminOperationsSummarySchema,
  AssetSearchQuerySchema,
  AssetTypeSchema,
  BBoxParamSchema,
  ExportQuerySchema,
  GeometrySchema,
  isExportAllowed,
  LonLatTupleSchema,
  MAX_BBOX_AREA_DEG2,
  OPERATIONS_RECENT_RUN_WINDOW,
  PositionSchema,
  problem,
  ProblemDetailsSchema,
  QUALITY_RULES,
  SourceInfoSchema,
  summarizeOperations,
} from '../src/index.js';
import type { AdminSourceOperations } from '../src/index.js';

describe('enums', () => {
  it('accepts known asset types', () => {
    expect(AssetTypeSchema.parse('bridge')).toBe('bridge');
  });
  it('rejects unknown asset types', () => {
    expect(AssetTypeSchema.safeParse('tunnel').success).toBe(false);
  });
});

describe('BBoxParamSchema', () => {
  it('parses a valid bbox string', () => {
    expect(BBoxParamSchema.parse('139.5,35.5,140.0,36.0')).toEqual([139.5, 35.5, 140.0, 36.0]);
  });
  it('rejects swapped min/max', () => {
    expect(BBoxParamSchema.safeParse('140.0,36.0,139.5,35.5').success).toBe(false);
  });
  it('rejects malformed input', () => {
    expect(BBoxParamSchema.safeParse('139.5,35.5,140.0').success).toBe(false);
    expect(BBoxParamSchema.safeParse('a,b,c,d').success).toBe(false);
  });
  it('rejects out-of-range longitude', () => {
    expect(BBoxParamSchema.safeParse('181,35,182,36').success).toBe(false);
  });
  it('accepts a bbox exactly at the area limit', () => {
    expect(BBoxParamSchema.safeParse('0,0,2,2').success).toBe(true);
  });
  it('rejects a bbox exceeding the area limit (performance guard)', () => {
    expect(MAX_BBOX_AREA_DEG2).toBe(4);
    expect(BBoxParamSchema.safeParse('0,0,3,3').success).toBe(false);
  });
});

describe('PositionSchema / LonLatTupleSchema', () => {
  it('accepts a position within EPSG:4326 bounds', () => {
    expect(PositionSchema.safeParse([139.7, 35.6]).success).toBe(true);
  });
  it('accepts a position with an elevation component', () => {
    expect(PositionSchema.safeParse([139.7, 35.6, 12.3]).success).toBe(true);
  });
  it('rejects out-of-range longitude', () => {
    expect(PositionSchema.safeParse([200, 35.6]).success).toBe(false);
  });
  it('rejects out-of-range latitude', () => {
    expect(PositionSchema.safeParse([139.7, 95]).success).toBe(false);
  });
  it('rejects an out-of-range representative-point tuple', () => {
    expect(LonLatTupleSchema.safeParse([139.7, 35.6]).success).toBe(true);
    expect(LonLatTupleSchema.safeParse([-200, 35.6]).success).toBe(false);
    expect(LonLatTupleSchema.safeParse([139.7, -95]).success).toBe(false);
  });
});

describe('AssetSearchQuerySchema', () => {
  it('applies default limit', () => {
    const q = AssetSearchQuerySchema.parse({});
    expect(q.limit).toBe(100);
  });
  it('parses csv types', () => {
    const q = AssetSearchQuerySchema.parse({ types: 'bridge,river' });
    expect(q.types).toEqual(['bridge', 'river']);
  });
  it('rejects invalid type in csv', () => {
    expect(AssetSearchQuerySchema.safeParse({ types: 'bridge,castle' }).success).toBe(false);
  });
  it('rejects bad municipality code', () => {
    expect(AssetSearchQuerySchema.safeParse({ municipalityCode: '123' }).success).toBe(false);
  });
  it('caps limit at 500', () => {
    expect(AssetSearchQuerySchema.safeParse({ limit: '9999' }).success).toBe(false);
  });
});

describe('GeometrySchema', () => {
  it('accepts a valid point', () => {
    expect(GeometrySchema.parse({ type: 'Point', coordinates: [139.7, 35.6] }).type).toBe('Point');
  });
  it('rejects a polygon ring with fewer than 4 positions', () => {
    const bad = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    expect(GeometrySchema.safeParse(bad).success).toBe(false);
  });
  it('rejects a point with out-of-range coordinates', () => {
    expect(GeometrySchema.safeParse({ type: 'Point', coordinates: [200, 35.6] }).success).toBe(
      false,
    );
  });
});

describe('problem details', () => {
  it('builds an RFC 9457 payload with mapped status', () => {
    const p = problem('NOT_FOUND', '対象が見つかりません', { requestId: 'req-1' });
    expect(p.status).toBe(404);
    expect(p.code).toBe('NOT_FOUND');
    expect(ProblemDetailsSchema.parse(p).requestId).toBe('req-1');
  });
  it('rejects a status that does not match the known code mapping', () => {
    const mismatched = { type: 'about:blank', title: 'x', status: 200, code: 'NOT_FOUND' };
    expect(ProblemDetailsSchema.safeParse(mismatched).success).toBe(false);
  });
  it('allows an unrecognized code without enforcing a status', () => {
    const custom = { type: 'about:blank', title: 'x', status: 599, code: 'CUSTOM_CODE' };
    expect(ProblemDetailsSchema.safeParse(custom).success).toBe(true);
  });
});

describe('license / export control', () => {
  it('allows export for allowed/restricted, blocks prohibited/unknown', () => {
    expect(isExportAllowed('allowed')).toBe(true);
    expect(isExportAllowed('restricted')).toBe(true);
    expect(isExportAllowed('prohibited')).toBe(false);
    expect(isExportAllowed('unknown')).toBe(false);
  });
  it('export query requires a format', () => {
    expect(ExportQuerySchema.safeParse({}).success).toBe(false);
    expect(ExportQuerySchema.parse({ format: 'csv' }).limit).toBe(1000);
  });
});

describe('quality rules', () => {
  it('defines all eight rules from the design spec', () => {
    expect(Object.keys(QUALITY_RULES)).toHaveLength(8);
    expect(QUALITY_RULES.Q007.severity).toBe('error');
  });
});

describe('SourceInfoSchema', () => {
  it('rejects a non-kebab-case slug', () => {
    const base = {
      slug: 'Sample_Bridges',
      name: 'n',
      providerName: 'p',
      sourceUrl: 'https://example.com',
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
      publishedAssetCount: 0,
    };
    expect(SourceInfoSchema.safeParse(base).success).toBe(false);
    expect(SourceInfoSchema.safeParse({ ...base, slug: 'sample-bridges' }).success).toBe(true);
  });

  it('rejects non-http(s) URL schemes (defense in depth against javascript: links)', () => {
    const base = {
      slug: 'sample-bridges',
      name: 'n',
      providerName: 'p',
      sourceUrl: 'https://example.com',
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
      publishedAssetCount: 0,
    };
    expect(SourceInfoSchema.safeParse({ ...base, sourceUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(SourceInfoSchema.safeParse({ ...base, sourceUrl: 'ftp://example.com' }).success).toBe(
      false,
    );
    expect(SourceInfoSchema.safeParse({ ...base, licenseUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });
});

describe('admin operations summary (Issue #52)', () => {
  const row = (overrides: Partial<AdminSourceOperations>): AdminSourceOperations => ({
    slug: 'sample-bridges',
    name: 'サンプル橋梁',
    providerName: 'サンプル提供者',
    enabled: true,
    publishedCount: 10,
    draftCount: 1,
    suspendedCount: 2,
    hiddenCount: 3,
    lastRunAt: '2026-07-30T00:00:00.000Z',
    lastRunStatus: 'succeeded',
    recentRunCount: 5,
    recentSucceededCount: 4,
    openQualityIssueCount: 6,
    openErrorQualityIssueCount: 2,
    lastFetchedAt: '2026-07-29T00:00:00.000Z',
    sourceUpdatedAt: null,
    ...overrides,
  });

  it('sums totals across sources and stamps the run window', () => {
    const summary = summarizeOperations([
      row({}),
      row({ slug: 'z-disabled', enabled: false, publishedCount: 0, openQualityIssueCount: 1 }),
    ]);
    expect(AdminOperationsSummarySchema.parse(summary)).toBeTruthy();
    expect(summary.recentRunWindow).toBe(OPERATIONS_RECENT_RUN_WINDOW);
    expect(summary.totals).toEqual({
      sourceCount: 2,
      enabledSourceCount: 1,
      publishedCount: 10,
      suspendedCount: 4,
      hiddenCount: 6,
      openQualityIssueCount: 7,
    });
  });

  it('rejects negative counts and unknown run statuses', () => {
    const valid = summarizeOperations([row({})]);
    expect(
      AdminOperationsSummarySchema.safeParse({
        ...valid,
        sources: [row({ publishedCount: -1 })],
      }).success,
    ).toBe(false);
    expect(
      AdminOperationsSummarySchema.safeParse({
        ...valid,
        sources: [{ ...row({}), lastRunStatus: 'exploded' }],
      }).success,
    ).toBe(false);
  });
});
