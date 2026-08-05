import { describe, expect, it } from 'vitest';
import { cronMatches, parseCron, selectDueSources } from '../src/scheduler.js';

describe('parseCron', () => {
  it('parses 5-field cron expressions', () => {
    const spec = parseCron('0 3 * * *');
    expect(spec).not.toBeNull();
    expect(spec?.minute).toEqual([0]);
    expect(spec?.hour).toEqual([3]);
    expect(spec?.dayOfMonth).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31,
    ]);
  });

  it('supports steps, ranges and lists', () => {
    const spec = parseCron('*/15 0-2,6 1,15 * 1-5');
    expect(spec?.minute).toEqual([0, 15, 30, 45]);
    expect(spec?.hour).toEqual([0, 1, 2, 6]);
    expect(spec?.dayOfMonth).toEqual([1, 15]);
    expect(spec?.dayOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects malformed expressions', () => {
    expect(parseCron('0 3 * *')).toBeNull();
    expect(parseCron('0 99 * * *')).toBeNull();
    expect(parseCron('a b c d e')).toBeNull();
    expect(parseCron('0 3 * * 8')).toBeNull();
  });
});

describe('cronMatches', () => {
  it('matches on minute/hour/day', () => {
    const spec = parseCron('0 3 * * *')!;
    expect(cronMatches(spec, new Date('2026-08-05T03:00:00Z'))).toBe(true);
    expect(cronMatches(spec, new Date('2026-08-05T04:00:00Z'))).toBe(false);
    expect(cronMatches(spec, new Date('2026-08-05T03:30:00Z'))).toBe(false);
  });

  it('matches */15 steps', () => {
    const spec = parseCron('*/15 * * * *')!;
    expect(cronMatches(spec, new Date('2026-08-05T12:15:00Z'))).toBe(true);
    expect(cronMatches(spec, new Date('2026-08-05T12:20:00Z'))).toBe(false);
  });

  it('treats dow 0 and 7 as Sunday', () => {
    const sunday = new Date('2026-08-02T00:00:00Z'); // 2026-08-02 is a Sunday
    expect(cronMatches(parseCron('0 0 * * 0')!, sunday)).toBe(true);
    expect(cronMatches(parseCron('0 0 * * 7')!, sunday)).toBe(true);
  });
});

describe('selectDueSources', () => {
  const sources = [
    { slug: 'hourly', refreshCron: '0 * * * *', lastRunAt: null },
    { slug: 'three-am', refreshCron: '0 3 * * *', lastRunAt: null },
    { slug: 'recent', refreshCron: '0 * * * *', lastRunAt: '2026-08-05T11:30:00.000Z' },
    { slug: 'no-schedule', refreshCron: null, lastRunAt: null },
    { slug: 'bad-cron', refreshCron: 'not a cron', lastRunAt: null },
  ];

  it('selects only sources whose cron matches now', () => {
    const due = selectDueSources(sources, new Date('2026-08-05T12:00:00Z'));
    expect(due).toEqual(['hourly']);
  });

  it('skips sources that ran recently in the same window', () => {
    const due = selectDueSources(sources, new Date('2026-08-05T12:00:00Z'));
    expect(due).not.toContain('recent');
  });

  it('runs a source whose last run is older than the interval', () => {
    const due = selectDueSources(
      [{ slug: 'stale', refreshCron: '0 * * * *', lastRunAt: '2026-08-05T10:00:00.000Z' }],
      new Date('2026-08-05T12:00:00Z'),
    );
    expect(due).toEqual(['stale']);
  });
});
