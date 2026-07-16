import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AssetType, BBox, QualityStatus } from '@pimm/contracts';
import { ApiClient } from './client.js';

/** A single shared client instance for the app's default (real) fetch. */
const defaultClient = new ApiClient();

export interface AssetsQueryInput {
  bbox: BBox | null;
  types: readonly AssetType[];
  quality: readonly QualityStatus[];
  q: string;
}

/** Fetches assets within the current viewport; re-runs when bbox/filters change. */
export function useAssets(input: AssetsQueryInput, client: ApiClient = defaultClient) {
  // Round bbox for a stable cache key so tiny map jitters don't refetch.
  const key = useMemo(
    () => [
      'assets',
      input.bbox ? input.bbox.map((n) => Number(n.toFixed(3))) : null,
      [...input.types].sort(),
      [...input.quality].sort(),
      input.q.trim(),
    ],
    [input.bbox, input.types, input.quality, input.q],
  );

  return useQuery({
    queryKey: key,
    enabled: input.bbox !== null,
    queryFn: () =>
      client.searchAssets({
        ...(input.bbox ? { bbox: input.bbox } : {}),
        types: input.types,
        quality: input.quality,
        q: input.q,
        limit: 200,
      }),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
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
