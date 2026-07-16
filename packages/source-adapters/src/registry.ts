import type { SourceAdapter } from '@pimm/ingestion-core';
import { createSampleBridgesAdapter } from './adapters/sample-bridges.js';
import { createSampleFacilitiesAdapter } from './adapters/sample-facilities.js';
import { createSampleRiversAdapter } from './adapters/sample-rivers.js';

/** All registered adapters. Real sources are added here as they are onboarded. */
export function listAdapters(): SourceAdapter<never>[] {
  return [
    createSampleBridgesAdapter(),
    createSampleRiversAdapter(),
    createSampleFacilitiesAdapter(),
  ] as SourceAdapter<never>[];
}

export function getAdapterBySlug(slug: string): SourceAdapter<never> | null {
  return listAdapters().find((a) => a.descriptor.slug === slug) ?? null;
}
