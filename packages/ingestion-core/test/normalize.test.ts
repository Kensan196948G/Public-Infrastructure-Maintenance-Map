import { describe, expect, it } from 'vitest';
import {
  comparisonKey,
  fixLatLonSwap,
  geometryWithinJapan,
  isWithinJapan,
  lengthToMeters,
  normalizeText,
  parseDateToIso,
  parseLengthToMeters,
  parseNumeric,
  positionToWgs84,
} from '../src/index.js';

describe('normalizeText', () => {
  it('folds full-width ASCII and collapses whitespace', () => {
    expect(normalizeText('ＡＢＣ　１２３  橋')).toBe('ABC 123 橋');
  });
  it('applies NFC', () => {
    // が as base + combining dakuten → single code point
    expect(normalizeText('が')).toBe('が');
  });
  it('returns null for blank input', () => {
    expect(normalizeText('   ')).toBeNull();
    expect(normalizeText(null)).toBeNull();
  });
});

describe('comparisonKey', () => {
  it('matches across width and case', () => {
    expect(comparisonKey('ＭＩＲＡＩ 大橋')).toBe(comparisonKey('mirai大橋'));
  });
});

describe('parseDateToIso', () => {
  it('accepts ISO dates and datetimes', () => {
    expect(parseDateToIso('2026-07-16')).toBe('2026-07-16T00:00:00.000Z');
    expect(parseDateToIso('2026-07-16T09:30:00+09:00')).toBe('2026-07-16T00:30:00.000Z');
  });
  it('accepts slash and kanji formats', () => {
    expect(parseDateToIso('2026/7/1')).toBe('2026-07-01T00:00:00.000Z');
    expect(parseDateToIso('2026年7月1日')).toBe('2026-07-01T00:00:00.000Z');
  });
  it('converts 和暦', () => {
    expect(parseDateToIso('令和8年7月16日')).toBe('2026-07-16T00:00:00.000Z');
    expect(parseDateToIso('令和元年5月1日')).toBe('2019-05-01T00:00:00.000Z');
    expect(parseDateToIso('平成31年4月30日')).toBe('2019-04-30T00:00:00.000Z');
    expect(parseDateToIso('昭和64年1月7日')).toBe('1989-01-07T00:00:00.000Z');
  });
  it('rejects impossible dates without guessing', () => {
    expect(parseDateToIso('2026/02/31')).toBeNull();
    expect(parseDateToIso('不明')).toBeNull();
    expect(parseDateToIso('')).toBeNull();
  });
});

describe('units', () => {
  it('parses numerics with commas', () => {
    expect(parseNumeric('1,234.5')).toBe(1234.5);
    expect(parseNumeric('３２')).toBe(32);
    expect(parseNumeric('abc')).toBeNull();
  });
  it('converts lengths to meters', () => {
    expect(lengthToMeters(1.5, 'km')).toBe(1500);
    expect(lengthToMeters(250, 'mm')).toBe(0.25);
    expect(lengthToMeters(10, '尺')).toBeNull();
  });
  it('parses combined length strings', () => {
    expect(parseLengthToMeters('12.5km')).toBe(12500);
    expect(parseLengthToMeters('1,200 m')).toBe(1200);
    expect(parseLengthToMeters('40')).toBe(40);
    expect(parseLengthToMeters('十間')).toBeNull();
  });
});

describe('coords', () => {
  it('detects and fixes lat/lon swap', () => {
    const swapped = fixLatLonSwap([35.68, 139.76]);
    expect(swapped.swapped).toBe(true);
    expect(swapped.position).toEqual([139.76, 35.68]);
    const ok = fixLatLonSwap([139.76, 35.68]);
    expect(ok.swapped).toBe(false);
  });
  it('validates the Japan bbox', () => {
    expect(isWithinJapan(139.7, 35.7)).toBe(true);
    expect(isWithinJapan(2.35, 48.85)).toBe(false); // Paris
  });
  it('shifts Tokyo Datum coordinates towards WGS84 by roughly 300-500m', () => {
    const [lon, lat] = positionToWgs84([139.76, 35.68], 'EPSG:4301');
    // Tokyo→WGS84 in Kanto: lon decreases ~0.003°, lat increases ~0.003°.
    expect(lon).toBeLessThan(139.76);
    expect(lat).toBeGreaterThan(35.68);
    expect(Math.abs(139.76 - lon!)).toBeGreaterThan(0.001);
    expect(Math.abs(139.76 - lon!)).toBeLessThan(0.01);
  });
  it('keeps EPSG:4326 untouched and validates whole geometries', () => {
    expect(positionToWgs84([139.7, 35.7], 'EPSG:4326')).toEqual([139.7, 35.7]);
    expect(
      geometryWithinJapan({ type: 'Point', coordinates: [139.7, 35.7] }),
    ).toBe(true);
    expect(
      geometryWithinJapan({
        type: 'LineString',
        coordinates: [
          [139.7, 35.7],
          [2.35, 48.85],
        ],
      }),
    ).toBe(false);
  });
});
