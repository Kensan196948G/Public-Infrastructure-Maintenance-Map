/**
 * Neon PostgreSQL + PostGIS repository.
 *
 * ⚠️ Compile-checked but NOT yet integration-tested against a live database
 * (no local PostGIS in the build environment). Tracked as a known limitation;
 * run the integration suite against a Neon branch before first production use.
 */
import { neon } from '@neondatabase/serverless';
import type {
  AssetCountSummary,
  AssetDetail,
  AssetSearchResponse,
  AssetSummary,
  AssetType,
  Geometry,
  SourceInfo,
} from '@pimm/contracts';
import { GeometrySchema } from '@pimm/contracts';
import { decodeCursor, encodeCursor } from './cursor.js';
import { representativePoint } from './geo.js';
import type { AssetQueryFilters, AssetRepository, AssetSearchInput } from './repository.js';
import { InvalidCursorError } from './repository.js';

type Row = Record<string, unknown>;
type Sql = ReturnType<typeof neon>;

const FIXED_NOTICES = [
  '本データは公開情報を機械的に整形した参考情報です。',
  '構造物の健全性・安全性・通行可否は判定していません。',
  '最新かつ正式な情報は原典および管理主体へ確認してください。',
];

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return new Date(value).toISOString();
  return null;
}

function rowToSummary(row: Row): AssetSummary {
  const geometry = GeometrySchema.parse(JSON.parse(String(row['geometry_geojson'])));
  return {
    id: String(row['id']),
    type: row['asset_type'] as AssetSummary['type'],
    name: String(row['name']),
    representativePoint: representativePoint(geometry),
    geometry,
    prefectureCode: (row['prefecture_code'] as string | null) ?? null,
    municipalityCode: (row['municipality_code'] as string | null) ?? null,
    managingAuthority: (row['managing_authority'] as string | null) ?? null,
    quality: {
      status: row['quality_status'] as AssetSummary['quality']['status'],
      updatedAtKnown: row['source_updated_at'] != null,
      openIssueCodes: (row['open_issue_codes'] as string[] | null) ?? [],
    },
    sourceSlug: String(row['source_slug']),
    sourceUpdatedAt: toIso(row['source_updated_at']),
  };
}

function rowToSource(row: Row): SourceInfo {
  return {
    slug: String(row['slug']),
    name: String(row['name']),
    providerName: String(row['provider_name']),
    sourceUrl: String(row['source_url']),
    accessType: row['access_type'] as SourceInfo['accessType'],
    format: row['format'] as SourceInfo['format'],
    licenseName: String(row['license_name']),
    licenseUrl: (row['license_url'] as string | null) ?? null,
    redistribution: row['redistribution'] as SourceInfo['redistribution'],
    attributionText: (row['attribution_text'] as string | null) ?? null,
    enabled: Boolean(row['enabled']),
    lastFetchedAt: toIso(row['last_fetched_at']),
    sourceUpdatedAt: toIso(row['source_updated_at']),
    publishedAssetCount: Number(row['published_asset_count'] ?? 0),
  };
}

/** Builds the shared WHERE fragment. Every value is a bound parameter. */
function buildConditions(sql: Sql, filters: AssetQueryFilters) {
  const conditions = [
    sql`a.publication_status = 'published'`,
    sql`a.quality_status <> 'hidden'`,
  ];
  if (filters.bbox) {
    const [minLon, minLat, maxLon, maxLat] = filters.bbox;
    conditions.push(
      sql`ST_Intersects(a.geometry, ST_MakeEnvelope(${minLon}, ${minLat}, ${maxLon}, ${maxLat}, 4326))`,
    );
  }
  if (filters.types && filters.types.length > 0) {
    conditions.push(sql`a.asset_type = ANY(${filters.types})`);
  }
  if (filters.quality && filters.quality.length > 0) {
    conditions.push(sql`a.quality_status = ANY(${filters.quality})`);
  }
  if (filters.prefectureCode) conditions.push(sql`a.prefecture_code = ${filters.prefectureCode}`);
  if (filters.municipalityCode)
    conditions.push(sql`a.municipality_code = ${filters.municipalityCode}`);
  if (filters.updatedSince) conditions.push(sql`a.source_updated_at >= ${filters.updatedSince}`);
  if (filters.q) conditions.push(sql`a.name ILIKE ${'%' + filters.q + '%'}`);
  return conditions.reduce((acc, c) => sql`${acc} AND ${c}`);
}

export class PostgresAssetRepository implements AssetRepository {
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  private summarySelect(filters: AssetQueryFilters) {
    const where = buildConditions(this.sql, filters);
    return this.sql`
      SELECT a.id, a.asset_type, a.name, a.prefecture_code, a.municipality_code,
             a.managing_authority, a.quality_status, a.source_updated_at,
             ST_AsGeoJSON(a.geometry) AS geometry_geojson,
             s.slug AS source_slug,
             COALESCE(
               (SELECT array_agg(DISTINCT qi.rule_code)
                  FROM quality_issues qi
                 WHERE qi.asset_id = a.id AND qi.resolution_status = 'open'),
               '{}'
             ) AS open_issue_codes
        FROM infrastructure_assets a
        JOIN data_sources s ON s.id = a.source_id
       WHERE ${where}
       ORDER BY a.name, a.id`;
  }

