import type { AssetSummary } from '@pimm/contracts';
import { ASSET_TYPE_META, UNKNOWN_LABEL } from '../lib/asset-meta.js';
import { QualityBadge } from './QualityBadge.js';

interface ResultListProps {
  items: readonly AssetSummary[];
  selectedId: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Called when the user picks a list row (keyboard or pointer). */
  onSelect: (asset: AssetSummary) => void;
}

/** Right/bottom panel: assets found within the current viewport (UI-01). */
export function ResultList({ items, selectedId, isLoading, isError, onSelect }: ResultListProps) {
  if (isError) {
    return (
      <div className="result-list-state" role="alert">
        一覧の取得に失敗しました。時間をおいて再度お試しください。
      </div>
    );
  }

  if (isLoading && items.length === 0) {
    return (
      <div className="result-list-state" role="status">
        読み込み中…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="result-list-state" role="status">
        表示範囲に該当するデータがありません。地図を移動するか条件を変更してください。
      </div>
    );
  }

  return (
    <ul className="result-list" aria-label="表示範囲内の一覧">
      {items.map((asset) => {
        const meta = ASSET_TYPE_META[asset.type];
        const authority = asset.managingAuthority ?? UNKNOWN_LABEL;
        const selected = asset.id === selectedId;
        return (
          <li key={asset.id}>
            <button
              type="button"
              className={`result-item${selected ? ' is-selected' : ''}`}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelect(asset)}
            >
              <span className="result-item-title">
                <span aria-hidden="true">{meta.icon}</span>
                <span className="result-item-name">{asset.name}</span>
              </span>
              <span className="result-item-meta">
                <span className="result-item-type">{meta.label}</span>
                <span className="result-item-authority">管理: {authority}</span>
              </span>
              <QualityBadge status={asset.quality.status} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
