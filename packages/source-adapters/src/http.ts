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
  /**
   * TextDecoder label for the response body. Defaults to 'utf-8'.
   * Node ships full-icu, so 'shift_jis' decodes correctly with no extra
   * dependency — several 行政機関 CSVs (e.g. 熊本県橋梁データ) are CP932.
   */
  encoding?: string;
}

/** Fetches a URL as a raw Buffer over HTTPS (binary payloads: zip, xlsx, ...). */
export function fetchBinaryOverHttps(
  url: string,
  options: Pick<FetchTextOptions, 'ciphers'> = {},
): Promise<Buffer> {
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
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

/** Fetches a URL as text over HTTPS, stripping a leading UTF-8 BOM if present. */
export async function fetchTextOverHttps(
  url: string,
  options: FetchTextOptions = {},
): Promise<string> {
  const buffer = await fetchBinaryOverHttps(url, options);
  let text = new TextDecoder(options.encoding ?? 'utf-8').decode(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}
