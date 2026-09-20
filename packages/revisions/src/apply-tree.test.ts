/**
 * What capture, cut and apply cost, and what an interrupted apply leaves.
 *
 * Every claim here is a count or a survival, never a duration (C2): how many
 * full-tree walks a settlement takes, how many file bytes a cut over an
 * unchanged tree reads, how many batches its staged writes go out as, and — for
 * a checkout stopped at each step of the apply protocol in turn — that the files
 * come back as they were or as the revision wanted them, with none of the
 * apply's own temporary siblings left behind.
 *
 * The counting surface is the checkout the actors write through: a real
 * `NodeFsProvider` plus the two rooted reads a browser or daemon checkout offers
 * and a bare provider does not — `statTree`, whose timestamps these tests own,
 * and `writeFiles`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { walk } from '@taucad/filesystem/content-ops';
import type { FileMode, FileStatEntry, RootedFileSystem } from '@taucad/filesystem';

import { captureRevisionTree, ImmutableRevisionTree } from '#algorithms/index.js';
import { createApplyTreeEffects } from '#apply-tree.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { Checkout } from '#revision-port.js';
import { RevisionPortError } from '#revision-port.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionActors } from '#revision-effects.js';
import { tauRevisionPolicy } from '#workspace-config.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** One fixed reading, so the memo's racy-timestamp window is the test's to place a file in. */
const clockReading = 1_758_000_000_000;

/* Rejection reasons must be real errors; the snapshot's is typed loosely. */
const asError = (failure: unknown): Error => (failure instanceof Error ? failure : new Error(String(failure)));

/** Run one injected promise actor the way its machine would. */
const run = async <Output>(actor: unknown, input: unknown): Promise<Output> =>
  new Promise<Output>((resolve, reject) => {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the actor logic is the machine's own; this drives it directly.
    const running = createActor(actor as Parameters<typeof createActor>[0], { input });
    running.subscribe({
      next: (snapshot) => {
        if (snapshot.status === 'done') {
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the output type is the caller's contract.
          resolve(snapshot.output as Output);
        }
        if (snapshot.status === 'error') {
          reject(asError(snapshot.error));
        }
      },
      error: (failure: unknown) => {
        reject(asError(failure));
      },
    });
    running.start();
  });

type Counts = {
  /** File reads of either kind: the bytes a capture did not get from its memo. */
  reads: number;
  /** Listings of the tree root, which is one per full-tree walk. */
  rootListings: number;
  /** Single-file writes, which staging as a batch does not make. */
  writeFile: number;
  /** Batched writes. */
  writeFiles: number;
  /** Every call that changes the tree, in order, so one of them can be stopped. */
  mutations: number;
  /** What those calls were, which is what names the step a stopped apply stopped at. */
  calls: string[];
};

type CountingOptions = Readonly<{
  /** How much older than the clock the surface reports every timestamp; no `statTree` at all when absent. */
  statAge?: number;
  /** Whether the surface offers a batch write. */
  batch?: boolean;
  /** Which mutation, in call order, fails instead of running. */
  failMutation?: (sequence: number) => boolean;
  /** Fold provider paths the way a case-insensitive filesystem does. */
  caseInsensitive?: boolean;
}>;

/**
 * The checkout the actors see: counting, optionally batch-writing, and stating a
 * tree whose timestamps sit where the caller puts them.
 *
 * @param real - The tree underneath; every delegated call on it is uncounted.
 * @param options - Timestamp age, batch write, and the mutation to stop at.
 * @returns The surface, its counts and a reset.
 */
