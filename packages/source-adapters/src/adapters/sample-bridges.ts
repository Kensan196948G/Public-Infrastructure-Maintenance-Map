import type {
  FetchContext,
  FetchResult,
  NormalizedAsset,
  SourceAdapter,
  SourceDescriptor,
} from '@pimm/ingestion-core';
import { normalizeText, parseDateToIso, parseLengthToMeters, parseNumeric } from '@pimm/ingestion-core';
import { GeometrySchema, type AssetAttribute } from '@pimm/contracts';
import { SAMPLE_BRIDGES_GEOJSON } from '../sample-data/bridges.js';

export interface GeoJsonFeatureRaw {
  type: 'Feature';
  id?: string | number;
  geometry: unknown;
  properties: Record<string, unknown>;
}

export const SAMPLE_BRIDGES_DESCRIPTOR: SourceDescriptor = {
  slug: 'sample-bridges',
  name: 'サンプル橋梁データセット',
  providerName: 'サンプル公開データ提供機関',
  sourceUrl: 'https://example.com/opendata/sample-bridges',
  accessType: 'file',
  format: 'geojson',
  licenseName: 'CC-BY-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  redistribution: 'allowed',
  attributionText: '出典: サンプル公開データ提供機関「サンプル橋梁データセット」(CC BY 4.0)',
  crs: 'EPSG:4326',
  expectedSchemaKeys: ['名称', '路線名', '管理者', '供用年', '橋長', '市区町村コード', '更新日'],
};

function prop(record: GeoJsonFeatureRaw, key: string): string | null {
  const value = record.properties[key];
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

export function createSampleBridgesAdapter(): SourceAdapter<GeoJsonFeatureRaw> {
  return {
    descriptor: SAMPLE_BRIDGES_DESCRIPTOR,
    fetch: (context: FetchContext): Promise<FetchResult> =>
      Promise.resolve({
        content: SAMPLE_BRIDGES_GEOJSON,
        contentType: 'application/geo+json',
        fetchedAt: context.now,
      }),
    parse: (input: FetchResult) =>
      (JSON.parse(input.content) as { features: GeoJsonFeatureRaw[] }).features,
    normalize: (record): NormalizedAsset => {
      const name = normalizeText(prop(record, '名称'));
      const geometryParse = GeometrySchema.safeParse(record.geometry);
      const attributes: AssetAttribute[] = [];

      const route = normalizeText(prop(record, '路線名'));
      if (route) {
        attributes.push({
          key: 'route_name',
          valueText: route,
          valueNumber: null,
          unit: null,
          originalValue: prop(record, '路線名'),
          sourceLabel: '路線名',
        });
      }
      const serviceYear = parseNumeric(prop(record, '供用年'));
      if (serviceYear !== null) {
        attributes.push({
          key: 'service_year',
          valueText: String(serviceYear),
          valueNumber: serviceYear,
          unit: null,
          originalValue: prop(record, '供用年'),
          sourceLabel: '供用年',
        });
      }
      const lengthM = parseLengthToMeters(prop(record, '橋長'));
      if (lengthM !== null) {
        attributes.push({
          key: 'bridge_length',
          valueText: String(lengthM),
          valueNumber: lengthM,
          unit: 'm',
          originalValue: prop(record, '橋長'),
          sourceLabel: '橋長',
        });
      }

      return {
        sourceRecordId: record.id == null ? null : String(record.id),
        assetType: 'bridge',
        name,
        originalName: prop(record, '名称'),
        geometry: geometryParse.success ? geometryParse.data : null,
        prefectureCode: (normalizeText(prop(record, '市区町村コード')) ?? '').slice(0, 2) || null,
        municipalityCode: normalizeText(prop(record, '市区町村コード')),
        managingAuthority: normalizeText(prop(record, '管理者')),
        sourceUpdatedAt: parseDateToIso(prop(record, '更新日')),
        attributes,
      };
    },
    schemaKeys: (records) => [...new Set(records.flatMap((r) => Object.keys(r.properties)))],
  };
}
