/**
 * Cloudflare Workers entry. Deploy config lives in wrangler.toml;
 * secrets (DATABASE_URL) are Worker secrets — never bundled.
 *
 * The app (and its in-memory rate limiter) is built once per isolate and
 * reused across requests — module-scope state persists for the isolate's
 * lifetime in Workers. Rebuilding it per request (as an earlier version did)
 * silently defeats the rate limiter: every request would look like the first
 * one in a fresh, empty window.
 */
import type { Hono } from 'hono';
import { configFromEnv, type EnvBindings } from './config.js';
import { createApp } from './app.js';
import { getRepository } from './repo.js';

let appPromise: Promise<Hono<never>> | null = null;

function getApp(env: EnvBindings): Promise<Hono<never>> {
  appPromise ??= (async () => {
    const config = configFromEnv(env);
    const repo = await getRepository(config);
    return createApp(repo, config) as unknown as Hono<never>;
  })();
  return appPromise;
}

export default {
  async fetch(request: Request, env: EnvBindings): Promise<Response> {
    const app = await getApp(env);
    return app.fetch(request);
  },
};
