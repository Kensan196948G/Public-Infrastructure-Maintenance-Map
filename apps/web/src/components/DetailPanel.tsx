import { useState } from 'react';
import type { AssetDetail } from '@pimm/contracts';
import { ApiClient, ApiError } from '../api/client.js';
import { ASSET_TYPE_META, UNKNOWN_LABEL } from '../lib/asset-meta.js';
import { formatAttributeValue, formatDate, formatLatLon, orUnknown } from '../lib/format.js';
import { QualityBadge } from './QualityBadge.js';

interface DetailPanelProps {
  detail: AssetDetail | null;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
  client?: ApiClient;
}

const defaultClient = new ApiClient();

/**
 * Asset detail (UI-02). Section order is fixed by 設計書 §8.2:
 * 概要 → 位置 → 公開属性 → 品質・鮮度 → 出典・利用条件 → 注意事項.
 * Missing values are shown as 「不明」 — never inferred.
 */
export function DetailPanel({
  detail,
  isLoading,
  isError,
  onClose,
  client = defaultClient,
}: DetailPanelProps) {
  return (
    <section className="detail-panel" role="complementary" aria-label="詳細情報">
      <header className="detail-header">
        <h2 className="detail-title">
          {detail ? detail.name : isLoading ? '読み込み中…' : '詳細'}
        </h2>
        <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
          ✕
        </button>
      </header>

      {isError ? (
        <p className="detail-state" role="alert">
          詳細の取得に失敗しました。時間をおいて再度お試しください。
        </p>
      ) : isLoading || !detail ? (
        <p className="detail-state" role="status">
          読み込み中…
        </p>
      ) : (
        <DetailBody detail={detail} client={client} />
      )}
    </section>
  );
}

