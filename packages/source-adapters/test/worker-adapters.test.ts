import { describe, expect, it } from 'vitest';
import { getWorkerAdapterBySlug, WORKER_ADAPTERS } from '../src/worker-adapters.js';

describe('WORKER_ADAPTERS (scheduled cron registry)', () => {
  it('registers the five worker-safe real sources', () => {
    expect(Object.keys(WORKER_ADAPTERS).sort()).toEqual([
      'bridge-kumamoto',
      'facility-osaka-park',
      'facility-osaka-toilet',
      'port-c02',
      'road-n13',
    ]);
  });

  it('excludes sample data and W05 river sources (Worker cannot handle 149MB XML)', () => {
    expect(WORKER_ADAPTERS['sample-bridges']).toBeUndefined();
    expect(WORKER_ADAPTERS['river-w05-01']).toBeUndefined();
    expect(getWorkerAdapterBySlug('river-w05-36')).toBeNull();
  });

  it('builds adapters whose descriptor slug matches the key', () => {
    for (const [slug, factory] of Object.entries(WORKER_ADAPTERS)) {
      const adapter = factory();
      expect(adapter.descriptor.slug).toBe(slug);
      expect(adapter.descriptor.sourceUrl.startsWith('https://')).toBe(true);
    }
  });
});
