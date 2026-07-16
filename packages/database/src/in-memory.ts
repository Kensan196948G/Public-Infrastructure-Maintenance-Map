import type {
  AssetCountSummary,
  AssetDetail,
  AssetSearchResponse,
  AssetType,
  SourceInfo,
} from '@pimm/contracts';
import { decodeCursor, encodeCursor } from './cursor.js';
import { bboxIntersects, geometryBBox } from './geo.js';
import type { AssetQueryFilters, AssetRepository, AssetSearchInput } from './repository.js';
import { InvalidCursorError } from './repository.js';

/** Case/width-insensitive match target for keyword search. */
function searchable(text: string | null | undefined): string {
  return (text ?? '').normalize('NFKC').toLowerCase();
}

function matches(asset: AssetDetail, filters: AssetQueryFilters): boolean {
  if (filters.bbox && !bboxIntersects(geometryBBox(asset.geometry), filters.bbox)) return false;
  if (filters.types && !filters.types.includes(asset.type)) return false;
  if (filters.quality && !filters.quality.includes(asset.quality.status)) return false;
  if (filters.prefectureCode && asset.prefectureCode !== filters.prefectureCode) return false;
  if (filters.municipalityCode && asset.municipalityCode !== filters.municipalityCode) return false;
  if (filters.updatedSince) {
    if (!asset.sourceUpdatedAt) return false;
    // Compare as instants, not strings: differing (but equivalent) ISO offsets
    // — e.g. "+09:00" vs "Z", or "Z" vs ".000Z" — sort incorrectly as text.
    if (Date.parse(asset.sourceUpdatedAt) < Date.parse(filters.updatedSince)) return false;
  }
  if (filters.q) {
    const needle = searchable(filters.q);
    const haystack = [
      asset.name,
      asset.originalName,
      asset.managingAuthority,
      asset.municipalityCode,
    ]
      .map(searchable)
      .join('\n');
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/**
 * Repository backed by plain arrays. Powers sample mode and unit tests.
 * Visibility contract (published + not hidden) is enforced at construction
 * and in every read path.
 */
export class InMemoryAssetRepository implements AssetRepository {
  private readonly assets: AssetDetail[];
  private readonly sources: SourceInfo[];

  constructor(seed: { assets: AssetDetail[]; sources: SourceInfo[] }) {
    this.assets = seed.assets
      .filter((a) => a.publicationStatus === 'published' && a.quality.status !== 'hidden')
      .sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id));
    this.sources = [...seed.sources].sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async searchAssets(input: AssetSearchInput): Promise<AssetSearchResponse> {
    const offset = input.cursor === undefined ? 0 : decodeCursor(input.cursor)?.offset;
    if (offset === undefined) throw new InvalidCursorError();

    const filtered = this.assets.filter((a) => matches(a, input));
    const page = filtered.slice(offset, offset + input.limit);
    const nextOffset = offset + page.length;
    const summaries = page.map(
      ({
        originalName: _o,
        publicationStatus: _p,
        attributes: _a,
        source: _s,
        notices: _n,
        ...summary
      }) => summary,
    );
    return {
      items: summaries,
      nextCursor: nextOffset < filtered.length ? encodeCursor({ offset: nextOffset }) : null,
    };
  }

  getAssetById(id: string): Promise<AssetDetail | null> {
    return Promise.resolve(this.assets.find((a) => a.id === id) ?? null);
  }

  countByType(filters: Pick<AssetQueryFilters, 'bbox' | 'types'>): Promise<AssetCountSummary> {
    const byType: Partial<Record<AssetType, number>> = {};
    let total = 0;
    for (const asset of this.assets) {
      if (!matches(asset, filters)) continue;
      total += 1;
      byType[asset.type] = (byType[asset.type] ?? 0) + 1;
    }
    return Promise.resolve({ total, byType });
  }

  listSources(): Promise<SourceInfo[]> {
    return Promise.resolve(this.sources.filter((s) => s.enabled));
  }

  getSourceBySlug(slug: string): Promise<SourceInfo | null> {
    return Promise.resolve(this.sources.find((s) => s.slug === slug && s.enabled) ?? null);
  }

  exportAssets(input: AssetSearchInput): Promise<AssetDetail[]> {
    const filtered = this.assets.filter((a) => matches(a, input));
    return Promise.resolve(filtered.slice(0, input.limit));
  }
}
