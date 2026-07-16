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
  bbox?: BBox;
  types?: AssetType[];
  q?: string;
  prefectureCode?: string;
  municipalityCode?: string;
  quality?: QualityStatus[];
  updatedSince?: string;
}

export interface AssetSearchInput extends AssetQueryFilters {
  limit: number;
  cursor?: string;
}

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
  /** Same filters as search, bounded by limit; license control happens in the API layer. */
  exportAssets(input: AssetSearchInput): Promise<AssetDetail[]>;
}
