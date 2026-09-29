/**
 * B1 on the disk host at D11's fixture (W4 a3): a save through the host's own
 * channel, timed from the request until the channel reports the new head.
 *
 * Not a test: a node harness whose numbers are a property of this machine,
 * recorded under the run's `lanes/W4/` beside the load they were taken at. The
 * store is native Git, the watcher is the host's own, and each save follows a
 * one-file edit that the watcher has not reported yet, so the watch barrier is
 * inside the timed span.
 *
 * Run from `packages/host`:
 * `node --import @oxc-node/core/register src/test/save-bench.ts --files=1000 --binary=5242880 --runs=9`
 *
 * @internal
 */
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { createNativeGitRevisionPort } from '@taucad/revisions/node';

import { createProjectRevisions } from '#revisions.js';

const argument = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const fileCount = Number(argument('files', '1000'));
const binaryBytes = Number(argument('binary', String(5 * 1024 * 1024)));
const runs = Number(argument('runs', '9'));

const body = (index: number, edit: number): string =>
  `export const value${String(index)} = ${String(index + edit)}; // ${'x'.repeat(48)}\n`.repeat(30);
const paths = Array.from(
  { length: fileCount },
  (_, index) => `src/${String(Math.floor(index / 20))}/module-${String(index)}.ts`,
);
const median = (samples: readonly number[]): number =>
  Number([...samples].toSorted((left, right) => left - right)[Math.floor(samples.length / 2)]!.toFixed(2));

/* The host's watcher and its bounds hold no reference on the loop; a real host has its server for that. */
const alive = setInterval(() => undefined, 1000);

const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-save-bench-'));
const checkoutsDirectory = await mkdtemp(join(tmpdir(), 'tau-host-save-bench-checkouts-'));
await Promise.all(
  paths.map(async (path, index) => {
    await mkdir(dirname(join(workspaceRoot, path)), { recursive: true });
    await writeFile(join(workspaceRoot, path), body(index, 0));
  }),
);
if (binaryBytes > 0) {
  await mkdir(join(workspaceRoot, 'assets'), { recursive: true });
  await writeFile(join(workspaceRoot, 'assets/blob.bin'), Buffer.alloc(binaryBytes, 7));
}
/* A project on disk was not written a moment ago. */
const then = new Date(Date.now() - 60_000);
await Promise.all(paths.map(async (path) => utimes(join(workspaceRoot, path), then, then)));

const revisions = createProjectRevisions({
  workspaceRoot,
  projectId: 'save-bench',
  port: createNativeGitRevisionPort({
    repositoryPath: workspaceRoot,
    checkouts: { projectId: 'save-bench', directory: checkoutsDirectory },
  }),
});
const settled = async (condition: () => boolean): Promise<void> => {
  while (!condition()) {
    // oxlint-disable-next-line no-await-in-loop -- polling the projection.
    await new Promise((resolve) => {
      setTimeout(resolve, 1);
    });
  }
};
await settled(() => revisions.status().checkoutId !== undefined);

const save = async (edit: number): Promise<number> => {
  if (edit > 0) {
    const index = edit % paths.length;
    await writeFile(join(workspaceRoot, paths[index]!), body(index, edit));
  }
  const before = revisions.status().headRevisionId;
  const start = performance.now();
  await revisions.channel.request({ command: 'saveRevision' });
  await settled(() => revisions.status().headRevisionId !== before);
  return performance.now() - start;
};

/* One save records the fixture and one more warms the memos: the timed saves are the steady state. */
const first = await save(0);
await save(runs + 1);
const samples: number[] = [];
for (let run = 1; run <= runs; run += 1) {
  // oxlint-disable-next-line no-await-in-loop -- sequential samples.
  samples.push(await save(run));
}
await revisions.release();
clearInterval(alive);
await rm(workspaceRoot, { recursive: true, force: true });
await rm(checkoutsDirectory, { recursive: true, force: true });
process.stdout.write(
  `${JSON.stringify({
    files: fileCount,
    binaryBytes,
    runs,
    node: process.version,
    at: new Date().toISOString(),
    results: {
      'host-save-native': {
        p50: median(samples),
        min: Number(Math.min(...samples).toFixed(2)),
        first: Number(first.toFixed(2)),
      },
    },
  })}\n`,
);
