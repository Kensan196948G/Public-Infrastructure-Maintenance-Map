import { describe, expect, it } from 'vitest';
import {
  listPrefectureEntries,
  prefectureName,
  UNKNOWN_PREFECTURE_KEY,
} from '../src/lib/prefectures.js';

describe('listPrefectureEntries', () => {
  it('always lists all 47 prefectures in JIS order with zero-filled counts', () => {
    const entries = listPrefectureEntries({ '43': 3589, '27': 1588 });
    expect(entries).toHaveLength(47);
    expect(entries[0]).toEqual(['01', 0]);
    expect(entries[12]).toEqual(['13', 0]);
    expect(entries[26]).toEqual(['27', 1588]);
    expect(entries[42]).toEqual(['43', 3589]);
    expect(entries[46]).toEqual(['47', 0]);
  });

  it('appends the unknown bucket only when it holds records', () => {
    expect(listPrefectureEntries({ [UNKNOWN_PREFECTURE_KEY]: 5 })).toHaveLength(48);
    expect(listPrefectureEntries({ [UNKNOWN_PREFECTURE_KEY]: 0 })).toHaveLength(47);
    expect(listPrefectureEntries({})).toHaveLength(47);
  });
});

describe('prefectureName', () => {
  it('resolves JIS codes and falls back for unknown values', () => {
    expect(prefectureName('13')).toBe('東京都');
    expect(prefectureName(UNKNOWN_PREFECTURE_KEY)).toBe('都道府県不明');
    expect(prefectureName(null)).toBe('都道府県不明');
    expect(prefectureName('99')).toBe('都道府県コード99');
  });
});
