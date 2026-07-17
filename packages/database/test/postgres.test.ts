import { describe, expect, it } from 'vitest';
import { escapeLikePattern, FIXED_NOTICES } from '../src/postgres.js';

// Issue #2 Completion Criteria 4: 実データ(Postgres経路)は sample モードの
// 「架空サンプルです」表示を絶対に出してはならない。
describe('FIXED_NOTICES (production/Postgres path)', () => {
  it('never claims the data is a fictional sample', () => {
    const joined = FIXED_NOTICES.join(' ');
    expect(joined).not.toContain('架空');
    expect(joined).not.toContain('サンプル');
  });

  it('still discloses the same safety caveats as sample mode', () => {
    const joined = FIXED_NOTICES.join(' ');
    expect(joined).toContain('健全性');
    expect(joined).toContain('原典');
  });

  it('is frozen so callers cannot mutate the shared wording', () => {
    expect(Object.isFrozen(FIXED_NOTICES)).toBe(true);
  });
});

describe('escapeLikePattern', () => {
  it('escapes ILIKE wildcard characters so user input cannot broaden a match', () => {
    expect(escapeLikePattern('50%off')).toBe('50\\%off');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('escapes backslash before percent/underscore so escaping cannot be undone', () => {
    // A naive order (escape % / _ first, backslash second) would double-escape
    // and change semantics; backslash must be escaped first.
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
  });

  it('leaves plain text untouched', () => {
    expect(escapeLikePattern('みらい大橋')).toBe('みらい大橋');
  });
});
