/**
 * Quality rules Q001-Q007 (設計書 §6.3). Q008 (schema change) lives in the
 * pipeline because it is batch-level, not record-level.
 */
import type { Geometry, QualityIssue, QualityStatus } from '@pimm/contracts';
import type { NormalizedAsset, SourceDescriptor } from './adapter.js';
import { geometryWithinJapan } from './coords.js';
import { validateGeometry } from './geometry-validate.js';

export interface RecordCheckResult {
  issues: QualityIssue[];
  /** Possibly repaired geometry (Q004 conservative repair). */
  geometry: Geometry | null;
}

function issue(
  ruleCode: QualityIssue['ruleCode'],
  severity: QualityIssue['severity'],
  message: string,
  fieldName: string | null = null,
  observedValue: string | null = null,
): QualityIssue {
  return { ruleCode, severity, fieldName, observedValue, message, resolutionStatus: 'open' };
}

/** Record-level checks: Q001, Q002, Q003, Q004, Q006, Q007. */
export function checkRecord(asset: NormalizedAsset, source: SourceDescriptor): RecordCheckResult {
  const issues: QualityIssue[] = [];
  let geometry = asset.geometry;

  if (asset.name === null || asset.name.length === 0) {
    issues.push(issue('Q001', 'warning', '名称が欠損しています', 'name'));
  }

  if (geometry === null) {
    issues.push(issue('Q002', 'error', '位置情報が欠損しています', 'geometry'));
  } else {
    const check = validateGeometry(geometry);
    if (!check.ok) {
      issues.push(
        issue('Q004', 'error', `不正なGeometryです: ${check.reason ?? 'unknown'}`, 'geometry'),
      );
      geometry = null;
    } else {
      geometry = check.geometry;
      if (check.repaired) {
        issues.push(issue('Q004', 'info', 'Geometryを自動修復しました（リング閉合）', 'geometry'));
      }
      if (!geometryWithinJapan(geometry)) {
        issues.push(
          issue(
            'Q003',
            'error',
            '日本域外の座標が含まれています',
            'geometry',
            JSON.stringify(geometry.type === 'Point' ? geometry.coordinates : geometry.type),
          ),
        );
      }
    }
  }

  if (asset.sourceUpdatedAt === null) {
    issues.push(issue('Q006', 'warning', '原典の更新日が不明です', 'sourceUpdatedAt'));
  }

  if (source.licenseName === null || source.licenseName.trim().length === 0) {
    issues.push(issue('Q007', 'error', 'ライセンスが不明のため公開できません', 'license'));
  }

  return { issues, geometry };
}

/**
 * Maps detected issues to the published quality badge (要件 §7.4).
 * Any error → hidden (quarantine). Q005 → review. Q001/Q006 → reference.
 */
export function assignQualityStatus(issues: readonly QualityIssue[]): QualityStatus {
  if (issues.some((i) => i.severity === 'error')) return 'hidden';
  if (issues.some((i) => i.ruleCode === 'Q005')) return 'review';
  if (issues.some((i) => i.ruleCode === 'Q001' || i.ruleCode === 'Q006')) return 'reference';
  return 'verified';
}
