import type { FetchResult, SourceAdapter, SourceDescriptor } from '@pimm/ingestion-core';
import { csvToObjects } from '@pimm/ingestion-core';
import type { FetchTextFn } from '../transport.js';
import {
  OSAKA_FACILITY_SCHEMA_KEYS,
  createOsakaFacilityFetch,
  normalizeOsakaFacilityRow,
  osakaFacilitySchemaKeys,
  type OsakaCsvRow,
} from './osaka-facility-shared.js';

const SOURCE_URL =
  'https://www.mapnavi.city.osaka.lg.jp/osakacity/osakacity/opendatafile/map_1/CSV/opendata_1011.csv';

export const FACILITY_OSAKA_TOILET_DESCRIPTOR: SourceDescriptor = {
  slug: 'facility-osaka-toilet',
  name: '大阪市 施設情報ポイントデータ（公衆トイレ）',
  providerName: '大阪市',
  sourceUrl: SOURCE_URL,
  accessType: 'file',
  format: 'csv',
  licenseName: 'CC BY 2.1 JP',
  licenseUrl: 'https://creativecommons.org/licenses/by/2.1/jp/',
  redistribution: 'allowed',
  attributionText:
    '出典: 大阪市「マップナビおおさかオープンデータ」施設情報ポイントデータ（公衆トイレ）',
  // 世界測地系（JGD2011）— 原典: https://www.city.osaka.lg.jp/toshikeikaku/page/0000250227.html
  crs: 'EPSG:6668',
  expectedSchemaKeys: [...OSAKA_FACILITY_SCHEMA_KEYS],
};

export function createFacilityOsakaToiletAdapter(
  transport: FetchTextFn,
): SourceAdapter<OsakaCsvRow> {
  return {
    descriptor: FACILITY_OSAKA_TOILET_DESCRIPTOR,
    fetch: createOsakaFacilityFetch(SOURCE_URL, transport),
    parse: (input: FetchResult) => csvToObjects(input.content),
    normalize: (row) =>
      normalizeOsakaFacilityRow(row, FACILITY_OSAKA_TOILET_DESCRIPTOR, 'public_facility'),
    schemaKeys: osakaFacilitySchemaKeys,
  };
}
