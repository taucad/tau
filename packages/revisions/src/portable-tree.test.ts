import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree } from '#algorithms/index.js';

import { assertMaterializableRevisionTree } from '#portable-tree.js';

describe('portable revision tree admission', () => {
  it('refuses case aliases into reserved storage and portable file-directory collisions', () => {
    /* `.tau` is Tau's namespace and `classify` compares it folded, so this one is
     * refused by the registry itself rather than by the alias check below. */
    expect(() => {
      assertMaterializableRevisionTree(new ImmutableRevisionTree([['.TAU/chats/victim/chat.json', 'remote']]));
    }).toThrow(/is reserved by Tau/u);
    /* The alias check still earns its place: `exports` is a name a person sees,
     * so the registry compares it as spelled and only the portable spelling of
     * this path lands on the records row. */
    expect(() => {
      assertMaterializableRevisionTree(new ImmutableRevisionTree([['Exports/victim.step', 'remote']]));
    }).toThrow(/aliases a path reserved by Tau/u);
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
