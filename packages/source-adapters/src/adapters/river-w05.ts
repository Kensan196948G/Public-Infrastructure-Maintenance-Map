/**
 * 国土数値情報 河川データ W05(2006〜2009年度, nlftp.mlit.go.jp/ksj)。
 * 配布は都道府県別 zip で、整備年度が県毎に異なる(下の RIVER_W05_YEARS は
 * データ詳細ページのダウンロード表から採取した実 URL 対応表)。
 *
 * 原典の地物「流路」(ksj:Stream) は同一河川を多数のセグメントへ分割している。
 * セグメントをそのまま資産化すると同名行が氾濫するため、riverCode(10桁・全国
 * 一意) 単位で MultiLineString へ集約し「1河川 = 1資産」とする。セグメント毎に
 * 異なり得る属性(区間種別・原典資料種別)は distinct 集合として保持し、値の
 * 推定・捏造はしない。要素構造が 2006〜2009 年式で同一であることは実データ
 * (W05-09_01 / W05-06_36) で確認済み。
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
import type { FetchBinaryFn } from '../transport.js';

/** 県コード → 整備年度(下2桁)。データ詳細ページのダウンロード表と1:1。 */
export const RIVER_W05_YEARS: Record<string, string> = {
  '01': '09',
  '02': '07',
  '03': '07',
  '04': '07',
  '05': '07',
  '06': '07',
  '07': '07',
  '08': '08',
  '09': '08',
  '10': '08',
  '11': '08',
  '12': '08',
  '13': '08',
  '14': '08',
  '15': '07',
  '16': '07',
  '17': '07',
  '18': '07',
  '19': '08',
  '20': '08',
  '21': '08',
  '22': '08',
  '23': '08',
  '24': '08',
  '25': '09',
  '26': '09',
  '27': '09',
  '28': '09',
  '29': '09',
  '30': '09',
  '31': '08',
  '32': '08',
  '33': '08',
  '34': '08',
  '35': '08',
  '36': '06',
  '37': '06',
  '38': '06',
  '39': '06',
  '40': '07',
  '41': '07',
  '42': '07',
  '43': '07',
  '44': '07',
  '45': '07',
  '46': '07',
  '47': '07',
};

const PREF_NAMES: Record<string, string> = {
  '01': '北海道',
  '02': '青森県',
  '03': '岩手県',
  '04': '宮城県',
  '05': '秋田県',
  '06': '山形県',
  '07': '福島県',
  '08': '茨城県',
  '09': '栃木県',
  '10': '群馬県',
  '11': '埼玉県',
  '12': '千葉県',
  '13': '東京都',
  '14': '神奈川県',
  '15': '新潟県',
  '16': '富山県',
  '17': '石川県',
  '18': '福井県',
  '19': '山梨県',
  '20': '長野県',
  '21': '岐阜県',
  '22': '静岡県',
  '23': '愛知県',
  '24': '三重県',
  '25': '滋賀県',
  '26': '京都府',
  '27': '大阪府',
  '28': '兵庫県',
  '29': '奈良県',
  '30': '和歌山県',
  '31': '鳥取県',
  '32': '島根県',
  '33': '岡山県',
  '34': '広島県',
  '35': '山口県',
  '36': '徳島県',
  '37': '香川県',
  '38': '愛媛県',
  '39': '高知県',
  '40': '福岡県',
  '41': '佐賀県',
  '42': '長崎県',
  '43': '熊本県',
  '44': '大分県',
  '45': '宮崎県',
  '46': '鹿児島県',
  '47': '沖縄県',
};

/** Stream ブロック直下に実在する ksj 要素(2006/2009 年式の実測で同一)。 */
export const RIVER_W05_SCHEMA_KEYS = [
  'waterSystemCode',
  'location',
  'riverCode',
  'sectionType',
  'riverName',
  'originalDataType',
  'flowDirection',
  'startRiverNode',
  'endRiverNode',
  'startStreamNode',
  'endStreamNode',
] as const;

export function riverW05SourceUrl(prefCode: string): string {
  const year = RIVER_W05_YEARS[prefCode];
  if (!year) throw new Error(`river-w05: unknown prefecture code ${prefCode}`);
  return `https://nlftp.mlit.go.jp/ksj/gml/data/W05/W05-${year}/W05-${year}_${prefCode}_GML.zip`;
}

