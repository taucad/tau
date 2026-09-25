import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree } from '#algorithms/index.js';

import { caseCollisions } from '#case-collisions.js';
import { assertMaterializableRevisionTree } from '#portable-tree.js';

const nfc = 'café.ts';
const nfd = 'café.ts';

describe('portable revision tree admission', () => {
  it('should refuse portable file-directory collisions', () => {
    expect(() => {
      assertMaterializableRevisionTree(
        new ImmutableRevisionTree([
          ['Parts', 'file'],
          ['parts/bracket.ts', 'child'],
        ]),
      );
    }).toThrow(/file and directory/u);
  });

  /* L2-F7: the cut and the checkout ask one question, so a revision the cut
   * records is one every supported checkout can write. */
  it.each([
    ['NFC and NFD spellings of one name', [nfc, nfd]],
    ['names that differ only by case', ['Part.ts', 'part.ts']],
    ['a file whose name another path needs as a directory', ['Parts', 'parts/bracket.ts']],
  ])('should refuse %s at the cut exactly as materialization does', (_, paths) => {
    const tree = new ImmutableRevisionTree(paths.map((path) => [path, 'x']));

    expect(caseCollisions(tree).toSorted()).toEqual(paths.toSorted());
    expect(() => {
      assertMaterializableRevisionTree(tree);
    }).toThrow(/collide/u);
  });

  it('should admit distinct names at both', () => {
    const tree = new ImmutableRevisionTree([
      [nfc, 'x'],
      ['part.ts', 'x'],
      ['parts/bracket.ts', 'x'],
    ]);

    expect(caseCollisions(tree)).toEqual([]);
    expect(() => {
      assertMaterializableRevisionTree(tree);
    }).not.toThrow();
  });
});
