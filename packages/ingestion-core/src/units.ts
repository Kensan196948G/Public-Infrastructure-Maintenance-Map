/**
 * Unit normalization to SI (要件 §7.3-3).
 * Length values are converted to meters; unknown units stay untouched
 * (value preserved as text, number left null) — no guessing.
 */

// Full-width variants (ｍ, ㎞) are covered by the NFKC fold in the lookup.
const LENGTH_FACTORS: Record<string, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  メートル: 1,
  キロメートル: 1000,
};

/** Parses "1,234.5" style numerics. Returns null when not numeric. */
export function parseNumeric(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.normalize('NFKC').replaceAll(',', '').trim();
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converts a length to meters. Returns null when the unit is unknown —
 * callers keep the original text and record no numeric value.
 */
export function lengthToMeters(value: number, unit: string): number | null {
  const factor = LENGTH_FACTORS[unit.normalize('NFKC').trim().toLowerCase()];
  return factor === undefined ? null : value * factor;
}

/** Parses "12.5km" / "1,234 m" style strings into meters. */
export function parseLengthToMeters(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const match = /^([\d,.]+)\s*([^\d\s]+)?$/u.exec(raw.normalize('NFKC').trim());
  if (!match || match[1] === undefined) return null;
  const value = parseNumeric(match[1]);
  if (value === null) return null;
  if (match[2] === undefined) return value; // unitless → assume meters already
  return lengthToMeters(value, match[2]);
}
