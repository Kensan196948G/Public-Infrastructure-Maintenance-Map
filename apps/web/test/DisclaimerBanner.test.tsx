import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DISCLAIMER_TEXT, DisclaimerBanner } from '../src/components/DisclaimerBanner.js';

describe('DisclaimerBanner', () => {
  it('renders the exact required disclaimer wording', () => {
    render(<DisclaimerBanner onOpenNotice={() => {}} />);
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeInTheDocument();
    expect(DISCLAIMER_TEXT).toContain('参考情報');
    expect(DISCLAIMER_TEXT).toContain('健全性・安全性は判定しません');
    expect(DISCLAIMER_TEXT).toContain('原典と管理主体へ確認');
  });

  it('exposes the note as an accessible landmark', () => {
    render(<DisclaimerBanner onOpenNotice={() => {}} />);
    expect(screen.getByRole('note', { name: '利用上の注意' })).toBeInTheDocument();
  });

  it('invokes onOpenNotice when the detail button is pressed', async () => {
    const onOpenNotice = vi.fn();
    render(<DisclaimerBanner onOpenNotice={onOpenNotice} />);
    await userEvent.click(screen.getByRole('button', { name: '詳細' }));
    expect(onOpenNotice).toHaveBeenCalledOnce();
  });
});
