/**
 * One pointer rule on every leg, derived from the tree (D16): a path is a
 * pointer exactly when the tree's attributes say `filter=lfs`, and Tau writes
 * only its own block. A large object is resident once: the objects a clean
 * hands its store are the tree's own bytes, and the result is cached for as
 * long as the tree lives (review finding 7).
 */
import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionTreeFiles } from '#algorithms/revision-tree.js';
import { cleanLargeObjects, lfsPointerFor, readLfsPointer } from '#lfs.js';
import { generatedGitattributesContent, generatedIgnoreContent } from '#workspace-config.js';

const decoder = new TextDecoder();
const tauBlock = generatedGitattributesContent(undefined);
const sameRecord = (left: ImmutableRevisionTree, right: ImmutableRevisionTree, path: string): boolean =>
  revisionTreeFiles(left).get(path)?.content === revisionTreeFiles(right).get(path)?.content;

describe('cleanLargeObjects', () => {
  it('should hand the store the bytes the tree holds, not a second copy', () => {
    const part = new Uint8Array(2 * 1024 * 1024).fill(7);
    const tree = new ImmutableRevisionTree([
      ['.gitattributes', tauBlock],
      ['exports/part.stl', part],
      ['part.ts', 'export const part = 1;\n'],
    ]);

    const { tree: recorded, objects } = cleanLargeObjects(tree);

    const pointer = readLfsPointer(recorded.get('exports/part.stl')!);
    expect(pointer?.size).toBe(part.byteLength);
    expect(objects.get(pointer!.oid)).toBe(revisionTreeFiles(tree).get('exports/part.stl')?.content);
    expect(cleanLargeObjects(tree)).toBe(cleanLargeObjects(tree));
  });
});

describe("cleanLargeObjects under Tau's generated block", () => {
  it('should add a line for a large or case-variant file and keep every line outside the block in place', () => {
    const big = new Uint8Array(2 * 1024 * 1024).fill(5);
    const shouted = new Uint8Array(64).fill(6);
    const mine = '# mine\n*.raw filter=lfs diff=lfs merge=lfs -text\n';
    const after = 'kept.step -filter\n';
    const attributes = `${mine}${generatedGitattributesContent(undefined, ['old/tracked.txt'])}${after}`;
    const tree = new ImmutableRevisionTree([
      ['.gitattributes', attributes],
      ['big.bin', big],
      ['PART.STEP', shouted],
      ['kept.step', 'solid kept\n'],
      ['old/tracked.txt', 'small now\n'],
      ['scan.raw', 'raw\n'],
      ['notes.txt', 'mine\n'],
    ]);

    const { tree: recorded, objects } = cleanLargeObjects(tree);

    const written = decoder.decode(recorded.get('.gitattributes'));
    expect(written).toBe(
      `${mine}${generatedGitattributesContent(undefined, ['PART.STEP', 'big.bin', 'old/tracked.txt'])}${after}`,
    );
    for (const path of ['big.bin', 'PART.STEP', 'old/tracked.txt', 'scan.raw']) {
      expect(readLfsPointer(recorded.get(path)!), path).toBeDefined();
    }
    /* The person's later line still wins over the family, and plain text stays text. */
    expect(sameRecord(recorded, tree, 'kept.step')).toBe(true);
    expect(sameRecord(recorded, tree, 'notes.txt')).toBe(true);
    expect(objects.size).toBe(4);
  });

  it('should regenerate a stale block to the current families', () => {
    const stale =
      '# BEGIN Tau generated — large objects are git LFS objects\n*.stl filter=lfs diff=lfs merge=lfs -text\n# END Tau generated\n';
    const tree = new ImmutableRevisionTree([
      ['.gitattributes', stale],
      ['part.step', 'solid part\n'],
    ]);

    const { tree: recorded } = cleanLargeObjects(tree);

    expect(decoder.decode(recorded.get('.gitattributes'))).toBe(tauBlock);
    expect(readLfsPointer(recorded.get('part.step')!)).toBeDefined();
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

    const { tree: recorded, objects } = cleanLargeObjects(tree);

    expect(readLfsPointer(recorded.get('scan.stl')!)).toStrictEqual(lfsPointerFor(scan).pointer);
    expect(objects.get(lfsPointerFor(scan).pointer.oid)).toBe(revisionTreeFiles(tree).get('scan.stl')?.content);
    /* No Tau block: neither the family nor the size adds a line. */
    expect(sameRecord(recorded, tree, 'part.step')).toBe(true);
    expect(decoder.decode(recorded.get('.gitattributes'))).toBe(attributes);
    expect(objects.size).toBe(1);
  });

  it('should keep a tree that names nothing as the same tree, and a pointer as itself', () => {
    const { bytes } = lfsPointerFor(new Uint8Array(64).fill(1));
    const plain = new ImmutableRevisionTree([
      ['big.bin', new Uint8Array(2 * 1024 * 1024)],
      ['part.step', 'solid part\n'],
      /* Tau's ignore block alone does not make a cut write attributes: `init` creates that file. */
      ['.gitignore', generatedIgnoreContent(undefined)],
    ]);
    const pointered = new ImmutableRevisionTree([
      ['.gitattributes', '*.bin filter=lfs\n'],
      ['a.bin', bytes],
    ]);

    expect(cleanLargeObjects(plain).tree).toBe(plain);
    expect(cleanLargeObjects(pointered).tree).toBe(pointered);
  });
});
