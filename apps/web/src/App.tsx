import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { AssetSummary, AssetType, BBox, QualityStatus } from '@pimm/contracts';
import { ApiClient } from './api/client.js';
import {
  useAssetDetail,
  useAdminAccess,
  useHealth,
  usePagedAssets,
  useSources,
  useSuggest,
  useSummary,
} from './api/hooks.js';
import { prefectureName } from './lib/prefectures.js';
import { AuditLogDialog } from './components/AuditLogDialog.js';
import { DataRefreshButton } from './components/DataRefreshButton.js';
import { DisclaimerBanner } from './components/DisclaimerBanner.js';
import { DetailPanel } from './components/DetailPanel.js';
import { FeedbackDialog } from './components/FeedbackDialog.js';
import { FilterPanel } from './components/FilterPanel.js';
import { MapView } from './components/MapView.js';
import { NoticeDialog } from './components/NoticeDialog.js';
import { ResultList } from './components/ResultList.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { ShareButton } from './components/ShareButton.js';
import { SourcesDialog } from './components/SourcesDialog.js';
import { parseUrlState, serializeUrlState } from './lib/url-state.js';

/** Shared client for header-level calls (geocode). */
const defaultApiClient = new ApiClient();

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
  const [addressInput, setAddressInput] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  const [prefecture, setPrefecture] = useState<string | null>(initial.pref);
  const [municipalityCode, setMunicipalityCode] = useState<string | null>(initial.municipalityCode);
  const [municipalityName, setMunicipalityName] = useState<string | null>(initial.municipalityName);
  const [resetNonce, setResetNonce] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Keep the shareable URL in sync with filters and viewport (FR-07).
  useEffect(() => {
    const query = serializeUrlState({
      center,
      zoom,
      types,
      quality,
      q,
      pref: prefecture,
      municipalityCode,
      municipalityName,
    });
    const next = `${window.location.pathname}?${query}`;
    window.history.replaceState(null, '', next);
  }, [center, zoom, types, quality, q, prefecture, municipalityCode, municipalityName]);

  const pagedAssets = usePagedAssets({
    bbox,
    types,
    quality,
    q,
    prefectureCode: prefecture,
    municipalityCode,
  });
  const summaryQuery = useSummary();
  const suggestQuery = useSuggest(searchInput);
  const detailQuery = useAssetDetail(selectedId);
  // Sources feed three views (catalogue, settings summary, audit status).
  const sourcesQuery = useSources(sourcesOpen || settingsOpen || auditOpen);
  const healthQuery = useHealth(settingsOpen);
  const adminAccess = useAdminAccess();

  const items = pagedAssets.items;

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

  const clearSelection = useCallback(() => setSelectedId(null), []);

  /** Focus a prefecture (code) or return to the country-wide view (null). */
  const handleSelectPrefecture = useCallback((code: string | null) => {
    setPrefecture(code);
    setMunicipalityCode(null);
    setMunicipalityName(null);
    setSelectedId(null);
    setFocusPoint(null);
    if (code === null) setResetNonce((v) => v + 1);
  }, []);

  // Fit the map to the prefecture's data extent once its list arrives.
  const focusBounds = useMemo<BBox | null>(() => {
    if (!prefecture || items.length === 0) return null;
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (const asset of items) {
      const [lon, lat] = asset.representativePoint;
      w = Math.min(w, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
    // Pad degenerate (single-point) extents so fitBounds has an area to frame.
    if (e - w < 0.01) {
      w -= 0.02;
      e += 0.02;
    }
    if (n - s < 0.01) {
      s -= 0.02;
      n += 0.02;
    }
    return [w, s, e, n];
  }, [prefecture, items]);

  const prefectureTotal = prefecture
    ? (summaryQuery.data?.byPrefecture?.[prefecture] ?? null)
    : null;

  // Escape closes the detail and returns to the list — but never while a
  // dialog is open, so the key keeps meaning "close the topmost layer".
  const dialogOpen = sourcesOpen || noticeOpen || settingsOpen || auditOpen || feedbackOpen;
  useEffect(() => {
    if (!selectedId || dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, dialogOpen, clearSelection]);

  const onSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setQ(searchInput.trim());
  };

  /** 住所検索: GSI ジオコーダ経由で座標を取得し地図中心を移動する。 */
  const onAddressSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = addressInput.trim();
    if (query === '') return;
    setIsGeocoding(true);
    setAddressError(null);
    try {
      const result = await defaultApiClient.geocode(query);
      const first = result.items[0];
      if (!first) {
        setAddressError('住所が見つかりませんでした。表記を変えてお試しください。');
        return;
      }
      setCenter([first.lon, first.lat]);
      setZoom(14);
      setMunicipalityCode(first.municipalityCode);
      setMunicipalityName(first.municipalityName);
      setSelectedId(null);
      setFocusPoint(null);
    } catch {
      setAddressError('住所検索に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#map-content">
        地図へ移動
      </a>
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
            list="asset-suggestions"
          />
          <button type="submit" className="search-button">
            🔍 検索
          </button>
          <datalist id="asset-suggestions">
            {(suggestQuery.data?.items ?? []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}（{item.count.toLocaleString('ja-JP')}件）
              </option>
            ))}
          </datalist>
        </form>
        <form className="search-form" role="search" onSubmit={(e) => void onAddressSubmit(e)}>
          <label htmlFor="address" className="visually-hidden">
            住所で検索
          </label>
          <input
            id="address"
            type="search"
            className="search-input"
            placeholder="住所で検索（例: 大阪市北区）"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
          />
          <button type="submit" className="search-button" disabled={isGeocoding}>
            {isGeocoding ? '⏳ 検索中…' : '📍 住所検索'}
          </button>
        </form>
        {addressError ? (
          <p className="address-error" role="alert">
            {addressError}
          </p>
        ) : null}
        <DataRefreshButton />
        <ShareButton />
        <button type="button" className="header-link" onClick={() => setNoticeOpen(true)}>
          ℹ️ 利用上の注意
        </button>
        <button type="button" className="header-link" onClick={() => setFeedbackOpen(true)}>
          📣 誤りを報告
        </button>
        {adminAccess.status === 'granted' ? (
          <>
            <button type="button" className="header-link" onClick={() => setAuditOpen(true)}>
              📋 監査ログ
            </button>
            <button type="button" className="header-link" onClick={() => setSettingsOpen(true)}>
              ⚙️ システム設定
            </button>
          </>
        ) : adminAccess.status === 'denied' ? (
          <span className="admin-access-note" role="note">
            🔒 管理機能は認証後に表示されます
          </span>
        ) : null}
      </header>

      <DisclaimerBanner onOpenNotice={() => setNoticeOpen(true)} />

      <div className="app-main">
        <FilterPanel
          selectedTypes={types}
          selectedQuality={quality}
          resultCount={pagedAssets.isLoading && items.length === 0 ? null : items.length}
          onToggleType={(t) => setTypes((prev) => toggle(prev, t))}
          onToggleQuality={(s) => setQuality((prev) => toggle(prev, s))}
          onOpenSources={() => setSourcesOpen(true)}
          exportState={{
            bbox,
            types,
            quality,
            q,
            prefectureCode: prefecture,
            municipalityCode,
          }}
          byPrefecture={summaryQuery.data?.byPrefecture ?? null}
          selectedPrefecture={prefecture}
          onSelectPrefecture={handleSelectPrefecture}
          selectedMunicipality={municipalityName}
          onClearMunicipality={() => {
            setMunicipalityCode(null);
            setMunicipalityName(null);
          }}
        />

        <main id="map-content" className="map-area">
          <MapView
            items={items}
            center={center}
            zoom={zoom}
            selectedId={selectedId}
            focusPoint={focusPoint}
            onViewportChange={handleViewportChange}
            onSelectAsset={handleSelect}
            onClearSelection={clearSelection}
            focusBounds={focusBounds}
            resetNonce={resetNonce}
          />
        </main>

        <div className={`side-panel${selectedId ? ' has-detail' : ''}`}>
          {selectedId ? (
            <DetailPanel
              detail={detailQuery.data ?? null}
              isLoading={detailQuery.isLoading}
              isError={detailQuery.isError}
              onClose={clearSelection}
            />
          ) : (
            <>
              {prefecture ? (
                <div className="pref-result-header">
                  <button
                    type="button"
                    className="detail-back-button"
                    onClick={() => handleSelectPrefecture(null)}
                  >
                    🗾 全国地図に戻る
                  </button>
                  <p className="pref-result-title">
                    {prefectureName(prefecture)}の一覧
                    {prefectureTotal !== null
                      ? `（全${prefectureTotal.toLocaleString('ja-JP')}件${
                          prefectureTotal > items.length
                            ? `・上位${items.length.toLocaleString('ja-JP')}件を表示`
                            : ''
                        }）`
                      : ''}
                  </p>
                </div>
              ) : null}
              <ResultList
                items={items}
                selectedId={selectedId}
                isLoading={pagedAssets.isLoading}
                isError={pagedAssets.isError}
                onSelect={handleSelect}
                groupByPrefecture={prefecture === null}
                hasMore={pagedAssets.hasMore}
                isLoadingMore={pagedAssets.isLoadingMore}
                loadMoreError={pagedAssets.loadMoreError}
                onLoadMore={() => void pagedAssets.loadMore()}
                emptyMessage={
                  prefecture
                    ? `${prefectureName(prefecture)}の公開データはまだ収録されていません（または絞り込み条件に該当がありません）。「🗾 全国地図に戻る」で全国表示へ戻れます。`
                    : undefined
                }
              />
            </>
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

      {feedbackOpen ? <FeedbackDialog onClose={() => setFeedbackOpen(false)} /> : null}

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
          onSourcesChanged={() => void sourcesQuery.refetch()}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
