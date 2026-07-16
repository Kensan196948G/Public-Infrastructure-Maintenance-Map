import { describe, expect, it } from 'vitest';
import { AssetDetailSchema, SourceInfoSchema } from '@pimm/contracts';
import {
  buildSampleSeed,
  createSampleBridgesAdapter,
  createSampleFacilitiesAdapter,
  deterministicUuid,
} from '../src/index.js';
import { getAdapterBySlug, listAdapters } from '../src/registry.js';
import { runPipeline } from '@pimm/ingestion-core';

const CTX = { now: '2026-07-16T00:00:00.000Z' };

describe('deterministicUuid', () => {
  it('is stable and RFC 4122 shaped', async () => {
    const a = await deterministicUuid('sample-bridges', 'B001');
    const b = await deterministicUuid('sample-bridges', 'B001');
    const c = await deterministicUuid('sample-bridges', 'B002');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });
});

describe('sample bridges adapter (contract test)', () => {
  it('quarantines the out-of-Japan record and keeps the rest', async () => {
    const result = await runPipeline(createSampleBridgesAdapter(), CTX);
    expect(result.aborted).toBeNull();
    expect(result.counts.fetched).toBe(10);
    const quarantinedIds = result.quarantined.map((p) => p.asset.sourceRecordId);
    expect(quarantinedIds).toEqual(['B010']); // Q003 域外
    // Duplicate pair B007/B008 must be flagged, never merged.
    const dupes = result.accepted.filter((p) => p.issues.some((i) => i.ruleCode === 'Q005'));
    expect(dupes.map((p) => p.asset.sourceRecordId).sort()).toEqual(['B007', 'B008']);
    // Unit normalization: 橋長 "124.5m" → 124.5 (m).
    const b001 = result.accepted.find((p) => p.asset.sourceRecordId === 'B001');
    expect(b001?.asset.attributes.find((a) => a.key === 'bridge_length')?.valueNumber).toBe(124.5);
  });
});

describe('sample facilities adapter (contract test)', () => {
  it('normalizes 和暦 dates, full-width digits and fixes the swapped row', async () => {
    const result = await runPipeline(createSampleFacilitiesAdapter(), CTX);
    expect(result.aborted).toBeNull();

    const byId = new Map(result.accepted.map((p) => [p.asset.sourceRecordId, p]));
    // F003: 令和8年5月10日 → 2026-05-10
    expect(byId.get('F003')?.asset.sourceUpdatedAt).toBe('2026-05-10T00:00:00.000Z');
    // F004: full-width digits parsed into a Japan-domain point.
    const f004 = byId.get('F004')?.asset.geometry;
    expect(f004?.type).toBe('Point');
    // F005: swapped columns fixed → lon must be ~139.75, not 35.67.
    const f005 = byId.get('F005')?.asset.geometry;
    expect(f005?.type === 'Point' && f005.coordinates[0]).toBeCloseTo(139.7508, 3);
    // F006: no coordinates → quarantined (Q002).
    expect(result.quarantined.map((p) => p.asset.sourceRecordId)).toEqual(['F006']);
  });
});

describe('buildSampleSeed', () => {
  it('produces schema-valid assets across 3 sources and 3 asset types', async () => {
    const seed = await buildSampleSeed();

    expect(seed.sources).toHaveLength(3);
    for (const source of seed.sources) SourceInfoSchema.parse(source);
    for (const asset of seed.assets) AssetDetailSchema.parse(asset);

    const types = new Set(seed.assets.map((a) => a.type));
    expect(types).toEqual(new Set(['bridge', 'river', 'public_facility']));

    // 受入基準3: every record carries provenance metadata.
    for (const asset of seed.assets) {
      expect(asset.source.sourceUrl).toMatch(/^https:/u);
      expect(asset.source.fetchedAt).toBeTruthy();
      expect(asset.source.licenseName.length).toBeGreaterThan(0);
      expect(asset.notices.length).toBeGreaterThan(0);
    }

    // Quality badges: B006 (no name) → reference, twins → review.
    const noName = seed.assets.find((a) => a.name === '(名称不明)');
    expect(noName?.quality.status).toBe('reference');
    const twins = seed.assets.filter((a) => a.name.startsWith('ふたご橋'));
    expect(twins).toHaveLength(2);
    expect(twins.every((t) => t.quality.status === 'review')).toBe(true);

    // Quarantined records (B010 域外, F006 座標なし) never appear.
    expect(seed.assets.some((a) => a.name.includes('域外'))).toBe(false);
    expect(seed.assets.some((a) => a.name.includes('旧庁舎'))).toBe(false);
  });

  it('is deterministic (same ids on rebuild)', async () => {
    const s1 = await buildSampleSeed();
    const s2 = await buildSampleSeed();
    expect(s1.assets.map((a) => a.id)).toEqual(s2.assets.map((a) => a.id));
  });
});

describe('registry', () => {
  it('lists seven adapters and resolves by slug', () => {
    expect(
      listAdapters()
        .map((a) => a.descriptor.slug)
        .sort(),
    ).toEqual([
      'bridge-kumamoto',
      'facility-osaka-park',
      'facility-osaka-toilet',
      'road-n13',
      'sample-bridges',
      'sample-facilities',
      'sample-rivers',
    ]);
    expect(getAdapterBySlug('sample-rivers')?.descriptor.redistribution).toBe('prohibited');
    expect(getAdapterBySlug('facility-osaka-park')?.descriptor.crs).toBe('EPSG:6668');
    expect(getAdapterBySlug('bridge-kumamoto')?.descriptor.crs).toBe('EPSG:6668');
    expect(getAdapterBySlug('road-n13')?.descriptor.redistribution).toBe('allowed');
    expect(getAdapterBySlug('nope')).toBeNull();
  });
});
