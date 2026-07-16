import { describe, expect, it } from 'vitest';
import { runPipeline } from '@pimm/ingestion-core';
import type { SourceAdapter } from '@pimm/ingestion-core';
import {
  ROAD_N13_DESCRIPTOR,
  createRoadN13Adapter,
} from '../src/adapters/road-n13.js';

const CTX = { now: '2026-07-16T00:00:00.000Z' };

type RoadN13Row = Parameters<
  ReturnType<typeof createRoadN13Adapter>['normalize']
>[0];

/** Swaps in a fixed GeoJSON body so the real zip fetch/unzip never runs in tests. */
function withFixedGeoJson(
  base: SourceAdapter<RoadN13Row>,
  geojson: unknown,
): SourceAdapter<RoadN13Row> {
  return {
    ...base,
    fetch: async (context) => ({
      content: JSON.stringify(geojson),
      contentType: 'application/geo+json',
      fetchedAt: context.now,
    }),
  };
}

// 実データ (N13-24_3622.geojson) と同じ属性キー・型 (N13_005 のみ整数)。
const SAMPLE_FEATURE = {
  type: 'Feature',
  properties: {
    N13_001: '2018-10-05',
    N13_002: '2',
    N13_003: '3',
    N13_004: '1',
    N13_005: 0,
    N13_006: '1',
    N13_007: '1',
    N13_008: '362257',
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [123.0, 24.45],
      [123.01, 24.46],
    ],
  },
};

describe('road-n13 adapter (contract test)', () => {
  it('normalizes a LineString feature with code-list attributes', async () => {
    const geojson = { type: 'FeatureCollection', features: [SAMPLE_FEATURE] };
    const adapter = withFixedGeoJson(createRoadN13Adapter(), geojson);
    const result = await runPipeline(adapter, CTX);

    expect(result.aborted).toBeNull();
    expect(result.counts.fetched).toBe(1);
    expect(result.accepted).toHaveLength(1);
    const asset = result.accepted[0]?.asset;

    expect(asset?.assetType).toBe('road');
    // 路線名相当の属性が存在しないため常にnull。
    expect(asset?.name).toBeNull();
    expect(asset?.originalName).toBeNull();
    expect(asset?.sourceRecordId).toBeNull();
    expect(asset?.prefectureCode).toBe('47');
    expect(asset?.sourceUpdatedAt).toBe('2018-10-05T00:00:00.000Z');
    expect(asset?.geometry?.type).toBe('LineString');

    expect(asset?.attributes.find((a) => a.key === 'road_type_code')?.valueText).toBe('2');
    expect(asset?.attributes.find((a) => a.key === 'mesh_code')?.valueText).toBe('362257');
    const level = asset?.attributes.find((a) => a.key === 'level_order');
    expect(level?.valueNumber).toBe(0);
    expect(level?.valueText).toBe('0');
  });

  it('omits code attributes that are empty strings in the source', async () => {
    const feature = {
      ...SAMPLE_FEATURE,
      properties: { ...SAMPLE_FEATURE.properties, N13_007: '' },
    };
    const geojson = { type: 'FeatureCollection', features: [feature] };
    const result = await runPipeline(withFixedGeoJson(createRoadN13Adapter(), geojson), CTX);

    const asset = result.accepted[0]?.asset;
    expect(asset?.attributes.find((a) => a.key === 'toll_category_code')).toBeUndefined();
  });
});

describe('ROAD_N13_DESCRIPTOR', () => {
  it('declares the confirmed JGD2011 CRS and CC BY 4.0 licensing', () => {
    expect(ROAD_N13_DESCRIPTOR.crs).toBe('EPSG:6668');
    expect(ROAD_N13_DESCRIPTOR.redistribution).toBe('allowed');
    expect(ROAD_N13_DESCRIPTOR.format).toBe('geojson');
  });
});
