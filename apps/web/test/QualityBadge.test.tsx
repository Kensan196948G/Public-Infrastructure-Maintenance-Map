import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QualityStatus } from '@pimm/contracts';
import { QualityBadge } from '../src/components/QualityBadge.js';

const cases: Array<[QualityStatus, string]> = [
  ['verified', '確認済み'],
  ['review', '要確認'],
  ['reference', '参考'],
  ['hidden', '非公開'],
];

describe('QualityBadge', () => {
  it.each(cases)('renders the text label for %s (never color-only)', (status, label) => {
    render(<QualityBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows the accessible description when requested', () => {
    render(<QualityBadge status="review" withDescription />);
    expect(screen.getByText(/原典で確認/)).toBeInTheDocument();
  });

  it('does not show the description by default', () => {
    render(<QualityBadge status="verified" />);
    expect(screen.queryByText(/確認された情報/)).not.toBeInTheDocument();
  });
});
