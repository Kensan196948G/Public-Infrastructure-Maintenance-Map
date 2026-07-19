/**
 * Hono application — /api/v1 (設計書 §7).
 * The repository is injected so tests and the Worker entry share one app factory.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ErrorCode, ProblemDetails } from '@pimm/contracts';
import {
  AdminCreateSourceSchema,
  AdminResolveQualityIssueSchema,
  AdminSuspendAssetSchema,
  AdminUpdateSourceSchema,
  AssetSearchQuerySchema,
  AssetSummaryQuerySchema,
  ExportQuerySchema,
  problem,
} from '@pimm/contracts';
import type { AssetRepository } from '@pimm/database';
import { InvalidCursorError } from '@pimm/database';
import type { ApiConfig } from './config.js';
import { assetsToCsv, assetsToGeoJson, partitionByLicense } from './csv-export.js';

interface AppState {
  requestId: string;
}

type AppContext = { Variables: AppState };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function problemResponse(p: ProblemDetails): Response {
  return new Response(JSON.stringify(p), {
    status: p.status,
    headers: { 'Content-Type': 'application/problem+json; charset=utf-8' },
  });
}

function zodIssuesToErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

function adminIdentity(
  c: { req: { header(name: string): string | undefined } },
  config: ApiConfig,
) {
  const email = c.req.header('CF-Access-Authenticated-User-Email');
  if (!email) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const roles = new Set<string>();
  if (config.adminEmails.includes(normalizedEmail)) roles.add('admin');
  if (config.reviewerEmails.includes(normalizedEmail)) roles.add('reviewer');
  return { email: normalizedEmail, roles: [...roles] };
}

function hasRole(identity: { roles: string[] }, allowed: readonly string[]) {
  return identity.roles.some((role) => allowed.includes(role));
}

/**
 * Fixed-window in-memory limiter. Per-isolate only — CF WAF fronts production.
 * Expired windows are evicted opportunistically so the Map cannot grow
 * unbounded across the isolate's lifetime under many distinct client keys.
 */
function createRateLimiter(limitPerMinute: number) {
  const windows = new Map<string, { start: number; count: number }>();
  return (clientKey: string, now: number): boolean => {
    for (const [key, w] of windows) {
      if (now - w.start >= 60_000) windows.delete(key);
    }
    const window = windows.get(clientKey);
    if (!window || now - window.start >= 60_000) {
      windows.set(clientKey, { start: now, count: 1 });
      return true;
    }
    window.count += 1;
    return window.count <= limitPerMinute;
  };
}