const countingCheckout = (
  real: NodeFsProvider,
  options: CountingOptions,
): Readonly<{ checkout: RootedFileSystem; counts: Counts; reset: () => void }> => {
  const counts: Counts = { reads: 0, rootListings: 0, writeFile: 0, writeFiles: 0, mutations: 0, calls: [] };
  const mutate = async <Result>(call: string, operation: () => Promise<Result>): Promise<Result> => {
    counts.mutations += 1;
    counts.calls.push(call);
    if (options.failMutation?.(counts.mutations) === true) {
      throw new Error(`the checkout stopped at ${call} (mutation ${String(counts.mutations)})`);
    }
    return operation();
  };
  const pathOf = (path: string): string => (options.caseInsensitive === true ? path.toLowerCase() : path);
  const statTree = async (path: string): Promise<FileStatEntry[]> => {
    const stats: FileStatEntry[] = [];
    for await (const entry of walk(real, path)) {
      if (entry.kind === 'file') {
        // oxlint-disable-next-line no-await-in-loop -- one stat per entry the walk reaches.
        const stat = await real.stat(entry.relativePath);
        stats.push({
          ...stat,
          path: entry.relativePath,
          name: entry.relativePath.split('/').at(-1) ?? entry.relativePath,
          mtimeMs: clockReading - (options.statAge ?? 0),
        });
      }
    }
    return stats;
  };
  const counted = {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- one assertion for an overloaded read, as the capture suite does.
    readFile: (async (path: string, encoding?: 'utf8') => {
      counts.reads += 1;
      return encoding === undefined ? real.readFile(pathOf(path)) : real.readFile(pathOf(path), encoding);
    }) as RootedFileSystem['readFile'],
    readFileStream: (path: string, streamOptions?: Parameters<NodeFsProvider['readFileStream']>[1]) => {
      counts.reads += 1;
      return real.readFileStream(pathOf(path), streamOptions);
    },
    readdir: async (path: string): Promise<string[]> => {
      if (path === '') {
        counts.rootListings += 1;
      }
      return real.readdir(path);
    },
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> => {
      counts.writeFile += 1;
      await mutate('writeFile', async () => real.writeFile(pathOf(path), data));
    },
    rename: async (from: string, to: string): Promise<void> =>
      mutate('rename', async () => real.rename(pathOf(from), pathOf(to))),
    unlink: async (path: string): Promise<void> => mutate('unlink', async () => real.unlink(pathOf(path))),
    exists: async (path: string): Promise<boolean> => real.exists(pathOf(path)),
    setFileMode: async (path: string, mode: FileMode): Promise<void> =>
      mutate('setFileMode', async () => real.setFileMode(pathOf(path), mode)),
    ...(options.statAge === undefined ? {} : { statTree }),
    ...(options.batch === true
      ? {
          writeFiles: async (files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>): Promise<void> => {
            counts.writeFiles += 1;
            await mutate('writeFiles', async () =>
              Promise.all(
                Object.entries(files).map(async ([path, { content }]) => real.writeFile(pathOf(path), content)),
              ),
            );
          },
        }
      : {}),
  };
  return {
    checkout: Object.assign(Object.create(real) as RootedFileSystem, counted),
    counts,
    reset: () => {
      counts.reads = 0;
      counts.rootListings = 0;
      counts.writeFile = 0;
      counts.writeFiles = 0;
      counts.mutations = 0;
      counts.calls = [];
    },
  };
};

/** Timestamps a minute old, which is outside the memo's racy window, and a batch write. */
const trustedStats: CountingOptions = { statAge: 60_000, batch: true };

/**
 * One project directory, its port, and actor sets opened over it on demand.
 *
 * @param files - What the tree holds before the port exists.
 * @param options - Passed to {@link countingCheckout}.
 * @returns The tree, its counts, and `open` — a fresh process's view of the same
 *   files, which is how the litter of a stopped apply is met.
 */
const project = async (
  files: Readonly<Record<string, string>>,
  options: CountingOptions = trustedStats,
): Promise<
  Readonly<{
    tree: NodeFsProvider;
    checkout: RootedFileSystem;
    counts: Counts;
    reset: () => void;
    open: () => RevisionActors;
  }>
> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-apply-tree-'));
  roots.push(root);
  const tree = new NodeFsProvider(root);
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, written in order.
    await tree.writeFile(path, content);
  }
  const { checkout, counts, reset } = countingCheckout(tree, options);
  const port = createIsomorphicGitRevisionPort({ filesystem: tree });
  return {
    tree,
    checkout,
    counts,
    reset,
    open: () =>
      createRevisionActors({
        port,
        projectId: 'project-1',
        authorityEpoch: 'epoch-1',
        clock: () => clockReading,
        filesystem: async () => checkout,
      }),
  };
};

const liveCheckout: Checkout = {
  id: 'live',
  projectId: 'project-1',
  root: '',
  kind: 'live',
  branch: 'main',
  baseRevisionId: undefined,
};

