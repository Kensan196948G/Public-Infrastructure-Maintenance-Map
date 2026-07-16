import type { AssetDetail, AssetSummary } from '@pimm/contracts';

export const bridgeSummary: AssetSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'bridge',
  name: '未来大橋',
  representativePoint: [139.767, 35.681],
  geometry: { type: 'Point', coordinates: [139.767, 35.681] },
  prefectureCode: '13',
  municipalityCode: '13101',
  managingAuthority: '国土交通省',
  quality: { status: 'verified', updatedAtKnown: true, openIssueCodes: [] },
  sourceSlug: 'mlit-bridges',
  sourceUpdatedAt: '2026-03-01T00:00:00Z',
};

export const riverSummary: AssetSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  type: 'river',
  name: '緑川',
  representativePoint: [139.7, 35.6],
  geometry: { type: 'Point', coordinates: [139.7, 35.6] },
  prefectureCode: '13',
  municipalityCode: null,
  managingAuthority: null,
  quality: { status: 'review', updatedAtKnown: false, openIssueCodes: ['Q005'] },
  sourceSlug: 'mlit-rivers',
  sourceUpdatedAt: null,
};

/** Detail with several missing values to exercise the 「不明」 fallbacks. */
export const detailWithGaps: AssetDetail = {
  ...riverSummary,
  originalName: null,
  publicationStatus: 'published',
  attributes: [
    {
      key: '延長',
      valueText: null,
      valueNumber: 320,
      unit: 'm',
      originalValue: '320',
      sourceLabel: 'length_m',
    },
    {
      key: '管理区分',
      valueText: null,
      valueNumber: null,
      unit: null,
      originalValue: null,
      sourceLabel: null,
    },
  ],
  source: {
    slug: 'mlit-rivers',
    provider: '国土交通省',
    dataset: '河川データセット',
    sourceUrl: 'https://example.gov/source',
    sourceRecordId: 'r-001',
    fetchedAt: '2026-07-10T00:00:00Z',
    sourceUpdatedAt: null,
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://example.gov/license',
    redistribution: 'allowed',
  },
  notices: ['重複候補が検出されています。原典で確認してください。'],
};
