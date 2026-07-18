import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { HealthResponse, SourceInfo } from '@pimm/contracts';
import { SettingsDialog } from '../src/components/SettingsDialog.js';

const health: HealthResponse = {
  status: 'ok',
  version: '0.1.0',
  time: '2026-07-18T00:00:00Z',
};

const source: SourceInfo = {
  slug: 'sample-bridges',
  name: 'サンプル橋梁データセット',
  providerName: 'テスト提供機関',
  sourceUrl: 'https://example.com/source',
  accessType: 'file',
  format: 'geojson',
  licenseName: 'CC-BY-4.0',
  licenseUrl: null,
  redistribution: 'allowed',
  attributionText: null,
  enabled: true,
  lastFetchedAt: '2026-07-10T00:00:00Z',
  sourceUpdatedAt: '2026-04-01T00:00:00Z',
  publishedAssetCount: 10,
};

function setup(overrides: Partial<Parameters<typeof SettingsDialog>[0]> = {}) {
  const props = {
    health,
    sources: [source],
    isLoading: false,
    isError: false,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<SettingsDialog {...props} />);
  return props;
}

describe('SettingsDialog', () => {
  it('shows the API version and status', () => {
    setup();
    expect(screen.getByText('0.1.0')).toBeInTheDocument();
    expect(screen.getByText(/🟢 ok/)).toBeInTheDocument();
  });

  it('summarizes the registered sources', () => {
    setup();
    expect(screen.getByText(/1 件（有効 1 件）/)).toBeInTheDocument();
  });

  it('discloses that login authentication is not yet implemented', () => {
    setup();
    expect(screen.getByText(/未実装（Issue #4）/)).toBeInTheDocument();
  });

  it('reflects an API connection failure', () => {
    setup({ isError: true, health: null });
    expect(screen.getByText(/接続失敗/)).toBeInTheDocument();
  });
});
