import type { AssetRepository } from '@pimm/database';
import { InMemoryAssetRepository, PostgresAssetRepository } from '@pimm/database';
import { buildSampleSeed } from '@pimm/source-adapters';
import type { ApiConfig } from './config.js';

let sampleRepoPromise: Promise<AssetRepository> | null = null;

/**
 * DATABASE_URL present → Neon/PostGIS. Absent → sample mode: the real
 * ingestion pipeline runs once per isolate over the bundled sample sources.
 */
export function getRepository(config: ApiConfig): Promise<AssetRepository> {
  if (config.databaseUrl) {
    return Promise.resolve(new PostgresAssetRepository(config.databaseUrl));
  }
  sampleRepoPromise ??= buildSampleSeed()
    .then((seed) => new InMemoryAssetRepository(seed))
    .catch((err: unknown) => {
      sampleRepoPromise = null;
      throw err;
    });
  return sampleRepoPromise;
}
