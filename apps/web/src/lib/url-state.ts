import type { AssetType, QualityStatus } from '@pimm/contracts';
import { ASSET_TYPES, QUALITY_STATUSES } from '@pimm/contracts';
import { VISIBLE_QUALITY_STATUSES } from './asset-meta.js';

/**
 * Shareable map state kept in sync with the URL query string (FR-07).
 * Center is [lon, lat] in EPSG:4326 to match the contract's coordinate order.
 */
export interface MapUrlState {
  center: [number, number];
  zoom: number;
  types: AssetType[];
  quality: QualityStatus[];
  q: string;
}

/** Roughly the geographic center of Japan; used when the URL has no location. */
export const DEFAULT_CENTER: [number, number] = [138.0, 37.5];
export const DEFAULT_ZOOM = 5;

export const DEFAULT_URL_STATE: MapUrlState = {
  center: [...DEFAULT_CENTER],
  zoom: DEFAULT_ZOOM,
  types: [...ASSET_TYPES],
  quality: [...VISIBLE_QUALITY_STATUSES],
  q: '',
};

const LON_DECIMALS = 5;
const LAT_DECIMALS = 5;
const ZOOM_DECIMALS = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function parseNumber(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const ASSET_TYPE_SET = new Set<string>(ASSET_TYPES);
const VISIBLE_QUALITY_SET = new Set<string>(VISIBLE_QUALITY_STATUSES);

function parseCsv<T extends string>(raw: string, allowed: Set<string>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const part of raw.split(',')) {
    const value = part.trim();
    if (value !== '' && allowed.has(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value as T);
    }
  }
  return out;
}

/**
 * Parses a URL query string (with or without a leading `?`) into map state.
 * Unknown or malformed values fall back to defaults; a present-but-empty
 * `types`/`quality` param is respected as an empty selection.
 */
export function parseUrlState(search: string): MapUrlState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const lon = round(
    clamp(parseNumber(params.get('lng'), DEFAULT_CENTER[0]), -180, 180),
    LON_DECIMALS,
  );
  const lat = round(
    clamp(parseNumber(params.get('lat'), DEFAULT_CENTER[1]), -90, 90),
    LAT_DECIMALS,
  );
  const zoom = round(clamp(parseNumber(params.get('z'), DEFAULT_ZOOM), 0, 22), ZOOM_DECIMALS);

  const types = params.has('types')
    ? parseCsv<AssetType>(params.get('types') ?? '', ASSET_TYPE_SET)
    : [...ASSET_TYPES];

  const quality = params.has('quality')
    ? parseCsv<QualityStatus>(params.get('quality') ?? '', VISIBLE_QUALITY_SET)
    : [...VISIBLE_QUALITY_STATUSES];

  const q = (params.get('q') ?? '').trim();

  return { center: [lon, lat], zoom, types, quality, q };
}

/**
 * Serializes map state into a stable query string (no leading `?`).
 * `parseUrlState(serializeUrlState(s))` round-trips for any valid state.
 */
export function serializeUrlState(state: MapUrlState): string {
  const params = new URLSearchParams();
  params.set('lng', String(round(state.center[0], LON_DECIMALS)));
  params.set('lat', String(round(state.center[1], LAT_DECIMALS)));
  params.set('z', String(round(state.zoom, ZOOM_DECIMALS)));
  // Always emit type/quality keys so an empty selection round-trips faithfully.
  params.set('types', state.types.join(','));
  params.set('quality', state.quality.join(','));
  if (state.q.trim() !== '') {
    params.set('q', state.q.trim());
  }
  return params.toString();
}
