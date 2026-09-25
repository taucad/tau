/**
 * Rule 20's tree-hash gate at D11's fixture, measured at the algorithm level
 * (W4, B1): one file edited, then the cut's capture, clean and tree id.
 *
 * Not a test: a node harness whose numbers are a property of this machine,
 * recorded under the run's `lanes/W4/` beside the load they were taken at.
 * Each variant runs `--runs` times on its own fixture and reports the median.
 *
 * - `full`: the gate as L4 measured it — a full walk, every byte read.
 * - `memo`: the shipped EQ7 path — a full walk over the `(size, mtime)` memo.
 * - `memo-wired`: the EQ7 path with this checkout's tree-id memo (E2, E3) —
 *   what the full-walk fallback costs once W4 a2 wires the memo.
 * - `incremental`: E1 — the previous cut's tree plus the changed paths.
 * - `mint`: the browser store's `writeRevision` of that incremental cut (B1's
 *   second half), over an in-memory store.
 *
 * Run from `packages/revisions`:
 * `node --import @oxc-node/core/register src/test/gate-bench.ts --files=1000 --binary=5242880 --runs=7`
 *
 * @internal
 */
import { performance } from 'node:perf_hooks';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import type { FileStatEntry } from '@taucad/filesystem';
import { captureRevisionTree, createCaptureMemo } from '#algorithms/revision-capture.js';
import type { ImmutableRevisionTree } from '#algorithms/revision-tree.js';
import { revisionTreeId } from '#git-tree-id.js';
import { cleanLargeObjects } from '#lfs.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { revisionId } from '#algorithms/revision-tree.js';
import { tauRevisionPolicy } from '#workspace-config.js';

const argument = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const fileCount = Number(argument('files', '1000'));
const binaryBytes = Number(argument('binary', String(5 * 1024 * 1024)));
const runs = Number(argument('runs', '7'));
const variants = argument('variants', 'full,memo,memo-wired,incremental,mint').split(',');

const encoder = new TextEncoder();
const body = (index: number, edit: number): Uint8Array<ArrayBuffer> => {
  const line = `export const value${String(index)} = ${String(index + edit)}; // ${'x'.repeat(48)}\n`;
  return encoder.encode(line.repeat(Math.ceil(2048 / line.length)));
};
const paths = Array.from(
  { length: fileCount },
  (_, index) => `src/${String(Math.floor(index / 20))}/module-${String(index)}.ts`,
);
const exclude = (path: string): boolean => !tauRevisionPolicy.policy.classify(path).versioned;
const median = (samples: readonly number[]): number =>
  Number([...samples].toSorted((left, right) => left - right)[Math.floor(samples.length / 2)]!.toFixed(2));

/* Loaded lazily so the same harness measures the tree before E1–E3 existed. */
const treeIdMemoModule = await import('#tree-id-memo.js').catch(() => undefined);

const fixture = async () => {
  const filesystem = await createMemoryProvider();
  for (const [index, path] of paths.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- one fixture write at a time.
    await filesystem.writeFile(path, body(index, 0));
  }
  if (binaryBytes > 0) {
    await filesystem.writeFile(
      'assets/blob.bin',
      Uint8Array.from({ length: binaryBytes }, (_, index) => (index * 7) % 256),
    );
  }
  return filesystem;
};

type Filesystem = Awaited<ReturnType<typeof fixture>>;

/* What a host's tree index answers, taken outside the timer: the index is
 * maintained by the authority, not by the cut. */
const statsOf = async (filesystem: Filesystem, tree: ImmutableRevisionTree): Promise<FileStatEntry[]> =>
  Promise.all(
    tree.entries().map(async ({ path }) => {
      const stat = await filesystem.stat(path);
      return { ...stat, path, name: path.slice(path.lastIndexOf('/') + 1), mtimeMs: stat.mtimeMs - 60_000 };
    }),
  );

