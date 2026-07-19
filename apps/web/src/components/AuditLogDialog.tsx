import { useState } from 'react';
import type { AdminIngestionDetail, AdminIngestionRun, SourceInfo } from '@pimm/contracts';
import { ApiClient, ApiError } from '../api/client.js';
import { formatDate } from '../lib/format.js';
import { Modal } from './Modal.js';

interface AuditLogDialogProps {
  sources: readonly SourceInfo[];
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
  client?: ApiClient;
}

const defaultClient = new ApiClient();

/**
 * 監査ログ (取込監査, FR-13) — ソース単位の取込状況に加え、
 * Cloudflare Access 配下の管理APIで取込実行を記録し詳細を確認する。
 */
export function AuditLogDialog({
  sources,
  isLoading,
  isError,
  onClose,
  client = defaultClient,
}: AuditLogDialogProps) {
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<AdminIngestionRun | null>(null);
  const [detail, setDetail] = useState<AdminIngestionDetail | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  const startIngestion = async (source: SourceInfo) => {
    setPendingSlug(source.slug);
    setAdminError(null);
    setDetail(null);
    try {
      const run = await client.startAdminIngestion(source.slug);
      setLatestRun(run);
      setDetail(await client.getAdminIngestion(run.id));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdminError(
          '管理APIへのアクセス権がありません。Cloudflare Access の認証状態を確認してください。',
        );
      } else {
        setAdminError('管理APIで取込実行を記録できませんでした。');
      }
    } finally {
      setPendingSlug(null);
    }
  };

  return (
    <Modal title="監査ログ（取込状況）" onClose={onClose}>
      <p className="admin-note" role="note">
        🔒 管理APIは Cloudflare Access とサーバー側 allowlist
        で保護されます。取込記録の作成は管理者がボタン操作した場合だけ実行します。
      </p>
      {adminError ? (
        <p className="admin-error" role="alert">
          {adminError}
        </p>
      ) : null}
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
                <th scope="col">操作</th>
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
                  <td>
                    <button
                      type="button"
                      className="admin-action-button"
                      disabled={pendingSlug !== null}
                      onClick={() => void startIngestion(s)}
                    >
                      {pendingSlug === s.slug ? '記録中…' : '取込記録'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {latestRun ? (
        <section className="admin-run-detail" aria-labelledby="admin-run-heading">
          <h3 id="admin-run-heading" className="settings-heading">
            最新の取込記録
          </h3>
          <dl className="settings-list">
            <dt>Run ID</dt>
            <dd className="mono">{latestRun.id}</dd>
            <dt>データソース</dt>
            <dd>{latestRun.sourceSlug}</dd>
            <dt>状態</dt>
            <dd>{latestRun.status}</dd>
            <dt>取得件数</dt>
            <dd>{latestRun.fetchedCount.toLocaleString('ja-JP')}</dd>
            <dt>公開候補</dt>
            <dd>{latestRun.acceptedCount.toLocaleString('ja-JP')}</dd>
            <dt>品質issue</dt>
            <dd>
              {detail ? `${detail.qualityIssues.length.toLocaleString('ja-JP')} 件` : '読み込み中…'}
            </dd>
          </dl>
        </section>
      ) : null}
    </Modal>
  );
}
