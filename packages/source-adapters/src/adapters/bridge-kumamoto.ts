/**
 * 熊本県 橋梁管理一覧表 (data.bodik.jp, CKAN). CSV has 2 preamble rows
 * (title, 基準日) before the real header — see parseKumamotoCsv.
 */
import type {
  FetchContext,
  FetchResult,
  NormalizedAsset,
  SourceAdapter,
  SourceDescriptor,
} from '@pimm/ingestion-core';
import {
  fixLatLonSwap,
  geometryToWgs84,
  normalizeText,
  parseCsv,
  parseDateToIso,
  parseNumeric,
} from '@pimm/ingestion-core';
import type { AssetAttribute, Geometry } from '@pimm/contracts';
import type { FetchTextFn } from '../transport.js';

const SOURCE_URL =
  'https://data.bodik.jp/dataset/494c4978-94fa-4994-8f95-2e928313ee83/resource/aa313774-90ee-419d-b5b8-af817ac80446/download/173_241031__r6.10.1.csv';

export const BRIDGE_KUMAMOTO_SCHEMA_KEYS = [
  'No',
  '橋梁ID',
  '施設名称',
  'ﾌﾘｶﾞﾅ',
  '路線名',
  '管理事務所名',
  '市町村',
  '位置\n（緯度）',
  '位置\n（経度）',
  '架設年度',
  '橋長\n（ｍ）',
  '幅員\n（ｍ）',
  '点検実施\n年度',
  '判定区分',
] as const;

export const BRIDGE_KUMAMOTO_DESCRIPTOR: SourceDescriptor = {
  slug: 'bridge-kumamoto',
  name: '熊本県 橋梁管理一覧表',
  providerName: '熊本県（土木部道路整備課）',
  sourceUrl: SOURCE_URL,
  accessType: 'file',
  format: 'csv',
  licenseName: 'CC BY 4.0 International',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.ja',
  redistribution: 'allowed',
  attributionText: '出典: 熊本県「橋梁管理一覧表」(data.bodik.jp、CC BY 4.0 International)',
  // データセットページ・DataStore API・原本XLSXのいずれにも測地系の明示的な宣言なし(2026-07-16
  // 調査で確認済み)。整備基準日(令和6年10月)と2011年以降の公共測量標準に基づきJGD2011と推定。
  // JGD2000との差は数十cm程度で本用途(地図表示)では無視できるが、宣言に基づく確定値ではない。
  crs: 'EPSG:6668',
  expectedSchemaKeys: [...BRIDGE_KUMAMOTO_SCHEMA_KEYS],
};

export type BridgeKumamotoRow = Record<string, string>;

/** 1行目タイトル・2行目基準日はヘッダーではない。3行目が実ヘッダー行。 */
function parseKumamotoCsv(text: string): BridgeKumamotoRow[] {
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0] === ''));
  const header = rows[2];
  if (!header) return [];
  return rows.slice(3).map((cells) => {
    const record: BridgeKumamotoRow = {};
    header.forEach((key, idx) => {
      record[key] = cells[idx] ?? '';
    });
    return record;
  });
}

/** 2行目「令和6年(2024年)10月1日現在」からデータセット全体の基準日(西暦併記)を抽出。 */
function extractDatasetDate(text: string): string | null {
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0] === ''));
  const titleRow = rows[1]?.join('');
  const match = titleRow ? /\((\d{4})年\)(\d{1,2})月(\d{1,2})日/u.exec(titleRow) : null;
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return parseDateToIso(`${match[1]}年${match[2]}月${match[3]}日`);
}

const TEXT_ATTRIBUTE_COLUMNS = [
  ['route_name', '路線名'],
  ['managing_office', '管理事務所名'],
  ['municipality_name', '市町村'],
  ['inspection_rank', '判定区分'],
] as const;

const NUMERIC_ATTRIBUTE_COLUMNS = [
  ['bridge_length', '橋長\n（ｍ）', 'm'],
  ['width', '幅員\n（ｍ）', 'm'],
  ['inspection_year', '点検実施\n年度', null],
] as const;

export function createBridgeKumamotoAdapter(
  transport: FetchTextFn,
): SourceAdapter<BridgeKumamotoRow> {
  // fetch → parse → normalize は runPipeline が単一実行内で順に await するため、
  // fetch 時点で一度だけ抽出したデータセット基準日を各行の normalize で使い回せる。
  let datasetUpdatedAt: string | null = null;

  return {
    descriptor: BRIDGE_KUMAMOTO_DESCRIPTOR,
    fetch: async (context: FetchContext): Promise<FetchResult> => {
      const content = await transport(SOURCE_URL, { encoding: 'shift_jis' });
      datasetUpdatedAt = extractDatasetDate(content);
      return { content, contentType: 'text/csv', fetchedAt: context.now };
    },
    parse: (input: FetchResult) => parseKumamotoCsv(input.content),
    normalize: (row): NormalizedAsset => {
      const lat = parseNumeric(row['位置\n（緯度）'] ?? null);
      const lon = parseNumeric(row['位置\n（経度）'] ?? null);
      let geometry: Geometry | null = null;
      if (lat !== null && lon !== null) {
        const { position } = fixLatLonSwap([lon, lat]);
        geometry = geometryToWgs84(
          { type: 'Point', coordinates: position },
          BRIDGE_KUMAMOTO_DESCRIPTOR.crs,
        );
      }

      const attributes: AssetAttribute[] = [];
      for (const [key, label] of TEXT_ATTRIBUTE_COLUMNS) {
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

      // 架設年度: 数値化できない場合も多い(「不明」876件)。原文はvalueTextに残す。
      const constructionYearText = normalizeText(row['架設年度'] ?? null);
      if (constructionYearText) {
        attributes.push({
          key: 'construction_year',
          valueText: constructionYearText,
          valueNumber: parseNumeric(row['架設年度'] ?? null),
          unit: null,
          originalValue: row['架設年度'] ?? null,
          sourceLabel: '架設年度',
        });
      }

      for (const [key, label, unit] of NUMERIC_ATTRIBUTE_COLUMNS) {
        const num = parseNumeric(row[label] ?? null);
        if (num !== null) {
          attributes.push({
            key,
            valueText: String(num),
            valueNumber: num,
            unit,
            originalValue: row[label] ?? null,
            sourceLabel: label,
          });
        }
      }

      return {
        sourceRecordId: normalizeText(row['橋梁ID'] ?? null),
        assetType: 'bridge',
        name: normalizeText(row['施設名称'] ?? null),
        originalName: row['施設名称'] ?? null,
        geometry,
        prefectureCode: '43',
        // 市町村名→総務省市区町村コードの変換表は本MVPスコープ外(45市町村分)。
        // 市町村名はmunicipality_name属性としてそのまま保持し情報は失わない。
        municipalityCode: null,
        managingAuthority: normalizeText(row['管理事務所名'] ?? null),
        sourceUpdatedAt: datasetUpdatedAt,
        attributes,
      };
    },
    schemaKeys: (records) => [...new Set(records.flatMap((r) => Object.keys(r)))],
  };
}
