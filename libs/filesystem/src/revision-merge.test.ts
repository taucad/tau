import { describe, expect, it } from 'vitest';
import { ImmutableRevisionTree } from '#revision-tree.js';
import { mergeRevisionTrees } from '#revision-merge.js';

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

  it('returns a typed text conflict for overlapping edits without writing conflict markers', () => {
    const base = tree({ 'main.ts': 'before\n' });
    const ours = tree({ 'main.ts': 'ours\n' });
    const theirs = tree({ 'main.ts': 'theirs\n' });

    expect(mergeRevisionTrees(base, ours, theirs)).toEqual({
      status: 'conflicted',
      conflicts: [
        {
          type: 'text',
          path: 'main.ts',
          reason: 'overlap',
          base: 'before\n',
          ours: 'ours\n',
          theirs: 'theirs\n',
        },
      ],
    });
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
});
