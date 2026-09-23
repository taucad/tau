import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree } from '#algorithms/index.js';

import { assertMaterializableRevisionTree } from '#portable-tree.js';

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
});
