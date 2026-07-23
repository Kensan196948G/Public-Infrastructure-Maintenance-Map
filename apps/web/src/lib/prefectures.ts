/** JIS X 0401 prefecture codes. Keys match infrastructure_assets.prefecture_code. */
export const PREFECTURE_NAMES: Record<string, string> = {
  '01': '北海道',
  '02': '青森県',
  '03': '岩手県',
  '04': '宮城県',
  '05': '秋田県',
  '06': '山形県',
  '07': '福島県',
  '08': '茨城県',
  '09': '栃木県',
  '10': '群馬県',
  '11': '埼玉県',
  '12': '千葉県',
  '13': '東京都',
  '14': '神奈川県',
  '15': '新潟県',
  '16': '富山県',
  '17': '石川県',
  '18': '福井県',
  '19': '山梨県',
  '20': '長野県',
  '21': '岐阜県',
  '22': '静岡県',
  '23': '愛知県',
  '24': '三重県',
  '25': '滋賀県',
  '26': '京都府',
  '27': '大阪府',
  '28': '兵庫県',
  '29': '奈良県',
  '30': '和歌山県',
  '31': '鳥取県',
  '32': '島根県',
  '33': '岡山県',
  '34': '広島県',
  '35': '山口県',
  '36': '徳島県',
  '37': '香川県',
  '38': '愛媛県',
  '39': '高知県',
  '40': '福岡県',
  '41': '佐賀県',
  '42': '長崎県',
  '43': '熊本県',
  '44': '大分県',
  '45': '宮崎県',
  '46': '鹿児島県',
  '47': '沖縄県',
};

/** The summary API groups records without a prefecture code under this key. */
export const UNKNOWN_PREFECTURE_KEY = 'unknown';

export function prefectureName(code: string | null | undefined): string {
  if (!code || code === UNKNOWN_PREFECTURE_KEY) return '都道府県不明';
  return PREFECTURE_NAMES[code] ?? `都道府県コード${code}`;
}

/**
 * All 47 prefectures in JIS order with their counts (0 when no data), plus a
 * trailing unknown bucket only when the summary actually reports one.
 */
export function listPrefectureEntries(
  byPrefecture: Record<string, number>,
): Array<[string, number]> {
  const entries: Array<[string, number]> = Object.keys(PREFECTURE_NAMES)
    .sort((a, b) => a.localeCompare(b))
    .map((code) => [code, byPrefecture[code] ?? 0]);
  const unknown = byPrefecture[UNKNOWN_PREFECTURE_KEY];
  if (unknown !== undefined && unknown > 0) {
    entries.push([UNKNOWN_PREFECTURE_KEY, unknown]);
  }
  return entries;
}
