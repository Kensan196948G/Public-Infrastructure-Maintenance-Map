/**
 * Shared fetch/normalize logic for 大阪市「マップナビおおさかオープンデータ」
 * point-facility CSVs (施設情報ポイントデータ). Each dataset in the series
 * (公園・スポーツ, 公衆トイレ, ...) shares one 15-column layout — see the
 * per-dataset adapter files for the descriptor each one declares.
 */
import type {
  FetchContext,
  FetchResult,
  NormalizedAsset,
  SourceDescriptor,
} from '@pimm/ingestion-core';
import { fixLatLonSwap, geometryToWgs84, normalizeText, parseNumeric } from '@pimm/ingestion-core';
import type { AssetAttribute, AssetType, Geometry } from '@pimm/contracts';
import { fetchTextOverHttps } from '../http.js';

export type OsakaCsvRow = Record<string, string>;

/**
 * The source repeats a "分類" column at both index 4 and index 14 with an
 * identical value on every observed row; csvToObjects keys on header name,
 * so the object only ever carries the later (index-14) value. This is the
 * full de-duplicated key set both datasets in the series expose.
 */
export const OSAKA_FACILITY_SCHEMA_KEYS = [
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
] as const;

const ATTRIBUTE_COLUMNS = [
  ['category', 'カテゴリ'],
  ['subcategory', '分類'],
  ['address', '所在地'],
  ['name_kana', '施設名かな'],
  ['tel', 'TEL'],
  ['fax', 'FAX'],
  ['url', 'URL'],
  ['url2', 'URL2'],
  ['accessibility_info', 'バリアフリー情報'],
  ['detail_info', '詳細情報'],
  ['remarks', '備考'],
] as const;

/** The site's TLS endpoint still serves a 1024-bit DHE group (§ dh key too small). */
const OSAKA_TLS_OPTIONS = { ciphers: 'DEFAULT@SECLEVEL=1' };

export function createOsakaFacilityFetch(sourceUrl: string) {
  return async (context: FetchContext): Promise<FetchResult> => ({
    content: await fetchTextOverHttps(sourceUrl, OSAKA_TLS_OPTIONS),
    contentType: 'text/csv',
    fetchedAt: context.now,
  });
}

export function osakaFacilitySchemaKeys(records: readonly OsakaCsvRow[]): string[] {
  return [...new Set(records.flatMap((r) => Object.keys(r)))];
}

/** No source record has a native id (前回調査: ID列なし) — recordKey falls back downstream. */
export function normalizeOsakaFacilityRow(
  row: OsakaCsvRow,
  descriptor: SourceDescriptor,
  assetType: AssetType,
): NormalizedAsset {
  const lon = parseNumeric(row['経度'] ?? null);
  const lat = parseNumeric(row['緯度'] ?? null);
  let geometry: Geometry | null = null;
  if (lon !== null && lat !== null) {
    const { position } = fixLatLonSwap([lon, lat]);
    geometry = geometryToWgs84({ type: 'Point', coordinates: position }, descriptor.crs);
  }

  const attributes: AssetAttribute[] = [];
  for (const [key, label] of ATTRIBUTE_COLUMNS) {
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
    sourceRecordId: null,
    assetType,
    name: normalizeText(row['施設名称'] ?? null),
    originalName: row['施設名称'] ?? null,
    geometry,
    prefectureCode: '27',
    municipalityCode: '27100',
    managingAuthority: null,
    // 更新日 column does not exist in this series (前回調査で確認済み) → Q006.
    sourceUpdatedAt: null,
    attributes,
  };
}
