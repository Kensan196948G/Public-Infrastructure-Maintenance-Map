import { describe, expect, it, vi } from 'vitest';
import { runPipeline } from '@pimm/ingestion-core';

// bridge-kumamoto の fetch は HTTPS 取得だけでなく、データセット基準日を
// クロージャ変数へ抽出する副作用を持つ (normalize がそれを参照する)。
// adapter.fetch を丸ごと差し替えるとその副作用が失われるため、より下層の
// fetchTextOverHttps だけをモックし、本物の fetch 実装をそのまま実行させる。
vi.mock('../src/http.js', () => ({
  fetchTextOverHttps: vi.fn(),
}));

import { fetchTextOverHttps } from '../src/http.js';
import {
  BRIDGE_KUMAMOTO_DESCRIPTOR,
  createBridgeKumamotoAdapter,
} from '../src/adapters/bridge-kumamoto.js';

const CTX = { now: '2026-07-16T00:00:00.000Z' };
const mockFetchText = vi.mocked(fetchTextOverHttps);

// セル内改行を含む列名 (位置\n（緯度）等) はRFC4180に従いダブルクォートで囲む。
// クォートなしの生の\nはparseCsvにとって行区切りになってしまうため。
const HEADER =
  'No,橋梁ID,施設名称,ﾌﾘｶﾞﾅ,路線名,管理事務所名,市町村,"位置\n（緯度）","位置\n（経度）",架設年度,"橋長\n（ｍ）","幅員\n（ｍ）","点検実施\n年度",判定区分';

// 実データ (data.bodik.jp) と同じ多段ヘッダー構造: 1行目タイトル、2行目基準日
// (11番目のセルのみ値あり)、3行目が実ヘッダー。
const PREAMBLE = ['橋梁管理一覧表,,,,,,,,,,,,,', ',,,,,,,,,,令和6年(2024年)10月1日現在,,,'];

describe('bridge-kumamoto adapter (contract test)', () => {
  it('parses the multi-row header and normalizes a well-formed record', async () => {
    const csv = [
      ...PREAMBLE,
      HEADER,
      '1,BR0-430005-00001,新山崎橋,ｼﾝﾔﾏｻｷﾊｼ,国道218号,宇城地域振興局,宇城市,32.6437100,130.7447300,1963,36,9,2020,Ⅲ',
    ].join('\n');
    mockFetchText.mockResolvedValueOnce(csv);

    const result = await runPipeline(createBridgeKumamotoAdapter(), CTX);

    expect(result.aborted).toBeNull();
    expect(result.counts.fetched).toBe(1);
    expect(result.accepted).toHaveLength(1);
    const asset = result.accepted[0]?.asset;
    expect(asset?.sourceRecordId).toBe('BR0-430005-00001');
    expect(asset?.name).toBe('新山崎橋');
    expect(asset?.assetType).toBe('bridge');
    // データセット基準日 (2行目) は全レコード共通で反映される。
    expect(asset?.sourceUpdatedAt).toBe('2024-10-01T00:00:00.000Z');
    expect(asset?.geometry?.type).toBe('Point');
    if (asset?.geometry?.type === 'Point') {
      expect(asset.geometry.coordinates[0]).toBeCloseTo(130.74473, 4); // lon
      expect(asset.geometry.coordinates[1]).toBeCloseTo(32.64371, 4); // lat
    }
    expect(asset?.attributes.find((a) => a.key === 'route_name')?.valueText).toBe('国道218号');
    expect(asset?.attributes.find((a) => a.key === 'bridge_length')?.valueNumber).toBe(36);
    expect(asset?.attributes.find((a) => a.key === 'inspection_rank')?.valueText).toBe('Ⅲ');
    expect(asset?.attributes.find((a) => a.key === 'construction_year')?.valueNumber).toBe(1963);
  });

  it('keeps "不明" construction year as text with a null number', async () => {
    const csv = [
      ...PREAMBLE,
      HEADER,
      '1,BR0-000001,不明橋,ﾌﾒｲﾊｼ,,,八代市,32.5,130.6,不明,10,3,2021,Ⅰ',
    ].join('\n');
    mockFetchText.mockResolvedValueOnce(csv);

    const result = await runPipeline(createBridgeKumamotoAdapter(), CTX);
    const attr = result.accepted[0]?.asset.attributes.find((a) => a.key === 'construction_year');
    expect(attr?.valueText).toBe('不明');
    expect(attr?.valueNumber).toBeNull();
  });

  it('quarantines placeholder rows whose lat/lon are non-numeric planning text', async () => {
    const csv = [
      ...PREAMBLE,
      HEADER,
      '1,BR0-999999,予定橋,ﾖﾃｲﾊｼ,,,人吉市,R6登録予定,R6登録予定,R6登録予定,R6登録予定,R6登録予定,R6登録予定,R6登録予定',
    ].join('\n');
    mockFetchText.mockResolvedValueOnce(csv);

    const result = await runPipeline(createBridgeKumamotoAdapter(), CTX);
    expect(result.accepted).toHaveLength(0);
    expect(result.quarantined.map((p) => p.asset.sourceRecordId)).toEqual(['BR0-999999']);
  });
});

describe('BRIDGE_KUMAMOTO_DESCRIPTOR', () => {
  it('declares CC BY 4.0 licensing and the estimated JGD2011 CRS', () => {
    expect(BRIDGE_KUMAMOTO_DESCRIPTOR.licenseName).toBe('CC BY 4.0 International');
    expect(BRIDGE_KUMAMOTO_DESCRIPTOR.redistribution).toBe('allowed');
    expect(BRIDGE_KUMAMOTO_DESCRIPTOR.crs).toBe('EPSG:6668');
  });
});
