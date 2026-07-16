/**
 * Text normalization (要件 §7.3-1,2).
 * Unicode NFC, full-width ASCII → half-width, whitespace folding.
 * Originals are preserved by callers — normalization never destroys input.
 */

/** Converts full-width ASCII (！-～) and ideographic space to half-width. */
function foldWidth(input: string): string {
  return input
    .replace(/[！-～]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replaceAll('　', ' ');
}

/** NFC + width folding + whitespace collapse. Returns null for blank input. */
export function normalizeText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const normalized = foldWidth(raw.normalize('NFC')).replace(/\s+/gu, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

/** Normalized comparison key: case-insensitive, width/kana-width folded (NFKC). */
export function comparisonKey(raw: string | null | undefined): string {
  if (raw == null) return '';
  return raw.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
}
