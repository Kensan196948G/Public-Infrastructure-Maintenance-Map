import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../src/components/Modal.js';

describe('Modal (accessibility)', () => {
  it('moves focus into the dialog on open and restores it on close', async () => {
    const onClose = vi.fn();
    const open = document.createElement('button');
    open.textContent = '開く';
    document.body.appendChild(open);
    open.focus();

    const { unmount } = render(
      <Modal title="テストダイアログ" onClose={onClose}>
        <input aria-label="内容" />
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'テストダイアログ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '閉じる' })).toHaveFocus();

    unmount();
    expect(open).toHaveFocus();
    open.remove();
  });

  it('traps Tab focus inside the dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="テストダイアログ" onClose={onClose}>
        <input aria-label="内容" />
      </Modal>,
    );

    const close = screen.getByRole('button', { name: '閉じる' });
    const input = screen.getByRole('textbox', { name: '内容' });
    expect(close).toHaveFocus();

    await user.tab();
    expect(input).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(input).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal title="テストダイアログ" onClose={onClose}>
        <p>本文</p>
      </Modal>,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
