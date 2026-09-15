import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree } from '@taucad/filesystem/revisions';

import { assertMaterializableRevisionTree } from '#portable-tree.js';

describe('portable revision tree admission', () => {
  it('refuses case aliases into reserved storage and portable file-directory collisions', () => {
    expect(() => {
      assertMaterializableRevisionTree(new ImmutableRevisionTree([['.TAU/chats/victim/chat.json', 'remote']]));
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
