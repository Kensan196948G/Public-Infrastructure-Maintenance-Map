import type { RedistributionPolicy, SourceInfo } from '@pimm/contracts';
import { UNKNOWN_LABEL } from '../lib/asset-meta.js';
import { formatDate } from '../lib/format.js';
import { Modal } from './Modal.js';

interface SourcesDialogProps {
  sources: readonly SourceInfo[];
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}

const REDISTRIBUTION_LABEL: Record<RedistributionPolicy, string> = {
  allowed: '再配布可',
  restricted: '条件付き再配布可',
  prohibited: '再配布不可',
  unknown: '不明',
};

/** データソース一覧 (UI-03): provider, license, freshness and published count. */
export function SourcesDialog({ sources, isLoading, isError, onClose }: SourcesDialogProps) {
  return (
    <Modal title="データソース一覧" onClose={onClose}>
      {isError ? (
        <p className="detail-state" role="alert">
          データソース一覧の取得に失敗しました。
        </p>
      ) : isLoading ? (
        <p className="detail-state" role="status">
          読み込み中…
        </p>
      ) : sources.length === 0 ? (
        <p className="detail-state" role="status">
          公開中のデータソースはありません。
        </p>
      ) : (
        <div className="sources-table-wrap">
          <table className="sources-table">
            <thead>
              <tr>
                <th scope="col">提供元 / データセット</th>
                <th scope="col">ライセンス</th>
                <th scope="col">再配布</th>
                <th scope="col">更新スケジュール</th>
                <th scope="col">最終取得</th>
                <th scope="col">公開件数</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.slug}>
                  <td>
                    <div className="source-name">{s.name}</div>
                    <div className="source-provider">{s.providerName}</div>
                    <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                      提供元サイト ↗
                    </a>
                  </td>
                  <td>
                    {s.licenseUrl ? (
                      <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer">
                        {s.licenseName || UNKNOWN_LABEL}
                      </a>
                    ) : (
                      s.licenseName || UNKNOWN_LABEL
                    )}
                  </td>
                  <td>{REDISTRIBUTION_LABEL[s.redistribution]}</td>
                  <td className="mono">{s.refreshCron ?? '—'}</td>
                  <td>{formatDate(s.lastFetchedAt)}</td>
                  <td className="num">{s.publishedAssetCount.toLocaleString('ja-JP')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
