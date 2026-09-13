/**
 * The shapes a revision tree must refuse.
 *
 * A tree is the input to two different Git object writers (review 4 R27), and
 * the pair `a` + `a/b.txt` is the one shape they disagree about:
 * `isomorphic-git` writes a tree `git fsck --strict` reports as
 * `duplicateEntries`, while `git fast-import` writes a different tree
 * altogether. Neither engine can guard it — the model is the only place both
 * legs pass through — so it fails closed here.
 */

import { describe, expect, it } from 'vitest';
import { ImmutableRevisionTree } from '#revision-tree.js';

describe('ImmutableRevisionTree', () => {
  it('refuses a file whose path is also a directory prefix', () => {
    expect(
      () =>
        new ImmutableRevisionTree([
          ['a', 'file\n'],
          ['a/b.txt', 'nested\n'],
        ]),
    ).toThrow(/collides/iu);
  });

  it('refuses the same collision in the other order, and deep in the path', () => {
    expect(
      () =>
        new ImmutableRevisionTree([
          ['nested/deep/b.txt', 'nested\n'],
          ['nested/deep', 'file\n'],
        ]),
    ).toThrow(/collides/iu);
    expect(
      () =>
        new ImmutableRevisionTree([
          ['nested', 'file\n'],
          ['nested/deep/b.txt', 'nested\n'],
        ]),
    ).toThrow(/collides/iu);
  });

  it('still refuses a duplicate path and still accepts a shared name prefix', () => {
    expect(
      () =>
        new ImmutableRevisionTree([
          ['a.txt', 'one\n'],
          ['a.txt', 'two\n'],
        ]),
    ).toThrow(/Duplicate/iu);
    // `a.txt` and `a/b.txt` share three characters and nothing else.
    const tree = new ImmutableRevisionTree([
      ['a.txt', 'file\n'],
      ['a/b.txt', 'nested\n'],
    ]);
    expect(tree.entries().map((entry) => entry.path)).toStrictEqual(['a.txt', 'a/b.txt']);
  });
});