/** The extracted apply primitive over the counting checkout used by the crash rows. */
const materializer = (checkout: RootedFileSystem) => {
  let temporary = 0;
  return createApplyTreeEffects({
    useFileSystem: async (_place, operation) => operation(checkout),
    capture: async () =>
      captureRevisionTree(checkout, { exclude: (path) => !tauRevisionPolicy.policy.classify(path).versioned }),
    onApplyingTree: undefined,
    policy: tauRevisionPolicy.policy,
    withCheckoutFence: async (_checkoutId, operation) => operation(),
    recordedTree: async (tree) => tree,
    formatOf: async () => 'sha1',
    temporarySibling: (path) => {
      temporary += 1;
      const separator = path.lastIndexOf('/');
      const directory = separator === -1 ? '' : path.slice(0, separator + 1);
      const name = path.slice(separator + 1);
      return `${directory}.${name}.0.00000000-0000-4000-8000-${String(temporary).padStart(12, '0')}.tmp`;
    },
    unlinkIfPresent: async (live, path) => {
      await live.unlink(path).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      });
    },
  }).materializeTree;
};

/** Cut the live checkout and answer the tree id the store would record. */
const cut = async (actors: RevisionActors): Promise<string> => {
  const held = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
    checkoutId: 'live',
    trigger: 'save',
  });
  return held.treeId;
};

/** Record the live tree as a revision. */
const save = async (actors: RevisionActors): Promise<Readonly<{ revisionId: string; treeId: string }>> => {
  const held = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
    checkoutId: 'live',
    trigger: 'save',
  });
  const receipt = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
    checkoutId: 'live',
    cutId: held.cutId,
    treeId: held.treeId,
    parents: [],
    trigger: 'save',
    leaseIds: [],
  });
  return { revisionId: receipt.revisionId, treeId: held.treeId };
};

/** Every file in the tree except the store's own, so litter shows up as a path nobody wrote. */
const filesOf = async (tree: NodeFsProvider): Promise<string[]> => {
  const found: string[] = [];
  for await (const entry of walk(tree, '', { admits: (path) => path !== '.git' })) {
    if (entry.kind === 'file') {
      found.push(entry.relativePath);
    }
  }
  return found.sort();
};

/*
 * Deliberately looser than the pattern the sweep matches: a minter that drifted
 * from its matcher would leave a name this still calls litter.
 */
const litterIn = (found: readonly string[]): string[] =>
  found.filter((path) => /(?:^|\/)\..+\.\d+\..+\.tmp$/u.test(path));

describe('what a cut reads', () => {
  it('should read no file bytes for a cut over a tree nothing has touched', async () => {
    const { counts, reset, open } = await project({
      'main.ts': 'export const size = 1;\n',
      'src/helper.ts': 'export const help = true;\n',
    });
    const actors = open();
    const first = await cut(actors);
    expect(counts.reads).toBeGreaterThan(0);

    reset();
    const second = await cut(actors);

    expect(second).toBe(first);
    expect(counts.reads).toBe(0);
  }, 30_000);

  it('should read a file again when its timestamp is too recent to be trusted', async () => {
    const { tree, counts, reset, open } = await project(
      { 'main.ts': 'export const size = 1;\n' },
      { ...trustedStats, statAge: 0 },
    );
    const actors = open();
    const first = await cut(actors);

    /* Same size, same reported timestamp, different bytes: the rewrite a memo
     * that trusted a stat this young would miss (C3). */
    await tree.writeFile('main.ts', 'export const size = 2;\n');
    reset();
    const second = await cut(actors);

    expect(counts.reads).toBeGreaterThan(0);
    expect(second).not.toBe(first);
  }, 30_000);

  it('should read every file when the checkout keeps no timestamps to trust', async () => {
    const { counts, reset, open } = await project({ 'main.ts': 'export const size = 1;\n' }, { batch: true });
    const actors = open();
    await cut(actors);

    reset();
    await cut(actors);

    expect(counts.reads).toBeGreaterThan(0);
  }, 30_000);
});

/*
 * One turn's worth of work, and the tree put back the way it was found.
 *
 * A settlement only writes what the checkout does not already have, so the
 * agent's tree is captured and then reverted — which is how a settlement's apply
 * is reached at all, and what `turn.machine` sees when a person or the preview
 * pipeline undoes the agent's work while the turn is finishing.
 */
