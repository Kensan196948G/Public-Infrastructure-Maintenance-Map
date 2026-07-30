/**
 * Neon PostgreSQL + PostGIS repository.
 *
 * Read-side SQL is covered by the PostGIS integration suite in CI. Production
 * uses Neon HTTP; the integration suite injects a postgres.js-compatible SQL tag
 * against a disposable PostGIS service so the same repository contract is tested
 * without requiring production or preview Neon credentials.
 */
import { neon } from '@neondatabase/serverless';
import type {
  AdminAssetPublication,
  AdminCreateSource,
  AdminIngestionDetail,
  AdminIngestionList,
  AdminIngestionRun,
  AdminOperationsSummary,
  AdminQualityIssueRecord,
  AdminQualityIssueList,
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
  AssetSummary,
  AssetType,
  Geometry,
  SourceInfo,
} from '@pimm/contracts';
import { GeometrySchema, OPERATIONS_RECENT_RUN_WINDOW, summarizeOperations } from '@pimm/contracts';
import { decodeCursor, encodeCursor } from './cursor.js';
import { representativePoint } from './geo.js';
import type {
  AssetPublisher,
  PublishableSourceDescriptor,
  PublishInput,
  PublishSummary,
} from './publisher.js';
import { decideRunStatus, dedupeBySourceRecordId } from './publisher.js';
import type {
  AssetExportInput,
  AssetQueryFilters,
  AssetRepository,
  AssetSearchInput,
} from './repository.js';
import { InvalidCursorError } from './repository.js';

type Row = Record<string, unknown>;
type Sql = ReturnType<typeof neon>;
type TransactionalSql = Sql & {
  begin?: (handler: (tx: Sql) => Promise<void>) => Promise<void>;
};

/**
 * Distinct wording from sample-mode's seed.ts FIXED_NOTICES: production data
 * must never claim to be a fictional sample (Issue #2 Completion Criteria 4).
 * Frozen: callers must not mutate the shared wording.
 */
export const FIXED_NOTICES = Object.freeze([
  '本データは公開情報を機械的に整形した参考情報です。',
  '構造物の健全性・安全性・通行可否は判定していません。',
  '最新かつ正式な情報は原典および管理主体へ確認してください。',
]);

/** Escapes %, _ and backslash so user input in ILIKE cannot inject wildcards. */
export function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replace(/[%_]/g, (ch) => `\\${ch}`);
}

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

function mapAttributeRows(attrRows: readonly Row[]): AssetDetail['attributes'] {
  return attrRows.map((r) => ({
    key: String(r['key']),
    valueText: (r['value_text'] as string | null) ?? null,
    valueNumber: r['value_number'] == null ? null : Number(r['value_number']),
    unit: (r['unit'] as string | null) ?? null,
    originalValue: (r['original_value'] as string | null) ?? null,
    sourceLabel: (r['source_label'] as string | null) ?? null,
  }));
}

