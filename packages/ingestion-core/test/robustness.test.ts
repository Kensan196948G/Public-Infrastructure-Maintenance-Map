import { describe, expect, it } from 'vitest';
import { CsvParseError, parseCsv, parseDateToIso, schemaFingerprint } from '../src/index.js';

// Issue #11: 取込パイプライン入力の堅牢性

describe('parseCsv RFC 4180 strictness (Issue #11)', () => {
  it('still parses valid quoted fields, escaped quotes and embedded delimiters', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
    expect(parseCsv('"a""b"')).toEqual([['a"b']]);
    expect(parseCsv('x,y\r\nz,w')).toEqual([
      ['x', 'y'],
      ['z', 'w'],
    ]);
  });

  it('throws on an unterminated quoted field instead of silently accepting it', () => {
    expect(() => parseCsv('"abc')).toThrow(CsvParseError);
    expect(() => parseCsv('a,"b,c')).toThrow(CsvParseError);
  });

  it('throws when data follows a closing quote before the delimiter', () => {
    expect(() => parseCsv('"a"b')).toThrow(CsvParseError);
    expect(() => parseCsv('x,"a"b,y')).toThrow(CsvParseError);
  });
});

describe('parseDateToIso 和暦 era range (Issue #11)', () => {
  it('rejects era years outside the era real span', () => {
    expect(parseDateToIso('令和0年5月1日')).toBeNull();
    expect(parseDateToIso('平成32年1月1日')).toBeNull(); // 平成 ended at 31
    expect(parseDateToIso('昭和65年1月1日')).toBeNull(); // 昭和 ended at 64
  });

  it('still accepts valid 和暦 dates', () => {
    expect(parseDateToIso('令和元年5月1日')).toBe('2019-05-01T00:00:00.000Z');
    expect(parseDateToIso('令和8年7月16日')).toBe('2026-07-16T00:00:00.000Z');
    expect(parseDateToIso('平成31年4月30日')).toBe('2019-04-30T00:00:00.000Z');
    expect(parseDateToIso('昭和64年1月7日')).toBe('1989-01-07T00:00:00.000Z');
  });
});

describe('schemaFingerprint collision safety (Issue #11)', () => {
  it('does not collide when a key contains the former delimiter (newline)', async () => {
    const a = await schemaFingerprint(['a\nb']);
    const b = await schemaFingerprint(['a', 'b']);
    expect(a).not.toBe(b);
  });

  it('is order- and duplicate-insensitive', async () => {
    const a = await schemaFingerprint(['b', 'a']);
    const b = await schemaFingerprint(['a', 'b', 'a']);
    expect(a).toBe(b);
  });
});
