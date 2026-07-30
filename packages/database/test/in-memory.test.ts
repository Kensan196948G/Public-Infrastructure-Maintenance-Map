import { describe, expect, it } from 'vitest';
import { InMemoryAssetRepository, InvalidCursorError } from '../src/index.js';
import { makeAsset, makeSource } from './helpers.js';
import { registerAssetRepositoryContract } from './repository-contract.js';

function repoWith(assets: ReturnType<typeof makeAsset>[]) {
  return new InMemoryAssetRepository({
    assets,
    sources: [
      makeSource({ slug: 'sample-bridges' }),
      makeSource({ slug: 'disabled', enabled: false }),
    ],
  });
}

registerAssetRepositoryContract('InMemoryAssetRepository', async () => {
  const publishedBridge = makeAsset({
    name: '都心橋',
    lon: 139.7,
    lat: 35.68,
    sourceSlug: 'contract-source',
    sourceUpdatedAt: '2026-06-01T00:00:00.000Z',
  });
  const secondBridge = makeAsset({
    name: '都心第二橋',
    lon: 139.8,
    lat: 35.69,
    sourceSlug: 'contract-source',
    sourceUpdatedAt: '2026-06-02T00:00:00.000Z',
  });
  const river = makeAsset({
    name: 'B川',
    type: 'river',
    lon: 139.75,
    lat: 35.67,
    quality: 'review',
    sourceSlug: 'contract-source',
    sourceUpdatedAt: '2020-01-01T00:00:00.000Z',
  });
  const facility = makeAsset({
    name: 'C施設',
    type: 'public_facility',
    lon: 135.5,
    lat: 34.7,
    quality: 'reference',
    sourceSlug: 'contract-source',
    sourceUpdatedAt: null,
  });
  const hiddenBridge = makeAsset({
    name: '非公開橋',
    lon: 139.71,
    lat: 35.681,
    quality: 'hidden',
    sourceSlug: 'contract-source',
  });
  const draftBridge = makeAsset({
    name: '下書き橋',
    lon: 139.72,
    lat: 35.682,
    published: false,
    sourceSlug: 'contract-source',
  });

  return {
    repo: new InMemoryAssetRepository({
      assets: [publishedBridge, secondBridge, river, facility, hiddenBridge, draftBridge],
      sources: [
        makeSource({ slug: 'contract-source' }),
        makeSource({ slug: 'disabled-source', enabled: false }),
      ],
    }),
    ids: {
      publishedBridge: publishedBridge.id,
      hiddenBridge: hiddenBridge.id,
      draftBridge: draftBridge.id,
    },
  };
});