const baseFiles = { 'main.ts': 'export const size = 1;\n', 'drop.ts': 'export const gone = true;\n' };
const agentWrites = async (tree: NodeFsProvider): Promise<void> => {
  await tree.writeFile('main.ts', 'export const size = 22_222_222;\n');
  await tree.writeFile('added.ts', 'export const added = true;\n');
  await tree.unlink('drop.ts');
};
const putBack = async (tree: NodeFsProvider): Promise<void> => {
  await tree.writeFile('main.ts', baseFiles['main.ts']);
  await tree.unlink('added.ts');
  await tree.writeFile('drop.ts', baseFiles['drop.ts']);
};

describe('what a settlement walks', () => {
  it('should walk the tree twice to settle a turn, and stage its writes as one batch', async () => {
    const { tree, counts, reset, open } = await project(baseFiles);
    const actors = open();
    const base = await save(actors);

    await agentWrites(tree);
    const captured = await run<{ captureId: string }>(actors.turn.capture, { checkoutId: 'live', turnId: 'turn-1' });
    await putBack(tree);

    reset();
    const merged = await run<{ status: string }>(actors.turn.merge, {
      checkoutId: 'live',
      captureId: captured.captureId,
      baseRevisionId: base.revisionId,
    });

    expect(merged.status).toBe('recorded');
    /* The live tree the merge takes its third side from, and the re-read that
     * verifies what the apply wrote — and nothing else (CI4). */
    expect(counts.rootListings).toBe(2);
    expect(counts.writeFiles).toBe(1);
    expect(counts.writeFile).toBe(0);
  }, 30_000);
});

describe('a large apply', () => {
  it('should apply 2,000 changed files in one staged batch and leave no temporary sibling', async () => {
    const context = await project({});
    const target = new ImmutableRevisionTree(
      Array.from({ length: 2000 }, (_, index) => [
        `src/file-${String(index).padStart(4, '0')}.ts`,
        `export const value = ${String(index)};\n`,
      ]),
    );
    context.reset();

    const result = await materializer(context.checkout)(liveCheckout, target, {
      before: new ImmutableRevisionTree([]),
    });

    expect(result.paths).toHaveLength(2000);
    expect(context.counts.writeFiles).toBe(1);
    expect(context.counts.writeFile).toBe(0);
    expect(context.counts.calls.filter((call) => call === 'setFileMode')).toHaveLength(2000);
    expect(context.counts.calls.filter((call) => call === 'rename')).toHaveLength(2000);
    expect(context.counts.calls.filter((call) => call === 'unlink')).toHaveLength(2000);
    expect(context.counts.reads).toBe(2000);
    expect(context.counts.rootListings).toBe(1);
    expect(litterIn(await filesOf(context.tree))).toEqual([]);
  }, 120_000);
});

