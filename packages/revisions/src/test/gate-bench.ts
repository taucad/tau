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
 * - `save`: B1 through the actor tree — `changed`, then a `save` cut timed until
 *   `revisionMinted` — over an in-memory project whose host promises a complete
 *   change feed (the browser worker's bus).
 * - `save-walk`: the same tree without that promise: every save walks.
 * - `save-native`: the same tree over a directory on disk and the native Git
 *   store, without that promise (the desktop host today).
 * - `native-parts`: the native save's three effects timed apart — the cut's
 *   capture and tree id, the store's write, and the ref update.
 * - `plan`: E5's restore plan to the previous revision over the in-memory store.
 *
 * Run from `packages/revisions`:
 * `node --import @oxc-node/core/register src/test/gate-bench.ts --files=1000 --binary=5242880 --runs=7`
 *
 * @internal
 */
import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import type { FileStatEntry } from '@taucad/filesystem';
import { captureRevisionTree, createCaptureMemo } from '#algorithms/revision-capture.js';
import type { ImmutableRevisionTree } from '#algorithms/revision-tree.js';
import { revisionTreeId } from '#git-tree-id.js';
import { cleanLargeObjects } from '#lfs.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { revisionId } from '#algorithms/revision-tree.js';
import { tauRevisionPolicy } from '#workspace-config.js';
import { createProjectRevisionsActor, createRevisionActors } from '#revision-effects.js';
import type { RevisionFileSystem } from '#revision-effects.js';
import { createActor } from 'xstate';

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

const fixture = async <Provider extends Awaited<ReturnType<typeof createMemoryProvider>> | NodeFsProvider>(
  filesystem: Provider,
): Promise<Provider> => {
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

type Filesystem = Awaited<ReturnType<typeof createMemoryProvider>>;

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
  const filesystem = await fixture(await createMemoryProvider());
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
  const filesystem = await fixture(await createMemoryProvider());
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

/* A project on disk was not written a moment ago: its files are older than the memo's racy window. */
const age = async (root: string): Promise<void> => {
  const then = new Date(Date.now() - 60_000);
  const aged = binaryBytes > 0 ? [...paths, 'assets/blob.bin'] : paths;
  await Promise.all(aged.map(async (path) => utimes(join(root, path), then, then)));
};

const measureSave = async (variant: string): Promise<Record<string, number>> => {
  const root = variant === 'save-native' ? await mkdtemp(join(tmpdir(), 'tau-gate-bench-')) : undefined;
  const filesystem = await fixture(root === undefined ? await createMemoryProvider() : new NodeFsProvider(root));
  if (root !== undefined) {
    await age(root);
  }
  const port =
    root === undefined
      ? createIsomorphicGitRevisionPort({ filesystem })
      : createNativeGitRevisionPort({ repositoryPath: root });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  const { actor } = createProjectRevisionsActor({
    port,
    projectId: 'gate-bench',
    authorityEpoch: 'gate-bench',
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the in-memory provider is the checkout the worker's rooted view wraps.
    filesystem: async () => filesystem as unknown as RevisionFileSystem,
    completeChanges: variant === 'save',
  });
  let answered: PromiseWithResolvers<void> | undefined;
  actor.on('*', (event: { type: string; trigger?: string }) => {
    if (
      event.trigger === 'save' &&
      (event.type === 'revisionMinted' || event.type === 'nothingToSave' || event.type === 'cutFailed')
    ) {
      answered?.resolve();
    }
  });
  actor.start();
  let generation = 0;
  const save = async (edited: string | undefined, index: number): Promise<number> => {
    if (edited !== undefined) {
      await filesystem.writeFile(edited, body(index, generation + 1));
      generation += 1;
      actor.send({ type: 'changed', checkoutId: 'live', paths: [edited], generation });
    }
    answered = Promise.withResolvers<void>();
    const start = performance.now();
    actor.send({ type: 'cut', trigger: 'save', checkoutId: 'live', leaseIds: [] });
    await answered.promise;
    return performance.now() - start;
  };
  /* The registry and D4's comparison settle, then one save records the fixture
   * and one more warms the memos: the timed saves are the steady state. */
  while (!actor.getSnapshot().context.registrySettled) {
    // oxlint-disable-next-line no-await-in-loop -- polling the registry.
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  const first = await save(undefined, 0);
  await save(paths[0], 0);
  const samples: number[] = [];
  for (let run = 1; run <= runs; run += 1) {
    // oxlint-disable-next-line no-await-in-loop -- sequential samples.
    samples.push(await save(paths[run % paths.length], run % paths.length));
  }
  actor.stop();
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true });
  }
  return { p50: median(samples), min: Number(Math.min(...samples).toFixed(2)), first: Number(first.toFixed(2)) };
};

