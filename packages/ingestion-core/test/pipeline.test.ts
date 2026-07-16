import { describe, expect, it } from 'vitest';
import type { FetchResult, NormalizedAsset, SourceAdapter, SourceDescriptor } from '../src/index.js';
import { csvToObjects, parseCsv, runPipeline } from '../src/index.js';

interface RawRow {
  id: string;
  name: string | null;
  lon: number | null;
  lat: number | null;
  updated: string | null;
}

function makeAdapter(
  rows: RawRow[],
  descriptorOverrides: Partial<SourceDescriptor> = {},
): SourceAdapter<RawRow> {
  return {
    descriptor: {
      slug: 'test-source',
      name: 'テストソース',
      providerName: 'テスト提供者',
      sourceUrl: 'https://example.com/data',
      accessType: 'file',
      format: 'json',
      licenseName: 'CC-BY-4.0',
      licenseUrl: null,
      redistribution: 'allowed',
      attributionText: null,
      crs: 'EPSG:4326',
      ...descriptorOverrides,
    },
    fetch: () =>
      Promise.resolve({
        content: JSON.stringify(rows),
        fetchedAt: '2026-07-16T00:00:00.000Z',
      }),
    parse: (input: FetchResult) => JSON.parse(input.content) as RawRow[],
    normalize: (r): NormalizedAsset => ({
      sourceRecordId: r.id,
      assetType: 'bridge',
      name: r.name,
      originalName: r.name,
      geometry: r.lon !== null && r.lat !== null ? { type: 'Point', coordinates: [r.lon, r.lat] } : null,
      prefectureCode: null,
      municipalityCode: null,
      managingAuthority: null,
      sourceUpdatedAt: r.updated,
      attributes: [],
    }),
    schemaKeys: () => ['id', 'name', 'lon', 'lat', 'updated'],
  };
}

const CTX = { now: '2026-07-16T00:00:00.000Z' };

describe('runPipeline', () => {
  it('separates accepted and quarantined records and assigns badges', async () => {
    const result = await runPipeline(
      makeAdapter([
        { id: '1', name: '健全橋', lon: 139.7, lat: 35.7, updated: '2026-01-01T00:00:00.000Z' },
        { id: '2', name: null, lon: 139.71, lat: 35.71, updated: '2026-01-01T00:00:00.000Z' },
        { id: '3', name: '座標なし橋', lon: null, lat: null, updated: '2026-01-01T00:00:00.000Z' },
        { id: '4', name: '海外橋', lon: 2.35, lat: 48.85, updated: '2026-01-01T00:00:00.000Z' },
        { id: '5', name: '鮮度不明橋', lon: 139.72, lat: 35.72, updated: null },
      ]),
      CTX,
    );
    expect(result.aborted).toBeNull();
    expect(result.counts.fetched).toBe(5);
    expect(result.counts.accepted).toBe(3);
    expect(result.counts.quarantined).toBe(2);

    const byId = new Map(result.accepted.map((p) => [p.asset.sourceRecordId, p]));
    expect(byId.get('1')?.qualityStatus).toBe('verified');
    expect(byId.get('2')?.qualityStatus).toBe('reference'); // Q001
    expect(byId.get('5')?.qualityStatus).toBe('reference'); // Q006
    const quarantinedIds = result.quarantined.map((p) => p.asset.sourceRecordId).sort();
    expect(quarantinedIds).toEqual(['3', '4']); // Q002, Q003
  });

  it('flags duplicate candidates as review (Q005)', async () => {
    const result = await runPipeline(
      makeAdapter([
        { id: 'a', name: '双子橋', lon: 139.7, lat: 35.7, updated: '2026-01-01T00:00:00.000Z' },
        { id: 'b', name: '双子橋', lon: 139.7003, lat: 35.7003, updated: '2026-01-01T00:00:00.000Z' },
      ]),
      CTX,
    );
    expect(result.accepted.every((p) => p.qualityStatus === 'review')).toBe(true);
    expect(
      result.accepted.every((p) => p.issues.some((i) => i.ruleCode === 'Q005')),
    ).toBe(true);
  });

  it('hides everything when the source license is unknown (Q007)', async () => {
    const result = await runPipeline(
      makeAdapter(
        [{ id: '1', name: '橋', lon: 139.7, lat: 35.7, updated: '2026-01-01T00:00:00.000Z' }],
        { licenseName: null },
      ),
      CTX,
    );
    expect(result.counts.accepted).toBe(0);
    expect(result.quarantined[0]?.issues.some((i) => i.ruleCode === 'Q007')).toBe(true);
  });

  it('aborts the run on schema drift (Q008)', async () => {
    const result = await runPipeline(
      makeAdapter(
        [{ id: '1', name: '橋', lon: 139.7, lat: 35.7, updated: '2026-01-01T00:00:00.000Z' }],
        { expectedSchemaKeys: ['id', 'name', 'longitude', 'latitude', 'updated'] },
      ),
      CTX,
    );
    expect(result.aborted?.ruleCode).toBe('Q008');
    expect(result.counts.accepted).toBe(0);
  });

  it('produces stable content hash and schema fingerprint', async () => {
    const rows = [
      { id: '1', name: '橋', lon: 139.7, lat: 35.7, updated: '2026-01-01T00:00:00.000Z' },
    ];
    const r1 = await runPipeline(makeAdapter(rows), CTX);
    const r2 = await runPipeline(makeAdapter(rows), CTX);
    expect(r1.contentHash).toBe(r2.contentHash);
    expect(r1.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(r1.schemaFingerprint).toBe(r2.schemaFingerprint);
  });
});

describe('csv utilities', () => {
  it('parses quoted fields, escaped quotes and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
  });
  it('maps rows to objects via the header', () => {
    const objs = csvToObjects('name,lat\n橋A,35.7\n橋B,35.8');
    expect(objs).toEqual([
      { name: '橋A', lat: '35.7' },
      { name: '橋B', lat: '35.8' },
    ]);
  });
});
