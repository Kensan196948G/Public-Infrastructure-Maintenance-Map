/**
 * Fictitious sample rivers (LineString, declared CRS EPSG:6668 = JGD2011).
 * Redistribution is 'prohibited' on purpose so the export-control path
 * (FR-08 / ライセンス制御) is exercised end-to-end in sample mode.
 */
export const SAMPLE_RIVERS_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'R001',
      geometry: {
        type: 'LineString',
        coordinates: [
          [139.72, 35.66],
          [139.735, 35.672],
          [139.75, 35.685],
          [139.768, 35.694],
        ],
      },
      properties: {
        河川名: 'みどり川（サンプル）',
        水系: 'サンプル水系',
        管理者: 'サンプル県',
        区間: '下流部',
        更新日: '2026-03-31',
      },
    },
    {
      type: 'Feature',
      id: 'R002',
      geometry: {
        type: 'LineString',
        coordinates: [
          [139.68, 35.7],
          [139.695, 35.708],
          [139.712, 35.716],
        ],
      },
      properties: {
        河川名: 'あさひ川（サンプル）',
        水系: 'サンプル水系',
        管理者: 'サンプル県',
        区間: '中流部',
        更新日: '2026-03-31',
      },
    },
    {
      type: 'Feature',
      id: 'R003',
      geometry: {
        type: 'LineString',
        coordinates: [
          [139.79, 35.69],
          [139.803, 35.7],
          [139.815, 35.712],
        ],
      },
      properties: {
        河川名: 'こがね川（サンプル）',
        水系: 'こがね水系',
        管理者: 'サンプル国土事務所',
        区間: '全区間',
        更新日: '2026-03-31',
      },
    },
  ],
});
