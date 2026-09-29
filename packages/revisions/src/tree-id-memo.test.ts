/**
 * Rule 20's gate rule, counted: a cut after a one-file edit hashes one blob
 * plus that path's tree objects, never the tree (W4 acceptance, L4-F1–F4).
 *
 * Every digest the gate makes goes through `#object-hash.js`, so counting its
 * calls by the object they frame is an exact count of the work, independent of
 * this machine's speed. Reads are counted on the provider the capture reads.
 */
import { createMemoryProvider } from '@taucad/filesystem/backend';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureRevisionTree } from '#algorithms/revision-capture.js';
import type { ImmutableRevisionTree } from '#algorithms/revision-tree.js';
import { cleanLargeObjects } from '#lfs.js';
import type * as objectHash from '#object-hash.js';
import { createTreeIdMemo } from '#tree-id-memo.js';

const digests = vi.hoisted(() => ({ blob: 0, tree: 0, sha256: 0 }));

vi.mock('#object-hash.js', async (importOriginal) => {
  const original = await importOriginal<typeof objectHash>();
  const decoder = new TextDecoder();
  return {
    ...original,
    digest: (format: objectHash.ObjectFormat, input: Uint8Array<ArrayBuffer>) => {
      const type = decoder.decode(input.subarray(0, 5));
      if (type === 'blob ') {
        digests.blob += 1;
      } else if (type === 'tree ') {
        digests.tree += 1;
      }
      return original.digest(format, input);
    },
    digestHex: (format: objectHash.ObjectFormat, input: Uint8Array<ArrayBuffer>) => {
      if (format === 'sha256') {
        digests.sha256 += 1;
      }
      return original.digestHex(format, input);
    },
  };
});

const resetDigests = (): void => {
  digests.blob = 0;
  digests.tree = 0;
  digests.sha256 = 0;
};

afterEach(() => {
  resetDigests();
});

const moduleText = (index: number, revision: number): string =>
  `export const value${String(index)} = ${String(revision)};\n`;

/** 200 files in 10 directories under `src/`, and optionally one large export. */
const project = async (largeObject: boolean) => {
  const filesystem = await createMemoryProvider();
  const paths = Array.from(
    { length: 200 },
    (_, index) => `src/${String(Math.floor(index / 20))}/module-${String(index)}.ts`,
  );
  await Promise.all(paths.map(async (path, index) => filesystem.writeFile(path, moduleText(index, 0))));
  if (largeObject) {
    await filesystem.writeFile('assets/part.bin', new Uint8Array(2 * 1024 * 1024).fill(7));
  }
  const reads = vi.spyOn(filesystem, 'readFile');
  return { filesystem, paths, reads };
};

describe('the tree-hash gate after a one-file edit', () => {
  it.each([
    ['without', false],
    ['with', true],
  ])(
    'should read 1 file and digest 1 blob and 3 tree objects at 200 files, %s a large object',
    async (_label, largeObject) => {
      const { filesystem, paths, reads } = await project(largeObject);
      const memo = createTreeIdMemo();
      const gate = (tree: ImmutableRevisionTree): string => memo.treeId(cleanLargeObjects(tree).tree, 'sha1');
      const first = await captureRevisionTree(filesystem);
      gate(first);
      await filesystem.writeFile(paths[42]!, moduleText(42, 1));
      reads.mockClear();
      resetDigests();

      const second = await captureRevisionTree(filesystem, { changedSince: { tree: first, paths: [paths[42]!] } });
      const secondId = gate(second);

      expect(reads.mock.calls.map(([path]) => path)).toEqual([paths[42]]);
      /* The edited blob, then `src/2`, `src` and the root. */
      expect(digests).toEqual({ blob: 1, tree: 3, sha256: 0 });
      /* Byte-identical to a full capture hashed from nothing (a fresh memo;
       * `git-tree-id.test.ts` pins that against stock git). */
      const full = await captureRevisionTree(filesystem);
      expect(secondId).toBe(createTreeIdMemo().treeId(cleanLargeObjects(full).tree, 'sha1'));
    },
  );

  it('should digest nothing for a cut of an untouched tree', async () => {
    const { filesystem } = await project(true);
    const memo = createTreeIdMemo();
    const first = await captureRevisionTree(filesystem);
    const firstId = memo.treeId(cleanLargeObjects(first).tree, 'sha1');
    resetDigests();

    const second = await captureRevisionTree(filesystem, { changedSince: { tree: first, paths: [] } });

    expect(memo.treeId(cleanLargeObjects(second).tree, 'sha1')).toBe(firstId);
    expect(digests).toEqual({ blob: 0, tree: 0, sha256: 0 });
  });

  it('should hash only the new and changed paths when files are added and a directory is removed', async () => {
    const { filesystem, paths } = await project(false);
    const memo = createTreeIdMemo();
    const first = await captureRevisionTree(filesystem);
    memo.treeId(first, 'sha1');
    await Promise.all(paths.slice(180).map(async (path) => filesystem.unlink(path)));
    await filesystem.rmdir('src/9');
    await filesystem.writeFile('docs/readme.md', '# new\n');
    resetDigests();

    const second = await captureRevisionTree(filesystem, {
      changedSince: { tree: first, paths: ['src/9', 'docs/readme.md'] },
    });
    const secondId = memo.treeId(second, 'sha1');

    expect(second.size).toBe(paths.length - 20 + 1);
    /* One new blob; `docs`, `src` (lost a child) and the root. */
    expect(digests).toEqual({ blob: 1, tree: 3, sha256: 0 });
    const full = await captureRevisionTree(filesystem);
    expect(secondId).toBe(createTreeIdMemo().treeId(full, 'sha1'));
  });

  it('should keep each object format to its own slots', async () => {
    const { filesystem, paths } = await project(false);
    const memo = createTreeIdMemo();
    const first = await captureRevisionTree(filesystem);
    memo.treeId(first, 'sha1');
    memo.treeId(first, 'sha256');
    await filesystem.writeFile(paths[0]!, moduleText(0, 1));
    const second = await captureRevisionTree(filesystem, { changedSince: { tree: first, paths: [paths[0]!] } });
    resetDigests();

    const ids = [memo.treeId(second, 'sha256'), memo.treeId(second, 'sha1')];

    expect(digests).toEqual({ blob: 2, tree: 6, sha256: 0 });
    const full = await captureRevisionTree(filesystem);
    expect(ids).toEqual([createTreeIdMemo().treeId(full, 'sha256'), createTreeIdMemo().treeId(full, 'sha1')]);
  });
});
