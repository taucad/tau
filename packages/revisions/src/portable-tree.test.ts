import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree } from '#algorithms/index.js';

import { assertMaterializableRevisionTree } from '#portable-tree.js';

describe('portable revision tree admission', () => {
  it('refuses case aliases into reserved storage and portable file-directory collisions', () => {
    /* `classify` compares every row folded (G0b-8), so a case alias of a reserved
     * path is refused by the registry check itself. The alias check below is what
     * that fold made redundant — kept because it costs one comparison and states
     * the property at the boundary that has to hold it. */
    expect(() => {
      assertMaterializableRevisionTree(new ImmutableRevisionTree([['.TAU/chats/victim/chat.json', 'remote']]));
    }).toThrow(/is reserved by Tau/u);
    expect(() => {
      assertMaterializableRevisionTree(new ImmutableRevisionTree([['Exports/victim.step', 'remote']]));
    }).toThrow(/is reserved by Tau/u);
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
