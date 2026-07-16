import { describe, expect, it } from 'vitest';
import { MAX_BBOX_AREA_DEG2 } from '@pimm/contracts';
import { bboxArea, isBboxQueryable } from '../src/lib/bbox.js';

describe('bboxArea', () => {
  it('computes width * height in degrees', () => {
    expect(bboxArea([139.0, 35.0, 140.0, 36.0])).toBe(1);
    expect(bboxArea([100.0, 10.0, 102.0, 12.5])).toBeCloseTo(5, 10);
  });
});

describe('isBboxQueryable', () => {
  it('rejects null (no viewport known yet)', () => {
    expect(isBboxQueryable(null)).toBe(false);
  });

  it('accepts a bbox at or under the server limit', () => {
    expect(isBboxQueryable([139.0, 35.0, 140.0, 36.0])).toBe(true);
    const side = Math.sqrt(MAX_BBOX_AREA_DEG2);
    expect(isBboxQueryable([0, 0, side, side])).toBe(true);
  });

  it('rejects a country-scale bbox like the default zoom-5 view (the H-2 regression)', () => {
    // Roughly Japan's full extent — this is what the map shows on first load.
    expect(isBboxQueryable([122, 24, 154, 46])).toBe(false);
  });
});
