import { describe, expect, it } from 'vitest';
import { InMemoryAssetRepository, InvalidCursorError } from '../src/index.js';
import { makeAsset, makeSource } from './helpers.js';

function repoWith(assets: ReturnType<typeof makeAsset>[]) {
  return new InMemoryAssetRepository({
    assets,
    sources: [makeSource({ slug: 'sample-bridges' }), makeSource({ slug: 'disabled', enabled: false })],
  });
}

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
      repo.getAssetById(
        (await repo.searchAssets({ limit: 10 })).items[0]!.id,
      ),
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

describe('exportAssets', () => {
  it('returns full details bounded by limit', async () => {
    const repo = repoWith([makeAsset({ name: 'A橋' }), makeAsset({ name: 'B橋' })]);
    const res = await repo.exportAssets({ limit: 1 });
    expect(res).toHaveLength(1);
    expect(res[0]!.source.licenseName).toBe('CC-BY-4.0');
  });
});
