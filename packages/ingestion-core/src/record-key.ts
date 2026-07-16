import type { NormalizedAsset } from './adapter.js';
import { sha256Hex } from './fingerprint.js';

/**
 * Stable fallback key for sources without provider ids (設計書 §5.1: 決定的ID生成).
 * Shared by sample-mode seeding and DB publish so both paths identify a
 * given record the same way across re-ingestion runs.
 *
 * Hashes the full name+geometry rather than truncating (former version sliced
 * JSON.stringify(geometry) to 128 chars, so two LineStrings differing only
 * after that offset collided onto the same key).
 */
export async function recordKey(
  asset: Pick<NormalizedAsset, 'sourceRecordId' | 'name' | 'geometry'>,
): Promise<string> {
  if (asset.sourceRecordId) return asset.sourceRecordId;
  const point = asset.geometry ? JSON.stringify(asset.geometry) : 'nogeom';
  const hash = await sha256Hex(`${asset.name ?? 'noname'}:${point}`);
  return `h:${hash}`;
}
