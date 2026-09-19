import { describe, expect, it } from 'vitest';
import { ImmutableRevisionTree } from '#algorithms/revision-tree.js';
import { mergeRevisionTrees, renderConflictMarkers } from '#algorithms/revision-merge.js';

const tree = (files: Readonly<Record<string, string | Uint8Array<ArrayBuffer>>>): ImmutableRevisionTree =>
  new ImmutableRevisionTree(Object.entries(files));

const text = (revisionTree: ImmutableRevisionTree, path: string): string =>
  new TextDecoder().decode(revisionTree.get(path));

const modifyDeleteCases: ReadonlyArray<{
  modifiedBy: 'ours' | 'theirs';
  ours: ImmutableRevisionTree;
  theirs: ImmutableRevisionTree;
}> = [
  {
    modifiedBy: 'ours',
    ours: tree({ 'part.scad': 'changed' }),
    theirs: tree({}),
  },
  {
    modifiedBy: 'theirs',
    ours: tree({}),
    theirs: tree({ 'part.scad': 'changed' }),
  },
];

describe('mergeRevisionTrees', () => {
  it('deterministically composes non-overlapping UTF-8 line edits', () => {
    const base = tree({ 'main.ts': 'alpha\nbeta\ngamma\n' });
    const ours = tree({ 'main.ts': 'ALPHA\nbeta\ngamma\n' });
    const theirs = tree({ 'main.ts': 'alpha\nbeta\nGAMMA\n' });

    const first = mergeRevisionTrees(base, ours, theirs);
    const reversed = mergeRevisionTrees(base, theirs, ours);

    expect(first.status).toBe('merged');
    expect(reversed.status).toBe('merged');
    if (first.status === 'merged' && reversed.status === 'merged') {
      expect(text(first.tree, 'main.ts')).toBe('ALPHA\nbeta\nGAMMA\n');
      expect(first.tree.entries()).toEqual(reversed.tree.entries());
    }
  });

  it('accepts identical overlapping text edits once', () => {
    const base = tree({ 'main.ts': 'before\n' });
    const ours = tree({ 'main.ts': 'after\n' });

    const result = mergeRevisionTrees(base, ours, ours);

    expect(result.status).toBe('merged');
    if (result.status === 'merged') {
      expect(text(result.tree, 'main.ts')).toBe('after\n');
    }
  });

  it('merges one-sided mode changes and conflicts on disagreeing added modes', () => {
    const base = new ImmutableRevisionTree([['run.sh', 'echo run\n']]);
    const ours = new ImmutableRevisionTree([['run.sh', 'echo run\n', '100755']]);
    const unchanged = new ImmutableRevisionTree([['run.sh', 'echo run\n']]);
    const merged = mergeRevisionTrees(base, ours, unchanged);
    expect(merged.status).toBe('merged');
    if (merged.status === 'merged') {
      expect(merged.tree.mode('run.sh')).toBe('100755');
    }

    const conflicted = mergeRevisionTrees(
      tree({}),
      new ImmutableRevisionTree([['new.sh', 'echo run\n', '100755']]),
      new ImmutableRevisionTree([['new.sh', 'echo run\n', '100644']]),
    );
    expect(conflicted.status).toBe('conflicted');
    if (conflicted.status === 'conflicted') {
      expect(conflicted.conflicts).toEqual([{ type: 'mode', path: 'new.sh', ours: '100755', theirs: '100644' }]);
    }
  });

  it('returns a typed text conflict for overlapping edits without writing conflict markers', () => {
    const base = tree({ 'main.ts': 'before\n' });
    const ours = tree({ 'main.ts': 'ours\n' });
    const theirs = tree({ 'main.ts': 'theirs\n' });

    const result = mergeRevisionTrees(base, ours, theirs);

    /* Exact, not `toMatchObject`: an extra field on a conflict is a field some
       surface will start reading, and the point of the typed union is that the
       set is closed (review R12). `merged` is asserted separately because it is
       a tree, not data. */
    expect(result.status).toBe('conflicted');
    if (result.status === 'conflicted') {
      expect(result.conflicts).toEqual([
        {
          type: 'text',
          path: 'main.ts',
          reason: 'overlap',
          base: 'before\n',
          ours: 'ours\n',
          theirs: 'theirs\n',
        },
      ]);
      expect(result.merged.entries()).toEqual([]);
    }
  });

  it('classifies add/add conflicts with owned bytes', () => {
    const result = mergeRevisionTrees(tree({}), tree({ 'same.txt': 'ours' }), tree({ 'same.txt': 'theirs' }));

    expect(result.status).toBe('conflicted');
    if (result.status === 'conflicted') {
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({ type: 'add-add', path: 'same.txt' });
      const conflict = result.conflicts[0]!;
      if (conflict.type === 'add-add') {
        expect(new TextDecoder().decode(conflict.ours)).toBe('ours');
        expect(new TextDecoder().decode(conflict.theirs)).toBe('theirs');
      }
    }
  });

  it.each(modifyDeleteCases)(
    'classifies modify/delete with $modifiedBy as the modifying side',
    ({ modifiedBy, ours, theirs }) => {
      const result = mergeRevisionTrees(tree({ 'part.scad': 'base' }), ours, theirs);

      expect(result.status).toBe('conflicted');
      if (result.status === 'conflicted') {
        expect(result.conflicts).toEqual([
          expect.objectContaining({ type: 'modify-delete', path: 'part.scad', modifiedBy }),
        ]);
      }
    },
  );

  it('classifies divergent binary changes without decoding or inserting markers', () => {
    const base = tree({ 'mesh.glb': new Uint8Array([0, 1]) });
    const ours = tree({ 'mesh.glb': new Uint8Array([0, 2]) });
    const theirs = tree({ 'mesh.glb': new Uint8Array([0, 3]) });

    const result = mergeRevisionTrees(base, ours, theirs);

    expect(result.status).toBe('conflicted');
    if (result.status === 'conflicted') {
      expect(result.conflicts).toEqual([expect.objectContaining({ type: 'binary', path: 'mesh.glb' })]);
    }
  });

  it('merges independent additions, deletions, modifications, and a unilateral rename', () => {
    const base = tree({
      'delete.txt': 'delete me',
      'modify.txt': 'base',
      'old-name.txt': 'renamed bytes',
    });
    const ours = tree({
      'modify.txt': 'ours',
      'new-name.txt': 'renamed bytes',
      'ours.txt': 'ours only',
    });
    const theirs = tree({
      'modify.txt': 'base',
      'old-name.txt': 'renamed bytes',
      'theirs.txt': 'theirs only',
    });

    const result = mergeRevisionTrees(base, ours, theirs);

    expect(result.status).toBe('merged');
    if (result.status === 'merged') {
      expect(result.tree.entries().map(({ path }) => path)).toEqual([
        'modify.txt',
        'new-name.txt',
        'ours.txt',
        'theirs.txt',
      ]);
      expect(text(result.tree, 'modify.txt')).toBe('ours');
    }
  });

  it('sorts conflicts by path regardless of input insertion order', () => {
    const result = mergeRevisionTrees(
      tree({}),
      tree({ 'z.txt': 'ours', 'a.txt': 'ours', 'ä.txt': 'ours' }),
      tree({ 'ä.txt': 'theirs', 'a.txt': 'theirs', 'z.txt': 'theirs' }),
    );

    expect(result.status).toBe('conflicted');
    if (result.status === 'conflicted') {
      expect(result.conflicts.map(({ path }) => path)).toEqual(['a.txt', 'z.txt', 'ä.txt']);
    }
  });

  it('returns a typed conflict when one side has a file where the other has a directory', () => {
    const base = tree({ 'keep.txt': 'shared' });
    const ours = tree({ 'keep.txt': 'shared', a: 'a file' });
    const theirs = tree({ 'keep.txt': 'shared', 'a/b.txt': 'a directory' });

    const result = mergeRevisionTrees(base, ours, theirs);

    expect(result.status).toBe('conflicted');
    if (result.status === 'conflicted') {
      expect(result.conflicts).toEqual([
        expect.objectContaining({ type: 'file-directory', path: 'a', directoryPath: 'a/b.txt' }),
      ]);
      /* The tree model refuses `a` beside `a/b.txt`, so neither survives into
         the settled set — and nothing throws (W3a re-review). */
      expect(result.merged.entries().map(({ path }) => path)).toEqual(['keep.txt']);
    }
  });

  /* The asymmetric case the first pass missed: only one of the two colliding
     paths settles, so a scan of the settled set alone sees no collision — and
     a resolution that then chose *Keep mine* on `a` would compose `a` beside
     `a/b.txt` and hit the tree model's `TypeError` with nowhere to say so
     (review R4). The scan therefore runs over settled ∪ conflicted. */
  it('returns a typed conflict when the colliding file is itself conflicted', () => {
    const base = tree({ a: 'base' });
    const ours = tree({ a: 'x' });
    const theirs = tree({ 'a/b.txt': 'z' });

    const result = mergeRevisionTrees(base, ours, theirs);

    expect(result.status).toBe('conflicted');
    if (result.status === 'conflicted') {
      expect(result.conflicts).toEqual([
        expect.objectContaining({ type: 'file-directory', path: 'a', directoryPath: 'a/b.txt', fileSide: 'ours' }),
      ]);
      /* And the `modify-delete` on `a` is gone: the shape is the conflict now,
         so a person is not asked to choose content for a path that cannot
         exist beside its own directory. */
      expect(result.conflicts.filter(({ type }) => type === 'modify-delete')).toEqual([]);
      expect(result.merged.entries().map(({ path }) => path)).toEqual([]);
    }
  });

  it('reports the paths that settled beside the ones that did not', () => {
    const base = tree({ 'clean.txt': 'base', 'fight.txt': 'base' });
    const ours = tree({ 'clean.txt': 'ours', 'fight.txt': 'ours' });
    const theirs = tree({ 'clean.txt': 'base', 'fight.txt': 'theirs' });

    const result = mergeRevisionTrees(base, ours, theirs);

    expect(result.status).toBe('conflicted');
    if (result.status === 'conflicted') {
      expect(result.conflicts.map(({ path }) => path)).toEqual(['fight.txt']);
      expect(result.merged.entries().map(({ path }) => path)).toEqual(['clean.txt']);
      expect(text(result.merged, 'clean.txt')).toBe('ours');
    }
  });
});

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const labels = { ours: 'main', theirs: 'enclosure-v2' } as const;

