/**
 * One pointer rule on every leg, derived from the tree (D16): a path is a
 * pointer exactly when the tree's attributes say `filter=lfs`, and Tau writes
 * only its own block. A large object is resident once: the objects a clean
 * hands its store are the tree's own bytes, and the result is cached for as
 * long as the tree lives (review finding 7).
 */
import { describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionTreeFiles } from '#algorithms/revision-tree.js';
import { cleanLargeObjects, largeObjectBasisOf, lfsPointerFor, readLfsPointer } from '#lfs.js';
import { blobOid } from '#tree-id-memo.js';
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

describe("when a cut rewrites Tau's block (W11.2 review)", () => {
  const stale =
    '# BEGIN Tau generated — large objects are git LFS objects\n*.stl filter=lfs diff=lfs merge=lfs -text\n# END Tau generated\n';
  const big = new Uint8Array(2 * 1024 * 1024).fill(3);

  it('leaves a stale block alone in a cut that changed nothing', () => {
    const parent = new ImmutableRevisionTree([
      ['.gitattributes', stale],
      ['part.step', 'solid part\n'],
      ['big.bin', big],
    ]);
    const basis = largeObjectBasisOf(
      'sha1',
      [...revisionTreeFiles(parent)].map(([path, { content }]) => ({ path, oid: blobOid(content, 'sha1') })),
    );

    const { tree: recorded, objects } = cleanLargeObjects(parent, { basis });

    expect(recorded).toBe(parent);
    expect(objects.size).toBe(0);
  });

  it('rewrites it in the cut that adds a file it owes a line for, and keeps the unchanged entries as they were', () => {
    const parent = new ImmutableRevisionTree([
      ['.gitattributes', stale],
      ['part.step', 'solid part\n'],
    ]);
    const basis = largeObjectBasisOf(
      'sha1',
      [...revisionTreeFiles(parent)].map(([path, { content }]) => ({ path, oid: blobOid(content, 'sha1') })),
    );
    const next = new ImmutableRevisionTree([
      ...parent.entries().map(({ path, content }) => [path, content] as const),
      ['big.bin', big],
    ]);

    const { tree: recorded } = cleanLargeObjects(next, { basis });

    expect(decoder.decode(recorded.get('.gitattributes'))).toBe(generatedGitattributesContent(undefined, ['big.bin']));
    expect(readLfsPointer(recorded.get('big.bin')!)).toBeDefined();
    /* Its family is named now, but it is unchanged from the parent, so it stays the blob the parent holds. */
    expect(sameRecord(recorded, next, 'part.step')).toBe(true);
  });

  it('never adds a line to a block that lost its end marker', () => {
    const malformed =
      '# BEGIN Tau generated — large objects are git LFS objects\n*.stl filter=lfs diff=lfs merge=lfs -text\n';
    const tree = new ImmutableRevisionTree([
      ['.gitattributes', malformed],
      ['big.bin', big],
      ['scan.stl', 'solid scan\n'],
    ]);

    const { tree: recorded } = cleanLargeObjects(tree);

    expect(sameRecord(recorded, tree, '.gitattributes')).toBe(true);
    expect(sameRecord(recorded, tree, 'big.bin')).toBe(true);
    /* What its lines say still stands, as Git reads them. */
    expect(readLfsPointer(recorded.get('scan.stl')!)).toBeDefined();
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

describe('cleanLargeObjects with case folding (core.ignoreCase)', () => {
  it("writes the same block either way, and folds only the person's own patterns", () => {
    const shouted = new Uint8Array(64).fill(6);
    const tree = new ImmutableRevisionTree([
      ['.gitattributes', `*.raw filter=lfs diff=lfs merge=lfs -text\n${tauBlock}`],
      ['PART.STEP', shouted],
      ['SCAN.RAW', 'raw\n'],
    ]);

    const folded = cleanLargeObjects(tree, { ignoreCase: true }).tree;
    const exact = cleanLargeObjects(tree).tree;

    expect(decoder.decode(folded.get('.gitattributes'))).toBe(decoder.decode(exact.get('.gitattributes')));
    expect(readLfsPointer(folded.get('PART.STEP')!)).toBeDefined();
    expect(readLfsPointer(exact.get('PART.STEP')!)).toBeDefined();
    /* The residual: a person's pattern matched only by case is a pointer only where the host folds case. */
    expect(readLfsPointer(folded.get('SCAN.RAW')!)).toBeDefined();
    expect(readLfsPointer(exact.get('SCAN.RAW')!)).toBeUndefined();
  });
});
