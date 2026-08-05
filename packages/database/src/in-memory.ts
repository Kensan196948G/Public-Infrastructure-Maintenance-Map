import type {
  AdminAssetPublication,
  AdminCreateSource,
  AdminIngestionDetail,
  AdminIngestionList,
  AdminIngestionRun,
  AdminOperationsSummary,
  AdminQualityIssueList,
  AdminQualityIssueRecord,
  AdminResolveQualityIssue,
  AdminSourceOperations,
  AdminSourceResponse,
  AdminSourcePublication,
  AdminSuspendAsset,
  AdminSuspendSourceAssets,
  AdminUpdateSource,
  AssetCountSummary,
  AssetDetail,
  AssetSearchResponse,
  AssetType,
  SourceInfo,
  SuggestItem,
} from '@pimm/contracts';
import {
  OPERATIONS_RECENT_RUN_WINDOW,
  prefectureCodeForKeyword,
  summarizeOperations,
} from '@pimm/contracts';
import { decodeCursor, encodeCursor, type CursorPayload } from './cursor.js';
import { bboxIntersects, geometryBBox } from './geo.js';
import type {
  AssetExportInput,
  AssetQueryFilters,
  AssetRepository,
  AssetSearchInput,
} from './repository.js';
import { InvalidCursorError } from './repository.js';

/** Case/width-insensitive match target for keyword search. */
function searchable(text: string | null | undefined): string {
  return (text ?? '').normalize('NFKC').toLowerCase();
}

