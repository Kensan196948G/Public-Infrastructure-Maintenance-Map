import { describe, expect, it, vi } from 'vitest';
import { runPipeline } from '@pimm/ingestion-core';
import type { SourceAdapter } from '@pimm/ingestion-core';
import {
  RIVER_W05_YEARS,
  createRiverW05Adapter,
  parseRiverW05Xml,
  riverW05Descriptor,
  riverW05SourceUrl,
} from '../src/adapters/river-w05.js';
import type { RiverW05Record } from '../src/adapters/river-w05.js';
import type { FetchBinaryFn } from '../src/transport.js';

const mockFetchBinary = vi.fn<FetchBinaryFn>();

const CTX = { now: '2026-07-30T00:00:00.000Z' };

/**
 * 実ファイル(W05-09_01-g.xml / W05-06_36-g.xml)と同じ構造の縮小 fixture。
 * - 0101940000: 2 セグメント(区間種別 1/3) → 1 河川へ集約・MultiLineString 2 parts
 * - 3600070000: 原典どおり riverName「名称不明」を保持
 * - 9999990000: location 参照先 Curve が無い唯一セグメント → geometry null → Q002
 * Stream 群の和集合が 11 要素すべてを含み、Q008 は発火しない。
 */
const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<ksj:Dataset gml:id="W05Dataset">
<gml:Curve gml:id="c-1">
  <gml:segments><gml:LineStringSegment><gml:posList>
44.42693173 141.76820938
44.42750000 141.76900000
  </gml:posList></gml:LineStringSegment></gml:segments>
</gml:Curve>
<gml:Curve gml:id="c-2">
  <gml:segments><gml:LineStringSegment><gml:posList>
44.42800000 141.77000000
44.42900000 141.77100000
44.43000000 141.77200000
  </gml:posList></gml:LineStringSegment></gml:segments>
</gml:Curve>
<gml:Curve gml:id="c-3">
  <gml:segments><gml:LineStringSegment><gml:posList>
34.00000000 134.50000000
34.00100000 134.50100000
  </gml:posList></gml:LineStringSegment></gml:segments>
</gml:Curve>
<ksj:Stream gml:id="r-1">
	<ksj:waterSystemCode codeSpace="WaterSystemTypeCode.xml">010194</ksj:waterSystemCode>
	<ksj:location xlink:href="#c-1"/>
	<ksj:riverCode codeSpace="RiverTypeCode.xml">0101940000</ksj:riverCode>
	<ksj:sectionType>1</ksj:sectionType>
	<ksj:riverName>開拓の沢川</ksj:riverName>
	<ksj:originalDataType>4</ksj:originalDataType>
	<ksj:flowDirection>1</ksj:flowDirection>
	<ksj:startRiverNode xlink:href="#n-1"/>
	<ksj:endRiverNode xlink:href="#n-2"/>
	<ksj:startStreamNode xlink:href="#n-1"/>
	<ksj:endStreamNode xlink:href="#n-2"/>
</ksj:Stream>
<ksj:Stream gml:id="r-2">
	<ksj:waterSystemCode codeSpace="WaterSystemTypeCode.xml">010194</ksj:waterSystemCode>
	<ksj:location xlink:href="#c-2"/>
	<ksj:riverCode codeSpace="RiverTypeCode.xml">0101940000</ksj:riverCode>
	<ksj:sectionType>3</ksj:sectionType>
	<ksj:riverName>開拓の沢川</ksj:riverName>
	<ksj:originalDataType>4</ksj:originalDataType>
	<ksj:flowDirection>1</ksj:flowDirection>
	<ksj:startRiverNode xlink:href="#n-2"/>
	<ksj:endRiverNode xlink:href="#n-3"/>
	<ksj:startStreamNode xlink:href="#n-2"/>
	<ksj:endStreamNode xlink:href="#n-3"/>
</ksj:Stream>
<ksj:Stream gml:id="r-3">
	<ksj:waterSystemCode codeSpace="WaterSystemTypeCode.xml">360007</ksj:waterSystemCode>
	<ksj:location xlink:href="#c-3"/>
	<ksj:riverCode codeSpace="RiverTypeCode.xml">3600070000</ksj:riverCode>
	<ksj:sectionType>0</ksj:sectionType>
	<ksj:riverName>名称不明</ksj:riverName>
	<ksj:originalDataType>3</ksj:originalDataType>
	<ksj:flowDirection>1</ksj:flowDirection>
	<ksj:startRiverNode xlink:href="#n-4"/>
	<ksj:endRiverNode xlink:href="#n-5"/>
	<ksj:startStreamNode xlink:href="#n-4"/>
	<ksj:endStreamNode xlink:href="#n-5"/>
