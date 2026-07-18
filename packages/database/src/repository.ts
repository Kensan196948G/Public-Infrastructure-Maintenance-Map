import type {
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
}
