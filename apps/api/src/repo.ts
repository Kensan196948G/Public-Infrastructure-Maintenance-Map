import type { AssetRepository } from '@pimm/database';
import { InMemoryAssetRepository, PostgresAssetRepository } from '@pimm/database';
import { buildSampleSeed } from '@pimm/source-adapters';
import type { ApiConfig } from './config.js';

let sampleRepoPromise: Promise<AssetRepository> | null = null;
let sampleModeWarned = false;

/**
 * DATABASE_URL present → Neon/PostGIS. Absent → sample mode: the real
 * ingestion pipeline runs once per isolate over the bundled sample sources.
 *
 * Sample mode serves bundled fictional data, so an accidentally-missing
 * DATABASE_URL in production would silently look like a working deploy. To make
 * that detectable, config.requireDatabaseUrl (REQUIRE_DATABASE_URL) turns the
 * fallback into a hard error, and otherwise the fallback emits a one-time
 * structured warning (visible in Workers observability / node logs).
 */
export function getRepository(config: ApiConfig): Promise<AssetRepository> {
  if (config.databaseUrl) {
    return Promise.resolve(new PostgresAssetRepository(config.databaseUrl));
  }
  if (config.requireDatabaseUrl) {
    return Promise.reject(
      new Error(
        'DATABASE_URL is not set but REQUIRE_DATABASE_URL is enabled — refusing to serve bundled sample data.',
      ),
    );
  }
  if (!sampleModeWarned) {
    sampleModeWarned = true;
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'pimm-api',
        event: 'sample_mode_fallback',
        message:
          'DATABASE_URL not set — serving bundled fictional sample data. Set DATABASE_URL (or REQUIRE_DATABASE_URL to fail fast) for production.',
      }),
    );
  }
  sampleRepoPromise ??= buildSampleSeed()
    .then((seed) => new InMemoryAssetRepository(seed))
    .catch((err: unknown) => {
      sampleRepoPromise = null;
      throw err;
    });
  return sampleRepoPromise;
}
