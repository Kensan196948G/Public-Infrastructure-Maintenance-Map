import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('shows the current admin authentication state', () => {
    setup();
    expect(screen.getByText(/ソース登録\/編集UI接続済み/)).toBeInTheDocument();
  });

  it('reflects an API connection failure', () => {
    setup({ isError: true, health: null });
    expect(screen.getByText(/接続失敗/)).toBeInTheDocument();
  });

  it('registers a new source through the admin API', async () => {
    const user = userEvent.setup();
    const createAdminSource = vi.fn().mockResolvedValue({
      ...source,
      slug: 'new-source',
      name: '新規ソース',
      enabled: false,
    });
    const onSourcesChanged = vi.fn();
    setup({
      apiClient: { createAdminSource } as never,
      onSourcesChanged,
    });

    await user.type(screen.getByLabelText('slug'), 'new-source');
    await user.type(screen.getByLabelText('名称'), '新規ソース');
    await user.type(screen.getByLabelText('提供者'), '新規提供者');
    await user.type(screen.getByLabelText('URL'), 'https://example.com/new.geojson');
    await user.type(screen.getByLabelText('ライセンス'), 'CC-BY-4.0');
    await user.click(screen.getByRole('button', { name: /登録/ }));

    await waitFor(() => {
      expect(createAdminSource).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'new-source',
          name: '新規ソース',
          providerName: '新規提供者',
          sourceUrl: 'https://example.com/new.geojson',
          enabled: false,
        }),
      );
    });
    expect(onSourcesChanged).toHaveBeenCalled();
    expect(await screen.findByText(/new-source を登録しました/)).toBeInTheDocument();
  });

  it('updates an existing source through the admin API', async () => {
    const user = userEvent.setup();
    const updateAdminSource = vi.fn().mockResolvedValue({ ...source, name: '更新後ソース' });
    setup({ apiClient: { updateAdminSource } as never });

    await user.selectOptions(screen.getByLabelText('対象'), 'sample-bridges');
    await user.clear(screen.getByLabelText('名称'));
    await user.type(screen.getByLabelText('名称'), '更新後ソース');
    await user.click(screen.getByRole('button', { name: /更新/ }));

    await waitFor(() => {
      expect(updateAdminSource).toHaveBeenCalledWith(
        'sample-bridges',
        expect.objectContaining({ name: '更新後ソース' }),
      );
    });
    expect(await screen.findByText(/sample-bridges を更新しました/)).toBeInTheDocument();
  });

  it('suspends published assets for the selected source', async () => {
    const user = userEvent.setup();
    const suspendAdminSourceAssets = vi.fn().mockResolvedValue({
      sourceSlug: 'sample-bridges',
      publicationStatus: 'suspended',
      suspendedCount: 10,
      reason: 'ライセンス変更のため再確認',
    });
    const onSourcesChanged = vi.fn();
    setup({
      apiClient: { suspendAdminSourceAssets } as never,
      onSourcesChanged,
    });

    const suspendButton = screen.getByRole('button', { name: /選択ソースの公開資産を一括停止/ });
    expect(suspendButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('対象'), 'sample-bridges');
    await user.type(screen.getByLabelText('一括公開停止理由'), 'ライセンス変更のため再確認');
    await user.click(suspendButton);

    await waitFor(() => {
      expect(suspendAdminSourceAssets).toHaveBeenCalledWith(
        'sample-bridges',
        'ライセンス変更のため再確認',
      );
    });
    expect(onSourcesChanged).toHaveBeenCalled();
    expect(await screen.findByText(/公開中資産 10 件を停止しました/)).toBeInTheDocument();
  });
});
