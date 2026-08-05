import { describe, expect, it, vi } from 'vitest';
import { runPipeline } from '@pimm/ingestion-core';
import type { SourceAdapter } from '@pimm/ingestion-core';
import {
  PORT_C02_DESCRIPTOR,
  PORT_C02_SCHEMA_KEYS,
  createPortC02Adapter,
  parsePortC02Xml,
} from '../src/adapters/port-c02.js';
import type { PortC02Record } from '../src/adapters/port-c02.js';
import type { FetchBinaryFn } from '../src/transport.js';

const CTX = { now: '2026-07-30T00:00:00.000Z' };
const mockFetchBinary = vi.fn<FetchBinaryFn>();

/**
 * 実ファイル(C02-14-g.xml)と同じ構造の縮小 fixture。
 * - 室蘭: 任意要素(administratorName / seaAgencyType / designatedDate)を全て持つ
 * - 堀株: 任意要素なし(実データの61港湾と同型) + 名称にエンティティを含める
 * - 幽霊港: position 参照先の Point が存在しない → Q002 隔離
 * 3 レコードの和集合が PORT_C02_SCHEMA_KEYS と一致するため Q008 は発火しない。
 */
const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<ksj:Dataset gml:id="C02Dataset">
<gml:Point gml:id="p_1">
  <gml:pos>42.34796276 140.95976548</gml:pos>
</gml:Point>
<gml:Point gml:id="p_2">
  <gml:pos>43.18560000 140.46160000</gml:pos>
</gml:Point>
<ksj:PortAndHarbor gml:id="ck01_1">
  <ksj:position xlink:href="#p_1"/>
  <ksj:type1>1</ksj:type1>
  <ksj:type2>12</ksj:type2>
  <ksj:administrativeAreaCode codeSpace="AdministrativeAreaCode.xml">01205</ksj:administrativeAreaCode>
  <ksj:portCode>01001</ksj:portCode>
  <ksj:portName>室蘭</ksj:portName>
  <ksj:administratorType>2</ksj:administratorType>
  <ksj:administratorName>室蘭市</ksj:administratorName>
  <ksj:seaAgencyType>1</ksj:seaAgencyType>
  <ksj:designatedDate>
    <gml:TimeInstant gml:id="ti_1">
      <gml:timePosition>19510119</gml:timePosition>
    </gml:TimeInstant>
  </ksj:designatedDate>
  <ksj:foundationDate>
    <gml:TimeInstant gml:id="ti_2">
      <gml:timePosition>19480101</gml:timePosition>
    </gml:TimeInstant>
  </ksj:foundationDate>
  <ksj:boundaryLengthOfOutlyingFacility>1234</ksj:boundaryLengthOfOutlyingFacility>
  <ksj:mooringFacilitiesLength>5678</ksj:mooringFacilitiesLength>
  <ksj:regularFerry>1</ksj:regularFerry>
</ksj:PortAndHarbor>
<ksj:PortAndHarbor gml:id="ck01_2">
  <ksj:position xlink:href="#p_2"/>
  <ksj:type1>0</ksj:type1>
  <ksj:type2>15</ksj:type2>
  <ksj:administrativeAreaCode codeSpace="AdministrativeAreaCode.xml">01401</ksj:administrativeAreaCode>
  <ksj:portCode>01039</ksj:portCode>
  <ksj:portName>堀株&amp;テスト</ksj:portName>
  <ksj:administratorType>5</ksj:administratorType>
  <ksj:foundationDate>
    <gml:TimeInstant gml:id="ti_3">
      <gml:timePosition>19570123</gml:timePosition>
    </gml:TimeInstant>
  </ksj:foundationDate>
  <ksj:boundaryLengthOfOutlyingFacility>0</ksj:boundaryLengthOfOutlyingFacility>
  <ksj:mooringFacilitiesLength>0</ksj:mooringFacilitiesLength>
  <ksj:regularFerry>0</ksj:regularFerry>
</ksj:PortAndHarbor>
<ksj:PortAndHarbor gml:id="ck01_3">
  <ksj:position xlink:href="#p_missing"/>
  <ksj:type1>0</ksj:type1>
  <ksj:type2>15</ksj:type2>
  <ksj:administrativeAreaCode codeSpace="AdministrativeAreaCode.xml">01402</ksj:administrativeAreaCode>
  <ksj:portCode>01099</ksj:portCode>
  <ksj:portName>幽霊港</ksj:portName>
  <ksj:administratorType>5</ksj:administratorType>
  <ksj:foundationDate>
    <gml:TimeInstant gml:id="ti_4">
      <gml:timePosition>19600101</gml:timePosition>
    </gml:TimeInstant>
  </ksj:foundationDate>
  <ksj:boundaryLengthOfOutlyingFacility>0</ksj:boundaryLengthOfOutlyingFacility>
  <ksj:mooringFacilitiesLength>0</ksj:mooringFacilitiesLength>
  <ksj:regularFerry>0</ksj:regularFerry>
