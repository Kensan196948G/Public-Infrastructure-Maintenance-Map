import type { EnvBindings } from './config.js';

/** Forwards the subset of process.env that configFromEnv understands. */
export function envBindingsFromProcessEnv(env: NodeJS.ProcessEnv): EnvBindings {
  return {
    ...(env['DATABASE_URL'] ? { DATABASE_URL: env['DATABASE_URL'] } : {}),
    ...(env['ALLOWED_ORIGIN'] ? { ALLOWED_ORIGIN: env['ALLOWED_ORIGIN'] } : {}),
    ...(env['RATE_LIMIT_PER_MINUTE']
      ? { RATE_LIMIT_PER_MINUTE: env['RATE_LIMIT_PER_MINUTE'] }
      : {}),
  };
}
