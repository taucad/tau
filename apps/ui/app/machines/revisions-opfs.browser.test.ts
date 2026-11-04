/*
 * RM-A22 (TS-Q3, TS-R17): two dedicated workers, each with its own OPFS provider and revision
 * port, on one origin's OPFS. The fresh fence (RM-R16) needs a lease record written in one worker
 * to be visible to a later read in another, and I7 needs the ref's compare-and-swap to admit
 * exactly one of two publications over the same expected head.
 */

import { afterEach, expect, it } from 'vitest';
import type { OpfsRequest, PointerTreeApplied } from '#machines/revisions-opfs.fixture.worker.js';

type OpfsWorker = Readonly<{ ask: (request: OpfsRequest) => Promise<unknown>; terminate: () => void }>;

const startWorker = (): OpfsWorker => {
  const worker = new Worker(new URL('revisions-opfs.fixture.worker.ts', import.meta.url), { type: 'module' });
  let next = 0;
  const waiting = new Map<number, PromiseWithResolvers<unknown>>();
  worker.addEventListener('message', (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
    const { id, result, error } = event.data;
    const pending = waiting.get(id);
    waiting.delete(id);
    if (error === undefined) {
      pending?.resolve(result);
    } else {
      pending?.reject(new Error(error));
    }
  });
  return {
    ask: async (request) => {
      next += 1;
      const pending = Promise.withResolvers<unknown>();
      waiting.set(next, pending);
      worker.postMessage({ id: next, request });
      return pending.promise;
    },
    terminate: () => {
      worker.terminate();
    },
  };
};

const directory = `rm-a22-${crypto.randomUUID()}`;
const workers: OpfsWorker[] = [];

const twoWorkers = (): readonly [OpfsWorker, OpfsWorker] => {
  const pair = [startWorker(), startWorker()] as const;
  workers.push(...pair);
  return pair;
};

afterEach(async () => {
  for (const worker of workers.splice(0)) {
    worker.terminate();
  }
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(directory, { recursive: true }).catch(() => undefined);
});

it('should show a lease record written in one worker to a later read in another worker', async () => {
  const [first, second] = twoWorkers();

  await expect(second.ask({ op: 'readLeases', directory })).resolves.toEqual([]);
  await first.ask({ op: 'writeLease', directory, runId: 'run-1' });

  await expect(second.ask({ op: 'readLeases', directory })).resolves.toEqual(['run-1']);
});

it('should let exactly one of two workers publish over the same expected head', async () => {
  const [first, second] = twoWorkers();
  await first.ask({ op: 'init', directory });
  const base = String(await first.ask({ op: 'writeRevision', directory, parent: undefined, content: 'base\n' }));
  await expect(first.ask({ op: 'updateRef', directory, expectedHead: undefined, head: base })).resolves.toBe('updated');
  const heads = [
    String(await first.ask({ op: 'writeRevision', directory, parent: base, content: 'first\n' })),
    String(await second.ask({ op: 'writeRevision', directory, parent: base, content: 'second\n' })),
  ];

  const outcomes = await Promise.all([
    first.ask({ op: 'updateRef', directory, expectedHead: base, head: heads[0] ?? '' }),
    second.ask({ op: 'updateRef', directory, expectedHead: base, head: heads[1] ?? '' }),
  ]);

  expect(outcomes.map(String).toSorted((left, right) => left.localeCompare(right))).toEqual(['conflicted', 'updated']);
  const winner = heads[outcomes.indexOf('updated')];
  await expect(first.ask({ op: 'readRef', directory })).resolves.toBe(winner);
  await expect(second.ask({ op: 'readRef', directory })).resolves.toBe(winner);
});

/*
 * A cold open of a hosted project of about 450 files, most of them large-object
 * pointers, spent minutes applying its tree on OPFS. The apply itself — staged
 * writes, one native move per file, and the verifying re-read — runs over the
 * bare provider here in about ten seconds on a CI-sized container (about 18 s
 * with the copy-then-unlink rename); the bound guards the order of magnitude,
 * not a benchmark.
 */
it('should apply 439 pointer-sized files to an empty OPFS checkout in seconds, not minutes', async () => {
  const [worker] = twoWorkers();

  const applied = (await worker.ask({ op: 'applyPointerTree', directory, files: 439 })) as PointerTreeApplied;

  expect(applied).toMatchObject({ files: 439, matching: 439, litter: [] });
  expect(applied.milliseconds).toBeLessThan(20_000);
}, 120_000);
