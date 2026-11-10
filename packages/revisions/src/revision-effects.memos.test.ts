/**
 * The per-checkout memos a cut and a restore plan read through (W4: E1, E3, E5).
 *
 * Counted at the seams the costs live behind: the checkout's `readFile` for a
 * capture, and the port's `readTree` for the head a capture inherits modes from
 * and the tree a restore plan reads.
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';

import { createMemoryProvider } from '@taucad/filesystem/backend';

import { revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { RevisionPort } from '#revision-port.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionActors, RevisionFileSystem } from '#revision-effects.js';
import { generatedGitattributesContent, generatedGitattributesPath } from '#workspace-config.js';

type Counted = Readonly<{
  filesystem: Awaited<ReturnType<typeof createMemoryProvider>>;
  port: RevisionPort;
  actors: RevisionActors;
  reads: string[];
  treeReads: string[];
  /** The paths each tree read asked for; `undefined` for a whole tree. */
  treePaths: Array<readonly string[] | undefined>;
  /** Holds the next read of `path`, once it has its bytes, until the returned release is called. */
  hold: (path: string) => Readonly<{ reached: Promise<void>; release: () => void }>;
}>;

const author = { name: 'Tau', email: 'noreply@tau.new' };

const fixture = async (
  files: Readonly<Record<string, string>>,
  completeChanges: boolean,
  adapt: (port: RevisionPort) => RevisionPort = (port) => port,
): Promise<Counted> => {
  const filesystem = await createMemoryProvider();
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
    await filesystem.writeFile(path, content);
  }
  const reads: string[] = [];
  const treeReads: string[] = [];
  const treePaths: Array<readonly string[] | undefined> = [];
  const holds = new Map<string, Readonly<{ reached: () => void; released: Promise<void> }>>();
  const counted = Object.assign(Object.create(filesystem) as RevisionFileSystem, {
    readFile: async (path: string, ...rest: readonly unknown[]): Promise<unknown> => {
      reads.push(path);
      // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the provider's own overloads.
      const content = await (filesystem.readFile as (...arguments_: any[]) => Promise<unknown>)(path, ...rest);
      /* Held after the read, so the capture holds these bytes while it waits. */
      const held = holds.get(path);
      if (held !== undefined) {
        holds.delete(path);
        held.reached();
        await held.released;
      }
      return content;
    },
  });
  const inner = createIsomorphicGitRevisionPort({ filesystem });
  const port: RevisionPort = {
    ...adapt(inner),
    readTree: async (id, options) => {
      treeReads.push(String(id));
      treePaths.push(options?.paths);
      return inner.readTree(id, options);
    },
  };
  await port.init({ author });
  /* A current project carries both setup files; opening writes no attributes file (A4). */
  await filesystem.writeFile(generatedGitattributesPath, generatedGitattributesContent(undefined));
  const actors = createRevisionActors({
    port,
    projectId: 'project-1',
    filesystem: async () => counted,
    completeChanges,
  });
  const hold = (path: string): Readonly<{ reached: Promise<void>; release: () => void }> => {
    const reached = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    holds.set(path, { reached: reached.resolve, released: released.promise });
    return { reached: reached.promise, release: released.resolve };
  };
  return { filesystem, port, actors, reads, treeReads, treePaths, hold };
};

const asError = (failure: unknown): Error => (failure instanceof Error ? failure : new Error(String(failure)));

const run = async <Output>(logic: unknown, input: unknown): Promise<Output> =>
  new Promise<Output>((resolve, reject) => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the actor logic is the machine's own; this drives it directly.
    const running = createActor(logic as Parameters<typeof createActor>[0], { input });
    running.subscribe({
      next: (snapshot) => {
        if (snapshot.status === 'done') {
          // oxlint-disable-next-line typescript/consistent-type-assertions -- the output type is the caller's contract.
          resolve(snapshot.output as Output);
        }
        if (snapshot.status === 'error') {
          reject(asError(snapshot.error));
        }
      },
    });
    running.start();
  });

type Cut = Readonly<{ treeId: string; cutId: string }>;

const cut = async (actors: RevisionActors, changedPaths?: readonly string[]): Promise<Cut> =>
  run<Cut>(actors.checkout.cut, {
    checkoutId: 'live',
    trigger: 'save',
    ...(changedPaths === undefined ? {} : { changedPaths }),
  });

/* Cut, write and publish one revision on `main`, as the checkout's mint does. */
const mint = async (fixture: Counted, parent?: string, changedPaths?: readonly string[]): Promise<string> => {
  const taken = await cut(fixture.actors, changedPaths);
  const { revisionId: written } = await run<{ revisionId: string }>(fixture.actors.checkout.writeRevision, {
    checkoutId: 'live',
    cutId: taken.cutId,
    treeId: taken.treeId,
    parents: parent === undefined ? [] : [parent],
    trigger: 'save',
    leaseIds: [],
  });
  await fixture.port.updateRef({
    name: 'main',
    expectedHead: parent === undefined ? undefined : revisionId(parent),
    head: revisionId(written),
  });
  return written;
};

