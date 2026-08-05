import { describe, expect, it } from 'vitest';
import type { MapUrlState } from '../src/lib/url-state.js';
import { DEFAULT_URL_STATE, parseUrlState, serializeUrlState } from '../src/lib/url-state.js';

describe('parseUrlState', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseUrlState('')).toEqual(DEFAULT_URL_STATE);
  });

  it('accepts a leading question mark', () => {
    const state = parseUrlState('?lng=139.5&lat=35.5&z=10');
    expect(state.center).toEqual([139.5, 35.5]);
    expect(state.zoom).toBe(10);
  });

  it('clamps coordinates and zoom to valid ranges', () => {
    const state = parseUrlState('lng=999&lat=-999&z=99');
    expect(state.center[0]).toBe(180);
    expect(state.center[1]).toBe(-90);
    expect(state.zoom).toBe(22);
  });

  it('falls back to defaults on non-numeric values', () => {
    const state = parseUrlState('lng=abc&lat=&z=xyz');
    expect(state.center).toEqual(DEFAULT_URL_STATE.center);
    expect(state.zoom).toBe(DEFAULT_URL_STATE.zoom);
  });

  it('drops unknown type and quality tokens', () => {
    const state = parseUrlState('types=bridge,unknown,river&quality=verified,bogus');
    expect(state.types).toEqual(['bridge', 'river']);
    expect(state.quality).toEqual(['verified']);
  });

  it('drops hidden quality from URL filters because hidden assets are never public', () => {
    const state = parseUrlState('quality=verified,hidden,review');
    expect(state.quality).toEqual(['verified', 'review']);
  });

  it('treats a present-but-empty types param as an empty selection', () => {
    const state = parseUrlState('types=&quality=');
    expect(state.types).toEqual([]);
    expect(state.quality).toEqual([]);
  });

  it('defaults types/quality when the params are absent', () => {
    const state = parseUrlState('q=橋');
    expect(state.types).toEqual(DEFAULT_URL_STATE.types);
    expect(state.quality).toEqual(DEFAULT_URL_STATE.quality);
    expect(state.q).toBe('橋');
  });
});

describe('parseUrlState prefecture', () => {
  it('accepts a valid 2-digit prefecture code', () => {
    expect(parseUrlState('?pref=43').pref).toBe('43');
  });

  it('rejects malformed prefecture codes', () => {
    expect(parseUrlState('?pref=4a').pref).toBeNull();
    expect(parseUrlState('?pref=433').pref).toBeNull();
    expect(parseUrlState('').pref).toBeNull();
  });

  it('round-trips the prefecture code', () => {
    const state = { ...DEFAULT_URL_STATE, pref: '27' };
    expect(parseUrlState(serializeUrlState(state)).pref).toBe('27');
  });
});

describe('serializeUrlState / round trip', () => {
  it('round-trips the default state', () => {
    expect(parseUrlState(serializeUrlState(DEFAULT_URL_STATE))).toEqual(DEFAULT_URL_STATE);
  });

  it('round-trips a custom state with subsets', () => {
    const state: MapUrlState = {
      center: [136.12345, 34.56789],
      zoom: 11.25,
      types: ['bridge', 'port'],
      quality: ['review'],
      q: '大橋',
      pref: '27',
      municipalityCode: null,
      municipalityName: null,
    };
    expect(parseUrlState(serializeUrlState(state))).toEqual(state);
  });

  it('round-trips an empty type/quality selection', () => {
    const state: MapUrlState = {
      center: [139, 35],
      zoom: 8,
      types: [],
      quality: [],
      q: '',
      pref: null,
      municipalityCode: null,
      municipalityName: null,
    };
    expect(parseUrlState(serializeUrlState(state))).toEqual(state);
  });

  it('omits the q param when the search is blank', () => {
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, q: '   ' })).not.toContain('q=');
  });

  it('round-trips a municipality filter from address search', () => {
    const state: MapUrlState = {
      ...DEFAULT_URL_STATE,
      municipalityCode: '13101',
      municipalityName: '千代田区',
    };
    expect(parseUrlState(serializeUrlState(state))).toEqual(state);
  });

  it('rejects malformed municipality codes', () => {
    expect(parseUrlState('?muni=1310&muniN=千代田区').municipalityCode).toBeNull();
    expect(parseUrlState('?muni=131010').municipalityCode).toBeNull();
    expect(parseUrlState('?muni=13101').municipalityName).toBeNull();
  });
});
