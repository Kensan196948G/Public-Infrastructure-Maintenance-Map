import { describe, expect, it } from 'vitest';
import { assetDisplayName, isNameless, NAMELESS_DB_VALUE } from '../src/lib/display-name.js';

describe('isNameless', () => {
  it('treats the publisher fallback literal as nameless', () => {
    expect(isNameless(NAMELESS_DB_VALUE)).toBe(true);
  });

  it('treats null / undefined / blank as nameless', () => {
    expect(isNameless(null)).toBe(true);
    expect(isNameless(undefined)).toBe(true);
    expect(isNameless('   ')).toBe(true);
  });

  it('keeps real names', () => {
    expect(isNameless('(仮称)みらい橋')).toBe(false);
  });
});

describe('assetDisplayName', () => {
  it('passes real names through untouched', () => {
    expect(assetDisplayName('うめきた公園', 'public_facility', [135.49, 34.7])).toBe(
      'うめきた公園',
    );
  });

  it('synthesizes a type label with a position hint for nameless assets', () => {
    // representativePoint is [lon, lat]; the hint shows lat, lon.
    expect(assetDisplayName(NAMELESS_DB_VALUE, 'road', [122.9412, 24.4511])).toBe(
      '名称未収録の道路（24.451, 122.941 付近）',
    );
  });

  it('omits the position hint when no representative point is given', () => {
    expect(assetDisplayName(NAMELESS_DB_VALUE, 'bridge')).toBe('名称未収録の橋梁');
    expect(assetDisplayName(null, 'river', null)).toBe('名称未収録の河川');
  });
});
