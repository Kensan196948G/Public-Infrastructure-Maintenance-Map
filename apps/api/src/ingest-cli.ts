/**
 * Ingestion CLI: `pnpm ingest --source <slug> [--publish]` (root) or
 * `pnpm --filter @pimm/api ingest --source <slug> [--publish]`.
 *
 * Always runs the real pipeline for one source and reports counts and
 * quality issues. With `--publish` (requires DATABASE_URL) it also writes
 * the run to Neon: data_sources / dataset_versions / infrastructure_assets /
 * asset_attributes / quality_issues / ingestion_runs (Issue #5).
 */
import { getAdapterBySlug, listAdapters } from '@pimm/source-adapters/registry';
import { ingestSource, publishIngestion } from './ingest-runner.js';

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
const selectedAdapter = adapter;

const databaseUrl = process.env['DATABASE_URL'];
if (shouldPublish && !databaseUrl) {
  console.error('❌ --publish には DATABASE_URL 環境変数が必要です');
  process.exit(1);
}

async function main(): Promise<void> {
  const result = await ingestSource(selectedAdapter);

  console.log(
    `\n📥 source: ${selectedAdapter.descriptor.slug} (${selectedAdapter.descriptor.name})`,
  );
  console.log(
    `🔢 fetched=${result.counts.fetched} accepted=${result.counts.accepted} quarantined=${result.counts.quarantined} warnings=${result.counts.warnings}`,
  );
  console.log(
    `#️⃣  contentHash=${result.contentHash.slice(0, 12)}… schemaFingerprint=${result.schemaFingerprint.slice(0, 12)}…`,
  );

  if (result.aborted) {
    console.error(`🚨 aborted: [${result.aborted.ruleCode}] ${result.aborted.message}`);
    if (shouldPublish && databaseUrl) {
      await publishIngestion({
        adapter: selectedAdapter,
        result,
        databaseUrl,
        triggeredBy: 'cli',
        correlationId: crypto.randomUUID(),
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
    const { summary } = await publishIngestion({
      adapter: selectedAdapter,
      result,
      databaseUrl,
      triggeredBy: 'cli',
      correlationId: crypto.randomUUID(),
    });

    console.log(
      `\n📤 publish: runId=${summary.ingestionRunId} status=${summary.status} published=${summary.publishedCount} hidden=${summary.hiddenCount}`,
    );
    if (summary.status === 'failed') process.exit(2);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ ingest failed: ${message}`);
  process.exit(1);
});
