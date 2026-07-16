import { describe, expect, it } from 'vitest';
import {
  AssetSearchQuerySchema,
  AssetTypeSchema,
  BBoxParamSchema,
  ExportQuerySchema,
  GeometrySchema,
  isExportAllowed,
  problem,
  ProblemDetailsSchema,
  QUALITY_RULES,
  SourceInfoSchema,
} from '../src/index.js';

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
});

describe('problem details', () => {
  it('builds an RFC 9457 payload with mapped status', () => {
    const p = problem('NOT_FOUND', '対象が見つかりません', { requestId: 'req-1' });
    expect(p.status).toBe(404);
    expect(p.code).toBe('NOT_FOUND');
    expect(ProblemDetailsSchema.parse(p).requestId).toBe('req-1');
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