/** Shared detail assembly for getAssetById and exportAssets (avoids drift between the two). */
function rowToDetail(row: Row, attrRows: readonly Row[]): AssetDetail {
  const summary = rowToSummary(row);
  return {
    ...summary,
    originalName: (row['original_name'] as string | null) ?? null,
    publicationStatus: row['publication_status'] as AssetDetail['publicationStatus'],
    attributes: mapAttributeRows(attrRows),
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
    notices: [...FIXED_NOTICES],
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

function rowToAdminRun(row: Row): AdminIngestionRun {
  return {
    id: String(row['id']),
    sourceSlug: String(row['source_slug']),
    startedAt: toIso(row['started_at']) ?? new Date(0).toISOString(),
    finishedAt: toIso(row['finished_at']),
    status: row['status'] as AdminIngestionRun['status'],
    fetchedCount: Number(row['fetched_count'] ?? 0),
    acceptedCount: Number(row['accepted_count'] ?? 0),
    rejectedCount: Number(row['rejected_count'] ?? 0),
    warningCount: Number(row['warning_count'] ?? 0),
    errorCode: (row['error_code'] as string | null) ?? null,
    errorSummary: (row['error_summary'] as string | null) ?? null,
    triggeredBy: (row['triggered_by'] as string | null) ?? null,
    correlationId: (row['correlation_id'] as string | null) ?? null,
  };
}

function rowToAdminIssue(row: Row): AdminQualityIssueRecord {
  return {
    id: String(row['id']),
    assetId: (row['asset_id'] as string | null) ?? null,
    runId: (row['run_id'] as string | null) ?? null,
    ruleCode: row['rule_code'] as AdminQualityIssueRecord['ruleCode'],
    severity: row['severity'] as AdminQualityIssueRecord['severity'],
    fieldName: (row['field_name'] as string | null) ?? null,
    observedValue: (row['observed_value'] as string | null) ?? null,
    message: String(row['message']),
    resolutionStatus: row['resolution_status'] as AdminQualityIssueRecord['resolutionStatus'],
    createdAt: toIso(row['created_at']) ?? new Date(0).toISOString(),
    resolvedAt: toIso(row['resolved_at']),
  };
}

/** Builds the shared WHERE fragment. Every value is a bound parameter. */
function buildConditions(sql: Sql, filters: AssetQueryFilters) {
  const conditions = [sql`a.publication_status = 'published'`, sql`a.quality_status <> 'hidden'`];
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
  if (filters.q) {
    // Same fields as InMemoryAssetRepository.matches — keep search behavior
    // consistent across sample mode and the Postgres-backed production path.
    const pattern = '%' + escapeLikePattern(filters.q) + '%';
    conditions.push(sql`(
      a.name ILIKE ${pattern}
      OR a.original_name ILIKE ${pattern}
      OR a.managing_authority ILIKE ${pattern}
      OR a.municipality_code ILIKE ${pattern}
    )`);
  }
  return conditions.reduce((acc, c) => sql`${acc} AND ${c}`);
}

export class PostgresAssetRepository implements AssetRepository {
  private readonly sql: TransactionalSql;

  constructor(databaseUrl: string, sqlOverride?: TransactionalSql) {
    this.sql = sqlOverride ?? neon(databaseUrl);
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

  /** Full detail columns (asset + source + provenance), shared by getAssetById and exportAssets. */
  private detailSelect(filters: AssetQueryFilters) {
    const where = buildConditions(this.sql, filters);
    return this.sql`
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

    return rowToDetail(row, attrs);
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
    // Same visibility filters, grouped by prefecture for the prefecture
    // navigation menu. buildConditions is rebuilt because a neon query
    // fragment is single-use.
    const prefWhere = buildConditions(this.sql, filters);
    const prefRows = (await this.sql`
      SELECT COALESCE(a.prefecture_code, 'unknown') AS pref, count(*)::int AS n
        FROM infrastructure_assets a
       WHERE ${prefWhere}
       GROUP BY COALESCE(a.prefecture_code, 'unknown')`) as Row[];
    const byPrefecture: Record<string, number> = {};
    for (const r of prefRows) {
      byPrefecture[String(r['pref'])] = Number(r['n']);
    }
    return { total, byType, byPrefecture };
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

  async exportAssets(input: AssetExportInput): Promise<AssetDetail[]> {
    // Bulk detail + bulk attributes: 2 queries total regardless of row count,
    // instead of 2*N round-trips (each row previously called getAssetById).
    const rows = (await this.sql`
      ${this.detailSelect(input)}
      LIMIT ${input.limit}`) as Row[];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => String(r['id']));
    const attrRows = (await this.sql`
      SELECT asset_id, key, value_text, value_number, unit, original_value, source_label
        FROM asset_attributes WHERE asset_id = ANY(${ids}) ORDER BY asset_id, key`) as Row[];
    const attrsByAsset = new Map<string, Row[]>();
    for (const r of attrRows) {
      const assetId = String(r['asset_id']);
      const list = attrsByAsset.get(assetId);
      if (list) list.push(r);
      else attrsByAsset.set(assetId, [r]);
    }

    return rows.map((row) => rowToDetail(row, attrsByAsset.get(String(row['id'])) ?? []));
  }

  private async getAdminSourceBySlug(slug: string): Promise<AdminSourceResponse | null> {
    const rows = (await this.sql`
      SELECT s.*,
             (SELECT max(v.fetched_at) FROM dataset_versions v WHERE v.source_id = s.id) AS last_fetched_at,
             (SELECT max(v.source_updated_at) FROM dataset_versions v WHERE v.source_id = s.id) AS source_updated_at,
             (SELECT count(*)::int FROM infrastructure_assets a
               WHERE a.source_id = s.id AND a.publication_status = 'published'
                 AND a.quality_status <> 'hidden') AS published_asset_count
        FROM data_sources s
       WHERE s.slug = ${slug}
       LIMIT 1`) as Row[];
    const row = rows[0];
    return row ? rowToSource(row) : null;
  }

  async createSource(input: AdminCreateSource): Promise<AdminSourceResponse> {
    await this.sql`
      INSERT INTO data_sources
        (slug, name, provider_name, source_url, access_type, format, license_name,
         license_url, redistribution, attribution_text, refresh_cron, enabled)
      VALUES
        (${input.slug}, ${input.name}, ${input.providerName}, ${input.sourceUrl}, ${input.accessType},
         ${input.format}, ${input.licenseName}, ${input.licenseUrl ?? null}, ${input.redistribution},
         ${input.attributionText ?? null}, ${input.refreshCron ?? null}, ${input.enabled})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        provider_name = EXCLUDED.provider_name,
        source_url = EXCLUDED.source_url,
        access_type = EXCLUDED.access_type,
        format = EXCLUDED.format,
        license_name = EXCLUDED.license_name,
        license_url = EXCLUDED.license_url,
        redistribution = EXCLUDED.redistribution,
        attribution_text = EXCLUDED.attribution_text,
        refresh_cron = EXCLUDED.refresh_cron,
        enabled = EXCLUDED.enabled,
        updated_at = now()`;
    const source = await this.getAdminSourceBySlug(input.slug);
    if (!source) throw new Error('source upsert did not return a readable row');
    return source;
  }

  async updateSource(slug: string, input: AdminUpdateSource): Promise<AdminSourceResponse | null> {
    const current = await this.getAdminSourceBySlug(slug);
    if (!current) return null;
    await this.sql`
      UPDATE data_sources SET
        name = ${input.name ?? current.name},
        provider_name = ${input.providerName ?? current.providerName},
        source_url = ${input.sourceUrl ?? current.sourceUrl},
        access_type = ${input.accessType ?? current.accessType},
        format = ${input.format ?? current.format},
        license_name = ${input.licenseName ?? current.licenseName},
        license_url = ${input.licenseUrl === undefined ? current.licenseUrl : input.licenseUrl},
        redistribution = ${input.redistribution ?? current.redistribution},
        attribution_text = ${
          input.attributionText === undefined ? current.attributionText : input.attributionText
        },
        refresh_cron = CASE
          WHEN ${input.refreshCron === undefined} THEN refresh_cron
          ELSE ${input.refreshCron ?? null}
        END,
        enabled = ${input.enabled ?? current.enabled},
        updated_at = now()
      WHERE slug = ${slug}`;
    return this.getAdminSourceBySlug(slug);
  }

  async startIngestion(
    sourceSlug: string,
    actor: string,
    correlationId: string,
  ): Promise<AdminIngestionRun | null> {
    const sourceRows = (await this.sql`
      SELECT id FROM data_sources WHERE slug = ${sourceSlug} LIMIT 1`) as Row[];
    const sourceId = sourceRows[0]?.['id'];
    if (!sourceId) return null;
    const runId = crypto.randomUUID();
    const rows = (await this.sql`
      INSERT INTO ingestion_runs
        (id, source_id, status, triggered_by, correlation_id)
      VALUES
        (${runId}, ${String(sourceId)}, 'running', ${actor}, ${correlationId})
      RETURNING id, started_at, finished_at, status, fetched_count, accepted_count,
                rejected_count, warning_count, error_code, error_summary,
                triggered_by, correlation_id, ${sourceSlug} AS source_slug`) as Row[];
    return rowToAdminRun(rows[0]!);
  }

  async listIngestions(limit: number): Promise<AdminIngestionList> {
    const rows = (await this.sql`
      SELECT r.*, s.slug AS source_slug
        FROM ingestion_runs r
        JOIN data_sources s ON s.id = r.source_id
       ORDER BY r.started_at DESC, r.id
       LIMIT ${limit}`) as Row[];
    return { items: rows.map(rowToAdminRun) };
  }

  async getIngestionDetail(id: string): Promise<AdminIngestionDetail | null> {
    const runs = (await this.sql`
      SELECT r.*, s.slug AS source_slug
        FROM ingestion_runs r
        JOIN data_sources s ON s.id = r.source_id
       WHERE r.id = ${id}
       LIMIT 1`) as Row[];
    const run = runs[0];
    if (!run) return null;
    const issues = (await this.sql`
      SELECT id, asset_id, run_id, rule_code, severity, field_name, observed_value,
             message, resolution_status, created_at, resolved_at
        FROM quality_issues
       WHERE run_id = ${id}
       ORDER BY created_at DESC, id`) as Row[];
    return { run: rowToAdminRun(run), qualityIssues: issues.map(rowToAdminIssue) };
  }

  async listQualityIssues(limit: number): Promise<AdminQualityIssueList> {
    const rows = (await this.sql`
      SELECT id, asset_id, run_id, rule_code, severity, field_name, observed_value,
             message, resolution_status, created_at, resolved_at
        FROM quality_issues
       WHERE resolution_status = 'open'
       ORDER BY created_at DESC, id
       LIMIT ${limit}`) as Row[];
    return { items: rows.map(rowToAdminIssue) };
  }

  async getOperationsSummary(): Promise<AdminOperationsSummary> {
    // Four bounded aggregate queries (sources / assets / runs / issues) merged
    // in JS — simpler to review than one mega-join and each uses an existing
    // index. Disabled sources are included on purpose: this is the admin view.
    const sourceRows = (await this.sql`
      SELECT s.id, s.slug, s.name, s.provider_name, s.enabled,
             (SELECT max(v.fetched_at) FROM dataset_versions v WHERE v.source_id = s.id) AS last_fetched_at,
             (SELECT max(v.source_updated_at) FROM dataset_versions v WHERE v.source_id = s.id) AS source_updated_at
        FROM data_sources s
       ORDER BY s.slug`) as Row[];

    // Buckets partition every record exactly once: quarantine (quality_status
    // = 'hidden') wins over publication_status, matching the public API's
    // visibility rule and AdminSourceOperationsSchema's documented semantics.
    const assetRows = (await this.sql`
      SELECT a.source_id,
             count(*) FILTER (WHERE a.quality_status = 'hidden')::int AS hidden_count,
             count(*) FILTER (WHERE a.quality_status <> 'hidden' AND a.publication_status = 'published')::int AS published_count,
             count(*) FILTER (WHERE a.quality_status <> 'hidden' AND a.publication_status = 'draft')::int AS draft_count,
             count(*) FILTER (WHERE a.quality_status <> 'hidden' AND a.publication_status = 'suspended')::int AS suspended_count
        FROM infrastructure_assets a
       GROUP BY a.source_id`) as Row[];

    const runRows = (await this.sql`
      SELECT t.source_id, t.status, t.started_at, t.rn
        FROM (
          SELECT r.source_id, r.status, r.started_at,
                 row_number() OVER (PARTITION BY r.source_id ORDER BY r.started_at DESC, r.id DESC) AS rn
            FROM ingestion_runs r
        ) t
       WHERE t.rn <= ${OPERATIONS_RECENT_RUN_WINDOW}`) as Row[];

    const issueRows = (await this.sql`
      SELECT t.source_id,
             count(*)::int AS open_count,
             count(*) FILTER (WHERE t.severity = 'error')::int AS error_count
        FROM (
          SELECT COALESCE(a.source_id, r.source_id) AS source_id, qi.severity
            FROM quality_issues qi
            LEFT JOIN infrastructure_assets a ON a.id = qi.asset_id
            LEFT JOIN ingestion_runs r ON r.id = qi.run_id
           WHERE qi.resolution_status = 'open'
        ) t
       WHERE t.source_id IS NOT NULL
       GROUP BY t.source_id`) as Row[];

    const assetsBySource = new Map(assetRows.map((r) => [String(r['source_id']), r]));
    const issuesBySource = new Map(issueRows.map((r) => [String(r['source_id']), r]));
    const runsBySource = new Map<
      string,
      { status: string; startedAt: string | null; rn: number }[]
    >();
    for (const r of runRows) {
      const key = String(r['source_id']);
      const entry = {
        status: String(r['status']),
        startedAt: toIso(r['started_at']),
        rn: Number(r['rn']),
      };
      const list = runsBySource.get(key);
      if (list) list.push(entry);
      else runsBySource.set(key, [entry]);
    }

    const rows: AdminSourceOperations[] = sourceRows.map((s) => {
      const id = String(s['id']);
      const assets = assetsBySource.get(id);
      const issues = issuesBySource.get(id);
      const runs = (runsBySource.get(id) ?? []).sort((a, b) => a.rn - b.rn);
      const finished = runs.filter((r) => r.status !== 'running');
      const latest = runs[0];
      return {
        slug: String(s['slug']),
        name: String(s['name']),
        providerName: String(s['provider_name']),
        enabled: Boolean(s['enabled']),
        publishedCount: Number(assets?.['published_count'] ?? 0),
        draftCount: Number(assets?.['draft_count'] ?? 0),
        suspendedCount: Number(assets?.['suspended_count'] ?? 0),
        hiddenCount: Number(assets?.['hidden_count'] ?? 0),
        lastRunAt: latest?.startedAt ?? null,
        lastRunStatus: latest ? (latest.status as AdminSourceOperations['lastRunStatus']) : null,
        recentRunCount: finished.length,
        recentSucceededCount: finished.filter((r) => r.status === 'succeeded').length,
        openQualityIssueCount: Number(issues?.['open_count'] ?? 0),
        openErrorQualityIssueCount: Number(issues?.['error_count'] ?? 0),
        lastFetchedAt: toIso(s['last_fetched_at']),
        sourceUpdatedAt: toIso(s['source_updated_at']),
      };
    });
    return summarizeOperations(rows);
  }

  async resolveQualityIssue(
    id: string,
    input: AdminResolveQualityIssue,
    actor: string,
  ): Promise<AdminQualityIssueRecord | null> {
    const rows = (await this.sql`
      UPDATE quality_issues SET
        resolution_status = ${input.resolutionStatus},
        resolved_by = ${actor},
        resolved_at = now(),
        message = message || ${`\nResolution: ${input.reason}`}
      WHERE id = ${id}
      RETURNING id, asset_id, run_id, rule_code, severity, field_name, observed_value,
                message, resolution_status, created_at, resolved_at`) as Row[];
    const row = rows[0];
    return row ? rowToAdminIssue(row) : null;
  }

  async suspendAsset(
    id: string,
    input: AdminSuspendAsset,
    actor: string,
  ): Promise<AdminAssetPublication | null> {
    const updateAsset = (sql: Sql) => sql`
      UPDATE infrastructure_assets SET
        publication_status = 'suspended',
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, publication_status`;
    const insertIssue = (sql: Sql) => sql`
      INSERT INTO quality_issues
        (asset_id, rule_code, severity, field_name, observed_value, message, resolution_status)
      SELECT ${id}, 'Q007', 'warning', 'publication_status', 'suspended',
             ${`Publication suspended by ${actor}: ${input.reason}`}, 'open'
       WHERE EXISTS (SELECT 1 FROM infrastructure_assets WHERE id = ${id})`;
    let rows: Row[] = [];
    if (this.sql.begin) {
      await this.sql.begin(async (tx) => {
        rows = (await updateAsset(tx)) as Row[];
        if (rows.length > 0) await insertIssue(tx);
      });
    } else {
      const [updatedRows] = await this.sql.transaction([
        updateAsset(this.sql),
        insertIssue(this.sql),
      ]);
      rows = updatedRows as Row[];
    }
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row['id']),
      publicationStatus: row['publication_status'] as AdminAssetPublication['publicationStatus'],
      reason: input.reason,
    };
  }

  async suspendAssetsBySource(
    sourceSlug: string,
    input: AdminSuspendSourceAssets,
    actor: string,
  ): Promise<AdminSourcePublication | null> {
    const rows = (await this.sql`
      WITH selected_source AS (
        SELECT id, slug
          FROM data_sources
         WHERE slug = ${sourceSlug}
         LIMIT 1
      ),
      updated AS (
        UPDATE infrastructure_assets AS a SET
          publication_status = 'suspended',
          updated_at = now()
        FROM selected_source AS s
        WHERE a.source_id = s.id
          AND a.publication_status = 'published'
          AND a.quality_status <> 'hidden'
        RETURNING a.id, s.slug
      ),
      inserted AS (
        INSERT INTO quality_issues
          (asset_id, rule_code, severity, field_name, observed_value, message, resolution_status)
        SELECT id, 'Q007', 'warning', 'publication_status', 'suspended',
               ${`Source publication suspended by ${actor}: ${input.reason}`}, 'open'
          FROM updated
        RETURNING id
      )
      SELECT s.slug AS source_slug, count(u.id)::int AS suspended_count
        FROM selected_source AS s
        LEFT JOIN updated AS u ON true
       GROUP BY s.slug`) as Row[];
    const row = rows[0];
    if (!row) return null;
    return {
      sourceSlug: String(row['source_slug']),
      publicationStatus: 'suspended',
      suspendedCount: Number(row['suspended_count'] ?? 0),
      reason: input.reason,
    };
  }
}

/**
 * Write side of the Postgres port (see publisher.ts for the interface contract
 * and the dependency-direction rationale).
 *
 * Neon's transaction() is non-interactive — it ships a fixed batch of queries in
 * one HTTP round trip, so a query cannot branch on an earlier query's returned
 * value within the same transaction. Rather than resolve asset ids *before* the
 * transaction (which opened a TOCTOU window between the check and the write — see
 * Issue #16), child rows resolve their parent asset id by natural key
 * (source_id, source_record_id) inside the transaction, after the upsert has run.
 * That id is whatever actually persisted, so two concurrent publishes for the
 * same source can no longer attach attributes/issues to a minted-but-discarded id.
 */
/**
 * Log-safe error shape. Driver errors may expose connection details (host,
 * database, user) as own properties, so logging must be limited to
 * name/message — the same rule app.ts applies in its onError handler.
 */
function errorLogSummary(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'UnknownError', message: String(error) };
}

export class PostgresAssetPublisher implements AssetPublisher {
  private readonly sql: TransactionalSql;

  constructor(databaseUrl: string, sqlOverride?: TransactionalSql) {
    this.sql = sqlOverride ?? neon(databaseUrl);
  }

  async ensureDataSource(descriptor: PublishableSourceDescriptor): Promise<string> {
    const rows = (await this.sql`
      INSERT INTO data_sources
        (slug, name, provider_name, source_url, access_type, format,
         license_name, license_url, redistribution, attribution_text, enabled)
      VALUES
        (${descriptor.slug}, ${descriptor.name}, ${descriptor.providerName}, ${descriptor.sourceUrl},
         ${descriptor.accessType}, ${descriptor.format}, ${descriptor.licenseName},
         ${descriptor.licenseUrl}, ${descriptor.redistribution}, ${descriptor.attributionText}, true)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        provider_name = EXCLUDED.provider_name,
        source_url = EXCLUDED.source_url,
        access_type = EXCLUDED.access_type,
        format = EXCLUDED.format,
        license_name = EXCLUDED.license_name,
        license_url = EXCLUDED.license_url,
        redistribution = EXCLUDED.redistribution,
        attribution_text = EXCLUDED.attribution_text,
        updated_at = now()
      RETURNING id`) as Row[];
    return String(rows[0]!['id']);
  }

  /** Records a run that never reached record processing (pipeline aborted, e.g. Q008). Nothing else is written. */
  private async publishAborted(
    input: PublishInput,
    aborted: { ruleCode: string; message: string },
  ): Promise<PublishSummary> {
    const now = new Date().toISOString();
    const ingestionRunId = crypto.randomUUID();
    await this.sql`
      INSERT INTO ingestion_runs
        (id, source_id, started_at, finished_at, status,
         fetched_count, accepted_count, rejected_count, warning_count,
         error_code, error_summary, triggered_by, correlation_id)
      VALUES
        (${ingestionRunId}, ${input.sourceId}, ${now}, ${now}, 'failed',
         ${input.fetchedCount}, 0, ${input.fetchedCount}, ${input.warningCount},
         ${aborted.ruleCode}, ${aborted.message}, ${input.triggeredBy}, ${input.correlationId})`;
    return {
      ingestionRunId,
      datasetVersionId: null,
      publishedCount: 0,
      hiddenCount: 0,
      status: 'failed',
    };
  }

  /** Records a run whose transaction threw (constraint violation, network error, etc). */
  private async publishFailed(input: PublishInput, error: unknown): Promise<PublishSummary> {
    const now = new Date().toISOString();
    const ingestionRunId = crypto.randomUUID();
    const message = error instanceof Error ? error.message : String(error);
    await this.sql`
      INSERT INTO ingestion_runs
        (id, source_id, started_at, finished_at, status,
         fetched_count, accepted_count, rejected_count, warning_count,
         error_code, error_summary, triggered_by, correlation_id)
      VALUES
        (${ingestionRunId}, ${input.sourceId}, ${now}, ${now}, 'failed',
         ${input.fetchedCount}, 0, ${input.fetchedCount}, ${input.warningCount},
         'PUBLISH_FAILED', ${message}, ${input.triggeredBy}, ${input.correlationId})`;
    return {
      ingestionRunId,
      datasetVersionId: null,
      publishedCount: 0,
      hiddenCount: 0,
      status: 'failed',
    };
  }

  async publish(input: PublishInput): Promise<PublishSummary> {
    if (input.aborted) return this.publishAborted(input, input.aborted);

    // Same-batch sourceRecordId collisions must be collapsed before the upsert
    // (see dedupeBySourceRecordId for why); the count folds into droppedCount so
    // it stays visible in ingestion_runs instead of silently vanishing.
    const { assets: dedupedAssets, duplicateCount: duplicateInBatchCount } = dedupeBySourceRecordId(
      input.assets,
    );

    const now = new Date().toISOString();
    const datasetVersionId = crypto.randomUUID();
    const ingestionRunId = crypto.randomUUID();
    const publishedCount = dedupedAssets.filter((a) => a.qualityStatus !== 'hidden').length;
    const hiddenCount = dedupedAssets.length - publishedCount;
    const droppedCount = input.droppedCount + duplicateInBatchCount;
    const status = decideRunStatus({ droppedCount, hiddenCount });

    // Candidate ids for *new* assets only. The upsert never lists id in its
    // UPDATE SET, so an existing (source_id, source_record_id) row keeps its id
    // on conflict and this freshly minted uuid is discarded. Child rows never
    // reference these — they resolve the asset id by natural key inside the
    // transaction (assetIdByRecord), which is what makes concurrent publishes for
    // the same source safe: whichever transaction wins the ON CONFLICT race, the
    // child write reads the id that actually persisted (Issue #16).
    const newAssetIds = dedupedAssets.map(() => crypto.randomUUID());

    const buildQueries = (sql: Sql) => {
      // Scalar subquery resolving an asset's surrogate id from its natural key,
      // evaluated inside the transaction after the upsert above has run. The
      // unique (source_id, source_record_id) index guarantees at most one row.
      const assetIdByRecord = (sourceRecordId: string) => sql`(
        SELECT id FROM infrastructure_assets
         WHERE source_id = ${input.sourceId} AND source_record_id = ${sourceRecordId}
      )`;

      return [
        sql`
        INSERT INTO dataset_versions
          (id, source_id, source_updated_at, fetched_at, content_hash, schema_fingerprint,
           record_count, status)
        VALUES
          (${datasetVersionId}, ${input.sourceId}, ${input.sourceUpdatedAt}, ${now},
           ${input.contentHash}, ${input.schemaFingerprint}, ${input.fetchedCount}, 'published')`,
        ...dedupedAssets.map(
          (asset, i) => sql`
        INSERT INTO infrastructure_assets
          (id, source_id, source_record_id, asset_type, name, original_name, geometry,
           prefecture_code, municipality_code, managing_authority, source_updated_at,
           quality_status, publication_status, updated_at)
        VALUES
          (${newAssetIds[i]}, ${input.sourceId}, ${asset.sourceRecordId}, ${asset.assetType},
           ${asset.name ?? asset.originalName ?? '(名称不明)'}, ${asset.originalName},
           ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(asset.geometry)}), 4326),
           ${asset.prefectureCode}, ${asset.municipalityCode}, ${asset.managingAuthority},
           ${asset.sourceUpdatedAt}, ${asset.qualityStatus},
           ${asset.qualityStatus === 'hidden' ? 'draft' : 'published'}, ${now})
        ON CONFLICT (source_id, source_record_id) DO UPDATE SET
          asset_type = EXCLUDED.asset_type,
          name = EXCLUDED.name,
          original_name = EXCLUDED.original_name,
          geometry = EXCLUDED.geometry,
          prefecture_code = EXCLUDED.prefecture_code,
          municipality_code = EXCLUDED.municipality_code,
          managing_authority = EXCLUDED.managing_authority,
          source_updated_at = EXCLUDED.source_updated_at,
          quality_status = EXCLUDED.quality_status,
          publication_status = EXCLUDED.publication_status,
          updated_at = EXCLUDED.updated_at`,
        ),
        // Attributes are replaced wholesale per asset rather than diffed — simpler,
        // and cheap at this data volume. Deleted by natural key so the delete hits
        // the row that actually persisted, not a minted-but-discarded id.
        ...dedupedAssets.map(
          (asset) => sql`
        DELETE FROM asset_attributes WHERE asset_id = ${assetIdByRecord(asset.sourceRecordId)}`,
        ),
        ...dedupedAssets.flatMap((asset) =>
          asset.attributes.map(
            (attr) => sql`
        INSERT INTO asset_attributes
          (asset_id, key, value_text, value_number, unit, original_value, source_label)
        SELECT a.id, ${attr.key}, ${attr.valueText}, ${attr.valueNumber}, ${attr.unit},
               ${attr.originalValue}, ${attr.sourceLabel}
          FROM infrastructure_assets a
         WHERE a.source_id = ${input.sourceId} AND a.source_record_id = ${asset.sourceRecordId}`,
          ),
        ),
        sql`
        INSERT INTO ingestion_runs
          (id, source_id, dataset_version_id, started_at, finished_at, status,
           fetched_count, accepted_count, rejected_count, warning_count,
           triggered_by, correlation_id)
        VALUES
          (${ingestionRunId}, ${input.sourceId}, ${datasetVersionId}, ${now}, ${now}, ${status},
           ${input.fetchedCount}, ${publishedCount}, ${droppedCount + hiddenCount},
           ${input.warningCount}, ${input.triggeredBy}, ${input.correlationId})`,
        // Issues are appended per run, not reconciled against prior-run issues on
        // the same asset — resolution-status lifecycle management (dismiss,
        // accept, mark fixed) is the admin-console's job (Issue #4), not publish's.
        ...dedupedAssets.flatMap((asset) =>
          asset.issues.map(
            (issue) => sql`
        INSERT INTO quality_issues
          (run_id, asset_id, rule_code, severity, field_name, observed_value, message, resolution_status)
        SELECT ${ingestionRunId}, a.id, ${issue.ruleCode}, ${issue.severity},
               ${issue.fieldName}, ${issue.observedValue}, ${issue.message}, ${issue.resolutionStatus}
          FROM infrastructure_assets a
         WHERE a.source_id = ${input.sourceId} AND a.source_record_id = ${asset.sourceRecordId}`,
          ),
        ),
      ];
    };

    try {
      if (this.sql.begin) {
        await this.sql.begin(async (tx) => {
          for (const query of buildQueries(tx)) await query;
        });
      } else {
        await this.sql.transaction(buildQueries(this.sql));
      }
    } catch (error) {
      // A thrown error from Neon's HTTP transaction endpoint doesn't prove the
      // batch never committed (the response can be lost after the server
      // applied it) — check via the run id minted above before recording a
      // failure that would otherwise misreport a successful publish.
      const committed = (await this.sql`
        SELECT 1 FROM ingestion_runs WHERE id = ${ingestionRunId}`) as Row[];
      if (committed.length > 0) {
        return { ingestionRunId, datasetVersionId, publishedCount, hiddenCount, status };
      }
      try {
        return await this.publishFailed(input, error);
      } catch (recordingError) {
        // Driver errors can carry connection details (host, db, user) as extra
        // properties, so only name/message may reach the log stream (Issue #42 M-3).
        console.error('publish: failed to record failed ingestion run', {
          sourceId: input.sourceId,
          correlationId: input.correlationId,
          originalError: errorLogSummary(error),
          recordingError: errorLogSummary(recordingError),
        });
        throw error;
      }
    }

    return { ingestionRunId, datasetVersionId, publishedCount, hiddenCount, status };
  }
}

export type { Geometry };
