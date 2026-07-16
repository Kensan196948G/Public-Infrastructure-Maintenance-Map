import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultList } from '../src/components/ResultList.js';
import { bridgeSummary, riverSummary } from './fixtures.js';

describe('ResultList', () => {
  it('renders each asset with its name and category', () => {
    render(
      <ResultList
        items={[bridgeSummary, riverSummary]}
        selectedId={null}
        isLoading={false}
        isError={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('未来大橋')).toBeInTheDocument();
    expect(screen.getByText('緑川')).toBeInTheDocument();
  });

  it('shows 不明 for a missing managing authority', () => {
    render(
      <ResultList
        items={[riverSummary]}
        selectedId={null}
        isLoading={false}
        isError={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/管理: 不明/)).toBeInTheDocument();
  });

  it('calls onSelect with the clicked asset', async () => {
    const onSelect = vi.fn();
    render(
      <ResultList
        items={[bridgeSummary]}
        selectedId={null}
        isLoading={false}
        isError={false}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /未来大橋/ }));
    expect(onSelect).toHaveBeenCalledWith(bridgeSummary);
  });

  it('marks the selected row with aria-current', () => {
    render(
      <ResultList
        items={[bridgeSummary]}
        selectedId={bridgeSummary.id}
        isLoading={false}
        isError={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /未来大橋/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('renders an empty-state message when there are no items', () => {
    render(
      <ResultList
        items={[]}
        selectedId={null}
        isLoading={false}
        isError={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/該当するデータがありません/)).toBeInTheDocument();
  });

  it('renders an error state', () => {
    render(
      <ResultList
        items={[]}
        selectedId={null}
        isLoading={false}
        isError
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/取得に失敗/);
  });
});
