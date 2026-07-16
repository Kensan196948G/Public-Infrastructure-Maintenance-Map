import type { BBox } from '@pimm/contracts';
import { MAX_BBOX_AREA_DEG2 } from '@pimm/contracts';

export function bboxArea(bbox: BBox): number {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return (maxLon - minLon) * (maxLat - minLat);
}

/**
 * Whether a viewport bbox is small enough to send as a spatial filter.
 * At low zoom (e.g. the default country-wide view) the visible area can
 * exceed the server's MAX_BBOX_AREA_DEG2 guard (apps/api rejects it with
 * 400). Rather than erroring on first load, the caller omits bbox entirely
 * when this returns false — the query still runs, just unfiltered by area
 * (bounded by the existing `limit` page size instead).
 */
export function isBboxQueryable(bbox: BBox | null): bbox is BBox {
  return bbox !== null && bboxArea(bbox) <= MAX_BBOX_AREA_DEG2;
}
