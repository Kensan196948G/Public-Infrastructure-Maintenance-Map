import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AssetSearchResponse } from '@pimm/contracts';
import { ApiClient } from '../src/api/client.js';
import { useAdminAccess, useAssets, usePagedAssets } from '../src/api/hooks.js';
import { bridgeSummary, riverSummary } from './fixtures.js';

function makeClient(searchAssets: ApiClient['searchAssets']) {
  const client = new ApiClient({ fetchImpl: vi.fn() });
  client.searchAssets = searchAssets;
  return client;
}

function makeAdminClient(getAdminOperations: ApiClient['getAdminOperations']) {
  const client = new ApiClient({ fetchImpl: vi.fn() });
  client.getAdminOperations = getAdminOperations;
  return client;
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: queryClient, children });
}

describe('useAssets', () => {
  it('does not call the API when types is empty (matches nothing)', async () => {
    const searchAssets = vi.fn<ApiClient['searchAssets']>();
    const client = makeClient(searchAssets);

    const { result } = renderHook(
      () =>
        useAssets({ bbox: [139, 35, 140, 36], types: [], quality: ['verified'], q: '' }, client),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [], nextCursor: null });
    expect(searchAssets).not.toHaveBeenCalled();
  });

  it('does not call the API when quality is empty (matches nothing)', async () => {
    const searchAssets = vi.fn<ApiClient['searchAssets']>();
    const client = makeClient(searchAssets);

    const { result } = renderHook(
      () => useAssets({ bbox: [139, 35, 140, 36], types: ['bridge'], quality: [], q: '' }, client),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [], nextCursor: null });
    expect(searchAssets).not.toHaveBeenCalled();
  });

  it('omits bbox when the viewport exceeds the server area guard (the H-2 regression)', async () => {
    const response: AssetSearchResponse = { items: [], nextCursor: null };
    const searchAssets = vi.fn<ApiClient['searchAssets']>().mockResolvedValue(response);
    const client = makeClient(searchAssets);

    // Roughly Japan's full extent, as shown at the default zoom-5 view.
    const countryScaleBbox: [number, number, number, number] = [122, 24, 154, 46];

    const { result } = renderHook(
      () =>
        useAssets(
          { bbox: countryScaleBbox, types: ['bridge'], quality: ['verified'], q: '' },
          client,
        ),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchAssets).toHaveBeenCalledTimes(1);
    expect(searchAssets.mock.calls[0]?.[0]).not.toHaveProperty('bbox');
  });

  it('sends bbox when the viewport is within the server area guard', async () => {
    const response: AssetSearchResponse = { items: [], nextCursor: null };
    const searchAssets = vi.fn<ApiClient['searchAssets']>().mockResolvedValue(response);
    const client = makeClient(searchAssets);

    const smallBbox: [number, number, number, number] = [139.6, 35.6, 139.9, 35.8];

    const { result } = renderHook(
      () => useAssets({ bbox: smallBbox, types: ['bridge'], quality: ['verified'], q: '' }, client),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchAssets.mock.calls[0]?.[0]).toMatchObject({ bbox: smallBbox });
  });

  it('uses the same rounded bbox for the cache key and the API request', async () => {
    const response: AssetSearchResponse = { items: [], nextCursor: null };
    const searchAssets = vi.fn<ApiClient['searchAssets']>().mockResolvedValue(response);
    const client = makeClient(searchAssets);

    const jitteredBbox: [number, number, number, number] = [
      139.60049, 35.60049, 139.90049, 35.80049,
    ];

    const { result } = renderHook(
      () =>
        useAssets({ bbox: jitteredBbox, types: ['bridge'], quality: ['verified'], q: '' }, client),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchAssets.mock.calls[0]?.[0]).toMatchObject({
      bbox: [139.6, 35.6, 139.9, 35.8],
    });
  });
});

describe('usePagedAssets', () => {
  it('appends cursor pages and exposes hasMore', async () => {
    const searchAssets = vi
      .fn<ApiClient['searchAssets']>()
      .mockResolvedValueOnce({ items: [bridgeSummary], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [riverSummary], nextCursor: null });
    const client = makeClient(searchAssets);

    const { result } = renderHook(
      () =>
        usePagedAssets(
          {
            bbox: [139, 35, 140, 36],
            types: ['bridge', 'river'],
            quality: ['verified'],
            q: '',
          },
          client,
        ),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.items).toEqual([bridgeSummary]));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items).toEqual([bridgeSummary, riverSummary]);
    expect(result.current.hasMore).toBe(false);
    expect(searchAssets).toHaveBeenCalledTimes(2);
    expect(searchAssets.mock.calls[1]?.[0]).toMatchObject({ cursor: 'c1' });
  });

  it('surfaces load-more failures without losing the first page', async () => {
    const searchAssets = vi
      .fn<ApiClient['searchAssets']>()
      .mockResolvedValueOnce({ items: [bridgeSummary], nextCursor: 'c1' })
      .mockRejectedValueOnce(new Error('boom'));
    const client = makeClient(searchAssets);

    const { result } = renderHook(
      () =>
        usePagedAssets(
          { bbox: [139, 35, 140, 36], types: ['bridge'], quality: ['verified'], q: '' },
          client,
        ),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.items).toEqual([bridgeSummary]));
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.loadMoreError).toBe(true);
    expect(result.current.items).toEqual([bridgeSummary]);
    expect(result.current.hasMore).toBe(true);
  });
});

describe('useAdminAccess', () => {
  it('reports granted when the ops endpoint succeeds', async () => {
    const client = makeAdminClient(vi.fn().mockResolvedValue({}));
    const { result } = renderHook(() => useAdminAccess(client), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.status).toBe('granted'));
  });

  it('reports denied when the ops endpoint rejects (unauthenticated)', async () => {
    const client = makeAdminClient(vi.fn().mockRejectedValue(new Error('denied')));
    const { result } = renderHook(() => useAdminAccess(client), { wrapper: wrapper() });
    // retry: 1 applies an exponential backoff before settling on the error state.
    await waitFor(() => expect(result.current.status).toBe('denied'), { timeout: 5000 });
  });
});
