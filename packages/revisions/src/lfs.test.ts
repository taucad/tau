/**
 * A large object is resident once: the objects a clean hands its store are the
 * tree's own bytes, and the result is cached for as long as the tree lives
 * (review finding 7).
 */
import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionTreeFiles } from '#algorithms/revision-tree.js';
import { cleanLargeObjects, readLfsPointer } from '#lfs.js';

describe('cleanLargeObjects', () => {
  it('should hand the store the bytes the tree holds, not a second copy', () => {
    const part = new Uint8Array(2 * 1024 * 1024).fill(7);
    const tree = new ImmutableRevisionTree([
      ['exports/part.stl', part],
      ['part.ts', 'export const part = 1;\n'],
    ]);

    const { tree: recorded, objects } = cleanLargeObjects(tree);

    const pointer = readLfsPointer(recorded.get('exports/part.stl')!);
    expect(pointer?.size).toBe(part.byteLength);
    expect(objects.get(pointer!.oid)).toBe(revisionTreeFiles(tree).get('exports/part.stl')?.content);
  });
});
