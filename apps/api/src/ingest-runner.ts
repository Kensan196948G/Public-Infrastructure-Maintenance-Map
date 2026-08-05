/**
 * Shared ingestion execution used by both the CLI (`pnpm ingest`) and the
 * Cloudflare Cron Trigger scheduler. Keeping the bridge here prevents the two
 * runners from drifting on publish semantics (record-key fallback, dropped
 * counts, aborted-run recording).
 */
import type { PublishableAsset } from '@pimm/database';
import { PostgresAssetPublisher } from '@pimm/database';
import type { PipelineResult, ProcessedAsset, SourceAdapter } from '@pimm/ingestion-core';
import { recordKey, runPipeline } from '@pimm/ingestion-core';

export async function ingestSource<Raw>(adapter: SourceAdapter<Raw>): Promise<PipelineResult> {
  return runPipeline(adapter, { now: new Date().toISOString() });
}

/**
 * Geometry-less records cannot be written (infrastructure_assets.geometry is
 * NOT NULL) so they are dropped and counted; a missing sourceRecordId instead
 * falls back to the same deterministic recordKey sample-mode seeding uses, so
 * re-publishing the same source upserts instead of duplicating.
 */
export async function toPublishableAssets(
  items: readonly ProcessedAsset[],
): Promise<{ assets: PublishableAsset[]; droppedCount: number }> {
  const assets: PublishableAsset[] = [];
  let droppedCount = 0;
  for (const { asset, qualityStatus, issues } of items) {
    if (asset.geometry === null) {
      droppedCount += 1;
      continue;
    }
    assets.push({
      sourceRecordId: await recordKey(asset),
      assetType: asset.assetType,
      name: asset.name,
      originalName: asset.originalName,
      geometry: asset.geometry,
      prefectureCode: asset.prefectureCode,
      municipalityCode: asset.municipalityCode,
      managingAuthority: asset.managingAuthority,
      sourceUpdatedAt: asset.sourceUpdatedAt,
      attributes: asset.attributes,
      qualityStatus,
      issues,
    });
  }
  return { assets, droppedCount };
}

export interface PublishIngestionInput<Raw> {
  adapter: SourceAdapter<Raw>;
  result: PipelineResult;
  databaseUrl: string;
  triggeredBy: string;
  correlationId: string;
}

export async function publishIngestion<Raw>(input: PublishIngestionInput<Raw>): Promise<{
  summary: Awaited<ReturnType<PostgresAssetPublisher['publish']>>;
  droppedCount: number;
}> {
  const publisher = new PostgresAssetPublisher(input.databaseUrl);
  const sourceId = await publisher.ensureDataSource(input.adapter.descriptor);
  const [accepted, quarantined] = await Promise.all([
    toPublishableAssets(input.result.accepted),
    toPublishableAssets(input.result.quarantined),
  ]);
  const droppedCount = accepted.droppedCount + quarantined.droppedCount;
  const summary = await publisher.publish({
    sourceId,
    sourceUpdatedAt: null,
    contentHash: input.result.contentHash,
    schemaFingerprint: input.result.schemaFingerprint,
    fetchedCount: input.result.counts.fetched,
    droppedCount,
    warningCount: input.result.counts.warnings,
    triggeredBy: input.triggeredBy,
    correlationId: input.correlationId,
    assets: [...accepted.assets, ...quarantined.assets],
    aborted: input.result.aborted,
  });
  return { summary, droppedCount };
}