const walkTreeId = async (actors: RevisionActors): Promise<string> => {
  const { treeId } = await run<{ treeId: string }>(actors.checkout.captureTree, { checkoutId: 'live' });
  return treeId;
};

const files = (count: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `dir${String(index % 10)}/f${String(index)}.txt`,
      `file ${String(index)}\n`,
    ]),
  );

describe('a cut on a complete change feed (E1)', () => {
  it('should read only the changed file at 200 files, and hash the same tree a whole capture does', async () => {
    const counted = await fixture(files(200), true);
    await mint(counted);
    await counted.filesystem.writeFile('dir7/f7.txt', 'edited\n');

    counted.reads.length = 0;
    const second = await cut(counted.actors, ['dir7/f7.txt']);

    expect(counted.reads).toEqual(['dir7/f7.txt']);
    expect(second.treeId).toBe(await walkTreeId(counted.actors));
  });

  it('should take a running comparison of the same write generation instead of reading its files again (FX1 M)', async () => {
    const counted = await fixture(files(200), true);
    await mint(counted);
    await counted.filesystem.writeFile('dir7/f7.txt', 'edited\n');

    counted.reads.length = 0;
    /* A write turns the clean checkout to a comparison, and a save arrives while it runs. */
    const held = counted.hold('dir7/f7.txt');
    const comparing = run<{ treeId: string }>(counted.actors.checkout.captureTree, {
      checkoutId: 'live',
      changedPaths: ['dir7/f7.txt'],
      generation: 1,
    });
    await held.reached;
    const taken = run<Cut>(counted.actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
      changedPaths: ['dir7/f7.txt'],
      generation: 1,
    });
    held.release();
    const [compared, second] = await Promise.all([comparing, taken]);

    expect(counted.reads).toEqual(['dir7/f7.txt']);
    expect(second.treeId).toBe(compared.treeId);
    expect(second.treeId).toBe(await walkTreeId(counted.actors));
  });

  it('should read for itself when a write landed after the running comparison began', async () => {
    const counted = await fixture(files(20), true);
    await mint(counted);
    await counted.filesystem.writeFile('dir7/f7.txt', 'edited\n');

    const held = counted.hold('dir7/f7.txt');
    const comparing = run(counted.actors.checkout.captureTree, {
      checkoutId: 'live',
      changedPaths: ['dir7/f7.txt'],
      generation: 1,
    });
    await held.reached;
    await counted.filesystem.writeFile('dir7/f7.txt', 'edited again\n');
    const taken = run<Cut>(counted.actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
      changedPaths: ['dir7/f7.txt'],
      generation: 2,
    });
    held.release();
    const [, second] = await Promise.all([comparing, taken]);

    expect(second.treeId).toBe(await walkTreeId(counted.actors));
  });

  it('should read every file when the host does not promise a complete feed', async () => {
    const counted = await fixture(files(20), false);
    await mint(counted);
    await counted.filesystem.writeFile('dir7/f7.txt', 'edited\n');

    counted.reads.length = 0;
    await cut(counted.actors, ['dir7/f7.txt']);

    /* Every file, the two the store generated at init among them. */
    expect(counted.reads.length).toBeGreaterThanOrEqual(20);
  });

  it('should keep the newer observation when an older capture finishes after it', async () => {
    const counted = await fixture({ 'a.txt': 'a\n', 'x.txt': 'old\n', 'z.txt': 'z\n' }, true);
    await mint(counted);

    /* A whole capture that has read `x.txt` and not yet finished… */
    const held = counted.hold('x.txt');
    const slow = walkTreeId(counted.actors);
    await held.reached;
    /* …while `x.txt` is rewritten and a cut records it. */
    await counted.filesystem.writeFile('x.txt', 'new\n');
    await cut(counted.actors, ['x.txt']);
    held.release();
    await slow;

    /* Nothing written since that cut: the next one starts from what it saw. */
    const next = await cut(counted.actors, []);

    expect(next.treeId).toBe(await walkTreeId(counted.actors));
  });
});

