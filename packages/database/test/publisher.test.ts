import { describe, expect, it } from 'vitest';
import type { PublishableAsset } from '../src/publisher.js';
import { decideRunStatus, dedupeBySourceRecordId } from '../src/publisher.js';

describe('decideRunStatus', () => {
  it('is succeeded when every fetched record was published', () => {
    expect(decideRunStatus({ droppedCount: 0, hiddenCount: 0 })).toBe('succeeded');
  });

  it('is partial when records were dropped before the transaction (no usable geometry)', () => {
    expect(decideRunStatus({ droppedCount: 2, hiddenCount: 0 })).toBe('partial');
  });

  it('is partial when records were written but hidden by the quality gate', () => {
    expect(decideRunStatus({ droppedCount: 0, hiddenCount: 3 })).toBe('partial');
  });

  it('is partial when both dropped and hidden records are present', () => {
    expect(decideRunStatus({ droppedCount: 1, hiddenCount: 1 })).toBe('partial');
  });
});

function makeAsset(sourceRecordId: string, name: string | null = null): PublishableAsset {
  return {
    sourceRecordId,
    assetType: 'bridge',
    name,
    originalName: null,
    geometry: { type: 'Point', coordinates: [139.767, 35.681] },
    prefectureCode: null,
    municipalityCode: null,
    managingAuthority: null,
    sourceUpdatedAt: null,
    attributes: [],
    qualityStatus: 'verified',
    issues: [],
  };
}

describe('dedupeBySourceRecordId', () => {
  it('keeps every asset and reports no duplicates when ids are unique', () => {
    const result = dedupeBySourceRecordId([makeAsset('a'), makeAsset('b')]);
    expect(result.assets.map((a) => a.sourceRecordId)).toEqual(['a', 'b']);
    expect(result.duplicateCount).toBe(0);
  });

  it('keeps only the last record on a same-batch collision (last-write-wins)', () => {
    const stale = makeAsset('dup', '旧レコード');
    const fresh = makeAsset('dup', '新レコード');
    const result = dedupeBySourceRecordId([stale, fresh]);
    expect(result.assets).toEqual([fresh]);
    expect(result.duplicateCount).toBe(1);
  });

  it('handles an empty batch', () => {
    const result = dedupeBySourceRecordId([]);
    expect(result.assets).toEqual([]);
    expect(result.duplicateCount).toBe(0);
  });
});
