import type { AssetType } from '@pimm/contracts';
import { ASSET_TYPE_META } from './asset-meta.js';

/**
 * The publish path stores this literal when a source record carries no name
 * (packages/database publisher: `name ?? originalName ?? '(名称不明)'`).
 * Some sources — e.g. 国土数値情報 道路 N13 — have no name field at all, so
 * the value is expected data, not a defect.
 */
export const NAMELESS_DB_VALUE = '(名称不明)';

export function isNameless(name: string | null | undefined): boolean {
  return name == null || name.trim() === '' || name === NAMELESS_DB_VALUE;
}

/**
 * Synthesizes a human-readable label for nameless assets so hundreds of them
 * stay distinguishable in the list. The DB value is never rewritten — the
 * source data must not be altered, only presented (設計書 §8.2).
 */
export function assetDisplayName(
  name: string | null | undefined,
  type: AssetType,
  representativePoint?: readonly [number, number] | null,
): string {
  if (!isNameless(name)) return name as string;
  const label = ASSET_TYPE_META[type].label;
  if (representativePoint) {
    const [lon, lat] = representativePoint;
    return `名称未収録の${label}（${lat.toFixed(3)}, ${lon.toFixed(3)} 付近）`;
  }
  return `名称未収録の${label}`;
}
