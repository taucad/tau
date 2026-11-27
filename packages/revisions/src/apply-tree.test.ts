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
 * `NodeFsProvider` plus the rooted read a browser or daemon checkout offers and
 * a bare provider does not — `statTree`, whose timestamps these tests own. It
 * has no authority above it, so each changeset the apply sends lands as provider
 * batches built from the primitives counted here.
 */

import { createHash } from 'node:crypto';
import fs, { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { writeBlob, writeCommit, writeTree } from 'isomorphic-git';

import { AbstractFileSystemProvider } from '@taucad/filesystem/backend';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { walk } from '@taucad/filesystem/content-ops';
import type {
  BatchEntry,
  BatchOptions,
  BatchReceipt,
  ExpectedEntry,
  FileMode,
  FileStatEntry,
} from '@taucad/filesystem';
import { maximumChangesetEntries } from '@taucad/filesystem';
import { projectManifestSchemaUrl, serializeProjectManifest } from '@taucad/project-core';

import { captureRevisionTree, ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createApplyTreeEffects, readDeferredRevisionTree } from '#apply-tree.js';
import type { DeferredRevisionTree } from '#apply-tree.js';
import { blobOid, createBlobHashing, hashingTurns } from '#tree-id-memo.js';
import { revisionTreeId } from '#git-tree-id.js';
import { UnstoredLargeObjectsError } from '#large-object-fill.js';
import { lfsPointerFor } from '#lfs.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { Checkout, RevisionPort } from '#revision-port.js';
import { RevisionPortError } from '#revision-port.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionActors, RevisionFileSystem } from '#revision-effects.js';
import { generatedGitattributesContent, generatedGitattributesPath, tauRevisionPolicy } from '#workspace-config.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import { recordedBy, testIdentity } from '#test/identity.js';

/** A clock stopped at `time`: these rows read only its `now()`. */
const clockAt = (time: number): StepClock => {
  const clock = new StepClock();
  clock.set(time);
  return clock;
};

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
  /** Provider batches: one per phase of each changeset the apply sends. */
  batches: number;
  /** Every call that changes the tree, in order, so one of them can be stopped. */
  mutations: number;
  /** What those calls were, which is what names the step a stopped apply stopped at. */
  calls: string[];
};

type CountingOptions = Readonly<{
  /** How much older than the clock the surface reports every timestamp; no `statTree` at all when absent. */
  statAge?: number;
  /** Which mutation, in call order, fails instead of running. */
  failMutation?: (sequence: number) => boolean;
  /** Fold provider paths the way a case-insensitive filesystem does. */
  caseInsensitive?: boolean;
  /** Expose linked checkouts through the in-memory port. */
  linkedCheckouts?: boolean;
  /** Runs before each provider batch, with its entries: a concurrent writer's slot. */
  beforeBatch?: (entries: readonly BatchEntry[]) => Promise<void>;
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
): Readonly<{ checkout: RevisionFileSystem; counts: Counts; reset: () => void }> => {
  const counts: Counts = { reads: 0, rootListings: 0, writeFile: 0, batches: 0, mutations: 0, calls: [] };
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
    }) as RevisionFileSystem['readFile'],
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
    readdirEntries: async (path: string) => {
      if (path === '') {
        counts.rootListings += 1;
      }
      return real.readdirEntries(path);
    },
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> => {
      counts.writeFile += 1;
      await mutate('writeFile', async () => real.writeFile(pathOf(path), data));
    },
    rename: async (from: string, to: string): Promise<void> =>
      mutate('rename', async () => real.rename(pathOf(from), pathOf(to))),
    unlink: async (path: string): Promise<void> => mutate('unlink', async () => real.unlink(pathOf(path))),
    exists: async (path: string): Promise<boolean> => real.exists(pathOf(path)),
    /* A disk without an executable bit (Windows) exposes no mode seam, so neither does this surface. */
    ...(real.setFileMode === undefined
      ? {}
      : {
          setFileMode: async (path: string, mode: FileMode): Promise<void> =>
            mutate('setFileMode', async () => real.setFileMode?.(pathOf(path), mode)),
        }),
    ...(options.statAge === undefined ? {} : { statTree }),
  };
  const checkout: RevisionFileSystem = Object.assign(Object.create(real) as RevisionFileSystem, counted, {
    /* The primitives' batch, run over this surface so every primitive it takes is counted. Node's own batch
     * (D16) stages and syncs below the primitives, so it would count nothing here. */
    applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
      counts.batches += 1;
      await options.beforeBatch?.(entries);
      return AbstractFileSystemProvider.prototype.applyBatch.call(checkout, entries, batchOptions);
    },
  });
  return {
    checkout,
    counts,
    reset: () => {
      counts.reads = 0;
      counts.rootListings = 0;
      counts.writeFile = 0;
      counts.batches = 0;
      counts.mutations = 0;
      counts.calls = [];
    },
  };
};

