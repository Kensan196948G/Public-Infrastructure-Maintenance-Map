/**
 * 国土数値情報 道路(ライン) N13(2024年度版, nlftp.mlit.go.jp/ksj). GeoJSON is
 * distributed zipped per 2次メッシュ(2nd-order mesh) — not per prefecture.
 * Mesh 3622 = 与那国島 (Yonaguni-jima, Okinawa) — chosen because it was the
 * verified working sample from source research, not for geographic continuity
 * with the other adapters.
 */
import { unzipSync } from 'fflate';
import type {
  FetchContext,
  FetchResult,
  NormalizedAsset,
  SourceAdapter,
  SourceDescriptor,
} from '@pimm/ingestion-core';
import { geometryToWgs84, parseDateToIso } from '@pimm/ingestion-core';
import type { AssetAttribute, Geometry } from '@pimm/contracts';
import { fetchBinaryOverHttps } from '../http.js';

const SOURCE_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/N13-24_3622_GEOJSON.zip';

export const ROAD_N13_SCHEMA_KEYS = [
  'N13_001',
  'N13_002',
  'N13_003',
  'N13_004',
  'N13_005',
  'N13_006',
  'N13_007',
  'N13_008',
] as const;

export const ROAD_N13_DESCRIPTOR: SourceDescriptor = {
  slug: 'road-n13',
  name: '国土数値情報 道路(ライン) N13(2024年度)',
  providerName: '国土交通省',
  sourceUrl: SOURCE_URL,
  accessType: 'file',
  format: 'geojson',
  licenseName: 'CC BY 4.0 (国土数値情報ダウンロードサイトコンテンツ利用規約)',
  licenseUrl: 'https://nlftp.mlit.go.jp/ksj/other/agreement_01.html',
  redistribution: 'allowed',
  attributionText:
    '出典:「国土数値情報（道路データ）」（国土交通省）(https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N13-2024.html)',
  // データ詳細ページ・実GeoJSONのcrs要素("urn:ogc:def:crs:EPSG::6668")の両方で確認済み(推定ではない)。
  crs: 'EPSG:6668',
  expectedSchemaKeys: [...ROAD_N13_SCHEMA_KEYS],
};

interface RoadN13Feature {
  type: 'Feature';
  properties: Record<string, string | number>;
  geometry: Geometry | null;
}

/** コードリスト値の意味(道路種別・分類・状態等)は製品仕様書PDF未確認のため、コード値をそのまま保持する。 */
const CODE_ATTRIBUTE_COLUMNS = [
  ['road_type_code', 'N13_002'],
  ['road_classification_code', 'N13_003'],
  ['road_status_code', 'N13_004'],
  ['width_category_code', 'N13_006'],
  ['toll_category_code', 'N13_007'],
  ['mesh_code', 'N13_008'],
] as const;

export function createRoadN13Adapter(): SourceAdapter<RoadN13Feature> {
  return {
    descriptor: ROAD_N13_DESCRIPTOR,
    fetch: async (context: FetchContext): Promise<FetchResult> => {
      const zipBuffer = await fetchBinaryOverHttps(SOURCE_URL);
      const unzipped = unzipSync(zipBuffer);
      const geojsonPath = Object.keys(unzipped).find((path) => path.endsWith('.geojson'));
      if (!geojsonPath) throw new Error(`${SOURCE_URL}: zip contains no .geojson entry`);
      const entry = unzipped[geojsonPath];
      if (!entry) throw new Error(`${SOURCE_URL}: zip entry lookup failed`);
      const content = new TextDecoder('utf-8').decode(entry);
      return { content, contentType: 'application/geo+json', fetchedAt: context.now };
    },
    parse: (input: FetchResult) => {
      const parsed = JSON.parse(input.content) as { features: RoadN13Feature[] };
      return parsed.features;
    },
    normalize: (feature): NormalizedAsset => {
      let geometry: Geometry | null = null;
      if (feature.geometry) {
        try {
          geometry = geometryToWgs84(feature.geometry, ROAD_N13_DESCRIPTOR.crs);
        } catch {
          geometry = null;
        }
      }
      const props = feature.properties;

      const attributes: AssetAttribute[] = [];
      for (const [key, srcKey] of CODE_ATTRIBUTE_COLUMNS) {
        const raw = props[srcKey];
        if (raw !== undefined && raw !== null && raw !== '') {
          attributes.push({
            key,
            valueText: String(raw),
            valueNumber: null,
            unit: null,
            originalValue: String(raw),
            sourceLabel: srcKey,
          });
        }
      }
      const level = props['N13_005'];
      if (typeof level === 'number') {
        attributes.push({
          key: 'level_order',
          valueText: String(level),
          valueNumber: level,
          unit: null,
          originalValue: String(level),
          sourceLabel: 'N13_005',
        });
      }

      const registeredAt = typeof props['N13_001'] === 'string' ? props['N13_001'] : null;

      return {
        sourceRecordId: null,
        assetType: 'road',
        // 路線名に相当する属性がデータセットに存在しない(N13_001〜008はいずれもコード値/日付/メッシュ番号)。
        name: null,
        originalName: null,
        geometry,
        // メッシュ3622(与那国島)は沖縄県内。地物ごとのジオコーディングではなくメッシュ選定に基づく。
        prefectureCode: '47',
        municipalityCode: null,
        managingAuthority: null,
        sourceUpdatedAt: parseDateToIso(registeredAt),
        attributes,
      };
    },
    schemaKeys: (records) => [...new Set(records.flatMap((r) => Object.keys(r.properties)))],
  };
}
