import { z } from 'zod';
import { AccessTypeSchema, RedistributionPolicySchema, SourceFormatSchema } from './enums.js';

/** Public representation of a data source (GET /sources, 画面 UI-03). */
export const SourceInfoSchema = z.object({
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be URL-safe kebab-case'),
  name: z.string(),
  providerName: z.string(),
  sourceUrl: z.httpUrl(),
  accessType: AccessTypeSchema,
  format: SourceFormatSchema,
  licenseName: z.string(),
  licenseUrl: z.httpUrl().nullable(),
  redistribution: RedistributionPolicySchema,
  /** Attribution line to display when data from this source is shown/exported. */
  attributionText: z.string().nullable(),
  enabled: z.boolean(),
  lastFetchedAt: z.iso.datetime().nullable(),
  sourceUpdatedAt: z.iso.datetime().nullable(),
  publishedAssetCount: z.number().int().nonnegative(),
});
export type SourceInfo = z.infer<typeof SourceInfoSchema>;

/** Whether asset data from this source may be exported (FR-08, 要件 §9). */
export function isExportAllowed(
  redistribution: z.infer<typeof RedistributionPolicySchema>,
): boolean {
  return redistribution === 'allowed' || redistribution === 'restricted';
}