describe('a comparison a newer write made stale', () => {
  /* `comparing` re-enters on every write, stopping its capture: the stale walk stops with it, rather than pile up. */
  it('should stop reading files once its actor is stopped, and leave the next cut to read for itself', async () => {
    const all = files(40);
    const counted = await fixture(all, false);
    await mint(counted);
    for (const path of Object.keys(all)) {
      // oxlint-disable-next-line no-await-in-loop -- fixture edits, written in order.
      await counted.filesystem.writeFile(path, `edited ${path}\n`);
    }

    counted.reads.length = 0;
    const held = counted.hold('dir0/f0.txt');
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the actor logic is the machine's own; this drives it directly.
    const comparing = createActor(counted.actors.checkout.captureTree as Parameters<typeof createActor>[0], {
      input: { checkoutId: 'live', generation: 1 },
    });
    const outcome = Promise.withResolvers<string>();
    comparing.subscribe({
      next: ({ status }: Readonly<{ status: string }>) => {
        if (status !== 'active') {
          outcome.resolve(status);
        }
      },
    });
    comparing.start();
    await held.reached;
    comparing.stop();
    held.release();
    /* Let whatever the walk had already asked for settle. */
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    const readWhileStopping = counted.reads.length;

    expect(readWhileStopping).toBeLessThan(Object.keys(all).length);
    expect(await Promise.race([outcome.promise, Promise.resolve('stopped quietly')])).not.toBe('done');

    const taken = await run<Cut>(counted.actors.checkout.cut, { checkoutId: 'live', trigger: 'save', generation: 1 });
    expect(taken.treeId).toBe(await walkTreeId(counted.actors));
  });
});

describe('the head a capture inherits modes from', () => {
  it('should read the head’s tree once per head, not once per capture', async () => {
    const counted = await fixture(files(20), false);
    await mint(counted);

    counted.treeReads.length = 0;
    await walkTreeId(counted.actors);
    await walkTreeId(counted.actors);
    await cut(counted.actors);

    expect(counted.treeReads).toEqual([]);
  });
});

describe('the restore plan (E5)', () => {
  it('should read no tree: an oid diff from the head names what it removes (D10)', async () => {
    const counted = await fixture(files(20), true);
    const first = await mint(counted);
    await counted.filesystem.writeFile('added.txt', 'later\n');
    await mint(counted, first, ['added.txt']);

    counted.treeReads.length = 0;
    const plan = await run<{ revisionNumber: number | undefined; removedPathCount: number; dirty: boolean }>(
      counted.actors.restore.computePlan,
      { checkoutId: 'live', target: first },
    );

    expect(counted.treeReads).toEqual([]);
    expect(plan).toMatchObject({ revisionNumber: 1, removedPathCount: 1, dirty: false });
  });

  it('should write a restore by oid diff: only the paths that differ are read from the store (D10, S11)', async () => {
    const counted = await fixture(files(20), true);
    const first = await mint(counted);
    await counted.filesystem.writeFile('dir0/f0.txt', 'changed\n');
    await counted.filesystem.writeFile('added.txt', 'later\n');
    await mint(counted, first, ['dir0/f0.txt', 'added.txt']);

    const plan = await run<{ planId: string }>(counted.actors.restore.computePlan, {
      checkoutId: 'live',
      target: first,
    });
    counted.treeReads.length = 0;
    counted.treePaths.length = 0;
    await run(counted.actors.restore.applyPlan, { checkoutId: 'live', planId: plan.planId });

    expect(counted.treePaths).toEqual([['dir0/f0.txt']]);
    expect(await counted.filesystem.readFile('dir0/f0.txt', 'utf8')).toBe('file 0\n');
    expect(await counted.filesystem.exists('added.txt')).toBe(false);
    expect(await counted.filesystem.readFile('dir9/f19.txt', 'utf8')).toBe('file 19\n');
  });
});

/*
 * A complete feed names the files that changed, and an ignore source that is
 * not a file in the checkout (the store's `info/exclude`, its
 * `core.ignoreCase`, or a bare port's listing) names none: a cut from the
 * feed after one changed walks, so what it no longer ignores is taken.
 */
describe('a complete feed after an ignore source outside the checkout changed', () => {
  it("should walk, and take a file the store's info/exclude no longer ignores", async () => {
    const at = await fixture({ 'main.ts': 'export {};\n', 'secret.txt': 'kept out\n' }, true);
    await at.filesystem.writeFile('.git/info/exclude', 'secret.txt\n');
    const first = await cut(at.actors);
    await mint(at);
    await at.filesystem.writeFile('.git/info/exclude', '');

    const taken = await cut(at.actors, []);

    expect(taken.treeId).not.toBe(first.treeId);
    expect(taken.treeId).toBe(await walkTreeId(at.actors));
  });

  it('should walk, and take a file a bare port no longer lists as ignored', async () => {
    let ignored: readonly string[] = ['secret.txt'];
    const at = await fixture({ 'main.ts': 'export {};\n', 'secret.txt': 'kept out\n' }, true, (port) => {
      const { ignoreContext: _context, ...bare } = port;
      return { ...bare, ignoredPaths: async () => ignored };
    });
    const first = await cut(at.actors);
    await mint(at);
    ignored = [];

    const taken = await cut(at.actors, []);

    expect(taken.treeId).not.toBe(first.treeId);
    expect(taken.treeId).toBe(await walkTreeId(at.actors));
  });
});
