import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AssetType, BBox, QualityStatus } from '@pimm/contracts';
import { ApiClient } from './client.js';
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
}

/** Fetches assets within the current viewport; re-runs when bbox/filters change. */
export function useAssets(input: AssetsQueryInput, client: ApiClient = defaultClient) {
  const prefectureCode = input.prefectureCode ?? null;
  // At low zoom (e.g. the default country-wide view) the viewport can exceed
  // the server's bbox area guard — omit bbox rather than erroring; the query
  // still runs, just unfiltered by area (bounded by `limit` instead).
  // Prefecture mode drops the bbox entirely so moving the map cannot shrink
  // the prefecture-wide list.
  const queryableBbox = prefectureCode === null && isBboxQueryable(input.bbox) ? input.bbox : null;
  const requestBbox = useMemo<BBox | null>(
    () =>
      queryableBbox
        ? [
            Number(queryableBbox[0].toFixed(3)),
            Number(queryableBbox[1].toFixed(3)),
            Number(queryableBbox[2].toFixed(3)),
            Number(queryableBbox[3].toFixed(3)),
          ]
        : null,
    [queryableBbox],
  );

  // Round bbox for a stable cache key so tiny map jitters don't refetch.
  const key = useMemo(
    () => [
      'assets',
      requestBbox,
      prefectureCode,
      [...input.types].sort(),
      [...input.quality].sort(),
      input.q.trim(),
    ],
    [requestBbox, prefectureCode, input.types, input.quality, input.q],
  );

  return useQuery({
    queryKey: key,
    enabled: input.bbox !== null || prefectureCode !== null,
    queryFn: () => {
      // An empty type or quality selection can never match anything — resolve
      // to an empty result locally instead of asking the server for "all"
      // (the API treats an omitted filter as "no restriction", not "none").
      if (input.types.length === 0 || input.quality.length === 0) {
        return Promise.resolve({ items: [], nextCursor: null });
      }
      return client.searchAssets({
        ...(requestBbox ? { bbox: requestBbox } : {}),
        ...(prefectureCode ? { prefectureCode } : {}),
        types: input.types,
        quality: input.quality,
        q: input.q,
        limit: 200,
      });
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
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
