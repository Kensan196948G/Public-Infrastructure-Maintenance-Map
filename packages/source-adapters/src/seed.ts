/**
 * Sample-mode seed: runs the real ingestion pipeline over the three sample
 * adapters and materializes AssetDetail/SourceInfo collections for the
 * in-memory repository. The API's "DB なし動作モード" is therefore exercising
 * the same code paths production ingestion will use.
 */
import type { AssetDetail, SourceInfo } from '@pimm/contracts';
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
 */
export const FIXED_NOTICES = [
  '本データは検証用の架空サンプルです。実在のインフラを示しません。',
  '本システムは参考情報を提供するもので、構造物の健全性・安全性・通行可否を判定しません。',
  '最新かつ正式な情報は、必ず原典と管理主体へ確認してください。',
];

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
    notices: FIXED_NOTICES,
  };
}

export interface SampleSeed {
  assets: AssetDetail[];
  sources: SourceInfo[];
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
      enabled: true,
      lastFetchedAt: SAMPLE_FETCHED_AT,
      sourceUpdatedAt: null,
      publishedAssetCount: published,
    });
  }

  return { assets, sources };
}
