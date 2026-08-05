import { MUNICIPALITY_CODES } from './data/municipality-codes.js';
import { PREFECTURE_NAMES } from './prefectures.js';

const normalize = (value: string): string => value.normalize('NFKC').replace(/\s+/gu, '');

interface NormalizedEntry {
  prefecture: string;
  name: string;
  code: string;
}

const NORMALIZED: readonly NormalizedEntry[] = MUNICIPALITY_CODES.map((entry) => ({
  prefecture: normalize(entry.prefecture),
  name: normalize(entry.name),
  code: entry.code,
}));

export interface MunicipalityMatch {
  /** 5桁市区町村コード（municipality_code char(5) と同形式） */
  code: string;
  /** 市区町村名（例: 千代田区） */
  name: string;
  /** 都道府県名（例: 東京都） */
  prefecture: string;
}

/**
 * Finds the most specific municipality contained in an address string
 * (e.g. 「東京都千代田区丸の内1-1」→ 千代田区 / 13101). Same-name
 * municipalities across prefectures are resolved by preferring the one whose
 * prefecture appears at the start of the address. Returns null when nothing
 * matches — callers keep the code as 不明 rather than guessing.
 */
export function municipalityCodeForAddress(
  raw: string | null | undefined,
): MunicipalityMatch | null {
  if (!raw) return null;
  const address = normalize(raw);
  if (address.length === 0) return null;

  const addressPrefecture =
    Object.values(PREFECTURE_NAMES).find((name) => address.startsWith(normalize(name))) ?? null;

  let best: MunicipalityMatch | null = null;
  let bestScore = -1;
  for (const entry of NORMALIZED) {
    if (!address.includes(entry.name)) continue;
    const prefectureBonus =
      addressPrefecture !== null && entry.prefecture === addressPrefecture ? 1000 : 0;
    const score = prefectureBonus + entry.name.length;
    if (score > bestScore) {
      bestScore = score;
      best = { code: entry.code, name: entry.name, prefecture: entry.prefecture };
    }
  }
  return best;
}