/** Timestamps a minute old, which is outside the memo's racy window. */
const trustedStats: CountingOptions = { statAge: 60_000 };

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
    checkout: RevisionFileSystem;
    counts: Counts;
    port: RevisionPort;
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
  const port = createIsomorphicGitRevisionPort({
    filesystem: tree,
    ...(options.linkedCheckouts === true ? { checkouts: { projectId: 'project-1', root: () => tree } } : {}),
  });
  return {
    tree,
    checkout,
    counts,
    port,
    reset,
    open: () =>
      createRevisionActors({
        identity: testIdentity,
        port,
        projectId: 'project-1',
        clock: clockAt(clockReading),
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

/** The extracted apply primitives over the counting checkout used by the crash rows. */
const applyEffects = (
  checkout: RevisionFileSystem,
  prepareTarget?: Parameters<typeof createApplyTreeEffects>[0]['prepareTarget'],
  onApplyingTree?: Parameters<typeof createApplyTreeEffects>[0]['onApplyingTree'],
) => {
  let temporary = 0;
  return createApplyTreeEffects({
    useFileSystem: async (_place, operation) => operation(checkout),
    capture: async () =>
      captureRevisionTree(checkout, { exclude: (path) => !tauRevisionPolicy.policy.classify(path).versioned }),
    onApplyingTree,
    ...(prepareTarget === undefined ? {} : { prepareTarget }),
    policy: tauRevisionPolicy.policy,
    withCheckoutFence: async (_checkoutId, operation) => operation(),
    checkoutTreeId: async (_checkoutId, tree) => revisionTreeId(tree, 'sha1'),
    temporarySibling: (path, role) => {
      temporary += 1;
      const separator = path.lastIndexOf('/');
      const directory = separator === -1 ? '' : path.slice(0, separator + 1);
      const name = path.slice(separator + 1);
      return `${directory}.${name}.tau-${role}.00000000-0000-4000-8000-${String(temporary).padStart(12, '0')}.tmp`;
    },
    unlinkIfPresent: async (live, path) => {
      await live.unlink(path).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      });
    },
  });
};

/** The extracted apply primitive over the counting checkout used by the crash rows. */
const materializer = (...dependencies: Parameters<typeof applyEffects>) =>
  applyEffects(...dependencies).materializeTree;

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
const filesOf = async (tree: RevisionFileSystem): Promise<string[]> => {
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
  found.filter((path) => /(?:^|\/)\..+\.tau-(?:staged|backup)\..+\.tmp$/u.test(path));

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
    const { counts, reset, open } = await project({ 'main.ts': 'export const size = 1;\n' }, {});
    const actors = open();
    await cut(actors);

    reset();
    await cut(actors);

    expect(counts.reads).toBeGreaterThan(0);
  }, 30_000);

  it('should refuse to discard a same-size replacement whose mtime is unchanged', async () => {
    const context = await project({ 'main.ts': 'old!' }, { ...trustedStats, linkedCheckouts: true });
    const actors = context.open();
    const base = await save(actors);
    const linked = await context.port.addCheckout!({ branch: 'side', from: revisionId(base.revisionId) });
    await run(actors.checkout.cut, { checkoutId: linked.id, trigger: 'save' });

    await context.tree.writeFile('main.ts', 'new!');
    context.reset();

    await expect(run(actors.checkouts.removeCheckout, { projectId: 'project-1', id: linked.id })).rejects.toThrow(
      /not in a revision yet/u,
    );
    expect(context.counts.reads).toBeGreaterThan(0);
    expect(await context.tree.readFile('main.ts', 'utf8')).toBe('new!');
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
  /* A second new file, so a stop can land between two moves of one batch. */
  await tree.writeFile('lib/also-added.ts', 'export const alsoAdded = true;\n');
  await tree.unlink('drop.ts');
};
const putBack = async (tree: NodeFsProvider): Promise<void> => {
  await tree.writeFile('main.ts', baseFiles['main.ts']);
  await tree.unlink('added.ts');
  await tree.unlink('lib/also-added.ts');
  await tree.rmdir('lib');
  await tree.writeFile('drop.ts', baseFiles['drop.ts']);
};

describe('what a settlement walks', () => {
  it('should walk the tree twice to settle a turn, and write each new file once at its final path', async () => {
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
    /* Two new files written in place, and one replacement staged beside main.ts. */
    expect(counts.writeFile).toBe(3);
    /* The removed drop.ts and the replaced main.ts aside, and the staged main.ts published. */
    expect(counts.calls.filter((call) => call === 'rename')).toHaveLength(3);
    expect(litterIn(await filesOf(tree))).toEqual([]);
  }, 30_000);
});

describe('a large apply', () => {
  it('should write 2,000 new files at their final paths in bounded changesets, with no rename and no temporary sibling', async () => {
    const context = await project({});
    const target = new ImmutableRevisionTree(
      Array.from({ length: 2000 }, (_, index) => [
        `src/file-${String(index).padStart(4, '0')}.ts`,
        `export const value = ${String(index)};\n`,
      ]),
    );
    context.reset();
    const exists = vi.spyOn(context.checkout, 'exists');

    const result = await materializer(context.checkout)(liveCheckout, target, {
      before: new ImmutableRevisionTree([]),
    });

    expect(result.paths).toHaveLength(2000);
    /* One provider batch per changeset of at most 256 entries. */
    expect(context.counts.batches).toBe(Math.ceil(2000 / 256));
    expect(context.counts.writeFile).toBe(2000);
    expect(context.counts.calls.filter((call) => call === 'setFileMode')).toHaveLength(2000);
    expect(context.counts.calls.filter((call) => call === 'rename')).toHaveLength(0);
    /* Nothing staged, so nothing to sweep. */
    expect(context.counts.calls.filter((call) => call === 'unlink')).toHaveLength(0);
    expect(exists).not.toHaveBeenCalled();
    expect(context.counts.reads).toBe(2000);
    expect(context.counts.rootListings).toBe(1);
    expect(litterIn(await filesOf(context.tree))).toEqual([]);
    await expect(context.tree.readFile('src/file-1999.ts', 'utf8')).resolves.toBe('export const value = 1999;\n');
  }, 120_000);

  it('should replace 2,000 changed files through a staged sibling and a native move each, and leave no temporary sibling', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 2000 }, (_, index) => [`src/file-${String(index).padStart(4, '0')}.ts`, 'old\n']),
    );
    const context = await project(files);
    const before = new ImmutableRevisionTree(Object.entries(files));
    const target = new ImmutableRevisionTree(
      Object.keys(files).map((path, index) => [path, `export const value = ${String(index)};\n`]),
    );
    context.reset();

    const result = await materializer(context.checkout)(liveCheckout, target, { before });

    expect(result.paths).toHaveLength(2000);
    expect(context.counts.writeFile).toBe(2000);
    /* Each file aside to its backup, then its staged sibling onto it. */
    expect(context.counts.calls.filter((call) => call === 'rename')).toHaveLength(4000);
    /* Each backup removed once its replacement published. */
    expect(context.counts.calls.filter((call) => call === 'unlink')).toHaveLength(2000);
    expect(litterIn(await filesOf(context.tree))).toEqual([]);
    await expect(context.tree.readFile('src/file-1999.ts', 'utf8')).resolves.toBe('export const value = 1999;\n');
  }, 120_000);

  it('should swap a replaced file through its staged sibling and write the new ones in place', async () => {
    const context = await project({ 'main.ts': 'old\n' });
    const before = new ImmutableRevisionTree([['main.ts', 'old\n']]);
    const target = new ImmutableRevisionTree([
      ['main.ts', 'new\n'],
      ['added/a.ts', 'a\n'],
      ['added/b.ts', 'b\n'],
    ]);
    context.reset();

    const result = await materializer(context.checkout)(liveCheckout, target, { before });

    expect(result.paths).toEqual(['added/a.ts', 'added/b.ts', 'main.ts']);
    expect(context.counts.calls.filter((call) => call === 'rename')).toHaveLength(2);
    await expect(context.tree.readFile('main.ts', 'utf8')).resolves.toBe('new\n');
    await expect(context.tree.readFile('added/b.ts', 'utf8')).resolves.toBe('b\n');
    expect(litterIn(await filesOf(context.tree))).toEqual([]);
  });

  it('should refuse a new file created during the apply and keep the concurrent file', async () => {
    const concurrent: { tree?: NodeFsProvider } = {};
    const context = await project(
      {},
      {
        ...trustedStats,
        beforeBatch: async () => {
          await concurrent.tree?.writeFile('src/b.ts', 'a person’s own b\n');
        },
      },
    );
    concurrent.tree = context.tree;
    const target = new ImmutableRevisionTree([
      ['src/a.ts', 'a\n'],
      ['src/b.ts', 'b\n'],
      ['src/c.ts', 'c\n'],
    ]);

    const applying = materializer(context.checkout)(liveCheckout, target, { before: new ImmutableRevisionTree([]) });

    await expect(applying).rejects.toMatchObject({
      code: 'CHECKOUT_CONFLICT',
      message: 'src/b.ts was created while these files were being updated.',
    });
    await expect(context.tree.readFile('src/b.ts', 'utf8')).resolves.toBe('a person’s own b\n');
  });

  it('should name every other new file the apply found taken alongside the conflict it raises', async () => {
    const concurrent: { tree?: NodeFsProvider } = {};
    const context = await project(
      {},
      {
        ...trustedStats,
        beforeBatch: async () => {
          await concurrent.tree?.writeFile('src/a.ts', 'mine a\n');
          await concurrent.tree?.writeFile('src/c.ts', 'mine c\n');
        },
      },
    );
    concurrent.tree = context.tree;
    const target = new ImmutableRevisionTree([
      ['src/a.ts', 'a\n'],
      ['src/b.ts', 'b\n'],
      ['src/c.ts', 'c\n'],
    ]);

    const applying = materializer(context.checkout)(liveCheckout, target, { before: new ImmutableRevisionTree([]) });

    await expect(applying).rejects.toMatchObject({
      code: 'CHECKOUT_CONFLICT',
      message: 'src/a.ts was created while these files were being updated. 1 more file was refused: src/c.ts.',
    });
    await expect(context.tree.readFile('src/a.ts', 'utf8')).resolves.toBe('mine a\n');
    await expect(context.tree.readFile('src/c.ts', 'utf8')).resolves.toBe('mine c\n');
  });

  it('should raise the provider’s own error unchanged and name the other refusals', async () => {
    const context = await project({});
    const missing = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    /* The batch refuses every entry before any byte moved. */
    const checkout: RevisionFileSystem = Object.assign(Object.create(context.checkout) as RevisionFileSystem, {
      applyBatch: async (entries: readonly BatchEntry[]): Promise<BatchReceipt[]> =>
        entries.map(() => ({ outcome: 'failed', error: missing })),
    });
    const target = new ImmutableRevisionTree([
      ['src/a.ts', 'a\n'],
      ['src/b.ts', 'b\n'],
      ['src/c.ts', 'c\n'],
    ]);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const applying = materializer(checkout)(liveCheckout, target, { before: new ImmutableRevisionTree([]) });
      await expect(applying).rejects.toBe(missing);
      expect(missing.message).toBe('EACCES: permission denied');
      expect(warn).toHaveBeenCalledWith(
        '[revisions] src/a.ts could not be published. 2 more files were refused: src/b.ts, src/c.ts.',
      );
    } finally {
      warn.mockRestore();
    }
    expect(await filesOf(context.tree)).toEqual([]);
  });

  it('should put a replaced file back when its publish is refused, and sweep the staged sibling', async () => {
    const context = await project({ 'main.ts': 'old\n' });
    const refusal = Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
    /* Every move onto main.ts is refused before anything moved; every other entry runs. */
    const checkout: RevisionFileSystem = Object.assign(Object.create(context.checkout) as RevisionFileSystem, {
      applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
        const receipts = await Promise.all(
          entries.map(
            async (entry): Promise<BatchReceipt | undefined> =>
              entry.op === 'move' && entry.to === 'main.ts' && entry.from.includes('.tau-staged.')
                ? { outcome: 'failed', error: refusal }
                : undefined,
          ),
        );
        const rest = entries.filter((_, index) => receipts[index] === undefined);
        const applied = await context.checkout.applyBatch!(rest, batchOptions);
        return receipts.map((receipt) => receipt ?? applied.shift()!);
      },
    });
    const before = new ImmutableRevisionTree([['main.ts', 'old\n']]);
    const target = new ImmutableRevisionTree([['main.ts', 'new\n']]);

    await expect(materializer(checkout)(liveCheckout, target, { before })).rejects.toBe(refusal);

    await expect(context.tree.readFile('main.ts', 'utf8')).resolves.toBe('old\n');
    expect(await filesOf(context.tree)).toEqual(['main.ts']);
  });

  it('should put back the files an aborted removal already moved aside, and skip the rest', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 300 }, (_, index) => [`gone/file-${String(index).padStart(3, '0')}.ts`, 'old\n']),
    );
    const context = await project({ ...files, 'kept.ts': 'kept\n' });
    const controller = new AbortController();
    const reason = new Error('the apply was cancelled');
    /* The first changeset of moves aside lands whole; the abort arrives before the second. */
    const checkout: RevisionFileSystem = Object.assign(Object.create(context.checkout) as RevisionFileSystem, {
      applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
        const receipts = await context.checkout.applyBatch!(entries, batchOptions);
        if (entries.some((entry) => entry.op === 'move' && entry.to.includes('.tau-backup.'))) {
          controller.abort(reason);
        }
        return receipts;
      },
    });
    const before = new ImmutableRevisionTree([...Object.entries(files), ['kept.ts', 'kept\n']]);
    const target = new ImmutableRevisionTree([['kept.ts', 'kept\n']]);

    await expect(
      materializer(checkout)(liveCheckout, target, { before, signal: controller.signal }),
    ).rejects.toBeDefined();

    const found = await filesOf(context.tree);
    expect(litterIn(found)).toEqual([]);
    expect(found).toHaveLength(301);
    await expect(context.tree.readFile('gone/file-000.ts', 'utf8')).resolves.toBe('old\n');
  });

  it('should keep an executable mode on a new file it writes in place', async () => {
    const context = await project({});
    const target = new ImmutableRevisionTree([
      ['bin/run.sh', '#!/bin/sh\necho run\n', '100755'],
      ['bin/readme.txt', 'plain\n'],
    ]);
    context.reset();

    await materializer(context.checkout)(liveCheckout, target, { before: new ImmutableRevisionTree([]) });

    expect(context.counts.calls.filter((call) => call === 'rename')).toHaveLength(0);
    await expect(context.tree.getFileMode?.('bin/run.sh')).resolves.toBe('100755');
    await expect(context.tree.getFileMode?.('bin/readme.txt')).resolves.toBe('100644');
  });
});

