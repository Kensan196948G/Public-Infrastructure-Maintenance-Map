import type { BBox, Geometry, Position } from '@pimm/contracts';

function eachPosition(geometry: Geometry, visit: (p: Position) => void): void {
  switch (geometry.type) {
    case 'Point':
      visit(geometry.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      geometry.coordinates.forEach(visit);
      break;
    case 'MultiLineString':
    case 'Polygon':
      geometry.coordinates.forEach((ring) => ring.forEach(visit));
      break;
    case 'MultiPolygon':
      geometry.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(visit)));
      break;
  }
}

/** Axis-aligned bounding box of a GeoJSON geometry. */
export function geometryBBox(geometry: Geometry): BBox {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  eachPosition(geometry, (p) => {
    const lon = p[0];
    const lat = p[1];
    if (lon === undefined || lat === undefined) return;
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  });
  return [minLon, minLat, maxLon, maxLat];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/**
 * Deterministic representative point for listing / clustering.
 * Not a true centroid — a stable, cheap approximation that always
 * lies near the geometry (middle vertex for lines, vertex average for polygons).
 */
export function representativePoint(geometry: Geometry): [number, number] {
  const fallback: [number, number] = [0, 0];
  switch (geometry.type) {
    case 'Point': {
      const [lon = 0, lat = 0] = geometry.coordinates;
      return [lon, lat];
    }
    case 'MultiPoint': {
      const first = geometry.coordinates[0];
      return first ? [first[0] ?? 0, first[1] ?? 0] : fallback;
    }
    case 'LineString': {
      const mid = geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
      return mid ? [mid[0] ?? 0, mid[1] ?? 0] : fallback;
    }
    case 'MultiLineString': {
      const line = geometry.coordinates[0];
      if (!line) return fallback;
      const mid = line[Math.floor(line.length / 2)];
      return mid ? [mid[0] ?? 0, mid[1] ?? 0] : fallback;
    }
    case 'Polygon':
    case 'MultiPolygon': {
      const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
      if (!ring || ring.length === 0) return fallback;
      // Skip closing vertex (same as the first) so it is not double-weighted.
      const vertices = ring.slice(0, ring.length - 1);
      const pts = vertices.length > 0 ? vertices : ring;
      let sumLon = 0;
      let sumLat = 0;
      for (const p of pts) {
        sumLon += p[0] ?? 0;
        sumLat += p[1] ?? 0;
      }
      return [sumLon / pts.length, sumLat / pts.length];
    }
  }
}
