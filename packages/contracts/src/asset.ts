import { z } from 'zod';
import {
  AssetTypeSchema,
  PublicationStatusSchema,
  QualityStatusSchema,
  RedistributionPolicySchema,
} from './enums.js';
import { GeometrySchema, PointSchema } from './geometry.js';

/** A single normalized attribute of an asset (asset_attributes row). */
export const AssetAttributeSchema = z.object({
  key: z.string().max(100),
  /** Normalized display value. "不明" is rendered by the UI when absent — never guessed here. */
  valueText: z.string().nullable(),
  valueNumber: z.number().nullable(),
  /** SI unit symbol, e.g. "m". */
  unit: z.string().max(20).nullable(),
  /** Verbatim value as published by the source. */
  originalValue: z.string().nullable(),
  /** Field name used by the source. */
  sourceLabel: z.string().nullable(),
});
export type AssetAttribute = z.infer<typeof AssetAttributeSchema>;

/** Provenance block attached to every asset (要件定義書 §7.2). */
export const AssetSourceMetaSchema = z.object({
  slug: z.string(),
  provider: z.string(),
  dataset: z.string(),
  sourceUrl: z.httpUrl(),
  sourceRecordId: z.string().nullable(),
  fetchedAt: z.iso.datetime(),
  sourceUpdatedAt: z.iso.datetime().nullable(),
  licenseName: z.string(),
  licenseUrl: z.httpUrl().nullable(),
  redistribution: RedistributionPolicySchema,
});
export type AssetSourceMeta = z.infer<typeof AssetSourceMetaSchema>;

/** Quality block shown on list and detail views. */
export const AssetQualitySchema = z.object({
  status: QualityStatusSchema,
  /** False when the source does not publish an update date (Q006). */
  updatedAtKnown: z.boolean(),
  /** Open issue rule codes, e.g. ["Q005"]. */
  openIssueCodes: z.array(z.string()),
});
export type AssetQuality = z.infer<typeof AssetQualitySchema>;

/** Compact list-item representation returned by GET /assets. */
export const AssetSummarySchema = z.object({
  id: z.uuid(),
  type: AssetTypeSchema,
  name: z.string(),
  /** Representative point for list linking / clustering: [lon, lat]. */
  representativePoint: z.tuple([z.number(), z.number()]),
  geometry: GeometrySchema,
  prefectureCode: z.string().length(2).nullable(),
  municipalityCode: z.string().length(5).nullable(),
  managingAuthority: z.string().nullable(),
  quality: AssetQualitySchema,
  sourceSlug: z.string(),
  sourceUpdatedAt: z.iso.datetime().nullable(),
});
export type AssetSummary = z.infer<typeof AssetSummarySchema>;

/** Full representation returned by GET /assets/{id} (画面 UI-02). */
export const AssetDetailSchema = AssetSummarySchema.extend({
  originalName: z.string().nullable(),
  publicationStatus: PublicationStatusSchema,
  attributes: z.array(AssetAttributeSchema),
  source: AssetSourceMetaSchema,
  /** Fixed cautionary notices, always rendered (免責 §8.2). */
  notices: z.array(z.string()),
});
export type AssetDetail = z.infer<typeof AssetDetailSchema>;

/** GeoJSON Feature form used by export and map layers. */
export const AssetFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.uuid(),
  geometry: GeometrySchema,
  properties: z.object({
    assetType: AssetTypeSchema,
    name: z.string(),
    qualityStatus: QualityStatusSchema,
    sourceSlug: z.string(),
    sourceUrl: z.string(),
    licenseName: z.string(),
    fetchedAt: z.iso.datetime(),
  }),
});
export type AssetFeature = z.infer<typeof AssetFeatureSchema>;

export const RepresentativePointSchema = PointSchema;