describe('InMemoryAssetRepository.searchAssets', () => {
  it('filters by bbox', async () => {
    const repo = repoWith([
      makeAsset({ name: '都心橋', lon: 139.7, lat: 35.68 }),
      makeAsset({ name: '北海道橋', lon: 141.35, lat: 43.06 }),
    ]);
    const res = await repo.searchAssets({ bbox: [139.0, 35.0, 140.0, 36.0], limit: 10 });
    expect(res.items.map((i) => i.name)).toEqual(['都心橋']);
  });

  it('filters by type and quality', async () => {
    const repo = repoWith([
      makeAsset({ name: 'A橋', type: 'bridge', quality: 'verified' }),
      makeAsset({ name: 'B川', type: 'river', quality: 'review' }),
      makeAsset({ name: 'C施設', type: 'public_facility', quality: 'reference' }),
    ]);
    const byType = await repo.searchAssets({ types: ['river'], limit: 10 });
    expect(byType.items.map((i) => i.name)).toEqual(['B川']);
    const byQuality = await repo.searchAssets({ quality: ['review', 'reference'], limit: 10 });
    expect(byQuality.items.map((i) => i.name).sort()).toEqual(['B川', 'C施設']);
  });

  it('never returns unpublished or hidden records', async () => {
    const repo = repoWith([
      makeAsset({ name: '公開橋' }),
      makeAsset({ name: '下書き橋', published: false }),
      makeAsset({ name: '非公開橋', quality: 'hidden' }),
    ]);
    const res = await repo.searchAssets({ limit: 10 });
    expect(res.items.map((i) => i.name)).toEqual(['公開橋']);
    const [hidden] = (await Promise.all([
      repo.getAssetById((await repo.searchAssets({ limit: 10 })).items[0]!.id),
    ])) as [unknown];
    expect(hidden).not.toBeNull();
  });

  it('supports keyword search with width/case folding', async () => {
    const repo = repoWith([
      makeAsset({ name: 'みらい大橋' }),
      makeAsset({ name: 'ＭＩＲＡＩタワー' }),
    ]);
    const res = await repo.searchAssets({ q: 'mirai', limit: 10 });
    expect(res.items.map((i) => i.name)).toEqual(['ＭＩＲＡＩタワー']);
  });

  it('paginates with a stable cursor', async () => {
    const assets = ['あ橋', 'い橋', 'う橋', 'え橋', 'お橋'].map((name) => makeAsset({ name }));
    const repo = repoWith(assets);
    const page1 = await repo.searchAssets({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await repo.searchAssets({ limit: 2, cursor: page1.nextCursor! });
    const page3 = await repo.searchAssets({ limit: 2, cursor: page2.nextCursor! });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
    const all = [...page1.items, ...page2.items, ...page3.items].map((i) => i.name);
    expect(new Set(all).size).toBe(5);
  });

  it('throws InvalidCursorError for garbage cursors', async () => {
    const repo = repoWith([makeAsset({ name: 'A橋' })]);
    await expect(repo.searchAssets({ limit: 10, cursor: '!!!' })).rejects.toBeInstanceOf(
      InvalidCursorError,
    );
  });

  it('filters by updatedSince and excludes unknown update dates', async () => {
    const repo = repoWith([
      makeAsset({ name: '新橋', sourceUpdatedAt: '2026-06-01T00:00:00.000Z' }),
      makeAsset({ name: '旧橋', sourceUpdatedAt: '2020-01-01T00:00:00.000Z' }),
      makeAsset({ name: '不明橋', sourceUpdatedAt: null }),
    ]);
    const res = await repo.searchAssets({ updatedSince: '2026-01-01T00:00:00.000Z', limit: 10 });
    expect(res.items.map((i) => i.name)).toEqual(['新橋']);
  });
});

describe('InMemoryAssetRepository.countByType', () => {
  it('counts visible assets by type within bbox', async () => {
    const repo = repoWith([
      makeAsset({ name: 'A橋', type: 'bridge' }),
      makeAsset({ name: 'B橋', type: 'bridge' }),
      makeAsset({ name: 'C川', type: 'river' }),
      makeAsset({ name: '遠い橋', type: 'bridge', lon: 141.35, lat: 43.06 }),
    ]);
    const res = await repo.countByType({ bbox: [139.0, 35.0, 140.0, 36.0] });
    expect(res.total).toBe(3);
    expect(res.byType.bridge).toBe(2);
    expect(res.byType.river).toBe(1);
  });
});

describe('sources', () => {
  it('lists only enabled sources', async () => {
    const repo = repoWith([]);
    const sources = await repo.listSources();
    expect(sources.map((s) => s.slug)).toEqual(['sample-bridges']);
    expect(await repo.getSourceBySlug('disabled')).toBeNull();
  });
});

describe('admin lists', () => {
  it('lists ingestion history and open quality issues', async () => {
    const asset = makeAsset({ name: '管理対象橋' });
    const repo = repoWith([asset]);

    const run = await repo.startIngestion('sample-bridges', 'admin@example.com', 'req-admin-1');
    expect(run).not.toBeNull();
    await repo.suspendAsset(asset.id, { reason: '公開停止テスト' }, 'admin@example.com');

    await expect(repo.listIngestions(10)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: run!.id, sourceSlug: 'sample-bridges' })],
    });
    await expect(repo.listQualityIssues(10)).resolves.toMatchObject({
      items: [expect.objectContaining({ assetId: asset.id, ruleCode: 'Q007' })],
    });
  });

  it('computes run success rate and attributes issues to sources in the ops rollup', async () => {
    const asset = makeAsset({ name: '運用対象橋' });
    const repo = repoWith([asset]);

    await repo.startIngestion('sample-bridges', 'admin@example.com', 'req-ops-1');
    await repo.startIngestion('sample-bridges', 'admin@example.com', 'req-ops-2');
    // Creates an open warning issue linked to the asset (→ sample-bridges).
    await repo.suspendAsset(asset.id, { reason: '運用検証' }, 'admin@example.com');

    const summary = await repo.getOperationsSummary();
    expect(summary.recentRunWindow).toBeGreaterThan(0);
    expect(summary.sources.map((s) => s.slug)).toEqual(['disabled', 'sample-bridges']);

    const bridges = summary.sources.find((s) => s.slug === 'sample-bridges')!;
    // InMemory startIngestion finishes runs synchronously as 'succeeded'.
    expect(bridges.recentRunCount).toBe(2);
    expect(bridges.recentSucceededCount).toBe(2);
    expect(bridges.lastRunStatus).toBe('succeeded');
    expect(bridges.suspendedCount).toBe(1);
    expect(bridges.openQualityIssueCount).toBe(1);
    expect(bridges.openErrorQualityIssueCount).toBe(0);

    const disabled = summary.sources.find((s) => s.slug === 'disabled')!;
    expect(disabled.openQualityIssueCount).toBe(0);
    expect(disabled.recentRunCount).toBe(0);
  });
});

describe('exportAssets', () => {
  it('returns full details bounded by limit', async () => {
    const repo = repoWith([makeAsset({ name: 'A橋' }), makeAsset({ name: 'B橋' })]);
    const res = await repo.exportAssets({ limit: 1 });
    expect(res).toHaveLength(1);
    expect(res[0]!.source.licenseName).toBe('CC-BY-4.0');
  });

  it('is a single bounded pull with no cursor pagination (Issue #9)', async () => {
    // Export takes AssetExportInput (no cursor): a generous limit returns every
    // match in one call, so there is no cursor to respect or accidentally ignore.
    const repo = repoWith([
      makeAsset({ name: 'A橋' }),
      makeAsset({ name: 'B橋' }),
      makeAsset({ name: 'C橋' }),
    ]);
    const res = await repo.exportAssets({ limit: 1000 });
    expect(res).toHaveLength(3);
  });
});