</ksj:PortAndHarbor>
</ksj:Dataset>`;

/** 実 zip の fetch/unzip をテストで実行しないよう固定 XML に差し替える。 */
function withFixedXml(base: SourceAdapter<PortC02Record>): SourceAdapter<PortC02Record> {
  return {
    ...base,
    fetch: async (context) => ({
      content: FIXTURE_XML,
      contentType: 'application/xml',
      fetchedAt: context.now,
    }),
  };
}

describe('parsePortC02Xml', () => {
  it('resolves point references and swaps gml:pos lat/lon into [lon, lat]', () => {
    const records = parsePortC02Xml(FIXTURE_XML);
    expect(records).toHaveLength(3);
    // gml:pos は「緯度 経度」— [lon, lat] へ入替済みであること。
    expect(records[0]?.position).toEqual([140.95976548, 42.34796276]);
    expect(records[0]?.properties['portName']).toBe('室蘭');
    expect(records[0]?.properties['designatedDate']).toBe('19510119');
    // エンティティ復号。
    expect(records[1]?.properties['portName']).toBe('堀株&テスト');
    // 参照先 Point が無い場合は null(後段の Q002 に委ねる)。
    expect(records[2]?.position).toBeNull();
  });

  it('covers the full expected schema key set across records', () => {
    const records = parsePortC02Xml(FIXTURE_XML);
    const union = new Set(records.flatMap((r) => Object.keys(r.properties)));
    expect([...union].sort()).toEqual([...PORT_C02_SCHEMA_KEYS].sort());
  });
});

describe('port-c02 adapter (contract test)', () => {
  it('normalizes ports with natural key, admin codes and raw-value attributes', async () => {
    const result = await runPipeline(withFixedXml(createPortC02Adapter(mockFetchBinary)), CTX);

    expect(result.aborted).toBeNull();
    expect(result.counts.fetched).toBe(3);
    expect(result.accepted).toHaveLength(2);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0]?.issues.some((i) => i.ruleCode === 'Q002')).toBe(true);

    const muroran = result.accepted.find((r) => r.asset.name === '室蘭')?.asset;
    expect(muroran?.assetType).toBe('port');
    expect(muroran?.sourceRecordId).toBe('01001');
    expect(muroran?.prefectureCode).toBe('01');
    expect(muroran?.municipalityCode).toBe('01205');
    expect(muroran?.managingAuthority).toBe('室蘭市');
    // 原典はレコード更新日を持たない → 鮮度不明(Q006 側の扱い)。
    expect(muroran?.sourceUpdatedAt).toBeNull();
    expect(muroran?.geometry).toEqual({
      type: 'Point',
      coordinates: [140.95976548, 42.34796276],
    });
    expect(muroran?.attributes.find((a) => a.key === 'port_type1_code')?.valueText).toBe('1');
    expect(muroran?.attributes.find((a) => a.key === 'designated_date_raw')?.valueText).toBe(
      '19510119',
    );
    const mooring = muroran?.attributes.find((a) => a.key === 'mooring_facilities_length');
    expect(mooring?.valueNumber).toBe(5678);

    // 管理者名が無い港湾は欠損のまま受け入れる(実データ61件と同型)。
    const horikappu = result.accepted.find((r) => r.asset.sourceRecordId === '01039')?.asset;
    expect(horikappu?.managingAuthority).toBeNull();
    expect(horikappu?.attributes.find((a) => a.key === 'sea_agency_type_code')).toBeUndefined();
  });
});

describe('PORT_C02_DESCRIPTOR', () => {
  it('declares JGD2000 CRS and the non-commercial (restricted) licensing', () => {
    expect(PORT_C02_DESCRIPTOR.crs).toBe('EPSG:4612');
    expect(PORT_C02_DESCRIPTOR.redistribution).toBe('restricted');
    expect(PORT_C02_DESCRIPTOR.format).toBe('xml');
    expect(PORT_C02_DESCRIPTOR.licenseName).toContain('非商用');
    expect(PORT_C02_DESCRIPTOR.attributionText).toContain('国土数値情報');
  });
});
