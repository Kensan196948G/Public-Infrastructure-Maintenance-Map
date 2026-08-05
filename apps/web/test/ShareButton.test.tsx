import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareButton } from '../src/components/ShareButton.js';

describe('ShareButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('copies the current URL and shows confirmation', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<ShareButton />);

    await user.click(screen.getByRole('button', { name: /共有URL/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('http')));
    expect(await screen.findByText('✅ コピーしました')).toBeInTheDocument();
  });

  it('stays a no-op when the clipboard API is unavailable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    render(<ShareButton />);
    await user.click(screen.getByRole('button', { name: /共有URL/ }));
    expect(screen.getByRole('button', { name: /共有URL/ })).toBeInTheDocument();
  });
});
