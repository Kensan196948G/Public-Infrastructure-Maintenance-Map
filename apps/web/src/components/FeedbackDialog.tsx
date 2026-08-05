import { useMemo, useState } from 'react';
import { Modal } from './Modal.js';

interface FeedbackDialogProps {
  onClose: () => void;
}

const FEEDBACK_CATEGORIES = [
  ['location', '📌 位置が正しくない'],
  ['link', '🔗 原典リンクが切れている'],
  ['quality', '🧹 品質表示に疑問がある'],
  ['other', '💬 その他'],
] as const;

const ISSUE_BASE_URL =
  'https://github.com/Kensan196948G/Public-Infrastructure-Maintenance-Map/issues/new';

/**
 * 📣 誤りを報告 (Issue #54 の入口) — 位置誤り・リンク切れ等を GitHub Issue
 * として起票するための下書きダイアログ。送信は利用者の GitHub 操作で行うため
 * 公開APIに匿名書き込み口を増やさず、監査可能性をGitHub側に委ねる。
 */
export function FeedbackDialog({ onClose }: FeedbackDialogProps) {
  const [category, setCategory] = useState<(typeof FEEDBACK_CATEGORIES)[number][0]>('location');
  const [detail, setDetail] = useState('');

  const issueUrl = useMemo(() => {
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
  }, [category, detail]);

  return (
    <Modal title="📣 誤りを報告" onClose={onClose}>
      <p className="notice-lead">
        位置の誤り、原典リンク切れ、品質表示への疑問などを報告できます。送信はGitHub
        Issueの下書き作成として行われ、内容は公開されます（個人情報を記載しないでください）。
      </p>
      <label className="admin-source-field">
        カテゴリ
        <select
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as (typeof FEEDBACK_CATEGORIES)[number][0])
          }
        >
          {FEEDBACK_CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-source-field">
        詳細（任意・具体的な場所や画面状態を記載すると調査しやすくなります）
        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          rows={5}
          placeholder="例: 〇〇橋の位置が実際の場所より約100mずれているように見えます"
        />
      </label>
      <a
        className="export-button feedback-submit"
        href={issueUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        GitHub Issue の下書きを開く ↗
      </a>
    </Modal>
  );
}