</ksj:Stream>
<ksj:Stream gml:id="r-4">
	<ksj:waterSystemCode codeSpace="WaterSystemTypeCode.xml">999999</ksj:waterSystemCode>
	<ksj:location xlink:href="#c-missing"/>
	<ksj:riverCode codeSpace="RiverTypeCode.xml">9999990000</ksj:riverCode>
	<ksj:sectionType>4</ksj:sectionType>
	<ksj:riverName>幽霊川</ksj:riverName>
	<ksj:originalDataType>3</ksj:originalDataType>
	<ksj:flowDirection>1</ksj:flowDirection>
	<ksj:startRiverNode xlink:href="#n-6"/>
	<ksj:endRiverNode xlink:href="#n-7"/>
	<ksj:startStreamNode xlink:href="#n-6"/>
	<ksj:endStreamNode xlink:href="#n-7"/>
</ksj:Stream>
</ksj:Dataset>`;

function withFixedXml(base: SourceAdapter<RiverW05Record>): SourceAdapter<RiverW05Record> {
  return {
    ...base,
    fetch: async (context) => ({
      content: FIXTURE_XML,
      contentType: 'application/xml',
      fetchedAt: context.now,
    }),
  };
}

describe('parseRiverW05Xml', () => {
  it('merges stream segments into one river per riverCode with lat/lon swapped', () => {
    const records = parseRiverW05Xml(FIXTURE_XML);
    expect(records).toHaveLength(3);

    const kaitaku = records.find((r) => r.riverCode === '0101940000')!;
    expect(kaitaku.segmentCount).toBe(2);
    expect(kaitaku.parts).toHaveLength(2);
    // gml:posList は「緯度 経度」— [lon, lat] へ入替済みであること。
    expect(kaitaku.parts[0]?.[0]).toEqual([141.76820938, 44.42693173]);
    expect(kaitaku.sectionTypes).toEqual(['1', '3']);
    expect(kaitaku.riverName).toBe('開拓の沢川');

    const ghost = records.find((r) => r.riverCode === '9999990000')!;
    expect(ghost.parts).toHaveLength(0);
    expect(ghost.missingCurveCount).toBe(1);
  });
});

describe('river-w05 adapter (contract test)', () => {
  it('normalizes merged rivers and quarantines curve-less rivers as Q002', async () => {
    const result = await runPipeline(
      withFixedXml(createRiverW05Adapter('36', mockFetchBinary)),
      CTX,
    );

    expect(result.aborted).toBeNull();
    expect(result.counts.fetched).toBe(3);
    expect(result.accepted).toHaveLength(2);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0]?.issues.some((i) => i.ruleCode === 'Q002')).toBe(true);

    const kaitaku = result.accepted.find((r) => r.asset.sourceRecordId === '0101940000')?.asset;
    expect(kaitaku?.assetType).toBe('river');
    expect(kaitaku?.name).toBe('開拓の沢川');
    expect(kaitaku?.prefectureCode).toBe('36');
    expect(kaitaku?.geometry?.type).toBe('MultiLineString');
    expect(kaitaku?.sourceUpdatedAt).toBeNull();
    expect(kaitaku?.attributes.find((a) => a.key === 'section_type_codes')?.valueText).toBe('1,3');
    expect(kaitaku?.attributes.find((a) => a.key === 'segment_count')?.valueNumber).toBe(2);

    // 原典が持つ「名称不明」はそのまま保持する(placeholder への書換や推定をしない)。
    const unknown = result.accepted.find((r) => r.asset.sourceRecordId === '3600070000')?.asset;
    expect(unknown?.name).toBe('名称不明');
  });
});

describe('riverW05Descriptor', () => {
  it('resolves per-prefecture URLs from the year table (all 47 covered)', () => {
    expect(Object.keys(RIVER_W05_YEARS)).toHaveLength(47);
    expect(riverW05SourceUrl('01')).toBe(
      'https://nlftp.mlit.go.jp/ksj/gml/data/W05/W05-09/W05-09_01_GML.zip',
    );
    expect(riverW05SourceUrl('36')).toBe(
      'https://nlftp.mlit.go.jp/ksj/gml/data/W05/W05-06/W05-06_36_GML.zip',
    );
    expect(() => riverW05SourceUrl('99')).toThrow(/unknown prefecture/);
  });

  it('declares JGD2000 CRS and non-commercial (restricted) licensing', () => {
    const d = riverW05Descriptor('13');
    expect(d.slug).toBe('river-w05-13');
    expect(d.name).toContain('東京都');
    expect(d.crs).toBe('EPSG:4612');
    expect(d.redistribution).toBe('restricted');
    expect(d.licenseName).toContain('非商用');
  });
});
