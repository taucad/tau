/**
 * A cut driven by the checkout's Project Index (W6.4, S10), against real
 * indexes: it runs the D5 compare, starts from the last capture and reads only
 * what the compare and the index changed and removed since, what was racy at
 * the last capture (EQ7) and what changed mode; and it walks everything
 * whenever the index cannot answer (`rescan`, a failure, no cursor, other
 * ignored paths, modes it cannot tell). Every cut must hash to what a walk
 * hashes.
 */
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createActor } from 'xstate';

import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { ContentFacts, FileSystemProvider } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { RevisionPort } from '#revision-port.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionActors, RevisionFileSystem } from '#revision-effects.js';

const author = { name: 'Tau', email: 'noreply@tau.new' };

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- torn down in the reverse of the order they were made.
    await cleanup();
  }
});

/** Older than the racy window of any capture in the test, so only what a test writes is fresh. */
const settledTime = new Date(Date.now() - 60_000);

const files = (count: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `dir${String(index % 5)}/f${String(index)}.txt`,
      `file ${String(index)}\n`,
    ]),
  );

type Overrides = Partial<Pick<RevisionFileSystem, 'changedSince' | 'compareIndex' | 'facts'>>;

/* One root on disk (or in memory) behind a real WorkspaceFileService, so the rooted view carries its Project Index. */
const fixture = async (
  initial: Readonly<Record<string, string>>,
  options?: Readonly<{
    backend?: 'node' | 'memory';
    /* `port`: the checkout's own ignore rules, as the port reads them, rather than a listing the test sets;
     * `bare`: a listing from a port that reports no ignore context, so it is listed whole at every capture;
     * `failing`: the port's own rules, but a question about named paths fails. */
    ignoreRules?: 'listing' | 'bare' | 'port' | 'failing';
  }>,
) => {
  const backend = options?.backend ?? 'node';
  const root = await mkdtemp(join(tmpdir(), 'tau-index-capture-'));
  cleanups.push(async () => rm(root, { recursive: true, force: true }));
  if (backend === 'node') {
    for (const [path, content] of Object.entries(initial)) {
      // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
      await mkdir(dirname(join(root, path)), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
      await writeFile(join(root, path), content);
      // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
      await utimes(join(root, path), settledTime, settledTime);
    }
  }
  const open = (): RevisionFileSystem => {
    const mountTable = new MountTable();
    const provider: FileSystemProvider = backend === 'node' ? new NodeFsProvider(root) : memory;
    mountTable.mount('/', provider, { class: 'authored', backend, storageRootKey: `${backend}:${root}` });
    const service = new WorkspaceFileService({
      providerRegistry: new ProviderRegistry(),
      mountTable,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
    });
    cleanups.push(() => {
      service.dispose();
    });
    return service.createRootedFileSystem('/');
  };
  const memory = new MemoryProvider();
  let rooted = open();
  if (backend === 'memory') {
    for (const [path, content] of Object.entries(initial)) {
      // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
      await rooted.writeFile(path, content);
    }
  }
  const reads: string[] = [];
  /* Where each capture asked the index from: a walk probes it with a generation past any it issued. */
  const asked: number[] = [];
  const overrides: Overrides = {};
  /* Every capture read, counted; and the index's answers, replaceable per test. */
  const counted = (): RevisionFileSystem =>
    Object.assign(Object.create(rooted) as RevisionFileSystem, {
      readFile: (async (path: string, ...rest: readonly unknown[]) => {
        reads.push(path);
        // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the view's own overloads.
        return (rooted.readFile as (...arguments_: any[]) => Promise<unknown>)(path, ...rest);
      }) as RevisionFileSystem['readFile'],
      readFileStream: ((path: string, ...rest: readonly unknown[]) => {
        reads.push(path);
        // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the view's own overloads.
        return (rooted.readFileStream as (...arguments_: any[]) => unknown)(path, ...rest);
      }) as RevisionFileSystem['readFileStream'],
      ...overrides,
      changedSince: (async (since, changeOptions) => {
        asked.push(since);
        return (overrides.changedSince ?? rooted.changedSince!)(since, changeOptions);
      }) satisfies NonNullable<RevisionFileSystem['changedSince']>,
    });
  let ignored: readonly string[] = [];
  /* Every directory the port lists: its ignore rules' walk. */
  const listed: string[] = [];
  const portFiles = Object.assign(Object.create(rooted) as RevisionFileSystem, {
    readdir: (async (path: string, ...rest: readonly unknown[]) => {
      listed.push(path);
      // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the view's own overloads.
      return (rooted.readdir as (...arguments_: any[]) => Promise<unknown>)(path, ...rest);
    }) as RevisionFileSystem['readdir'],
  });
  const base: RevisionPort = createIsomorphicGitRevisionPort({ filesystem: portFiles });
  await base.init({ author });
  if (backend === 'node') {
    /* What init wrote is as settled as the fixture's own files, and the index is told by its compare. */
    for (const path of ['.gitattributes', '.gitignore']) {
      // oxlint-disable-next-line no-await-in-loop -- two files.
      await utimes(join(root, path), settledTime, settledTime).catch(() => undefined);
    }
    await rooted.compareIndex?.();
  }
  const { ignoreContext: _context, ...bare } = base;
  const listing: RevisionPort = {
    ...bare,
    ignoredPaths: async () => ignored,
  };
  const failing: RevisionPort = {
    ...base,
    ignoredPaths: async (root, paths) => {
      if (paths !== undefined) {
        throw new Error('directory entry not superset of prefix');
      }
      return base.ignoredPaths?.(root);
    },
  };
  const port: RevisionPort =
    options?.ignoreRules === 'port'
      ? base
      : options?.ignoreRules === 'failing'
        ? failing
        : options?.ignoreRules === 'bare'
          ? listing
          : {
              ...listing,
              /* The test's listing is the whole of its rules: named paths are answered from it. */
              ignoredPaths: async (_root, paths) =>
                paths === undefined
                  ? ignored
                  : ignored.filter((entry) =>
                      paths.some((path) => path === entry || (entry.endsWith('/') && path.startsWith(entry))),
                    ),
              ignoreContext: async () => JSON.stringify(ignored),
            };
  /* Memory stamps its files now and cannot be told otherwise: the captures read a clock a minute on,
   * so only what a test writes after a capture is racy at the next. */
  const clock =
    backend === 'memory'
      ? {
          clock: {
            now: () => Date.now() + 60_000,
            setTimeout: (callback: (...arguments_: unknown[]) => void, timerDelay: number): unknown =>
              globalThis.setTimeout(callback, timerDelay),
            clearTimeout: (id: unknown) => {
              globalThis.clearTimeout(id as ReturnType<typeof setTimeout>);
            },
          },
        }
      : {};
  const actors = createRevisionActors({ port, projectId: 'project-1', filesystem: async () => counted(), ...clock });
  /* The same files captured by walking, with no index to ask: what every incremental cut must hash to. */
  const walking = createRevisionActors({
    port,
    projectId: 'project-1',
    filesystem: async () => Object.assign(Object.create(rooted) as RevisionFileSystem, { changedSince: undefined }),
  });
  return {
    root,
    port,
    actors,
    walking,
    reads,
    listed,
    overrides,
    /** Whether the capture since `count` walked the whole tree. */
    walked: () => asked.includes(Number.MAX_SAFE_INTEGER),
    get rooted(): RevisionFileSystem {
      return rooted;
    },
    reload: () => {
      rooted = open();
    },
    ignore: (paths: readonly string[]) => {
      ignored = paths;
    },
    /** Read nothing yet: start counting what the next capture reads. */
    count: () => {
      reads.length = 0;
      asked.length = 0;
      listed.length = 0;
    },
  };
};

type Fixture = Awaited<ReturnType<typeof fixture>>;

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

const mint = async (at: Fixture): Promise<string> => {
  const taken = await cut(at.actors);
  const { revisionId: written } = await run<{ revisionId: string }>(at.actors.checkout.writeRevision, {
    checkoutId: 'live',
    cutId: taken.cutId,
    treeId: taken.treeId,
    parents: [],
    trigger: 'save',
    leaseIds: [],
  });
  const head = await at.port.readRef('main');
  await at.port.updateRef({ name: 'main', expectedHead: head, head: revisionId(written) });
  return written;
};

const walkedTreeId = async (actors: RevisionActors): Promise<string> => {
  const { treeId } = await run<{ treeId: string }>(actors.checkout.captureTree, { checkoutId: 'live' });
  return treeId;
};

/* Move `main` to a revision of `entries`, writing nothing in the checkout: a head move. */
const moveHead = async (at: Fixture, entries: ReadonlyArray<readonly [string, string, ('100644' | '100755')?]>) => {
  const head = await at.port.readRef('main');
  const receipt = await at.port.writeRevision({
    parents: head === undefined ? [] : [head],
    tree: new ImmutableRevisionTree(entries),
    provenance: { source: 'user', actorId: 'actor-1', runId: 'run-1', createdAt: Date.UTC(2026, 10, 7) },
    summary: { generated: 'Moved' },
  });
  await at.port.updateRef({ name: 'main', expectedHead: head, head: revisionId(receipt.commitId) });
};

const outside = (at: Fixture, path: string): string => join(at.root, path);

describe('a cut driven by a real Project Index (S10)', () => {
  it('should read only the file Tau wrote, and hash what a walk hashes', async () => {
    const at = await fixture(files(50));
    await mint(at);
    await at.rooted.writeFile('dir2/f7.txt', 'edited\n');

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.reads).toEqual(['dir2/f7.txt']);
    expect(at.walked()).toBe(false);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should find an edit no observer saw through the D5 compare', async () => {
    const at = await fixture(files(50));
    await mint(at);
    await writeFile(outside(at, 'dir3/f8.txt'), 'edited by another program\n');

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.reads).toEqual(['dir3/f8.txt']);
    expect(at.walked()).toBe(false);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should take a removed directory, a file turned into a directory and a moved subtree', async () => {
    const at = await fixture(files(50));
    await mint(at);
    await rm(outside(at, 'dir3'), { recursive: true });
    await rm(outside(at, 'dir2/f2.txt'));
    await mkdir(outside(at, 'dir2/f2.txt'));
    await writeFile(outside(at, 'dir2/f2.txt/inner.txt'), 'a directory now\n');
    await mkdir(outside(at, 'moved'));
    await rename(outside(at, 'dir1'), outside(at, 'moved/dir1'));

    at.count();
    const { treeId } = await cut(at.actors);

    const moved = Object.keys(files(50))
      .filter((path) => path.startsWith('dir1/'))
      .map((path) => `moved/${path}`);
    expect(at.reads.toSorted()).toEqual(['dir2/f2.txt/inner.txt', ...moved].toSorted());
    expect(at.walked()).toBe(false);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should re-read a file that was racy at the last capture, though its stats are unchanged (EQ7)', async () => {
    const at = await fixture(files(20));
    /* Written moments before the capture that records it: its timestamp cannot prove its bytes. */
    await writeFile(outside(at, 'racy.txt'), 'first\n');
    await mint(at);
    const { mtime } = await stat(outside(at, 'racy.txt'));
    await writeFile(outside(at, 'racy.txt'), 'other\n');
    await utimes(outside(at, 'racy.txt'), mtime, mtime);

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.reads).toContain('racy.txt');
    expect(treeId).toBe(await walkedTreeId(at.walking));
    await expect(readFile(outside(at, 'racy.txt'), 'utf8')).resolves.toBe('other\n');
  });

  it('should read a file whose mode alone changed, as a walk would see it', async () => {
    const at = await fixture(files(20));
    await mint(at);
    const before = await stat(outside(at, 'dir0/f5.txt'));
    await chmod(outside(at, 'dir0/f5.txt'), 0o755);
    await utimes(outside(at, 'dir0/f5.txt'), before.mtime, before.mtime);

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.reads).toEqual(['dir0/f5.txt']);
    expect(at.walked()).toBe(false);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should walk when the ignored paths changed since the last capture', async () => {
    const at = await fixture(files(20));
    await mint(at);
    at.ignore(['dir4/']);

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.walked()).toBe(true);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should walk when the ignored paths changed, from a port that reports no ignore context', async () => {
    const at = await fixture(files(20), { ignoreRules: 'bare' });
    await mint(at);
    await at.rooted.writeFile('dir2/f7.txt', 'edited\n');

    at.count();
    await cut(at.actors);
    expect(at.walked()).toBe(false);

    at.ignore(['dir4/']);
    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.walked()).toBe(true);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should walk for a capture that bypasses the memo, and stay incremental after it', async () => {
    const at = await fixture(files(20));
    await mint(at);

    at.count();
    await run(at.actors.branch.checkBranch, { projectId: 'project-1', operation: 'switch', branch: 'other' });
    /* Every versioned file, read past the memo: the fixture's twenty and what init wrote. */
    expect(at.walked()).toBe(true);
    expect(at.reads.length).toBe(22);

    await at.rooted.writeFile('dir1/f1.txt', 'edited\n');
    at.count();
    const { treeId } = await cut(at.actors);
    expect(at.reads).toEqual(['dir1/f1.txt']);
    expect(at.walked()).toBe(false);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it.each([{ failing: 'changedSince' }, { failing: 'compareIndex' }] as const)(
    'should walk, not fail, when $failing rejects',
    async ({ failing }) => {
      const at = await fixture(files(20));
      await mint(at);
      await at.rooted.writeFile('dir2/f2.txt', 'edited\n');
      const unavailable = new Error('The index is unavailable.');
      if (failing === 'changedSince') {
        const real = at.rooted.changedSince!;
        /* The walk's own probe of where the index stands still answers. */
        at.overrides.changedSince = async (since, options) => {
          if (since === Number.MAX_SAFE_INTEGER) {
            return real(since, options);
          }
          throw unavailable;
        };
      } else {
        at.overrides.compareIndex = async () => {
          throw unavailable;
        };
      }

      at.count();
      const { treeId } = await cut(at.actors);

      expect(at.walked()).toBe(true);
      expect(treeId).toBe(await walkedTreeId(at.walking));
    },
  );

  it('should walk when the index answers rescan, never reading its empty lists as no change, then go incremental again', async () => {
    const at = await fixture(files(20));
    await mint(at);
    await writeFile(outside(at, 'dir4/f9.txt'), 'written while the index was elsewhere\n');
    const real = at.rooted.changedSince!;
    at.overrides.changedSince = async (since, options) => {
      const answer = await real(since, options);
      return { ...answer, entries: [], removed: [], rescan: true };
    };

    at.count();
    const { treeId } = await cut(at.actors);
    expect(at.reads).toContain('dir4/f9.txt');
    expect(at.walked()).toBe(true);
    expect(treeId).toBe(await walkedTreeId(at.walking));

    delete at.overrides.changedSince;
    await at.rooted.writeFile('dir1/f1.txt', 'edited\n');
    at.count();
    await cut(at.actors);
    /* The file dir4/f9.txt was racy at the walk: it is read again once, as a walk would. */
    expect(at.reads.filter((path) => path !== 'dir4/f9.txt')).toEqual(['dir1/f1.txt']);
    expect(at.walked()).toBe(false);
  });

  it('should hash what a walk hashes after the root reopens its index', async () => {
    const at = await fixture(files(20));
    await mint(at);
    await writeFile(outside(at, 'dir0/f0.txt'), 'edited while closed\n');
    at.reload();

    const { treeId } = await cut(at.actors);

    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should hash what a walk hashes for captures that run at once, and keep a usable cursor', async () => {
    const at = await fixture(files(30));
    await mint(at);
    await at.rooted.writeFile('dir2/f2.txt', 'edited\n');

    const [first, second] = await Promise.all([cut(at.actors), cut(at.actors)]);
    const walked = await walkedTreeId(at.walking);
    expect([first.treeId, second.treeId]).toEqual([walked, walked]);

    await at.rooted.writeFile('dir3/f3.txt', 'edited\n');
    at.count();
    const { treeId } = await cut(at.actors);
    expect(at.reads).not.toContain('dir0/f0.txt');
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });
});

