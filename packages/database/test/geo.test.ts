import { describe, expect, it } from 'vitest';
import { bboxIntersects, geometryBBox, representativePoint } from '../src/geo.js';
import { decodeCursor, encodeCursor } from '../src/cursor.js';

describe('geometryBBox', () => {
  it('computes bbox of a linestring', () => {
    expect(
      geometryBBox({
        type: 'LineString',
        coordinates: [
          [139.0, 35.0],
          [140.0, 36.0],
        ],
      }),
    ).toEqual([139.0, 35.0, 140.0, 36.0]);
  });
});

describe('bboxIntersects', () => {
  it('detects overlap and separation', () => {
    expect(bboxIntersects([0, 0, 2, 2], [1, 1, 3, 3])).toBe(true);
    expect(bboxIntersects([0, 0, 1, 1], [2, 2, 3, 3])).toBe(false);
    // Touching edges count as intersecting (closed intervals).
    expect(bboxIntersects([0, 0, 1, 1], [1, 1, 2, 2])).toBe(true);
  });
});

describe('representativePoint', () => {
  it('returns the point itself for Point', () => {
    expect(representativePoint({ type: 'Point', coordinates: [139.5, 35.5] })).toEqual([
      139.5, 35.5,
    ]);
  });
  it('returns the middle vertex for LineString', () => {
    expect(
      representativePoint({
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
      }),
    ).toEqual([1, 1]);
  });
  it('averages the outer ring for Polygon (closing vertex excluded)', () => {
    expect(
      representativePoint({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([1, 1]);
  });
});

describe('cursor', () => {
  it('round-trips a payload', () => {
    expect(decodeCursor(encodeCursor({ name: '都心橋', id: 'abc' }))).toEqual({
      name: '都心橋',
      id: 'abc',
    });
  });
  it('returns null for malformed input', () => {
    expect(decodeCursor('not-base64!')).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ offset: -1 })))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ name: 1, id: 'x' })))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ nope: 1 })))).toBeNull();
  });
});
