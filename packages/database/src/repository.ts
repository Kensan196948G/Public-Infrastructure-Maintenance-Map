import type {
  AdminAssetPublication,
  AdminCreateSource,
  AdminIngestionDetail,
  AdminIngestionList,
  AdminIngestionRun,
  AdminQualityIssueList,
  AdminResolveQualityIssue,
  AdminSourceResponse,
  AdminSourcePublication,
  AdminSuspendAsset,
  AdminSuspendSourceAssets,
  AdminUpdateSource,
  AssetCountSummary,
  AssetDetail,
  AssetSearchResponse,
  AssetType,
  BBox,
  QualityStatus,
  SourceInfo,
} from '@pimm/contracts';

/** Filters shared by search / summary / export. */
export interface AssetQueryFilters {
  bbox?: BBox | undefined;
  types?: AssetType[] | undefined;
  q?: string | undefined;
  prefectureCode?: string | undefined;
  municipalityCode?: string | undefined;
  quality?: QualityStatus[] | undefined;
  updatedSince?: string | undefined;
}

export interface AssetSearchInput extends AssetQueryFilters {
  limit: number;
  cursor?: string | undefined;
}

/**
 * Export is a single bounded bulk pull (limit is capped at the API layer), not a
 * cursor-paginated read — so it deliberately has no cursor. Modeled as its own
 * type so a cursor cannot be passed and silently ignored (Issue #9).
 */
export type AssetExportInput = Omit<AssetSearchInput, 'cursor'>;

/** Thrown for malformed cursors so the API can answer 400 instead of 500. */
export class InvalidCursorError extends Error {
  constructor() {
    super('invalid cursor');
    this.name = 'InvalidCursorError';
  }
}

/**
 * Storage abstraction consumed by the API layer.
 * Implementations: InMemoryAssetRepository (sample mode / tests),
 * PostgresAssetRepository (Neon + PostGIS, production).
 * Contract: only publication_status='published' AND quality_status<>'hidden'
 * records are ever returned.
 */
export interface AssetRepository {
  searchAssets(input: AssetSearchInput): Promise<AssetSearchResponse>;
  getAssetById(id: string): Promise<AssetDetail | null>;
  countByType(filters: Pick<AssetQueryFilters, 'bbox' | 'types'>): Promise<AssetCountSummary>;
  listSources(): Promise<SourceInfo[]>;
  getSourceBySlug(slug: string): Promise<SourceInfo | null>;
  /** Same filters as search, bounded by limit (no pagination); license control happens in the API layer. */
  exportAssets(input: AssetExportInput): Promise<AssetDetail[]>;

  /**
   * Admin surface (Issue #4 / FR-13 / FR-14).
   * These methods are only reachable through /api/v1/admin/* after
   * Cloudflare Access identity and role checks in the API layer.
   */
  createSource(input: AdminCreateSource): Promise<AdminSourceResponse>;
  updateSource(slug: string, input: AdminUpdateSource): Promise<AdminSourceResponse | null>;
  startIngestion(
    sourceSlug: string,
    actor: string,
    correlationId: string,
  ): Promise<AdminIngestionRun | null>;
  listIngestions(limit: number): Promise<AdminIngestionList>;
  getIngestionDetail(id: string): Promise<AdminIngestionDetail | null>;
  listQualityIssues(limit: number): Promise<AdminQualityIssueList>;
  resolveQualityIssue(
    id: string,
    input: AdminResolveQualityIssue,
    actor: string,
  ): Promise<AdminIngestionDetail['qualityIssues'][number] | null>;
  suspendAsset(
    id: string,
    input: AdminSuspendAsset,
    actor: string,
  ): Promise<AdminAssetPublication | null>;
  suspendAssetsBySource(
    sourceSlug: string,
    input: AdminSuspendSourceAssets,
    actor: string,
  ): Promise<AdminSourcePublication | null>;
}