const asError = (failure: unknown): Error => (failure instanceof Error ? failure : new Error(String(failure)));

/* One injected effect run the way its machine runs it. */
const runEffect = async <Output>(logic: unknown, input: unknown): Promise<Output> =>
  new Promise<Output>((resolve, reject) => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the effect is the machine's own logic.
    const running = createActor(logic as Parameters<typeof createActor>[0], { input });
    running.subscribe({
      next: (snapshot) => {
        if (snapshot.status === 'done') {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- the caller names the output.
          resolve(snapshot.output as Output);
        } else if (snapshot.status === 'error') {
          reject(asError(snapshot.error));
        }
      },
    });
    running.start();
  });

const measureNativeParts = async (): Promise<Record<string, number>> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-gate-bench-'));
  const filesystem = await fixture(new NodeFsProvider(root));
  await age(root);
  const port = createNativeGitRevisionPort({ repositoryPath: root });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  const actors = createRevisionActors({
    port,
    projectId: 'gate-bench',
    authorityEpoch: 'gate-bench',
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the provider is the live checkout.
    filesystem: async () => filesystem as unknown as RevisionFileSystem,
  });
  const parts: { cut: number[]; write: number[]; ref: number[] } = { cut: [], write: [], ref: [] };
  let head: string | undefined;
  for (let run = 0; run <= runs; run += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one edit per save.
    await filesystem.writeFile(paths[run % paths.length]!, body(run % paths.length, run + 1));
    let start = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- sequential samples.
    const cut = await runEffect<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const cutTime = performance.now() - start;
    start = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- sequential samples.
    const written = await runEffect<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: cut.cutId,
      treeId: cut.treeId,
      parents: head === undefined ? [] : [head],
      trigger: 'save',
      leaseIds: [],
    });
    const writeTime = performance.now() - start;
    start = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- sequential samples.
    await runEffect(actors.checkout.casHead, {
      checkoutId: 'live',
      branch: 'main',
      expectedHead: head,
      head: written.revisionId,
    });
    const refTime = performance.now() - start;
    head = written.revisionId;
    if (run > 0) {
      parts.cut.push(cutTime);
      parts.write.push(writeTime);
      parts.ref.push(refTime);
    }
  }
  await rm(root, { recursive: true, force: true });
  return Object.fromEntries(Object.entries(parts).map(([name, samples]) => [name, median(samples)]));
};

const measurePlan = async (): Promise<Record<string, number>> => {
  const filesystem = await fixture(await createMemoryProvider());
  const port = createIsomorphicGitRevisionPort({ filesystem });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
  const actors = createRevisionActors({
    port,
    projectId: 'gate-bench',
    authorityEpoch: 'gate-bench',
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the provider is the live checkout.
    filesystem: async () => filesystem as unknown as RevisionFileSystem,
    completeChanges: true,
  });
  const revisions: string[] = [];
  for (let run = 0; run < 2; run += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one edit per revision.
    await filesystem.writeFile(paths[run]!, body(run, run + 1));
    // oxlint-disable-next-line no-await-in-loop -- sequential revisions.
    const cut = await runEffect<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    // oxlint-disable-next-line no-await-in-loop -- sequential revisions.
    const written = await runEffect<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: cut.cutId,
      treeId: cut.treeId,
      parents: revisions.slice(-1),
      trigger: 'save',
      leaseIds: [],
    });
    // oxlint-disable-next-line no-await-in-loop -- sequential revisions.
    await runEffect(actors.checkout.casHead, {
      checkoutId: 'live',
      branch: 'main',
      expectedHead: revisions.at(-1),
      head: written.revisionId,
    });
    revisions.push(written.revisionId);
  }
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- sequential samples.
    await runEffect(actors.restore.computePlan, { checkoutId: 'live', target: revisions[0] });
    samples.push(performance.now() - start);
  }
  return { p50: median(samples), min: Number(Math.min(...samples).toFixed(2)) };
};

const measures: Readonly<Record<string, () => Promise<Record<string, number>>>> = {
  mint: measureMint,
  'native-parts': measureNativeParts,
  plan: measurePlan,
};
const measureOf = (variant: string): (() => Promise<Record<string, number>>) =>
  measures[variant] ?? (variant.startsWith('save') ? async () => measureSave(variant) : async () => measure(variant));

const results: Record<string, unknown> = {};
for (const variant of variants) {
  if ((variant === 'incremental' || variant === 'memo-wired') && treeIdMemoModule === undefined) {
    continue;
  }
  // oxlint-disable-next-line no-await-in-loop -- one variant at a time keeps the samples independent.
  results[variant] = await measureOf(variant)();
}
process.stdout.write(
  `${JSON.stringify({ files: fileCount, binaryBytes, runs, node: process.version, at: new Date().toISOString(), results })}\n`,
);
