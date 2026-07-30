import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataRefreshButton } from '../src/components/DataRefreshButton.js';

function setup() {
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <DataRefreshButton />
    </QueryClientProvider>,
  );
  return { queryClient, invalidateSpy };
}

describe('DataRefreshButton', () => {
  it('invalidates all queries and shows the last-updated time after refresh', async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = setup();

    const button = screen.getByRole('button', { name: '表示データをAPIから取り直す' });
    expect(button).toHaveTextContent('🔄 データ更新');
    expect(screen.queryByText(/最終更新/)).not.toBeInTheDocument();

    await user.click(button);

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    // invalidateQueries の resolve 後に最終更新時刻が表示され、ボタンは再度押せる。
    expect(await screen.findByText(/最終更新 \d{1,2}:\d{2}:\d{2}/)).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('disables the button and shows a busy label while refetching', async () => {
    const user = userEvent.setup();
    const { queryClient } = setup();

    let release!: () => void;
    vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const button = screen.getByRole('button', { name: '表示データをAPIから取り直す' });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('⏳ 更新中…');

    release();
    expect(await screen.findByText(/最終更新/)).toBeInTheDocument();
    expect(button).toBeEnabled();
  });
});
