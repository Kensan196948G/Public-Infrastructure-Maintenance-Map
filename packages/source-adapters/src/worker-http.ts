/**
 * Workers-safe transport: global fetch only (no node:https import, so this
 * module is safe for the Worker bundle). Used by scheduled cron ingestion
 * (worker-adapters.ts). Legacy-TLS municipal endpoints that need an OpenSSL
 * cipher override (e.g. 大阪市) may fail here — they stay on the Node CLI path
 * until the endpoint upgrades TLS.
 */
import type { FetchBinaryFn, FetchTextFn } from './transport.js';

const DEFAULT_TIMEOUT_MS = 120_000;

export const fetchTextOverFetch: FetchTextFn = async (url, options = {}) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let text = new TextDecoder(options.encoding ?? 'utf-8').decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
};

export const fetchBinaryOverFetch: FetchBinaryFn = async (url, options = {}) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};
