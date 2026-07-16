import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterPanel } from '../src/components/FilterPanel.js';

function setup(overrides: Partial<Parameters<typeof FilterPanel>[0]> = {}) {
  const props = {
    selectedTypes: ['bridge', 'road', 'port', 'river', 'public_facility'] as const,
    selectedQuality: ['verified', 'review', 'reference'] as const,
    resultCount: 42,
    onToggleType: vi.fn(),
    onToggleQuality: vi.fn(),
    onOpenSources: vi.fn(),
    ...overrides,
  };
  render(<FilterPanel {...props} />);
  return props;
}

describe('FilterPanel', () => {
  it('renders all five category checkboxes checked', () => {
    setup();
    for (const label of ['橋梁', '道路', '港湾', '河川', '公共施設']) {
      expect(screen.getByRole('checkbox', { name: new RegExp(label) })).toBeChecked();
    }
  });

  it('calls onToggleType with the category when unchecked', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: /橋梁/ }));
    expect(props.onToggleType).toHaveBeenCalledWith('bridge');
  });

  it('calls onToggleQuality with the quality status', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: /要確認/ }));
    expect(props.onToggleQuality).toHaveBeenCalledWith('review');
  });

  it('renders the formatted result count', () => {
    setup({ resultCount: 1234 });
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('shows a placeholder when the count is unknown', () => {
    setup({ resultCount: null });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('opens the sources dialog', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: /データソース一覧/ }));
    expect(props.onOpenSources).toHaveBeenCalledOnce();
  });
});
