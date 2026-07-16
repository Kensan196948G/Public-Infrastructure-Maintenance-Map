/**
 * Ingestion CLI: `pnpm ingest --source <slug> [--publish]` (root) or
 * `pnpm --filter @pimm/api ingest --source <slug> [--publish]`.
 *
 * Always runs the real pipeline for one source and reports counts and
 * quality issues. With `--publish` (requires DATABASE_URL) it also writes
 * the run to Neon: data_sources / dataset_versions / infrastructure_assets /
 * asset_attributes / quality_issues / ingestion_runs (Issue #5).
 */
import type { PublishableAsset } from '@pimm/database';
import { PostgresAssetPublisher } from '@pimm/database';
import type { ProcessedAsset } from '@pimm/ingestion-core';
import { recordKey, runPipeline } from '@pimm/ingestion-core';
import { getAdapterBySlug, listAdapters } from '@pimm/source-adapters';

/**
 * Geometry-less records cannot be written (infrastructure_assets.geometry is
 * NOT NULL) so they are dropped and counted; a missing sourceRecordId instead
 * falls back to the same deterministic recordKey sample-mode seeding uses, so
 * re-publishing the same source upserts instead of duplicating.
 */
async function toPublishableAssets(items: readonly ProcessedAsset[]): Promise<{
  assets: PublishableAsset[];
  droppedCount: number;
}> {
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

const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const slug = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;
const shouldPublish = args.includes('--publish');

if (!slug) {
  console.error('Usage: pnpm ingest --source <slug> [--publish]');
  console.error(
    `Available sources: ${listAdapters()
      .map((a) => a.descriptor.slug)
      .join(', ')}`,
  );
  process.exit(1);
}

const adapter = getAdapterBySlug(slug);
if (!adapter) {
  console.error(`❌ unknown source: ${slug}`);
  process.exit(1);
}

const databaseUrl = process.env['DATABASE_URL'];
if (shouldPublish && !databaseUrl) {
  console.error('❌ --publish には DATABASE_URL 環境変数が必要です');
  process.exit(1);
}

const result = await runPipeline(adapter, { now: new Date().toISOString() });

console.log(`\n📥 source: ${adapter.descriptor.slug} (${adapter.descriptor.name})`);
console.log(
  `🔢 fetched=${result.counts.fetched} accepted=${result.counts.accepted} quarantined=${result.counts.quarantined} warnings=${result.counts.warnings}`,
);
console.log(
  `#️⃣  contentHash=${result.contentHash.slice(0, 12)}… schemaFingerprint=${result.schemaFingerprint.slice(0, 12)}…`,
);

if (result.aborted) {
  console.error(`🚨 aborted: [${result.aborted.ruleCode}] ${result.aborted.message}`);
  if (shouldPublish && databaseUrl) {
    const publisher = new PostgresAssetPublisher(databaseUrl);
    const sourceId = await publisher.ensureDataSource(adapter.descriptor);
    await publisher.publish({
      sourceId,
      sourceUpdatedAt: null,
      contentHash: result.contentHash,
      schemaFingerprint: result.schemaFingerprint,
      fetchedCount: result.counts.fetched,
      droppedCount: 0,
      warningCount: 0,
      triggeredBy: 'cli',
      correlationId: crypto.randomUUID(),
      assets: [],
      aborted: result.aborted,
    });
  }
  process.exit(2);
}

for (const item of [...result.accepted, ...result.quarantined]) {
  for (const issue of item.issues) {
    const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(
      `${icon} [${issue.ruleCode}] ${item.asset.sourceRecordId ?? '(no id)'} ${item.asset.name ?? '(名称不明)'}: ${issue.message}`,
    );
  }
}

if (!shouldPublish || !databaseUrl) {
  console.log('\n✅ dry-run complete (DB publication skipped — pass --publish to write to Neon)');
} else {
  const publisher = new PostgresAssetPublisher(databaseUrl);
  const sourceId = await publisher.ensureDataSource(adapter.descriptor);
  const { assets: acceptedAssets, droppedCount: droppedAccepted } = await toPublishableAssets(
    result.accepted,
  );
  const { assets: quarantinedAssets, droppedCount: droppedQuarantined } = await toPublishableAssets(
    result.quarantined,
  );

  const summary = await publisher.publish({
    sourceId,
    sourceUpdatedAt: null,
    contentHash: result.contentHash,
    schemaFingerprint: result.schemaFingerprint,
    fetchedCount: result.counts.fetched,
    droppedCount: droppedAccepted + droppedQuarantined,
    warningCount: result.counts.warnings,
    triggeredBy: 'cli',
    correlationId: crypto.randomUUID(),
    assets: [...acceptedAssets, ...quarantinedAssets],
    aborted: null,
  });

  console.log(
    `\n📤 publish: runId=${summary.ingestionRunId} status=${summary.status} published=${summary.publishedCount} hidden=${summary.hiddenCount}`,
  );
  if (summary.status === 'failed') process.exit(2);
}
