/**
 * Date normalization to ISO 8601 UTC (要件 §7.3-3).
 * Supports ISO strings, YYYY/M/D, YYYY.M.D, YYYY年M月D日 and 和暦 (令和/平成/昭和).
 * Unparseable input yields null — never a guessed date.
 */

/**
 * Japanese era → Gregorian mapping. `base` is (era-year 1 - 1) so year =
 * base + eraYear. `maxYear` bounds the era's real span so out-of-range years
 * (e.g. 令和0年, or 平成32年 which never existed) are rejected rather than
 * silently converted (Issue #11):
 *   昭和1..64 (〜1989-01-07), 平成1..31 (〜2019-04-30), 令和1.. (継続中).
 * 令和's cap is a generous sanity bound — the era is ongoing and datasets carry
 * planned future years (e.g. 「令和8年登録予定」).
 */
const ERA: Record<string, { base: number; maxYear: number }> = {
  令和: { base: 2018, maxYear: 99 },
  平成: { base: 1988, maxYear: 31 },
  昭和: { base: 1925, maxYear: 64 },
};

function toUtcIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject rollovers such as 2026-02-31.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

export function parseDateToIso(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const input = raw.normalize('NFKC').trim();
  if (input.length === 0) return null;

  // ISO 8601 (date or datetime).
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/u.exec(input);
  if (isoMatch) {
    const full = new Date(
      input.includes('T') || input.includes(' ') ? input : `${input}T00:00:00Z`,
    );
    return Number.isNaN(full.getTime()) ? null : full.toISOString();
  }

  // YYYY/M/D or YYYY.M.D
  const slash = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/u.exec(input);
  if (slash) return toUtcIso(Number(slash[1]), Number(slash[2]), Number(slash[3]));

  // YYYY年M月D日
  const kanji = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/u.exec(input);
  if (kanji) return toUtcIso(Number(kanji[1]), Number(kanji[2]), Number(kanji[3]));

  // 和暦: 令和N年M月D日 / 令和元年M月D日
  const wareki = /^(令和|平成|昭和)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日$/u.exec(input);
  if (wareki) {
    const era = wareki[1];
    const spec = era === undefined ? undefined : ERA[era];
    if (spec === undefined) return null;
    const eraYear = wareki[2] === '元' ? 1 : Number(wareki[2]);
    // Reject era years outside the era's real span (e.g. 令和0年, 平成32年).
    if (eraYear < 1 || eraYear > spec.maxYear) return null;
    return toUtcIso(spec.base + eraYear, Number(wareki[3]), Number(wareki[4]));
  }

  return null;
}
