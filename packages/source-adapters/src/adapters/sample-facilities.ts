import type {
  FetchContext,
  FetchResult,
  NormalizedAsset,
  SourceAdapter,
  SourceDescriptor,
} from '@pimm/ingestion-core';
import {
  csvToObjects,
  fixLatLonSwap,
  normalizeText,
  parseDateToIso,
  parseNumeric,
} from '@pimm/ingestion-core';
import type { AssetAttribute, Geometry } from '@pimm/contracts';
import { SAMPLE_FACILITIES_CSV } from '../sample-data/facilities.js';

export type CsvRow = Record<string, string>;

export const SAMPLE_FACILITIES_DESCRIPTOR: SourceDescriptor = {
  slug: 'sample-facilities',
  name: 'サンプル公共施設一覧',
  providerName: 'サンプル自治体オープンデータ',
  sourceUrl: 'https://example.com/opendata/sample-facilities',
  accessType: 'file',
  format: 'csv',
  licenseName: 'CC-BY-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  redistribution: 'restricted',
  attributionText: '出典: サンプル自治体オープンデータ「サンプル公共施設一覧」(CC BY 4.0)',
  crs: 'EPSG:4326',
  expectedSchemaKeys: [
    '施設ID',
    '施設名',
    '施設区分',
    '設置者',
    '所在地',
    '市区町村コード',
    '経度',
    '緯度',
    '更新日',
  ],
};

export function createSampleFacilitiesAdapter(): SourceAdapter<CsvRow> {
  return {
    descriptor: SAMPLE_FACILITIES_DESCRIPTOR,
    fetch: (context: FetchContext): Promise<FetchResult> =>
      Promise.resolve({
        content: SAMPLE_FACILITIES_CSV,
        contentType: 'text/csv',
        fetchedAt: context.now,
      }),
    parse: (input: FetchResult) => csvToObjects(input.content),
    normalize: (row): NormalizedAsset => {
      const lon = parseNumeric(row['経度'] ?? null);
      const lat = parseNumeric(row['緯度'] ?? null);
      let geometry: Geometry | null = null;
      if (lon !== null && lat !== null) {
        // Column swap happens in the wild — fix and keep going (要件 §テスト方針).
        const { position } = fixLatLonSwap([lon, lat]);
        geometry = { type: 'Point', coordinates: position };
      }
      const attributes: AssetAttribute[] = [];
      for (const [key, label] of [
        ['facility_category', '施設区分'],
        ['address', '所在地'],
      ] as const) {
        const value = normalizeText(row[label] ?? null);
        if (value) {
          attributes.push({
            key,
            valueText: value,
            valueNumber: null,
            unit: null,
            originalValue: row[label] ?? null,
            sourceLabel: label,
          });
        }
      }
      return {
        sourceRecordId: normalizeText(row['施設ID'] ?? null),
        assetType: 'public_facility',
        name: normalizeText(row['施設名'] ?? null),
        originalName: row['施設名'] ?? null,
        geometry,
        prefectureCode: (normalizeText(row['市区町村コード'] ?? null) ?? '').slice(0, 2) || null,
        municipalityCode: normalizeText(row['市区町村コード'] ?? null),
        managingAuthority: normalizeText(row['設置者'] ?? null),
        sourceUpdatedAt: parseDateToIso(row['更新日'] ?? null),
        attributes,
      };
    },
    schemaKeys: (records) => [...new Set(records.flatMap((r) => Object.keys(r)))],
  };
}
