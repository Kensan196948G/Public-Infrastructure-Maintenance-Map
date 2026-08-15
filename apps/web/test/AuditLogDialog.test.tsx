import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  AdminIngestionDetail,
  AdminIngestionRun,
  AdminQualityIssueRecord,
  SourceInfo,
} from '@pimm/contracts';
import { ApiError, type ApiClient } from '../src/api/client.js';
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
  refreshCron: null,
  enabled: true,
  lastFetchedAt: '2026-07-10T00:00:00Z',
  sourceUpdatedAt: '2026-04-01T00:00:00Z',
  publishedAssetCount: 1234,
};

const run: AdminIngestionRun = {
  id: '00000000-0000-4000-8000-000000000001',
  sourceSlug: 'sample-bridges',
  startedAt: '2026-07-19T00:00:00.000Z',
  finishedAt: null,
  status: 'running',
  fetchedCount: 10,
  acceptedCount: 8,
  rejectedCount: 2,
  warningCount: 1,
  errorCode: null,
  errorSummary: null,
  triggeredBy: 'admin@example.com',
  correlationId: 'req-1',
};

const detail: AdminIngestionDetail = {
  run,
  qualityIssues: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      assetId: null,
      runId: run.id,
      ruleCode: 'Q005',
      severity: 'warning',
      fieldName: 'source_updated_at',
      observedValue: null,
      message: '更新日が不明です',
      resolutionStatus: 'open',
      createdAt: '2026-07-19T00:00:00.000Z',
      resolvedAt: null,
    },
  ],
};

const openIssue: AdminQualityIssueRecord = {
  id: '00000000-0000-4000-8000-000000000202',
  assetId: '00000000-0000-4000-8000-000000000303',
  runId: null,
  ruleCode: 'Q007',
  severity: 'warning',
  fieldName: 'publication_status',
  observedValue: 'suspended',
  message: '公開停止中です',
  resolutionStatus: 'open',
  createdAt: '2026-07-19T00:20:00.000Z',
  resolvedAt: null,
};

type AuditClient = Pick<
  ApiClient,
  | 'startAdminIngestion'
  | 'getAdminIngestion'
  | 'listAdminIngestions'
  | 'listAdminQualityIssues'
  | 'resolveAdminQualityIssue'
  | 'getAdminIngestionDiff'
  | 'listAdminAuditEvents'
  | 'listAdminFeedbackReports'
  | 'resolveAdminFeedback'
>;

const ingestionDiff = {
  sourceSlug: 'sample-bridges',
  baseVersionId: null,
  targetVersionId: null,
  baseFetchedAt: '2026-07-18T00:00:00.000Z',
  targetFetchedAt: '2026-07-19T00:00:00.000Z',
  added: ['new-bridge-1', 'new-bridge-2'],
  removed: ['old-bridge-1'],
  changed: [
    {
      sourceRecordId: 'bridge-3',
      name: 'ふたご橋',
      attributesChanged: ['length', 'year'],
    },
  ],
  comparable: true,
};

const auditEvent = {
  id: '00000000-0000-4000-8000-000000000501',
  occurredAt: '2026-07-19T00:30:00.000Z',
  actor: 'admin@example.com',
  action: 'source.created',
  targetType: 'source',
  targetId: 'sample-bridges',
  summary: 'ソースを登録: サンプル橋梁',
  detail: { slug: 'sample-bridges' },
  requestId: null,
  prevHash: '0'.repeat(64),
  eventHash: 'a'.repeat(64),
} as const;

const feedbackReport = {
  id: '00000000-0000-4000-8000-000000000601',
  category: 'location',
  detail: 'テスト用: 位置がずれています',
  pageUrl: 'https://pimm.example/map',
  status: 'open',
  resolutionNote: null,
  createdAt: '2026-07-19T00:40:00.000Z',
  resolvedAt: null,
};

