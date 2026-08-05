/** JIS X 0401 prefecture codes → names (single source: @pimm/contracts). */
import { PREFECTURE_NAMES } from '@pimm/contracts';

export { PREFECTURE_NAMES };

/** The summary API groups records without a prefecture code under this key. */
export const UNKNOWN_PREFECTURE_KEY = 'unknown';

export function prefectureName(code: string | null | undefined): string {
  if (!code || code === UNKNOWN_PREFECTURE_KEY) return '都道府県不明';
  return PREFECTURE_NAMES[code] ?? `都道府県コード${code}`;
}

/**
 * All 47 prefectures in JIS order with their counts (0 when no data), plus a
 * trailing unknown bucket only when the summary actually reports one.
 */
export function listPrefectureEntries(
  byPrefecture: Record<string, number>,
): Array<[string, number]> {
  const entries: Array<[string, number]> = Object.keys(PREFECTURE_NAMES)
    .sort((a, b) => a.localeCompare(b))
    .map((code) => [code, byPrefecture[code] ?? 0]);
  const unknown = byPrefecture[UNKNOWN_PREFECTURE_KEY];
  if (unknown !== undefined && unknown > 0) {
    entries.push([UNKNOWN_PREFECTURE_KEY, unknown]);
  }
  return entries;
}
