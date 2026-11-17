/**
 * A warm reopen (Tau #2013, STO-25): a new session over a checkout an earlier
 * session compared. The comparison answers from the Project Index's stats
 * (D5, D11: capture by index deltas across sessions) and the fill's check reads
 * only files of a pointer's size (D4, I3), so a checkout nothing touched is
 * not read again. Anything the stats cannot vouch for — an edit by another
 * program, a racy timestamp, a moved head — is read, as a walk would (I5).
 */
import { chmod, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import type { LargeObjectsReport } from '#project-revisions.types.js';
import type { RevisionPort } from '#revision-port.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionActors, RevisionFileSystem } from '#revision-effects.js';
import { recordedBy, testIdentity } from '#test/identity.js';
import { generatedGitattributesContent, generatedGitattributesPath } from '#workspace-config.js';

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

const pointerOf = (oid: string, size: number): string =>
  `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(size)}\n`;

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
      error: (failure: unknown) => {
        reject(asError(failure));
      },
    });
    running.start();
  });

/* One checkout on disk, opened by as many sessions as a test asks for. */
const fixture = async (initial: Readonly<Record<string, string>>, options: Readonly<{ linked?: boolean }> = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'tau-warm-reopen-'));
  cleanups.push(async () => rm(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(initial)) {
    // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
    await mkdir(dirname(join(root, path)), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
    await writeFile(join(root, path), content);
    // oxlint-disable-next-line no-await-in-loop -- fixture files, written in order.
    await utimes(join(root, path), settledTime, settledTime);
  }
  const linkedRoot = await mkdtemp(join(tmpdir(), 'tau-warm-reopen-linked-'));
  cleanups.push(async () => rm(linkedRoot, { recursive: true, force: true }));
  let initialized = false;
  /*
   * A session: a fresh service, index, port and actors over the same disk, as a
   * reload opens them. `reads` names every file a revision effect read.
   */
  const session = async () => {
    const mountTable = new MountTable();
    mountTable.mount('/', new NodeFsProvider(root), {
      class: 'authored',
      backend: 'node',
      storageRootKey: `node:${root}`,
    });
    const service = new WorkspaceFileService({
      providerRegistry: new ProviderRegistry(),
      mountTable,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
    });
    /* The revision layer's own view, which reads a pointer as it is (D9). */
    const rooted = service.createRootedFileSystem('/', undefined, { placeholders: 'raw' });
    /* Linked checkouts, where a test asks for them, under `checkouts/<id>` beside the project's own files. */
    const linkedView = async (id: string): Promise<RevisionFileSystem> => {
      const at = `/checkouts/${id}`;
      if (mountTable.getExactMount(at) === undefined) {
        const directory = join(linkedRoot, id);
        await mkdir(directory, { recursive: true });
        mountTable.mount(at, new NodeFsProvider(directory), {
          class: 'authored',
          backend: 'node',
          storageRootKey: `node:${directory}`,
        });
      }
      return service.createRootedFileSystem(at, undefined, { placeholders: 'raw' });
    };
    const port: RevisionPort = createIsomorphicGitRevisionPort({
      filesystem: rooted,
      ...(options.linked === true ? { checkouts: { projectId: 'project-1', root: linkedView } } : {}),
    });
    if (!initialized) {
      initialized = true;
      await port.init({ author });
      await rooted.writeFile(generatedGitattributesPath, generatedGitattributesContent(undefined));
      for (const path of ['.gitattributes', '.gitignore']) {
        // oxlint-disable-next-line no-await-in-loop -- two files.
        await utimes(join(root, path), settledTime, settledTime).catch(() => undefined);
      }
    }
    const reads: string[] = [];
    /* What a test does once a file's bytes were read, as another program writing at that moment would. */
    const hooks: { afterRead?: (path: string) => Promise<void> } = {};
    /* While set, a write of the comparison record waits for it: the record is never a comparison's to wait on. */
    let recordWrites: Promise<void> | undefined;
    const holdRecordWrites = (): (() => void) => {
      let release: () => void = () => undefined;
      recordWrites = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        recordWrites = undefined;
        release();
      };
    };
    const store = rooted.privateStore ?? rooted;
    const privateStore = Object.assign(Object.create(store) as typeof store, {
      writeFile: (async (path: string, ...rest: readonly unknown[]) => {
        if (path.includes('tau-compare-')) {
          await recordWrites;
        }
        // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the store's own overloads.
        return (store.writeFile as (...arguments_: any[]) => Promise<unknown>).call(store, path, ...rest);
      }) as typeof store.writeFile,
    });
    let statTrees = 0;
    /* How many times the revision layer let go of the root without declaring it (D9). */
    let releases = 0;
    const counted = Object.assign(Object.create(rooted) as RevisionFileSystem, {
      privateStore,
      releaseDeclaration: () => {
        releases += 1;
        rooted.releaseDeclaration?.();
      },
      statTree: (async (...arguments_: Parameters<NonNullable<RevisionFileSystem['statTree']>>) => {
        statTrees += 1;
        return rooted.statTree!(...arguments_);
      }) as RevisionFileSystem['statTree'],
      readFile: (async (path: string, ...rest: readonly unknown[]) => {
        reads.push(path);
        // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the view's own overloads.
        const content = await (rooted.readFile as (...arguments_: any[]) => Promise<unknown>)(path, ...rest);
        await hooks.afterRead?.(path);
        return content;
      }) as RevisionFileSystem['readFile'],
      readFileStream: ((path: string, ...rest: readonly unknown[]) => {
        reads.push(path);
        // oxlint-disable-next-line typescript/no-unsafe-argument, typescript/no-explicit-any -- forwards the view's own overloads.
        const stream = (rooted.readFileStream as (...arguments_: any[]) => ReadableStream<Uint8Array<ArrayBuffer>>)(
          path,
          ...rest,
        );
        /* The hook runs once every byte was read, before the reader sees the end. */
        return stream.pipeThrough(
          new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
            flush: async () => hooks.afterRead?.(path),
          }),
        );
      }) as RevisionFileSystem['readFileStream'],
    });
    const reports: LargeObjectsReport[] = [];
    let answered: () => void = () => undefined;
    const fillChecked = new Promise<void>((resolve) => {
      answered = resolve;
    });
    const actors: RevisionActors = createRevisionActors({
      identity: testIdentity,
      port,
      projectId: 'project-1',
      filesystem: async (checkout) => (checkout.kind === 'linked' ? linkedView(checkout.id) : counted),
      onLargeObjects: (report) => {
        reports.push(report);
        answered();
      },
    });
    /* The same files walked by actors with no index to ask: what every answer must hash to. */
    const walking = createRevisionActors({
      identity: testIdentity,
      port,
      projectId: 'project-1',
      filesystem: async () => Object.assign(Object.create(rooted) as RevisionFileSystem, { changedSince: undefined }),
    });
    const close = async (): Promise<void> => {
      await actors.settled();
      await walking.settled();
      await service.close();
    };
    cleanups.push(close);
    return {
      root,
      rooted,
      port,
      actors,
      walking,
      reads,
      fillChecked,
      holdRecordWrites,
      hooks,
      reports,
      statTrees: () => statTrees,
      releases: () => releases,
      close,
    };
  };
  return { root, session };
};

