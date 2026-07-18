import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AssetSummary, AssetType, BBox, QualityStatus } from '@pimm/contracts';
import { useAssetDetail, useAssets, useHealth, useSources } from './api/hooks.js';
import { AuditLogDialog } from './components/AuditLogDialog.js';
import { DisclaimerBanner } from './components/DisclaimerBanner.js';
import { DetailPanel } from './components/DetailPanel.js';
import { FilterPanel } from './components/FilterPanel.js';
import { MapView } from './components/MapView.js';
import { NoticeDialog } from './components/NoticeDialog.js';
import { ResultList } from './components/ResultList.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { SourcesDialog } from './components/SourcesDialog.js';
import { parseUrlState, serializeUrlState } from './lib/url-state.js';

/** Toggles a value in an array (add if absent, remove if present). */
function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function App() {
  const initial = useMemo(() => parseUrlState(window.location.search), []);

  const [center, setCenter] = useState<[number, number]>(initial.center);
  const [zoom, setZoom] = useState<number>(initial.zoom);
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [types, setTypes] = useState<AssetType[]>(initial.types);
  const [quality, setQuality] = useState<QualityStatus[]>(initial.quality);
  const [q, setQ] = useState<string>(initial.q);
  const [searchInput, setSearchInput] = useState<string>(initial.q);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Keep the shareable URL in sync with filters and viewport (FR-07).
  useEffect(() => {
    const query = serializeUrlState({ center, zoom, types, quality, q });
    const next = `${window.location.pathname}?${query}`;
    window.history.replaceState(null, '', next);
  }, [center, zoom, types, quality, q]);

  const assetsQuery = useAssets({ bbox, types, quality, q });
  const detailQuery = useAssetDetail(selectedId);
  // Sources feed three views (catalogue, settings summary, audit status).
  const sourcesQuery = useSources(sourcesOpen || settingsOpen || auditOpen);
  const healthQuery = useHealth(settingsOpen);

  const items = assetsQuery.data?.items ?? [];

  const handleViewportChange = useCallback(
    (view: { bbox: BBox; center: [number, number]; zoom: number }) => {
      setBbox(view.bbox);
      setCenter(view.center);
      setZoom(view.zoom);
    },
    [],
  );

  const handleSelect = useCallback((asset: AssetSummary) => {
    setSelectedId(asset.id);
    setFocusPoint([asset.representativePoint[0], asset.representativePoint[1]]);
  }, []);

  // Avoid re-triggering easeTo for the same coordinates on unrelated renders.
  const lastFocusRef = useRef<[number, number] | null>(null);
  const stableFocus = useMemo(() => {
    if (
      focusPoint &&
      lastFocusRef.current &&
      focusPoint[0] === lastFocusRef.current[0] &&
      focusPoint[1] === lastFocusRef.current[1]
    ) {
      return lastFocusRef.current;
    }
    lastFocusRef.current = focusPoint;
    return focusPoint;
  }, [focusPoint]);

  const onSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setQ(searchInput.trim());
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <span aria-hidden="true">🗺️</span>
          <h1>公開インフラ維持管理マップ</h1>
        </div>
        <form className="search-form" role="search" onSubmit={onSearchSubmit}>
          <label htmlFor="keyword" className="visually-hidden">
            キーワード検索
          </label>
          <input
            id="keyword"
            type="search"
            className="search-input"
            placeholder="名称で検索"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="search-button">
            🔍 検索
          </button>
        </form>
        <button type="button" className="header-link" onClick={() => setNoticeOpen(true)}>
          ℹ️ 利用上の注意
        </button>
        <button type="button" className="header-link" onClick={() => setAuditOpen(true)}>
          📋 監査ログ
        </button>
        <button type="button" className="header-link" onClick={() => setSettingsOpen(true)}>
          ⚙️ システム設定
        </button>
      </header>

      <DisclaimerBanner onOpenNotice={() => setNoticeOpen(true)} />

      <div className="app-main">
        <FilterPanel
          selectedTypes={types}
          selectedQuality={quality}
          resultCount={assetsQuery.isFetching && items.length === 0 ? null : items.length}
          onToggleType={(t) => setTypes((prev) => toggle(prev, t))}
          onToggleQuality={(s) => setQuality((prev) => toggle(prev, s))}
          onOpenSources={() => setSourcesOpen(true)}
        />

        <main className="map-area">
          <MapView
            items={items}
            center={center}
            zoom={zoom}
            selectedId={selectedId}
            focusPoint={stableFocus}
            onViewportChange={handleViewportChange}
            onSelectAsset={handleSelect}
          />
        </main>

        <div className={`side-panel${selectedId ? ' has-detail' : ''}`}>
          {selectedId ? (
            <DetailPanel
              detail={detailQuery.data ?? null}
              isLoading={detailQuery.isLoading}
              isError={detailQuery.isError}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <ResultList
              items={items}
              selectedId={selectedId}
              isLoading={assetsQuery.isLoading}
              isError={assetsQuery.isError}
              onSelect={handleSelect}
            />
          )}
        </div>
      </div>

      {sourcesOpen ? (
        <SourcesDialog
          sources={sourcesQuery.data?.items ?? []}
          isLoading={sourcesQuery.isLoading}
          isError={sourcesQuery.isError}
          onClose={() => setSourcesOpen(false)}
        />
      ) : null}

      {noticeOpen ? <NoticeDialog onClose={() => setNoticeOpen(false)} /> : null}

      {auditOpen ? (
        <AuditLogDialog
          sources={sourcesQuery.data?.items ?? []}
          isLoading={sourcesQuery.isLoading}
          isError={sourcesQuery.isError}
          onClose={() => setAuditOpen(false)}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          health={healthQuery.data ?? null}
          sources={sourcesQuery.data?.items ?? []}
          isLoading={sourcesQuery.isLoading || healthQuery.isLoading}
          isError={healthQuery.isError}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
