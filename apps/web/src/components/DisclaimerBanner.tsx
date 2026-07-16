interface DisclaimerBannerProps {
  /** Opens the full "利用上の注意" dialog (UI-04). */
  onOpenNotice: () => void;
}

/** Fixed disclaimer required by 要件定義 §8.2 / 設計書 §8.1. Always visible. */
export const DISCLAIMER_TEXT =
  '本地図は参考情報です。構造物の健全性・安全性は判定しません。最新かつ正式な情報は必ず原典と管理主体へ確認してください。';

export function DisclaimerBanner({ onOpenNotice }: DisclaimerBannerProps) {
  return (
    <div className="disclaimer-banner" role="note" aria-label="利用上の注意">
      <span aria-hidden="true">⚠️</span>
      <span className="disclaimer-text">{DISCLAIMER_TEXT}</span>
      <button type="button" className="link-button" onClick={onOpenNotice}>
        詳細
      </button>
    </div>
  );
}