type Session = Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['session']>>;

const compare = async (actors: RevisionActors): Promise<string> => {
  const { treeId } = await run<{ treeId: string }>(actors.checkout.captureTree, { checkoutId: 'live' });
  return treeId;
};

const mint = async (at: Session): Promise<string> => {
  const taken = await run<{ treeId: string; cutId: string }>(at.actors.checkout.cut, {
    checkoutId: 'live',
    trigger: 'save',
  });
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

describe('a warm reopen of a checkout an earlier session compared (Tau #2013)', () => {
  it('should answer the comparison and the fill check without reading a file when nothing changed', async () => {
    const { session } = await fixture(files(40));
    const first = await session();
    await mint(first);
    const before = await compare(first.actors);
    await first.close();

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads).toEqual([]);
    expect(treeId).toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should read an edit another program made between the sessions', async () => {
    const { root, session } = await fixture(files(40));
    const first = await session();
    await mint(first);
    const before = await compare(first.actors);
    await first.close();
    await writeFile(join(root, 'dir3/f8.txt'), 'edited by another program\n');
    await utimes(join(root, 'dir3/f8.txt'), settledTime, new Date(Date.now() - 30_000));

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads).toContain('dir3/f8.txt');
    expect(treeId).not.toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should take a file another program added between the sessions', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    const before = await compare(first.actors);
    await first.close();
    await writeFile(join(root, 'dir1/added.txt'), 'new\n');
    await utimes(join(root, 'dir1/added.txt'), settledTime, settledTime);

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads).toContain('dir1/added.txt');
    expect(treeId).not.toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should read a file whose mode alone changed between the sessions', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    const before = await compare(first.actors);
    await first.close();
    await chmod(join(root, 'dir0/f5.txt'), 0o755);
    await utimes(join(root, 'dir0/f5.txt'), settledTime, settledTime);

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads.length).toBeGreaterThan(0);
    expect(treeId).not.toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should answer a comparison without waiting for its record to be written', async () => {
    const { session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    const release = first.holdRecordWrites();
    const answered = await Promise.race([
      compare(first.actors),
      new Promise<'waited'>((resolve) => {
        setTimeout(() => {
          resolve('waited');
        }, 2000);
      }),
    ]);
    release();
    await first.close();

    expect(answered).not.toBe('waited');

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads).toEqual([]);
    expect(treeId).toBe(answered);
  });

  it('should write no record once the actors have settled, even for a comparison in flight at the close', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    await writeFile(join(root, 'dir3/f3.txt'), 'edited before the close\n');
    await utimes(join(root, 'dir3/f3.txt'), settledTime, new Date(Date.now() - 30_000));
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reading: () => void = () => undefined;
    const read = new Promise<void>((resolve) => {
      reading = resolve;
    });
    first.hooks.afterRead = async () => {
      reading();
      await held;
    };
    const comparing = compare(first.actors);
    await read;
    const settling = first.actors.settled();
    setTimeout(release, 100);
    await comparing;
    await settling;
    /* Past the keep's own delay: whatever the close left scheduled has run by now. */
    await new Promise((resolve) => {
      setTimeout(resolve, 2500);
    });

    await expect(readFile(join(root, '.git/tau-compare-live.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('should keep the newest comparison of a session, taken from the index, for the next one', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    await compare(first.actors);
    await writeFile(join(root, 'dir1/f6.txt'), 'edited in the first session\n');
    await utimes(join(root, 'dir1/f6.txt'), settledTime, new Date(Date.now() - 30_000));
    const edited = await compare(first.actors);
    await first.close();

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads).toEqual([]);
    expect(treeId).toBe(edited);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should answer the comparisons after a record answered from the index alone, until a file moves', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    const before = await compare(first.actors);
    await first.close();

    const second = await session();
    await second.fillChecked;
    expect(await compare(second.actors)).toBe(before);
    const listed = second.statTrees();
    expect(await compare(second.actors)).toBe(before);

    expect(second.statTrees()).toBe(listed);
    expect(second.reads).toEqual([]);

    await writeFile(join(root, 'dir4/f9.txt'), 'edited after the record answered\n');
    await utimes(join(root, 'dir4/f9.txt'), settledTime, new Date(Date.now() - 30_000));
    const treeId = await compare(second.actors);

    expect(treeId).not.toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should read the checkout when the record is torn', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    await compare(first.actors);
    await first.close();
    await writeFile(join(root, '.git/tau-compare-live.json'), '{"format":"tau-checkout-compare","vers');

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads.length).toBeGreaterThan(0);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should read a file whose timestamp was racy when the earlier session compared it (EQ7)', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    /* Written moments before the comparison that records it: its timestamp cannot prove its bytes. */
    await writeFile(join(root, 'racy.txt'), 'first\n');
    await compare(first.actors);
    await first.close();

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads).toContain('racy.txt');
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should read the checkout when an ignored .gitignore changed between the sessions (I5)', async () => {
    const { root, session } = await fixture({ ...files(10), 'vendor/.gitignore': '*\n', 'vendor/lib.js': 'lib\n' });
    const first = await session();
    await mint(first);
    const before = await compare(first.actors);
    await first.close();
    /* The rules file ignores itself, so no captured stat moves, yet `lib.js` is now versioned. */
    await writeFile(join(root, 'vendor/.gitignore'), '*\n!lib.js\n');
    await utimes(join(root, 'vendor/.gitignore'), settledTime, new Date(Date.now() - 30_000));

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(treeId).not.toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it.each([
    ['another checkout', { checkoutId: 'linked-1' }],
    ['other rules that turn files into a tree id', { rules: 'an earlier release' }],
  ])('should read the checkout when the record was kept for %s', async (_, altered) => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    await compare(first.actors);
    await first.close();
    const recordPath = join(root, '.git/tau-compare-live.json');
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as Record<string, unknown>;
    await writeFile(recordPath, `${JSON.stringify({ ...record, ...altered })}\n`);

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads.length).toBeGreaterThan(0);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should read an edit that kept the file size and moved only its timestamp', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    const before = await compare(first.actors);
    await first.close();
    await writeFile(join(root, 'dir2/f7.txt'), 'FILE 7\n');
    await utimes(join(root, 'dir2/f7.txt'), settledTime, new Date(Date.now() - 30_000));

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads).toContain('dir2/f7.txt');
    expect(treeId).not.toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should read the checkout when the store’s info/exclude changed between the sessions', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    /* Untracked, so a rule can leave it out: the head's own files are never ignored. */
    await mkdir(join(root, 'extra'), { recursive: true });
    await writeFile(join(root, 'extra/notes.txt'), 'not yet recorded\n');
    await utimes(join(root, 'extra/notes.txt'), settledTime, settledTime);
    const before = await compare(first.actors);
    await first.close();
    await mkdir(join(root, '.git/info'), { recursive: true });
    await writeFile(join(root, '.git/info/exclude'), 'extra/\n');

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads.length).toBeGreaterThan(0);
    expect(treeId).not.toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should read the checkout when a file the rules ignore appeared between the sessions', async () => {
    const { root, session } = await fixture({ ...files(20), 'dir0/.gitignore': '*.log\n' });
    const first = await session();
    await mint(first);
    const before = await compare(first.actors);
    await first.close();
    await writeFile(join(root, 'dir0/build.log'), 'ignored\n');
    await utimes(join(root, 'dir0/build.log'), settledTime, settledTime);

    const second = await session();
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads.length).toBeGreaterThan(0);
    expect(treeId).toBe(before);
    expect(treeId).toBe(await compare(second.walking));
  });

  it('should keep no record that names bytes another program replaced while the capture read them', async () => {
    const { root, session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    await first.close();

    const second = await session();
    await second.fillChecked;
    let edited = false;
    second.hooks.afterRead = async (path) => {
      if (path === 'dir2/f7.txt' && !edited) {
        edited = true;
        /* Another size, under the timestamp the file had before: only the stats taken before the read tell. */
        await writeFile(join(root, path), 'replaced while it was read\n');
        await utimes(join(root, path), settledTime, settledTime);
      }
    };
    await compare(second.actors);
    await second.close();

    expect(edited).toBe(true);

    const third = await session();
    await third.fillChecked;
    const treeId = await compare(third.actors);

    expect(third.reads).toContain('dir2/f7.txt');
    expect(treeId).toBe(await compare(third.walking));
  });

  it('should read the checkout again when the head moved between the sessions', async () => {
    const { session } = await fixture(files(20));
    const first = await session();
    await mint(first);
    await compare(first.actors);
    await first.close();

    const second = await session();
    const head = await second.port.readRef('main');
    const receipt = await second.port.writeRevision({
      parents: head === undefined ? [] : [head],
      tree: new ImmutableRevisionTree([['other.txt', 'elsewhere\n']]),
      provenance: { source: 'user', ...recordedBy('actor-1'), runId: 'run-1', createdAt: Date.UTC(2026, 10, 7) },
      summary: { generated: 'Moved' },
    });
    await second.port.updateRef({ name: 'main', expectedHead: head, head: revisionId(receipt.commitId) });
    await second.fillChecked;
    const treeId = await compare(second.actors);

    expect(second.reads.length).toBeGreaterThan(0);
    expect(treeId).toBe(await compare(second.walking));
  });
});

