import { z } from 'zod';
import { QualityResolutionSchema, QualityRuleCodeSchema, QualitySeveritySchema } from './enums.js';

/** A quality issue detected by the ingestion pipeline (quality_issues row). */
export const QualityIssueSchema = z.object({
  ruleCode: QualityRuleCodeSchema,
  severity: QualitySeveritySchema,
  fieldName: z.string().nullable(),
  observedValue: z.string().nullable(),
  message: z.string(),
  resolutionStatus: QualityResolutionSchema.default('open'),
});
export type QualityIssue = z.infer<typeof QualityIssueSchema>;

/** Static metadata for each quality rule (設計書 §6.3). */
export const QUALITY_RULES: Record<
  z.infer<typeof QualityRuleCodeSchema>,
  { severity: z.infer<typeof QualitySeveritySchema>; label: string; action: string }
> = {
  Q001: { severity: 'warning', label: '名称欠損', action: '参考として扱う' },
  Q002: { severity: 'error', label: '位置情報欠損', action: '公開対象から隔離' },
  Q003: { severity: 'error', label: '日本域外の座標', action: '隔離' },
  Q004: { severity: 'error', label: '不正Geometry', action: '修復を試行し、失敗時隔離' },
  Q005: { severity: 'warning', label: '重複候補', action: '要確認' },
  Q006: { severity: 'warning', label: '原典更新日不明', action: '鮮度不明を表示' },
  Q007: { severity: 'error', label: 'ライセンス不明', action: '非公開' },
  Q008: { severity: 'error', label: 'スキーマ変更', action: '取込停止、管理者通知' },
};
