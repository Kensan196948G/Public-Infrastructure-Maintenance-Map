import { describe, expect, it } from 'vitest';
import { decideRunStatus } from '../src/publisher.js';

describe('decideRunStatus', () => {
  it('is succeeded when every fetched record was published', () => {
    expect(decideRunStatus({ droppedCount: 0, hiddenCount: 0 })).toBe('succeeded');
  });

  it('is partial when records were dropped before the transaction (no usable geometry)', () => {
    expect(decideRunStatus({ droppedCount: 2, hiddenCount: 0 })).toBe('partial');
  });

  it('is partial when records were written but hidden by the quality gate', () => {
    expect(decideRunStatus({ droppedCount: 0, hiddenCount: 3 })).toBe('partial');
  });

  it('is partial when both dropped and hidden records are present', () => {
    expect(decideRunStatus({ droppedCount: 1, hiddenCount: 1 })).toBe('partial');
  });
});
