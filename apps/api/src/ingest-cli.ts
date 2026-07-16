/**
 * Ingestion dry-run CLI: `pnpm ingest --source <slug>` (root) or
 * `pnpm --filter @pimm/api ingest --source <slug>`.
 *
 * Runs the real pipeline for one source and reports counts and quality issues.
 * Publication to Neon is a follow-up (requires live-DB integration testing);
 * until then this validates sources and surfaces quality problems.
 */
import { runPipeline } from '@pimm/ingestion-core';
import { getAdapterBySlug, listAdapters } from '@pimm/source-adapters';

const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const slug = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;

if (!slug) {
  console.error('Usage: pnpm ingest --source <slug>');
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
console.log('\n✅ dry-run complete (DB publication is handled separately)');