describe('a case-insensitive checkout', () => {
  it('should refuse a recorded case collision without changing the working copy', async () => {
    const context = await project({ 'keep.txt': 'before\n' }, { ...trustedStats, caseInsensitive: true });
    const before = await captureRevisionTree(context.checkout);
    const collision = new ImmutableRevisionTree([
      ['Part.ts', 'upper\n'],
      ['part.ts', 'lower\n'],
    ]);
    context.reset();

    let failure: unknown;
    try {
      await materializer(context.checkout)(liveCheckout, collision, { before });
      expect.fail('the case collision should have been refused');
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(RevisionPortError);
    expect(failure).toMatchObject({
      code: 'UNSUPPORTED_OPERATION',
      message: 'Tracked paths collide on a supported filesystem: Part.ts, part.ts',
    });
    expect(context.counts.mutations).toBe(0);
    expect(await filesOf(context.tree)).toEqual(['keep.txt']);
    expect(await context.tree.readFile('keep.txt', 'utf8')).toBe('before\n');
  });
});

describe('reopening a project an apply died in', () => {
  const orphan = '.main.ts.0.0f9e8d7c-1234-4abc-8def-0123456789ab.tmp';
  const lookalikes = {
    '.main.ts.0.not-a-uuid.tmp': 'a name of the person’s own\n',
    'main.ts.0.0f9e8d7c-1234-4abc-8def-0123456789ab.tmp': 'no leading dot, so not a sibling\n',
    '.notes.tmp': 'nor this\n',
  };

  it('should sweep the siblings an apply staged before the first capture, and keep every file that only looks like one', async () => {
    const kept = { 'main.ts': 'export const size = 1;\n', ...lookalikes };
    const littered = await project({ ...kept, [orphan]: 'bytes an apply never published\n' });
    const clean = await project(kept);

    const litteredTreeId = await cut(littered.open());
    const cleanTreeId = await cut(clean.open());

    const found = await filesOf(littered.tree);
    expect(found).not.toContain(orphan);
    expect(found).toEqual(expect.arrayContaining(Object.keys(lookalikes)));
    /* Swept before the first capture, so the revision this cut would record is
     * the one the project without the litter records. */
    expect(litteredTreeId).toBe(cleanTreeId);
  }, 30_000);
});

describe('a checkout stopped inside an apply', () => {
  it('should report the failure it could not roll back together with the one that stopped it', async () => {
    /* Every mutation from the eighth on fails, so the rollback the apply's
     * failure starts cannot run either — the one path no suite reached. */
    const stopped = await project(baseFiles, {
      statAge: 60_000,
      batch: true,
      failMutation: (sequence) => sequence >= 8,
    });
    const base = await save(stopped.open());
    await agentWrites(stopped.tree);
    const settling = stopped.open();
    const captured = await run<{ captureId: string }>(settling.turn.capture, {
      checkoutId: 'live',
      turnId: 'turn-1',
    });
    await putBack(stopped.tree);
    stopped.reset();

    const settlement = run(settling.turn.merge, {
      checkoutId: 'live',
      captureId: captured.captureId,
      baseRevisionId: base.revisionId,
    });

    await expect(settlement).rejects.toThrow(/The prior files could not be restored completely\./u);
    await settlement.catch((error: unknown) => {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toHaveLength(2);
    });
  }, 30_000);

  it('should leave the files as they were or as the revision wanted them, with no temporary sibling behind', async () => {
    /* The clean run says how many steps there are to stop at, and what the two
     * admissible outcomes hash to. */
    const clean = await project(baseFiles);
    const cleanActors = clean.open();
    const base = await save(cleanActors);
    await agentWrites(clean.tree);
    const cleanCapture = await run<{ captureId: string }>(cleanActors.turn.capture, {
      checkoutId: 'live',
      turnId: 'turn-1',
    });
    await putBack(clean.tree);
    clean.reset();
    const cleanMerge = await run<{ status: string }>(cleanActors.turn.merge, {
      checkoutId: 'live',
      captureId: cleanCapture.captureId,
      baseRevisionId: base.revisionId,
    });
    expect(cleanMerge.status).toBe('recorded');
    const settledTreeId = await cut(cleanActors);
    const steps = clean.counts.mutations;
    expect(steps).toBeGreaterThan(5);

    for (const step of Array.from({ length: steps }, (_, index) => index + 1)) {
      // oxlint-disable-next-line no-await-in-loop -- one whole project per step, in order.
      const stopped = await project(baseFiles, { ...trustedStats, failMutation: (sequence) => sequence === step });
      // oxlint-disable-next-line no-await-in-loop -- the base revision of this step's project.
      const stoppedBase = await save(stopped.open());
      // oxlint-disable-next-line no-await-in-loop -- this step's turn.
      await agentWrites(stopped.tree);
      const settling = stopped.open();
      // oxlint-disable-next-line no-await-in-loop -- the capture this step's settlement applies.
      const stoppedCapture = await run<{ captureId: string }>(settling.turn.capture, {
        checkoutId: 'live',
        turnId: 'turn-1',
      });
      // oxlint-disable-next-line no-await-in-loop -- the tree the settlement has to write into.
      await putBack(stopped.tree);
      stopped.reset();
      // oxlint-disable-next-line no-await-in-loop -- the settlement that stops at this step.
      await run(settling.turn.merge, {
        checkoutId: 'live',
        captureId: stoppedCapture.captureId,
        baseRevisionId: stoppedBase.revisionId,
      }).catch(() => undefined);

      /* A fresh process over the same files: its first capture sweeps whatever
       * the stopped one left staged or backed up (W8f). */
      // oxlint-disable-next-line no-await-in-loop -- the reopened view of this step's files.
      const reopenedTreeId = await cut(stopped.open());
      // oxlint-disable-next-line no-await-in-loop -- the litter check for this step.
      const found = await filesOf(stopped.tree);

      expect(litterIn(found), `step ${String(step)} left ${found.join(', ')}`).toEqual([]);
      expect(
        [stoppedBase.treeId, settledTreeId],
        `stopping at ${clean.counts.calls[step - 1] ?? '?'} (step ${String(step)} of ${clean.counts.calls.join(', ')}) left ${found.join(', ')}`,
      ).toContain(reopenedTreeId);
    }
  }, 300_000);
});
