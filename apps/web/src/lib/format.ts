import type { AssetAttribute } from '@pimm/contracts';
import { UNKNOWN_LABEL } from './asset-meta.js';

/** Formats an ISO datetime as a Japanese date, or 「不明」 when absent/invalid. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN_LABEL;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN_LABEL;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Returns the text to display for a value, or 「不明」 when it is nullish/blank. */
export function orUnknown(value: string | null | undefined): string {
  if (value === null || value === undefined) return UNKNOWN_LABEL;
  const trimmed = value.trim();
  return trimmed === '' ? UNKNOWN_LABEL : trimmed;
}

/**
 * Renders an attribute's value without guessing. Prefers the normalized text,
 * then the number (+unit); falls back to 「不明」 when nothing is published.
 */
export function formatAttributeValue(attr: AssetAttribute): string {
  if (attr.valueText !== null && attr.valueText.trim() !== '') {
    return attr.valueText.trim();
  }
  if (attr.valueNumber !== null && Number.isFinite(attr.valueNumber)) {
    const unit = attr.unit && attr.unit.trim() !== '' ? ` ${attr.unit.trim()}` : '';
    return `${attr.valueNumber}${unit}`;
  }
  return UNKNOWN_LABEL;
}

/** Formats [lon, lat] for display (latitude first, as users expect). */
export function formatLatLon(point: readonly [number, number]): string {
  const [lon, lat] = point;
  return `緯度 ${lat.toFixed(5)}, 経度 ${lon.toFixed(5)}`;
}
