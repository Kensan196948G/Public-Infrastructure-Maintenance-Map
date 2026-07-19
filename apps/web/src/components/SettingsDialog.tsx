import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AccessType,
  AdminCreateSource,
  AdminUpdateSource,
  HealthResponse,
  RedistributionPolicy,
  SourceFormat,
  SourceInfo,
} from '@pimm/contracts';
import { ApiClient, ApiError, apiBaseUrl } from '../api/client.js';
import { formatDate } from '../lib/format.js';
import { Modal } from './Modal.js';

interface SettingsDialogProps {
  health: HealthResponse | null;
  sources: readonly SourceInfo[];
  isLoading: boolean;
  isError: boolean;
  apiClient?: ApiClient;
  onSourcesChanged?: () => void;
  onClose: () => void;
}

interface SourceFormState {
  slug: string;
  name: string;
  providerName: string;
  sourceUrl: string;
  accessType: AccessType;
  format: SourceFormat;
  licenseName: string;
  licenseUrl: string;
  redistribution: RedistributionPolicy;
  attributionText: string;
  refreshCron: string;
  enabled: boolean;
}

const emptySourceForm: SourceFormState = {
  slug: '',
  name: '',
  providerName: '',
  sourceUrl: '',
  accessType: 'file',
  format: 'geojson',
  licenseName: '',
  licenseUrl: '',
  redistribution: 'allowed',
  attributionText: '',
  refreshCron: '',
  enabled: false,
};

