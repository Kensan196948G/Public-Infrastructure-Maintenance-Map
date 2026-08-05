import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackDialog } from '../src/components/FeedbackDialog.js';

describe('FeedbackDialog', () => {
  it('opens a GitHub issue draft with the report prefilled', async () => {
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={() => {}} />);

    await user.selectOptions(screen.getByLabelText('カテゴリ'), 'link');
    await user.type(screen.getByLabelText(/詳細/), 'リンクが切れています');

    const link = screen.getByRole('link', { name: /GitHub Issue の下書きを開く/ });
    const url = new URL(link.getAttribute('href') ?? '');
    expect(url.origin).toContain('github.com');
    expect(url.searchParams.get('title')).toContain('link');
    expect(url.searchParams.get('body')).toContain('リンクが切れています');
  });
});