describe('a cut driven by an index whose provider reports no modes', () => {
  /* A walk gives each file the head's mode, or 100644 when the head does not hold it. */
  it('should walk when the head gives a kept file another mode than the last capture', async () => {
    const at = await fixture({ 'a.txt': 'a\n', 'b.txt': 'b\n' }, { backend: 'memory' });
    await mint(at);
    await moveHead(at, [
      ['a.txt', 'a\n', '100755'],
      ['b.txt', 'b\n'],
    ]);

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.walked()).toBe(true);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should give 100644 to a kept file the new head does not hold, as a walk does', async () => {
    const at = await fixture({ 'a.txt': 'a\n', 'b.txt': 'b\n' }, { backend: 'memory' });
    await moveHead(at, [
      ['a.txt', 'a\n', '100755'],
      ['b.txt', 'b\n'],
    ]);
    await cut(at.actors);
    await moveHead(at, [['b.txt', 'b\n']]);

    const { treeId } = await cut(at.actors);

    expect(treeId).toBe(await walkedTreeId(at.walking));
  });
});

const blobOidOf = (content: string): string =>
  createHash('sha1')
    .update(`blob ${String(Buffer.byteLength(content))}\0`)
    .update(content)
    .digest('hex');

describe('a first revision built from recorded blob ids (D12)', () => {
  it('should take the ids the index holds for what the walk read, asking it to measure nothing', async () => {
    const at = await fixture(files(10));
    const asked: Array<Readonly<{ paths: readonly string[]; measure: boolean | undefined }>> = [];
    /* A well-formed id of other bytes: had the walk hashed the file, the tree could not name it. */
    const recorded = 'f'.repeat(40);
    at.overrides.facts = async (paths, options) => {
      asked.push({ paths, measure: options?.measure });
      return new Map(
        paths.includes('dir1/f1.txt') ? [['dir1/f1.txt', { contentKind: 'text', blobOid: recorded }]] : [],
      );
    };

    const taken = await cut(at.actors);
    const written = await mint(at);

    expect(asked).toHaveLength(1);
    expect(asked[0]?.measure).toBe(false);
    expect(asked[0]?.paths).toContain('dir1/f1.txt');
    expect(taken.treeId).not.toBe(await walkedTreeId(at.walking));
    const tree = await at.port.listTree?.(revisionId(written));
    expect(tree?.find(({ path }) => path === 'dir1/f1.txt')?.oid).toBe(recorded);
  });

  /* A committed import's record, as the commit writes it: one file's recorded facts, at its placed size and mtime. */
  const writeImportRecord = async (at: Fixture, path: string, oid: string): Promise<void> => {
    const placed = await stat(outside(at, path));
    await mkdir(outside(at, '.tau'), { recursive: true });
    await writeFile(
      outside(at, '.tau/import.json'),
      JSON.stringify({
        version: 1,
        operationId: 'req_import',
        pin: { kind: 'zip', name: 'x', size: 1, entries: 1 },
        at: Date.now(),
        entries: [
          {
            path,
            size: placed.size,
            mtimeMs: placed.mtimeMs,
            facts: { contentKind: 'text', blobOid: oid, sha256: 'a'.repeat(64) },
          },
        ],
      }),
    );
  };

  it("should take a committed import's recorded facts through the real Project Index", async () => {
    const initial = files(10);
    const at = await fixture(initial);
    const recorded = 'e'.repeat(40);
    await writeImportRecord(at, 'dir1/f1.txt', recorded);
    at.reload();

    const written = await mint(at);

    const tree = await at.port.listTree?.(revisionId(written));
    expect(tree?.find(({ path }) => path === 'dir1/f1.txt')?.oid).toBe(recorded);
    expect(tree?.find(({ path }) => path === 'dir1/f6.txt')?.oid).toBe(blobOidOf(initial['dir1/f6.txt']!));
  });

  it('should hash a same-size change the index has not observed yet, never pinning the recorded id to it', async () => {
    const initial = files(10);
    const at = await fixture(initial);
    await writeImportRecord(at, 'dir1/f1.txt', 'e'.repeat(40));
    at.reload();
    /* The record is taken, then another program rewrites the file at its size before any compare sees it. */
    const taken = await at.rooted.facts?.(['dir1/f1.txt'], { digests: ['blobOid'], measure: false });
    expect(taken?.get('dir1/f1.txt')?.blobOid).toBe('e'.repeat(40));
    const changed = 'FILE 1\n';
    expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(initial['dir1/f1.txt']!));
    await writeFile(outside(at, 'dir1/f1.txt'), changed);

    const written = await mint(at);

    const tree = await at.port.listTree?.(revisionId(written));
    expect(tree?.find(({ path }) => path === 'dir1/f1.txt')?.oid).toBe(blobOidOf(changed));
  });

  it("should hash a later capture's file however it was rewritten: a record answers only the first capture after it", async () => {
    const initial = files(10);
    const at = await fixture(initial);
    const recorded = 'e'.repeat(40);
    await writeImportRecord(at, 'dir1/f1.txt', recorded);
    at.reload();
    const first = await cut(at.actors);
    /* Rewritten at its size, and its mtime put back: nothing a stat can tell apart from the recorded file. */
    const before = await stat(outside(at, 'dir1/f1.txt'));
    const changed = 'FILE 1\n';
    expect(Buffer.byteLength(changed)).toBe(before.size);
    await writeFile(outside(at, 'dir1/f1.txt'), changed);
    await utimes(outside(at, 'dir1/f1.txt'), before.atime, before.mtime);
    const after = await stat(outside(at, 'dir1/f1.txt'));
    expect(after.mtimeMs).toBe(before.mtimeMs);

    /* A capture with no memo of its own (another checkout's) reads every file, this one with it. */
    const second = await walkedTreeId(at.walking);

    /* Pinned to the record, the file would leave the tree as the first capture's; hashed, it does not. */
    expect(second).not.toBe(first.treeId);
  });

  it('should take no fact the index measured itself, only those an import recorded', async () => {
    const initial = files(10);
    const at = await fixture(initial);
    /* The index measures and trusts the file's id, but no import recorded it. */
    const measured = await at.rooted.facts?.(['dir1/f1.txt'], { digests: ['blobOid'] });
    expect(measured?.get('dir1/f1.txt')?.blobOid).toBe(blobOidOf(initial['dir1/f1.txt']!));

    const answered = await at.rooted.facts?.(['dir1/f1.txt'], {
      digests: ['blobOid'],
      measure: false,
      recorded: 'import',
    });

    expect(answered?.has('dir1/f1.txt')).toBe(false);
  });

  it("should hash to what a walk hashes when the recorded ids are the files' own", async () => {
    const initial = files(10);
    const at = await fixture(initial);
    at.overrides.facts = async (paths) =>
      new Map(
        paths.flatMap(
          (path): Array<[string, ContentFacts]> =>
            initial[path] === undefined ? [] : [[path, { contentKind: 'text', blobOid: blobOidOf(initial[path]) }]],
        ),
      );

    const { treeId } = await cut(at.actors);

    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should hash a file itself when the index has no id for it', async () => {
    const at = await fixture(files(10));
    let asked: readonly string[] = [];
    at.overrides.facts = async (paths) => {
      asked = paths;
      return new Map();
    };

    const { treeId } = await cut(at.actors);

    expect(asked.length).toBeGreaterThan(0);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });
});