export function riverW05Descriptor(prefCode: string): SourceDescriptor {
  return {
    slug: `river-w05-${prefCode}`,
    name: `国土数値情報 河川データ W05(${PREF_NAMES[prefCode] ?? prefCode})`,
    providerName: '国土交通省',
    sourceUrl: riverW05SourceUrl(prefCode),
    accessType: 'file',
    format: 'xml',
    // C02 同様、当該版の使用許諾条件はデータ詳細ページ上「非商用」。
    licenseName: '国土数値情報 使用許諾条件(非商用)',
    licenseUrl: 'https://nlftp.mlit.go.jp/ksj/other/agreement_02.html',
    redistribution: 'restricted',
    attributionText:
      '出典:「国土数値情報（河川データ）」（国土交通省）(https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W05.html) ※非商用利用条件',
    // データ詳細ページの座標系欄「JGD2000 / (B, L)」に基づく(推定ではない)。
    crs: 'EPSG:4612',
    expectedSchemaKeys: [...RIVER_W05_SCHEMA_KEYS],
  };
}

/** riverCode 単位に集約済みの1河川。 */
export interface RiverW05Record {
  riverCode: string;
  riverName: string | null;
  waterSystemCode: string | null;
  sectionTypes: string[];
  originalDataTypes: string[];
  /** WGS84 変換前(JGD2000)の [lon, lat] 線分列。 */
  parts: [number, number][][];
  segmentCount: number;
  /** location 参照先 Curve が見つからなかったセグメント数(監視用属性)。 */
  missingCurveCount: number;
  /** Stream ブロック横断で観測した要素名(Q008 判定用・全レコード同一参照)。 */
  observedStreamKeys: string[];
}

/** 149MB 級 XML でも動くよう、巨大正規表現ではなく indexOf 走査で切り出す。 */
function* blocks(xml: string, openTag: string, closeTag: string): Generator<string> {
  let from = 0;
  for (;;) {
    const start = xml.indexOf(openTag, from);
    if (start < 0) return;
    const end = xml.indexOf(closeTag, start);
    if (end < 0) return;
    yield xml.slice(start, end);
    from = end + closeTag.length;
  }
}

/** gml:Curve id → 線分([lon,lat][])。posList は「緯度 経度」順のため入替える。 */
export function parseW05Curves(xml: string): Map<string, [number, number][]> {
  const curves = new Map<string, [number, number][]>();
  for (const block of blocks(xml, '<gml:Curve ', '</gml:Curve>')) {
    const id = /gml:id="([^"]+)"/.exec(block)?.[1];
    if (!id) continue;
    const coords: [number, number][] = [];
    for (const posList of block.matchAll(/<gml:posList>([\s\S]*?)<\/gml:posList>/g)) {
      const nums = posList[1]!.trim().split(/\s+/);
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const lat = Number(nums[i]);
        const lon = Number(nums[i + 1]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
      }
    }
    if (coords.length >= 2) curves.set(id, coords);
  }
  return curves;
}

export function parseRiverW05Xml(xml: string): RiverW05Record[] {
  const curves = parseW05Curves(xml);

  interface Bucket {
    riverName: string | null;
    waterSystemCode: string | null;
    sectionTypes: Set<string>;
    originalDataTypes: Set<string>;
    parts: [number, number][][];
    segmentCount: number;
    missingCurveCount: number;
  }
  const rivers = new Map<string, Bucket>();
  const observed = new Set<string>();

  for (const block of blocks(xml, '<ksj:Stream ', '</ksj:Stream>')) {
    // 先頭のコンテナタグ(<ksj:Stream …)自身は属性要素ではないので観測対象から除く。
    for (const el of block.matchAll(/<ksj:(\w+)[\s>]/g)) {
      if (el[1] !== 'Stream') observed.add(el[1]!);
    }

    const text = (name: string): string | null => {
      const m = new RegExp(`<ksj:${name}(?:\\s[^>]*)?>([^<]*)</ksj:${name}>`).exec(block);
      const value = m?.[1]?.trim();
      return value ? value : null;
    };
    const riverCode = text('riverCode');
    if (!riverCode) continue;

    let bucket = rivers.get(riverCode);
    if (!bucket) {
      bucket = {
        riverName: null,
        waterSystemCode: null,
        sectionTypes: new Set(),
        originalDataTypes: new Set(),
        parts: [],
        segmentCount: 0,
        missingCurveCount: 0,
      };
      rivers.set(riverCode, bucket);
    }
    bucket.segmentCount += 1;
    bucket.riverName ??= text('riverName');
    bucket.waterSystemCode ??= text('waterSystemCode');
    const sectionType = text('sectionType');
    if (sectionType) bucket.sectionTypes.add(sectionType);
    const originalDataType = text('originalDataType');
    if (originalDataType) bucket.originalDataTypes.add(originalDataType);

    const curveRef = /<ksj:location xlink:href="#([^"]+)"/.exec(block)?.[1];
    const coords = curveRef ? curves.get(curveRef) : undefined;
    if (coords) bucket.parts.push(coords);
    else bucket.missingCurveCount += 1;
  }

  const observedStreamKeys = [...observed];
  return [...rivers.entries()].map(([riverCode, b]) => ({
    riverCode,
    riverName: b.riverName,
    waterSystemCode: b.waterSystemCode,
    sectionTypes: [...b.sectionTypes].sort(),
    originalDataTypes: [...b.originalDataTypes].sort(),
    parts: b.parts,
    segmentCount: b.segmentCount,
    missingCurveCount: b.missingCurveCount,
    observedStreamKeys,
  }));
}

