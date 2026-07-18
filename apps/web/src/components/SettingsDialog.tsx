import type { HealthResponse, SourceInfo } from '@pimm/contracts';
import { apiBaseUrl } from '../api/client.js';
import { formatDate } from '../lib/format.js';
import { Modal } from './Modal.js';

interface SettingsDialogProps {
  health: HealthResponse | null;
  sources: readonly SourceInfo[];
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}

/**
 * システム設定 (UI-06 相当) — 接続先・稼働状態・データソース概要・機能状態を表示。
 * 認証は未実装のため設定の変更は行わず、現状は読み取り専用の状況表示に限定する。
 */
export function SettingsDialog({
  health,
  sources,
  isLoading,
  isError,
  onClose,
}: SettingsDialogProps) {
  const enabledCount = sources.filter((s) => s.enabled).length;
  const publishedTotal = sources.reduce((sum, s) => sum + s.publishedAssetCount, 0);

  const apiStatus = isError
    ? '❌ 接続失敗'
    : isLoading
      ? '⏳ 確認中…'
      : health
        ? `🟢 ${health.status}`
        : '⚪ 不明';

  return (
    <Modal title="システム設定" onClose={onClose}>
      <p className="admin-note" role="note">
        ⚠️ 認証は未実装です。現状は読み取り専用の状況表示です。設定変更・ソース管理は管理API（Issue
        #4）実装後に提供します。
      </p>

      <section className="settings-section">
        <h3 className="settings-heading">🔌 接続 / 稼働状態</h3>
        <dl className="settings-list">
          <dt>API 接続先</dt>
          <dd className="mono">{apiBaseUrl()}</dd>
          <dt>API 稼働状態</dt>
          <dd>{apiStatus}</dd>
          <dt>API バージョン</dt>
          <dd>{health?.version ?? '不明'}</dd>
          <dt>応答時刻</dt>
          <dd>{formatDate(health?.time)}</dd>
        </dl>
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">🗄️ データソース概要</h3>
        <dl className="settings-list">
          <dt>登録ソース数</dt>
          <dd>{isLoading ? '—' : `${sources.length} 件（有効 ${enabledCount} 件）`}</dd>
          <dt>公開件数（合計）</dt>
          <dd>{isLoading ? '—' : publishedTotal.toLocaleString('ja-JP')}</dd>
        </dl>
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">⚙️ 機能 / 方針</h3>
        <dl className="settings-list">
          <dt>データ方針</dt>
          <dd>公開データ・公開API・検証用サンプルのみ</dd>
          <dt>ログイン認証</dt>
          <dd>⏳ 未実装（Issue #4）</dd>
          <dt>レート制限</dt>
          <dd>🟢 有効（本番は Cloudflare WAF）</dd>
          <dt>エクスポート</dt>
          <dd>🟢 有効（ライセンス制御付き CSV / GeoJSON）</dd>
        </dl>
      </section>
    </Modal>
  );
}
