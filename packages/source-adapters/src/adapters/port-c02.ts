/**
 * 国土数値情報 港湾データ C02 第3.2版(平成26年/2014年度, nlftp.mlit.go.jp/ksj).
 * 配布 zip に GeoJSON は同梱されず JPGIS2.1 GML(C02-14-g.xml) + SHP のみのため、
 * この固定スキーマの GML を軽量抽出する(汎用 XML パーサ依存は持ち込まない)。
 * 同じ XML には HarborDistrictBoundary / PortDistrictBoundary 地物も同居するが、
 * 資産レコードとして扱うのは点位置を持つ PortAndHarbor(994件) のみ。
 */
import { unzipSync } from 'fflate';
import type {
  FetchContext,
  FetchResult,
  NormalizedAsset,
  SourceAdapter,
  SourceDescriptor,
} from '@pimm/ingestion-core';
import { geometryToWgs84 } from '@pimm/ingestion-core';
import type { AssetAttribute, Geometry } from '@pimm/contracts';
import { fetchBinaryOverHttps } from '../http.js';

const SOURCE_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/C02/C02-14/C02-14_GML.zip';

/**
 * PortAndHarbor ブロック直下に実在する ksj 要素の全集合(2014年度版の実測)。
 * administratorName / seaAgencyType / designatedDate は一部レコードのみだが、
 * schemaKeys はレコード横断の和集合なので期待集合には常に含まれる。
 */
export const PORT_C02_SCHEMA_KEYS = [
  'position',
  'type1',
  'type2',
  'administrativeAreaCode',
  'portCode',
  'portName',
  'administratorType',
  'administratorName',
  'seaAgencyType',
  'designatedDate',
  'foundationDate',
  'boundaryLengthOfOutlyingFacility',
  'mooringFacilitiesLength',
  'regularFerry',
] as const;

export const PORT_C02_DESCRIPTOR: SourceDescriptor = {
  slug: 'port-c02',
  name: '国土数値情報 港湾データ C02(平成26年度)',
  providerName: '国土交通省',
  sourceUrl: SOURCE_URL,
  accessType: 'file',
  format: 'xml',
  // 本版(第3.2版)の使用許諾条件はデータ詳細ページで「非商用」。CC-BY 4.0 へ移行済みの
  // 新しめの国土数値情報(例: N13-24)とは条件が異なるため restricted とする。
  licenseName: '国土数値情報 使用許諾条件(非商用)',
  licenseUrl: 'https://nlftp.mlit.go.jp/ksj/other/agreement.html',
  redistribution: 'restricted',
  attributionText:
    '出典:「国土数値情報（港湾データ）」（国土交通省）(https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-C02-v3_2.html) ※非商用利用条件',
  // データ詳細ページの座標系欄「JGD2000 / (B, L)」に基づく(推定ではない)。
  crs: 'EPSG:4612',
  expectedSchemaKeys: [...PORT_C02_SCHEMA_KEYS],
};

export interface PortC02Record {
  /** ブロック直下の ksj 要素名 → テキスト値(position は参照 id、日付は YYYYMMDD 生値)。 */
  properties: Record<string, string>;
  /** 参照解決済みの JGD2000 [lon, lat]。参照不整合時は null(Q002 で隔離される)。 */
  position: [number, number] | null;
}

/** GML テキストノードの最小限のエンティティ復号。 */
function decodeXmlText(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/**
 * C02 GML を 2 パスで抽出する。
 * 1) gml:Point 定義(gml:pos は「緯度 経度」順) → id → [lon, lat]
 * 2) PortAndHarbor ブロック → 属性 + position 参照解決
 */
export function parsePortC02Xml(xml: string): PortC02Record[] {
  const points = new Map<string, [number, number]>();
  for (const m of xml.matchAll(
    /<gml:Point gml:id="([^"]+)">\s*<gml:pos>([\d.+-]+)\s+([\d.+-]+)<\/gml:pos>/g,
  )) {
    const lat = Number(m[2]);
    const lon = Number(m[3]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) points.set(m[1]!, [lon, lat]);
  }

  const records: PortC02Record[] = [];
  for (const block of xml.matchAll(
    /<ksj:PortAndHarbor gml:id="[^"]*">([\s\S]*?)<\/ksj:PortAndHarbor>/g,
  )) {
    const body = block[1]!;
    const properties: Record<string, string> = {};

    const positionRef = /<ksj:position xlink:href="#([^"]+)"/.exec(body)?.[1] ?? null;
    if (positionRef) properties['position'] = positionRef;

    // テキスト直下要素(type1, portName, mooringFacilitiesLength 等)。
    // 子要素を持つ日付要素は [^<]* に一致しないためここでは拾われない。
    for (const el of body.matchAll(/<ksj:(\w+)(?:\s[^>]*)?>([^<]*)<\/ksj:\1>/g)) {
      properties[el[1]!] = decodeXmlText(el[2]!.trim());
    }

    // designatedDate / foundationDate は gml:TimeInstant/timePosition (YYYYMMDD)。
    for (const d of body.matchAll(
      /<ksj:(designatedDate|foundationDate)>[\s\S]*?<gml:timePosition>([^<]*)<\/gml:timePosition>/g,
    )) {
      properties[d[1]!] = d[2]!.trim();
    }

    records.push({
      properties,
      position: positionRef ? (points.get(positionRef) ?? null) : null,
    });
  }
  return records;
}

