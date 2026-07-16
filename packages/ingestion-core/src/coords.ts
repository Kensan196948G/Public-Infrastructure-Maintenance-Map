/**
 * Coordinate reference system handling (要件 §7.3-4).
 * Source CRS is declared per source (never guessed); conversion to WGS 84
 * uses proj4. Lat/lon swap detection is heuristic-based on the Japan bbox.
 */
import proj4 from 'proj4';
import type { BBox, Geometry, Position } from '@pimm/contracts';

// Geographic CRS definitions commonly seen in Japanese open data.
proj4.defs('EPSG:4612', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +no_defs'); // JGD2000
proj4.defs('EPSG:6668', '+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +no_defs'); // JGD2011
proj4.defs(
  'EPSG:4301',
  '+proj=longlat +ellps=bessel +towgs84=-146.414,507.337,680.507 +no_defs', // Tokyo Datum
);

export const SUPPORTED_CRS = ['EPSG:4326', 'EPSG:4612', 'EPSG:6668', 'EPSG:4301'] as const;
export type SupportedCrs = (typeof SUPPORTED_CRS)[number];

/** Generous Japan bounding box for domain validation (Q003). */
export const JAPAN_BBOX: BBox = [122.0, 20.0, 154.0, 46.0];

export function isWithinJapan(lon: number, lat: number): boolean {
  return (
    lon >= JAPAN_BBOX[0] && lon <= JAPAN_BBOX[2] && lat >= JAPAN_BBOX[1] && lat <= JAPAN_BBOX[3]
  );
}

/**
 * Detects the classic lat/lon column swap: [35.6, 139.7] instead of [139.7, 35.6].
 * Returns the corrected position and whether a swap was applied.
 */
export function fixLatLonSwap(position: Position): { position: Position; swapped: boolean } {
  const [a, b] = position;
  if (a === undefined || b === undefined) return { position, swapped: false };
  if (!isWithinJapan(a, b) && isWithinJapan(b, a)) {
    return { position: [b, a, ...position.slice(2)], swapped: true };
  }
  return { position, swapped: false };
}

export function positionToWgs84(position: Position, from: SupportedCrs): Position {
  if (from === 'EPSG:4326') return position;
  const [lon, lat] = position;
  if (lon === undefined || lat === undefined) return position;
  const [outLon, outLat] = proj4(from, 'EPSG:4326', [lon, lat]);
  return [outLon as number, outLat as number, ...position.slice(2)];
}

function mapPositions(geometry: Geometry, fn: (p: Position) => Position): Geometry {
  switch (geometry.type) {
    case 'Point':
      return { ...geometry, coordinates: fn(geometry.coordinates) };
    case 'MultiPoint':
    case 'LineString':
      return { ...geometry, coordinates: geometry.coordinates.map(fn) };
    case 'MultiLineString':
    case 'Polygon':
      return { ...geometry, coordinates: geometry.coordinates.map((ring) => ring.map(fn)) };
    case 'MultiPolygon':
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((poly) => poly.map((ring) => ring.map(fn))),
      };
  }
}

/** Reprojects a whole geometry into WGS 84. */
export function geometryToWgs84(geometry: Geometry, from: SupportedCrs): Geometry {
  if (from === 'EPSG:4326') return geometry;
  return mapPositions(geometry, (p) => positionToWgs84(p, from));
}

/** True when every position of the geometry lies inside the Japan bbox. */
export function geometryWithinJapan(geometry: Geometry): boolean {
  let ok = true;
  mapPositions(geometry, (p) => {
    const [lon, lat] = p;
    if (lon === undefined || lat === undefined || !isWithinJapan(lon, lat)) ok = false;
    return p;
  });
  return ok;
}