describe('an apply through the Node provider’s own batch (D16)', () => {
  /** The real provider as the checkout, its batch observed but never replaced. */
  const nativeProject = async (files: Readonly<Record<string, string>>) => {
    const context = await project(files);
    const receipts: BatchReceipt[] = [];
    const batch = vi.spyOn(context.tree, 'applyBatch');
    const real = NodeFsProvider.prototype.applyBatch;
    batch.mockImplementation(async (entries, batchOptions) => {
      const answered = await real.call(context.tree, entries, batchOptions);
      receipts.push(...answered);
      return answered;
    });
    return { ...context, batch, receipts };
  };

  it('should land and read back every file of a tree, replaced or new', async () => {
    const context = await nativeProject({ 'main.ts': 'old\n' });
    const target = new ImmutableRevisionTree([
      ['main.ts', 'new\n'],
      ...Array.from({ length: 40 }, (_, index): [string, string] => [
        `src/${String(index % 4)}/m${String(index)}.ts`,
        `export const v = ${String(index)};\n`,
      ]),
    ]);
    const before = new ImmutableRevisionTree([['main.ts', 'old\n']]);

    await materializer(context.tree)(liveCheckout, target, { before });

    expect(context.batch).toHaveBeenCalled();
    expect(context.receipts.every(({ outcome }) => outcome === 'applied')).toBe(true);
    const found = await filesOf(context.tree);
    expect(litterIn(found)).toEqual([]);
    expect(found).toHaveLength(41);
    expect(revisionTreeId(await captureRevisionTree(context.tree), 'sha1')).toBe(revisionTreeId(target, 'sha1'));
  });

  it('should leave the files as they were or as wanted when a native write lands and then throws', async () => {
    const context = await nativeProject({ 'main.ts': 'old\n', 'kept.ts': 'kept\n' });
    const failure = Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
    const rename = fs.rename.bind(fs);
    /* A native write's rename lands and then throws, so its receipt is uncertain, never failed. */
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to);
      if (String(to).endsWith('fresh.ts')) {
        throw failure;
      }
    });
    const before = new ImmutableRevisionTree([
      ['main.ts', 'old\n'],
      ['kept.ts', 'kept\n'],
    ]);
    const target = new ImmutableRevisionTree([
      ['main.ts', 'new\n'],
      ['kept.ts', 'kept\n'],
      ['fresh.ts', 'fresh\n'],
    ]);

    await expect(materializer(context.tree)(liveCheckout, target, { before })).rejects.toBeDefined();

    expect(context.receipts.some(({ outcome }) => outcome === 'uncertain')).toBe(true);
    expect(context.receipts.some(({ outcome }) => outcome === 'failed')).toBe(false);
    const found = await filesOf(context.tree);
    expect(litterIn(found)).toEqual([]);
    /* As it was, or as the revision wanted it: never a mix with a staged sibling behind. */
    expect([revisionTreeId(before, 'sha1'), revisionTreeId(target, 'sha1')]).toContain(
      revisionTreeId(await captureRevisionTree(context.tree), 'sha1'),
    );
  });
});

