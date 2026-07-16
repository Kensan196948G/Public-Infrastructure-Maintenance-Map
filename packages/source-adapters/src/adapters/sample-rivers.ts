import type {
  FetchContext,
  FetchResult,
  NormalizedAsset,
  SourceAdapter,
  SourceDescriptor,
} from '@pimm/ingestion-core';
import { geometryToWgs84, normalizeText, parseDateToIso } from '@pimm/ingestion-core';
import { GeometrySchema, type AssetAttribute } from '@pimm/contracts';
import { SAMPLE_RIVERS_GEOJSON } from '../sample-data/rivers.js';
import type { GeoJsonFeatureRaw } from './sample-bridges.js';

export const SAMPLE_RIVERS_DESCRIPTOR: SourceDescriptor = {
  slug: 'sample-rivers',
  name: 'サンプル河川データセット',
  providerName: 'サンプル河川管理機関',
  sourceUrl: 'https://example.com/opendata/sample-rivers',
  accessType: 'file',
  format: 'geojson',
  licenseName: 'サンプル利用規約（再配布禁止）',
  licenseUrl: 'https://example.com/opendata/sample-rivers/terms',
  redistribution: 'prohibited',
  attributionText: '出典: サンプル河川管理機関「サンプル河川データセット」',
  // JGD2011 geographic — numerically ≈ WGS84; declared, never guessed.
  crs: 'EPSG:6668',
  expectedSchemaKeys: ['河川名', '水系', '管理者', '区間', '更新日'],
};

function prop(record: GeoJsonFeatureRaw, key: string): string | null {
  const value = record.properties[key];
  return typeof value === 'string' ? value : value == null ? null : String(value);
}

export function createSampleRiversAdapter(): SourceAdapter<GeoJsonFeatureRaw> {
  return {
    descriptor: SAMPLE_RIVERS_DESCRIPTOR,
    fetch: (context: FetchContext): Promise<FetchResult> =>
      Promise.resolve({
        content: SAMPLE_RIVERS_GEOJSON,
        contentType: 'application/geo+json',
        fetchedAt: context.now,
      }),
    parse: (input: FetchResult) =>
      (JSON.parse(input.content) as { features: GeoJsonFeatureRaw[] }).features,
    normalize: (record): NormalizedAsset => {
      const geometryParse = GeometrySchema.safeParse(record.geometry);
      const attributes: AssetAttribute[] = [];
      for (const [key, label] of [
        ['water_system', '水系'],
        ['section', '区間'],
      ] as const) {
        const value = normalizeText(prop(record, label));
        if (value) {
          attributes.push({
            key,
            valueText: value,
            valueNumber: null,
            unit: null,
            originalValue: prop(record, label),
            sourceLabel: label,
          });
        }
      }
      return {
        sourceRecordId: record.id == null ? null : String(record.id),
        assetType: 'river',
        name: normalizeText(prop(record, '河川名')),
        originalName: prop(record, '河川名'),
        geometry: geometryParse.success
          ? geometryToWgs84(geometryParse.data, SAMPLE_RIVERS_DESCRIPTOR.crs)
          : null,
        prefectureCode: '13',
        municipalityCode: null,
        managingAuthority: normalizeText(prop(record, '管理者')),
        sourceUpdatedAt: parseDateToIso(prop(record, '更新日')),
        attributes,
      };
    },
    schemaKeys: (records) => [...new Set(records.flatMap((r) => Object.keys(r.properties)))],
  };
}
