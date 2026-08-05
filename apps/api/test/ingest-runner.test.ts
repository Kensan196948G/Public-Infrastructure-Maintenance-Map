import { describe, expect, it } from 'vitest';
import { createSampleBridgesAdapter } from '@pimm/source-adapters';
import { ingestSource, toPublishableAssets } from '../src/ingest-runner.js';

describe('toPublishableAssets', () => {
  it('keeps every accepted record publishable (geometry is non-null)', async () => {
    const result = await ingestSource(createSampleBridgesAdapter());
    const { assets, droppedCount } = await toPublishableAssets(result.accepted);
    expect(droppedCount).toBe(0);
    expect(assets.length).toBe(result.accepted.length);
    expect(assets[0]?.geometry.type).toBe('Point');
  });

  it('drops quarantined records without usable geometry', async () => {
    const result = await ingestSource(createSampleBridgesAdapter());
    expect(result.counts.quarantined).toBeGreaterThan(0);
    const { assets, droppedCount } = await toPublishableAssets(result.quarantined);
    expect(droppedCount + assets.length).toBe(result.quarantined.length);
  });

  it('derives a stable record key when the source has no id', async () => {
    const result = await ingestSource(createSampleBridgesAdapter());
    const first = await toPublishableAssets(result.accepted);
    const second = await toPublishableAssets(result.accepted);
    expect(first.assets.map((a) => a.sourceRecordId)).toEqual(
      second.assets.map((a) => a.sourceRecordId),
    );
    expect(first.assets.every((a) => a.sourceRecordId.length > 0)).toBe(true);
  });
});
