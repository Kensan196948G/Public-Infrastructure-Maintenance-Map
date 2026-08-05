import { useMemo } from 'react';
import type { AssetType, BBox, QualityStatus } from '@pimm/contracts';
import { ApiClient } from '../api/client.js';

export interface ExportButtonsProps {
  bbox: BBox | null;
  types: readonly AssetType[];
  quality: readonly QualityStatus[];
  q: string;
  prefectureCode?: string | null;
  municipalityCode?: string | null;
}

/** Shared instance (same pattern as api/hooks.ts) to avoid per-render identity churn. */
const defaultClient = new ApiClient();

/**
 * CSV / GeoJSON export links for the current viewport and filters (FR-08).
 * The server applies license-based redistribution control and reports
 * excluded sources via the X-Excluded-Sources response header.
 */
export function ExportButtons({
  bbox,
  types,
  quality,
  q,
  prefectureCode = null,
  municipalityCode = null,
}: ExportButtonsProps) {
  const base = useMemo(
    () => ({
      ...(bbox ? { bbox } : {}),
      ...(prefectureCode ? { prefectureCode } : {}),
      ...(municipalityCode ? { municipalityCode } : {}),
      types,
      quality,
      q,
      limit: 1000,
    }),
    [bbox, prefectureCode, municipalityCode, types, quality, q],
  );

  const csvUrl = useMemo(() => defaultClient.getExportUrl({ ...base, format: 'csv' }), [base]);
  const geojsonUrl = useMemo(
    () => defaultClient.getExportUrl({ ...base, format: 'geojson' }),
    [base],
  );

  return (
    <div className="export-buttons" aria-label="データ出力">
      <a className="export-button" href={csvUrl} download>
        📄 CSV 出力
      </a>
      <a className="export-button" href={geojsonUrl} download>
        🗺️ GeoJSON 出力
      </a>
      <p className="export-note">
        出力可否はデータセットごとの再配布条件に従います（対象外ソースは出力から除外）。
      </p>
    </div>
  );
}
