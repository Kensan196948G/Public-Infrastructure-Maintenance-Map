/**
 * Content hash and schema fingerprint (設計書 §6.2-4,5).
 * SHA-256 via WebCrypto — available in both Workers and Node 22+.
 */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of the raw fetched content — used to skip unchanged datasets. */
export function contentHash(content: string): Promise<string> {
  return sha256Hex(content);
}

/**
 * Order-insensitive fingerprint of the observed property keys (Q008).
 * Serialized with JSON.stringify rather than a delimiter-joined string so keys
 * that themselves contain the delimiter (newline, comma, ...) cannot make two
 * distinct key sets collide onto the same fingerprint (Issue #11): JSON quotes
 * and escapes every element, giving an injective encoding of the sorted array.
 */
export function schemaFingerprint(keys: readonly string[]): Promise<string> {
  const canonical = JSON.stringify([...new Set(keys)].sort());
  return sha256Hex(canonical);
}
