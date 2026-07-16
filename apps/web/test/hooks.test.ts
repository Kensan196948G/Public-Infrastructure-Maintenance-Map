import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AssetSearchResponse } from '@pimm/contracts';
import { ApiClient } from '../src/api/client.js';
import { useAssets } from '../src/api/hooks.js';

function makeClient(searchAssets: ApiClient['searchAssets']) {
  const client = new ApiClient({ fetchImpl: vi.fn() });
  client.searchAssets = searchAssets;
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
});
