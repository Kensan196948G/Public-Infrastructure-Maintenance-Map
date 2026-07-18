import type { AssetType, Geometry, QualityIssue, QualityStatus } from '@pimm/contracts';

/**
 * Structural mirror of ingestion-core's SourceDescriptor/NormalizedAsset/ProcessedAsset —
 * database intentionally does not depend on ingestion-core (kept a one-way dependency
 * graph: apps/api depends on both and bridges them; see repository.ts for the read-side
 * equivalent of this boundary).
 */
export interface PublishableSourceDescriptor {
  slug: string;
  name: string;
  providerName: string;
  sourceUrl: string;
  accessType: string;
  format: string;
  licenseName: string | null;
  licenseUrl: string | null;
  redistribution: string;
  attributionText: string | null;
}

export interface PublishableAttribute {
  key: string;
  valueText: string | null;
  valueNumber: number | null;
  unit: string | null;
  originalValue: string | null;
  sourceLabel: string | null;
}

/** One pipeline-processed record ready for a publish decision. Geometry must be non-null — callers filter out geometry-less rejects before publishing (infrastructure_assets.geometry is NOT NULL). */
export interface PublishableAsset {
  sourceRecordId: string;
  assetType: AssetType;
  name: string | null;
  originalName: string | null;
  geometry: Geometry;
  prefectureCode: string | null;
  municipalityCode: string | null;
  managingAuthority: string | null;
  sourceUpdatedAt: string | null;
  attributes: readonly PublishableAttribute[];
  qualityStatus: QualityStatus;
  issues: readonly QualityIssue[];
}

export interface PublishInput {
  sourceId: string;
  sourceUpdatedAt: string | null;
  contentHash: string;
  schemaFingerprint: string;
  /** Total records the adapter fetched, before quality filtering (ingestion_runs.fetched_count). */
  fetchedCount: number;
  /** Quarantined-and-geometry-less records dropped before reaching this call (ingestion_runs.rejected_count). */
  droppedCount: number;
  warningCount: number;
  triggeredBy: string;
  correlationId: string;
  assets: readonly PublishableAsset[];
  /** Set when the pipeline aborted before record processing (Q008) — publish records the failed run and writes nothing else. */
  aborted: { ruleCode: string; message: string } | null;
}

export interface PublishSummary {
  ingestionRunId: string;
  datasetVersionId: string | null;
  publishedCount: number;
  hiddenCount: number;
  status: 'succeeded' | 'partial' | 'failed';
}

/**
 * Write-side port, kept separate from AssetRepository (read-side, consumed by the
 * public API). Only the ingest CLI / future scheduler calls this.
 */
export interface AssetPublisher {
  /** Upserts the data_sources row by slug and returns its id. */
  ensureDataSource(descriptor: PublishableSourceDescriptor): Promise<string>;
  /** Writes one pipeline run's results atomically: dataset_versions, infrastructure_assets, asset_attributes, quality_issues, ingestion_runs. */
  publish(input: PublishInput): Promise<PublishSummary>;
}

/**
 * A run is 'partial' when some fetched records did not end up published —
 * either dropped pre-transaction (no usable geometry) or written as hidden
 * (quality gate). Pure so the decision is unit-testable without a database.
 */
export function decideRunStatus(counts: {
  droppedCount: number;
  hiddenCount: number;
}): 'succeeded' | 'partial' {
  return counts.droppedCount > 0 || counts.hiddenCount > 0 ? 'partial' : 'succeeded';
}

/**
 * Collapses same-batch sourceRecordId collisions to one row (last-write-wins)
 * before publish() writes. Without this, two records sharing a key resolve to
 * the same (source_id, source_record_id) asset row, and their per-record
 * DELETE-then-INSERT attribute writes interleave against that one row: a second
 * insert of a shared key hits asset_attributes' (asset_id, key) primary key —
 * a duplicate-key error that aborts the whole transaction — while differing
 * keys merge two record versions instead of cleanly replacing one. Pure so the
 * collision count is unit-testable without a database.
 */
export function dedupeBySourceRecordId(assets: readonly PublishableAsset[]): {
  assets: PublishableAsset[];
  duplicateCount: number;
} {
  const deduped = [...new Map(assets.map((a) => [a.sourceRecordId, a])).values()];
  return { assets: deduped, duplicateCount: assets.length - deduped.length };
}
