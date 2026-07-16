import type { AssetType, QualityStatus } from '@pimm/contracts';
import { ASSET_TYPES } from '@pimm/contracts';

/** Display metadata for an infrastructure category (UI labels are Japanese). */
export interface AssetTypeMeta {
  type: AssetType;
  label: string;
  icon: string;
  /** Marker color on the map (also mirrored in the legend). */
  color: string;
}

export const ASSET_TYPE_META: Record<AssetType, AssetTypeMeta> = {
  bridge: { type: 'bridge', label: '橋梁', icon: '🌉', color: '#c2410c' },
  road: { type: 'road', label: '道路', icon: '🛣️', color: '#4b5563' },
  port: { type: 'port', label: '港湾', icon: '⚓', color: '#0369a1' },
  river: { type: 'river', label: '河川', icon: '🌊', color: '#0891b2' },
  public_facility: { type: 'public_facility', label: '公共施設', icon: '🏢', color: '#7c3aed' },
};

/** Ordered list of all categories, kept in sync with the contract enum. */
export const ASSET_TYPE_LIST: readonly AssetTypeMeta[] = ASSET_TYPES.map((t) => ASSET_TYPE_META[t]);

/** Quality statuses shown to end users. `hidden` is never surfaced in the UI. */
export interface QualityMeta {
  status: QualityStatus;
  label: string;
  icon: string;
  /** Accessible short text; never rely on color alone (WCAG 1.4.1). */
  description: string;
  color: string;
}

export const QUALITY_META: Record<QualityStatus, QualityMeta> = {
  verified: {
    status: 'verified',
    label: '確認済み',
    icon: '✅',
    description: '出典・位置・鮮度の整合が確認された情報です。',
    color: '#15803d',
  },
  review: {
    status: 'review',
    label: '要確認',
    icon: '⚠️',
    description: '重複候補や鮮度不明などの注意点があります。原典で確認してください。',
    color: '#b45309',
  },
  reference: {
    status: 'reference',
    label: '参考',
    icon: 'ℹ️',
    description: '名称欠損などのため参考情報として扱っています。',
    color: '#6b7280',
  },
  hidden: {
    status: 'hidden',
    label: '非公開',
    icon: '🚫',
    description: '公開対象外の情報です。',
    color: '#991b1b',
  },
};

/** Quality statuses selectable in the filter panel and shown as badges. */
export const VISIBLE_QUALITY_STATUSES: readonly QualityStatus[] = [
  'verified',
  'review',
  'reference',
];

/** Value shown whenever a field is missing. The UI never guesses (設計書 §8.2). */
export const UNKNOWN_LABEL = '不明';

export function labelForType(type: AssetType): string {
  return ASSET_TYPE_META[type].label;
}
