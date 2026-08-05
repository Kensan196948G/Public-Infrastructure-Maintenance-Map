import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AssetSummary, AssetType, BBox, QualityStatus } from '@pimm/contracts';
import { ApiClient, type AssetSearchParams } from './client.js';
import { isBboxQueryable } from '../lib/bbox.js';

/** A single shared client instance for the app's default (real) fetch. */
const defaultClient = new ApiClient();

export interface AssetsQueryInput {
  bbox: BBox | null;
  types: readonly AssetType[];
  quality: readonly QualityStatus[];
  q: string;
  /** When set, the list is prefecture-scoped and the viewport bbox is ignored. */
  prefectureCode?: string | null;
  /** Page size sent to the API. Defaults to 200 (the API cap is 500). */
  limit?: number;
}

export interface AssetsRequest {
  params: AssetSearchParams;
  cacheKey: unknown[];
}

/**
 * Pure builder shared by useAssets and usePagedAssets so the "load more" page
 * uses exactly the same bbox rounding / filter serialization as the first page.
 */
export function buildAssetsRequest(input: AssetsQueryInput & { limit: number }): AssetsRequest {
  const prefectureCode = input.prefectureCode ?? null;
  // At low zoom (e.g. the default country-wide view) the viewport can exceed
  // the server's bbox area guard — omit bbox rather than erroring; the query
  // still runs, just unfiltered by area (bounded by `limit` instead).
  // Prefecture mode drops the bbox entirely so moving the map cannot shrink
  // the prefecture-wide list.
  const queryableBbox = prefectureCode === null && isBboxQueryable(input.bbox) ? input.bbox : null;
  const requestBbox: BBox | null = queryableBbox
    ? [
        Number(queryableBbox[0].toFixed(3)),
        Number(queryableBbox[1].toFixed(3)),
        Number(queryableBbox[2].toFixed(3)),
        Number(queryableBbox[3].toFixed(3)),
      ]
    : null;

  // Round bbox for a stable cache key so tiny map jitters don't refetch.
  const cacheKey: unknown[] = [
    'assets',
    requestBbox,
    prefectureCode,
    [...input.types].sort(),
    [...input.quality].sort(),
    input.q.trim(),
    input.limit,
  ];
  const params: AssetSearchParams = {
    ...(requestBbox ? { bbox: requestBbox } : {}),
    ...(prefectureCode ? { prefectureCode } : {}),
    types: input.types,
    quality: input.quality,
    q: input.q,
    limit: input.limit,
  };
  return { params, cacheKey };
}

/** Fetches assets within the current viewport; re-runs when bbox/filters change. */
export function useAssets(input: AssetsQueryInput, client: ApiClient = defaultClient) {
  const { bbox, prefectureCode, types, quality, q, limit } = input;
  const request = useMemo(
    () =>
      buildAssetsRequest({
        bbox,
        prefectureCode: prefectureCode ?? null,
        types,
        quality,
        q,
        limit: limit ?? 200,
      }),
    [bbox, prefectureCode, types, quality, q, limit],
  );

  return useQuery({
    queryKey: request.cacheKey,
    enabled: input.bbox !== null || prefectureCode !== null,
    queryFn: () => {
      // An empty type or quality selection can never match anything — resolve
      // to an empty result locally instead of asking the server for "all"
      // (the API treats an omitted filter as "no restriction", not "none").
      if (input.types.length === 0 || input.quality.length === 0) {
        return Promise.resolve({ items: [], nextCursor: null });
      }
      return client.searchAssets(request.params);
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export interface PagedAssetsResult {
  items: AssetSummary[];
  isLoading: boolean;
  isError: boolean;
  /** True when the server reported another page (nextCursor is present). */
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: boolean;
  loadMore: () => Promise<void>;
}

/**
 * First page via react-query + manual cursor appends. Extra pages are kept in
 * component state and reset whenever the first-page data changes (filter move,
 * refresh, etc.).
 */
export function usePagedAssets(
  input: AssetsQueryInput,
  client: ApiClient = defaultClient,
): PagedAssetsResult {
  const base = useAssets(input, client);
  const { bbox, prefectureCode, types, quality, q, limit } = input;
  const request = useMemo(
    () =>
      buildAssetsRequest({
        bbox,
        prefectureCode: prefectureCode ?? null,
        types,
        quality,
        q,
        limit: limit ?? 200,
      }),
    [bbox, prefectureCode, types, quality, q, limit],
  );

  const [extraItems, setExtraItems] = useState<AssetSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  // Reset appended pages whenever the first page (or its cursor) changes.
  useEffect(() => {
    setExtraItems([]);
    setCursor(base.data?.nextCursor ?? null);
    setLoadMoreError(false);
  }, [base.data]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setIsLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await client.searchAssets({ ...request.params, cursor });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [client, request.params, cursor]);

  return {
    items: useMemo(() => [...(base.data?.items ?? []), ...extraItems], [base.data, extraItems]),
    isLoading: base.isLoading,
    isError: base.isError,
    hasMore: cursor !== null,
    isLoadingMore,
    loadMoreError,
    loadMore,
  };
}

/** Country-wide counts (byType / byPrefecture) that feed the prefecture menu. */
export function useSummary(client: ApiClient = defaultClient) {
  return useQuery({
    queryKey: ['summary', 'country'],
    queryFn: () => client.getSummary({}),
    staleTime: 5 * 60_000,
  });
}

/** Fetches full detail for the selected asset; disabled when nothing selected. */
export function useAssetDetail(id: string | null, client: ApiClient = defaultClient) {
  return useQuery({
    queryKey: ['asset', id],
    enabled: id !== null,
    queryFn: () => client.getAsset(id as string),
  });
}

/** Fetches the public data-source catalogue (UI-03); only when the dialog opens. */
export function useSources(enabled: boolean, client: ApiClient = defaultClient) {
  return useQuery({
    queryKey: ['sources'],
    enabled,
    queryFn: () => client.getSources(),
    staleTime: 5 * 60_000,
  });
}

/** Fetches API liveness/version for the system-settings view; only when opened. */
export function useHealth(enabled: boolean, client: ApiClient = defaultClient) {
  return useQuery({
    queryKey: ['health'],
    enabled,
    queryFn: () => client.getHealth(),
    staleTime: 60_000,
  });
}
