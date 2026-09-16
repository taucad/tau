import { describe, expect, it } from 'vitest';
import { revisionBranchName } from '#revision-authority.js';

describe('revisionBranchName', () => {
  it('accepts GitHub branch names with slashes and Unicode', () => {
    expect(revisionBranchName('feature/設計-v2')).toBe('feature/設計-v2');
  });

  it.each(['-option', '.hidden', 'a..b', 'a@{b', 'a b', 'a.lock', 'a//b', String.raw`a\b`])(
    'refuses invalid Git branch name %s',
    (name) => {
      expect(() => revisionBranchName(name)).toThrow();
    },
  );
});
