import { z } from 'zod';
import { AssetTypeSchema, QualityStatusSchema } from './enums.js';
import { AssetSummarySchema } from './asset.js';
import { BBoxParamSchema } from './geometry.js';
import { SourceInfoSchema } from './source.js';

/** Comma-separated list helper: "bridge,road" → ['bridge','road']. */
const csv = <T extends z.ZodType>(item: T) =>
  z.string().transform((raw, ctx): z.output<T>[] => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'list must not be empty' });
      return z.NEVER;
    }
    const out: z.output<T>[] = [];
    for (const part of parts) {
      const result = item.safeParse(part);
      if (!result.success) {
        ctx.addIssue({ code: 'custom', message: `invalid value: ${part}` });
        return z.NEVER;
      }
      out.push(result.data as z.output<T>);
    }
    return out;
  });

export const DEFAULT_PAGE_LIMIT = 100;
export const MAX_PAGE_LIMIT = 500;
/** Maximum allowed bbox area in square degrees (性能ガード §11). */
export const MAX_BBOX_AREA_DEG2 = 4;

/** Query parameters for GET /assets (設計書 §7.2). */
export const AssetSearchQuerySchema = z.object({
  bbox: BBoxParamSchema.optional(),
  types: csv(AssetTypeSchema).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  prefectureCode: z
    .string()
    .regex(/^\d{2}$/)
    .optional(),
  municipalityCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  quality: csv(QualityStatusSchema).optional(),
  updatedSince: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
  cursor: z.string().max(500).optional(),
});
export type AssetSearchQuery = z.infer<typeof AssetSearchQuerySchema>;

export const AssetSearchResponseSchema = z.object({
  items: z.array(AssetSummarySchema),
  nextCursor: z.string().nullable(),
});
export type AssetSearchResponse = z.infer<typeof AssetSearchResponseSchema>;

/** Query for GET /assets/summary — counts by type within a bbox. */
export const AssetSummaryQuerySchema = z.object({
  bbox: BBoxParamSchema.optional(),
  types: csv(AssetTypeSchema).optional(),
});
export type AssetSummaryQuery = z.infer<typeof AssetSummaryQuerySchema>;

export const AssetCountSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byType: z.partialRecord(AssetTypeSchema, z.number().int().nonnegative()),
});
export type AssetCountSummary = z.infer<typeof AssetCountSummarySchema>;

export const SourceListResponseSchema = z.object({
  items: z.array(SourceInfoSchema),
});
export type SourceListResponse = z.infer<typeof SourceListResponseSchema>;

/** Query for GET /export (FR-08). Same filters as search plus format. */
export const ExportQuerySchema = z.object({
  format: z.enum(['csv', 'geojson']),
  bbox: BBoxParamSchema.optional(),
  types: csv(AssetTypeSchema).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  prefectureCode: z
    .string()
    .regex(/^\d{2}$/)
    .optional(),
  municipalityCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  quality: csv(QualityStatusSchema).optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});
export type ExportQuery = z.infer<typeof ExportQuerySchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