function DetailBody({ detail, client }: { detail: AssetDetail; client: ApiClient }) {
  const typeMeta = ASSET_TYPE_META[detail.type];
  const [suspendReason, setSuspendReason] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  const suspendAsset = async () => {
    const reason = suspendReason.trim();
    if (reason === '') return;
    setIsSuspending(true);
    setAdminError(null);
    setAdminMessage(null);
    try {
      const result = await client.suspendAdminAsset(detail.id, reason);
      setAdminMessage(`公開状態を ${result.publicationStatus} に更新しました。`);
      setSuspendReason('');
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setAdminError(
          '公開停止には管理APIへのアクセス権が必要です。Cloudflare Access の認証状態を確認してください。',
        );
      } else {
        setAdminError('公開停止を記録できませんでした。');
      }
    } finally {
      setIsSuspending(false);
    }
  };

  return (
    <div className="detail-body">
      {/* 概要 */}
      <section className="detail-section" aria-labelledby="detail-overview">
        <h3 id="detail-overview" className="detail-section-title">
          概要
        </h3>
        <dl className="detail-dl">
          <dt>種別</dt>
          <dd>
            <span aria-hidden="true">{typeMeta.icon}</span> {typeMeta.label}
          </dd>
          <dt>名称</dt>
          <dd>{orUnknown(detail.name)}</dd>
          <dt>原文名称</dt>
          <dd>{orUnknown(detail.originalName)}</dd>
          <dt>管理主体</dt>
          <dd>{orUnknown(detail.managingAuthority)}</dd>
        </dl>
      </section>

      {/* 位置 */}
      <section className="detail-section" aria-labelledby="detail-location">
        <h3 id="detail-location" className="detail-section-title">
          位置
        </h3>
        <dl className="detail-dl">
          <dt>代表点</dt>
          <dd>{formatLatLon(detail.representativePoint)}</dd>
          <dt>都道府県コード</dt>
          <dd>{orUnknown(detail.prefectureCode)}</dd>
          <dt>市区町村コード</dt>
          <dd>{orUnknown(detail.municipalityCode)}</dd>
          <dt>形状種別</dt>
          <dd>{detail.geometry.type}</dd>
        </dl>
      </section>

      {/* 公開属性 */}
      <section className="detail-section" aria-labelledby="detail-attributes">
        <h3 id="detail-attributes" className="detail-section-title">
          公開属性
        </h3>
        {detail.attributes.length === 0 ? (
          <p className="detail-empty">{UNKNOWN_LABEL}</p>
        ) : (
          <dl className="detail-dl">
            {detail.attributes.map((attr, i) => (
              <div className="detail-attr-row" key={`${attr.key}-${i}`}>
                <dt>{attr.key}</dt>
                <dd>{formatAttributeValue(attr)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* 品質・鮮度 */}
      <section className="detail-section" aria-labelledby="detail-quality">
        <h3 id="detail-quality" className="detail-section-title">
          品質・鮮度
        </h3>
        <div className="detail-quality">
          <QualityBadge status={detail.quality.status} withDescription />
        </div>
        <dl className="detail-dl">
          <dt>原典更新日</dt>
          <dd>
            {detail.quality.updatedAtKnown ? formatDate(detail.sourceUpdatedAt) : UNKNOWN_LABEL}
          </dd>
          <dt>未解決の品質コード</dt>
          <dd>
            {detail.quality.openIssueCodes.length > 0
              ? detail.quality.openIssueCodes.join(', ')
              : 'なし'}
          </dd>
        </dl>
      </section>

      {/* 出典・利用条件 */}
      <section className="detail-section" aria-labelledby="detail-source">
        <h3 id="detail-source" className="detail-section-title">
          出典・利用条件
        </h3>
        <dl className="detail-dl">
          <dt>提供元</dt>
          <dd>{orUnknown(detail.source.provider)}</dd>
          <dt>データセット</dt>
          <dd>{orUnknown(detail.source.dataset)}</dd>
          <dt>取得日時</dt>
          <dd>{formatDate(detail.source.fetchedAt)}</dd>
          <dt>ライセンス</dt>
          <dd>
            {detail.source.licenseUrl ? (
              <a href={detail.source.licenseUrl} target="_blank" rel="noopener noreferrer">
                {orUnknown(detail.source.licenseName)}
              </a>
            ) : (
              orUnknown(detail.source.licenseName)
            )}
          </dd>
          <dt>原典</dt>
          <dd>
            {detail.source.sourceUrl ? (
              <a href={detail.source.sourceUrl} target="_blank" rel="noopener noreferrer">
                原典ページを開く ↗
              </a>
            ) : (
              UNKNOWN_LABEL
            )}
          </dd>
        </dl>
      </section>

      {/* 注意事項 */}
      <section className="detail-section" aria-labelledby="detail-notices">
        <h3 id="detail-notices" className="detail-section-title">
          注意事項
        </h3>
        {detail.notices.length === 0 ? (
          <p className="detail-empty">特記事項はありません。</p>
        ) : (
          <ul className="detail-notices">
            {detail.notices.map((notice, i) => (
              <li key={i}>{notice}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section" aria-labelledby="detail-admin">
        <h3 id="detail-admin" className="detail-section-title">
          管理操作
        </h3>
        <p className="detail-admin-note">
          🔒 公開停止は Cloudflare Access とサーバー側 allowlist
          で保護された管理APIへ、理由入力後のボタン操作時だけ送信します。
        </p>
        <label className="detail-admin-label" htmlFor="suspend-reason">
          公開停止理由
        </label>
        <textarea
          id="suspend-reason"
          className="detail-admin-textarea"
          value={suspendReason}
          onChange={(e) => setSuspendReason(e.target.value)}
          rows={3}
          placeholder="例: ライセンス条件変更の確認が必要"
        />
        <button
          type="button"
          className="detail-admin-button"
          disabled={isSuspending || suspendReason.trim() === ''}
          onClick={() => void suspendAsset()}
        >
          {isSuspending ? '公開停止中…' : '公開停止を記録'}
        </button>
        {adminMessage ? (
          <p className="detail-admin-success" role="status">
            {adminMessage}
          </p>
        ) : null}
        {adminError ? (
          <p className="detail-admin-error" role="alert">
            {adminError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
