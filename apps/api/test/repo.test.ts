import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiConfig } from '../src/config.js';

const buildSampleSeedMock = vi.fn();
vi.mock('@pimm/source-adapters', () => ({
  buildSampleSeed: buildSampleSeedMock,
}));

const CONFIG: ApiConfig = {
  allowedOrigin: '*',
  rateLimitPerMinute: 10,
  version: 'test',
  adminEmails: [],
  reviewerEmails: [],
  requireAccessJwt: false,
};

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

describe('getRepository (production guard, Issue #3)', () => {
  it('refuses the sample fallback when requireDatabaseUrl is set but databaseUrl is absent', async () => {
    const { getRepository } = await import('../src/repo.js');

    await expect(getRepository({ ...CONFIG, requireDatabaseUrl: true })).rejects.toThrow(
      /REQUIRE_DATABASE_URL/,
    );
    expect(buildSampleSeedMock).not.toHaveBeenCalled();
  });

  it('emits a one-time structured warning when falling back to sample mode', async () => {
    buildSampleSeedMock.mockResolvedValue({ assets: [], sources: [] });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getRepository } = await import('../src/repo.js');
    await getRepository(CONFIG);
    await getRepository(CONFIG);

    const fallbackWarnings = warnSpy.mock.calls.filter((call) =>
      String(call[0]).includes('sample_mode_fallback'),
    );
    expect(fallbackWarnings).toHaveLength(1);
    warnSpy.mockRestore();
  });
});
