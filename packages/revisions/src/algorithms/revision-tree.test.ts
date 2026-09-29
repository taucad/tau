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

import { describe, expect, it, vi } from 'vitest';
import { ImmutableRevisionTree, adoptRevisionTree, revisionTreeFiles } from '#algorithms/revision-tree.js';

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

  it('defaults ordinary files and preserves executable mode in owned entries', () => {
    const tree = new ImmutableRevisionTree([
      ['plain.sh', 'echo plain\n'],
      ['run.sh', 'echo run\n', '100755'],
    ]);

    expect(tree.mode('plain.sh')).toBe('100644');
    expect(tree.entries().map(({ path, mode }) => [path, mode])).toEqual([
      ['plain.sh', '100644'],
      ['run.sh', '100755'],
    ]);
  });

  it('refuses unsupported Git modes at the shared tree boundary', () => {
    const untrusted = [['link', 'target', '120000']] as unknown as ConstructorParameters<
      typeof ImmutableRevisionTree
    >[0];
    expect(() => new ImmutableRevisionTree(untrusted)).toThrow(/Unsupported revision file mode/u);
  });

  it('should share an unchanged record with a tree derived from it, byte for byte and by identity', () => {
    const base = new ImmutableRevisionTree([
      ['kept.ts', 'kept\n'],
      ['edited.ts', 'before\n'],
    ]);
    const files = new Map(revisionTreeFiles(base));
    files.set('edited.ts', { content: new TextEncoder().encode('after\n'), mode: '100644' });

    const derived = adoptRevisionTree(files);

    expect(revisionTreeFiles(derived).get('kept.ts')).toBe(revisionTreeFiles(base).get('kept.ts'));
    expect(new TextDecoder().decode(derived.get('edited.ts'))).toBe('after\n');
    expect(new TextDecoder().decode(base.get('edited.ts'))).toBe('before\n');
    expect(derived.byteLength).toBe('kept\n'.length + 'after\n'.length);
  });

  it('should refuse a derived tree that a file and a directory share a path in', () => {
    const files = new Map(revisionTreeFiles(new ImmutableRevisionTree([['a', 'file\n']])));
    files.set('a/b.txt', { content: new TextEncoder().encode('nested\n'), mode: '100644' });

    expect(() => adoptRevisionTree(files)).toThrow(/collides/iu);
  });

  it('should read a tree another copy of this module built, by copying it', async () => {
    vi.resetModules();
    const other = await import('#algorithms/revision-tree.js');
    const foreign = new other.ImmutableRevisionTree([['part.ts', 'export const part = 1;\n']]);

    const files = revisionTreeFiles(foreign);

    expect(new TextDecoder().decode(files.get('part.ts')?.content)).toBe('export const part = 1;\n');
    expect(adoptRevisionTree(new Map(files)).size).toBe(1);
  });
});
