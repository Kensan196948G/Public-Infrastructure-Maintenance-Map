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

export const AdminAssetPublicationSchema = z.object({
  id: z.uuid(),
  publicationStatus: PublicationStatusSchema,
  reason: z.string(),
});
export type AdminAssetPublication = z.infer<typeof AdminAssetPublicationSchema>;

export const AdminSourceResponseSchema = SourceInfoSchema;
export type AdminSourceResponse = z.infer<typeof AdminSourceResponseSchema>;
