/**
 * Opaque offset cursor. The payload is intentionally tiny; the sort order
 * (name asc, id asc) is deterministic so an offset cursor is stable enough
 * for MVP page sizes. Swap for keyset pagination when moving to PostGIS scale.
 */
export interface CursorPayload {
  offset: number;
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return btoa(json).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/** Returns null for malformed cursors — callers should map that to a 400. */
export function decodeCursor(raw: string): CursorPayload | null {
  try {
    const b64 = raw.replaceAll('-', '+').replaceAll('_', '/');
    const parsed: unknown = JSON.parse(atob(b64));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'offset' in parsed &&
      typeof (parsed as { offset: unknown }).offset === 'number' &&
      Number.isInteger((parsed as { offset: number }).offset) &&
      (parsed as { offset: number }).offset >= 0
    ) {
      return { offset: (parsed as { offset: number }).offset };
    }
    return null;
  } catch {
    return null;
  }
}
