/**
 * Sample-mode seed: runs the real ingestion pipeline over the three sample
 * adapters and materializes AssetDetail/SourceInfo collections for the
 * in-memory repository. The API's "DB なし動作モード" is therefore exercising
 * the same code paths production ingestion will use.
 */
import type { AssetDetail, AuditEvent, FeedbackReport, SourceInfo } from '@pimm/contracts';
import { GENESIS_HASH, hashAuditEvent } from '@pimm/contracts';
import type { ProcessedAsset, SourceAdapter, SourceDescriptor } from '@pimm/ingestion-core';
import { recordKey, runPipeline } from '@pimm/ingestion-core';
import { representativePoint } from '@pimm/database';
import { deterministicUuid } from './deterministic-id.js';
import { createSampleBridgesAdapter } from './adapters/sample-bridges.js';
import { createSampleRiversAdapter } from './adapters/sample-rivers.js';
import { createSampleFacilitiesAdapter } from './adapters/sample-facilities.js';

/** Fixed timestamp keeps sample mode deterministic across restarts. */
export const SAMPLE_FETCHED_AT = '2026-07-16T00:00:00.000Z';

/**
 * Distinct wording from Postgres-mode's postgres.ts FIXED_NOTICES: sample data
 * must always disclose it is fictional (Issue #2 Completion Criteria 4).
 * Frozen: callers must not mutate the shared wording.
 */
export const FIXED_NOTICES = Object.freeze([
  '本データは検証用の架空サンプルです。実在のインフラを示しません。',
  '本システムは参考情報を提供するもので、構造物の健全性・安全性・通行可否を判定しません。',
  '最新かつ正式な情報は、必ず原典と管理主体へ確認してください。',
]);

async function toDetail(
  processed: ProcessedAsset,
  descriptor: SourceDescriptor,
): Promise<AssetDetail | null> {
  const { asset, qualityStatus, issues } = processed;
  if (asset.geometry === null) return null; // quarantined shapes never publish
  const id = await deterministicUuid(descriptor.slug, await recordKey(asset));
  return {
    id,
    type: asset.assetType,
    name: asset.name ?? '(名称不明)',
    representativePoint: representativePoint(asset.geometry),
    geometry: asset.geometry,
    prefectureCode: asset.prefectureCode,
    municipalityCode: asset.municipalityCode,
    managingAuthority: asset.managingAuthority,
    quality: {
      status: qualityStatus,
      updatedAtKnown: asset.sourceUpdatedAt !== null,
      openIssueCodes: [...new Set(issues.map((i) => i.ruleCode))],
    },
    sourceSlug: descriptor.slug,
    sourceUpdatedAt: asset.sourceUpdatedAt,
    originalName: asset.originalName,
    publicationStatus: 'published',
    attributes: asset.attributes,
    source: {
      slug: descriptor.slug,
      provider: descriptor.providerName,
      dataset: descriptor.name,
      sourceUrl: descriptor.sourceUrl,
      sourceRecordId: asset.sourceRecordId,
      fetchedAt: SAMPLE_FETCHED_AT,
      sourceUpdatedAt: asset.sourceUpdatedAt,
      licenseName: descriptor.licenseName ?? '不明',
      licenseUrl: descriptor.licenseUrl,
      redistribution: descriptor.redistribution,
    },
    notices: [...FIXED_NOTICES],
  };
}

export interface SampleSeed {
  assets: AssetDetail[];
  sources: SourceInfo[];
  /** Seeded audit events (chronological order); empty for tests that assert from-scratch state. */
  auditEvents: AuditEvent[];
  /** Seeded feedback reports (newest first); empty for tests that assert from-scratch state. */
  feedbackReports: FeedbackReport[];
}

/**
 * Builds fictional-but-valid seed audit events with a correct hash chain
 * (Issue #48). `start` is the newest-first offset used to keep UUIDs stable.
 */
