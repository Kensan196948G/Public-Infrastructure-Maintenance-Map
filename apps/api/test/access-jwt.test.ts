import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { configFromEnv } from '../src/config.js';
import { resetAccessJwksCache, verifyAccessJwt } from '../src/access-jwt.js';
import { InMemoryAssetRepository } from '@pimm/database';
import type { webcrypto } from 'node:crypto';

const TEAM_DOMAIN = 'example.cloudflareaccess.com';
const AUD = 'aud-tag-under-test';
const KID = 'test-key-1';

let keyPair: webcrypto.CryptoKeyPair;
let jwks: { keys: unknown[] };

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function encodeSegment(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/** Signs a token with the test key, so only the claims under test vary. */
async function signToken(
  payloadOverrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
): Promise<string> {
  const header = { alg: 'RS256', kid: KID, typ: 'JWT', ...headerOverrides };
  const payload = {
    aud: [AUD],
    iss: `https://${TEAM_DOMAIN}`,
    email: 'Admin@Example.com',
    exp: Math.floor(Date.now() / 1000) + 600,
    ...payloadOverrides,
  };
  const signingInput = `${encodeSegment(header)}.${encodeSegment(payload)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as webcrypto.CryptoKeyPair;
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  jwks = { keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] };
});

afterEach(() => {
  resetAccessJwksCache();
  vi.unstubAllGlobals();
});

/** Serves the test JWKS so verification never reaches the network. */
function stubJwks(response: { ok?: boolean; status?: number; body?: unknown } = {}) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.body ?? jwks,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('verifyAccessJwt', () => {
  const options = { aud: AUD, teamDomain: TEAM_DOMAIN };

  it('accepts a correctly signed token and returns the normalized email claim', async () => {
    stubJwks();
    const result = await verifyAccessJwt(await signToken(), options);
    expect(result).toEqual({ ok: true, identity: { email: 'admin@example.com' } });
  });

  it('rejects a missing token', async () => {
    stubJwks();
    const result = await verifyAccessJwt(undefined, options);
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a token whose payload was tampered with after signing', async () => {
    stubJwks();
    const token = await signToken();
    const [header, , signature] = token.split('.');
    const forgedPayload = encodeSegment({
      aud: [AUD],
      iss: `https://${TEAM_DOMAIN}`,
      email: 'attacker@evil.test',
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const result = await verifyAccessJwt(`${header}.${forgedPayload}.${signature}`, options);
    expect(result).toEqual({ ok: false, reason: 'signature mismatch' });
  });

  it('rejects a token issued for another Access application', async () => {
    stubJwks();
    const result = await verifyAccessJwt(await signToken({ aud: ['some-other-app'] }), options);
    expect(result).toEqual({ ok: false, reason: 'audience mismatch' });
  });

  it('rejects a token from an unexpected issuer', async () => {
    stubJwks();
    const result = await verifyAccessJwt(
      await signToken({ iss: 'https://attacker.cloudflareaccess.com' }),
      options,
    );
    expect(result).toEqual({ ok: false, reason: 'issuer mismatch' });
  });

  it('rejects an expired token', async () => {
    stubJwks();
    const result = await verifyAccessJwt(
      await signToken({ exp: Math.floor(Date.now() / 1000) - 1 }),
      options,
    );
    expect(result).toEqual({ ok: false, reason: 'token expired' });
  });

  it('rejects a token not yet valid', async () => {
    stubJwks();
    const result = await verifyAccessJwt(
      await signToken({ nbf: Math.floor(Date.now() / 1000) + 600 }),
      options,
    );
    expect(result).toEqual({ ok: false, reason: 'token not yet valid' });
  });

  it('rejects the alg=none downgrade', async () => {
    stubJwks();
    const header = encodeSegment({ alg: 'none', kid: KID });
    const payload = encodeSegment({ aud: [AUD], iss: `https://${TEAM_DOMAIN}`, email: 'a@b.test' });
    const result = await verifyAccessJwt(`${header}.${payload}.`, options);
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a token signed with an unpublished key id', async () => {
    stubJwks();
    const result = await verifyAccessJwt(await signToken({}, { kid: 'rotated-away' }), options);
    expect(result).toEqual({ ok: false, reason: 'unknown kid' });
  });

  it('fails closed when the JWKS endpoint is unavailable', async () => {
    stubJwks({ ok: false, status: 503 });
    const result = await verifyAccessJwt(await signToken(), options);
    expect(result).toMatchObject({ ok: false });
  });

  it('caches the JWKS instead of refetching per request', async () => {
    const fetchMock = stubJwks();
    await verifyAccessJwt(await signToken(), options);
    await verifyAccessJwt(await signToken(), options);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('admin routes under Access JWT enforcement', () => {
  const baseEnv = {
    ADMIN_EMAILS: 'admin@example.com',
    CLOUDFLARE_ACCESS_AUD: AUD,
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  };

  const appFor = (env: Record<string, string>) =>
    createApp(new InMemoryAssetRepository({ assets: [], sources: [] }), configFromEnv(env));

  it('rejects a spoofed CF-Access-Authenticated-User-Email with no JWT', async () => {
    stubJwks();
    const response = await appFor(baseEnv).request('/api/v1/admin/ingestions?limit=1', {
      headers: { 'CF-Access-Authenticated-User-Email': 'admin@example.com' },
    });
    expect(response.status).toBe(401);
  });

  it('admits a caller presenting a valid Access JWT', async () => {
    stubJwks();
    const response = await appFor(baseEnv).request('/api/v1/admin/ingestions?limit=1', {
      headers: { 'Cf-Access-Jwt-Assertion': await signToken() },
    });
    expect(response.status).toBe(200);
  });

  it('ignores the header identity and uses the JWT claim for authorization', async () => {
    stubJwks();
    // The JWT names a non-allowlisted user; the header claims an admin. The
    // header must not be able to promote the caller.
    const response = await appFor(baseEnv).request('/api/v1/admin/ingestions?limit=1', {
      headers: {
        'Cf-Access-Jwt-Assertion': await signToken({ email: 'nobody@example.com' }),
        'CF-Access-Authenticated-User-Email': 'admin@example.com',
      },
    });
    expect(response.status).toBe(403);
  });

  it('fails closed when enforcement is on but the Access settings are absent', async () => {
    stubJwks();
    const response = await appFor({
      ADMIN_EMAILS: 'admin@example.com',
      REQUIRE_ACCESS_JWT: 'true',
    }).request('/api/v1/admin/ingestions?limit=1', {
      headers: { 'CF-Access-Authenticated-User-Email': 'admin@example.com' },
    });
    expect(response.status).toBe(500);
  });

  it('enforces JWT whenever an Access setting is present, without REQUIRE_ACCESS_JWT', async () => {
    stubJwks();
    expect(configFromEnv({ CLOUDFLARE_ACCESS_AUD: AUD }).requireAccessJwt).toBe(true);
  });
});
