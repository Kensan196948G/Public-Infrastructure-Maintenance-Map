/**
 * Cloudflare Access JWT verification.
 *
 * Access sets `CF-Access-Authenticated-User-Email` on requests it proxies, but
 * that header is only trustworthy when the request provably came through
 * Access. Any path that reaches the Worker directly (a workers.dev hostname, a
 * misconfigured route, a future custom domain without an Access application)
 * can set the header to an arbitrary allowlisted address and obtain admin
 * rights. Verifying the `Cf-Access-Jwt-Assertion` signature here makes the
 * Worker enforce its own authentication boundary instead of inheriting one.
 */

// Type-only import: the workspace compiles against lib ES2023 (no DOM), so the
// WebCrypto types come from @types/node. It is erased at build time, keeping
// the Worker bundle free of any node: dependency.
import type { webcrypto } from 'node:crypto';

/** Cached JWKS, keyed by team domain. Access rotates keys roughly every 6 weeks. */
const JWKS_TTL_MS = 60 * 60 * 1000;
const jwksCache = new Map<string, { fetchedAt: number; keys: Map<string, webcrypto.CryptoKey> }>();

export interface AccessIdentity {
  email: string;
}

export type AccessVerifyResult =
  { ok: true; identity: AccessIdentity } | { ok: false; reason: string };

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
}

async function loadKeys(
  teamDomain: string,
  now: number,
): Promise<Map<string, webcrypto.CryptoKey>> {
  const cached = jwksCache.get(teamDomain);
  if (cached && now - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`JWKS endpoint returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as {
    keys?: (webcrypto.JsonWebKey & { kid?: string })[];
  };
  const keys = new Map<string, webcrypto.CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid) continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      ),
    );
  }
  if (keys.size === 0) throw new Error('JWKS endpoint returned no usable keys');
  jwksCache.set(teamDomain, { fetchedAt: now, keys });
  return keys;
}

/**
 * Verifies an Access JWT and returns the email carried by the token itself.
 *
 * Fails closed: any malformed token, unknown key id, bad signature, wrong
 * audience/issuer, or expired claim yields `ok: false`. The caller must not
 * fall back to the request header when this fails.
 */
export async function verifyAccessJwt(
  token: string | undefined,
  options: { aud: string; teamDomain: string; now?: number },
): Promise<AccessVerifyResult> {
  if (!token) return { ok: false, reason: 'missing Cf-Access-Jwt-Assertion' };

  const [encodedHeader, encodedPayload, encodedSignature, ...rest] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature || rest.length > 0) {
    return { ok: false, reason: 'malformed token' };
  }

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeJsonSegment(encodedHeader);
    payload = decodeJsonSegment(encodedPayload);
  } catch {
    return { ok: false, reason: 'undecodable token segments' };
  }

  if (header.alg !== 'RS256') return { ok: false, reason: `unsupported alg ${String(header.alg)}` };
  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  if (!kid) return { ok: false, reason: 'missing kid' };

  const now = options.now ?? Date.now();

  let key: webcrypto.CryptoKey | undefined;
  try {
    key = (await loadKeys(options.teamDomain, now)).get(kid);
  } catch (error) {
    return { ok: false, reason: `JWKS unavailable: ${(error as Error).message}` };
  }
  if (!key) return { ok: false, reason: 'unknown kid' };

  // Decoding is fallible on malformed base64url, and an unauthenticated caller
  // must never be able to turn that into a 500 — the status difference would
  // itself leak that the kid resolved to a published key.
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(encodedSignature);
  } catch {
    return { ok: false, reason: 'undecodable signature' };
  }

  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) return { ok: false, reason: 'signature mismatch' };

  // `aud` is an array in Access tokens, but the spec permits a bare string.
  const audiences = Array.isArray(payload.aud)
    ? payload.aud.map(String)
    : typeof payload.aud === 'string'
      ? [payload.aud]
      : [];
  if (!audiences.includes(options.aud)) return { ok: false, reason: 'audience mismatch' };

  if (payload.iss !== `https://${options.teamDomain}`) {
    return { ok: false, reason: 'issuer mismatch' };
  }

  const nowSeconds = Math.floor(now / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
    return { ok: false, reason: 'token expired' };
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) {
    return { ok: false, reason: 'token not yet valid' };
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!email) return { ok: false, reason: 'token carries no email claim' };

  return { ok: true, identity: { email } };
}

/** Test seam: drops cached JWKS so a test can control fetch behaviour per case. */
export function resetAccessJwksCache(): void {
  jwksCache.clear();
}