  async searchAssets(input: AssetSearchInput): Promise<AssetSearchResponse> {
    const offset = input.cursor === undefined ? 0 : decodeCursor(input.cursor)?.offset;
    if (offset === undefined) throw new InvalidCursorError();
    const rows = (await this.sql`
      ${this.summarySelect(input)}
      LIMIT ${input.limit + 1} OFFSET ${offset}`) as Row[];
    const hasMore = rows.length > input.limit;
    const items = rows.slice(0, input.limit).map(rowToSummary);
    return {
      items,
      nextCursor: hasMore ? encodeCursor({ offset: offset + input.limit }) : null,
    };
  }

  async getAssetById(id: string): Promise<AssetDetail | null> {
    const rows = (await this.sql`
      SELECT a.*, ST_AsGeoJSON(a.geometry) AS geometry_geojson,
             s.slug AS source_slug, s.provider_name, s.name AS dataset_name,
             s.source_url, s.license_name, s.license_url, s.redistribution,
             (SELECT max(v.fetched_at) FROM dataset_versions v WHERE v.source_id = s.id) AS fetched_at,
             COALESCE(
               (SELECT array_agg(DISTINCT qi.rule_code)
                  FROM quality_issues qi
                 WHERE qi.asset_id = a.id AND qi.resolution_status = 'open'),
               '{}'
             ) AS open_issue_codes
        FROM infrastructure_assets a
        JOIN data_sources s ON s.id = a.source_id
       WHERE a.id = ${id}
         AND a.publication_status = 'published'
         AND a.quality_status <> 'hidden'`) as Row[];
    const row = rows[0];
    if (!row) return null;

    const attrs = (await this.sql`
      SELECT key, value_text, value_number, unit, original_value, source_label
        FROM asset_attributes WHERE asset_id = ${id} ORDER BY key`) as Row[];

    const summary = rowToSummary(row);
    return {
      ...summary,
      originalName: (row['original_name'] as string | null) ?? null,
      publicationStatus: row['publication_status'] as AssetDetail['publicationStatus'],
      attributes: attrs.map((r) => ({
        key: String(r['key']),
        valueText: (r['value_text'] as string | null) ?? null,
        valueNumber: r['value_number'] == null ? null : Number(r['value_number']),
        unit: (r['unit'] as string | null) ?? null,
        originalValue: (r['original_value'] as string | null) ?? null,
        sourceLabel: (r['source_label'] as string | null) ?? null,
      })),
      source: {
        slug: String(row['source_slug']),
        provider: String(row['provider_name']),
        dataset: String(row['dataset_name']),
        sourceUrl: String(row['source_url']),
        sourceRecordId: (row['source_record_id'] as string | null) ?? null,
        fetchedAt: toIso(row['fetched_at']) ?? new Date(0).toISOString(),
        sourceUpdatedAt: toIso(row['source_updated_at']),
        licenseName: String(row['license_name']),
        licenseUrl: (row['license_url'] as string | null) ?? null,
        redistribution: row['redistribution'] as AssetDetail['source']['redistribution'],
      },
      notices: FIXED_NOTICES,
    };
  }

  async countByType(
    filters: Pick<AssetQueryFilters, 'bbox' | 'types'>,
  ): Promise<AssetCountSummary> {
    const where = buildConditions(this.sql, filters);
    const rows = (await this.sql`
      SELECT a.asset_type, count(*)::int AS n
        FROM infrastructure_assets a
       WHERE ${where}
       GROUP BY a.asset_type`) as Row[];
    const byType: Partial<Record<AssetType, number>> = {};
    let total = 0;
    for (const r of rows) {
      const n = Number(r['n']);
      byType[r['asset_type'] as AssetType] = n;
      total += n;
    }
    return { total, byType };
  }

  async listSources(): Promise<SourceInfo[]> {
    const rows = (await this.sql`
      SELECT s.*,
             (SELECT max(v.fetched_at) FROM dataset_versions v WHERE v.source_id = s.id) AS last_fetched_at,
             (SELECT max(v.source_updated_at) FROM dataset_versions v WHERE v.source_id = s.id) AS source_updated_at,
             (SELECT count(*)::int FROM infrastructure_assets a
               WHERE a.source_id = s.id AND a.publication_status = 'published'
                 AND a.quality_status <> 'hidden') AS published_asset_count
        FROM data_sources s
       WHERE s.enabled
       ORDER BY s.slug`) as Row[];
    return rows.map(rowToSource);
  }

  async getSourceBySlug(slug: string): Promise<SourceInfo | null> {
    const sources = await this.listSources();
    return sources.find((s) => s.slug === slug) ?? null;
  }

  async exportAssets(input: AssetSearchInput): Promise<AssetDetail[]> {
    const rows = (await this.sql`
      ${this.summarySelect(input)}
      LIMIT ${input.limit}`) as Row[];
    const details = await Promise.all(rows.map((r) => this.getAssetById(String(r['id']))));
    return details.filter((d): d is AssetDetail => d !== null);
  }
}

export type { Geometry };