function makeClient(overrides: Partial<AuditClient> = {}): ApiClient & AuditClient {
  return {
    startAdminIngestion: vi.fn(async () => run),
    getAdminIngestion: vi.fn(async () => detail),
    listAdminIngestions: vi.fn(async () => ({ items: [run] })),
    listAdminQualityIssues: vi.fn(async () => ({ items: [openIssue] })),
    resolveAdminQualityIssue: vi.fn(async () => ({
      ...detail.qualityIssues[0]!,
      resolutionStatus: 'accepted',
      resolvedAt: '2026-07-19T00:10:00.000Z',
    })),
    getAdminIngestionDiff: vi.fn(async () => ingestionDiff),
    listAdminAuditEvents: vi.fn(async () => ({ items: [auditEvent], valid: true })),
    listAdminFeedbackReports: vi.fn(async () => ({ items: [feedbackReport] })),
    resolveAdminFeedback: vi.fn(
      async (id: string, input: { status: 'converted'; reason: string }) => ({
        ...feedbackReport,
        status: input.status,
        resolutionNote: input.reason,
        resolvedAt: '2026-07-19T00:50:00.000Z',
      }),
    ),
    ...overrides,
  } as unknown as ApiClient & AuditClient;
}

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
  it('discloses that admin actions are protected and explicit', () => {
    setup();
    const notes = screen.getAllByRole('note');
    expect(notes[0]).toHaveTextContent(/Cloudflare Access/);
    expect(notes[0]).toHaveTextContent(/ボタン操作した場合だけ実行/);
    expect(notes[1]).toHaveTextContent(/実データの取得・DB反映は CLI/);
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

  it('starts an admin ingestion and renders the returned run detail', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    setup({ client });

    await user.click(screen.getByRole('button', { name: '取込記録' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '最新の取込記録' })).toBeInTheDocument();
    });
    expect(client.startAdminIngestion).toHaveBeenCalledWith('sample-bridges');
    expect(client.getAdminIngestion).toHaveBeenCalledWith(run.id);
    expect(screen.getByText(run.id)).toBeInTheDocument();
    expect(screen.getByText('1 件')).toBeInTheDocument();
    expect(screen.getByText('更新日が不明です')).toBeInTheDocument();
  });

  it('loads admin ingestion history and open quality issue lists', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    setup({ client });

    await user.click(screen.getByRole('button', { name: '一覧を更新' }));

    await waitFor(() => {
      expect(client.listAdminIngestions).toHaveBeenCalledWith(20);
      expect(screen.getByRole('button', { name: /sample-bridges \/ running/ })).toBeInTheDocument();
      expect(screen.getByText('公開停止中です')).toBeInTheDocument();
    });
    expect(client.listAdminQualityIssues).toHaveBeenCalledWith(50);
  });

  it('shows audit events and feedback reports after loading admin lists', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    setup({ client });

    await user.click(screen.getByRole('button', { name: '一覧を更新' }));

    await waitFor(() => {
      expect(client.listAdminAuditEvents).toHaveBeenCalledWith(30);
      expect(client.listAdminFeedbackReports).toHaveBeenCalledWith(30);
      expect(screen.getByText('✅ チェーン整合性: 正常')).toBeInTheDocument();
      expect(screen.getByText('ソースを登録: サンプル橋梁')).toBeInTheDocument();
      expect(screen.getByText('テスト用: 位置がずれています')).toBeInTheDocument();
    });
  });

  it('alerts when the audit chain is broken', async () => {
    const user = userEvent.setup();
    setup({
      client: makeClient({
        listAdminAuditEvents: vi.fn(async () => ({ items: [auditEvent], valid: false })),
      }),
    });

    await user.click(screen.getByRole('button', { name: '一覧を更新' }));

    await waitFor(() => {
      expect(screen.getByText(/チェーン整合性: 異常/)).toBeInTheDocument();
    });
  });

  it('shows an authorization message when the admin API rejects the user', async () => {
    const user = userEvent.setup();
    setup({
      client: makeClient({
        startAdminIngestion: vi.fn(async () => {
          throw new ApiError(403, 'Forbidden');
        }),
      }),
    });

    await user.click(screen.getByRole('button', { name: '取込記録' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/アクセス権がありません/);
    });
  });

  it('requires a reason before resolving a quality issue', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    setup({ client });

    await user.click(screen.getByRole('button', { name: '取込記録' }));
    await screen.findByText('更新日が不明です');

    const resolveButton = screen.getByRole('button', { name: '解決を記録' });
    expect(resolveButton).toBeDisabled();
    await user.type(screen.getByLabelText('理由'), '原典で確認済み');
    await user.selectOptions(screen.getByLabelText('解決ステータス'), 'accepted');
    await user.click(resolveButton);

    await waitFor(() => {
      expect(client.resolveAdminQualityIssue).toHaveBeenCalledWith(detail.qualityIssues[0]!.id, {
        resolutionStatus: 'accepted',
        reason: '原典で確認済み',
      });
    });
    expect(screen.getByText(/accepted/)).toBeInTheDocument();
  });

  it('shows an authorization message when resolving a quality issue is rejected', async () => {
    const user = userEvent.setup();
    setup({
      client: makeClient({
        resolveAdminQualityIssue: vi.fn(async () => {
          throw new ApiError(403, 'Forbidden');
        }),
      }),
    });

    await user.click(screen.getByRole('button', { name: '取込記録' }));
    await screen.findByText('更新日が不明です');
    await user.type(screen.getByLabelText('理由'), '確認中');
    await user.click(screen.getByRole('button', { name: '解決を記録' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /品質issueの解決には管理APIへのアクセス権/,
      );
    });
  });

  it('shows an ingestion diff for a selected source (Issue #53)', async () => {
    const user = userEvent.setup();
    const client = makeClient();
    setup({ client });

    await user.selectOptions(screen.getByLabelText('データソース'), 'sample-bridges');
    await user.click(screen.getByRole('button', { name: '差分を表示' }));

    await waitFor(() => {
      expect(client.getAdminIngestionDiff).toHaveBeenCalledWith('sample-bridges');
    });
    expect(screen.getByText('追加（2件）')).toBeInTheDocument();
    expect(screen.getByText('new-bridge-1')).toBeInTheDocument();
    expect(screen.getByText('削除・非公開（1件）')).toBeInTheDocument();
    expect(screen.getByText('old-bridge-1')).toBeInTheDocument();
    expect(screen.getByText('属性変更（1件）')).toBeInTheDocument();
    expect(screen.getByText('ふたご橋')).toBeInTheDocument();
  });

  it('shows a non-comparable message when no previous version exists', async () => {
    const user = userEvent.setup();
    setup({
      client: makeClient({
        getAdminIngestionDiff: vi.fn(async () => ({
          sourceSlug: 'sample-bridges',
          baseVersionId: null,
          targetVersionId: null,
          baseFetchedAt: null,
          targetFetchedAt: null,
          added: [],
          removed: [],
          changed: [],
          comparable: false,
        })),
      }),
    });

    await user.selectOptions(screen.getByLabelText('データソース'), 'sample-bridges');
    await user.click(screen.getByRole('button', { name: '差分を表示' }));

    await waitFor(() => {
      expect(screen.getByText(/まだ比較可能な取込バージョンがありません/)).toBeInTheDocument();
    });
  });
});
