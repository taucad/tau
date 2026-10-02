import { describe, it, expect } from 'vitest';

import { openscadAnglePathToFileUri, posixDirname, posixJoin } from '#lib/openscad-language/openscad-include-uri.js';

describe('openscad-include-uri', () => {
  it('posixJoin and dirname match POSIX shape', () => {
    expect(posixDirname('a/b/c')).toBe('a/b');
    expect(posixJoin('a/b', 'c')).toBe('a/b/c');
    expect(posixJoin('', 'x')).toBe('x');
  });

  it('resolves angle imports next to the current file', () => {
    expect(openscadAnglePathToFileUri('file:///project/parts/main.scad', 'lib/x.scad')).toBe(
      'file:///project/parts/lib/x.scad',
    );
  });
});