describe('landing large objects from the store (W11.3)', () => {
  const part = new TextEncoder().encode('solid part\n'.repeat(512));
  const { pointer, bytes: pointerBytes } = lfsPointerFor(part);

  /* A checkout over a store that holds the part, as the native port lays it out. */
  const storeProject = async (withStore: boolean) => {
    const root = await mkdtemp(join(tmpdir(), 'tau-apply-store-'));
    roots.push(root);
    const store = join(root, 'store');
    const objectDirectory = join(store, pointer.oid.slice(0, 2), pointer.oid.slice(2, 4));
    await fs.mkdir(objectDirectory, { recursive: true });
    await fs.writeFile(join(objectDirectory, pointer.oid), part);
    await fs.mkdir(join(root, 'project', 'models'), { recursive: true });
    await fs.writeFile(join(root, 'project', 'models', 'b.step'), 'old bytes\n');
    const tree = new NodeFsProvider(join(root, 'project'), withStore ? { largeObjectStore: store } : {});
    const batch = vi.spyOn(tree, 'applyBatch');
    return { tree, batch, store };
  };
  const before = new ImmutableRevisionTree([['models/b.step', 'old bytes\n']]);
  const target = new ImmutableRevisionTree([
    ['models/a.step', pointerBytes],
    ['models/b.step', pointerBytes],
  ]);
  const sourced = new Map([
    ['models/a.step', pointer],
    ['models/b.step', pointer],
  ]);

  it('should clone each object, created or replaced, and verify it by its receipt', async () => {
    const { tree, batch } = await storeProject(true);

    await materializer(tree)(liveCheckout, target, { before, purpose: 'fill', largeObjects: sourced });

    expect(await tree.readFile('models/a.step')).toStrictEqual(part);
    expect(await tree.readFile('models/b.step')).toStrictEqual(part);
    const writes = batch.mock.calls.flatMap(([entries]) => entries).filter((entry) => entry.op === 'write');
    expect(writes.every((entry) => 'largeObject' in entry.data)).toBe(true);
    expect(litterIn(await filesOf(tree))).toEqual([]);
  });

  /* #2010: a flush verifies what it wrote, not the checkout: no walk, and a cloned object is checked by its size. */
  it('should verify a fill flush by the paths it wrote, without walking the checkout or reading a cloned object back', async () => {
    const { tree } = await storeProject(true);
    await fs.writeFile(join(tree.root, 'models', 'c.step'), 'bytes the flush does not touch\n');
    const flushBefore = new ImmutableRevisionTree([
      ['models/b.step', 'old bytes\n'],
      ['models/c.step', 'bytes the flush does not touch\n'],
    ]);
    const flushTarget = new ImmutableRevisionTree([
      ['models/a.step', pointerBytes],
      ['models/b.step', pointerBytes],
      ['models/c.step', 'bytes the flush does not touch\n'],
    ]);
    const listings = [vi.spyOn(tree, 'readdir'), vi.spyOn(tree, 'readdirEntries')];
    const reads = [vi.spyOn(tree, 'readFile'), vi.spyOn(tree, 'readFileStream')];

    await materializer(tree)(liveCheckout, flushTarget, {
      before: flushBefore,
      purpose: 'fill',
      largeObjects: sourced,
    });

    expect(listings.flatMap((spy) => spy.mock.calls).filter(([path]) => path === '')).toEqual([]);
    const read = reads.flatMap((spy) => spy.mock.calls.map(([path]) => path));
    expect(read.filter((path) => path === 'models/a.step' || path === 'models/c.step')).toEqual([]);
    expect(await tree.readFile('models/a.step')).toStrictEqual(part);
    expect(await tree.readFile('models/b.step')).toStrictEqual(part);
  });

  it('should refuse a fill flush whose written path did not keep what it wrote', async () => {
    const flushBefore = new ImmutableRevisionTree([['models/b.step', 'old bytes\n']]);
    const flushTarget = new ImmutableRevisionTree([['models/b.step', 'filled bytes\n']]);
    const { tree, batch } = await storeProject(true);
    const applyBatch = NodeFsProvider.prototype.applyBatch.bind(tree);
    batch.mockImplementation(async (entries, batchOptions) => {
      const receipts = await applyBatch(entries, batchOptions);
      /* A writer replaces the published file before the flush verifies it. */
      if (entries.some((entry) => entry.op === 'delete')) {
        await fs.writeFile(join(tree.root, 'models', 'b.step'), 'someone else\n');
      }
      return receipts;
    });

    await expect(
      materializer(tree)(liveCheckout, flushTarget, { before: flushBefore, purpose: 'fill' }),
    ).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
  });

  it('should refuse a side map on a checkout that cannot land from a store', async () => {
    const { tree } = await storeProject(false);

    await expect(
      materializer(tree)(liveCheckout, target, { before, purpose: 'fill', largeObjects: sourced }),
    ).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
    expect(await tree.readFile('models/b.step', 'utf8')).toBe('old bytes\n');
  });

  it('should name the objects a store lost, before moving any file aside, so the fill brings their bytes', async () => {
    const { tree, store } = await storeProject(true);
    await fs.rm(join(store, pointer.oid.slice(0, 2), pointer.oid.slice(2, 4), pointer.oid));
    const replacedOnly = new ImmutableRevisionTree([['models/b.step', pointerBytes]]);

    const failure = await materializer(tree)(liveCheckout, replacedOnly, {
      before,
      purpose: 'fill',
      largeObjects: sourced,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnstoredLargeObjectsError);
    expect((failure as UnstoredLargeObjectsError).oids).toStrictEqual([pointer.oid]);
    expect(await tree.readFile('models/b.step', 'utf8')).toBe('old bytes\n');
    expect(litterIn(await filesOf(tree))).toEqual([]);
  });

  it('should write the bytes of a path whose target is not the mapped pointer', async () => {
    const { tree } = await storeProject(true);
    const plain = new ImmutableRevisionTree([['models/b.step', 'new bytes\n']]);

    await materializer(tree)(liveCheckout, plain, { before, purpose: 'fill', largeObjects: sourced });

    expect(await tree.readFile('models/b.step', 'utf8')).toBe('new bytes\n');
  });
});

describe('the entry closure of a tree write (D10)', () => {
  it('should tell the index every entry before any lands, and land the entry closure first', async () => {
    const context = await project({ 'old.scad': 'old\n' });
    const { pointer, bytes: pointerBytes } = lfsPointerFor(new TextEncoder().encode('solid part\n'));
    const manifest = serializeProjectManifest({
      $schema: projectManifestSchemaUrl,
      name: 'Bracket',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'zz/main.scad' } },
    });
    const target = new ImmutableRevisionTree([
      ...Array.from({ length: 600 }, (_, index): [string, string] => [
        `src/file-${String(index).padStart(4, '0')}.scad`,
        'cube(1);\n',
      ]),
      ['old.scad', 'old\n'],
      ['.gitattributes', '*.step filter=lfs diff=lfs merge=lfs -text\n'],
      ['models/part.step', pointerBytes],
      ['notes/pointer.txt', pointerBytes],
      ['tau.json', manifest],
      ['zz/main.scad', 'cube(2);\n'],
    ]);
    const events: string[] = [];
    let expected: readonly ExpectedEntry[] = [];
    const { checkout } = context;
    const watched: RevisionFileSystem = Object.assign(Object.create(checkout) as RevisionFileSystem, {
      expectEntries: (entries: readonly ExpectedEntry[]) => {
        expected = entries;
        events.push('expect');
      },
      endExpectation: () => {
        events.push('end');
      },
      applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
        events.push(...entries.flatMap((entry) => (entry.op === 'write' ? [entry.path] : [])));
        return checkout.applyBatch!(entries, batchOptions);
      },
    });
    const brackets: Array<
      Readonly<{ purpose: string; closure?: readonly string[]; manifest?: Uint8Array<ArrayBuffer> }> | undefined
    > = [];

    const outcomes: unknown[] = [];
    await materializer(watched, undefined, (_place, _paths, bracket) => {
      brackets.push(bracket);
      events.push('bracket');
      return (outcome) => {
        outcomes.push(outcome);
        events.push('release');
      };
    })(liveCheckout, target, { before: new ImmutableRevisionTree([['old.scad', 'old\n']]), purpose: 'tree' });

    /* The index learns the whole tree as the bracket opens, before any byte lands. */
    expect(events.slice(0, 2)).toEqual(['bracket', 'expect']);
    expect(outcomes).toEqual([{ failed: false }]);
    expect(expected).toHaveLength(606);
    expect(expected.find((entry) => entry.path === 'models/part.step')).toEqual({
      path: 'models/part.step',
      size: pointerBytes.byteLength,
      pending: { oid: pointer.oid, size: pointer.size },
      arriving: true,
    });
    /* A pointer the attributes do not track is a person's text, never a placeholder. */
    expect(expected.find((entry) => entry.path === 'notes/pointer.txt')).toEqual({
      path: 'notes/pointer.txt',
      size: pointerBytes.byteLength,
      arriving: true,
    });
    expect(expected.find((entry) => entry.path === 'old.scad')?.arriving).toBe(false);
    /* With the closure, the `tau.json` bytes it lands: the host names which manifest the first view is (STO-25). */
    expect(brackets).toStrictEqual([{ purpose: 'tree', closure: ['tau.json', 'zz/main.scad'], manifest }]);
    /* The closure lands in the first changeset, before the tree's other files. */
    expect(events.slice(2, 4).toSorted()).toEqual(['tau.json', 'zz/main.scad']);
    expect(events.slice(-2)).toEqual(['end', 'release']);
  });

  it('should name the files a tree write removes, so a read of one waits until it is gone (I7)', async () => {
    const context = await project({ 'gone.scad': 'old\n', 'tau.json': '{}\n' });
    const before = new ImmutableRevisionTree([
      ['gone.scad', 'old\n'],
      ['tau.json', '{}\n'],
    ]);
    const target = new ImmutableRevisionTree([
      ['main.scad', 'cube(1);\n'],
      ['tau.json', '{}\n'],
    ]);
    let removing: readonly string[] | undefined;
    const { checkout } = context;
    const watched: RevisionFileSystem = Object.assign(Object.create(checkout) as RevisionFileSystem, {
      expectEntries: (_entries: readonly ExpectedEntry[], options?: Readonly<{ removing?: readonly string[] }>) => {
        removing = options?.removing;
      },
      endExpectation: () => undefined,
    });
    await materializer(watched, undefined, () => () => undefined)(liveCheckout, target, { before, purpose: 'tree' });
    expect(removing).toEqual(['gone.scad']);
  });

  it('should land the closure first across created and replaced files', async () => {
    const context = await project({ 'tau.json': '{}\n', 'zz/main.scad': 'cube(0);\n' });
    const manifest = serializeProjectManifest({
      $schema: projectManifestSchemaUrl,
      name: 'Bracket',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'zz/main.scad' } },
    });
    const target = new ImmutableRevisionTree([
      ['a/new.scad', 'cube(1);\n'],
      ['tau.json', manifest],
      ['zz/main.scad', 'cube(2);\n'],
    ]);
    const published: string[] = [];
    const { checkout } = context;
    const watched: RevisionFileSystem = Object.assign(Object.create(checkout) as RevisionFileSystem, {
      applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
        published.push(
          ...entries.flatMap((entry) =>
            entry.op === 'write' && entry.create === true && !entry.path.includes('tau-staged')
              ? [entry.path]
              : entry.op === 'move' && !entry.to.includes('tau-backup')
                ? [entry.to]
                : [],
          ),
        );
        return checkout.applyBatch!(entries, batchOptions);
      },
    });

    await materializer(watched)(liveCheckout, target, {
      before: new ImmutableRevisionTree([
        ['tau.json', '{}\n'],
        ['zz/main.scad', 'cube(0);\n'],
      ]),
      purpose: 'tree',
    });

    /* Both closure files are replacements, yet they land before the created file. */
    expect(published.indexOf('a/new.scad')).toBeGreaterThan(published.indexOf('tau.json'));
    expect(published.indexOf('a/new.scad')).toBeGreaterThan(published.indexOf('zz/main.scad'));
  });

  /* I8: closure-first costs a cold open no changeset: every file is created, and the closure is first in the one changeset. */
  it('should land a cold open with its closure in one changeset, closure first', async () => {
    const context = await project({});
    const writes: string[][] = [];
    const { checkout } = context;
    const watched: RevisionFileSystem = Object.assign(Object.create(checkout) as RevisionFileSystem, {
      applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
        writes.push(entries.flatMap((entry) => (entry.op === 'write' ? [entry.path] : [])));
        return checkout.applyBatch!(entries, batchOptions);
      },
    });
    await materializer(watched)(
      liveCheckout,
      new ImmutableRevisionTree([
        ['a.scad', 'a\n'],
        ['tau.json', '{}\n'],
        ['b.scad', 'b\n'],
      ]),
      { before: new ImmutableRevisionTree([]), purpose: 'tree' },
    );
    expect(writes.filter((paths) => paths.length > 0)).toEqual([['tau.json', 'a.scad', 'b.scad']]);
  });

  it('should write the tree when the index cannot learn it, leaving its reading late', async () => {
    const context = await project({});
    const endExpectation = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const watched: RevisionFileSystem = Object.assign(Object.create(context.checkout) as RevisionFileSystem, {
      expectEntries: async () => {
        throw new Error('the index could not open');
      },
      endExpectation,
    });
    try {
      await materializer(watched)(liveCheckout, new ImmutableRevisionTree([['tau.json', '{}\n']]), {
        before: new ImmutableRevisionTree([]),
        purpose: 'tree',
      });
      await expect(context.tree.readFile('tau.json', 'utf8')).resolves.toBe('{}\n');
      expect(warn).toHaveBeenCalled();
      expect(endExpectation).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('should end the expectation even when the bracket throws, and tell a failed write as failed', async () => {
    const context = await project({});
    const target = new ImmutableRevisionTree([
      ['tau.json', '{}\n'],
      ['a.scad', 'a\n'],
    ]);
    const endExpectation = vi.fn();
    const watched: RevisionFileSystem = Object.assign(Object.create(context.checkout) as RevisionFileSystem, {
      expectEntries: vi.fn(),
      endExpectation,
    });
    await expect(
      materializer(watched, undefined, () => {
        throw new Error('host bracket failed');
      })(liveCheckout, target, { before: new ImmutableRevisionTree([]), purpose: 'tree' }),
    ).rejects.toThrow('host bracket failed');
    /*
     * A failed write's entries no longer answer, and what it still owed refuses (I7) until the checkout is whole
     * again: here it changed nothing, so the expectation ends at once after.
     */
    expect(endExpectation.mock.calls).toStrictEqual([[{ failed: true }], []]);

    /* An aborted write releases its bracket as failed, so its tree is never read as written. */
    const outcomes: unknown[] = [];
    const controller = new AbortController();
    const aborting: RevisionFileSystem = Object.assign(Object.create(watched) as RevisionFileSystem, {
      applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
        const receipts = await context.checkout.applyBatch!(entries, batchOptions);
        controller.abort(new Error('closed'));
        return receipts;
      },
    });
    await expect(
      materializer(aborting, undefined, () => (outcome) => {
        outcomes.push(outcome);
      })(liveCheckout, target, { before: new ImmutableRevisionTree([]), purpose: 'tree', signal: controller.signal }),
    ).rejects.toThrow();
    /* It tore the checkout and the recovery put the prior files back, so it left the checkout whole: neither is told failed (L5). */
    expect(outcomes).toEqual([{ failed: false }, { failed: false }]);
    /* The failed write's end, the rollback's own, and the end that lets the whole checkout answer again. */
    expect(endExpectation.mock.calls.slice(2)).toStrictEqual([[{ failed: true }], [{ failed: false }], []]);

    /* One that fails before any byte lands leaves the checkout whole: it is not told failed, and nothing recovers. */
    outcomes.length = 0;
    const refusing: RevisionFileSystem = Object.assign(Object.create(watched) as RevisionFileSystem, {
      applyBatch: async (): Promise<BatchReceipt[]> => {
        throw new Error('The disk went away.');
      },
      apply: async () => {
        throw new Error('The disk went away.');
      },
    });
    await expect(
      materializer(refusing, undefined, () => (outcome) => {
        outcomes.push(outcome);
      })(liveCheckout, new ImmutableRevisionTree([['b.scad', 'b\n']]), {
        before: await captureRevisionTree(context.checkout, {
          exclude: (path) => !tauRevisionPolicy.policy.classify(path).versioned,
        }),
        purpose: 'tree',
      }),
    ).rejects.toThrow('The disk went away.');
    expect(outcomes).toEqual([{ failed: false }]);
  });

  it('should tell nothing for a fill flush', async () => {
    const context = await project({});
    const expectEntries = vi.fn();
    const brackets: unknown[] = [];
    const watched: RevisionFileSystem = Object.assign(Object.create(context.checkout) as RevisionFileSystem, {
      expectEntries,
    });
    await materializer(watched, undefined, (_place, _paths, bracket) => {
      brackets.push(bracket);
    })(liveCheckout, new ImmutableRevisionTree([['a.scad', 'a\n']]), {
      before: new ImmutableRevisionTree([]),
      purpose: 'fill',
    });
    expect(expectEntries).not.toHaveBeenCalled();
    expect(brackets).toEqual([{ purpose: 'fill' }]);
  });
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
  const uuid = '0f9e8d7c-1234-4abc-8def-0123456789ab';
  const oldPattern = `.main.ts.0.${uuid}.tmp`;
  const staged = `.main.ts.tau-staged.${uuid}.tmp`;
  const backup = `.main.ts.tau-backup.${uuid}.tmp`;
  const lookalikes = {
    '.main.ts.0.not-a-uuid.tmp': 'a name of the person’s own\n',
    'main.ts.0.0f9e8d7c-1234-4abc-8def-0123456789ab.tmp': 'no leading dot, so not a sibling\n',
    '.notes.tmp': 'nor this\n',
  };

  it('should keep a person’s file that matches the old temporary-sibling pattern', async () => {
    const context = await project({ 'main.ts': 'original\n', [oldPattern]: 'person\n', ...lookalikes });

    await cut(context.open());

    /* Read, not listed: the node provider keeps its own in-flight temp spelling
     * out of listings, and that spelling is the old pattern. */
    expect(await context.tree.readFile(oldPattern, 'utf8')).toBe('person\n');
    expect(await filesOf(context.tree)).toEqual(expect.arrayContaining(Object.keys(lookalikes)));
  }, 30_000);

  it('should remove a staged sibling before capture', async () => {
    const clean = await project({ 'main.ts': 'original\n' });
    const littered = await project({ 'main.ts': 'original\n', [staged]: 'unpublished\n' });

    const litteredTreeId = await cut(littered.open());
    const cleanTreeId = await cut(clean.open());

    expect(await filesOf(littered.tree)).not.toContain(staged);
    expect(litteredTreeId).toBe(cleanTreeId);
  }, 30_000);

  it('should restore a backup sibling when the original is missing', async () => {
    const clean = await project({ 'main.ts': 'only copy\n' });
    const interrupted = await project({ [backup]: 'only copy\n' });

    const interruptedTreeId = await cut(interrupted.open());
    const cleanTreeId = await cut(clean.open());

    expect(await filesOf(interrupted.tree)).toContain('main.ts');
    expect(await filesOf(interrupted.tree)).not.toContain(backup);
    expect(await interrupted.tree.readFile('main.ts', 'utf8')).toBe('only copy\n');
    expect(interruptedTreeId).toBe(cleanTreeId);
  }, 30_000);

  it('should remove a backup sibling when the original is present', async () => {
    const clean = await project({ 'main.ts': 'published\n' });
    const interrupted = await project({ 'main.ts': 'published\n', [backup]: 'old bytes\n' });

    const interruptedTreeId = await cut(interrupted.open());
    const cleanTreeId = await cut(clean.open());

    expect(await filesOf(interrupted.tree)).not.toContain(backup);
    expect(await interrupted.tree.readFile('main.ts', 'utf8')).toBe('published\n');
    expect(interruptedTreeId).toBe(cleanTreeId);
  }, 30_000);
});

