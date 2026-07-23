import { Fragment } from 'react';
import type { AssetSummary } from '@pimm/contracts';
import { ASSET_TYPE_META, UNKNOWN_LABEL } from '../lib/asset-meta.js';
import { assetDisplayName, isNameless } from '../lib/display-name.js';
import { prefectureName } from '../lib/prefectures.js';
import { QualityBadge } from './QualityBadge.js';

interface ResultListProps {
  items: readonly AssetSummary[];
  selectedId: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Called when the user picks a list row (keyboard or pointer). */
  onSelect: (asset: AssetSummary) => void;
  /** Insert prefecture section headers (country-wide viewport mode). */
  groupByPrefecture?: boolean;
  /** Overrides the default empty-state text (e.g. prefecture-scoped mode). */
  emptyMessage?: string | undefined;
}

/** Groups items by prefecture code (JIS order, unknown last), keeping row order inside a group. */
function groupItems(
  items: readonly AssetSummary[],
): Array<{ code: string | null; items: AssetSummary[] }> {
  const byCode = new Map<string | null, AssetSummary[]>();
  for (const asset of items) {
    const list = byCode.get(asset.prefectureCode) ?? [];
    list.push(asset);
    byCode.set(asset.prefectureCode, list);
  }
  return [...byCode.keys()]
    .sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    })
    .map((code) => ({ code, items: byCode.get(code) ?? [] }));
}

/** Right/bottom panel: assets found within the current viewport (UI-01). */
export function ResultList({
  items,
  selectedId,
  isLoading,
  isError,
  onSelect,
  groupByPrefecture = false,
  emptyMessage,
}: ResultListProps) {
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
        {emptyMessage ??
          '表示範囲に該当するデータがありません。地図を移動するか条件を変更してください。'}
      </div>
    );
  }

  const groups = groupByPrefecture
    ? groupItems(items)
    : [{ code: null, items: [...items] as AssetSummary[] }];

  return (
    <ul className="result-list" aria-label="表示範囲内の一覧">
      {groups.map((group) => (
        <Fragment key={group.code ?? '__all__'}>
          {groupByPrefecture ? (
            <li className="result-group-header" role="presentation">
              🗾 {prefectureName(group.code)}（{group.items.length}件）
            </li>
          ) : null}
          {group.items.map((asset) => {
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
                    <span
                      className={`result-item-name${isNameless(asset.name) ? ' is-nameless' : ''}`}
                    >
                      {assetDisplayName(asset.name, asset.type, asset.representativePoint)}
                    </span>
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
        </Fragment>
      ))}
    </ul>
  );
}
