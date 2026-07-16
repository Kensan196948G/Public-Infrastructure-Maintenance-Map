import type { QualityStatus } from '@pimm/contracts';
import { QUALITY_META } from '../lib/asset-meta.js';

interface QualityBadgeProps {
  status: QualityStatus;
  /** When true, render the longer accessible description alongside the label. */
  withDescription?: boolean;
}

/**
 * Quality indicator. Text is always shown next to the color/icon so the badge
 * never relies on color alone (WCAG 1.4.1).
 */
export function QualityBadge({ status, withDescription = false }: QualityBadgeProps) {
  const meta = QUALITY_META[status];
  return (
    <span className="quality-badge-wrap">
      <span
        className="quality-badge"
        style={{ borderColor: meta.color, color: meta.color }}
        data-status={status}
      >
        <span aria-hidden="true">{meta.icon}</span>
        <span className="quality-badge-label">{meta.label}</span>
      </span>
      {withDescription ? <span className="quality-badge-desc">{meta.description}</span> : null}
    </span>
  );
}
