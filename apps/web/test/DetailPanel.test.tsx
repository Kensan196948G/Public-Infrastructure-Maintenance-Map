import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type ApiClient } from '../src/api/client.js';
import { DetailPanel } from '../src/components/DetailPanel.js';
import { detailWithGaps } from './fixtures.js';

type DetailClient = Pick<ApiClient, 'suspendAdminAsset'>;

function makeClient(overrides: Partial<DetailClient> = {}): ApiClient & DetailClient {
  return {
    suspendAdminAsset: vi.fn(async () => ({
      id: detailWithGaps.id,
      publicationStatus: 'suspended',
      reason: 'ライセンス確認中',
    })),
    ...overrides,
  } as unknown as ApiClient & DetailClient;
}

function renderDetail(client?: ApiClient) {
  return render(
    <DetailPanel
      detail={detailWithGaps}
      isLoading={false}
      isError={false}
      onClose={() => {}}
      {...(client ? { client } : {})}
    />,
  );
}

describe('DetailPanel', () => {
  it('renders sections in the required order (概要→…→注意事項)', () => {
    renderDetail();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      '概要',
      '位置',
      '公開属性',
      '品質・鮮度',
      '出典・利用条件',
      '注意事項',
      '管理操作',
    ]);
  });

  it('shows 不明 for missing original name and authority', () => {
    renderDetail();
    // originalName and managingAuthority are both null in the fixture.
    expect(screen.getAllByText('不明').length).toBeGreaterThanOrEqual(2);
  });

  it('renders a numeric attribute with its unit', () => {
    renderDetail();
    expect(screen.getByText('320 m')).toBeInTheDocument();
  });

  it('shows 不明 for an attribute with no published value', () => {
    renderDetail();
    const attrHeading = screen.getByRole('heading', { name: '公開属性' });
    const section = attrHeading.closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText('不明')).toBeInTheDocument();
  });

  it('shows 不明 for the source update date when it is unknown', () => {
    renderDetail();
    const heading = screen.getByRole('heading', { name: '品質・鮮度' });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByText('不明')).toBeInTheDocument();
  });

  it('links to the original source safely (noopener noreferrer, new tab)', () => {
    renderDetail();
    const link = screen.getByRole('link', { name: /原典ページを開く/ });
    expect(link).toHaveAttribute('href', 'https://example.gov/source');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders notices', () => {
    renderDetail();
    expect(screen.getByText(/重複候補が検出されています/)).toBeInTheDocument();
  });

  it('calls onClose from the header button', async () => {
    const onClose = vi.fn();
    render(
      <DetailPanel detail={detailWithGaps} isLoading={false} isError={false} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders an error state', () => {
    render(<DetailPanel detail={null} isLoading={false} isError onClose={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/取得に失敗/);
  });

  it('requires a suspend reason before calling the admin API', async () => {
    const client = makeClient();
    renderDetail(client);

    expect(screen.getByRole('button', { name: '公開停止を記録' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('公開停止理由'), 'ライセンス確認中');
    await userEvent.click(screen.getByRole('button', { name: '公開停止を記録' }));

    await waitFor(() => {
      expect(client.suspendAdminAsset).toHaveBeenCalledWith(detailWithGaps.id, 'ライセンス確認中');
    });
    expect(screen.getByRole('status')).toHaveTextContent(/suspended/);
  });

  it('shows an authorization message when suspend is rejected', async () => {
    const client = makeClient({
      suspendAdminAsset: vi.fn(async () => {
        throw new ApiError(403, 'Forbidden');
      }),
    });
    renderDetail(client);

    await userEvent.type(screen.getByLabelText('公開停止理由'), '確認中');
    await userEvent.click(screen.getByRole('button', { name: '公開停止を記録' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/管理APIへのアクセス権が必要/);
    });
  });
});
