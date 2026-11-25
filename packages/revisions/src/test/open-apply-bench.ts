/**
 * A cold open's tree write, from the sync's fast-forward to the entry closure
 * landed (STO-25 SP6-apply).
 *
 * Not a test: a node harness whose numbers are a property of this machine. It
 * copies a bare repository's store into a fresh directory, leaves `main`
 * unborn with `refs/remotes/tau/main` at the repository's head, and runs the
 * sync's fast-forward over the isomorphic-git store and a directory checkout,
 * as a hosted open does once its packs are in. A head listing's sizes come
 * from `--sizes`, one `<oid> <size>` line per blob (`git ls-tree -r -l`), as a
 * cold open's catalogue gives them.
 *
 * It reports, per run, milliseconds from the fast-forward's start to: the
 * bracket opening (`onApplyingTree`), `tau.json` landed, the entry file
 * landed, and the write's end, plus the bracket-to-closure interval, how
 * long the store's tree reads took, and the longest the event loop went
 * without a turn while the write ran (`longestBlock`) and how many turns the
 * write's hashing gave the event loop (`hashingTurns`).
 *
 * Run from `packages/revisions`:
 * `node --import @oxc-node/core/register src/test/open-apply-bench.ts --store=<bare repo> --sizes=<file> --runs=3`
 *
 * @internal
 */
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createActor } from 'xstate';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import type { BatchEntry, BatchOptions, BatchReceipt } from '@taucad/filesystem';
import { AbstractFileSystemProvider } from '@taucad/filesystem/backend';
import { revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { RevisionPort } from '#revision-port.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionFileSystem } from '#revision-effects.js';
import { testIdentity } from '#test/identity.js';
import { hashingTurns } from '#tree-id-memo.js';
import { StepClock } from '@taucad/xstate-testing/clock';

const argument = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const store = argument('store', '');
const sizesFile = argument('sizes', '');
const runs = Number(argument('runs', '3'));
const entry = argument('entry', 'main.ts');

const sizes = new Map(
  (sizesFile === '' ? '' : await readFile(sizesFile, 'utf8'))
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [oid, size] = line.split(' ');
      return [oid!, Number(size)] as const;
    }),
);

const median = (samples: readonly number[]): number =>
  Math.round([...samples].toSorted((left, right) => left - right)[Math.floor(samples.length / 2)]!);

type Marks = {
  bracket?: number;
  manifest?: number;
  entry?: number;
  end?: number;
  reads: number;
  stall?: number;
  turns?: number;
};

