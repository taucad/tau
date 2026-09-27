/**
 * B1's browser mint, counted: after a one-file edit the store writes that blob
 * and the tree objects on its path, never the project (W4, L4 mint 403 ms).
 *
 * The counters wrap isomorphic-git's own writers, so a write is counted
 * whether or not the loose object already existed — each one hashes and
 * deflates its object.
 */
import { MemoryProvider } from '@taucad/filesystem/backend';
import type * as isomorphicGit from 'isomorphic-git';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureRevisionTree } from '#algorithms/revision-capture.js';
import { revisionId } from '#algorithms/revision-tree.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { revisionTreeId } from '#git-tree-id.js';

const writes = vi.hoisted(() => ({ blob: 0, tree: 0 }));

vi.mock('isomorphic-git', async (importOriginal) => {
  const original = await importOriginal<typeof isomorphicGit>();
  return {
    ...original,
    writeBlob: async (...arguments_: Parameters<typeof original.writeBlob>) => {
      writes.blob += 1;
      return original.writeBlob(...arguments_);
    },
    writeTree: async (...arguments_: Parameters<typeof original.writeTree>) => {
      writes.tree += 1;
      return original.writeTree(...arguments_);
    },
  };
});

const providers: MemoryProvider[] = [];

afterEach(() => {
  for (const provider of providers.splice(0)) {
    provider.dispose();
  }
});

const provenance = { source: 'user', actorId: 'mint-count-test', createdAt: 1_756_742_400_000 } as const;
const moduleText = (index: number, revision: number): string =>
  `export const value${String(index)} = ${String(revision)};\n`;

describe('the browser mint after a one-file edit', () => {
  it('should write 1 blob and only the 3 trees on its path at 1 000 files', async () => {
    const store = new MemoryProvider();
    const checkout = new MemoryProvider();
    providers.push(store, checkout);
    const paths = Array.from(
      { length: 1000 },
      (_, index) => `src/${String(Math.floor(index / 20))}/module-${String(index)}.ts`,
    );
    await Promise.all(paths.map(async (path, index) => checkout.writeFile(path, moduleText(index, 0))));
    const port = createIsomorphicGitRevisionPort({ filesystem: store });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const first = await captureRevisionTree(checkout);
    const base = await port.writeRevision({ parents: [], tree: first, provenance, summary: { generated: 'First' } });
    await checkout.writeFile(paths[421]!, moduleText(421, 1));
    const second = await captureRevisionTree(checkout, { changedSince: { tree: first, paths: [paths[421]!] } });
    writes.blob = 0;
    writes.tree = 0;

    const receipt = await port.writeRevision({
      parents: [revisionId(base.commitId)],
      tree: second,
      provenance,
      summary: { generated: 'Second' },
    });

    /* The edited blob, then `src/21`, `src` and the root. */
    expect(writes).toEqual({ blob: 1, tree: 3 });
    const recordedId = revisionId(receipt.commitId);
    const full = await captureRevisionTree(checkout);
    const record = await port.readRevision(recordedId);
    expect(record?.treeId).toBe(revisionTreeId(full, 'sha1'));
    const recorded = await port.readTree(recordedId);
    expect(new TextDecoder().decode(recorded?.get(paths[421]!))).toBe(moduleText(421, 1));
    expect(recorded?.size).toBe(1000);
  });
});