describe('a checkout stopped inside an apply', () => {
  it('should report the failure it could not roll back together with the one that stopped it', async () => {
    /* Every mutation from the eighth on fails, so the rollback the apply's
     * failure starts cannot run either — the one path no suite reached. */
    const stopped = await project(baseFiles, {
      statAge: 60_000,
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
    const options = trustedStats;
    /* A current project carries its attributes file, so the base save writes nothing but its revision (A4). */
    const files = { ...baseFiles, [generatedGitattributesPath]: generatedGitattributesContent(undefined) };
    /* The clean run says how many steps there are to stop at, and what the two
     * admissible outcomes hash to. */
    const clean = await project(files, options);
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
      const stopped = await project(files, { ...options, failMutation: (sequence) => sequence === step });
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

describe('a path that changes kind', () => {
  /** Apply `files` over the checkout, starting from what it holds now. */
  const applyFiles = async (checkout: RevisionFileSystem, files: Readonly<Record<string, string>>) =>
    materializer(checkout)(liveCheckout, new ImmutableRevisionTree(Object.entries(files)), {
      before: await captureRevisionTree(checkout, {
        exclude: (path) => !tauRevisionPolicy.policy.classify(path).versioned,
      }),
    });

  it('should replace a directory the tree no longer holds with a file of the same name', async () => {
    const context = await project({ 'foo/bar': 'nested\n' });

    const result = await applyFiles(context.checkout, { foo: 'flat\n' });

    expect(result.paths).toEqual(['foo', 'foo/bar']);
    expect(await filesOf(context.tree)).toEqual(['foo']);
    expect(await context.tree.readFile('foo', 'utf8')).toBe('flat\n');
  });

  it('should replace a file the tree no longer holds with a directory of the same name', async () => {
    const context = await project({ foo: 'flat\n' });

    await applyFiles(context.checkout, { 'foo/bar': 'nested\n' });

    expect(await filesOf(context.tree)).toEqual(['foo/bar']);
    expect(await context.tree.readFile('foo/bar', 'utf8')).toBe('nested\n');
  });

  it('should remove the directories its removals emptied and keep one that still holds an unversioned file', async () => {
    const context = await project({
      'gone/deep/a.ts': 'a\n',
      'kept/b.ts': 'b\n',
      'kept/node_modules/pkg.js': 'cache\n',
      'main.ts': 'main\n',
    });

    await applyFiles(context.checkout, { 'main.ts': 'main\n' });

    expect(await context.tree.exists('gone')).toBe(false);
    expect(await filesOf(context.tree)).toEqual(['kept/node_modules/pkg.js', 'main.ts']);
  });
});

describe('conversion inside recoverable materialization', () => {
  it('should retain a concurrent authored edit when preparation fails before applying any bytes', async () => {
    const context = await project({ 'tau.json': 'before' });
    const target = new ImmutableRevisionTree([['tau.json', 'incoming']]);
    await expect(
      materializer(context.checkout, async () => {
        await context.tree.writeFile('tau.json', 'incoming');
        throw new Error('identity conflict');
      })(liveCheckout, target),
    ).rejects.toThrow('identity conflict');
    expect(await context.tree.readFile('tau.json', 'utf8')).toBe('incoming');
  });

  it('should restore the previous files and withhold publication when conversion fails', async () => {
    const context = await project({ 'tau.json': 'before', 'part.ts': 'old' });
    let published = false;
    const target = new ImmutableRevisionTree([
      ['tau.json', 'imported'],
      ['part.ts', 'new'],
    ]);
    await expect(
      materializer(context.checkout, async () => {
        throw new Error('identity conflict');
      })(liveCheckout, target, {
        publish: async () => {
          published = true;
        },
      }),
    ).rejects.toThrow('identity conflict');
    expect(published).toBe(false);
    expect(await context.tree.readFile('tau.json', 'utf8')).toBe('before');
    expect(await context.tree.readFile('part.ts', 'utf8')).toBe('old');
  });

  it('should roll back its converted bytes when later publication fails', async () => {
    const context = await project({ 'tau.json': 'before' });
    const target = new ImmutableRevisionTree([['tau.json', 'imported']]);
    const converted = new ImmutableRevisionTree([['tau.json', 'converted']]);
    await expect(
      materializer(context.checkout, async () => {
        return { tree: converted };
      })(liveCheckout, target, {
        publish: async () => {
          throw new Error('publish refused');
        },
      }),
    ).rejects.toThrow('publish refused');
    expect(await context.tree.readFile('tau.json', 'utf8')).toBe('before');
    expect(new TextDecoder().decode(target.get('tau.json'))).toBe('imported');
  });
});

describe('a cold open written from its listing (STO-25)', () => {
  const manifest = serializeProjectManifest({
    $schema: projectManifestSchemaUrl,
    name: 'Aircraft',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });
  const sized = (seed: string, bytes: number): string => seed.repeat(Math.ceil(bytes / seed.length)).slice(0, bytes);
  const { bytes: pointerBytes } = lfsPointerFor(new TextEncoder().encode('solid part\n'));
  /* More deferred files than one changeset takes, so their bytes arrive in more than one read. */
  const sources = Array.from({ length: maximumChangesetEntries + 44 }, (_, index): [string, string] => [
    `src/file-${String(index).padStart(4, '0')}.ts`,
    sized(`export const value${String(index)} = ${String(index)};\n`, 1100),
  ]);
  const remoteFiles: ReadonlyArray<readonly [string, string | Uint8Array<ArrayBuffer>]> = [
    ['tau.json', manifest],
    ['main.ts', sized('export const main = 1;\n', 2048)],
    ['.gitattributes', '*.step filter=lfs diff=lfs merge=lfs -text\n'],
    ['models/part.step', pointerBytes],
    ['model/aircraft.usda', sized('def Xform "Part" {}\n', 8192)],
    ...sources,
  ];

  /**
   * An unborn `main` whose remote head holds {@link remoteFiles}, over a port
   * that lists each file's size as a cold open's head listing does.
   *
   * @param files - What the checkout holds before the open.
   * @param failRead - Paths a store read refuses.
   * @returns The project, its actors, and the ordered log of reads, the bracket and writes.
   */
  const opening = async (
    files: Readonly<Record<string, string>> = {},
    failRead?: (paths: readonly string[]) => boolean,
    afterBatch?: (written: readonly string[]) => Promise<void>,
  ) => {
    const context = await project(files);
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await context.port.setHead('main');
    const receipt = await context.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree(remoteFiles.map(([path, content]) => [path, content] as const)),
      provenance: { source: 'user', ...recordedBy('grace'), createdAt: Date.UTC(2026, 10, 18) },
      summary: { generated: 'Remote' },
    });
    const remote = revisionId(receipt.commitId);
    await context.port.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: remote });
    const remoteTree = (await context.port.readTree(remote, { largeObjects: 'local' }))!;
    const sizes = new Map(remoteTree.entries().map(({ path, content }) => [path, content.byteLength]));
    const events: string[] = [];
    /* Once a read fails, the store stays unreadable: a rollback cannot ask it either. */
    let unreadable = false;
    /* A slow object source: the model's bytes arrive only once the closure has landed, or after a bound. */
    const { promise: closureLanded, resolve: landClosure } = Promise.withResolvers<void>();
    const port: RevisionPort = {
      ...context.port,
      listTree: async (id) => {
        const listing = await context.port.listTree!(id);
        return listing?.map((file) => ({ ...file, size: sizes.get(file.path)! }));
      },
      readTree: async (id, readOptions) => {
        const paths = readOptions?.paths;
        events.push(`read ${paths === undefined ? '*' : paths.join(',')}`);
        if (paths !== undefined && (unreadable || failRead?.(paths) === true)) {
          unreadable = true;
          throw new Error('the store could not read that pack');
        }
        if (paths?.includes('model/aircraft.usda') === true && events.includes('bracket')) {
          await Promise.race([
            closureLanded,
            new Promise<void>((resolve) => {
              setTimeout(() => {
                events.push('model read unblocked by its bound');
                resolve();
              }, 2000);
            }),
          ]);
        }
        const tree = await context.port.readTree(id, readOptions);
        events.push(`read-done ${paths === undefined ? '*' : paths.join(',')}`);
        return tree;
      },
    };
    const { checkout } = context;
    const watched: RevisionFileSystem = Object.assign(Object.create(checkout) as RevisionFileSystem, {
      applyBatch: async (entries: readonly BatchEntry[], batchOptions?: BatchOptions): Promise<BatchReceipt[]> => {
        const receipts = await checkout.applyBatch!(entries, batchOptions);
        events.push(...entries.flatMap((entry) => (entry.op === 'write' ? [`write ${entry.path}`] : [])));
        if (entries.some((entry) => entry.op === 'write' && entry.path === 'tau.json')) {
          landClosure();
        }
        await afterBatch?.(entries.flatMap((entry) => (entry.op === 'write' ? [entry.path] : [])));
        return receipts;
      },
    });
    const brackets: Array<Parameters<NonNullable<Parameters<typeof createRevisionActors>[0]['onApplyingTree']>>[2]> =
      [];
    const outcomes: unknown[] = [];
    const actors = createRevisionActors({
      identity: testIdentity,
      port,
      projectId: 'project-1',
      clock: clockAt(clockReading),
      filesystem: async () => watched,
      onApplyingTree: (_place, _paths, bracket) => {
        brackets.push(bracket);
        events.push('bracket');
        return (outcome) => {
          outcomes.push(outcome);
          events.push('release');
        };
      },
    });
    /* Where in the log a path's bytes were first read. */
    const readOf = (path: string, kind = 'read'): number =>
      events.findIndex(
        (event) =>
          event.startsWith(`${kind} `) &&
          event
            .slice(kind.length + 1)
            .split(',')
            .includes(path),
      );
    return { ...context, actors, remote, remoteTree, events, brackets, outcomes, readOf };
  };

  it('should open the bracket and land the entry closure before the tree’s other bytes are read', async () => {
    const opened = await opening();
    await expect(run(opened.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).resolves.toMatchObject({
      checkoutId: 'live',
      revisionId: opened.remote,
    });
    const { events, readOf } = opened;
    /* No whole-tree read in the write: it begins from the listing. */
    expect(events.slice(0, events.indexOf('release'))).not.toContain('read *');
    const bracket = events.indexOf('bracket');
    expect(bracket).toBeGreaterThan(-1);
    expect(readOf('model/aircraft.usda')).toBeGreaterThan(bracket);
    /* The closure lands without waiting on the model's bytes, the manifest it lands named to the bracket. */
    expect(events).not.toContain('model read unblocked by its bound');
    const usda = readOf('model/aircraft.usda', 'read-done');
    expect(events.indexOf('write tau.json')).toBeLessThan(usda);
    expect(events.indexOf('write main.ts')).toBeLessThan(usda);
    expect(readOf('main.ts')).toBeLessThan(bracket);
    /* The manifest named is the one that landed, as the host prepared it. */
    expect(opened.brackets).toStrictEqual([
      {
        purpose: 'tree',
        closure: ['tau.json', 'main.ts'],
        manifest: new Uint8Array(await opened.tree.readFile('tau.json')),
      },
    ]);
    expect(opened.outcomes).toEqual([{ failed: false }]);
    /* A changeset's bytes at a time: the deferred files come in more than one bounded read. */
    const deferredReads = events.slice(bracket, events.indexOf('release')).filter((event) => event.startsWith('read '));
    expect(deferredReads.length).toBeGreaterThan(1);
    for (const read of deferredReads) {
      expect(read.slice(5).split(',').length).toBeLessThanOrEqual(maximumChangesetEntries);
    }
    /* Every other file landed as the revision holds it, the pointer as its placeholder. */
    const others = opened.remoteTree.entries().filter((entry) => entry.path !== 'tau.json');
    const landed = await Promise.all(others.map(async ({ path }) => new Uint8Array(await opened.tree.readFile(path))));
    expect(landed).toEqual(others.map(({ content }) => content));
    expect(await opened.port.readRef('main')).toBe(opened.remote);
  }, 30_000);

  it('should keep a file the checkout already holds as the revision does, by its blob id and unread', async () => {
    const usda = remoteFiles.find(([path]) => path === 'model/aircraft.usda')![1] as string;
    const opened = await opening({ 'model/aircraft.usda': usda });
    await run(opened.actors.sync.fastForward, { remote: 'tau', branch: 'main' });
    const written = opened.events.slice(0, opened.events.indexOf('release'));
    /* No whole-tree read: the checkout's own bytes are the blob the listing names. */
    expect(written).not.toContain('read *');
    const bracket = written.indexOf('bracket');
    /* One read of the model, the work check's; the write never asks the store for it again. */
    expect(
      written.filter((event) => event.startsWith('read ') && event.slice(5).split(',').includes('model/aircraft.usda')),
    ).toHaveLength(1);
    /* The work check reads the checkout's own paths before the write; the write itself never reads the model. */
    expect(
      written.slice(bracket).some((event) => event.startsWith('read ') && event.includes('model/aircraft.usda')),
    ).toBe(false);
    expect(opened.events).not.toContain('write model/aircraft.usda');
    expect(await opened.tree.readFile('model/aircraft.usda', 'utf8')).toBe(usda);
    expect(await opened.port.readRef('main')).toBe(opened.remote);
  }, 30_000);

  it('should fail the write and take back what it landed when a deferred read fails', async () => {
    const failing = sources.at(-1)![0];
    const opened = await opening({}, (paths) => paths.includes(failing));
    await expect(run(opened.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toThrow(
      'the store could not read that pack',
    );
    /* The closure and the first deferred batch had landed: the rollback took them back, leaving the checkout whole. */
    expect(opened.events).toContain('write tau.json');
    expect(opened.events).toContain(`write ${sources[0]![0]}`);
    /* The write and its rollback each released whole: the checkout was never left torn. */
    expect(opened.outcomes.length).toBeGreaterThan(0);
    expect(opened.outcomes).not.toContainEqual({ failed: true });
    const left = await Promise.all(remoteFiles.map(async ([path]) => opened.tree.exists(path)));
    expect(left.filter(Boolean)).toEqual([]);
    expect(await opened.port.readRef('main')).toBeUndefined();
  }, 30_000);

  it('should keep a same-size edit someone made to a landed file when the store cannot be read to roll back (I5)', async () => {
    const [edited, original] = sources[0]!;
    const foreign = original.replace('export', 'EXPORT');
    const failing = sources.at(-1)![0];
    const checkoutOf: { tree?: NodeFsProvider } = {};
    const opened = await opening(
      {},
      (paths) => paths.includes(failing),
      async (written) => {
        /* An editor's save between two changesets, which no fence holds back. */
        if (written.includes(edited)) {
          await checkoutOf.tree!.writeFile(edited, foreign);
        }
      },
    );
    checkoutOf.tree = opened.tree;
    await expect(run(opened.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toThrow(
      'the store could not read that pack',
    );
    expect(foreign).toHaveLength(original.length);
    expect(await opened.tree.readFile(edited, 'utf8')).toBe(foreign);
    /* Everything the write itself landed went back. */
    expect(await opened.tree.exists(sources[1]![0])).toBe(false);
    expect(await opened.tree.exists('tau.json')).toBe(false);
  }, 30_000);

  it('should read a tree that holds a symbolic link or a submodule whole, as before', async () => {
    const reads: string[] = [];
    const port: Pick<RevisionPort, 'diff' | 'listTree' | 'readTree'> = {
      listTree: async () => [{ path: 'main.ts', oid: 'a'.repeat(40), mode: '100644', size: 2048 }],
      diff: async () => [
        { path: 'link', kind: 'added' },
        { path: 'main.ts', kind: 'added' },
        { path: 'vendor/lib', kind: 'added' },
      ],
      readTree: async (_id, readOptions) => {
        reads.push(readOptions?.paths?.join(',') ?? '*');
        return new ImmutableRevisionTree([]);
      },
    };
    await expect(readDeferredRevisionTree(port, revisionId('b'.repeat(40)))).resolves.toBeUndefined();
    expect(reads).toEqual([]);
  });
});

describe('a deferred tree write (STO-25)', () => {
  const encoder = new TextEncoder();
  const manifest = serializeProjectManifest({
    $schema: projectManifestSchemaUrl,
    name: 'Deferred',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });
  /* More files than one changeset takes. */
  const files = new Map(
    Array.from({ length: maximumChangesetEntries + 44 }, (_, index): [string, Uint8Array<ArrayBuffer>] => [
      `src/file-${String(index).padStart(4, '0')}.ts`,
      encoder.encode(`export const value = ${String(index).padStart(1100, '0')};\n`),
    ]),
  );

  /**
   * A deferred tree over {@link files}, its manifest held.
   *
   * @param options - What a read does, given its paths and its call's number.
   * @returns The tree and the reads it answered.
   */
  const deferredOf = (
    options: Readonly<{
      onRead?: (paths: readonly string[], call: number) => void;
      answer?: (path: string, content: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    }> = {},
  ): Readonly<{ tree: DeferredRevisionTree; reads: string[][] }> => {
    const reads: string[][] = [];
    return {
      reads,
      tree: {
        held: new ImmutableRevisionTree([
          ['tau.json', manifest],
          ['main.ts', 'export const main = 1;\n'],
        ]),
        deferred: new Map(
          [...files].map(([path, content]) => [
            path,
            { mode: '100644', size: content.byteLength, oid: blobOid(new Uint8Array(content), 'sha1') },
          ]),
        ),
        read: async (paths) => {
          reads.push([...paths]);
          options.onRead?.(paths, reads.length);
          return new Map(
            paths.map((path) => [path, options.answer?.(path, files.get(path)!) ?? new Uint8Array(files.get(path)!)]),
          );
        },
      },
    };
  };

  const present = async (tree: NodeFsProvider, paths: Iterable<string>): Promise<string[]> => {
    const held = await Promise.all([...paths].map(async (path) => ((await tree.exists(path)) ? path : undefined)));
    return held.filter((path) => path !== undefined);
  };

  it('should stop between changesets on abort and take back what landed', async () => {
    const context = await project({});
    const controller = new AbortController();
    const { tree, reads } = deferredOf({
      onRead: (_paths, call) => {
        if (call === 2) {
          controller.abort(new Error('closed'));
        }
      },
    });
    await expect(
      materializer(context.checkout)(liveCheckout, async () => tree, { signal: controller.signal }),
    ).rejects.toThrow('closed');
    expect(reads.length).toBeGreaterThan(1);
    expect(await present(context.tree, ['tau.json', 'main.ts', ...files.keys()])).toEqual([]);
  });

  it('should fail and take back what landed when the store answers a file at another size', async () => {
    const context = await project({});
    const short = [...files.keys()].at(-1)!;
    const { tree } = deferredOf({
      answer: (path, content) => (path === short ? content.slice(1) : new Uint8Array(content)),
    });
    await expect(materializer(context.checkout)(liveCheckout, async () => tree)).rejects.toThrow(
      `The store could not read ${short} as its tree lists it.`,
    );
    expect(await present(context.tree, ['tau.json', 'main.ts', ...files.keys()])).toEqual([]);
  });

  it('should replace a deferred file the checkout holds at another size, or at the same size with other bytes', async () => {
    const [longer, shorter] = [...files.keys()];
    const sameSize = [...files.keys()][2]!;
    const sameSizeOther = new TextDecoder().decode(files.get(sameSize)).replace('export', 'EXPORT');
    const context = await project({
      [longer!]: 'old\n',
      [shorter!]: `${'x'.repeat(4000)}\n`,
      [sameSize]: sameSizeOther,
    });
    const { tree, reads } = deferredOf();
    await materializer(context.checkout)(liveCheckout, async () => tree);
    const landed = await Promise.all(
      [longer!, shorter!, sameSize].map(async (path) => new Uint8Array(await context.tree.readFile(path))),
    );
    expect(landed).toEqual([longer!, shorter!, sameSize].map((path) => files.get(path)));
    expect(reads.flat()).toEqual(expect.arrayContaining([longer, shorter, sameSize]));
  });

  it('should repair a torn deferred write by blob id, keeping a same-size edit made since', async () => {
    let refusing = false;
    let unreadable = false;
    const context = await project({}, { ...trustedStats, failMutation: () => refusing });
    const failing = [...files.keys()].at(-1)!;
    const { tree } = deferredOf({
      onRead: (paths) => {
        if (unreadable || paths.includes(failing)) {
          /* The store fails the write and stays unreadable, and the checkout refuses its rollback. */
          refusing = true;
          unreadable = true;
          throw new Error('the store could not read that pack');
        }
      },
    });
    const effects = applyEffects(context.checkout);
    await expect(effects.materializeTree(liveCheckout, async () => tree)).rejects.toThrow(
      'could not be restored completely',
    );
    refusing = false;
    const [edited] = [...files.keys()];
    const foreign = new TextDecoder().decode(files.get(edited!)).replace('export', 'EXPORT');
    await context.tree.writeFile(edited!, foreign);
    await expect(effects.repairTornCheckout(liveCheckout)).resolves.toBe(true);
    expect(await context.tree.readFile(edited!, 'utf8')).toBe(foreign);
    expect(await present(context.tree, ['tau.json', 'main.ts', ...[...files.keys()].slice(1)])).toEqual([]);
  });
});

describe('hashing a deferred file without holding the thread (STO-25)', () => {
  const sample = (length: number): Uint8Array<ArrayBuffer> =>
    new Uint8Array(new ArrayBuffer(length)).map((_, index) => index % 251);
  const gitBlobId = (algorithm: 'sha1' | 'sha256', content: Uint8Array<ArrayBuffer>): string =>
    createHash(algorithm)
      .update(`blob ${String(content.length)}\0`)
      .update(content)
      .digest('hex');

  it('should hash a large file with the JS hasher in runs, letting a queued read in, to git’s own id', async () => {
    const content = sample(24 * 1024 * 1024 + 7);
    let served = false;
    /* A read queued behind the hash: it runs at one of the hash's turns, not after the whole file. */
    setTimeout(() => {
      served = true;
    }, 0);
    const turns = hashingTurns.count;
    const hashing = createBlobHashing(false).blobOid(content, 'sha1');
    expect(served).toBe(false);
    const oid = await hashing;
    expect(served).toBe(true);
    expect(hashingTurns.count).toBeGreaterThan(turns);
    expect(oid).toBe(gitBlobId('sha1', content));
    const other = sample(70_001);
    await expect(createBlobHashing(false).blobOid(other, 'sha256')).resolves.toBe(gitBlobId('sha256', other));
  });

  it('should hash many small files on one budget, not a turn each', async () => {
    const hashing = createBlobHashing(false);
    const small = Array.from({ length: 6000 }, (_, index) => {
      const content = sample(2048);
      content[0] = index % 256;
      content[1] = Math.floor(index / 256);
      return content;
    });
    const turns = hashingTurns.count;
    const oids = [];
    for (const content of small) {
      // oxlint-disable-next-line no-await-in-loop -- the batch is paced as the write paces it.
      oids.push(await hashing.blobOid(content, 'sha1'));
    }
    expect(hashingTurns.count - turns).toBeLessThan(small.length / 20);
    expect(oids[5999]).toBe(gitBlobId('sha1', small[5999]!));
    /* A memoised id costs no turn at all. */
    const again = hashingTurns.count;
    await Promise.all(small.map(async (content) => hashing.blobOid(content, 'sha1')));
    expect(hashingTurns.count).toBe(again);
  });

  it('should take WebCrypto’s digest for a large file, memoised for the next cut, and the JS hasher if it refuses', async () => {
    const content = sample(2 * 1024 * 1024);
    const digest = vi.fn(async (algorithm: AlgorithmIdentifier, data: BufferSource) =>
      crypto.subtle.digest(algorithm, data),
    );
    const oid = await createBlobHashing({ digest }).blobOid(content, 'sha1');
    expect(oid).toBe(gitBlobId('sha1', content));
    expect(digest).toHaveBeenCalledTimes(1);
    /* The same bytes again, or a cut asking synchronously, hash nothing. */
    await expect(createBlobHashing({ digest }).blobOid(content, 'sha1')).resolves.toBe(oid);
    expect(blobOid(content, 'sha1')).toBe(oid);
    expect(digest).toHaveBeenCalledTimes(1);
    /* A digest WebCrypto refuses is answered all the same: a rollback never waits on it. */
    const refused = sample(1024 * 1024 + 3);
    const refusing = vi.fn(async (): Promise<ArrayBuffer> => {
      throw new DOMException('refused', 'OperationError');
    });
    await expect(createBlobHashing({ digest: refusing }).blobOid(refused, 'sha256')).resolves.toBe(
      gitBlobId('sha256', refused),
    );
    expect(refusing).toHaveBeenCalledTimes(1);
  });
});

describe('a store tree with a symbolic link or a submodule (STO-25)', () => {
  it('should be read whole, the listing’s files counted against every entry the store holds', async () => {
    const context = await project({});
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const gitdir = join(roots.at(-1)!, '.git');
    const git = { fs: { promises: fs }, gitdir };
    const encoder = new TextEncoder();
    const main = encoder.encode('export const main = 1;\n'.repeat(100));
    const mainOid = await writeBlob({ ...git, blob: main });
    const linkOid = await writeBlob({ ...git, blob: encoder.encode('main.ts') });
    const file = { mode: '100644', path: 'main.ts', oid: mainOid, type: 'blob' } as const;
    const signature = { name: 'Tau', email: 'noreply@tau.new', timestamp: 1_790_000_000, timezoneOffset: 0 };
    const commitOf = async (tree: string): Promise<string> =>
      writeCommit({ ...git, commit: { message: 'tree\n', tree, parent: [], author: signature, committer: signature } });
    const plain = await commitOf(await writeTree({ ...git, tree: [file] }));
    const mixed = await commitOf(
      await writeTree({
        ...git,
        tree: [
          file,
          { mode: '120000', path: 'link', oid: linkOid, type: 'blob' },
          { mode: '160000', path: 'vendor', oid: 'c'.repeat(40), type: 'commit' },
        ],
      }),
    );
    /* Sizes as a cold open's head listing gives them; the store's own diff names every entry. */
    const port: RevisionPort = {
      ...context.port,
      listTree: async (id) => {
        const listing = await context.port.listTree!(id);
        return listing?.map((entry) => ({ ...entry, size: main.byteLength }));
      },
    };
    const listed = await port.listTree!(revisionId(mixed));
    expect(listed?.map(({ path }) => path)).toEqual(['main.ts']);
    await expect(readDeferredRevisionTree(port, revisionId(plain))).resolves.toBeDefined();
    await expect(readDeferredRevisionTree(port, revisionId(mixed))).resolves.toBeUndefined();
  });
});
