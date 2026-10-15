import { describe, expect, it } from 'vitest';

import { findCaseCollisions } from '#archive-entry.js';

describe('findCaseCollisions', () => {
  it('should pair the paths a case-insensitive filesystem would merge, earlier path first', () => {
    const paths = ['share/terminfo/A/Apple_Terminal', 'share/terminfo/a/apple_terminal', 'bin/python3', 'BIN/python3'];

    expect(findCaseCollisions(paths)).toEqual([
      ['share/terminfo/A/Apple_Terminal', 'share/terminfo/a/apple_terminal'],
      ['bin/python3', 'BIN/python3'],
    ]);
  });

  it('should report nothing for distinct paths or an exact repeat', () => {
    expect(findCaseCollisions(['a/b', 'a/c', 'a/b'])).toEqual([]);
  });
});
