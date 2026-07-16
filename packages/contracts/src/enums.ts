import { z } from 'zod';

/** Infrastructure categories handled by the platform (設計書 §5.1). */
export const ASSET_TYPES = ['bridge', 'road', 'port', 'river', 'public_facility'] as const;
export const AssetTypeSchema = z.enum(ASSET_TYPES);
export type AssetType = z.infer<typeof AssetTypeSchema>;

/** Quality badge shown to users (要件定義書 §7.4). */
export const QUALITY_STATUSES = ['verified', 'review', 'reference', 'hidden'] as const;
export const QualityStatusSchema = z.enum(QUALITY_STATUSES);
export type QualityStatus = z.infer<typeof QualityStatusSchema>;

/** Publication lifecycle of an asset record. */
export const PUBLICATION_STATUSES = ['draft', 'published', 'suspended'] as const;
export const PublicationStatusSchema = z.enum(PUBLICATION_STATUSES);
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;

/** Redistribution policy derived from the source license. */
export const REDISTRIBUTION_POLICIES = ['allowed', 'restricted', 'prohibited', 'unknown'] as const;
export const RedistributionPolicySchema = z.enum(REDISTRIBUTION_POLICIES);
export type RedistributionPolicy = z.infer<typeof RedistributionPolicySchema>;

/** How a data source is accessed. */
export const ACCESS_TYPES = ['api', 'file', 'manual'] as const;
export const AccessTypeSchema = z.enum(ACCESS_TYPES);
export type AccessType = z.infer<typeof AccessTypeSchema>;

/** Source data formats supported by adapters. */
export const SOURCE_FORMATS = ['csv', 'geojson', 'json', 'xml'] as const;
export const SourceFormatSchema = z.enum(SOURCE_FORMATS);
export type SourceFormat = z.infer<typeof SourceFormatSchema>;

/** dataset_versions.status lifecycle. */
export const DATASET_VERSION_STATUSES = ['fetched', 'validated', 'published', 'rejected'] as const;
export const DatasetVersionStatusSchema = z.enum(DATASET_VERSION_STATUSES);
export type DatasetVersionStatus = z.infer<typeof DatasetVersionStatusSchema>;

/** ingestion_runs.status lifecycle. */
export const INGESTION_RUN_STATUSES = ['running', 'succeeded', 'partial', 'failed'] as const;
export const IngestionRunStatusSchema = z.enum(INGESTION_RUN_STATUSES);
export type IngestionRunStatus = z.infer<typeof IngestionRunStatusSchema>;

/** Severity of a quality issue. */
export const QUALITY_SEVERITIES = ['info', 'warning', 'error'] as const;
export const QualitySeveritySchema = z.enum(QUALITY_SEVERITIES);
export type QualitySeverity = z.infer<typeof QualitySeveritySchema>;

/** Quality rule codes (設計書 §6.3). */
export const QUALITY_RULE_CODES = [
  'Q001', // 名称欠損
  'Q002', // 位置情報欠損
  'Q003', // 日本域外の座標
  'Q004', // 不正 Geometry
  'Q005', // 重複候補
  'Q006', // 原典更新日不明
  'Q007', // ライセンス不明
  'Q008', // スキーマ変更
] as const;
export const QualityRuleCodeSchema = z.enum(QUALITY_RULE_CODES);
export type QualityRuleCode = z.infer<typeof QualityRuleCodeSchema>;

/** Resolution workflow for detected quality issues. */
export const QUALITY_RESOLUTIONS = ['open', 'accepted', 'fixed', 'dismissed'] as const;
export const QualityResolutionSchema = z.enum(QUALITY_RESOLUTIONS);
export type QualityResolution = z.infer<typeof QualityResolutionSchema>;