export function createApp(repo: AssetRepository, config: ApiConfig): Hono<AppContext> {
  const app = new Hono<AppContext>();
  const allowRequest = createRateLimiter(config.rateLimitPerMinute);

  // Request id + structured access log + security headers.
  app.use('*', async (c, next) => {
    const requestId = c.req.header('X-Request-Id') ?? crypto.randomUUID();
    c.set('requestId', requestId);
    const startedAt = Date.now();
    await next();
    c.header('X-Request-Id', requestId);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'pimm-api',
        event: 'request',
        request_id: requestId,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status_code: c.res.status,
        duration_ms: Date.now() - startedAt,
      }),
    );
  });

  app.use(
    '*',
    cors({
      origin: config.allowedOrigin,
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      credentials: config.allowedOrigin !== '*',
    }),
  );

  // Rate limit (429 + Retry-After). CF-Connecting-IP is set by Cloudflare's edge
  // and cannot be spoofed by clients; X-Forwarded-For is only a local-dev fallback
  // (trusted here because @hono/node-server has no reverse proxy in front of it)
  // and must not be trusted behind any other untrusted proxy.
  app.use('/api/*', async (c, next) => {
    const clientKey =
      c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'local';
    if (!allowRequest(clientKey, Date.now())) {
      const p = problem('RATE_LIMITED', 'リクエスト数が上限を超えました', {
        requestId: c.get('requestId'),
      });
      return c.body(JSON.stringify(p), 429, {
        'Content-Type': 'application/problem+json; charset=utf-8',
        'Retry-After': '60',
      });
    }
    return next();
  });

  const fail = (
    c: { get(key: 'requestId'): string },
    code: ErrorCode,
    title: string,
    extra?: Parameters<typeof problem>[2],
  ) => problemResponse(problem(code, title, { ...extra, requestId: c.get('requestId') }));

  const v1 = new Hono<AppContext>();
  const admin = new Hono<AppContext>();

  v1.get('/health', (c) =>
    c.json({ status: 'ok' as const, version: config.version, time: new Date().toISOString() }),
  );

  v1.get('/assets', async (c) => {
    const parsed = AssetSearchQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', '検索条件が不正です', {
        errors: zodIssuesToErrors(parsed.error),
      });
    }
    try {
      const result = await repo.searchAssets(parsed.data);
      c.header('Cache-Control', 'public, max-age=60');
      return c.json(result);
    } catch (e) {
      if (e instanceof InvalidCursorError) {
        return fail(c, 'VALIDATION_ERROR', 'cursor が不正です');
      }
      throw e;
    }
  });

  v1.get('/assets/summary', async (c) => {
    const parsed = AssetSummaryQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', '集計条件が不正です', {
        errors: zodIssuesToErrors(parsed.error),
      });
    }
    const filters: Parameters<AssetRepository['countByType']>[0] = {};
    if (parsed.data.bbox) filters.bbox = parsed.data.bbox;
    if (parsed.data.types) filters.types = parsed.data.types;
    const result = await repo.countByType(filters);
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(result);
  });

  v1.get('/assets/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) {
      return fail(c, 'VALIDATION_ERROR', 'id の形式が不正です');
    }
    const detail = await repo.getAssetById(id.toLowerCase());
    if (!detail) return fail(c, 'NOT_FOUND', '対象が見つかりません');
    c.header('Cache-Control', 'public, max-age=60');
    return c.json(detail);
  });

  v1.get('/sources', async (c) => {
    const items = await repo.listSources();
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ items });
  });

  v1.get('/sources/:slug', async (c) => {
    const source = await repo.getSourceBySlug(c.req.param('slug'));
    if (!source) return fail(c, 'NOT_FOUND', 'データソースが見つかりません');
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(source);
  });

  v1.get('/export', async (c) => {
    const parsed = ExportQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', '出力条件が不正です', {
        errors: zodIssuesToErrors(parsed.error),
      });
    }
    const { format, ...filters } = parsed.data;
    const [assets, sources] = await Promise.all([repo.exportAssets(filters), repo.listSources()]);
    const { exportable, excludedSources, attributions } = partitionByLicense(assets, sources);

    c.header('Cache-Control', 'no-store');
    c.header('X-Excluded-Sources', excludedSources.join(','));
    if (format === 'csv') {
      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', 'attachment; filename="pimm-export.csv"');
      return c.body(assetsToCsv(exportable));
    }
    c.header('Content-Type', 'application/geo+json; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="pimm-export.geojson"');
    return c.body(assetsToGeoJson(exportable, attributions, excludedSources));
  });

  admin.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const identity = adminIdentity(c, config);
    if (!identity) {
      return fail(c, 'UNAUTHORIZED', '管理APIの認証が必要です');
    }
    if (!hasRole(identity, ['admin', 'reviewer'])) {
      return fail(c, 'FORBIDDEN', '管理APIを利用する権限がありません');
    }
    return next();
  });

  admin.post('/sources', async (c) => {
    const identity = adminIdentity(c, config)!;
    if (!hasRole(identity, ['admin'])) return fail(c, 'FORBIDDEN', 'admin 権限が必要です');
    const parsed = AdminCreateSourceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'ソース登録内容が不正です', {
        errors: zodIssuesToErrors(parsed.error),
      });
    }
    const source = await repo.createSource(parsed.data);
    return c.json(source, 201);
  });

  admin.patch('/sources/:slug', async (c) => {
    const identity = adminIdentity(c, config)!;
    if (!hasRole(identity, ['admin'])) return fail(c, 'FORBIDDEN', 'admin 権限が必要です');
    const parsed = AdminUpdateSourceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', 'ソース更新内容が不正です', {
        errors: zodIssuesToErrors(parsed.error),
      });
    }
    const source = await repo.updateSource(c.req.param('slug'), parsed.data);
    if (!source) return fail(c, 'NOT_FOUND', 'データソースが見つかりません');
    return c.json(source);
  });

  admin.post('/sources/:slug/ingestions', async (c) => {
    const identity = adminIdentity(c, config)!;
    if (!hasRole(identity, ['admin'])) return fail(c, 'FORBIDDEN', 'admin 権限が必要です');
    const run = await repo.startIngestion(c.req.param('slug'), identity.email, c.get('requestId'));
    if (!run) return fail(c, 'NOT_FOUND', 'データソースが見つかりません');
    return c.json(run, 202);
  });

  admin.get('/ingestions/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return fail(c, 'VALIDATION_ERROR', 'id の形式が不正です');
    const detail = await repo.getIngestionDetail(id.toLowerCase());
    if (!detail) return fail(c, 'NOT_FOUND', '取込実行が見つかりません');
    return c.json(detail);
  });

  admin.post('/quality-issues/:id/resolve', async (c) => {
    const identity = adminIdentity(c, config)!;
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return fail(c, 'VALIDATION_ERROR', 'id の形式が不正です');
    const parsed = AdminResolveQualityIssueSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', '品質問題の解決内容が不正です', {
        errors: zodIssuesToErrors(parsed.error),
      });
    }
    const issue = await repo.resolveQualityIssue(id.toLowerCase(), parsed.data, identity.email);
    if (!issue) return fail(c, 'NOT_FOUND', '品質問題が見つかりません');
    return c.json(issue);
  });

  admin.post('/assets/:id/suspend', async (c) => {
    const identity = adminIdentity(c, config)!;
    if (!hasRole(identity, ['admin'])) return fail(c, 'FORBIDDEN', 'admin 権限が必要です');
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return fail(c, 'VALIDATION_ERROR', 'id の形式が不正です');
    const parsed = AdminSuspendAssetSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 'VALIDATION_ERROR', '公開停止理由が不正です', {
        errors: zodIssuesToErrors(parsed.error),
      });
    }
    const result = await repo.suspendAsset(id.toLowerCase(), parsed.data, identity.email);
    if (!result) return fail(c, 'NOT_FOUND', '対象が見つかりません');
    return c.json(result);
  });

  v1.route('/admin', admin);

  app.route('/api/v1', v1);

  app.notFound((c) =>
    problemResponse(
      problem('NOT_FOUND', '対象が見つかりません', { requestId: c.get('requestId') ?? '' }),
    ),
  );

  app.onError((err, c) => {
    // Never leak internals — log with request id, answer with Problem Details.
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'pimm-api',
        event: 'unhandled_error',
        request_id: c.get('requestId') ?? '',
        error_name: err.name,
        error_message: err.message,
      }),
    );
    return problemResponse(
      problem('INTERNAL_ERROR', '予期しないエラーが発生しました', {
        requestId: c.get('requestId') ?? '',
      }),
    );
  });

  return app;
}
