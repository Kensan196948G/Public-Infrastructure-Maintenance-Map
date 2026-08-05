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
import { PostgresAssetRepository } from '@pimm/database';
import { getWorkerAdapterBySlug } from '@pimm/source-adapters/worker-adapters';
import { configFromEnv, type EnvBindings } from './config.js';
import { createApp } from './app.js';
import { ingestSource, publishIngestion } from './ingest-runner.js';
import { getRepository } from './repo.js';
import { selectDueSources } from './scheduler.js';

let appPromise: Promise<Hono<never>> | null = null;

function logScheduled(
  level: 'info' | 'warn' | 'error',
  event: string,
  extra: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: 'pimm-api',
      event,
      ...extra,
    }),
  );
}

/**
 * Scheduled refresh (Cloudflare Cron Trigger). Runs the real pipeline + publish
 * for sources whose refresh_cron matches the current time. Only worker-safe
 * adapters (worker-adapters.ts) participate; 大容量の河川 W05 は CLI 運用。
 */
async function runScheduledIngestions(env: EnvBindings): Promise<void> {
  const config = configFromEnv(env);
  if (!config.databaseUrl) {
    logScheduled('warn', 'scheduled_skip_no_database', {
      message: 'DATABASE_URL 未設定のため自動取込をスキップしました',
    });
    return;
  }
  try {
    const repo = new PostgresAssetRepository(config.databaseUrl);
    const [sources, ops] = await Promise.all([repo.listSources(), repo.getOperationsSummary()]);
    const lastRunBySlug = new Map(ops.sources.map((s) => [s.slug, s.lastRunAt]));
    const due = selectDueSources(
      sources.map((source) => ({
        slug: source.slug,
        refreshCron: source.refreshCron,
        lastRunAt: lastRunBySlug.get(source.slug) ?? null,
      })),
      new Date(),
    );
    logScheduled('info', 'scheduled_selected', { due, totalSources: sources.length });

    for (const slug of due) {
      const adapter = getWorkerAdapterBySlug(slug);
      if (!adapter) {
        logScheduled('warn', 'scheduled_ingestion_unsupported', {
          slug,
          message:
            'このソースはWorker実行対象外です（W05大容量/サンプル等）。CLIで実行してください。',
        });
        continue;
      }
      try {
        const result = await ingestSource(adapter);
        await publishIngestion({
          adapter,
          result,
          databaseUrl: config.databaseUrl,
          triggeredBy: 'cron',
          correlationId: crypto.randomUUID(),
        });
        logScheduled('info', 'scheduled_ingestion_succeeded', {
          slug,
          fetched: result.counts.fetched,
          accepted: result.counts.accepted,
          quarantined: result.counts.quarantined,
        });
      } catch (error) {
        logScheduled('error', 'scheduled_ingestion_failed', {
          slug,
          error_name: error instanceof Error ? error.name : 'UnknownError',
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logScheduled('error', 'scheduled_run_failed', {
      error_name: error instanceof Error ? error.name : 'UnknownError',
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}

function getApp(env: EnvBindings): Promise<Hono<never>> {
  appPromise ??= (async () => {
    const config = configFromEnv(env);
    const repo = await getRepository(config);
    return createApp(repo, config) as unknown as Hono<never>;
  })().catch((err: unknown) => {
    // Initialization failed — drop the cached promise so the next request
    // (possibly on a fresh isolate boot or after a transient outage) retries
    // instead of replaying this same rejection for the isolate's lifetime.
    appPromise = null;
    throw err;
  });
  return appPromise;
}

export default {
  async fetch(request: Request, env: EnvBindings): Promise<Response> {
    const app = await getApp(env);
    return app.fetch(request);
  },

  async scheduled(_controller: unknown, env: EnvBindings): Promise<void> {
    await runScheduledIngestions(env);
  },
};
