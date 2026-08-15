import { useState } from 'react';
import type {
  AdminFeedbackList,
  AdminIngestionDetail,
  AdminIngestionRun,
  AdminQualityIssueRecord,
  AuditEvent,
  SourceInfo,
} from '@pimm/contracts';
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
type ResolutionChoice = 'accepted' | 'fixed' | 'dismissed';

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
  const [runs, setRuns] = useState<AdminIngestionRun[]>([]);
  const [openIssues, setOpenIssues] = useState<AdminQualityIssueRecord[]>([]);
  const [detail, setDetail] = useState<AdminIngestionDetail | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isLoadingAdminLists, setIsLoadingAdminLists] = useState(false);
  const [resolutionInputs, setResolutionInputs] = useState<Record<string, string>>({});
  const [resolutionChoices, setResolutionChoices] = useState<Record<string, ResolutionChoice>>({});
  const [pendingIssueId, setPendingIssueId] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditValid, setAuditValid] = useState<boolean | null>(null);
  const [feedbackReports, setFeedbackReports] = useState<AdminFeedbackList['items']>([]);
  const [feedbackResolutionInputs, setFeedbackResolutionInputs] = useState<Record<string, string>>(
    {},
  );
  const [pendingFeedbackId, setPendingFeedbackId] = useState<string | null>(null);

  const startIngestion = async (source: SourceInfo) => {
    setPendingSlug(source.slug);
    setAdminError(null);
    setDetail(null);
    try {
      const run = await client.startAdminIngestion(source.slug);
      setLatestRun(run);
      setRuns((prev) => [run, ...prev.filter((item) => item.id !== run.id)].slice(0, 20));
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

  const loadAdminLists = async () => {
    setIsLoadingAdminLists(true);
    setAdminError(null);
    try {
      const [runList, issueList, auditList, feedbackList] = await Promise.all([
        client.listAdminIngestions(20),
        client.listAdminQualityIssues(50),
        client.listAdminAuditEvents(30),
        client.listAdminFeedbackReports(30),
      ]);
      setRuns(runList.items);
      setOpenIssues(issueList.items);
      setAuditEvents(auditList.items);
      setAuditValid(auditList.valid);
      setFeedbackReports(feedbackList.items);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdminError(
          '管理一覧の閲覧には Cloudflare Access の管理者またはレビュー担当者権限が必要です。',
        );
      } else {
        setAdminError('管理一覧を取得できませんでした。');
      }
    } finally {
      setIsLoadingAdminLists(false);
    }
  };

  const loadRunDetail = async (run: AdminIngestionRun) => {
    setLatestRun(run);
    setAdminError(null);
    try {
      setDetail(await client.getAdminIngestion(run.id));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdminError('取込詳細の閲覧権限がありません。');
      } else {
        setAdminError('取込詳細を取得できませんでした。');
      }
    }
  };

  const setIssueReason = (issueId: string, reason: string) => {
    setResolutionInputs((prev) => ({ ...prev, [issueId]: reason }));
  };

  const resolveFeedback = async (
    report: AdminFeedbackList['items'][number],
    status: 'converted' | 'dismissed',
  ) => {
    const reason = (feedbackResolutionInputs[report.id] ?? '').trim();
    if (reason === '') return;
    setPendingFeedbackId(report.id);
    setAdminError(null);
    try {
      const resolved = await client.resolveAdminFeedback(report.id, { status, reason });
      setFeedbackReports((prev) => prev.map((item) => (item.id === resolved.id ? resolved : item)));
      setFeedbackResolutionInputs((prev) => ({ ...prev, [report.id]: '' }));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdminError('フィードバックの解決には管理APIへのアクセス権が必要です。');
      } else {
        setAdminError('フィードバックの解決を記録できませんでした。');
      }
    } finally {
      setPendingFeedbackId(null);
    }
  };

  const setIssueResolution = (issueId: string, resolutionStatus: ResolutionChoice) => {
    setResolutionChoices((prev) => ({ ...prev, [issueId]: resolutionStatus }));
  };

  const resolveIssue = async (issue: AdminQualityIssueRecord) => {
    const reason = (resolutionInputs[issue.id] ?? '').trim();
    if (reason === '') return;
    setPendingIssueId(issue.id);
    setAdminError(null);
    try {
      const resolved = await client.resolveAdminQualityIssue(issue.id, {
        resolutionStatus: resolutionChoices[issue.id] ?? 'accepted',
        reason,
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              qualityIssues: prev.qualityIssues.map((item) =>
                item.id === resolved.id ? resolved : item,
              ),
            }
          : prev,
      );
      setIssueReason(issue.id, '');
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdminError(
          '品質issueの解決には管理APIへのアクセス権が必要です。Cloudflare Access の認証状態を確認してください。',
        );
      } else {
        setAdminError('品質issueの解決を記録できませんでした。');
      }
    } finally {
      setPendingIssueId(null);
    }
  };

  return (
    <Modal title="監査ログ（取込状況）" onClose={onClose}>
      <p className="admin-note" role="note">
        🔒 管理APIは Cloudflare Access とサーバー側 allowlist
        で保護されます。取込記録の作成は管理者がボタン操作した場合だけ実行します。
      </p>
      <p className="admin-note" role="note">
        ℹ️ この「取込記録」は監査用の取込実行記録を作成します。実データの取得・DB反映は CLI（
        <code className="mono">pnpm ingest --source &lt;slug&gt; --publish</code>
        ）で実行してください。
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
      <section className="admin-run-detail" aria-labelledby="admin-management-heading">
        <div className="admin-section-header">
          <h3 id="admin-management-heading" className="settings-heading">
            管理一覧
          </h3>
          <button
            type="button"
            className="admin-action-button"
            disabled={isLoadingAdminLists}
            onClick={() => void loadAdminLists()}
          >
            {isLoadingAdminLists ? '読み込み中…' : '一覧を更新'}
          </button>
        </div>
        <div className="admin-grid">
          <div>
            <h4 className="admin-subheading">取込履歴</h4>
            {runs.length === 0 ? (
              <p className="detail-empty">取込履歴はまだ読み込まれていません。</p>
            ) : (
              <ul className="admin-issue-list">
                {runs.map((run) => (
                  <li key={run.id} className="admin-issue-item">
                    <button
                      type="button"
                      className="admin-link-button"
                      onClick={() => void loadRunDetail(run)}
                    >
                      {run.sourceSlug} / {run.status}
                    </button>
                    <div className="source-provider">
                      {formatDate(run.startedAt)} / 取得 {run.fetchedCount.toLocaleString('ja-JP')}
                      件
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="admin-subheading">未解決品質issue</h4>
            {openIssues.length === 0 ? (
              <p className="detail-empty">未解決issueはまだ読み込まれていません。</p>
            ) : (
              <ul className="admin-issue-list">
                {openIssues.map((issue) => (
                  <li key={issue.id} className="admin-issue-item">
                    <div className="admin-issue-main">
                      <span className="quality-badge admin-issue-code">{issue.ruleCode}</span>
                      <span>{issue.message}</span>
                    </div>
                    <div className="source-provider">
                      {issue.severity} / {formatDate(issue.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="admin-grid">
          <div>
            <h4 className="admin-subheading">🔐 監査イベント（append-only・ハッシュチェーン）</h4>
            <p
              className="source-provider"
              role={auditValid === false ? 'alert' : 'note'}
              aria-live={auditValid === false ? 'assertive' : 'off'}
            >
              {auditValid === null
                ? '監査イベントはまだ読み込まれていません。'
                : auditValid
                  ? '✅ チェーン整合性: 正常'
                  : '🚨 チェーン整合性: 異常（改ざんの可能性）'}
            </p>
            {auditEvents.length === 0 ? (
              <p className="detail-empty">監査イベントはまだ記録されていません。</p>
            ) : (
              <ul className="admin-issue-list">
                {auditEvents.map((event) => (
                  <li key={event.id} className="admin-issue-item">
                    <div className="admin-issue-main">
                      <span className="quality-badge admin-issue-code">{event.action}</span>
                      <span>{event.summary}</span>
                    </div>
                    <div className="source-provider">
                      {event.actor} / {formatDate(event.occurredAt)}
                    </div>
                    <div className="mono source-provider">
                      {event.eventHash.slice(0, 16)}… / prev {event.prevHash.slice(0, 8)}…
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="admin-subheading">📣 フィードバック（利用者報告）</h4>
            {feedbackReports.length === 0 ? (
              <p className="detail-empty">フィードバックはまだ届いていません。</p>
            ) : (
              <ul className="admin-issue-list">
                {feedbackReports.map((report) => (
                  <li key={report.id} className="admin-issue-item">
                    <div className="admin-issue-main">
                      <span className="quality-badge admin-issue-code">{report.category}</span>
                      <span>{report.detail}</span>
                    </div>
                    <div className="source-provider">
                      {report.status} / {formatDate(report.createdAt)}
                      {report.pageUrl ? ` / ${report.pageUrl}` : ''}
                    </div>
                    {report.status === 'open' ? (
                      <div className="admin-issue-resolution">
                        <label className="admin-issue-reason-label">
                          対応メモ
                          <input
                            className="admin-issue-reason"
                            value={feedbackResolutionInputs[report.id] ?? ''}
                            onChange={(event) =>
                              setFeedbackResolutionInputs((prev) => ({
                                ...prev,
                                [report.id]: event.currentTarget.value,
                              }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="admin-action-button"
                          disabled={
                            pendingFeedbackId !== null ||
                            (feedbackResolutionInputs[report.id] ?? '').trim() === ''
                          }
                          onClick={() => void resolveFeedback(report, 'converted')}
                        >
                          {pendingFeedbackId === report.id ? '記録中…' : '品質issue化'}
                        </button>
                        <button
                          type="button"
                          className="admin-action-button"
                          disabled={pendingFeedbackId !== null}
                          onClick={() => void resolveFeedback(report, 'dismissed')}
                        >
                          却下
                        </button>
                      </div>
                    ) : report.resolutionNote ? (
                      <div className="source-provider">対応: {report.resolutionNote}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
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
          {detail ? (
            <div className="admin-quality-issues">
              <h4 className="admin-subheading">品質issue</h4>
              {detail.qualityIssues.length === 0 ? (
                <p className="detail-empty">未解決の品質issueはありません。</p>
              ) : (
                <ul className="admin-issue-list">
                  {detail.qualityIssues.map((issue) => {
                    const isOpen = issue.resolutionStatus === 'open';
                    const reason = resolutionInputs[issue.id] ?? '';
                    return (
                      <li key={issue.id} className="admin-issue-item">
                        <div className="admin-issue-main">
                          <span className="quality-badge admin-issue-code">{issue.ruleCode}</span>
                          <span>{issue.message}</span>
                        </div>
                        <div className="source-provider">
                          {issue.severity} / {issue.resolutionStatus}
                        </div>
                        {isOpen ? (
                          <div className="admin-issue-resolution">
                            <label>
                              <span className="visually-hidden">解決ステータス</span>
                              <select
                                className="admin-issue-select"
                                value={resolutionChoices[issue.id] ?? 'accepted'}
                                onChange={(event) =>
                                  setIssueResolution(
                                    issue.id,
                                    event.currentTarget.value as ResolutionChoice,
                                  )
                                }
                              >
                                <option value="accepted">受容</option>
                                <option value="fixed">修正済み</option>
                                <option value="dismissed">却下</option>
                              </select>
                            </label>
                            <label className="admin-issue-reason-label">
                              理由
                              <input
                                className="admin-issue-reason"
                                value={reason}
                                onChange={(event) =>
                                  setIssueReason(issue.id, event.currentTarget.value)
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="admin-action-button"
                              disabled={pendingIssueId !== null || reason.trim() === ''}
                              onClick={() => void resolveIssue(issue)}
                            >
                              {pendingIssueId === issue.id ? '記録中…' : '解決を記録'}
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </Modal>
  );
}