/** コード値の意味(種別・管理者区分等)は製品仕様書コードリスト未検証のため生値のまま保持する。 */
const CODE_ATTRIBUTE_COLUMNS = [
  ['port_code', 'portCode'],
  ['port_type1_code', 'type1'],
  ['port_type2_code', 'type2'],
  ['administrator_type_code', 'administratorType'],
  ['sea_agency_type_code', 'seaAgencyType'],
  ['regular_ferry_code', 'regularFerry'],
] as const;

/** 港湾調査規則に基づく延長数値(実延長と異なる旨がデータ詳細ページに明記)。単位は未検証のため保持しない。 */
const NUMERIC_ATTRIBUTE_COLUMNS = [
  ['mooring_facilities_length', 'mooringFacilitiesLength'],
  ['outlying_facility_boundary_length', 'boundaryLengthOfOutlyingFacility'],
] as const;

/** 原典が YYYYMMDD 生値のみを持つ日付。ISO への変換はせず原文のまま保持する。 */
const DATE_ATTRIBUTE_COLUMNS = [
  ['designated_date_raw', 'designatedDate'],
  ['foundation_date_raw', 'foundationDate'],
] as const;

export function createPortC02Adapter(): SourceAdapter<PortC02Record> {
  return {
    descriptor: PORT_C02_DESCRIPTOR,
    fetch: async (context: FetchContext): Promise<FetchResult> => {
      const zipBuffer = await fetchBinaryOverHttps(SOURCE_URL);
      const unzipped = unzipSync(zipBuffer);
      // 本体は C02-14_GML/C02-14-g.xml。KS-META-*.xml(メタデータ)は除外する。
      const xmlPath = Object.keys(unzipped).find(
        (path) => path.endsWith('-g.xml') && !path.includes('KS-META'),
      );
      if (!xmlPath) throw new Error(`${SOURCE_URL}: zip contains no C02 GML entry`);
      const entry = unzipped[xmlPath];
      if (!entry) throw new Error(`${SOURCE_URL}: zip entry lookup failed`);
      const content = new TextDecoder('utf-8').decode(entry);
      return { content, contentType: 'application/xml', fetchedAt: context.now };
    },
    parse: (input: FetchResult) => parsePortC02Xml(input.content),
    normalize: (record): NormalizedAsset => {
      let geometry: Geometry | null = null;
      if (record.position) {
        try {
          geometry = geometryToWgs84(
            { type: 'Point', coordinates: record.position },
            PORT_C02_DESCRIPTOR.crs,
          );
        } catch {
          geometry = null;
        }
      }
      const props = record.properties;

      const attributes: AssetAttribute[] = [];
      const pushText = (key: string, srcKey: string) => {
        const raw = props[srcKey];
        if (raw !== undefined && raw !== '') {
          attributes.push({
            key,
            valueText: raw,
            valueNumber: null,
            unit: null,
            originalValue: raw,
            sourceLabel: srcKey,
          });
        }
      };
      for (const [key, srcKey] of CODE_ATTRIBUTE_COLUMNS) pushText(key, srcKey);
      for (const [key, srcKey] of DATE_ATTRIBUTE_COLUMNS) pushText(key, srcKey);
      for (const [key, srcKey] of NUMERIC_ATTRIBUTE_COLUMNS) {
        const raw = props[srcKey];
        if (raw !== undefined && raw !== '') {
          const numeric = Number(raw);
          attributes.push({
            key,
            valueText: raw,
            valueNumber: Number.isFinite(numeric) ? numeric : null,
            unit: null,
            originalValue: raw,
            sourceLabel: srcKey,
          });
        }
      }

      const adminArea = props['administrativeAreaCode'];
      const hasAdminArea = adminArea !== undefined && /^\d{5}$/.test(adminArea);

      return {
        // 港湾コード(都道府県2桁+一意3桁)は本データの安定した自然キー。
        sourceRecordId: props['portCode'] ?? null,
        assetType: 'port',
        name: props['portName'] ?? null,
        originalName: props['portName'] ?? null,
        geometry,
        prefectureCode: hasAdminArea ? adminArea.slice(0, 2) : null,
        municipalityCode: hasAdminArea ? adminArea : null,
        // 61港湾は原典に管理者名が無い(欠損は欠損のまま)。
        managingAuthority: props['administratorName'] ?? null,
        // 原典はレコード更新日を持たない(整備年度のみ) → 鮮度不明として null(Q006)。
        sourceUpdatedAt: null,
        attributes,
      };
    },
    schemaKeys: (records) => [...new Set(records.flatMap((r) => Object.keys(r.properties)))],
  };
}
