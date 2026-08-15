import { z } from 'zod';
import {
  AccessTypeSchema,
  IngestionRunStatusSchema,
  PublicationStatusSchema,
  QualityResolutionSchema,
  QualityRuleCodeSchema,
  QualitySeveritySchema,
  RedistributionPolicySchema,
  SourceFormatSchema,
} from './enums.js';
import { SourceInfoSchema } from './source.js';

export const AdminRoleSchema = z.enum(['admin', 'reviewer']);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

export const AdminCreateSourceSchema = z.object({
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be URL-safe kebab-case'),
  name: z.string().min(1),
  providerName: z.string().min(1),
  sourceUrl: z.httpUrl(),
  accessType: AccessTypeSchema,
  format: SourceFormatSchema,
  licenseName: z.string().min(1),
  licenseUrl: z.httpUrl().nullable().optional(),
  redistribution: RedistributionPolicySchema,
  attributionText: z.string().nullable().optional(),
  refreshCron: z.string().nullable().optional(),
  enabled: z.boolean().default(false),
});
export type AdminCreateSource = z.infer<typeof AdminCreateSourceSchema>;

export const AdminUpdateSourceSchema = z
  .object({
    name: z.string().min(1).optional(),
    providerName: z.string().min(1).optional(),
    sourceUrl: z.httpUrl().optional(),
    accessType: AccessTypeSchema.optional(),
    format: SourceFormatSchema.optional(),
    licenseName: z.string().min(1).optional(),
    licenseUrl: z.httpUrl().nullable().optional(),
    redistribution: RedistributionPolicySchema.optional(),
    attributionText: z.string().nullable().optional(),
    refreshCron: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'at least one field is required');
export type AdminUpdateSource = z.infer<typeof AdminUpdateSourceSchema>;

export const AdminResolveQualityIssueSchema = z.object({
  resolutionStatus: QualityResolutionSchema.exclude(['open']),
  reason: z.string().trim().min(1).max(500),
});
export type AdminResolveQualityIssue = z.infer<typeof AdminResolveQualityIssueSchema>;

export const AdminSuspendAssetSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type AdminSuspendAsset = z.infer<typeof AdminSuspendAssetSchema>;

export const AdminSuspendSourceAssetsSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type AdminSuspendSourceAssets = z.infer<typeof AdminSuspendSourceAssetsSchema>;

export const AdminIngestionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminIngestionListQuery = z.infer<typeof AdminIngestionListQuerySchema>;

export const AdminQualityIssueListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AdminQualityIssueListQuery = z.infer<typeof AdminQualityIssueListQuerySchema>;

/** Audit-trail listing (Issue #48): newest `limit` events. */
export const AdminAuditEventListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AdminAuditEventListQuery = z.infer<typeof AdminAuditEventListQuerySchema>;

export const AdminIngestionRunSchema = z.object({
  id: z.uuid(),
  sourceSlug: z.string(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  status: IngestionRunStatusSchema,
  fetchedCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorSummary: z.string().nullable(),
  triggeredBy: z.string().nullable(),
  correlationId: z.string().nullable(),
});
export type AdminIngestionRun = z.infer<typeof AdminIngestionRunSchema>;

export const AdminQualityIssueRecordSchema = z.object({
  id: z.uuid(),
  assetId: z.uuid().nullable(),
  runId: z.uuid().nullable(),
  ruleCode: QualityRuleCodeSchema,
  severity: QualitySeveritySchema,
  fieldName: z.string().nullable(),
  observedValue: z.string().nullable(),
  message: z.string(),
  resolutionStatus: QualityResolutionSchema,
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type AdminQualityIssueRecord = z.infer<typeof AdminQualityIssueRecordSchema>;

export const AdminIngestionDetailSchema = z.object({
  run: AdminIngestionRunSchema,
  qualityIssues: z.array(AdminQualityIssueRecordSchema),
});
export type AdminIngestionDetail = z.infer<typeof AdminIngestionDetailSchema>;

export const AdminIngestionListSchema = z.object({
  items: z.array(AdminIngestionRunSchema),
});
export type AdminIngestionList = z.infer<typeof AdminIngestionListSchema>;

export const AdminQualityIssueListSchema = z.object({
  items: z.array(AdminQualityIssueRecordSchema),
});
export type AdminQualityIssueList = z.infer<typeof AdminQualityIssueListSchema>;

export const AdminAssetPublicationSchema = z.object({
  id: z.uuid(),
  publicationStatus: PublicationStatusSchema,
  reason: z.string(),
});
export type AdminAssetPublication = z.infer<typeof AdminAssetPublicationSchema>;

export const AdminSourcePublicationSchema = z.object({
  sourceSlug: z.string(),
  publicationStatus: PublicationStatusSchema,
  suspendedCount: z.number().int().nonnegative(),
  reason: z.string(),
});
export type AdminSourcePublication = z.infer<typeof AdminSourcePublicationSchema>;

export const AdminSourceResponseSchema = SourceInfoSchema;
export type AdminSourceResponse = z.infer<typeof AdminSourceResponseSchema>;

/**
 * Success-rate window for the ops dashboard (Issue #52): only this many of
 * the most recent ingestion runs per source feed recentRunCount /
 * recentSucceededCount, so one bad week does not dominate forever.
 */
export const OPERATIONS_RECENT_RUN_WINDOW = 20;

/** Per-source operational rollup shown on the ops-console dashboard (Issue #52). */
export const AdminSourceOperationsSchema = z.object({
  slug: z.string(),
  name: z.string(),
  providerName: z.string(),
  enabled: z.boolean(),
  /**
   * Publication buckets partition every record of the source exactly once:
   * quarantine (quality_status='hidden') wins over publication_status, so
   * publishedCount matches the public API's visibility rule.
   */
  publishedCount: z.number().int().nonnegative(),
  draftCount: z.number().int().nonnegative(),
  suspendedCount: z.number().int().nonnegative(),
  hiddenCount: z.number().int().nonnegative(),
  /** Newest run regardless of status — 'running' is shown live. */
  lastRunAt: z.iso.datetime().nullable(),
  lastRunStatus: IngestionRunStatusSchema.nullable(),
  /** Finished runs (status<>'running') among the recent window. */
  recentRunCount: z.number().int().nonnegative(),
  recentSucceededCount: z.number().int().nonnegative(),
  openQualityIssueCount: z.number().int().nonnegative(),
  openErrorQualityIssueCount: z.number().int().nonnegative(),
  lastFetchedAt: z.iso.datetime().nullable(),
  sourceUpdatedAt: z.iso.datetime().nullable(),
});
export type AdminSourceOperations = z.infer<typeof AdminSourceOperationsSchema>;

export const AdminOperationsTotalsSchema = z.object({
  sourceCount: z.number().int().nonnegative(),
  enabledSourceCount: z.number().int().nonnegative(),
  publishedCount: z.number().int().nonnegative(),
  suspendedCount: z.number().int().nonnegative(),
  hiddenCount: z.number().int().nonnegative(),
  openQualityIssueCount: z.number().int().nonnegative(),
});
export type AdminOperationsTotals = z.infer<typeof AdminOperationsTotalsSchema>;

export const AdminOperationsSummarySchema = z.object({
  generatedAt: z.iso.datetime(),
  recentRunWindow: z.number().int().positive(),
  totals: AdminOperationsTotalsSchema,
  sources: z.array(AdminSourceOperationsSchema),
});
export type AdminOperationsSummary = z.infer<typeof AdminOperationsSummarySchema>;

/**
 * Builds the summary envelope from per-source rows so InMemory and Postgres
 * repositories aggregate totals identically. Issues attributable to no source
 * (neither asset nor run resolvable) are excluded by construction on both
 * backends and therefore never appear in totals either.
 */
export function summarizeOperations(sources: AdminSourceOperations[]): AdminOperationsSummary {
  const totals: AdminOperationsTotals = {
    sourceCount: sources.length,
    enabledSourceCount: 0,
    publishedCount: 0,
    suspendedCount: 0,
    hiddenCount: 0,
    openQualityIssueCount: 0,
  };
  for (const source of sources) {
    if (source.enabled) totals.enabledSourceCount += 1;
    totals.publishedCount += source.publishedCount;
    totals.suspendedCount += source.suspendedCount;
    totals.hiddenCount += source.hiddenCount;
    totals.openQualityIssueCount += source.openQualityIssueCount;
  }
  return {
    generatedAt: new Date().toISOString(),
    recentRunWindow: OPERATIONS_RECENT_RUN_WINDOW,
    totals,
    sources,
  };
}