const measure = async (variant: string): Promise<Record<string, number>> => {
  const filesystem = await fixture();
  const memo = createCaptureMemo();
  const treeIds = treeIdMemoModule?.createTreeIdMemo();
  const treeIdOf = (tree: ImmutableRevisionTree): string =>
    (variant === 'incremental' || variant === 'memo-wired') && treeIds !== undefined
      ? treeIds.treeId(tree, 'sha1')
      : revisionTreeId(tree, 'sha1');
  const gate = async (
    previous: ImmutableRevisionTree | undefined,
    changedPaths: readonly string[] | undefined,
    stats: FileStatEntry[] | undefined,
  ): Promise<ImmutableRevisionTree> => {
    const memoOptions = variant.startsWith('memo') && stats !== undefined ? memo.unchanged(stats, Date.now()) : {};
    const tree = await captureRevisionTree(filesystem, {
      exclude,
      ...memoOptions,
      ...(variant === 'incremental' && previous !== undefined && changedPaths !== undefined
        ? { changedSince: { tree: previous, paths: changedPaths } }
        : {}),
    });
    treeIdOf(cleanLargeObjects(tree).tree);
    return tree;
  };
  /* The first cut of a checkout: D4's spawn-time comparison, nothing memoised. */
  const coldStart = performance.now();
  let tree = await gate(undefined, undefined, undefined);
  const cold = performance.now() - coldStart;
  let stats = await statsOf(filesystem, tree);
  tree = await gate(tree, [], stats);
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const edited = paths[run % paths.length]!;
    // oxlint-disable-next-line no-await-in-loop -- one edit, then one gate.
    await filesystem.writeFile(edited, body(run % paths.length, run + 1));
    // oxlint-disable-next-line no-await-in-loop -- stats are the index's, outside the timer.
    stats = variant.startsWith('memo') ? await statsOf(filesystem, tree) : stats;
    const start = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- sequential samples.
    tree = await gate(tree, [edited], stats);
    samples.push(performance.now() - start);
  }
  return { p50: median(samples), min: Number(Math.min(...samples).toFixed(2)), cold: Number(cold.toFixed(2)) };
};

const measureMint = async (): Promise<Record<string, number>> => {
  const filesystem = await fixture();
  const port = createIsomorphicGitRevisionPort({ filesystem: await createMemoryProvider() });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  const provenance = { source: 'user', actorId: 'gate-bench', createdAt: Date.now() } as const;
  const mint = async (tree: ImmutableRevisionTree, parent: string | undefined): Promise<string> => {
    const written = await port.writeRevision({
      parents: parent === undefined ? [] : [revisionId(parent)],
      tree,
      provenance,
      summary: { generated: 'bench' },
    });
    return written.commitId;
  };
  let tree = await captureRevisionTree(filesystem, { exclude });
  let head = await mint(tree, undefined);
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const edited = paths[run % paths.length]!;
    // oxlint-disable-next-line no-await-in-loop -- one edit, then one cut, then the timed mint.
    await filesystem.writeFile(edited, body(run % paths.length, run + 1));
    // oxlint-disable-next-line no-await-in-loop -- the cut, outside the timer.
    tree = await captureRevisionTree(filesystem, { exclude, changedSince: { tree, paths: [edited] } });
    const start = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- sequential samples.
    head = await mint(tree, head);
    samples.push(performance.now() - start);
  }
  return { p50: median(samples), min: Number(Math.min(...samples).toFixed(2)) };
};

const results: Record<string, unknown> = {};
for (const variant of variants) {
  if ((variant === 'incremental' || variant === 'memo-wired') && treeIdMemoModule === undefined) {
    continue;
  }
  // oxlint-disable-next-line no-await-in-loop -- one variant at a time keeps the samples independent.
  results[variant] = variant === 'mint' ? await measureMint() : await measure(variant);
}
process.stdout.write(
  `${JSON.stringify({ files: fileCount, binaryBytes, runs, node: process.version, at: new Date().toISOString(), results })}\n`,
);
