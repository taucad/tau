/**
 * A large object is resident once: the objects a clean hands its store are the
 * tree's own bytes, and the result is cached for as long as the tree lives
 * (review finding 7).
 */
import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionTreeFiles } from '#algorithms/revision-tree.js';
import { cleanLargeObjects, lfsPointerFor, readLfsPointer } from '#lfs.js';

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

describe("cleanLargeObjects under a repository's own attributes (D16)", () => {
  it('should pointerise exactly the paths their attributes name and never touch the attributes', () => {
    const scan = new Uint8Array(4096).fill(3);
    const unnamed = new Uint8Array(2 * 1024 * 1024).fill(5);
    const attributes = '*.stl filter=lfs diff=lfs merge=lfs -text\n';
    const tree = new ImmutableRevisionTree([
      ['.gitattributes', attributes],
      ['scan.stl', scan],
      ['part.step', unnamed],
      ['notes.txt', 'mine\n'],
    ]);

    const { tree: recorded, objects } = cleanLargeObjects(tree, 'repository');

    expect(readLfsPointer(recorded.get('scan.stl')!)).toStrictEqual(lfsPointerFor(scan).pointer);
    expect(objects.get(lfsPointerFor(scan).pointer.oid)).toBe(revisionTreeFiles(tree).get('scan.stl')?.content);
    expect(
      revisionTreeFiles(recorded).get('part.step')?.content === revisionTreeFiles(tree).get('part.step')?.content,
    ).toBe(true);
    expect(new TextDecoder().decode(recorded.get('.gitattributes'))).toBe(attributes);
    expect(objects.size).toBe(1);
    // Tau's own rule would have tracked the family and written its block.
    expect(readLfsPointer(cleanLargeObjects(tree).tree.get('part.step')!)).toBeDefined();
  });

  it('should keep a tree that names nothing as the same tree, and a pointer as itself', () => {
    const { bytes } = lfsPointerFor(new Uint8Array(64).fill(1));
    const plain = new ImmutableRevisionTree([['big.bin', new Uint8Array(2 * 1024 * 1024)]]);
    const pointered = new ImmutableRevisionTree([
      ['.gitattributes', '*.bin filter=lfs\n'],
      ['a.bin', bytes],
    ]);

    expect(cleanLargeObjects(plain, 'repository').tree).toBe(plain);
    expect(cleanLargeObjects(pointered, 'repository').tree).toBe(pointered);
    expect(cleanLargeObjects(pointered, 'repository')).toBe(cleanLargeObjects(pointered, 'repository'));
  });
});