function matches(asset: AssetDetail, filters: AssetQueryFilters): boolean {
  if (filters.bbox && !bboxIntersects(geometryBBox(asset.geometry), filters.bbox)) return false;
  if (filters.types && !filters.types.includes(asset.type)) return false;
  if (filters.quality && !filters.quality.includes(asset.quality.status)) return false;
  if (filters.prefectureCode && asset.prefectureCode !== filters.prefectureCode) return false;
  if (filters.municipalityCode && asset.municipalityCode !== filters.municipalityCode) return false;
  if (filters.updatedSince) {
    if (!asset.sourceUpdatedAt) return false;
    // Compare as instants, not strings: differing (but equivalent) ISO offsets
    // — e.g. "+09:00" vs "Z", or "Z" vs ".000Z" — sort incorrectly as text.
    if (Date.parse(asset.sourceUpdatedAt) < Date.parse(filters.updatedSince)) return false;
  }
  if (filters.q) {
    const tokens = searchable(filters.q).split(/\s+/u).filter(Boolean);
    const haystack = [
      asset.name,
      asset.originalName,
      asset.managingAuthority,
      asset.municipalityCode,
    ]
      .map(searchable)
      .join('\n');
    for (const token of tokens) {
      // A prefecture name routes to the spatial filter, not a name match.
      const prefCode = prefectureCodeForKeyword(token);
      if (prefCode) {
        if (asset.prefectureCode !== prefCode) return false;
      } else if (!haystack.includes(token)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Keyset comparison against the (name asc, id asc) sort order used by the
 * constructor's sort. Must stay in sync with that comparator.
 */
function compareForCursor(a: Pick<AssetDetail, 'name' | 'id'>, cursor: CursorPayload): number {
  const byName = a.name.localeCompare(cursor.name, 'ja');
  return byName !== 0 ? byName : a.id.localeCompare(cursor.id);
}

/**
 * Repository backed by plain arrays. Powers sample mode and unit tests.
 * Visibility contract (published + not hidden) is enforced at construction
 * and in every read path.
 */
export class InMemoryAssetRepository implements AssetRepository {
  private readonly assets: AssetDetail[];
  private readonly sources: SourceInfo[];
  private readonly ingestionRuns: AdminIngestionRun[] = [];
  private readonly qualityIssues: AdminQualityIssueRecord[] = [];

  constructor(seed: { assets: AssetDetail[]; sources: SourceInfo[] }) {
    this.assets = [...seed.assets].sort(
      (a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id),
    );
    this.sources = [...seed.sources].sort((a, b) => a.slug.localeCompare(b.slug));
  }

  private visibleAssets(): AssetDetail[] {
    return this.assets.filter(
      (a) => a.publicationStatus === 'published' && a.quality.status !== 'hidden',
    );
  }

  async searchAssets(input: AssetSearchInput): Promise<AssetSearchResponse> {
    let filtered = this.visibleAssets().filter((a) => matches(a, input));
    if (input.cursor !== undefined) {
      const cursor = decodeCursor(input.cursor);
      if (!cursor) throw new InvalidCursorError();
      // Keyset: only rows strictly after the last-seen (name, id).
      filtered = filtered.filter((a) => compareForCursor(a, cursor) > 0);
    }
    const page = filtered.slice(0, input.limit);
    const last = page[page.length - 1];
    const summaries = page.map(
      ({
        originalName: _o,
        publicationStatus: _p,
        attributes: _a,
        source: _s,
        notices: _n,
        ...summary
      }) => summary,
    );
    return {
      items: summaries,
      nextCursor:
        filtered.length > input.limit && last
          ? encodeCursor({ name: last.name, id: last.id })
          : null,
    };
  }

  getAssetById(id: string): Promise<AssetDetail | null> {
    return Promise.resolve(this.visibleAssets().find((a) => a.id === id) ?? null);
  }

  countByType(filters: Pick<AssetQueryFilters, 'bbox' | 'types'>): Promise<AssetCountSummary> {
    const byType: Partial<Record<AssetType, number>> = {};
    const byPrefecture: Record<string, number> = {};
    let total = 0;
    for (const asset of this.visibleAssets()) {
      if (!matches(asset, filters)) continue;
      total += 1;
      byType[asset.type] = (byType[asset.type] ?? 0) + 1;
      const pref = asset.prefectureCode ?? 'unknown';
      byPrefecture[pref] = (byPrefecture[pref] ?? 0) + 1;
    }
    return Promise.resolve({ total, byType, byPrefecture });
  }

  listSources(): Promise<SourceInfo[]> {
    return Promise.resolve(this.sources.filter((s) => s.enabled));
  }

  getSourceBySlug(slug: string): Promise<SourceInfo | null> {
    return Promise.resolve(this.sources.find((s) => s.slug === slug && s.enabled) ?? null);
  }

  suggestNames(q: string, limit: number): Promise<SuggestItem[]> {
    const needle = searchable(q);
    const counts = new Map<string, number>();
    for (const asset of this.visibleAssets()) {
      const name = asset.name.trim();
      if (name.length > 0 && searchable(name).includes(needle)) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    return Promise.resolve(
      [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
        .slice(0, limit),
    );
  }

  exportAssets(input: AssetExportInput): Promise<AssetDetail[]> {
    const filtered = this.visibleAssets().filter((a) => matches(a, input));
    return Promise.resolve(filtered.slice(0, input.limit));
  }

  createSource(input: AdminCreateSource): Promise<AdminSourceResponse> {
    const source: SourceInfo = {
      slug: input.slug,
      name: input.name,
      providerName: input.providerName,
      sourceUrl: input.sourceUrl,
      accessType: input.accessType,
      format: input.format,
      licenseName: input.licenseName,
      licenseUrl: input.licenseUrl ?? null,
      redistribution: input.redistribution,
      attributionText: input.attributionText ?? null,
      refreshCron: input.refreshCron ?? null,
      enabled: input.enabled,
      lastFetchedAt: null,
      sourceUpdatedAt: null,
      publishedAssetCount: 0,
    };
    const existingIndex = this.sources.findIndex((s) => s.slug === input.slug);
    if (existingIndex >= 0) this.sources[existingIndex] = source;
    else this.sources.push(source);
    this.sources.sort((a, b) => a.slug.localeCompare(b.slug));
    return Promise.resolve(source);
  }

  updateSource(slug: string, input: AdminUpdateSource): Promise<AdminSourceResponse | null> {
    const source = this.sources.find((s) => s.slug === slug);
    if (!source) return Promise.resolve(null);
    const updated: SourceInfo = {
      ...source,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.providerName !== undefined ? { providerName: input.providerName } : {}),
      ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.accessType !== undefined ? { accessType: input.accessType } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      ...(input.licenseName !== undefined ? { licenseName: input.licenseName } : {}),
      ...(input.licenseUrl !== undefined ? { licenseUrl: input.licenseUrl } : {}),
      ...(input.redistribution !== undefined ? { redistribution: input.redistribution } : {}),
      ...(input.attributionText !== undefined ? { attributionText: input.attributionText } : {}),
      ...(input.refreshCron !== undefined ? { refreshCron: input.refreshCron } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    };
    this.sources[this.sources.indexOf(source)] = updated;
    return Promise.resolve(updated);
  }

  startIngestion(
    sourceSlug: string,
    actor: string,
    correlationId: string,
  ): Promise<AdminIngestionRun | null> {
    const source = this.sources.find((s) => s.slug === sourceSlug);
    if (!source) return Promise.resolve(null);
    const now = new Date().toISOString();
    const run: AdminIngestionRun = {
      id: crypto.randomUUID(),
      sourceSlug,
      startedAt: now,
      finishedAt: now,
      status: 'succeeded',
      fetchedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      warningCount: 0,
      errorCode: null,
      errorSummary: null,
      triggeredBy: actor,
      correlationId,
    };
    this.ingestionRuns.unshift(run);
    return Promise.resolve(run);
  }

  listIngestions(limit: number): Promise<AdminIngestionList> {
    return Promise.resolve({ items: this.ingestionRuns.slice(0, limit) });
  }

  getIngestionDetail(id: string): Promise<AdminIngestionDetail | null> {
    const run = this.ingestionRuns.find((r) => r.id === id);
    if (!run) return Promise.resolve(null);
    return Promise.resolve({
      run,
      qualityIssues: this.qualityIssues.filter((q) => q.runId === id),
    });
  }

  listQualityIssues(limit: number): Promise<AdminQualityIssueList> {
    return Promise.resolve({
      items: this.qualityIssues.filter((q) => q.resolutionStatus === 'open').slice(0, limit),
    });
  }

  getOperationsSummary(): Promise<AdminOperationsSummary> {
    // this.ingestionRuns is newest-first (unshift), so per-source lists stay ordered.
    const runsBySlug = new Map<string, AdminIngestionRun[]>();
    for (const run of this.ingestionRuns) {
      const list = runsBySlug.get(run.sourceSlug);
      if (list) list.push(run);
      else runsBySlug.set(run.sourceSlug, [run]);
    }
    // An issue belongs to the source of its asset, else of its run — the same
    // COALESCE(asset.source_id, run.source_id) rule as the Postgres backend.
    const issueSourceSlug = (issue: AdminQualityIssueRecord): string | null => {
      if (issue.assetId) {
        return this.assets.find((a) => a.id === issue.assetId)?.source.slug ?? null;
      }
      if (issue.runId) {
        return this.ingestionRuns.find((r) => r.id === issue.runId)?.sourceSlug ?? null;
      }
      return null;
    };
    const openIssues = this.qualityIssues.filter((q) => q.resolutionStatus === 'open');

    const rows: AdminSourceOperations[] = this.sources.map((source) => {
      let published = 0;
      let draft = 0;
      let suspended = 0;
      let hidden = 0;
      for (const asset of this.assets) {
        if (asset.source.slug !== source.slug) continue;
        if (asset.quality.status === 'hidden') hidden += 1;
        else if (asset.publicationStatus === 'published') published += 1;
        else if (asset.publicationStatus === 'draft') draft += 1;
        else suspended += 1;
      }
      const recentRuns = (runsBySlug.get(source.slug) ?? []).slice(0, OPERATIONS_RECENT_RUN_WINDOW);
      const finished = recentRuns.filter((r) => r.status !== 'running');
      const issues = openIssues.filter((q) => issueSourceSlug(q) === source.slug);
      return {
        slug: source.slug,
        name: source.name,
        providerName: source.providerName,
        enabled: source.enabled,
        publishedCount: published,
        draftCount: draft,
        suspendedCount: suspended,
        hiddenCount: hidden,
        lastRunAt: recentRuns[0]?.startedAt ?? null,
        lastRunStatus: recentRuns[0]?.status ?? null,
        recentRunCount: finished.length,
        recentSucceededCount: finished.filter((r) => r.status === 'succeeded').length,
        openQualityIssueCount: issues.length,
        openErrorQualityIssueCount: issues.filter((q) => q.severity === 'error').length,
        lastFetchedAt: source.lastFetchedAt,
        sourceUpdatedAt: source.sourceUpdatedAt,
      };
    });
    return Promise.resolve(summarizeOperations(rows));
  }

  resolveQualityIssue(
    id: string,
    input: AdminResolveQualityIssue,
    actor: string,
  ): Promise<AdminQualityIssueRecord | null> {
    const issue = this.qualityIssues.find((q) => q.id === id);
    if (!issue) return Promise.resolve(null);
    issue.resolutionStatus = input.resolutionStatus;
    issue.resolvedAt = new Date().toISOString();
    issue.message = `${issue.message}\nResolution by ${actor}: ${input.reason}`;
    return Promise.resolve(issue);
  }

  suspendAsset(
    id: string,
    input: AdminSuspendAsset,
    actor: string,
  ): Promise<AdminAssetPublication | null> {
    const asset = this.assets.find((a) => a.id === id);
    if (!asset) return Promise.resolve(null);
    asset.publicationStatus = 'suspended';
    asset.quality.openIssueCodes = Array.from(new Set([...asset.quality.openIssueCodes, 'Q007']));
    this.qualityIssues.unshift({
      id: crypto.randomUUID(),
      assetId: id,
      runId: null,
      ruleCode: 'Q007',
      severity: 'warning',
      fieldName: 'publication_status',
      observedValue: 'suspended',
      message: `Publication suspended by ${actor}: ${input.reason}`,
      resolutionStatus: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    });
    return Promise.resolve({ id, publicationStatus: 'suspended', reason: input.reason });
  }

  suspendAssetsBySource(
    sourceSlug: string,
    input: AdminSuspendSourceAssets,
    actor: string,
  ): Promise<AdminSourcePublication | null> {
    const source = this.sources.find((s) => s.slug === sourceSlug);
    if (!source) return Promise.resolve(null);
    const targets = this.assets.filter(
      (a) =>
        a.source.slug === sourceSlug &&
        a.publicationStatus === 'published' &&
        a.quality.status !== 'hidden',
    );
    for (const asset of targets) {
      asset.publicationStatus = 'suspended';
      asset.quality.openIssueCodes = Array.from(new Set([...asset.quality.openIssueCodes, 'Q007']));
      this.qualityIssues.unshift({
        id: crypto.randomUUID(),
        assetId: asset.id,
        runId: null,
        ruleCode: 'Q007',
        severity: 'warning',
        fieldName: 'publication_status',
        observedValue: 'suspended',
        message: `Source publication suspended by ${actor}: ${input.reason}`,
        resolutionStatus: 'open',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      });
    }
    return Promise.resolve({
      sourceSlug,
      publicationStatus: 'suspended',
      suspendedCount: targets.length,
      reason: input.reason,
    });
  }
}
