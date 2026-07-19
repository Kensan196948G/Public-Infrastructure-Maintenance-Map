import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SourceInfo } from '@pimm/contracts';
import { AuditLogDialog } from '../src/components/AuditLogDialog.js';

const source: SourceInfo = {
  slug: 'sample-bridges',
  name: 'サンプル橋梁データセット',
  providerName: 'テスト提供機関',
  sourceUrl: 'https://example.com/source',
  accessType: 'file',
  format: 'geojson',
  licenseName: 'CC-BY-4.0',
  licenseUrl: 'https://example.com/license',
  redistribution: 'allowed',
  attributionText: null,
  enabled: true,
  lastFetchedAt: '2026-07-10T00:00:00Z',
  sourceUpdatedAt: '2026-04-01T00:00:00Z',
  publishedAssetCount: 1234,
};

function setup(overrides: Partial<Parameters<typeof AuditLogDialog>[0]> = {}) {
  const props = {
    sources: [source],
    isLoading: false,
    isError: false,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AuditLogDialog {...props} />);
  return props;
}

describe('AuditLogDialog', () => {
  it('discloses that admin authentication exists while detailed UI wiring is pending', () => {
    setup();
    expect(screen.getByRole('note')).toHaveTextContent(/管理APIの認証ゲートは実装済み/);
  });

  it('renders per-source ingestion status', () => {
    setup();
    expect(screen.getByText('サンプル橋梁データセット')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText(/有効/)).toBeInTheDocument();
  });

  it('shows an empty state when no sources have been ingested', () => {
    setup({ sources: [] });
    expect(screen.getByText(/取込済みのデータソースはありません/)).toBeInTheDocument();
  });

  it('shows an error state', () => {
    setup({ isError: true });
    expect(screen.getByRole('alert')).toHaveTextContent(/取込状況の取得に失敗/);
  });
});
