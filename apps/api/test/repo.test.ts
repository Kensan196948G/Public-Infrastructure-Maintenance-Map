import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiConfig } from '../src/config.js';

const buildSampleSeedMock = vi.fn();
vi.mock('@pimm/source-adapters', () => ({
  buildSampleSeed: buildSampleSeedMock,
}));

const CONFIG: ApiConfig = { allowedOrigin: '*', rateLimitPerMinute: 10, version: 'test' };

beforeEach(() => {
  vi.resetModules();
  buildSampleSeedMock.mockReset();
});

describe('getRepository (sample mode)', () => {
  it('retries after a failed build instead of caching the rejection forever', async () => {
    buildSampleSeedMock
      .mockRejectedValueOnce(new Error('seed build failed'))
      .mockResolvedValueOnce({ assets: [], sources: [] });

    const { getRepository } = await import('../src/repo.js');

    await expect(getRepository(CONFIG)).rejects.toThrow('seed build failed');
    await expect(getRepository(CONFIG)).resolves.toBeDefined();
    expect(buildSampleSeedMock).toHaveBeenCalledTimes(2);
  });

  it('caches a successful build across calls', async () => {
    buildSampleSeedMock.mockResolvedValue({ assets: [], sources: [] });

    const { getRepository } = await import('../src/repo.js');

    const first = await getRepository(CONFIG);
    const second = await getRepository(CONFIG);
    expect(second).toBe(first);
    expect(buildSampleSeedMock).toHaveBeenCalledTimes(1);
  });
});
