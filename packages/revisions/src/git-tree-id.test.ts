import { describe, expect, it, vi } from 'vitest';

import { ImmutableRevisionTree } from '#algorithms/index.js';
import { revisionTreeId } from '#git-tree-id.js';
import * as objectHash from '#object-hash.js';

describe('revisionTreeId', () => {
  it('should hash one immutable tree only once per object format', () => {
    const digest = vi.spyOn(objectHash, 'digest');
    const tree = new ImmutableRevisionTree([['main.ts', 'export const value = 1;\n']]);

    const first = revisionTreeId(tree, 'sha1');
    const second = revisionTreeId(tree, 'sha1');
    revisionTreeId(tree, 'sha256');
    revisionTreeId(tree, 'sha256');

    expect(second).toBe(first);
    expect(digest).toHaveBeenCalledTimes(4);
  });
});
