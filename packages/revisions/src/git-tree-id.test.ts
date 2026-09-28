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

  it('should equal the tree id stock git writes, in both object formats', () => {
    /* `git write-tree` over these three files, in a SHA-1 and a SHA-256 repository. */
    const tree = new ImmutableRevisionTree([
      ['hello.txt', 'hello\n'],
      ['src/a/b.ts', 'x\n'],
      ['run.sh', '#!/bin/sh\n', '100755'],
    ]);

    expect(revisionTreeId(tree, 'sha1')).toBe('6244d781aa7f879b96db0eae4cc06dbd020d531a');
    expect(revisionTreeId(tree, 'sha256')).toBe('14e4645117e5943cb1847d147ef904479a0d8247d3a3862673db9fd017c82e9b');
  });
});
