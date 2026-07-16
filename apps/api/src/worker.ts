/**
 * Cloudflare Workers entry. Deploy config lives in wrangler.toml;
 * secrets (DATABASE_URL) are Worker secrets — never bundled.
 */
import { configFromEnv, type EnvBindings } from './config.js';
import { createApp } from './app.js';
import { getRepository } from './repo.js';

export default {
  async fetch(request: Request, env: EnvBindings): Promise<Response> {
    const config = configFromEnv(env);
    const repo = await getRepository(config);
    const app = createApp(repo, config);
    return app.fetch(request);
  },
};
