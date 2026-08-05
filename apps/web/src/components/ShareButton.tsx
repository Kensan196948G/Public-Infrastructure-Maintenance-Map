import { useRef, useState } from 'react';

/**
 * 🔗 共有URL — copies the current (filter/viewport-synced) URL to the
 * clipboard so colleagues can reopen the exact map state (FR-07).
 */
export function ShareButton() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (non-secure context / permissions);
      // the button stays a no-op rather than crashing the header.
    }
  };

  return (
    <button
      type="button"
      className="header-link"
      onClick={() => void copy()}
      aria-label="現在の地図表示の共有URLをコピー"
    >
      {copied ? '✅ コピーしました' : '🔗 共有URL'}
    </button>
  );
}
