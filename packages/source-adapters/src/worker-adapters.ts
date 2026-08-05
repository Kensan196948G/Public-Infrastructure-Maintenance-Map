/**
 * Worker-safe adapter registry for scheduled cron ingestion.
 *
 * Factories receive the global-fetch transport (worker-http.ts), so this
 * module — and everything it imports — never pulls node:https into the
 * Worker bundle. 河川 W05 は大容量 XML（北海道 149MB 等）を Worker で処理
 * できないため意図的に含めない（CLI 運用）。サンプルアダプターも本番
 * スケジューラ対象外。
 */
import type { SourceAdapter } from '@pimm/ingestion-core';
import { createBridgeKumamotoAdapter } from './adapters/bridge-kumamoto.js';
import { createFacilityOsakaParkAdapter } from './adapters/facility-osaka-park.js';
import { createFacilityOsakaToiletAdapter } from './adapters/facility-osaka-toilet.js';
import { createPortC02Adapter } from './adapters/port-c02.js';
import { createRoadN13Adapter } from './adapters/road-n13.js';
import { fetchBinaryOverFetch, fetchTextOverFetch } from './worker-http.js';

export const WORKER_ADAPTERS: Readonly<Record<string, () => SourceAdapter<never>>> = {
  'bridge-kumamoto': () => createBridgeKumamotoAdapter(fetchTextOverFetch) as SourceAdapter<never>,
  'facility-osaka-park': () =>
    createFacilityOsakaParkAdapter(fetchTextOverFetch) as SourceAdapter<never>,
  'facility-osaka-toilet': () =>
    createFacilityOsakaToiletAdapter(fetchTextOverFetch) as SourceAdapter<never>,
  'port-c02': () => createPortC02Adapter(fetchBinaryOverFetch) as SourceAdapter<never>,
  'road-n13': () => createRoadN13Adapter(fetchBinaryOverFetch) as SourceAdapter<never>,
};

export function getWorkerAdapterBySlug(slug: string): SourceAdapter<never> | null {
  const factory = WORKER_ADAPTERS[slug];
  return factory ? factory() : null;
}
