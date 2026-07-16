import type { AssetDetail, AssetType, QualityStatus, SourceInfo } from '@pimm/contracts';

let seq = 0;

/** Deterministic fake uuid (valid v4 format) for tests. */
export function testUuid(): string {
  seq += 1;
  const hex = seq.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export function makeAsset(overrides: {
  name: string;
  type?: AssetType;
  lon?: number;
  lat?: number;
  quality?: QualityStatus;
  published?: boolean;
  sourceSlug?: string;
  sourceUpdatedAt?: string | null;
  municipalityCode?: string | null;
}): AssetDetail {
  const lon = overrides.lon ?? 139.7;
  const lat = overrides.lat ?? 35.68;
  return {
    id: testUuid(),
    type: overrides.type ?? 'bridge',
    name: overrides.name,
    representativePoint: [lon, lat],
    geometry: { type: 'Point', coordinates: [lon, lat] },
    prefectureCode: '13',
    municipalityCode:
      overrides.municipalityCode === undefined ? '13101' : overrides.municipalityCode,
    managingAuthority: 'サンプル県',
    quality: {
      status: overrides.quality ?? 'verified',
      updatedAtKnown: overrides.sourceUpdatedAt !== null,
      openIssueCodes: [],
    },
    sourceSlug: overrides.sourceSlug ?? 'sample-bridges',
    sourceUpdatedAt:
      overrides.sourceUpdatedAt === undefined
        ? '2026-01-01T00:00:00.000Z'
        : overrides.sourceUpdatedAt,
    originalName: overrides.name,
    publicationStatus: overrides.published === false ? 'draft' : 'published',
    attributes: [],
    source: {
      slug: overrides.sourceSlug ?? 'sample-bridges',
      provider: 'サンプル公開データ提供者',
      dataset: 'サンプル橋梁データ',
      sourceUrl: 'https://example.com/dataset',
      sourceRecordId: `rec-${seq}`,
      fetchedAt: '2026-07-01T00:00:00.000Z',
      sourceUpdatedAt:
        overrides.sourceUpdatedAt === undefined
          ? '2026-01-01T00:00:00.000Z'
          : overrides.sourceUpdatedAt,
      licenseName: 'CC-BY-4.0',
      licenseUrl: null,
      redistribution: 'allowed',
    },
    notices: ['参考情報です。原典を確認してください。'],
  };
}

export function makeSource(overrides: Partial<SourceInfo> & { slug: string }): SourceInfo {
  return {
    name: 'サンプルソース',
    providerName: 'サンプル提供者',
    sourceUrl: 'https://example.com/dataset',
    accessType: 'file',
    format: 'geojson',
    licenseName: 'CC-BY-4.0',
    licenseUrl: null,
    redistribution: 'allowed',
    attributionText: null,
    enabled: true,
    lastFetchedAt: null,
    sourceUpdatedAt: null,
    publishedAssetCount: 0,
    ...overrides,
  };
}
