/**
 * Transport abstraction shared by Node (CLI) and Workers (scheduled cron).
 * Adapters take a transport function so the same adapter code can run in both
 * runtimes without pulling node:https into the Worker bundle.
 */

export interface FetchTextOptions {
  /**
   * TextDecoder label for the response body. Defaults to 'utf-8' (shift_jis
   * is needed for several 行政機関 CSVs).
   */
  encoding?: string;
  /** Abort budget in ms. Defaults are transport-specific. */
  timeoutMs?: number;
  /**
   * OpenSSL cipher/security-level override (Node only). Municipal servers
   * with legacy 1024-bit DHE groups need 'DEFAULT@SECLEVEL=1'; Workers
   * ignore this field.
   */
  ciphers?: string;
}

export interface FetchBinaryOptions {
  timeoutMs?: number;
}

export type FetchTextFn = (url: string, options?: FetchTextOptions) => Promise<string>;
export type FetchBinaryFn = (url: string, options?: FetchBinaryOptions) => Promise<Uint8Array>;
