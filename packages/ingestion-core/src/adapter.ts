import type {
  AccessType,
  AssetAttribute,
  AssetType,
  Geometry,
  RedistributionPolicy,
  SourceFormat,
} from '@pimm/contracts';
import type { SupportedCrs } from './coords.js';

/** Static registration data for a source (data_sources row, FR-09). */
export interface SourceDescriptor {
  slug: string;
  name: string;
  providerName: string;
  sourceUrl: string;
  accessType: AccessType;
  format: SourceFormat;
  /** null → license unknown → Q007 (records are hidden). */
  licenseName: string | null;
  licenseUrl: string | null;
  redistribution: RedistributionPolicy;
  attributionText: string | null;
  /** Declared CRS of the source. Never guessed (要件 §7.3-4). */
  crs: SupportedCrs;
  /** Expected property keys — deviation triggers Q008 and aborts the run. */
  expectedSchemaKeys?: string[];
}

export interface FetchContext {
  /** ISO timestamp of the run start; adapters must not call Date.now themselves. */
  now: string;
  /** Conditional-GET validators from the previous run, when available. */
  etag?: string;
  lastModified?: string;
}

export interface FetchResult {
  content: string;
  contentType?: string;
  fetchedAt: string;
  etag?: string;
  lastModified?: string;
}

/** Normalized, CRS-converted record ready for quality checks. */
export interface NormalizedAsset {
  /** Provider record id; null → deterministic id is derived downstream. */
  sourceRecordId: string | null;
  assetType: AssetType;
  name: string | null;
  originalName: string | null;
  /** WGS 84 geometry; null when the source row has no usable location (Q002). */
  geometry: Geometry | null;
  prefectureCode: string | null;
  municipalityCode: string | null;
  managingAuthority: string | null;
  /** ISO 8601 or null when the source does not publish it (Q006). */
  sourceUpdatedAt: string | null;
  attributes: AssetAttribute[];
}

/** Per-source adapter contract (設計書 §6.1). */
export interface SourceAdapter<Raw> {
  descriptor: SourceDescriptor;
  fetch(context: FetchContext): Promise<FetchResult>;
  parse(input: FetchResult): Iterable<Raw>;
  normalize(record: Raw): NormalizedAsset;
  /** Property keys observed in this batch — compared against expectedSchemaKeys (Q008). */
  schemaKeys(records: readonly Raw[]): string[];
}
