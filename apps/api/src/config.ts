/** Runtime configuration derived from Worker bindings / process env. */
export interface ApiConfig {
  /** Neon connection string. Absent → sample mode (in-memory seed). */
  databaseUrl?: string;
  /**
   * CORS allow-origin for browser clients. Defaults to '*' — acceptable here
   * because every /api/v1 route is unauthenticated GET-only public data with
   * no cookies. Set ALLOWED_ORIGIN explicitly once the web app has a fixed
   * production origin, to reduce cross-site scraping of the public API.
   */
  allowedOrigin: string;
  /** Requests per minute per client IP (in-isolate limiter; CF WAF is the real guard). */
  rateLimitPerMinute: number;
  version: string;
  /**
   * When true, getRepository refuses to fall back to bundled fictional sample
   * data if databaseUrl is absent (it throws instead). Set REQUIRE_DATABASE_URL
   * in production so a missing/misconfigured DATABASE_URL fails loudly rather
   * than silently serving samples that look like real infrastructure data.
   * Absent → false (sample fallback allowed; the local-dev default).
   */
  requireDatabaseUrl?: boolean;
  /** Server-side allowlist for admin API write operations. */
  adminEmails: readonly string[];
  /** Server-side allowlist for admin API read/review operations. */
  reviewerEmails: readonly string[];
  /** Access application AUD tag. Required to verify Cf-Access-Jwt-Assertion. */
  accessAud?: string;
  /** Access team hostname, e.g. `example.cloudflareaccess.com`. */
  accessTeamDomain?: string;
  /**
   * When true, admin routes verify an Access JWT and refuse to serve at all if
   * accessAud/accessTeamDomain are missing. Set in production so that a
   * misconfigured Access integration fails closed instead of falling back to
   * trusting the spoofable CF-Access-Authenticated-User-Email header.
   */
  requireAccessJwt: boolean;
}

export interface EnvBindings {
  DATABASE_URL?: string;
  ALLOWED_ORIGIN?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  REQUIRE_DATABASE_URL?: string;
  ADMIN_EMAILS?: string;
  REVIEWER_EMAILS?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN?: string;
  REQUIRE_ACCESS_JWT?: string;
}

/** Truthy env-string parse: 'true'/'1' (case-insensitive) enable the flag. */
function envFlag(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true' || value === '1';
}

function csvEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function configFromEnv(env: EnvBindings): ApiConfig {
  const parsedLimit = Number(env.RATE_LIMIT_PER_MINUTE ?? '120');
  const config: ApiConfig = {
    allowedOrigin: env.ALLOWED_ORIGIN ?? '*',
    rateLimitPerMinute: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 120,
    version: '0.1.0',
    requireDatabaseUrl: envFlag(env.REQUIRE_DATABASE_URL),
    adminEmails: csvEmails(env.ADMIN_EMAILS),
    reviewerEmails: csvEmails(env.REVIEWER_EMAILS),
    // Configuring either Access setting turns enforcement on, so the pair can
    // never sit in the environment as decorative dead config.
    requireAccessJwt:
      envFlag(env.REQUIRE_ACCESS_JWT) ||
      Boolean(env.CLOUDFLARE_ACCESS_AUD) ||
      Boolean(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN),
  };
  if (env.DATABASE_URL) config.databaseUrl = env.DATABASE_URL;
  if (env.CLOUDFLARE_ACCESS_AUD) config.accessAud = env.CLOUDFLARE_ACCESS_AUD;
  if (env.CLOUDFLARE_ACCESS_TEAM_DOMAIN) {
    config.accessTeamDomain = env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
  }
  return config;
}
