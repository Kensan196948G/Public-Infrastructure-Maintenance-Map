import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBinaryOverFetch, fetchTextOverFetch } from '../src/worker-http.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worker-http (global fetch transport)', () => {
  it('decodes text and strips a UTF-8 BOM', async () => {
    const bytes = new TextEncoder().encode('\uFEFF橋梁');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { status: 200 })),
    );
    await expect(fetchTextOverFetch('https://example.com/a.csv')).resolves.toBe('橋梁');
  });

  it('returns raw bytes for binary payloads', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bytes, { status: 200 })),
    );
    await expect(fetchBinaryOverFetch('https://example.com/a.zip')).resolves.toEqual(bytes);
  });

  it('throws on non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, 404)),
    );
    await expect(fetchTextOverFetch('https://example.com/missing')).rejects.toThrow(/HTTP 404/);
  });
});
