/**
 * A cut driven by the checkout's Project Index (W6.4, S10): it starts from the
 * last capture and reads only what the index changed and removed since, and
 * walks everything whenever the index answers `rescan` — never reading an
 * empty answer as "nothing changed".
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';

import { createMemoryProvider } from '@taucad/filesystem/backend';
import type { IndexChanges } from '@taucad/filesystem';

import { revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { RevisionPort } from '#revision-port.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionActors, RevisionFileSystem } from '#revision-effects.js';

const author = { name: 'Tau', email: 'noreply@tau.new' };

/** A stand-in index over the fixture's own writes: its generation, epoch and removal record. */
type Feed = {
  epoch: string;
  generation: number;
  floor: number;
  readonly changed: Map<string, number>;
  readonly removed: Map<string, number>;
};

const changesOf = (feed: Feed, since: number, epoch: string | undefined): IndexChanges => {
  const { generation } = feed;
  if (epoch !== feed.epoch || since < feed.floor || since > generation) {
    return { generation, epoch: feed.epoch, entries: [], removed: [], rescan: true };
  }
  return {
    generation,
    epoch: feed.epoch,
    entries: [...feed.changed]
      .filter(([, at]) => at > since)
      .map(([path, at]) => ({ path, kind: 'file', size: 0, mtimeMs: 0, generation: at })),
    removed: [...feed.removed]
      .filter(([, at]) => at > since)
      .map(([path, at]) => ({ path, kind: 'file', generation: at })),
  };
};

const fixture = async (files: Readonly<Record<string, string>>) => {
  const filesystem = await createMemoryProvider();
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
    await filesystem.writeFile(path, content);
  }
  const feed: Feed = { epoch: 'lineage-1', generation: 1, floor: 0, changed: new Map(), removed: new Map() };
  const reads: string[] = [];
  const asked: Array<readonly [number, string | undefined]> = [];
  const indexed = Object.assign(Object.create(filesystem) as RevisionFileSystem, {
    readFile: async (path: string, ...rest: readonly unknown[]): Promise<unknown> => {
      reads.push(path);
      // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the provider's own overloads.
      return (filesystem.readFile as (...arguments_: any[]) => Promise<unknown>)(path, ...rest);
    },
    changedSince: async (since: number, options?: { epoch?: string }): Promise<IndexChanges> => {
      asked.push([since, options?.epoch]);
      return changesOf(feed, since, options?.epoch);
    },
  });
  const port: RevisionPort = createIsomorphicGitRevisionPort({ filesystem });
  await port.init({ author });
  const actors = createRevisionActors({ port, projectId: 'project-1', filesystem: async () => indexed });
  /* The same store captured by walking: what every incremental cut must hash to. */
  const walking = createRevisionActors({
    port,
    projectId: 'project-1',
    filesystem: async () => Object.create(filesystem) as RevisionFileSystem,
  });
  const write = async (path: string, content: string): Promise<void> => {
    await filesystem.writeFile(path, content);
    feed.generation += 1;
    feed.changed.set(path, feed.generation);
  };
  const remove = async (path: string): Promise<void> => {
    await filesystem.unlink(path);
    feed.generation += 1;
    feed.changed.delete(path);
    feed.removed.set(path, feed.generation);
  };
  const rename = async (from: string, to: string): Promise<void> => {
    await filesystem.rename(from, to);
    feed.generation += 1;
    feed.changed.delete(from);
    feed.removed.set(from, feed.generation);
    feed.changed.set(to, feed.generation);
  };
  return { filesystem, port, actors, walking, feed, reads, asked, write, remove, rename };
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

const cut = async (actors: RevisionActors): Promise<Cut> =>
  run<Cut>(actors.checkout.cut, { checkoutId: 'live', trigger: 'save' });

const mint = async (counted: Awaited<ReturnType<typeof fixture>>): Promise<void> => {
  const taken = await cut(counted.actors);
  const { revisionId: written } = await run<{ revisionId: string }>(counted.actors.checkout.writeRevision, {
    checkoutId: 'live',
    cutId: taken.cutId,
    treeId: taken.treeId,
    parents: [],
    trigger: 'save',
    leaseIds: [],
  });
  await counted.port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(written) });
};

const walkedTreeId = async (actors: RevisionActors): Promise<string> => {
  const { treeId } = await run<{ treeId: string }>(actors.checkout.captureTree, { checkoutId: 'live' });
  return treeId;
};

const files = (count: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `dir${String(index % 5)}/f${String(index)}.txt`,
      `file ${String(index)}\n`,
    ]),
  );

describe('a cut driven by the index (S10)', () => {
  it('should read only the file the index changed, and hash what a walk hashes', async () => {
    const counted = await fixture(files(50));
    await mint(counted);
    await counted.write('dir2/f7.txt', 'edited\n');

    counted.reads.length = 0;
    const { treeId } = await cut(counted.actors);

    expect(counted.reads).toEqual(['dir2/f7.txt']);
    expect(counted.asked.at(-1)).toEqual([1, 'lineage-1']);
    expect(treeId).toBe(await walkedTreeId(counted.walking));
  });

  it('should take a delete alone from the removal record, reading nothing', async () => {
    const counted = await fixture(files(50));
    await mint(counted);
    await counted.remove('dir3/f8.txt');

    counted.reads.length = 0;
    const { treeId } = await cut(counted.actors);

    expect(counted.reads).toEqual([]);
    expect(treeId).toBe(await walkedTreeId(counted.walking));
  });

  it('should take a rename as its source removed and its target read', async () => {
    const counted = await fixture(files(50));
    await mint(counted);
    await counted.rename('dir1/f6.txt', 'moved/f6.txt');

    counted.reads.length = 0;
    const { treeId } = await cut(counted.actors);

    expect(counted.reads).toEqual(['moved/f6.txt']);
    expect(treeId).toBe(await walkedTreeId(counted.walking));
  });

  it('should walk everything when a reloaded index can no longer answer from its cursor', async () => {
    const counted = await fixture(files(20));
    await mint(counted);
    await counted.write('dir0/f5.txt', 'edited\n');
    /* The reload issued generations again from the snapshot's: the cursor is past it. */
    counted.feed.generation = 0;
    counted.feed.changed.clear();

    counted.reads.length = 0;
    const { treeId } = await cut(counted.actors);

    expect(counted.reads).toContain('dir0/f5.txt');
    expect(counted.reads.length).toBeGreaterThan(1);
    expect(treeId).toBe(await walkedTreeId(counted.walking));
  });

  it('should walk everything when the index answers for another epoch, never reading its empty lists as no change', async () => {
    const counted = await fixture(files(20));
    await mint(counted);
    await counted.filesystem.writeFile('dir4/f9.txt', 'written while the index was elsewhere\n');
    counted.feed.epoch = 'lineage-2';

    counted.reads.length = 0;
    const { treeId } = await cut(counted.actors);

    expect(counted.reads).toContain('dir4/f9.txt');
    expect(treeId).toBe(await walkedTreeId(counted.walking));
    /* The walk took the new lineage's cursor, so the next cut is incremental again. */
    await counted.write('dir1/f1.txt', 'edited\n');
    counted.reads.length = 0;
    await cut(counted.actors);
    expect(counted.reads).toEqual(['dir1/f1.txt']);
  });
});