/*
 * The checkout's own Git ignore rules, as the port reads them: an incremental
 * cut asks them only about the paths it reads, and walks only when a rule's
 * source changed (S10, I5).
 */
describe("a cut under the checkout's own Git ignore rules (S10)", () => {
  const ignoring = { '.gitignore': '*.log\nbuild/\n', 'kept.log': 'ignored from the start\n' };

  it('should ask only about the paths it reads, never walking the checkout for its rules', async () => {
    const at = await fixture({ ...files(50), ...ignoring }, { ignoreRules: 'port' });
    await mint(at);
    await at.rooted.writeFile('dir2/f7.txt', 'edited\n');
    await at.rooted.writeFile('dir1/new.log', 'ignored\n');
    await at.rooted.writeFile('build/out.stl', 'solid\n');

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.walked()).toBe(false);
    expect(at.listed).toStrictEqual([]);
    expect(at.reads).toStrictEqual(['dir2/f7.txt']);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should walk when a `.gitignore` changes, and take what it no longer ignores', async () => {
    const at = await fixture({ ...files(20), ...ignoring }, { ignoreRules: 'port' });
    await mint(at);
    await at.rooted.writeFile('.gitignore', 'build/\n');

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.walked()).toBe(true);
    expect(at.reads).toContain('kept.log');
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it("should walk when the store's info/exclude changes", async () => {
    const at = await fixture({ ...files(20), ...ignoring }, { ignoreRules: 'port' });
    await mint(at);
    await writeFile(outside(at, '.git/info/exclude'), 'dir3/\n');

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.walked()).toBe(true);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should take a file a head move tracks inside a directory Git listed whole', async () => {
    const at = await fixture({ ...files(10), ...ignoring, 'build/old.stl': 'solid\n' }, { ignoreRules: 'port' });
    await mint(at);
    const head = await at.port.readTree(revisionId((await at.port.readRef('main'))!));
    const kept = await Promise.all(
      (head?.entries() ?? []).map(async ({ path }) => [path, await readFile(outside(at, path), 'utf8')] as const),
    );
    /* A pull that brings a file tracked inside `build/`, which Git listed whole until now. */
    await moveHead(at, [...kept, ['build/tracked.stl', 'tracked now\n']]);
    await at.rooted.writeFile('build/tracked.stl', 'tracked now\n');

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.walked()).toBe(false);
    expect(at.reads).toStrictEqual(['build/tracked.stl']);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should walk, not fail, when the port cannot answer for the paths a cut reads', async () => {
    const at = await fixture({ ...files(20), ...ignoring }, { ignoreRules: 'failing' });
    await mint(at);
    await at.rooted.writeFile('build/deep/o.js', 'rebuilt\n');
    await at.rooted.writeFile('dir2/f7.txt', 'edited\n');

    at.count();
    const { treeId } = await cut(at.actors);

    expect(at.walked()).toBe(true);
    expect(treeId).toBe(await walkedTreeId(at.walking));
  });

  it('should take a file an outside commit starts or stops tracking, its bytes untouched, without walking', async () => {
    const at = await fixture({ ...files(10), ...ignoring }, { ignoreRules: 'port' });
    await mint(at);
    const tracked = async () => {
      const head = await at.port.readTree(revisionId((await at.port.readRef('main'))!));
      return Promise.all(
        (head?.entries() ?? []).map(async ({ path }) => [path, await readFile(outside(at, path), 'utf8')] as const),
      );
    };
    const before = await tracked();
    /* `git add -f kept.log` and a commit, elsewhere: the ignored file is tracked now. */
    await moveHead(at, [...before, ['kept.log', 'ignored from the start\n']]);

    at.count();
    const adopted = await cut(at.actors);

    expect(at.walked()).toBe(false);
    expect(at.reads).toStrictEqual(['kept.log']);
    expect(adopted.treeId).toBe(await walkedTreeId(at.walking));

    /* `git rm --cached kept.log` and a commit: untracked again, so ignored again. */
    await moveHead(at, before);
    at.count();
    const dropped = await cut(at.actors);

    expect(at.walked()).toBe(false);
    expect(dropped.treeId).toBe(await walkedTreeId(at.walking));
    expect(dropped.treeId).not.toBe(adopted.treeId);
  });
});
