/**
 * Fictitious sample bridges (テスト用の架空データ, 要件 §データ方針).
 * Coordinates sit in central Tokyo so the map demo looks realistic, but every
 * name/attribute is invented. Includes deliberate quality cases:
 *  - B006: no name (Q001 → reference)
 *  - B007/B008: duplicate pair (Q005 → review)
 *  - B009: unknown update date (Q006 → reference)
 *  - B010: outside Japan (Q003 → quarantined, never published)
 */
export const SAMPLE_BRIDGES_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'B001',
      geometry: { type: 'Point', coordinates: [139.7671, 35.6812] },
      properties: {
        名称: 'みらい大橋（サンプル）',
        路線名: '市道１号線',
        管理者: 'サンプル市',
        供用年: '1985',
        橋長: '124.5m',
        市区町村コード: '13101',
        更新日: '2026/04/01',
      },
    },
    {
      type: 'Feature',
      id: 'B002',
      geometry: { type: 'Point', coordinates: [139.7454, 35.6586] },
      properties: {
        名称: 'あおぞら橋（サンプル）',
        路線名: '県道サンプル線',
        管理者: 'サンプル県',
        供用年: '1972',
        橋長: '86m',
        市区町村コード: '13103',
        更新日: '2026/04/01',
      },
    },
    {
      type: 'Feature',
      id: 'B003',
      geometry: { type: 'Point', coordinates: [139.8107, 35.7101] },
      properties: {
        名称: 'かわせみ橋（サンプル）',
        路線名: '市道１２号線',
        管理者: 'サンプル市',
        供用年: '1998',
        橋長: '210m',
        市区町村コード: '13106',
        更新日: '2025/11/20',
      },
    },
    {
      type: 'Feature',
      id: 'B004',
      geometry: { type: 'Point', coordinates: [139.6917, 35.6895] },
      properties: {
        名称: 'ひばり陸橋（サンプル）',
        路線名: '国道サンプル号',
        管理者: 'サンプル国道事務所',
        供用年: '1964',
        橋長: '340m',
        市区町村コード: '13104',
        更新日: '2026/02/15',
      },
    },
    {
      type: 'Feature',
      id: 'B005',
      geometry: { type: 'Point', coordinates: [139.7016, 35.6584] },
      properties: {
        名称: 'さくら歩道橋（サンプル）',
        路線名: '市道８号線',
        管理者: 'サンプル市',
        供用年: '2005',
        橋長: '42m',
        市区町村コード: '13113',
        更新日: '2026/04/01',
      },
    },
    {
      type: 'Feature',
      id: 'B006',
      geometry: { type: 'Point', coordinates: [139.7528, 35.6938] },
      properties: {
        名称: '',
        路線名: '市道２２号線',
        管理者: 'サンプル市',
        供用年: '',
        橋長: '',
        市区町村コード: '13101',
        更新日: '2026/04/01',
      },
    },
    {
      type: 'Feature',
      id: 'B007',
      geometry: { type: 'Point', coordinates: [139.774, 35.6997] },
      properties: {
        名称: 'ふたご橋（サンプル）',
        路線名: '市道３号線',
        管理者: 'サンプル市',
        供用年: '1990',
        橋長: '58m',
        市区町村コード: '13101',
        更新日: '2026/04/01',
      },
    },
    {
      type: 'Feature',
      id: 'B008',
      geometry: { type: 'Point', coordinates: [139.7742, 35.6999] },
      properties: {
        名称: 'ふたご橋（サンプル）',
        路線名: '県道サンプル線',
        管理者: 'サンプル県',
        供用年: '1990',
        橋長: '58m',
        市区町村コード: '13101',
        更新日: '2026/04/01',
      },
    },
    {
      type: 'Feature',
      id: 'B009',
      geometry: { type: 'Point', coordinates: [139.7315, 35.7092] },
      properties: {
        名称: 'のぞみ橋（サンプル）',
        路線名: '市道１７号線',
        管理者: 'サンプル市',
        供用年: '1979',
        橋長: '95m',
        市区町村コード: '13105',
        更新日: '',
      },
    },
    {
      type: 'Feature',
      id: 'B010',
      geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
      properties: {
        名称: '域外橋（サンプル・隔離対象）',
        路線名: '-',
        管理者: '-',
        供用年: '',
        橋長: '',
        市区町村コード: '',
        更新日: '2026/04/01',
      },
    },
  ],
});
