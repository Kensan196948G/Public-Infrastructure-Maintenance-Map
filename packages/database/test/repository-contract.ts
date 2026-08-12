import { describe, expect, it } from 'vitest';
import type { AssetRepository } from '../src/index.js';
import { InvalidCursorError } from '../src/index.js';

export interface RepositoryContractFixture {
  repo: AssetRepository;
  ids: {
    publishedBridge: string;
    hiddenBridge: string;
    draftBridge: string;
  };
}

export function registerAssetRepositoryContract(
  name: string,
  setup: () => Promise<RepositoryContractFixture>,
) {
  describe(`${name} AssetRepository contract`, () => {
    it('reports storage readiness', async () => {
      const { repo } = await setup();
      await expect(repo.ping()).resolves.toBe(true);
    });

    it('filters visible assets by bbox', async () => {
      const { repo } = await setup();
      const res = await repo.searchAssets({ bbox: [139.0, 35.0, 140.0, 36.0], limit: 20 });

      expect(new Set(res.items.map((i) => i.name))).toEqual(
        new Set(['都心橋', '都心第二橋', 'B川']),
      );
    });

    it('filters by type and quality', async () => {
      const { repo } = await setup();

      const byType = await repo.searchAssets({ types: ['river'], limit: 20 });
      expect(byType.items.map((i) => i.name)).toEqual(['B川']);

      const byQuality = await repo.searchAssets({
        quality: ['review', 'reference'],
        limit: 20,
      });
      expect(new Set(byQuality.items.map((i) => i.name))).toEqual(new Set(['B川', 'C施設']));
    });

    it('never returns unpublished or hidden records from search or getAssetById', async () => {
      const { repo, ids } = await setup();

      const res = await repo.searchAssets({ limit: 20 });
      const names = res.items.map((i) => i.name);
      expect(names).toContain('都心橋');
      expect(names).not.toContain('下書き橋');
      expect(names).not.toContain('非公開橋');

      await expect(repo.getAssetById(ids.publishedBridge)).resolves.toMatchObject({
        id: ids.publishedBridge,
        name: '都心橋',
      });
      await expect(repo.getAssetById(ids.hiddenBridge)).resolves.toBeNull();
      await expect(repo.getAssetById(ids.draftBridge)).resolves.toBeNull();
    });

    it('supports keyword search across public fields', async () => {
      const { repo } = await setup();

      const res = await repo.searchAssets({ q: '都心', limit: 20 });
      expect(res.items.map((i) => i.name)).toEqual(['都心橋', '都心第二橋']);
    });

    it('ANDs multiple whitespace-separated keywords (Issue #50)', async () => {
      const { repo } = await setup();

      const res = await repo.searchAssets({ q: '都心 橋', limit: 20 });
      expect(res.items.map((i) => i.name)).toEqual(['都心橋', '都心第二橋']);

      const none = await repo.searchAssets({ q: '都心 川', limit: 20 });
      expect(none.items).toHaveLength(0);
    });

    it('routes a prefecture-name keyword to the spatial filter', async () => {
      const { repo } = await setup();

      const res = await repo.searchAssets({ q: '東京都', limit: 20 });
      expect(res.items.length).toBeGreaterThan(0);
      expect(res.items.every((i) => i.prefectureCode === '13')).toBe(true);
    });

    it('suggests names by occurrence count', async () => {
      const { repo } = await setup();

      const items = await repo.suggestNames('都心', 10);
      expect(new Set(items.map((i) => i.name))).toEqual(new Set(['都心橋', '都心第二橋']));
      expect(items.every((i) => i.count >= 1)).toBe(true);
    });

    it('paginates with a stable cursor and rejects malformed cursors', async () => {
      const { repo } = await setup();

      const page1 = await repo.searchAssets({ limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await repo.searchAssets({ limit: 2, cursor: page1.nextCursor! });
      expect(page2.items).toHaveLength(2);

      await expect(repo.searchAssets({ limit: 10, cursor: '!!!' })).rejects.toBeInstanceOf(
        InvalidCursorError,
      );
    });

    it('filters by updatedSince and excludes unknown update dates', async () => {
      const { repo } = await setup();

      const res = await repo.searchAssets({
        updatedSince: '2026-01-01T00:00:00.000Z',
        limit: 20,
      });
      expect(new Set(res.items.map((i) => i.name))).toEqual(new Set(['都心橋', '都心第二橋']));
    });

    it('counts visible assets by type within bbox', async () => {
      const { repo } = await setup();

      const res = await repo.countByType({ bbox: [139.0, 35.0, 140.0, 36.0] });
      expect(res.total).toBe(3);
      expect(res.byType.bridge).toBe(2);
      expect(res.byType.river).toBe(1);
      // Prefecture buckets (including 'unknown') must partition the total.
      expect(Object.values(res.byPrefecture).reduce((a, b) => a + b, 0)).toBe(res.total);
      expect(res.byPrefecture['13']).toBeGreaterThan(0);
    });

    it('lists only enabled sources', async () => {
      const { repo } = await setup();

      const sources = await repo.listSources();
      expect(sources.map((s) => s.slug)).toEqual(['contract-source']);
      expect(await repo.getSourceBySlug('disabled-source')).toBeNull();
    });

    it('exports full details bounded by limit', async () => {
      const { repo } = await setup();

      const res = await repo.exportAssets({ limit: 1 });
      expect(res).toHaveLength(1);
      expect(res[0]!.source.licenseName).toBe('CC-BY-4.0');
    });

    it('rolls up per-source operations for the ops console', async () => {
      const { repo } = await setup();

      const before = await repo.getOperationsSummary();
      // Admin view: disabled sources are listed too, ordered by slug.
      expect(before.sources.map((s) => s.slug)).toEqual(['contract-source', 'disabled-source']);
      expect(before.totals.sourceCount).toBe(2);
      expect(before.totals.enabledSourceCount).toBe(1);

      const main = before.sources[0]!;
      expect(main).toMatchObject({
        publishedCount: 4,
        draftCount: 1,
        suspendedCount: 0,
        hiddenCount: 1,
        lastRunAt: null,
        lastRunStatus: null,
        recentRunCount: 0,
        recentSucceededCount: 0,
      });
      expect(before.totals.publishedCount).toBe(4);
      expect(before.totals.hiddenCount).toBe(1);

      const run = await repo.startIngestion('contract-source', 'admin@example.com', 'ops-corr');
      expect(run).not.toBeNull();
      await repo.suspendAssetsBySource(
        'contract-source',
        { reason: '運用ダッシュボード検証' },
        'admin@example.com',
      );

      const after = await repo.getOperationsSummary();
      const mainAfter = after.sources[0]!;
      expect(mainAfter.publishedCount).toBe(0);
      expect(mainAfter.suspendedCount).toBe(4);
      expect(mainAfter.hiddenCount).toBe(1);
      expect(mainAfter.lastRunAt).not.toBeNull();
      expect(mainAfter.lastRunStatus).not.toBeNull();
      // Suspension records one open Q007 issue per asset; a backend may carry
      // additional pre-seeded open issues, so assert a lower bound only.
      expect(mainAfter.openQualityIssueCount).toBeGreaterThanOrEqual(4);
      expect(after.totals.suspendedCount).toBe(4);
      expect(after.totals.publishedCount).toBe(0);
    });

    it('suspends every published asset for a source', async () => {
      const { repo } = await setup();

      const before = await repo.searchAssets({ limit: 20 });
      expect(before.items.map((i) => i.name)).toEqual(
        expect.arrayContaining(['都心橋', '都心第二橋', 'B川', 'C施設']),
      );
      const publicCount = before.items.length;

      const result = await repo.suspendAssetsBySource(
        'contract-source',
        { reason: 'ライセンス変更のため再確認' },
        'admin@example.com',
      );
      expect(result).toMatchObject({
        sourceSlug: 'contract-source',
        publicationStatus: 'suspended',
        suspendedCount: publicCount,
      });

      const after = await repo.searchAssets({ limit: 20 });
      expect(after.items).toHaveLength(0);
    });
  });
}
