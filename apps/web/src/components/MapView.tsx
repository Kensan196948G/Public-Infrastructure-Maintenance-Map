import { useEffect, useRef } from 'react';
import { AttributionControl, Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import type { GeoJSONSource, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import type { AssetSummary, AssetType, BBox } from '@pimm/contracts';
import { ASSET_TYPE_LIST } from '../lib/asset-meta.js';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/url-state.js';
import 'maplibre-gl/dist/maplibre-gl.css';

/** GeoJSON shapes for the asset layer — real geometry, not just anchor points. */
interface AssetFeature {
  type: 'Feature';
  id: string;
  geometry: AssetSummary['geometry'];
  properties: { id: string; assetType: AssetType; name: string };
}
interface AssetFeatureCollection {
  type: 'FeatureCollection';
  features: AssetFeature[];
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
  /** Fired when the user clicks empty map space — clears the selection. */
  onClearSelection: () => void;
  /** When set, the map fits this [w, s, e, n] box (e.g. a prefecture's data extent). */
  focusBounds?: BBox | null;
  /** Increment to ease the map back to the country-wide default view. */
  resetNonce?: number;
}

const SOURCE_ID = 'assets';
const CLUSTER_LAYER_ID = 'asset-clusters';
const CLUSTER_COUNT_LAYER_ID = 'asset-cluster-count';
const LAYER_ID = 'asset-points';
const SELECTED_LAYER_ID = 'asset-points-selected';
const LINE_LAYER_ID = 'asset-lines';
const SELECTED_LINE_LAYER_ID = 'asset-lines-selected';
const FILL_LAYER_ID = 'asset-fills';
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

function toFeatureCollection(items: readonly AssetSummary[]): AssetFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: items.map((a) => ({
      type: 'Feature',
      id: a.id,
      geometry: a.geometry,
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
  onClearSelection,
  focusBounds = null,
  resetNonce = 0,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const itemsRef = useRef<readonly AssetSummary[]>(items);
  const selectedIdRef = useRef<string | null>(selectedId);
  const onViewportChangeRef = useRef(onViewportChange);
  const onSelectAssetRef = useRef(onSelectAsset);
  const onClearSelectionRef = useRef(onClearSelection);

  itemsRef.current = items;
  selectedIdRef.current = selectedId;
  onViewportChangeRef.current = onViewportChange;
  onSelectAssetRef.current = onSelectAsset;
  onClearSelectionRef.current = onClearSelection;

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
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      });
      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1d4ed8',
          'circle-radius': ['step', ['get', 'point_count'], 16, 50, 20, 200, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'fill-color': typeColorExpression() as never,
          'fill-opacity': 0.4,
          'fill-outline-color': typeColorExpression() as never,
        },
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': typeColorExpression() as never,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 12, 5],
        },
      });
      map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Point'],
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
        filter: [
          'all',
          ['==', ['get', 'id'], selectedIdRef.current ?? '__none__'],
          ['==', ['geometry-type'], 'Point'],
        ],
        paint: {
          'circle-radius': 10,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#111827',
        },
      });
      map.addLayer({
        id: SELECTED_LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        filter: [
          'all',
          ['==', ['get', 'id'], selectedIdRef.current ?? '__none__'],
          ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
        ],
        paint: {
          'line-color': '#111827',
          'line-width': 6,
          'line-opacity': 0.9,
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
      // Line / polygon assets are clickable exactly like point assets.
      map.on('click', LINE_LAYER_ID, onPointClick as never);
      map.on('click', FILL_LAYER_ID, onPointClick as never);
      // Clicking a cluster zooms to its extent instead of selecting an asset.
      map.on(
        'click',
        CLUSTER_LAYER_ID,
        (
          e: MapMouseEvent & { features?: Array<{ properties: Record<string, unknown> | null }> },
        ) => {
          void (async () => {
            const feature = e.features?.[0];
            const clusterId = feature?.properties?.['cluster_id'];
            const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
            if (typeof clusterId !== 'number' || !source) return;
            const zoom = await source.getClusterExpansionZoom(clusterId);
            map.easeTo({ center: e.lngLat, zoom: Math.min(zoom + 1, 16), duration: 500 });
          })();
        },
      );
      // Clicking empty map space returns to the list (deselect). The layer
      // click above still wins for marker hits because we re-query here.
      map.on('click', (e: MapMouseEvent) => {
        if (!map.getLayer(LAYER_ID)) return;
        const hits = map.queryRenderedFeatures(e.point, {
          layers: [LAYER_ID, LINE_LAYER_ID, FILL_LAYER_ID, CLUSTER_LAYER_ID],
        });
        if (hits.length === 0) onClearSelectionRef.current();
      });
      for (const layerId of [LAYER_ID, LINE_LAYER_ID, FILL_LAYER_ID, CLUSTER_LAYER_ID]) {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

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
    map.setFilter(SELECTED_LAYER_ID, [
      'all',
      ['==', ['get', 'id'], selectedId ?? '__none__'],
      ['==', ['geometry-type'], 'Point'],
    ]);
    if (map.getLayer(SELECTED_LINE_LAYER_ID)) {
      map.setFilter(SELECTED_LINE_LAYER_ID, [
        'all',
        ['==', ['get', 'id'], selectedId ?? '__none__'],
        ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
      ]);
    }
  }, [selectedId]);

  // Ease to a point when a list row is chosen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint) return;
    map.easeTo({ center: focusPoint, zoom: Math.max(map.getZoom(), 13), duration: 600 });
  }, [focusPoint]);

  // Fit the prefecture's data extent when prefecture navigation activates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusBounds) return;
    map.fitBounds(
      [
        [focusBounds[0], focusBounds[1]],
        [focusBounds[2], focusBounds[3]],
      ],
      { padding: 60, maxZoom: 13, duration: 700 },
    );
  }, [focusBounds]);

  // 「全国地図に戻る」: ease back to the default Japan-wide view.
  const resetSeenRef = useRef(resetNonce);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || resetNonce === resetSeenRef.current) return;
    resetSeenRef.current = resetNonce;
    map.easeTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, duration: 700 });
  }, [resetNonce]);

  return <div ref={containerRef} className="map-canvas" aria-label="地図" role="application" />;
}

/** Exported for reuse/testing of the color mapping without a live map. */
export const _mapInternals = { typeColorExpression, toFeatureCollection };
export type { AssetType };
