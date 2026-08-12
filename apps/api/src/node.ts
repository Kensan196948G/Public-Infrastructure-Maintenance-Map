/** Local development entry: `pnpm --filter @pimm/api dev` → http://localhost:8787 */
import { serve } from '@hono/node-server';
import { configFromEnv } from './config.js';
import { createApp } from './app.js';
import { envBindingsFromProcessEnv } from './node-env.js';
import { getRepository } from './repo.js';

const config = configFromEnv(envBindingsFromProcessEnv(process.env));

const repo = await getRepository(config);
const app = createApp(repo, config);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 pimm-api listening on http://localhost:${info.port}/api/v1/health`);
});
