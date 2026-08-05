import type { AssetType, QualityStatus } from '@pimm/contracts';
import { ASSET_TYPE_LIST, QUALITY_META, VISIBLE_QUALITY_STATUSES } from '../lib/asset-meta.js';
import { listPrefectureEntries, prefectureName } from '../lib/prefectures.js';
import { ExportButtons, type ExportButtonsProps } from './ExportButtons.js';

interface FilterPanelProps {
  selectedTypes: readonly AssetType[];
  selectedQuality: readonly QualityStatus[];
  /** Count of assets currently shown in the viewport (null while loading). */
  resultCount: number | null;
  onToggleType: (type: AssetType) => void;
  onToggleQuality: (status: QualityStatus) => void;
  onOpenSources: () => void;
  /** Country-wide counts per prefecture; null while the summary is loading. */
  byPrefecture?: Record<string, number> | null;
  selectedPrefecture?: string | null;
  /** Called with a code to focus a prefecture, or null to return to Japan. */
  onSelectPrefecture?: (code: string | null) => void;
  /** 住所検索で絞り込んだ市区町村名（null で非表示） */
  selectedMunicipality?: string | null;
  onClearMunicipality?: () => void;
  /** Current viewport/filters used to build the CSV / GeoJSON export URLs. */
  exportState?: ExportButtonsProps;
}

/** Left panel: prefecture menu, category filter, quality filter and result count (UI-01). */
export function FilterPanel({
  selectedTypes,
  selectedQuality,
  resultCount,
  onToggleType,
  onToggleQuality,
  onOpenSources,
  byPrefecture = null,
  selectedPrefecture = null,
  onSelectPrefecture,
  selectedMunicipality = null,
  onClearMunicipality,
  exportState,
}: FilterPanelProps) {
  return (
    <aside className="filter-panel" aria-label="絞り込み">
      {byPrefecture ? (
        <section className="filter-group" aria-labelledby="filter-pref-heading">
          <h2 id="filter-pref-heading" className="filter-heading">
            都道府県
          </h2>
          {selectedMunicipality ? (
            <button
              type="button"
              className="pref-reset-button"
              onClick={onClearMunicipality}
              aria-label={`市区町村 ${selectedMunicipality} の絞り込みを解除`}
            >
              🏘️ {selectedMunicipality} を解除
            </button>
          ) : null}
          {selectedPrefecture ? (
            <button
              type="button"
              className="pref-reset-button"
              onClick={() => onSelectPrefecture?.(null)}
            >
              🗾 全国地図に戻る
            </button>
          ) : null}
          <ul className="pref-list">
            {listPrefectureEntries(byPrefecture).map(([code, count]) => {
              const selected = code === selectedPrefecture;
              return (
                <li key={code}>
                  <button
                    type="button"
                    className={`pref-item${selected ? ' is-selected' : ''}${count === 0 ? ' is-empty' : ''}`}
                    aria-pressed={selected}
                    onClick={() => onSelectPrefecture?.(selected ? null : code)}
                  >
                    <span>{prefectureName(code)}</span>
                    <span className="pref-count">{count.toLocaleString('ja-JP')}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="filter-group" aria-labelledby="filter-type-heading">
        <h2 id="filter-type-heading" className="filter-heading">
          種別
        </h2>
        <ul className="filter-list">
          {ASSET_TYPE_LIST.map((meta) => {
            const checked = selectedTypes.includes(meta.type);
            return (
              <li key={meta.type}>
                <label className="filter-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleType(meta.type)}
                  />
                  <span
                    className="legend-swatch"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden="true"
                  />
                  <span aria-hidden="true">{meta.icon}</span>
                  <span>{meta.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="filter-group" aria-labelledby="filter-quality-heading">
        <h2 id="filter-quality-heading" className="filter-heading">
          品質
        </h2>
        <ul className="filter-list">
          {VISIBLE_QUALITY_STATUSES.map((status) => {
            const meta = QUALITY_META[status];
            const checked = selectedQuality.includes(status);
            return (
              <li key={status}>
                <label className="filter-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleQuality(status)}
                  />
                  <span aria-hidden="true">{meta.icon}</span>
                  <span>{meta.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="filter-group" aria-live="polite">
        <p className="result-count">
          表示中:{' '}
          <strong>{resultCount === null ? '—' : resultCount.toLocaleString('ja-JP')}</strong> 件
        </p>
      </section>

      <section className="filter-group">
        <button type="button" className="link-button" onClick={onOpenSources}>
          📚 データソース一覧
        </button>
      </section>

      {exportState ? <ExportButtons {...exportState} /> : null}
    </aside>
  );
}
