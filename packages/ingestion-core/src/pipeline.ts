/**
 * Ingestion pipeline (設計書 §6): fetch → parse → normalize → validate →
 * dedup-flag → status assignment. Publishing (DB write) happens outside —
 * this stage is pure so it can be exhaustively unit-tested.
 */
import type { QualityIssue, QualityStatus } from '@pimm/contracts';
import type { FetchContext, NormalizedAsset, SourceAdapter } from './adapter.js';
import { findDuplicateCandidates } from './dedup.js';
import { contentHash, schemaFingerprint } from './fingerprint.js';
import { assignQualityStatus, checkRecord } from './quality.js';

export interface ProcessedAsset {
  asset: NormalizedAsset;
  qualityStatus: QualityStatus;
  issues: QualityIssue[];
}

export interface PipelineResult {
  /** Publishable records (badge verified/review/reference). */
  accepted: ProcessedAsset[];
  /** Error-bearing records kept out of the published layer (隔離). */
  quarantined: ProcessedAsset[];
  /** Set when the run aborted before record processing (Q008). */
  aborted: { ruleCode: 'Q008'; message: string } | null;
  contentHash: string;
  schemaFingerprint: string;
  counts: {
    fetched: number;
    accepted: number;
    quarantined: number;
    warnings: number;
  };
}

export async function runPipeline<Raw>(
  adapter: SourceAdapter<Raw>,
  context: FetchContext,
): Promise<PipelineResult> {
  const fetched = await adapter.fetch(context);
  const records = [...adapter.parse(fetched)];
  const hash = await contentHash(fetched.content);
  const observedKeys = adapter.schemaKeys(records);
  const observedFingerprint = await schemaFingerprint(observedKeys);

  // Q008 — schema drift stops the whole run before any record is processed.
  if (adapter.descriptor.expectedSchemaKeys) {
    const expectedFingerprint = await schemaFingerprint(adapter.descriptor.expectedSchemaKeys);
    if (expectedFingerprint !== observedFingerprint) {
      return {
        accepted: [],
        quarantined: [],
        aborted: {
          ruleCode: 'Q008',
          message: `スキーマ変更を検出しました: expected [${[...adapter.descriptor.expectedSchemaKeys].sort().join(', ')}] observed [${[...new Set(observedKeys)].sort().join(', ')}]`,
        },
        contentHash: hash,
        schemaFingerprint: observedFingerprint,
        counts: { fetched: records.length, accepted: 0, quarantined: 0, warnings: 0 },
      };
    }
  }

  const normalized = records.map((r) => adapter.normalize(r));
  const perRecord = normalized.map((asset) => {
    const { issues, geometry } = checkRecord(asset, adapter.descriptor);
    return { asset: { ...asset, geometry }, issues };
  });

  // Q005 — duplicate candidates flagged on both members of each pair.
  const duplicates = findDuplicateCandidates(perRecord.map((p) => p.asset));
  for (const pair of duplicates) {
    for (const index of [pair.indexA, pair.indexB]) {
      perRecord[index]?.issues.push({
        ruleCode: 'Q005',
        severity: 'warning',
        fieldName: null,
        observedValue: `${Math.round(pair.distanceMeters)}m`,
        message: '重複候補が検出されました（同種別・同名称・近接）',
        resolutionStatus: 'open',
      });
    }
  }

  const accepted: ProcessedAsset[] = [];
  const quarantined: ProcessedAsset[] = [];
  let warnings = 0;
  for (const { asset, issues } of perRecord) {
    const qualityStatus = assignQualityStatus(issues);
    warnings += issues.filter((i) => i.severity === 'warning').length;
    (qualityStatus === 'hidden' ? quarantined : accepted).push({ asset, qualityStatus, issues });
  }

  return {
    accepted,
    quarantined,
    aborted: null,
    contentHash: hash,
    schemaFingerprint: observedFingerprint,
    counts: {
      fetched: records.length,
      accepted: accepted.length,
      quarantined: quarantined.length,
      warnings,
    },
  };
}
