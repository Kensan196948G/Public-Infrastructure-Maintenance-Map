import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '../src/postgres.js';

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
