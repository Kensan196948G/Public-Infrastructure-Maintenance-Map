import { useEffect, useRef } from 'react';
import { AttributionControl, Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import type { GeoJSONSource, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import type { AssetSummary, AssetType, BBox } from '@pimm/contracts';
import { ASSET_TYPE_LIST } from '../lib/asset-meta.js';
import 'maplibre-gl/dist/maplibre-gl.css';

/** Minimal GeoJSON shapes for the point layer (avoids a @types/geojson import). */
interface PointFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { id: string; assetType: AssetType; name: string };
}
interface PointFeatureCollection {
  type: 'FeatureCollection';
  features: PointFeature[];
}

interface MapViewProps {
  items: readonly AssetSummary[];
  center: [number, number];
  zoom: number;
  selectedId: string | null;
  /** When set, the map eases to this [lon, lat] (e.g. list-row click). */
  focusPoint: [number, number] | null;
  /** Fired after the user stops moving the map; carries the new viewport. */
  onViewportChange: (view: { bbox: BBox; center: [number, number]; zoom: number }) => void;
  onSelectAsset: (asset: AssetSummary) => void;
}

const SOURCE_ID = 'assets';
const LAYER_ID = 'asset-points';
const SELECTED_LAYER_ID = 'asset-points-selected';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/** Raster basemap using public OSM tiles. Attribution is legally required. */
const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** Builds a MapLibre `match` expression: asset type → marker color. */
function typeColorExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'assetType']];
  for (const meta of ASSET_TYPE_LIST) {
    expr.push(meta.type, meta.color);
  }
  expr.push('#374151'); // fallback
  return expr;
}

function toFeatureCollection(items: readonly AssetSummary[]): PointFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map((a) => ({
      type: 'Feature',
      id: a.id,
      geometry: {
        type: 'Point',
        coordinates: [a.representativePoint[0], a.representativePoint[1]],
      },
      properties: { id: a.id, assetType: a.type, name: a.name },
    })),
  };
}

/**
 * MapLibre canvas (UI-01). Assets are drawn as a circle layer keyed by type;
 * clicking a point selects it, and map movement triggers a bbox refetch.
 * Not unit-tested: maplibre-gl requires a real WebGL/canvas context.
 */
export function MapView({
  items,
  center,
  zoom,
  selectedId,
  focusPoint,
  onViewportChange,
  onSelectAsset,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const itemsRef = useRef<readonly AssetSummary[]>(items);
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectAssetRef = useRef(onSelectAsset);

  itemsRef.current = items;
  onViewportChangeRef.current = onViewportChange;
  onSelectAssetRef.current = onSelectAsset;

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      center,
      zoom,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ visualizePitch: false }), 'top-left');
    map.addControl(new AttributionControl({ compact: false }), 'bottom-right');

    const emitViewport = () => {
      const b = map.getBounds();
      const bbox: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const c = map.getCenter();
      onViewportChangeRef.current({ bbox, center: [c.lng, c.lat], zoom: map.getZoom() });
    };

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection(itemsRef.current),
      });
      map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 12, 7],
          'circle-color': typeColorExpression() as never,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: SELECTED_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['get', 'id'], selectedId ?? '__none__'],
        paint: {
          'circle-radius': 10,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#111827',
        },
      });

      const onPointClick = (
        e: MapMouseEvent & { features?: Array<{ properties: Record<string, unknown> | null }> },
      ) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.['id'];
        if (typeof id !== 'string') return;
        const asset = itemsRef.current.find((a) => a.id === id);
        if (asset) onSelectAssetRef.current(asset);
      };
      map.on('click', LAYER_ID, onPointClick as never);
      map.on('mouseenter', LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });

      emitViewport();
    });

    map.on('moveend', emitViewport);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Intentionally run once; live values are read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new data into the existing source when items change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(items));
  }, [items]);

  // Update the highlight filter when the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(SELECTED_LAYER_ID)) return;
    map.setFilter(SELECTED_LAYER_ID, ['==', ['get', 'id'], selectedId ?? '__none__']);
  }, [selectedId]);

  // Ease to a point when a list row is chosen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint) return;
    map.easeTo({ center: focusPoint, zoom: Math.max(map.getZoom(), 13), duration: 600 });
  }, [focusPoint]);

  return <div ref={containerRef} className="map-canvas" aria-label="地図" role="application" />;
}

/** Exported for reuse/testing of the color mapping without a live map. */
export const _mapInternals = { typeColorExpression, toFeatureCollection };
export type { AssetType };
