import { describe, expect, it } from 'vitest';
import { runPipeline } from '@pimm/ingestion-core';
import type { SourceAdapter } from '@pimm/ingestion-core';
import {
  createFacilityOsakaParkAdapter,
  FACILITY_OSAKA_PARK_DESCRIPTOR,
} from '../src/adapters/facility-osaka-park.js';
import {
  createFacilityOsakaToiletAdapter,
  FACILITY_OSAKA_TOILET_DESCRIPTOR,
} from '../src/adapters/facility-osaka-toilet.js';
import {
  normalizeOsakaFacilityRow,
  osakaFacilitySchemaKeys,
  type OsakaCsvRow,
} from '../src/adapters/osaka-facility-shared.js';

const CTX = { now: '2026-07-16T00:00:00.000Z' };

// The source repeats the "分類" header at column 4 and column 14 with the
// same value on every observed row (実データ確認済み). csvToObjects keys on
// header name, so only the later column survives in the parsed row object —
// this fixture mirrors that exact 15-column layout.
const HEADER = [
  '施設名称',
  '所在地',
  '施設名かな',
  'カテゴリ',
  '分類',
  'TEL',
  'FAX',
  'URL',
  'URL2',
  'バリアフリー情報',
  '詳細情報',
  '備考',
  '経度',
  '緯度',
  '分類',
];

function csvRow(cells: readonly string[]): string {
  if (cells.length !== HEADER.length) {
    throw new Error(`fixture row has ${cells.length} cells, expected ${HEADER.length}`);
  }
  return cells.join(',');
}

function rowObject(cells: readonly string[]): OsakaCsvRow {
  return Object.fromEntries(HEADER.map((key, i) => [key, cells[i] ?? '']));
}

/** Swaps in fixed CSV text so the real HTTPS fetch never runs in tests. */
function withFixedCsv(base: SourceAdapter<OsakaCsvRow>, csv: string): SourceAdapter<OsakaCsvRow> {
  return {
    ...base,
    fetch: async (context) => ({ content: csv, contentType: 'text/csv', fetchedAt: context.now }),
  };
}

describe('osakaFacilitySchemaKeys', () => {
  it('dedupes the repeated 分類 column', () => {
    const rows: OsakaCsvRow[] = [
      { 施設名称: 'a', 分類: '公園' },
      { 施設名称: 'b', 分類: '公園' },
    ];
    expect(osakaFacilitySchemaKeys(rows)).toEqual(['施設名称', '分類']);
  });
});

