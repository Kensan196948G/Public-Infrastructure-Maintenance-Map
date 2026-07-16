import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAssetRepository } from '@pimm/database';
import { buildSampleSeed } from '@pimm/source-adapters';
import type { EnvBindings } from '../src/config.js';

const getRepositoryMock = vi.fn();
vi.mock('../src/repo.js', () => ({
  getRepository: getRepositoryMock,
}));

const ENV: EnvBindings = {};

beforeEach(() => {
  vi.resetModules();
  getRepositoryMock.mockReset();
});

describe('Worker fetch', () => {
  it('retries app initialization after a failure instead of caching the rejection', async () => {
    const seed = await buildSampleSeed();
    getRepositoryMock
      .mockRejectedValueOnce(new Error('db unreachable'))
      .mockResolvedValueOnce(new InMemoryAssetRepository(seed));

    const worker = (await import('../src/worker.js')).default;
    const request = () => worker.fetch(new Request('http://localhost/api/v1/health'), ENV);

    await expect(request()).rejects.toThrow('db unreachable');

    const res = await request();
    expect(res.status).toBe(200);
    expect(getRepositoryMock).toHaveBeenCalledTimes(2);
  });

  it('reuses the same app across requests once initialization succeeds', async () => {
    const seed = await buildSampleSeed();
    getRepositoryMock.mockResolvedValue(new InMemoryAssetRepository(seed));

    const worker = (await import('../src/worker.js')).default;
    const request = () => worker.fetch(new Request('http://localhost/api/v1/health'), ENV);

    await request();
    await request();
    expect(getRepositoryMock).toHaveBeenCalledTimes(1);
  });
});
