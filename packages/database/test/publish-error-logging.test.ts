import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresAssetPublisher } from '../src/postgres.js';
import type { PublishInput } from '../src/publisher.js';

type SqlOverride = ConstructorParameters<typeof PostgresAssetPublisher>[1];

function makeInput(): PublishInput {
  return {
    sourceId: 'src-1',
    sourceUpdatedAt: null,
    contentHash: 'hash',
    schemaFingerprint: 'fp',
    fetchedCount: 1,
    droppedCount: 0,
    warningCount: 0,
    triggeredBy: 'test',
    correlationId: 'corr-1',
    assets: [],
    aborted: null,
  };
}

describe('publish error logging (Issue #42 M-3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs only error name/message when recording a failed run also fails', async () => {
    // Neon driver errors carry connection details as own properties; none of
    // these values may survive into the logged payload.
    const transactionError = Object.assign(new Error('connection closed'), {
      host: 'db.internal.example.neon.tech',
      user: 'pimm_owner',
      password: 'not-a-real-password',
    });
    const recordingError = Object.assign(new Error('still failing'), {
      host: 'db.internal.example.neon.tech',
    });

    // Mirrors the neon driver's lazy queries: nothing settles (or rejects)
    // until awaited, so vitest sees no floating rejected promise.
    const tag = (strings: TemplateStringsArray) => {
      const text = strings.join(' ');
      return {
        then(resolve: (rows: unknown[]) => void, reject: (error: unknown) => void) {
          // publishFailed's INSERT must fail to reach the console.error path;
          // the committed-check SELECT reports the transaction never committed.
          if (text.includes('INSERT INTO ingestion_runs')) reject(recordingError);
          else resolve([]);
        },
      };
    };
    const sql = Object.assign(tag, {
      transaction: async () => {
        throw transactionError;
      },
    }) as unknown as SqlOverride;

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const publisher = new PostgresAssetPublisher('postgresql://unused', sql);

    await expect(publisher.publish(makeInput())).rejects.toBe(transactionError);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [message, payload] = consoleError.mock.calls[0] ?? [];
    expect(message).toBe('publish: failed to record failed ingestion run');
    expect(payload).toEqual({
      sourceId: 'src-1',
      correlationId: 'corr-1',
      originalError: { name: 'Error', message: 'connection closed' },
      recordingError: { name: 'Error', message: 'still failing' },
    });

    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('neon.tech');
    expect(logged).not.toContain('pimm_owner');
    expect(logged).not.toContain('not-a-real-password');
  });
});
