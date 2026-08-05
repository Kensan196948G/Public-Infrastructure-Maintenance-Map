import { z } from 'zod';
import { AssetTypeSchema, QualityStatusSchema } from './enums.js';
import { AssetSummarySchema } from './asset.js';
import { BBoxParamSchema, LatitudeSchema, LongitudeSchema } from './geometry.js';
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
  /** 2-digit JIS prefecture code → count; records without a code group under "unknown". */
  byPrefecture: z.record(z.string(), z.number().int().nonnegative()),
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
  // Bounded low: exportAssets does provider round-trips proportional to this limit.
  limit: z.coerce.number().int().min(1).max(2000).default(1000),
});
export type ExportQuery = z.infer<typeof ExportQuerySchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Query for GET /suggest — name suggestions for the search box (Issue #50). */
export const SuggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type SuggestQuery = z.infer<typeof SuggestQuerySchema>;

export const SuggestItemSchema = z.object({
  name: z.string(),
  /** Number of published assets carrying this name. */
  count: z.number().int().positive(),
});
export type SuggestItem = z.infer<typeof SuggestItemSchema>;

export const SuggestResponseSchema = z.object({
  items: z.array(SuggestItemSchema),
});
export type SuggestResponse = z.infer<typeof SuggestResponseSchema>;

/** Query for GET /geocode — address search proxied to the GSI geocoder (Issue #50). */
export const GeocodeQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});
export type GeocodeQuery = z.infer<typeof GeocodeQuerySchema>;

export const GeocodeItemSchema = z.object({
  title: z.string(),
  address: z.string().nullable(),
  lon: LongitudeSchema,
  lat: LatitudeSchema,
});
export type GeocodeItem = z.infer<typeof GeocodeItemSchema>;

export const GeocodeResponseSchema = z.object({
  items: z.array(GeocodeItemSchema),
});
export type GeocodeResponse = z.infer<typeof GeocodeResponseSchema>;
