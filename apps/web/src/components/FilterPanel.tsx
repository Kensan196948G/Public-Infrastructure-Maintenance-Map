import type { AssetType, QualityStatus } from '@pimm/contracts';
import { ASSET_TYPE_LIST, QUALITY_META, VISIBLE_QUALITY_STATUSES } from '../lib/asset-meta.js';

interface FilterPanelProps {
  selectedTypes: readonly AssetType[];
  selectedQuality: readonly QualityStatus[];
  /** Count of assets currently shown in the viewport (null while loading). */
  resultCount: number | null;
  onToggleType: (type: AssetType) => void;
  onToggleQuality: (status: QualityStatus) => void;
  onOpenSources: () => void;
}

/** Left panel: category filter, quality filter, legend and result count (UI-01). */
export function FilterPanel({
  selectedTypes,
  selectedQuality,
  resultCount,
  onToggleType,
  onToggleQuality,
  onOpenSources,
}: FilterPanelProps) {
  return (
    <aside className="filter-panel" aria-label="絞り込み">
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
          表示中: <strong>{resultCount === null ? '—' : resultCount.toLocaleString('ja-JP')}</strong>{' '}
          件
        </p>
      </section>

      <section className="filter-group">
        <button type="button" className="link-button" onClick={onOpenSources}>
          📚 データソース一覧
        </button>
      </section>
    </aside>
  );
}