export function createRiverW05Adapter(
  prefCode: string,
  transport: FetchBinaryFn,
): SourceAdapter<RiverW05Record> {
  const descriptor = riverW05Descriptor(prefCode);
  return {
    descriptor,
    fetch: async (context: FetchContext): Promise<FetchResult> => {
      const zipBuffer = await transport(descriptor.sourceUrl, { timeoutMs: 300_000 });
      const unzipped = unzipSync(zipBuffer);
      const xmlPath = Object.keys(unzipped).find(
        (path) => path.endsWith('-g.xml') && !path.includes('KS-META'),
      );
      if (!xmlPath) throw new Error(`${descriptor.sourceUrl}: zip contains no W05 GML entry`);
      const entry = unzipped[xmlPath];
      if (!entry) throw new Error(`${descriptor.sourceUrl}: zip entry lookup failed`);
      const content = new TextDecoder('utf-8').decode(entry);
      return { content, contentType: 'application/xml', fetchedAt: context.now };
    },
    parse: (input: FetchResult) => parseRiverW05Xml(input.content),
    normalize: (record): NormalizedAsset => {
      let geometry: Geometry | null = null;
      if (record.parts.length > 0) {
        try {
          geometry = geometryToWgs84(
            { type: 'MultiLineString', coordinates: record.parts },
            descriptor.crs,
          );
        } catch {
          geometry = null;
        }
      }

      const attributes: AssetAttribute[] = [];
      const pushText = (key: string, value: string | null, sourceLabel: string) => {
        if (value !== null && value !== '') {
          attributes.push({
            key,
            valueText: value,
            valueNumber: null,
            unit: null,
            originalValue: value,
            sourceLabel,
          });
        }
      };
      pushText('river_code', record.riverCode, 'riverCode');
      pushText('water_system_code', record.waterSystemCode, 'waterSystemCode');
      // セグメント毎に異なり得るコード値は distinct 集合(カンマ結合)で保持する。
      pushText('section_type_codes', record.sectionTypes.join(','), 'sectionType');
      pushText('original_data_type_codes', record.originalDataTypes.join(','), 'originalDataType');
      attributes.push({
        key: 'segment_count',
        valueText: String(record.segmentCount),
        valueNumber: record.segmentCount,
        unit: null,
        originalValue: String(record.segmentCount),
        sourceLabel: 'ksj:Stream',
      });
      if (record.missingCurveCount > 0) {
        attributes.push({
          key: 'missing_curve_count',
          valueText: String(record.missingCurveCount),
          valueNumber: record.missingCurveCount,
          unit: null,
          originalValue: String(record.missingCurveCount),
          sourceLabel: 'ksj:location',
        });
      }

      return {
        // riverCode は全国一意 10 桁の自然キー。
        sourceRecordId: record.riverCode,
        assetType: 'river',
        // 原典が「名称不明」という文字列を持つ場合もそのまま保持する(捏造しない)。
        name: record.riverName,
        originalName: record.riverName,
        geometry,
        prefectureCode: prefCode,
        municipalityCode: null,
        managingAuthority: null,
        // 原典はレコード更新日を持たない(整備年度のみ) → 鮮度不明として null(Q006)。
        sourceUpdatedAt: null,
        attributes,
      };
    },
    schemaKeys: (records) => records[0]?.observedStreamKeys ?? [],
  };
}
