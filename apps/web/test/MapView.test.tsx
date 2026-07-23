import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MapView } from '../src/components/MapView.js';
import { bridgeSummary, riverSummary } from './fixtures.js';

type Handler = () => void;

const maplibreMock = vi.hoisted(() => ({
  addLayer: vi.fn(),
  loadHandler: null as Handler | null,
}));

vi.mock('maplibre-gl', () => {
  class FakeMap {
    addControl = vi.fn();
    addSource = vi.fn();
    addLayer = maplibreMock.addLayer;
    getBounds = vi.fn(() => ({
      getWest: () => 139,
      getSouth: () => 35,
      getEast: () => 140,
      getNorth: () => 36,
    }));
    getCenter = vi.fn(() => ({ lng: 139.5, lat: 35.5 }));
    getZoom = vi.fn(() => 10);
    getCanvas = vi.fn(() => ({ style: { cursor: '' } }));
    on = vi.fn((event: string, ...args: unknown[]) => {
      const handler = args[args.length - 1];
      if (event === 'load' && typeof handler === 'function') {
        maplibreMock.loadHandler = handler as Handler;
      }
    });
    remove = vi.fn();
    isStyleLoaded = vi.fn(() => false);
    getLayer = vi.fn(() => undefined);
    getSource = vi.fn(() => undefined);
    setFilter = vi.fn();
    easeTo = vi.fn();
  }

  return {
    Map: FakeMap,
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
  };
});

describe('MapView', () => {
  it('uses the latest selected id when the map load event arrives late', () => {
    maplibreMock.loadHandler = null;
    maplibreMock.addLayer.mockClear();

    const props = {
      items: [bridgeSummary, riverSummary],
      center: [139, 35] as [number, number],
      zoom: 10,
      focusPoint: null,
      onViewportChange: vi.fn(),
      onSelectAsset: vi.fn(),
      onClearSelection: vi.fn(),
    };

    const { rerender } = render(<MapView {...props} selectedId={bridgeSummary.id} />);
    rerender(<MapView {...props} selectedId={riverSummary.id} />);

    const handler = maplibreMock.loadHandler as Handler | null;
    expect(handler).not.toBeNull();
    handler?.();

    expect(maplibreMock.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'asset-points-selected',
        filter: ['==', ['get', 'id'], riverSummary.id],
      }),
    );
  });
});