describe('normalizeOsakaFacilityRow', () => {
  it('normalizes a well-formed row and extracts attributes', () => {
    const asset = normalizeOsakaFacilityRow(
      rowObject([
        '石ヶ辻公園',
        '大阪市天王寺区石ケ辻町11',
        'いしがつじこうえん',
        '公園・スポーツ',
        '公園',
        '',
        '',
        '',
        '',
        '',
        '街区公園',
        '',
        '135.5223503',
        '34.6633249',
        '公園',
      ]),
      FACILITY_OSAKA_PARK_DESCRIPTOR,
      'public_facility',
    );

    expect(asset.name).toBe('石ヶ辻公園');
    expect(asset.prefectureCode).toBe('27');
    expect(asset.municipalityCode).toBe('27100');
    // No 更新日 column exists in this series (前回調査で確認済み) → always null.
    expect(asset.sourceUpdatedAt).toBeNull();
    expect(asset.geometry?.type).toBe('Point');
    if (asset.geometry?.type === 'Point') {
      expect(asset.geometry.coordinates[0]).toBeCloseTo(135.5223503, 4);
      expect(asset.geometry.coordinates[1]).toBeCloseTo(34.6633249, 4);
    }
    expect(asset.attributes.find((a) => a.key === 'subcategory')?.valueText).toBe('公園');
    expect(asset.attributes.find((a) => a.key === 'detail_info')?.valueText).toBe('街区公園');
    // Blank columns (TEL, FAX, URL, ...) must not surface as empty-string attributes.
    expect(asset.attributes.some((a) => a.key === 'tel')).toBe(false);
  });

  it('returns null geometry when lon/lat are both missing', () => {
    const asset = normalizeOsakaFacilityRow(
      rowObject([
        '未整備公園',
        '大阪市',
        '',
        '公園・スポーツ',
        '公園',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]),
      FACILITY_OSAKA_PARK_DESCRIPTOR,
      'public_facility',
    );
    expect(asset.geometry).toBeNull();
  });

  it('fixes a lon/lat column swap via the shared Japan-bbox heuristic', () => {
    // 経度 column holds a latitude-shaped value (34.7) and vice versa (135.5).
    const asset = normalizeOsakaFacilityRow(
      rowObject([
        '座標スワップ公園',
        '大阪市',
        '',
        '公園・スポーツ',
        '公園',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '34.7',
        '135.5',
        '公園',
      ]),
      FACILITY_OSAKA_PARK_DESCRIPTOR,
      'public_facility',
    );
    expect(asset.geometry?.type).toBe('Point');
    if (asset.geometry?.type === 'Point') {
      expect(asset.geometry.coordinates[0]).toBeCloseTo(135.5, 3);
      expect(asset.geometry.coordinates[1]).toBeCloseTo(34.7, 3);
    }
  });

  it('keeps multi-word 詳細情報 text intact (real opendata_1011.csv row)', () => {
    const asset = normalizeOsakaFacilityRow(
      rowObject([
        '太左衛門橋公衆トイレ',
        '大阪市中央区道頓堀1-5',
        'たざえもんばしこうしゅうといれ',
        '公衆トイレ',
        '車いす対応公衆便所',
        '',
        '',
        '',
        '',
        '',
        '便器数　　男性用　小：３　　男女兼用車いす対応：１',
        '',
        '135.5033192',
        '34.6688975',
        '車いす対応公衆便所',
      ]),
      FACILITY_OSAKA_TOILET_DESCRIPTOR,
      'public_facility',
    );
    expect(asset.attributes.find((a) => a.key === 'detail_info')?.valueText).toContain('便器数');
  });
});

describe('facility-osaka-park adapter (contract test)', () => {
  it('parses CSV end-to-end and assigns quality badges via the real pipeline', async () => {
    const csv = [
      HEADER.join(','),
      csvRow([
        '石ヶ辻公園',
        '大阪市天王寺区石ケ辻町11',
        'いしがつじこうえん',
        '公園・スポーツ',
        '公園',
        '',
        '',
        '',
        '',
        '',
        '街区公園',
        '',
        '135.5223503',
        '34.6633249',
        '公園',
      ]),
      csvRow([
        '未整備公園',
        '大阪市',
        '',
        '公園・スポーツ',
        '公園',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]),
    ].join('\n');

    const adapter = withFixedCsv(createFacilityOsakaParkAdapter(), csv);
    const result = await runPipeline(adapter, CTX);

    expect(result.aborted).toBeNull();
    expect(result.counts.fetched).toBe(2);
    // No 更新日 column → Q006 on every accepted record → 'reference', never 'verified'.
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.asset.name).toBe('石ヶ辻公園');
    expect(result.accepted[0]?.qualityStatus).toBe('reference');
    // Missing coordinates → Q002 (error) → quarantined, never silently dropped.
    expect(result.quarantined.map((p) => p.asset.name)).toEqual(['未整備公園']);
  });
});

describe('facility-osaka-toilet adapter (contract test)', () => {
  it('shares the same normalization contract as the park adapter', async () => {
    const csv = [
      HEADER.join(','),
      csvRow([
        '太左衛門橋公衆トイレ',
        '大阪市中央区道頓堀1-5',
        'たざえもんばしこうしゅうといれ',
        '公衆トイレ',
        '車いす対応公衆便所',
        '',
        '',
        '',
        '',
        '',
        '便器数　　男性用　小：３',
        '',
        '135.5033192',
        '34.6688975',
        '車いす対応公衆便所',
      ]),
    ].join('\n');

    const adapter = withFixedCsv(createFacilityOsakaToiletAdapter(), csv);
    const result = await runPipeline(adapter, CTX);

    expect(result.aborted).toBeNull();
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.asset.assetType).toBe('public_facility');
    expect(result.accepted[0]?.asset.geometry?.type).toBe('Point');
  });
});
