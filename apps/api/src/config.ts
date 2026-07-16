/** Runtime configuration derived from Worker bindings / process env. */
export interface ApiConfig {
  /** Neon connection string. Absent → sample mode (in-memory seed). */
  databaseUrl?: string;
  /** CORS allow-origin for browser clients. Default: same-origin usage only. */
  allowedOrigin: string;
  /** Requests per minute per client IP (in-isolate limiter; CF WAF is the real guard). */
  rateLimitPerMinute: number;
  version: string;
}

export interface EnvBindings {
  DATABASE_URL?: string;
  ALLOWED_ORIGIN?: string;
  RATE_LIMIT_PER_MINUTE?: string;
}

export function configFromEnv(env: EnvBindings): ApiConfig {
  const parsedLimit = Number(env.RATE_LIMIT_PER_MINUTE ?? '120');
  const config: ApiConfig = {
    allowedOrigin: env.ALLOWED_ORIGIN ?? '*',
    rateLimitPerMinute: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 120,
    version: '0.1.0',
  };
  if (env.DATABASE_URL) config.databaseUrl = env.DATABASE_URL;
  return config;
}
