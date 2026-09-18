/**
 * The latency budgets that are really process counts (W6, B3/B5/B6).
 *
 * On the native leg a revision read costs what it spawns: one `git` is ~7 ms of
 * fork, `.gitconfig` and object-store setup before it does any work, so an
 * operation that spawns one process per file or per revision cannot meet a
 * budget however fast the engine is. These rows count processes rather than
 * milliseconds, because a millisecond row would be a measurement of this
 * machine and a process count is a property of the code.
 *
 * The counter is a shim named as `gitExecutable`, so the count is exact and
 * includes anything the port spawns indirectly. It records a line when a child
 * starts and another when it exits, which is what makes *concurrent* children
 * observable rather than inferred.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionId, RevisionTreeInput } from '#algorithms/index.js';
import { afterAll, describe, expect, it } from 'vitest';

import { cleanLargeObjects } from '#lfs.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { revisionTreeId } from '#revision-effects.js';
import { readRevisionLog } from '#revision-verbs.js';
import type { RevisionPort } from '#revision-port.js';

const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const author = { name: 'Tau', email: 'tau@example.com' };
const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** How many children were alive at once, and how many ran in total. */
type Spawns = Readonly<{ total: number; peakConcurrent: number }>;

/**
 * A project whose every `git` call is counted.
 *
 * @param label - Names the temporary directory.
 * @returns The port, and a reader for what it has spawned since the last read.
 */
const countedProject = async (
  label: string,
): Promise<Readonly<{ port: RevisionPort; spawns: () => Promise<Spawns> }>> => {
  const root = await mkdtemp(join(tmpdir(), `tau-latency-${label}-`));
  roots.push(root);
  const log = join(root, 'children.log');
  const shim = join(root, 'git-counting');
  await writeFile(
    shim,
    ['#!/bin/sh', `echo start >> ${log}`, 'git "$@"', 'status=$?', `echo end >> ${log}`, 'exit $status', ''].join('\n'),
    { mode: 0o755 },
  );
  const repositoryPath = join(root, 'project');
  await mkdir(repositoryPath, { recursive: true });
  let read = 0;
  return {
    port: createNativeGitRevisionPort({ repositoryPath, gitExecutable: shim }),
    spawns: async (): Promise<Spawns> => {
      const recorded = await readFile(log, 'utf8').catch(() => '');
      const lines = recorded.split('\n').filter((line) => line !== '');
      const since = lines.slice(read);
      read = lines.length;
      let live = 0;
      let peak = 0;
      for (const line of since) {
        live += line === 'start' ? 1 : -1;
        peak = Math.max(peak, live);
      }
      return { total: since.filter((line) => line === 'start').length, peakConcurrent: peak };
    },
  };
};

const treeOf = (entries: readonly RevisionTreeInput[]): ImmutableRevisionTree => new ImmutableRevisionTree(entries);
const encoder = new TextEncoder();

describe.runIf(gitOnPath)('native-leg latency budgets', () => {
  it('B5: a 50-row history page over 200 revisions costs a handful of processes', async () => {
    const { port, spawns } = await countedProject('b5');
    await port.init({ author });
    let head: RevisionId | undefined;
    for (let index = 0; index < 200; index += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each revision names the one before it.
      const receipt = await port.writeRevision({
        parents: head === undefined ? [] : [head],
        tree: treeOf([['a.txt', encoder.encode(`revision ${String(index)}\n`)]]),
        provenance: { source: 'user', actorId: 'latency', createdAt: 1_757_000_000_000 + index * 1000 },
        summary: { generated: `Revision ${String(index)}` },
      });
      const next = revisionId(receipt.commitId);
      // oxlint-disable-next-line eslint/no-await-in-loop -- the branch has to move before the next revision names it.
      await port.updateRef({ name: 'main', expectedHead: head, head: next });
      head = next;
    }

    await spawns();
    const rows = await readRevisionLog(port, { branch: 'main', limit: 50 });
    const counted = await spawns();

    expect(rows).toHaveLength(50);
    /* `Rev N` is still the ordinal over the whole branch, not the page. */
    expect(rows[0]?.revisionNumber).toBe(200);
    expect(counted.total).toBeLessThanOrEqual(5);
  }, 300_000);

  it('B6: reading a 4,000-file tree costs three processes and never fans out', async () => {
    const { port, spawns } = await countedProject('b6');
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: treeOf(
        Array.from(
          { length: 4000 },
          (_unused, index): RevisionTreeInput => [
            `src/${String(Math.floor(index / 20))}/m${String(index)}.ts`,
            encoder.encode(`export const v${String(index)} = ${String(index)};\n`),
          ],
        ),
      ),
      provenance: { source: 'user', actorId: 'latency', createdAt: 1_757_000_000_000 },
      summary: { generated: 'Four thousand files' },
    });

    await spawns();
    const tree = await port.readTree(revisionId(receipt.commitId));
    const counted = await spawns();

    expect(tree?.size).toBe(4000);
    expect(tree?.get('src/0/m0.ts')).toStrictEqual(encoder.encode('export const v0 = 0;\n'));
    expect(counted.total).toBeLessThanOrEqual(3);
    expect(counted.peakConcurrent).toBeLessThanOrEqual(16);
  }, 300_000);
});

describe('cut hashing (B3)', () => {
  /* The measured cost of a save was never one hash of the tree: the I5 gate
   * folds the cut, the claim `revisionTreeId` makes folds it again and the port
   * cleans it a third time on the way to the object store, each SHA-256ing
   * every large object in it at about 163 MiB/s (L4). The fix is memoization,
   * so the row that matters is that memoizing changed no id — `treeId` is the
   * identity every host compares (I4). */
  const entries = (): readonly RevisionTreeInput[] => [
    ['src/main.ts', encoder.encode('export const v = 1;\n')],
    ['models/part.step', Uint8Array.from({ length: 1024 * 1024 + 1 }, (_unused, index) => (index * 7) % 256)],
  ];

  it('folds one cut once and answers a second fold with the same bytes', () => {
    const tree = treeOf(entries());

    const first = cleanLargeObjects(tree);
    const second = cleanLargeObjects(tree);

    expect(second).toBe(first);
    /* A separate tree over separate buffers takes the uncached path, and the
     * two answers are identical — which is what makes the cache safe. */
    const twin = cleanLargeObjects(treeOf(entries()));
    /* `Object.is` rather than `expect(twin).not.toBe(first)`: a *negated*
     * `toBe` pretty-formats both operands to build the message it would print,
     * and both of these hold a 1 MiB object. That cost is real, but it does not
     * make this row red on its own — reverted and re-measured on an idle
     * machine it passes in 2.0 s, against vitest's 5 s default. It was observed
     * at 10.3 s only under heavy concurrent load, so what this line buys is
     * headroom against a *load-sensitive* timeout, not a fix for a standing
     * failure. The fact asserted is the same one. */
    expect(Object.is(twin, first)).toBe(false);
    for (const format of ['sha1', 'sha256'] as const) {
      expect(revisionTreeId(twin.tree, format)).toBe(revisionTreeId(first.tree, format));
    }
    expect([...twin.objects.keys()]).toStrictEqual([...first.objects.keys()]);
  });
});
