import { describe, expect, it } from 'vitest';
import { envBindingsFromProcessEnv } from '../src/node-env.js';

describe('envBindingsFromProcessEnv', () => {
  it('forwards supported runtime environment variables when set', () => {
    const env = {
      DATABASE_URL: 'postgres://example',
      ALLOWED_ORIGIN: 'https://example.com',
      RATE_LIMIT_PER_MINUTE: '42',
      ADMIN_EMAILS: 'admin@example.com',
      REVIEWER_EMAILS: 'reviewer@example.com',
    } as NodeJS.ProcessEnv;
    expect(envBindingsFromProcessEnv(env)).toEqual({
      DATABASE_URL: 'postgres://example',
      ALLOWED_ORIGIN: 'https://example.com',
      RATE_LIMIT_PER_MINUTE: '42',
      ADMIN_EMAILS: 'admin@example.com',
      REVIEWER_EMAILS: 'reviewer@example.com',
    });
  });

  it('omits keys that are absent from process.env', () => {
    expect(envBindingsFromProcessEnv({} as NodeJS.ProcessEnv)).toEqual({});
  });

  // A binding dropped here is not a compile error at the call site — it just
  // silently disables the feature it configures, which is how the Access
  // settings first shipped without taking effect.
  it('forwards the Cloudflare Access settings', () => {
    const env = {
      CLOUDFLARE_ACCESS_AUD: 'aud-tag',
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
      REQUIRE_ACCESS_JWT: 'true',
    } as NodeJS.ProcessEnv;
    expect(envBindingsFromProcessEnv(env)).toEqual({
      CLOUDFLARE_ACCESS_AUD: 'aud-tag',
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
      REQUIRE_ACCESS_JWT: 'true',
    });
  });
});
