import type { SourceInfo } from '@pimm/contracts';
import { formatDate } from '../lib/format.js';
import { Modal } from './Modal.js';

interface AuditLogDialogProps {
  sources: readonly SourceInfo[];
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}

/**
 * 監査ログ (取込監査, FR-13) — 現状はソース単位の取込状況を表示する。
 * ジョブ単位の実行履歴 (ingestion_runs) への接続は管理UIの後続実装で拡張する。
 */
export function AuditLogDialog({ sources, isLoading, isError, onClose }: AuditLogDialogProps) {
  return (
    <Modal title="監査ログ（取込状況）" onClose={onClose}>
      <p className="admin-note" role="note">
        🔒
        管理APIの認証ゲートは実装済みです。現状の画面は公開ソース概要の読み取り中心で、ジョブ単位の実行履歴・品質検査結果は後続UIで接続します。
      </p>
      {isError ? (
        <p className="detail-state" role="alert">
          取込状況の取得に失敗しました。
        </p>
      ) : isLoading ? (
        <p className="detail-state" role="status">
          読み込み中…
        </p>
      ) : sources.length === 0 ? (
        <p className="detail-state" role="status">
          取込済みのデータソースはありません。
        </p>
      ) : (
        <div className="sources-table-wrap">
          <table className="sources-table">
            <thead>
              <tr>
                <th scope="col">データソース</th>
                <th scope="col">状態</th>
                <th scope="col">最終取得</th>
                <th scope="col">原典更新日</th>
                <th scope="col">公開件数</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.slug}>
                  <td>
                    <div className="source-name">{s.name}</div>
                    <div className="source-provider">{s.providerName}</div>
                  </td>
                  <td>{s.enabled ? '🟢 有効' : '⚪ 無効'}</td>
                  <td>{formatDate(s.lastFetchedAt)}</td>
                  <td>{formatDate(s.sourceUpdatedAt)}</td>
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