const once = async (): Promise<Marks> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-open-apply-bench-'));
  try {
    await cp(store, join(root, '.git'), { recursive: true });
    await rm(join(root, '.git', 'refs', 'heads', 'main'), { force: true });
    await rm(join(root, '.git', 'packed-refs'), { force: true });
    const headFile = await readFile(join(store, 'refs', 'heads', 'main'), 'utf8').catch(async () => {
      const packed = await readFile(join(store, 'packed-refs'), 'utf8');
      return packed
        .split('\n')
        .find((line) => line.endsWith(' refs/heads/main'))!
        .split(' ')[0]!;
    });
    const head = headFile.trim();
    const provider = new NodeFsProvider(root);
    let started = 0;
    const marks: Marks = { reads: 0 };
    const checkout = Object.assign(Object.create(provider) as NodeFsProvider, {
      applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
        const receipts = await AbstractFileSystemProvider.prototype.applyBatch.call(provider, entries, batchOptions);
        const at = performance.now() - started;
        for (const written of entries) {
          const path = 'path' in written ? written.path : 'to' in written ? written.to : undefined;
          if (path === 'tau.json') {
            marks.manifest ??= at;
          }
          if (path === entry) {
            marks.entry ??= at;
          }
        }
        return receipts;
      },
    }) as RevisionFileSystem;
    const inner = createIsomorphicGitRevisionPort({ filesystem: provider });
    const port: RevisionPort = {
      ...inner,
      readTree: async (id, options) => {
        const from = performance.now();
        try {
          return await inner.readTree(id, options);
        } finally {
          marks.reads += performance.now() - from;
          if (process.env['BENCH_TRACE'] === '1') {
            console.log(
              `readTree ${String(options?.paths?.length ?? 'whole')} paths ${String(Math.round(from - started))}+${String(Math.round(performance.now() - from))} ms`,
            );
          }
        }
      },
      ...(inner.listTree === undefined
        ? {}
        : {
            listTree: async (id) => {
              const listed = await inner.listTree!(id);
              return listed?.map((file) => {
                const size = sizes.get(file.oid);
                return size === undefined ? file : { ...file, size };
              });
            },
          }),
    };
    await inner.setHead('main');
    await inner.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: revisionId(head) });
    const clock = new StepClock();
    clock.set(Date.now());
    const actors = createRevisionActors({
      identity: testIdentity,
      port,
      projectId: 'project-1',
      clock,
      filesystem: async () => checkout,
      onApplyingTree: () => {
        marks.bracket ??= performance.now() - started;
      },
    });
    /* The longest the event loop went without a turn while the write ran: the longest synchronous block. */
    const loop = monitorEventLoopDelay({ resolution: 5 });
    loop.enable();
    const turns = hashingTurns.count;
    started = performance.now();
    await new Promise<void>((resolve, reject) => {
      const running = createActor(actors.sync.fastForward as Parameters<typeof createActor>[0], {
        input: { remote: 'tau', branch: 'main' },
      });
      running.subscribe({
        next: (snapshot) => {
          if (snapshot.status === 'done') {
            resolve();
          }
          if (snapshot.status === 'error') {
            const failure: unknown = snapshot.error;
            reject(failure instanceof Error ? failure : new Error(String(failure)));
          }
        },
        error: (failure: unknown) => {
          reject(failure instanceof Error ? failure : new Error(String(failure)));
        },
      });
      running.start();
    });
    marks.end = performance.now() - started;
    loop.disable();
    marks.stall = loop.max / 1e6;
    marks.turns = hashingTurns.count - turns;
    return marks;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const samples: Marks[] = [];
for (let run = 0; run < runs; run += 1) {
  // oxlint-disable-next-line no-await-in-loop -- one open at a time, so runs never share the CPU.
  const marks = await once();
  samples.push(marks);
  const closure = Math.max(marks.manifest ?? Number.NaN, marks.entry ?? Number.NaN);
  console.log(
    JSON.stringify({
      run,
      bracket: Math.round(marks.bracket ?? Number.NaN),
      manifest: Math.round(marks.manifest ?? Number.NaN),
      entry: Math.round(marks.entry ?? Number.NaN),
      bracketToClosure: Math.round(closure - (marks.bracket ?? Number.NaN)),
      end: Math.round(marks.end ?? Number.NaN),
      treeReads: Math.round(marks.reads),
      longestBlock: Math.round(marks.stall ?? Number.NaN),
      hashingTurns: marks.turns,
    }),
  );
}
const of = (pick: (marks: Marks) => number | undefined): number => median(samples.map((marks) => pick(marks) ?? 0));
console.log(
  JSON.stringify({
    median: true,
    bracket: of((marks) => marks.bracket),
    closure: of((marks) => Math.max(marks.manifest ?? 0, marks.entry ?? 0)),
    bracketToClosure: of((marks) => Math.max(marks.manifest ?? 0, marks.entry ?? 0) - (marks.bracket ?? 0)),
    end: of((marks) => marks.end),
    treeReads: of((marks) => marks.reads),
    longestBlock: of((marks) => marks.stall),
    hashingTurns: of((marks) => marks.turns),
  }),
);
/* A finished open leaves its fill retrying against a remote this harness does not have. */
// oxlint-disable-next-line unicorn/no-process-exit -- a harness ends once its numbers are printed.
process.exit(0);