describe('a removed checkout’s comparison record (Tau #2013)', () => {
  it('should go with the checkout, so nothing it answered survives the removal', async () => {
    const { root, session } = await fixture(files(5), { linked: true });
    const first = await session();
    await mint(first);
    const head = await first.port.readRef('main');
    const { checkout } = await run<{ checkout: { id: string } }>(first.actors.checkouts.addCheckout, {
      projectId: 'project-1',
      branch: 'candidate',
      from: head ?? '',
    });
    await run(first.actors.checkout.captureTree, { checkoutId: checkout.id });
    const recordPath = join(root, `.git/tau-compare-${checkout.id}.json`);
    await vi.waitFor(
      async () => {
        await expect(readFile(recordPath, 'utf8')).resolves.toContain('tau-checkout-compare');
      },
      { timeout: 5000 },
    );

    await run(first.actors.checkouts.removeCheckout, { projectId: 'project-1', id: checkout.id });
    await first.close();

    await expect(readFile(recordPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('the fill check of a warm reopen (Tau #2013)', () => {
  it('should read only the files a pointer could be, never the rest of the checkout', async () => {
    const big = 'x'.repeat(4096);
    const { session } = await fixture({ ...files(20), 'model/big.bin': big });
    const first = await session();
    await mint(first);
    await first.close();

    const second = await session();
    await second.fillChecked;

    expect(second.reads).toEqual([]);
  });

  it('should leave out a pointer-sized file the rules ignore, as a capture does', async () => {
    const pointer = pointerOf('b'.repeat(64), 654_321);
    const { session } = await fixture({ ...files(10), 'assets/.gitignore': 'part.stl\n', 'assets/part.stl': pointer });
    const first = await session();
    await mint(first);
    await first.close();

    const second = await session();
    await second.fillChecked;

    /* A pointer is found, so the attributes that say whether it is a placeholder are read too (D9). */
    expect(second.reads).toEqual(['assets/part.stl', '.gitattributes']);
    expect(second.reports.map(({ facet }) => facet)).toEqual([undefined]);
  });

  /* A reopen the record answers walks nothing, so its fill check is what says which pointers are placeholders (D9). */
  it('should declare the placeholders a record-answered reopen finds, by the attributes, walking nothing', async () => {
    const pointer = pointerOf('a'.repeat(64), 123_456);
    const { session } = await fixture({ ...files(10), 'assets/part.stl': pointer, 'notes/pointer.txt': pointer });
    const first = await session();
    await mint(first);
    const treeId = await compare(first.actors);
    await first.close();

    const second = await session();
    expect(await compare(second.actors)).toBe(treeId);
    await second.fillChecked;

    expect(
      second.reads.filter((path) => !['assets/part.stl', 'notes/pointer.txt', '.gitattributes'].includes(path)),
    ).toEqual([]);
    expect(await second.rooted.pendingPaths!(['assets/part.stl', 'notes/pointer.txt'])).toStrictEqual([
      'assets/part.stl',
    ]);
  });

  /*
   * A fill check reads a checkout a tree write may land in meanwhile: what it found is the older tree's, so it never
   * declares over the newer one, whose placeholders the write's own capture declares (D9, D10, I7).
   */
  it('should never declare what a fill check found over a tree a write announced meanwhile', async () => {
    const kept = pointerOf('a'.repeat(64), 123_456);
    const added = pointerOf('b'.repeat(64), 654_321);
    const { session } = await fixture({ ...files(10), 'assets/part.stl': kept });
    const first = await session();
    await mint(first);
    await first.close();

    const second = await session();
    /* The fill check stops at its attributes read; a tree write announces its tree and lands a new placeholder. */
    const paused = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    let wrote = false;
    second.hooks.afterRead = async (path) => {
      if (path === '.gitattributes' && second.reads.at(-2) === 'assets/part.stl' && !wrote) {
        wrote = true;
        paused.resolve();
        await resume.promise;
      }
    };
    await paused.promise;
    await second.rooted.writeFile('assets/new.stl', added);
    await second.rooted.expectEntries!([
      { path: 'assets/part.stl', size: kept.length, pending: { oid: 'a'.repeat(64), size: 123_456 }, arriving: false },
      { path: 'assets/new.stl', size: added.length, pending: { oid: 'b'.repeat(64), size: 654_321 }, arriving: false },
    ]);
    second.rooted.endExpectation!();
    resume.resolve();
    await second.fillChecked;
    await second.actors.settled();

    expect(wrote).toBe(true);
    expect(await second.rooted.pendingPaths!(['assets/part.stl', 'assets/new.stl'])).toStrictEqual([
      'assets/part.stl',
      'assets/new.stl',
    ]);
  });

  /* The fill check judges by a capture's own rule: an attributes file deeper down counts, an ignored one does not. */
  it('should declare by nested attributes files and never by an ignored one', async () => {
    const pointer = pointerOf('a'.repeat(64), 123_456);
    const { session } = await fixture({
      ...files(5),
      'vendor/.gitattributes': '*.bin filter=lfs diff=lfs merge=lfs -text\n',
      'vendor/blob.bin': pointer,
      'extra/.gitattributes': '*.dat filter=lfs diff=lfs merge=lfs -text\n',
      'extra/blob.dat': pointer,
    });
    const first = await session();
    await first.rooted.writeFile('.gitignore', 'extra/.gitattributes\n');
    await mint(first);
    await first.close();

    const second = await session();
    await second.fillChecked;

    expect(await second.rooted.pendingPaths!(['vendor/blob.bin', 'extra/blob.dat'])).toStrictEqual(['vendor/blob.bin']);
  });

  /* A look that fails before it declares lets go of the root, so no stat waits out the bound (D9; I7 by the reads). */
  it('should let go of the checkout when the fill check’s look fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pointer = pointerOf('a'.repeat(64), 123_456);
    const { session } = await fixture({ ...files(10), 'assets/part.stl': pointer });
    const first = await session();
    await mint(first);
    await first.close();

    const second = await session();
    let failed = false;
    second.hooks.afterRead = async (path) => {
      if (path === '.gitattributes' && !failed) {
        failed = true;
        throw new Error('the attributes could not be read');
      }
    };
    await expect.poll(() => second.releases(), { timeout: 5000 }).toBeGreaterThan(0);

    expect(failed).toBe(true);
    expect(warn).toHaveBeenCalledWith('[revisions] large-object placeholders could not be checked', expect.any(Error));
  });

  /* A compare is not fenced against a tree write: what its capture read is the older tree's, and never declared over the newer one. */
  it('should never declare what a compare captured over a tree a write announced meanwhile', async () => {
    const kept = pointerOf('a'.repeat(64), 123_456);
    const added = pointerOf('b'.repeat(64), 654_321);
    const { session } = await fixture({ ...files(10), 'assets/part.stl': kept });
    const first = await session();
    /* The compare's walk stops at an ordinary file; a tree write announces its tree and lands a new placeholder. */
    const paused = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    let wrote = false;
    first.hooks.afterRead = async (path) => {
      if (path === 'dir1/f1.txt' && !wrote) {
        wrote = true;
        paused.resolve();
        await resume.promise;
      }
    };
    const compared = compare(first.actors);
    await paused.promise;
    await first.rooted.writeFile('assets/new.stl', added);
    await first.rooted.expectEntries!([
      { path: 'assets/part.stl', size: kept.length, pending: { oid: 'a'.repeat(64), size: 123_456 }, arriving: false },
      { path: 'assets/new.stl', size: added.length, pending: { oid: 'b'.repeat(64), size: 654_321 }, arriving: false },
    ]);
    first.rooted.endExpectation!();
    resume.resolve();
    await compared;
    await first.actors.settled();

    expect(wrote).toBe(true);
    expect(await first.rooted.pendingPaths!(['assets/part.stl', 'assets/new.stl'])).toStrictEqual([
      'assets/part.stl',
      'assets/new.stl',
    ]);
  });

  it('should still find a placeholder a pointer-sized file holds', async () => {
    const pointer = pointerOf('a'.repeat(64), 123_456);
    const { session } = await fixture({ ...files(10), 'assets/part.stl': pointer });
    const first = await session();
    await mint(first);
    await first.close();

    const second = await session();
    await second.fillChecked;

    /* A pointer is found, so the attributes that say whether it is a placeholder are read too (D9). */
    expect(second.reads).toEqual(['assets/part.stl', '.gitattributes']);
  });
});
