/**
 * Geometry validation and conservative repair (Q004).
 * Repairs are limited to closing an open polygon ring; anything else
 * is rejected so bad shapes never reach the published layer.
 */
import type { Geometry, Position } from '@pimm/contracts';

export interface GeometryCheckResult {
  ok: boolean;
  geometry: Geometry;
  repaired: boolean;
  reason?: string;
}

function positionsValid(positions: Position[]): boolean {
  return positions.every((p) => {
    const [lon, lat] = p;
    return (
      lon !== undefined &&
      lat !== undefined &&
      Number.isFinite(lon) &&
      Number.isFinite(lat) &&
      lon >= -180 &&
      lon <= 180 &&
      lat >= -90 &&
      lat <= 90
    );
  });
}

function sameXY(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function checkRing(ring: Position[]): { ring: Position[]; repaired: boolean; ok: boolean } {
  if (ring.length < 3) return { ring, repaired: false, ok: false };
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first !== undefined && last !== undefined && !sameXY(first, last)) {
    // Conservative repair: close the ring.
    return { ring: [...ring, first], repaired: true, ok: true };
  }
  if (ring.length < 4) return { ring, repaired: false, ok: false };
  return { ring, repaired: false, ok: true };
}

export function validateGeometry(geometry: Geometry): GeometryCheckResult {
  switch (geometry.type) {
    case 'Point':
      return {
        ok: positionsValid([geometry.coordinates]),
        geometry,
        repaired: false,
        ...(positionsValid([geometry.coordinates]) ? {} : { reason: 'invalid point coordinates' }),
      };
    case 'MultiPoint':
      return positionsValid(geometry.coordinates)
        ? { ok: true, geometry, repaired: false }
        : { ok: false, geometry, repaired: false, reason: 'invalid coordinates' };
    case 'LineString':
      if (!positionsValid(geometry.coordinates))
        return { ok: false, geometry, repaired: false, reason: 'invalid coordinates' };
      if (geometry.coordinates.length < 2)
        return { ok: false, geometry, repaired: false, reason: 'linestring needs 2+ positions' };
      return { ok: true, geometry, repaired: false };
    case 'MultiLineString':
      if (!geometry.coordinates.every((line) => positionsValid(line) && line.length >= 2))
        return { ok: false, geometry, repaired: false, reason: 'invalid line part' };
      return { ok: true, geometry, repaired: false };
    case 'Polygon': {
      if (!geometry.coordinates.every(positionsValid))
        return { ok: false, geometry, repaired: false, reason: 'invalid coordinates' };
      const results = geometry.coordinates.map(checkRing);
      if (results.some((r) => !r.ok))
        return { ok: false, geometry, repaired: false, reason: 'ring not closable' };
      const repaired = results.some((r) => r.repaired);
      return {
        ok: true,
        geometry: repaired ? { ...geometry, coordinates: results.map((r) => r.ring) } : geometry,
        repaired,
      };
    }
    case 'MultiPolygon': {
      if (!geometry.coordinates.every((poly) => poly.every(positionsValid)))
        return { ok: false, geometry, repaired: false, reason: 'invalid coordinates' };
      let repaired = false;
      const polys: Position[][][] = [];
      for (const poly of geometry.coordinates) {
        const results = poly.map(checkRing);
        if (results.some((r) => !r.ok))
          return { ok: false, geometry, repaired: false, reason: 'ring not closable' };
        if (results.some((r) => r.repaired)) repaired = true;
        polys.push(results.map((r) => r.ring));
      }
      return {
        ok: true,
        geometry: repaired ? { ...geometry, coordinates: polys } : geometry,
        repaired,
      };
    }
  }
}