describe('renderConflictMarkers', () => {
  it('marks only the lines that collided and keeps the rest merged', () => {
    const rendered = renderConflictMarkers({
      base: bytes('alpha\nbeta\ngamma\ndelta\nepsilon\n'),
      ours: bytes('alpha\nOURS\ngamma\ndelta\nEPSILON\n'),
      theirs: bytes('alpha\nTHEIRS\ngamma\ndelta\nepsilon\n'),
      labels,
    });

    /* `epsilon` only one side touched rides through; `beta` both did. */
    expect(rendered).toBe('alpha\n<<<<<<< main\nOURS\n=======\nTHEIRS\n>>>>>>> enclosure-v2\ngamma\ndelta\nEPSILON\n');
  });

  it('covers the whole span two sides rewrote together, the way a merge tool does', () => {
    const rendered = renderConflictMarkers({
      base: bytes('alpha\nbeta\ngamma\n'),
      ours: bytes('alpha\nOURS\ngamma\n'),
      theirs: bytes('alpha\nTHEIRS\nGAMMA\n'),
      labels,
    });

    /* `theirs` rewrote `beta` and `gamma` as one run, so the block is the run —
       splitting it would offer a choice neither side ever made. */
    expect(rendered).toBe('alpha\n<<<<<<< main\nOURS\ngamma\n=======\nTHEIRS\nGAMMA\n>>>>>>> enclosure-v2\n');
  });

  it('renders a deleted side as an empty half rather than dropping the file', () => {
    const rendered = renderConflictMarkers({
      base: bytes('only\n'),
      ours: bytes('mine\n'),
      theirs: undefined,
      labels,
    });

    expect(rendered).toBe('<<<<<<< main\nmine\n=======\n>>>>>>> enclosure-v2\n');
  });

  it('refuses to materialize a side it cannot decode, so a binary file stays choose-one', () => {
    expect(
      renderConflictMarkers({
        base: new Uint8Array([0, 1, 2]),
        ours: new Uint8Array([0, 1, 3]),
        theirs: new Uint8Array([0, 1, 4]),
        labels,
      }),
    ).toBeUndefined();
  });
});
