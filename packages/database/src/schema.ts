/**
 * Drizzle table definitions mirroring migrations/0001_init.sql.
 * PostGIS geometry uses a custom type; spatial predicates are written
 * as explicit SQL in postgres.ts (設計書 §2: PostGIS 部分は明示 SQL).
 */
import {
  boolean,
  char,
  customType,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** GeoJSON in application code, `geometry(Geometry,4326)` in PostGIS. */
const geometry = customType<{ data: unknown }>({
  dataType() {
    return 'geometry(Geometry,4326)';
  },
});

export const dataSources = pgTable('data_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: text('name').notNull(),
  providerName: text('provider_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  accessType: varchar('access_type', { length: 20 }).notNull(),
  format: varchar('format', { length: 30 }).notNull(),
  licenseName: text('license_name').notNull(),
  licenseUrl: text('license_url'),
  redistribution: varchar('redistribution', { length: 20 }).notNull().default('unknown'),
  attributionText: text('attribution_text'),
  refreshCron: text('refresh_cron'),
  enabled: boolean('enabled').notNull().default(false),
  configJson: jsonb('config_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const datasetVersions = pgTable('dataset_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => dataSources.id),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  contentHash: char('content_hash', { length: 64 }).notNull(),
  schemaFingerprint: char('schema_fingerprint', { length: 64 }).notNull(),
  rawReference: text('raw_reference'),
  recordCount: integer('record_count'),
  status: varchar('status', { length: 20 }).notNull().default('fetched'),
});

export const infrastructureAssets = pgTable(
  'infrastructure_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => dataSources.id),
    sourceRecordId: text('source_record_id').notNull(),
    assetType: varchar('asset_type', { length: 30 }).notNull(),
    name: text('name').notNull(),
    originalName: text('original_name'),
    geometry: geometry('geometry').notNull(),
    prefectureCode: char('prefecture_code', { length: 2 }),
    municipalityCode: char('municipality_code', { length: 5 }),
    managingAuthority: text('managing_authority'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    qualityStatus: varchar('quality_status', { length: 20 }).notNull().default('review'),
    publicationStatus: varchar('publication_status', { length: 20 }).notNull().default('draft'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_assets_source_record').on(t.sourceId, t.sourceRecordId)],
);

export const assetAttributes = pgTable('asset_attributes', {
  assetId: uuid('asset_id')
    .notNull()
    .references(() => infrastructureAssets.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 100 }).notNull(),
  valueText: text('value_text'),
  valueNumber: numeric('value_number'),
  unit: varchar('unit', { length: 20 }),
  originalValue: text('original_value'),
  sourceLabel: text('source_label'),
});

export const ingestionRuns = pgTable('ingestion_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => dataSources.id),
  datasetVersionId: uuid('dataset_version_id').references(() => datasetVersions.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  fetchedCount: integer('fetched_count').notNull().default(0),
  acceptedCount: integer('accepted_count').notNull().default(0),
  rejectedCount: integer('rejected_count').notNull().default(0),
  warningCount: integer('warning_count').notNull().default(0),
  errorCode: varchar('error_code', { length: 50 }),
  errorSummary: text('error_summary'),
  triggeredBy: text('triggered_by'),
  correlationId: text('correlation_id'),
});

export const qualityIssues = pgTable('quality_issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => ingestionRuns.id),
  assetId: uuid('asset_id').references(() => infrastructureAssets.id, { onDelete: 'cascade' }),
  ruleCode: varchar('rule_code', { length: 10 }).notNull(),
  severity: varchar('severity', { length: 10 }).notNull(),
  fieldName: text('field_name'),
  observedValue: text('observed_value'),
  message: text('message').notNull(),
  resolutionStatus: varchar('resolution_status', { length: 20 }).notNull().default('open'),
  resolvedBy: text('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
