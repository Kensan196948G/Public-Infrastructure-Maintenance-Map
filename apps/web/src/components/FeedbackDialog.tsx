import { useState } from 'react';
import type { FormEvent } from 'react';
import type { FeedbackCategory } from '@pimm/contracts';
import { ApiClient, ApiError } from '../api/client.js';
import { Modal } from './Modal.js';

interface FeedbackDialogProps {
  onClose: () => void;
  client?: ApiClient;
}

const defaultClient = new ApiClient();

const FEEDBACK_CATEGORIES: ReadonlyArray<readonly [FeedbackCategory, string]> = [
  ['location', '📌 位置が正しくない'],
  ['link', '🔗 原典リンクが切れている'],
  ['quality', '🧹 品質表示に疑問がある'],
  ['other', '💬 その他'],
];

const ISSUE_BASE_URL =
  'https://github.com/Kensan196948G/Public-Infrastructure-Maintenance-Map/issues/new';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * 📣 誤りを報告 (Issue #54) — 位置誤り・リンク切れ等を管理側のフィードバック
 * 受付へ API 送信する。スパム対策は API 側のレート制限と入力検証で行い、
 * 送信後の確認・品質issue化は管理側（監査ログ画面のフィードバック欄）で行う。
 * GitHub Issue の下書き導線も補助として併存させる。
 */
export function FeedbackDialog({ onClose, client = defaultClient }: FeedbackDialogProps) {
  const [category, setCategory] = useState<FeedbackCategory>('location');
  const [detail, setDetail] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const issueUrl = (() => {
    const params = new URLSearchParams({
      title: `[利用者フィードバック] ${category}`,
      body: [
        '## 報告内容',
        '',
        `- カテゴリ: ${category}`,
        `- 対象ページ: ${window.location.href}`,
        `- 報告日時: ${new Date().toISOString()}`,
        '',
        '## 詳細',
        '',
        detail.trim() || '（詳細未入力）',
        '',
        '---',
        'このIssueは「利用者フィードバック受付」の自動下書きです。内容確認後、品質issue化または修正対応を検討します。',
      ].join('\n'),
    });
    return `${ISSUE_BASE_URL}?${params.toString()}`;
  })();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = detail.trim();
    if (trimmed === '') return;
    setSubmitState('submitting');
    setErrorMessage(null);
    try {
      await client.submitFeedback({
        category,
        detail: trimmed,
        pageUrl: window.location.href,
      });
      setSubmitState('success');
      setDetail('');
    } catch (error) {
      setSubmitState('error');
      if (error instanceof ApiError) {
        setErrorMessage(
          error.status === 429
            ? '送信が集中しています。時間をおいて再度お試しください。'
            : 'フィードバックを送信できませんでした。時間をおいて再度お試しください。',
        );
      } else {
        setErrorMessage('フィードバックを送信できませんでした。時間をおいて再度お試しください。');
      }
    }
  };

  return (
    <Modal title="📣 誤りを報告" onClose={onClose}>
      <p className="notice-lead">
        位置の誤り、原典リンク切れ、品質表示への疑問などを報告できます。送信内容は管理者が確認し、
        品質issue化または修正対応を検討します（個人情報を記載しないでください）。
      </p>
      {submitState === 'success' ? (
        <div className="feedback-success" role="status">
          <p>✅ フィードバックを受け付けました。ご協力ありがとうございます。</p>
          <p className="source-provider">
            管理者が内容を確認し、必要に応じて品質issue化・修正対応を行います。個別の返信は行いません。
          </p>
          <button type="button" className="export-button feedback-submit" onClick={onClose}>
            閉じる
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)}>
          <label className="admin-source-field">
            カテゴリ
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
            >
              {FEEDBACK_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-source-field">
            詳細（具体的な場所や画面状態を記載すると調査しやすくなります）
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="例: 〇〇橋の位置が実際の場所より約100mずれているように見えます"
            />
          </label>
          {errorMessage ? (
            <p className="admin-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <button
            type="submit"
            className="export-button feedback-submit"
            disabled={submitState === 'submitting' || detail.trim() === ''}
          >
            {submitState === 'submitting' ? '送信中…' : '📤 送信'}
          </button>
          <p className="source-provider feedback-alt">
            補助: 公開の場で報告したい場合は
            <a href={issueUrl} target="_blank" rel="noopener noreferrer">
              GitHub Issue の下書きを開く ↗
            </a>
            も利用できます。
          </p>
        </form>
      )}
    </Modal>
  );
}
