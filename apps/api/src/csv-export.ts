import type { AssetDetail, SourceInfo } from '@pimm/contracts';

/**
 * CSV formula injection guard (設計書 §9): cells beginning with = + - @
 * or a leading tab/CR (OWASP-recommended extra guard characters) are
 * prefixed with a single quote so spreadsheet apps treat them as text.
 */
export function sanitizeCsvCell(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const CSV_HEADER = [
  'id',
  'type',
  'name',
  'lon',
  'lat',
  'prefecture_code',
  'municipality_code',
  'managing_authority',
  'quality_status',
  'source_slug',
  'license',
  'source_url',
  'fetched_at',
];

export function assetsToCsv(assets: readonly AssetDetail[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const a of assets) {
    const [lon, lat] = a.representativePoint;
    const cells = [
      a.id,
      a.type,
      a.name,
      String(lon),
      String(lat),
      a.prefectureCode ?? '',
      a.municipalityCode ?? '',
      a.managingAuthority ?? '',
      a.quality.status,
      a.sourceSlug,
      a.source.licenseName,
      a.source.sourceUrl,
      a.source.fetchedAt,
    ];
    lines.push(cells.map((c) => quote(sanitizeCsvCell(c))).join(','));
  }
  // BOM so Japanese text opens correctly in Excel.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function assetsToGeoJson(
  assets: readonly AssetDetail[],
  attributions: readonly string[],
  excludedSources: readonly string[],
): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    attributions,
    excludedSources,
    features: assets.map((a) => ({
      type: 'Feature',
      id: a.id,
      geometry: a.geometry,
      properties: {
        assetType: a.type,
        name: a.name,
        qualityStatus: a.quality.status,
        sourceSlug: a.sourceSlug,
        sourceUrl: a.source.sourceUrl,
        licenseName: a.source.licenseName,
        fetchedAt: a.source.fetchedAt,
      },
    })),
  });
}

/** Splits export candidates by source redistribution policy (FR-08). */
export function partitionByLicense(
  assets: readonly AssetDetail[],
  sources: readonly SourceInfo[],
): { exportable: AssetDetail[]; excludedSources: string[]; attributions: string[] } {
  const allowed = new Set(
    sources
      .filter((s) => s.redistribution === 'allowed' || s.redistribution === 'restricted')
      .map((s) => s.slug),
  );
  const exportable = assets.filter((a) => allowed.has(a.sourceSlug));
  const usedSlugs = new Set(exportable.map((a) => a.sourceSlug));
  const excludedSources = [...new Set(assets.map((a) => a.sourceSlug))]
    .filter((slug) => !allowed.has(slug))
    .sort();
  const attributions = sources
    .filter((s) => usedSlugs.has(s.slug))
    .map((s) => s.attributionText ?? `出典: ${s.providerName}「${s.name}」`)
    .sort();
  return { exportable, excludedSources, attributions };
}
