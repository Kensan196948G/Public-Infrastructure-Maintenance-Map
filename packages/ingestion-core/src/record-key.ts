import type { NormalizedAsset } from './adapter.js';

/**
 * Stable fallback key for sources without provider ids (設計書 §5.1: 決定的ID生成).
 * Shared by sample-mode seeding and DB publish so both paths identify a
 * given record the same way across re-ingestion runs.
 */
export function recordKey(asset: Pick<NormalizedAsset, 'sourceRecordId' | 'name' | 'geometry'>): string {
  if (asset.sourceRecordId) return asset.sourceRecordId;
  const point = asset.geometry ? JSON.stringify(asset.geometry).slice(0, 128) : 'nogeom';
  return `${asset.name ?? 'noname'}:${point}`;
}
