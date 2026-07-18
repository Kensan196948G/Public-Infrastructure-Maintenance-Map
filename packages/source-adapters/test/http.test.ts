import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    behavior: 'never-responds' as 'never-responds' | 'ok' | 'status-500',
    lastRequest: null as
      | null
      | (EventEmitter & {
          setTimeout: (ms: number, cb: () => void) => void;
          destroy: (err?: Error) => void;
          timeoutMs?: number;
          timeoutCallback?: () => void;
        }),
  };
  return { state };
});

// The module's only network seam is node:https.get. It is faked here so the
// timeout and response paths can be driven deterministically.
vi.mock('node:https', () => ({
  get: (_url: string, _options: unknown, onResponse?: (res: unknown) => void) => {
    const req = new EventEmitter() as NonNullable<typeof mocks.state.lastRequest>;
    req.setTimeout = (ms, cb) => {
      req.timeoutMs = ms;
      req.timeoutCallback = cb;
    };
    req.destroy = (err) => {
      if (err) queueMicrotask(() => req.emit('error', err));
    };
    mocks.state.lastRequest = req;

    if (mocks.state.behavior !== 'never-responds' && onResponse) {
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        resume: () => void;
      };
      res.statusCode = mocks.state.behavior === 'ok' ? 200 : 500;
      res.resume = () => undefined;
      queueMicrotask(() => {
        onResponse(res);
        if (mocks.state.behavior === 'ok') {
          res.emit('data', Buffer.from('hello '));
          res.emit('data', Buffer.from('world'));
          res.emit('end');
        }
      });
    }
    return req;
  },
}));

import { fetchBinaryOverHttps, fetchTextOverHttps } from '../src/http.js';

describe('fetchBinaryOverHttps', () => {
  it('rejects with a timeout error when the server never responds', async () => {
    mocks.state.behavior = 'never-responds';
    const promise = fetchBinaryOverHttps('https://example.test/data', { timeoutMs: 25 });
    const assertion = expect(promise).rejects.toThrow(/timed out/);
    const req = mocks.state.lastRequest;
    expect(req?.timeoutMs).toBe(25);
    req?.timeoutCallback?.();
    await assertion;
  });

  it('resolves with the concatenated body on a 2xx response', async () => {
    mocks.state.behavior = 'ok';
    await expect(fetchBinaryOverHttps('https://example.test/data')).resolves.toEqual(
      Buffer.from('hello world'),
    );
  });

  it('rejects on a non-2xx status without hanging', async () => {
    mocks.state.behavior = 'status-500';
    await expect(fetchBinaryOverHttps('https://example.test/data')).rejects.toThrow(/HTTP 500/);
  });
});

describe('fetchTextOverHttps', () => {
  it('decodes the body as text', async () => {
    mocks.state.behavior = 'ok';
    await expect(fetchTextOverHttps('https://example.test/data')).resolves.toBe('hello world');
  });
});
