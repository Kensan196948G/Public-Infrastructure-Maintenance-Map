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
    };
    expect(parseUrlState(serializeUrlState(state))).toEqual(state);
  });

  it('omits the q param when the search is blank', () => {
    expect(serializeUrlState({ ...DEFAULT_URL_STATE, q: '   ' })).not.toContain('q=');
  });
});
