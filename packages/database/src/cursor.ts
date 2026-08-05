/**
 * Opaque keyset cursor for the deterministic (name asc, id asc) ordering.
 * Carries the *last seen row's* sort key, so a page inserted or removed
 * between requests cannot shift results (the OFFSET-pagination weakness).
 * The comparison is backend-specific (collation may differ between
 * Postgres and JS localeCompare) but each backend is self-consistent with
 * its own ORDER BY, so cursors round-trip within one backend.
 */
export interface CursorPayload {
  name: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  // UTF-8-safe base64url: names may contain non-Latin-1 characters (Japanese),
  // which the legacy `btoa(unicode)` path rejects.
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/** Returns null for malformed cursors — callers should map that to a 400. */
export function decodeCursor(raw: string): CursorPayload | null {
  try {
    const b64 = raw.replaceAll('-', '+').replaceAll('_', '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'name' in parsed &&
      typeof (parsed as { name: unknown }).name === 'string' &&
      'id' in parsed &&
      typeof (parsed as { id: unknown }).id === 'string'
    ) {
      return {
        name: (parsed as { name: string }).name,
        id: (parsed as { id: string }).id,
      };
    }
    return null;
  } catch {
    return null;
  }
}
