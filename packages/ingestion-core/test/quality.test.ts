import { describe, expect, it } from 'vitest';
import type { NormalizedAsset, SourceDescriptor } from '../src/index.js';
import {
  assignQualityStatus,
  checkRecord,
  findDuplicateCandidates,
  haversineMeters,
  validateGeometry,
} from '../src/index.js';

const SOURCE: SourceDescriptor = {
  slug: 'test-source',
  name: 'テストソース',
  providerName: 'テスト提供者',
  sourceUrl: 'https://example.com/data',
  accessType: 'file',
  format: 'geojson',
  licenseName: 'CC-BY-4.0',
  licenseUrl: null,
  redistribution: 'allowed',
  attributionText: null,
  crs: 'EPSG:4326',
};

function asset(overrides: Partial<NormalizedAsset>): NormalizedAsset {
  return {
    sourceRecordId: 'r1',
    assetType: 'bridge',
    name: 'テスト橋',
    originalName: 'テスト橋',
    geometry: { type: 'Point', coordinates: [139.7, 35.7] },
    prefectureCode: '13',
    municipalityCode: '13101',
    managingAuthority: null,
    sourceUpdatedAt: '2026-01-01T00:00:00.000Z',
    attributes: [],
    ...overrides,
  };
}

describe('checkRecord', () => {
  it('passes a clean record with no issues', () => {
    const { issues } = checkRecord(asset({}), SOURCE);
    expect(issues).toHaveLength(0);
  });
  it('Q001: flags missing name as warning', () => {
    const { issues } = checkRecord(asset({ name: null }), SOURCE);
    expect(issues.map((i) => i.ruleCode)).toContain('Q001');
    expect(assignQualityStatus(issues)).toBe('reference');
  });
  it('Q002: flags missing geometry as error', () => {
    const { issues } = checkRecord(asset({ geometry: null }), SOURCE);
    expect(issues.some((i) => i.ruleCode === 'Q002' && i.severity === 'error')).toBe(true);
    expect(assignQualityStatus(issues)).toBe('hidden');
  });
  it('Q003: flags coordinates outside Japan as error', () => {
    const { issues } = checkRecord(
      asset({ geometry: { type: 'Point', coordinates: [2.35, 48.85] } }),
      SOURCE,
    );
    expect(issues.some((i) => i.ruleCode === 'Q003' && i.severity === 'error')).toBe(true);
  });
  it('Q004: repairs an open polygon ring and records an info issue', () => {
    const { issues, geometry } = checkRecord(
      asset({
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [139.7, 35.7],
              [139.71, 35.7],
              [139.71, 35.71],
              [139.7, 35.71],
            ],
          ],
        },
      }),
      SOURCE,
    );
    expect(issues.some((i) => i.ruleCode === 'Q004' && i.severity === 'info')).toBe(true);
    expect(geometry?.type === 'Polygon' && geometry.coordinates[0]).toHaveLength(5);
    expect(assignQualityStatus(issues)).toBe('verified');
  });
  it('Q004: rejects unrepairable geometry as error', () => {
    const { issues, geometry } = checkRecord(
      asset({ geometry: { type: 'Point', coordinates: [Number.NaN, 35.7] } }),
      SOURCE,
    );
    expect(issues.some((i) => i.ruleCode === 'Q004' && i.severity === 'error')).toBe(true);
    expect(geometry).toBeNull();
  });
  it('Q006: flags unknown source update date', () => {
    const { issues } = checkRecord(asset({ sourceUpdatedAt: null }), SOURCE);
    expect(issues.map((i) => i.ruleCode)).toContain('Q006');
    expect(assignQualityStatus(issues)).toBe('reference');
  });
  it('Q007: unknown license hides the record', () => {
    const { issues } = checkRecord(asset({}), { ...SOURCE, licenseName: null });
    expect(issues.some((i) => i.ruleCode === 'Q007' && i.severity === 'error')).toBe(true);
    expect(assignQualityStatus(issues)).toBe('hidden');
  });
});

describe('validateGeometry', () => {
  it('rejects a linestring with one position', () => {
    expect(validateGeometry({ type: 'LineString', coordinates: [[139.7, 35.7]] } as never).ok).toBe(
      false,
    );
  });
});

describe('dedup', () => {
  it('haversine distance is plausible', () => {
    // Tokyo Sta → Kanda Sta ≈ 1.3km
    const d = haversineMeters([139.7671, 35.6812], [139.7709, 35.6918]);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1500);
  });
  it('flags same-type same-name nearby pairs only', () => {
    const assets = [
      asset({ sourceRecordId: 'a', name: 'みらい大橋' }),
      asset({
        sourceRecordId: 'b',
        name: 'ミライ大橋', // width/kana-insensitive? — NFKC keys differ for ひらがな/カタカナ, so no match
      }),
      asset({
        sourceRecordId: 'c',
        name: 'みらい大橋',
        geometry: { type: 'Point', coordinates: [139.7005, 35.7002] }, // ~50m away
      }),
      asset({
        sourceRecordId: 'd',
        name: 'みらい大橋',
        geometry: { type: 'Point', coordinates: [140.5, 36.5] }, // far away
      }),
      asset({ sourceRecordId: 'e', name: 'みらい大橋', assetType: 'road' }), // different type
    ];
    const pairs = findDuplicateCandidates(assets);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ indexA: 0, indexB: 2 });
    expect(pairs[0]!.distanceMeters).toBeLessThan(100);
  });
});
