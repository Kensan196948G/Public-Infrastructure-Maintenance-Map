/**
 * Duplicate candidate detection (Q005, 要件 §7.3-6).
 * Same asset type + equal normalized name + representative points within
 * a distance threshold. Records are flagged, never auto-merged (設計書 §6.3).
 */
import type { Geometry } from '@pimm/contracts';
import type { NormalizedAsset } from './adapter.js';
import { comparisonKey } from './text.js';

const EARTH_RADIUS_M = 6371008.8;

export function haversineMeters(
  [lon1, lat1]: readonly [number, number],
  [lon2, lat2]: readonly [number, number],
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function firstPosition(geometry: Geometry): [number, number] | null {
  switch (geometry.type) {
    case 'Point': {
      const [lon, lat] = geometry.coordinates;
      return lon !== undefined && lat !== undefined ? [lon, lat] : null;
    }
    case 'MultiPoint':
    case 'LineString': {
      const p = geometry.coordinates[0];
      return p && p[0] !== undefined && p[1] !== undefined ? [p[0], p[1]] : null;
    }
    case 'MultiLineString':
    case 'Polygon': {
      const p = geometry.coordinates[0]?.[0];
      return p && p[0] !== undefined && p[1] !== undefined ? [p[0], p[1]] : null;
    }
    case 'MultiPolygon': {
      const p = geometry.coordinates[0]?.[0]?.[0];
      return p && p[0] !== undefined && p[1] !== undefined ? [p[0], p[1]] : null;
    }
  }
}

export interface DuplicatePair {
  indexA: number;
  indexB: number;
  distanceMeters: number;
}

export const DEFAULT_DUPLICATE_DISTANCE_M = 300;

/**
 * O(n²) pairwise scan — fine for per-source batch sizes in MVP.
 * Returns index pairs into the input array.
 */
export function findDuplicateCandidates(
  assets: readonly NormalizedAsset[],
  distanceThresholdM: number = DEFAULT_DUPLICATE_DISTANCE_M,
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < assets.length; i += 1) {
    const a = assets[i];
    if (!a || a.name === null || a.geometry === null) continue;
    const posA = firstPosition(a.geometry);
    if (!posA) continue;
    for (let j = i + 1; j < assets.length; j += 1) {
      const b = assets[j];
      if (!b || b.assetType !== a.assetType || b.name === null || b.geometry === null) continue;
      if (comparisonKey(a.name) !== comparisonKey(b.name)) continue;
      const posB = firstPosition(b.geometry);
      if (!posB) continue;
      const distance = haversineMeters(posA, posB);
      if (distance <= distanceThresholdM) {
        pairs.push({ indexA: i, indexB: j, distanceMeters: distance });
      }
    }
  }
  return pairs;
}
