import type { SourceAdapter } from '@pimm/ingestion-core';
import { nodeFetchBinary, nodeFetchText } from './http.js';
import { createBridgeKumamotoAdapter } from './adapters/bridge-kumamoto.js';
import { createFacilityOsakaParkAdapter } from './adapters/facility-osaka-park.js';
import { createFacilityOsakaToiletAdapter } from './adapters/facility-osaka-toilet.js';
import { createPortC02Adapter } from './adapters/port-c02.js';
import { createRiverW05Adapter, RIVER_W05_YEARS } from './adapters/river-w05.js';
import { createRoadN13Adapter } from './adapters/road-n13.js';
import { createSampleBridgesAdapter } from './adapters/sample-bridges.js';
import { createSampleFacilitiesAdapter } from './adapters/sample-facilities.js';
import { createSampleRiversAdapter } from './adapters/sample-rivers.js';

/** All registered adapters. Real sources are added here as they are onboarded. */
export function listAdapters(): SourceAdapter<never>[] {
  return [
    createSampleBridgesAdapter(),
    createSampleRiversAdapter(),
    createSampleFacilitiesAdapter(),
    createFacilityOsakaParkAdapter(nodeFetchText),
    createFacilityOsakaToiletAdapter(nodeFetchText),
    createBridgeKumamotoAdapter(nodeFetchText),
    createRoadN13Adapter(nodeFetchBinary),
    createPortC02Adapter(nodeFetchBinary),
    // 河川 W05 は都道府県別ソース(47件)。年度対応表から slug river-w05-XX を生成する。
    ...Object.keys(RIVER_W05_YEARS)
      .sort()
      .map((prefCode) => createRiverW05Adapter(prefCode, nodeFetchBinary)),
  ] as SourceAdapter<never>[];
}

export function getAdapterBySlug(slug: string): SourceAdapter<never> | null {
  return listAdapters().find((a) => a.descriptor.slug === slug) ?? null;
}