function sourceToForm(source: SourceInfo): SourceFormState {
  return {
    slug: source.slug,
    name: source.name,
    providerName: source.providerName,
    sourceUrl: source.sourceUrl,
    accessType: source.accessType,
    format: source.format,
    licenseName: source.licenseName,
    licenseUrl: source.licenseUrl ?? '',
    redistribution: source.redistribution,
    attributionText: source.attributionText ?? '',
    refreshCron: '',
    enabled: source.enabled,
  };
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toCreateInput(form: SourceFormState): AdminCreateSource {
  return {
    slug: form.slug.trim(),
    name: form.name.trim(),
    providerName: form.providerName.trim(),
    sourceUrl: form.sourceUrl.trim(),
    accessType: form.accessType,
    format: form.format,
    licenseName: form.licenseName.trim(),
    licenseUrl: nullableText(form.licenseUrl),
    redistribution: form.redistribution,
    attributionText: nullableText(form.attributionText),
    refreshCron: nullableText(form.refreshCron),
    enabled: form.enabled,
  };
}

function toUpdateInput(form: SourceFormState): AdminUpdateSource {
  const { slug: _slug, ...withoutSlug } = toCreateInput(form);
  return withoutSlug;
}

/**
 * システム設定 (UI-06 相当) — 接続先・稼働状態・データソース概要・機能状態を表示。
 * 管理APIの認証ゲートを通して、データソースの登録・編集を実行する。
 */
export function SettingsDialog({
  health,
  sources,
  isLoading,
  isError,
  apiClient = new ApiClient(),
  onSourcesChanged,
  onClose,
}: SettingsDialogProps) {
  const enabledCount = sources.filter((s) => s.enabled).length;
  const publishedTotal = sources.reduce((sum, s) => sum + s.publishedAssetCount, 0);
  const sortedSources = useMemo(
    () => [...sources].sort((a, b) => a.slug.localeCompare(b.slug)),
    [sources],
  );
  const [selectedSlug, setSelectedSlug] = useState('');
  const [form, setForm] = useState<SourceFormState>(emptySourceForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuspendingSource, setIsSuspendingSource] = useState(false);
  const [sourceSuspendReason, setSourceSuspendReason] = useState('');
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    const selected = sources.find((s) => s.slug === selectedSlug);
    setForm(selected ? sourceToForm(selected) : emptySourceForm);
  }, [selectedSlug, sources]);

  useEffect(() => {
    setAdminMessage(null);
    setAdminError(null);
    setSourceSuspendReason('');
  }, [selectedSlug]);

  const apiStatus = isError
    ? '❌ 接続失敗'
    : isLoading
      ? '⏳ 確認中…'
      : health
        ? `🟢 ${health.status}`
        : '⚪ 不明';

  const updateForm = <K extends keyof SourceFormState>(key: K, value: SourceFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminMessage(null);
    setAdminError(null);
    setIsSubmitting(true);
    try {
      const source = selectedSlug
        ? await apiClient.updateAdminSource(selectedSlug, toUpdateInput(form))
        : await apiClient.createAdminSource(toCreateInput(form));
      setAdminMessage(
        selectedSlug
          ? `✅ ${source.slug} を更新しました`
          : `✅ ${source.slug} を登録しました。既定では公開対象へ追加する前に内容確認してください。`,
      );
      onSourcesChanged?.();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `${error.status}: ${error.message}`
          : '管理APIへの反映に失敗しました';
      setAdminError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSuspendSourceAssets() {
    const reason = sourceSuspendReason.trim();
    if (!selectedSlug || reason === '') return;
    setAdminMessage(null);
    setAdminError(null);
    setIsSuspendingSource(true);
    try {
      const result = await apiClient.suspendAdminSourceAssets(selectedSlug, reason);
      setAdminMessage(
        `✅ ${result.sourceSlug} の公開中資産 ${result.suspendedCount.toLocaleString(
          'ja-JP',
        )} 件を停止しました`,
      );
      onSourcesChanged?.();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `${error.status}: ${error.message}`
          : 'ソース単位の公開停止を記録できませんでした';
      setAdminError(message);
    } finally {
      setIsSuspendingSource(false);
    }
  }

  return (
    <Modal title="システム設定" onClose={onClose}>
      <p className="admin-note" role="note">
        🔒 データソースの登録・編集は Cloudflare Access
        認証後のadmin権限で実行されます。未認証または権限不足の場合はAPI側で拒否されます。
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

      <section className="settings-section" aria-labelledby="source-admin-heading">
        <h3 id="source-admin-heading" className="settings-heading">
          🛠️ データソース登録 / 編集
        </h3>
        <form className="admin-source-form" onSubmit={handleSubmit}>
          <label className="admin-source-field">
            対象
            <select
              value={selectedSlug}
              onChange={(event) => setSelectedSlug(event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">新規登録</option>
              {sortedSources.map((source) => (
                <option key={source.slug} value={source.slug}>
                  {source.slug} / {source.name}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-source-grid">
            <label className="admin-source-field">
              slug
              <input
                value={form.slug}
                onChange={(event) => updateForm('slug', event.target.value)}
                disabled={Boolean(selectedSlug) || isSubmitting}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={100}
                placeholder="kumamoto-bridges"
              />
            </label>
            <label className="admin-source-field">
              名称
              <input
                value={form.name}
                onChange={(event) => updateForm('name', event.target.value)}
                disabled={isSubmitting}
                required
              />
            </label>
            <label className="admin-source-field">
              提供者
              <input
                value={form.providerName}
                onChange={(event) => updateForm('providerName', event.target.value)}
                disabled={isSubmitting}
                required
              />
            </label>
            <label className="admin-source-field">
              URL
              <input
                value={form.sourceUrl}
                onChange={(event) => updateForm('sourceUrl', event.target.value)}
                disabled={isSubmitting}
                required
                type="url"
              />
            </label>
            <label className="admin-source-field">
              取得方式
              <select
                value={form.accessType}
                onChange={(event) => updateForm('accessType', event.target.value as AccessType)}
                disabled={isSubmitting}
              >
                <option value="file">file</option>
                <option value="http">http</option>
                <option value="api">api</option>
              </select>
            </label>
            <label className="admin-source-field">
              形式
              <select
                value={form.format}
                onChange={(event) => updateForm('format', event.target.value as SourceFormat)}
                disabled={isSubmitting}
              >
                <option value="geojson">geojson</option>
                <option value="csv">csv</option>
                <option value="json">json</option>
                <option value="xml">xml</option>
                <option value="shape">shape</option>
                <option value="pdf">pdf</option>
              </select>
            </label>
            <label className="admin-source-field">
              ライセンス
              <input
                value={form.licenseName}
                onChange={(event) => updateForm('licenseName', event.target.value)}
                disabled={isSubmitting}
                required
              />
            </label>
            <label className="admin-source-field">
              ライセンスURL
              <input
                value={form.licenseUrl}
                onChange={(event) => updateForm('licenseUrl', event.target.value)}
                disabled={isSubmitting}
                type="url"
              />
            </label>
            <label className="admin-source-field">
              再配布
              <select
                value={form.redistribution}
                onChange={(event) =>
                  updateForm('redistribution', event.target.value as RedistributionPolicy)
                }
                disabled={isSubmitting}
              >
                <option value="allowed">allowed</option>
                <option value="restricted">restricted</option>
                <option value="prohibited">prohibited</option>
                <option value="unknown">unknown</option>
              </select>
            </label>
            <label className="admin-source-field">
              更新cron
              <input
                value={form.refreshCron}
                onChange={(event) => updateForm('refreshCron', event.target.value)}
                disabled={isSubmitting}
                placeholder="0 3 * * *"
              />
            </label>
          </div>

          <label className="admin-source-field">
            帰属表示
            <textarea
              value={form.attributionText}
              onChange={(event) => updateForm('attributionText', event.target.value)}
              disabled={isSubmitting}
              rows={2}
            />
          </label>

          <label className="admin-source-check">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => updateForm('enabled', event.target.checked)}
              disabled={isSubmitting}
            />
            有効化する
          </label>

          <div className="admin-source-actions">
            <button type="submit" className="admin-action-button" disabled={isSubmitting}>
              {selectedSlug ? '💾 更新' : '➕ 登録'}
            </button>
            <button
              type="button"
              className="admin-action-button"
              onClick={() => setSelectedSlug('')}
              disabled={isSubmitting}
            >
              新規へ戻す
            </button>
          </div>
        </form>

        <div className="admin-danger-zone" aria-labelledby="source-suspend-heading">
          <h4 id="source-suspend-heading">🛑 ライセンス変更時の公開停止</h4>
          <p>選択中ソースの公開中資産を一括で停止し、Q007の品質issueとして監査記録します。</p>
          <label className="admin-source-field" htmlFor="source-suspend-reason">
            一括公開停止理由
            <textarea
              id="source-suspend-reason"
              value={sourceSuspendReason}
              onChange={(event) => setSourceSuspendReason(event.target.value)}
              disabled={!selectedSlug || isSuspendingSource}
              rows={2}
              placeholder="例: ライセンス条件変更のため再確認が必要"
            />
          </label>
          <button
            type="button"
            className="admin-danger-button"
            disabled={!selectedSlug || sourceSuspendReason.trim() === '' || isSuspendingSource}
            onClick={() => void handleSuspendSourceAssets()}
          >
            {isSuspendingSource ? '一括停止中…' : '選択ソースの公開資産を一括停止'}
          </button>
        </div>

        {adminMessage ? (
          <p className="detail-admin-success" role="status">
            {adminMessage}
          </p>
        ) : null}
        {adminError ? (
          <p className="admin-error" role="alert">
            {adminError}
          </p>
        ) : null}
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">⚙️ 機能 / 方針</h3>
        <dl className="settings-list">
          <dt>データ方針</dt>
          <dd>公開データ・公開API・検証用サンプルのみ</dd>
          <dt>ログイン認証</dt>
          <dd>🟢 管理APIゲート実装済（ソース登録/編集UI接続済み）</dd>
          <dt>レート制限</dt>
          <dd>🟢 有効（本番は Cloudflare WAF）</dd>
          <dt>エクスポート</dt>
          <dd>🟢 有効（ライセンス制御付き CSV / GeoJSON）</dd>
        </dl>
      </section>
    </Modal>
  );
}
