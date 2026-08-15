import type { EnvBindings } from './config.js';

/**
 * Every key configFromEnv understands.
 *
 * Typed as `readonly (keyof EnvBindings)[]` with an exhaustiveness assertion
 * below, so adding a binding without listing it here is a compile error rather
 * than a setting that is silently dropped at runtime.
 */
const FORWARDED_KEYS = [
  'DATABASE_URL',
  'ALLOWED_ORIGIN',
  'RATE_LIMIT_PER_MINUTE',
  'REQUIRE_DATABASE_URL',
  'ADMIN_EMAILS',
  'REVIEWER_EMAILS',
  'CLOUDFLARE_ACCESS_AUD',
  'CLOUDFLARE_ACCESS_TEAM_DOMAIN',
  'REQUIRE_ACCESS_JWT',
  'DEMO_ADMIN_ENABLED',
] as const satisfies readonly (keyof EnvBindings)[];

// Fails to compile if EnvBindings gains a key that FORWARDED_KEYS omits.
type MissingKeys = Exclude<keyof EnvBindings, (typeof FORWARDED_KEYS)[number]>;
const _exhaustive: MissingKeys extends never ? true : never = true;
void _exhaustive;

/** Forwards the subset of process.env that configFromEnv understands. */
export function envBindingsFromProcessEnv(env: NodeJS.ProcessEnv): EnvBindings {
  const bindings: EnvBindings = {};
  for (const key of FORWARDED_KEYS) {
    const value = env[key];
    if (value) bindings[key] = value;
  }
  return bindings;
}
