import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedbackSubmitResponse } from '@pimm/contracts';
import type { ApiClient } from '../src/api/client.js';
import { ApiError } from '../src/api/client.js';
import { FeedbackDialog } from '../src/components/FeedbackDialog.js';

function stubClient(overrides: { submit?: () => Promise<FeedbackSubmitResponse> }) {
  return {
    submitFeedback: vi.fn(
      overrides.submit ?? (async () => ({ id: '', status: 'received' }) as FeedbackSubmitResponse),
    ),
  } as unknown as ApiClient;
}

describe('FeedbackDialog', () => {
  it('opens a GitHub issue draft with the report prefilled', async () => {
    const user = userEvent.setup();
    render(<FeedbackDialog onClose={() => {}} client={stubClient({})} />);

    await user.selectOptions(screen.getByLabelText('カテゴリ'), 'link');
    await user.type(screen.getByLabelText(/詳細/), 'リンクが切れています');

    const link = screen.getByRole('link', { name: /GitHub Issue の下書きを開く/ });
    const url = new URL(link.getAttribute('href') ?? '');
    expect(url.origin).toContain('github.com');
    expect(url.searchParams.get('title')).toContain('link');
    expect(url.searchParams.get('body')).toContain('リンクが切れています');
  });

  it('submits the report to the API and shows success', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      submit: async () => ({
        id: '22222222-2222-4222-8222-222222222222',
        status: 'received',
        message: '受け付けました',
      }),
    });
    render(<FeedbackDialog onClose={() => {}} client={client} />);

    await user.selectOptions(screen.getByLabelText('カテゴリ'), 'quality');
    await user.type(screen.getByLabelText(/詳細/), '品質バッジが適切に見えない');
    await user.click(screen.getByRole('button', { name: '📤 送信' }));

    await waitFor(() => {
      expect(screen.getByText(/受け付けました/)).toBeVisible();
    });
    expect(client.submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'quality',
        detail: '品質バッジが適切に見えない',
        pageUrl: expect.any(String),
      }),
    );
  });

  it('shows an error message when the submission fails', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      submit: async () => {
        throw new ApiError(429, 'RATE_LIMITED');
      },
    });
    render(<FeedbackDialog onClose={() => {}} client={client} />);

    await user.type(screen.getByLabelText(/詳細/), '失敗する報告');
    await user.click(screen.getByRole('button', { name: '📤 送信' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/時間をおいて/);
    });
  });

  it('disables submit while empty or submitting', async () => {
    const user = userEvent.setup();
    const client = stubClient({
      submit: async () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: '33333333-3333-4333-8333-333333333333',
                status: 'received',
                message: '受け付けました',
              }),
            50,
          );
        }),
    });
    render(<FeedbackDialog onClose={() => {}} client={client} />);

    const submit = screen.getByRole('button', { name: '📤 送信' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/詳細/), '送信中状態の確認');
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(screen.getByRole('button', { name: '送信中…' })).toBeDisabled();
  });
});
