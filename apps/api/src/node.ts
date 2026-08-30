/**
 * Local development entry: `pnpm --filter @pimm/api dev` → http://localhost:8787
 *
 * Runs on Node (tsx), not in Cloudflare Workers. This is the ONLY place that
 * may use the postgres.js TCP driver: Workers cannot open raw TCP sockets, so
 * the Worker bundle (worker.ts) must stay on the Neon HTTP driver. When
 * DATABASE_URL points at a non-Neon host (e.g. a local Postgres), we inject a
 * postgres.js sql tag into the repository so local development talks to the
 * real local database instead of failing on Neon's HTTP protocol.
 */
import { serve } from '@hono/node-server';
import postgres from 'postgres';
import { configFromEnv } from './config.js';
import { createApp } from './app.js';
import { envBindingsFromProcessEnv } from './node-env.js';
import { getRepository } from './repo.js';

const config = configFromEnv(envBindingsFromProcessEnv(process.env));

// Node-only: non-Neon hosts (local Postgres) use the TCP driver. Neon hosts
// fall through to the driver picked inside PostgresAssetRepository (neon()).
let sqlOverride: unknown;
if (config.databaseUrl && !/neon\.tech(:\d+)?$/.test(new URL(config.databaseUrl).host)) {
  sqlOverride = postgres(config.databaseUrl, { max: 5 });
}

const repo = await getRepository(config, sqlOverride);
const app = createApp(repo, config);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 pimm-api listening on http://localhost:${info.port}/api/v1/health`);
});