export async function buildSampleAuditEvents(): Promise<AuditEvent[]> {
  const base = (n: number) => ({
    id: `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    // 各イベントは時系列で一意な発生時刻を持つ（chain の順序を固定）。
    occurredAt: `2026-07-15T0${(n % 9) + 1}:${String((n * 7) % 60).padStart(2, '0')}:00.000Z`,
  });
  const drafts: Array<
    { id: string; occurredAt: string } & Omit<
      AuditEvent,
      'id' | 'occurredAt' | 'eventHash' | 'prevHash'
    >
  > = [
    {
      ...base(1),
      actor: 'admin@example.com',
      action: 'source.created',
      targetType: 'source',
      targetId: 'sample-bridges',
      summary: 'ソースを登録: サンプル橋梁データセット',
      detail: { slug: 'sample-bridges', enabled: true },
      requestId: 'sample-seed-1',
    },
    {
      ...base(2),
      actor: 'admin@example.com',
      action: 'ingestion.started',
      targetType: 'ingestion',
      targetId: '30000000-0000-4000-8000-000000000020',
      summary: '取込を開始: sample-bridges',
      detail: { sourceSlug: 'sample-bridges' },
      requestId: 'sample-seed-2',
    },
    {
      ...base(3),
      actor: 'reviewer@example.com',
      action: 'quality.resolved',
      targetType: 'quality_issue',
      targetId: '30000000-0000-4000-8000-000000000030',
      summary: '品質issueを解決: Q006 → accepted',
      detail: { ruleCode: 'Q006', resolutionStatus: 'accepted', reason: 'サンプル確認済み' },
      requestId: 'sample-seed-3',
    },
    {
      ...base(4),
      actor: 'system',
      action: 'feedback.received',
      targetType: 'feedback',
      targetId: '30000000-0000-4000-8000-000000000040',
      summary: 'フィードバックを受付: location',
      detail: { category: 'location' },
      requestId: null,
    },
  ];
  const events: AuditEvent[] = [];
  for (const draft of drafts) {
    // 先頭は GENESIS_HASH、以降は直前イベントの eventHash へ連結する。
    const prevHash = events.length > 0 ? events[events.length - 1]!.eventHash : GENESIS_HASH;
    const eventHash = await hashAuditEvent({
      actor: draft.actor,
      action: draft.action,
      targetType: draft.targetType,
      targetId: draft.targetId,
      summary: draft.summary,
      detail: draft.detail,
      requestId: draft.requestId,
      prevHash,
    });
    events.push({
      id: draft.id,
      occurredAt: draft.occurredAt,
      actor: draft.actor,
      action: draft.action,
      targetType: draft.targetType,
      targetId: draft.targetId,
      summary: draft.summary,
      detail: draft.detail,
      requestId: draft.requestId,
      prevHash,
      eventHash,
    });
  }
  return events;
}

/** Fictional feedback reports so the admin review surface is not empty in sample mode. */
export async function buildSampleFeedbackReports(): Promise<FeedbackReport[]> {
  return [
    {
      id: '30000000-0000-4000-8000-000000000051',
      category: 'location',
      detail: 'サンプル: あおぞら橋の表示位置が実際より少し南に見えます（確認用ダミー）',
      pageUrl: 'https://pimm.example/map?types=bridge',
      status: 'open',
      resolutionNote: null,
      createdAt: '2026-07-14T09:00:00.000Z',
      resolvedAt: null,
    },
    {
      id: '30000000-0000-4000-8000-000000000052',
      category: 'link',
      detail: 'サンプル: ふたご橋の原典リンクが切れているように見えます（確認用ダミー）',
      pageUrl: null,
      status: 'converted',
      resolutionNote: '品質issue化して管理台帳へ反映済み（ダミー）',
      createdAt: '2026-07-13T15:30:00.000Z',
      resolvedAt: '2026-07-13T16:00:00.000Z',
    },
    {
      id: '30000000-0000-4000-8000-000000000053',
      category: 'other',
      detail: 'サンプル: スマートフォンで一覧が読みづらい（確認用ダミー）',
      pageUrl: 'https://pimm.example/map',
      status: 'dismissed',
      resolutionNote: '画面改善バックログへ移動（ダミー）',
      createdAt: '2026-07-12T10:00:00.000Z',
      resolvedAt: '2026-07-12T10:30:00.000Z',
    },
  ];
}

interface AdapterRun {
  descriptor: SourceDescriptor;
  accepted: ProcessedAsset[];
}

async function runAdapter<Raw>(adapter: SourceAdapter<Raw>): Promise<AdapterRun> {
  const result = await runPipeline(adapter, { now: SAMPLE_FETCHED_AT });
  if (result.aborted) {
    throw new Error(
      `sample ingestion aborted for ${adapter.descriptor.slug}: ${result.aborted.message}`,
    );
  }
  return { descriptor: adapter.descriptor, accepted: result.accepted };
}

export async function buildSampleSeed(): Promise<SampleSeed> {
  const runs: AdapterRun[] = [
    await runAdapter(createSampleBridgesAdapter()),
    await runAdapter(createSampleRiversAdapter()),
    await runAdapter(createSampleFacilitiesAdapter()),
  ];

  const assets: AssetDetail[] = [];
  const sources: SourceInfo[] = [];

  for (const run of runs) {
    let published = 0;
    for (const processed of run.accepted) {
      const detail = await toDetail(processed, run.descriptor);
      if (detail) {
        assets.push(detail);
        published += 1;
      }
    }
    const d = run.descriptor;
    sources.push({
      slug: d.slug,
      name: d.name,
      providerName: d.providerName,
      sourceUrl: d.sourceUrl,
      accessType: d.accessType,
      format: d.format,
      licenseName: d.licenseName ?? '不明',
      licenseUrl: d.licenseUrl,
      redistribution: d.redistribution,
      attributionText: d.attributionText,
      refreshCron: null,
      enabled: true,
      lastFetchedAt: SAMPLE_FETCHED_AT,
      sourceUpdatedAt: null,
      publishedAssetCount: published,
    });
  }

  return {
    assets,
    sources,
    auditEvents: await buildSampleAuditEvents(),
    feedbackReports: await buildSampleFeedbackReports(),
  };
}
