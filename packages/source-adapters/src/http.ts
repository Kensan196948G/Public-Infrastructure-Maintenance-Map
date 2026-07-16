/**
 * Minimal HTTPS text fetcher for adapters that hit a real endpoint.
 * Node-only (adapters run from apps/api's CLI, not from a Worker).
 */
import * as https from 'node:https';

export interface FetchTextOptions {
  /**
   * OpenSSL cipher/security-level override, e.g. 'DEFAULT@SECLEVEL=1'.
   * Some municipal servers still serve a 1024-bit DHE group that OpenSSL
   * 3.x rejects at the default SECLEVEL=2 (dh key too small).
   */
  ciphers?: string;
}

/** Fetches a URL as text over HTTPS, stripping a leading UTF-8 BOM if present. */
export function fetchTextOverHttps(url: string, options: FetchTextOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ciphers: options.ciphers }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`${url}: HTTP ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        let text = Buffer.concat(chunks).toString('utf-8');
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        resolve(text);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}
