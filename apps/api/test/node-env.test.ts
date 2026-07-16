import { describe, expect, it } from 'vitest';
import { envBindingsFromProcessEnv } from '../src/node-env.js';

describe('envBindingsFromProcessEnv', () => {
  it('forwards DATABASE_URL, ALLOWED_ORIGIN and RATE_LIMIT_PER_MINUTE when set', () => {
    const env = {
      DATABASE_URL: 'postgres://example',
      ALLOWED_ORIGIN: 'https://example.com',
      RATE_LIMIT_PER_MINUTE: '42',
    } as NodeJS.ProcessEnv;
    expect(envBindingsFromProcessEnv(env)).toEqual({
      DATABASE_URL: 'postgres://example',
      ALLOWED_ORIGIN: 'https://example.com',
      RATE_LIMIT_PER_MINUTE: '42',
    });
  });

  it('omits keys that are absent from process.env', () => {
    expect(envBindingsFromProcessEnv({} as NodeJS.ProcessEnv)).toEqual({});
  });
});
