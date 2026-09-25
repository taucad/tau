/**
 * The second-device flow against a real wire (AC21, D28, S41) — both legs.
 *
 * The witness here is `git http-backend` behind a `node:http` server over a
 * `mktemp` bare repository: the same CGI the Tau API spawns (P16, D27). What is
 * proved is the *scheduler's* half — the machine, its effects, the durable queue
 * on disk and the open pull — against a server that really refuses a ref and
 * really advertises what it holds. The joint proof over the Tau API wire, with
 * two signed-in clients, is W18's.
 *
 * | # | Row | What it proves |
 * | --- | --- | --- |
 * | 1 | **red pin (c)** | a record ref the server refuses re-queues only itself; `main` is on the remote |
 * | 2 | **red pin (a)** | a `close` revision that could not be pushed is in `.git/sync-pending`, and a fresh actor retries it first |
 * | 3 | **red pin (d)** | device B's open pull brings device A's file into B's checkout with no reload, and B renders before the pull answers |
 * | 4 | **red pin (e)** | a device that is merely *ahead* of the remote drains its durable queue on the next open, online, and never reports a conflict (review 2 R1) |
 * | 6 | **W18-b red pin (c)** | a device that has never held the project materializes its tree *and* its `.tau/chats` projection from the remote, with no chat turn (W18 DEF-2) |
 *
 * Each row runs on both legs: `isomorphic-git` (the browser's port) and native
 * `git` (a disk host's), because A15 is that the two legs are one transport.
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import type { RootedFileSystem } from '@taucad/filesystem';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createActor } from 'xstate';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { chatRecordsPath, chatRefName, chatSegmentPath } from '#chat-ref.js';
import { createRevisionHttpClient } from '#http-client.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { createRevisionActors } from '#revision-effects.js';
import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type { SyncQueueRecord } from '#sync.types.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import type { RevisionPort } from '#revision-port.js';

const author = { name: 'Tau', email: 'tau@example.com' };
const chatId = 'c1';
const chatRef = `refs/tau/chats/${chatId}`;
const mainRef = 'refs/heads/main';
const syncQueuePath = '.git/sync-pending';

const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const temporaryRoots: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryRoots.map(async (root) => rm(root, { recursive: true, force: true })));
});

const temporaryRoot = async (label: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), `tau-w13-${label}-`));
  temporaryRoots.push(root);
  return root;
};

type Leg = Readonly<{
  name: string;
  port: (root: string, filesystem: RootedFileSystem, remoteUrl?: string) => RevisionPort;
}>;

const legs: readonly Leg[] = [
  {
    name: 'isomorphic-git',
    port: (_root, filesystem) =>
      createIsomorphicGitRevisionPort({
        filesystem,
        /* The browser leg reaches a remote only through a client (W11b §1.2). */
        http: createRevisionHttpClient({ authorization: () => 'Bearer session-token' }),
        checkouts: { projectId: 'project-1', root: () => filesystem },
      }),
  },
  {
    name: 'native git',
    port: (root, _filesystem, remoteUrl) =>
      createNativeGitRevisionPort({
        repositoryPath: root,
        ...(remoteUrl === undefined
          ? {}
          : { remoteCredential: () => ({ repositoryUrl: remoteUrl, authorization: 'Bearer session-token' }) }),
      }),
  },
];

type Device = Readonly<{
  root: string;
  filesystem: RootedFileSystem;
  port: RevisionPort;
  actors: ReturnType<typeof createRevisionActors>;
  /** Start a scheduler over this device's effects, with a real clock. */
  scheduler: (
    options?: Readonly<{ online?: boolean }>,
  ) => ReturnType<typeof createActor<ReturnType<typeof syncMachine.provide>>>;
}>;

/**
 * One device: a project directory, a port over it, and the sync effects.
 *
 * @param input - Which port this device speaks through, the label that names its
 *   temporary directory, where the fixture is, and the files to write first.
 * @returns The device the rows drive.
 */
const device = async (
  input: Readonly<{
    leg: Leg;
    label: string;
    remoteUrl?: string;
    files?: Readonly<Record<string, string>>;
    onChatsProjected?: (chatIds: readonly string[]) => void;
    wrapFilesystem?: (filesystem: RootedFileSystem) => RootedFileSystem;
  }>,
): Promise<Device> => {
  const { leg, label, remoteUrl } = input;
  const files = input.files ?? {};
  const root = await temporaryRoot(label);
  const filesystem = new NodeFsProvider(root);
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, in order.
    await filesystem.writeFile(path, content);
  }
  const port = leg.port(root, filesystem, remoteUrl);
  await port.init({ author });
  if (remoteUrl !== undefined) {
    await port.setRemote({ name: 'tau', url: remoteUrl });
  }
  const actors = createRevisionActors({
    port,
    projectId: 'project-1',
    authorityEpoch: `epoch-${label}`,
    filesystem: () => input.wrapFilesystem?.(filesystem) ?? filesystem,
    deviceId: () => `device-${label}`,
    ...(input.onChatsProjected === undefined ? {} : { onChatsProjected: input.onChatsProjected }),
  });
  return {
    root,
    filesystem,
    port,
    actors,
    scheduler: (options = {}) =>
      createActor(syncMachine.provide({ actors: actors.sync }), {
        input: {
          projectId: 'project-1',
          debounceMilliseconds: 5,
          /* Long enough that a settled state stays settled while a row asserts it:
           * the backoff is a delay, not something this suite is measuring. */
          retryMilliseconds: 30_000,
          pullRenderMilliseconds: 20,
          pullDeadlineMilliseconds: 25_000,
          ...(options.online === undefined ? {} : { online: options.online }),
        },
      }),
  };
};

const encoder = new TextEncoder();

/** Run one injected promise actor the way its machine would. */
const asError = (failure: unknown): Error => (failure instanceof Error ? failure : new Error(String(failure)));

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

/** The project tree one revision records; `.tau/**` is records and never in it. */
const projectTree = (files: Readonly<Record<string, string>>): ImmutableRevisionTree =>
  new ImmutableRevisionTree(Object.entries(files).map(([path, content]) => [path, encoder.encode(content)]));

/**
 * Record one revision on `main`, the way a `save` cut records one.
 *
 * @param input - The device recording it, the tree this revision holds, what the
 *   row calls it, and the revision it continues when it continues one.
 * @returns The revision id `main` now names.
 */
const record = async (
  input: Readonly<{
    device: Device;
    files: Readonly<Record<string, string>>;
    summary: string;
    parent?: string;
  }>,
): Promise<string> => {
  const { device: device_, files, summary, parent } = input;
  const receipt = await device_.port.writeRevision({
    parents: parent === undefined ? [] : [revisionId(parent)],
    tree: projectTree(files),
    provenance: { source: 'user', actorId: 'actor-w13', createdAt: Date.UTC(2026, 8, 13, 9, 0, 0) },
    summary: { generated: summary },
  });
  await device_.port.updateRef({
    name: mainRef,
    /* `undefined` is "this ref must be unborn" (`UpdateRevisionRefInput`), so a
     * revision that continues another has to name it as its expected old value
     * or the move is refused and the branch silently stays put. */
    expectedHead: parent === undefined ? undefined : revisionId(parent),
    head: revisionId(receipt.commitId),
  });
  return receipt.commitId;
};

const queueOf = async (device_: Device): Promise<SyncQueueRecord> => {
  const stored = await readFile(join(device_.root, syncQueuePath), 'utf8');
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the record this lane writes.
  return JSON.parse(stored) as SyncQueueRecord;
};

describe.runIf(gitOnPath).each(legs)('W13 second-device flow over git http-backend — $name', (leg) => {
  it('row 1 (red pin c): a refused record ref re-queues only itself while main reaches the remote', async () => {
    const remoteRoot = await temporaryRoot('remote-refuse');
    const remote = await startGitHttpBackend({ root: remoteRoot, refusedRef: chatRef });
    try {
      const one = await device({
        leg,
        label: 'a-refuse',
        remoteUrl: remote.url,
        files: {
          'bracket.scad': 'cube([10, 20, 30]);\n',
          [`${chatRecordsPath(chatId)}/chat.json`]: '{"name":"Bracket"}\n',
          [`${chatRecordsPath(chatId)}/events.jsonl`]: '{"type":"turn.start"}\n',
        },
      });
      const head = await record({
        device: one,
        files: { 'bracket.scad': 'cube([10, 20, 30]);\n' },
        summary: 'First revision',
      });

      const scheduler = one.scheduler();
      scheduler.start();
      scheduler.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: head });
      await vi.waitFor(
        () => {
          expect(selectSyncFacet(scheduler.getSnapshot()).state).toBe('queued');
        },
        { timeout: 30_000 },
      );

      /* `main` is on the remote; the chat ref the server refused is the only
       * thing in the queue, and nothing about history moved because of it. */
      expect(await remote.git(['rev-parse', mainRef])).toBe(head);
      const queue = await queueOf(one);
      expect(queue.entries.map((entry) => entry.ref)).toEqual([chatRef]);
      expect(selectSyncFacet(scheduler.getSnapshot())).toMatchObject({
        state: 'queued',
        pendingCount: 1,
        reason: 'rejected',
      });
      /* N4 and Rule 1: what the Sync row shows is the *server's* sentence. Both
       * legs learn it from the sideband; git's own placeholder for it names a
       * hook, which is a word no surface may ever render (contract §4). */
      const shown = selectSyncFacet(scheduler.getSnapshot()).error ?? '';
      expect(shown).toContain('not allowed here');
      expect(shown).not.toMatch(/hook|pre-receive/iu);

      scheduler.stop();
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('row 2 (red pin a): a close revision that could not be pushed is in the queue and retried first', async () => {
    const remoteRoot = await temporaryRoot('remote-offline');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    const one = await device({
      leg,
      label: 'a-offline',
      remoteUrl: remote.url,
      files: { 'bracket.scad': 'cube([1, 1, 1]);\n' },
    });
    const head = await record({
      device: one,
      files: { 'bracket.scad': 'cube([1, 1, 1]);\n' },
      summary: 'Close revision',
    });

    /* The remote is gone before the close flush, which is exactly the offline
     * close AC21 names: the revision exists and nothing can carry it. */
    await remote.close();

    const first = one.scheduler();
    first.start();
    first.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'close', revisionId: head });
    await vi.waitFor(
      async () => {
        const queued = await queueOf(one);
        expect(queued.entries.map((entry) => entry.ref)).toEqual([mainRef]);
      },
      { timeout: 30_000 },
    );
    first.stop();

    /* A second life of the scheduler reads the record, not a snapshot (D29). */
    const second = one.scheduler({ online: false });
    second.start();
    /* Both facts in the one wait (W18-b): `context.pending` is filled in
       `reading`, one transition *before* the machine settles on `queued`, so
       reading the facet after this wait raced the transition and answered
       `checking` about one run in three — on either leg. */
    await vi.waitFor(() => {
      expect(second.getSnapshot().context.pending.map((entry) => entry.ref)).toEqual([mainRef]);
      expect(selectSyncFacet(second.getSnapshot())).toMatchObject({ state: 'queued', pendingCount: 1 });
    });
    second.stop();
  }, 180_000);

  it('row 3 (red pin d): device B’s open pull brings device A’s work in, with no reload', async () => {
    const remoteRoot = await temporaryRoot('remote-pull');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    try {
      const one = await device({
        leg,
        label: 'a-pull',
        remoteUrl: remote.url,
        files: { 'bracket.scad': 'cube([2, 2, 2]);\n' },
      });
      const head = await record({ device: one, files: { 'bracket.scad': 'cube([2, 2, 2]);\n' }, summary: 'Device A' });
      await one.port.push({ remote: 'tau', atomic: true, refs: [{ name: mainRef }] });

      /* Device B is a *fresh* checkout of the same project: an empty tree, the
       * same remote, and nothing of A's on disk yet. */
      const two = await device({ leg, label: 'b-pull', remoteUrl: remote.url });
      expect(await two.filesystem.exists('bracket.scad')).toBe(false);

      const scheduler = two.scheduler();
      scheduler.start();
      /* The tree is not held behind the pull: B is rendering the (empty) local
       * checkout while the row says `Checking…`. */
      expect(selectSyncFacet(scheduler.getSnapshot()).state).toBe('checking');

      await vi.waitFor(
        () => {
          expect(selectSyncFacet(scheduler.getSnapshot()).state).toBe('backedUp');
        },
        { timeout: 30_000 },
      );

      /* A's file arrived through the fetch and the apply — no reload, no second
       * open, and B's branch is where A left it. */
      expect(await two.filesystem.readFile('bracket.scad', 'utf8')).toBe('cube([2, 2, 2]);\n');
      expect(await two.port.readRef(mainRef)).toBe(head);

      scheduler.stop();
    } finally {
      await remote.close();
    }
  }, 180_000);

  /*
   * W18 DEF-2 red pin (c): the second device holds a project it has never seen.
   *
   * Device A backs a project up — history *and* its chat record ref — and
   * device B is then a machine that has only the project's id and the remote:
   * an empty directory, an unborn `main`, nothing on disk. Opening is the whole
   * gesture. No chat turn runs on either device; the only thing B does is start
   * its scheduler, which is what the project route does on mount.
   */
  it('row 6 (red pin c): a device that has never held the project materializes it from the remote', async () => {
    const remoteRoot = await temporaryRoot('remote-only');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    try {
      const one = await device({
        leg,
        label: 'a-remote-only',
        remoteUrl: remote.url,
        files: {
          'bracket.scad': 'cube([7, 7, 7]);\n',
          'notes/readme.md': '# Bracket\n',
          [`${chatRecordsPath(chatId)}/chat.json`]: '{"name":"Bracket"}\n',
          [`${chatRecordsPath(chatId)}/events.jsonl`]: '{"type":"turn.start"}\n',
        },
      });
      const head = await record({
        device: one,
        files: { 'bracket.scad': 'cube([7, 7, 7]);\n', 'notes/readme.md': '# Bracket\n' },
        summary: 'Device A',
      });
      const namedVersion = await one.port.tag({
        name: 'v1',
        revisionId: revisionId(head),
        note: 'Device A named version',
        createdAt: 1_756_742_400_000,
      });
      const first = one.scheduler();
      first.start();
      first.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: head });
      await vi.waitFor(
        () => {
          expect(selectSyncFacet(first.getSnapshot()).state).toBe('backedUp');
        },
        { timeout: 30_000 },
      );
      first.stop();
      /* The remote now holds both sets: branch + named version, and the chat's own ref. */
      expect(await remote.git(['rev-parse', mainRef])).toBe(head);
      expect(await remote.git(['rev-parse', 'refs/tags/v1^{}'])).toBe(head);
      expect(await remote.git(['rev-parse', chatRef])).not.toBe('');

      const projectedChats: string[][] = [];
      const two = await device({
        leg,
        label: 'b-remote-only',
        remoteUrl: remote.url,
        onChatsProjected: (chatIds) => projectedChats.push([...chatIds]),
      });
      expect(await two.port.readRef(mainRef)).toBeUndefined();
      expect(await two.filesystem.exists('bracket.scad')).toBe(false);

      const second = two.scheduler();
      second.start();
      await vi.waitFor(
        () => {
          expect(selectSyncFacet(second.getSnapshot()).state).toBe('backedUp');
        },
        { timeout: 30_000 },
      );

      /* B's branch is A's, and every path the revision records is on B's disk
         with A's bytes — the live checkout, not only the graph. */
      expect(await two.port.readRef(mainRef)).toBe(head);
      expect(await two.port.listTags()).toEqual([namedVersion]);
      const recorded = await two.port.readTree(revisionId(head));
      expect(recorded?.entries().map(({ path }) => path)).toEqual(['bracket.scad', 'notes/readme.md']);
      for (const { path } of recorded?.entries() ?? []) {
        // oxlint-disable-next-line no-await-in-loop -- two files, compared in order.
        expect(await two.filesystem.readFile(path, 'utf8')).toBe(await one.filesystem.readFile(path, 'utf8'));
      }

      /* And the chats came with it: the fetch path writes the projection (A39,
         W17), so B has A's chat record and A's log segment under its own name. */
      expect(await two.filesystem.readFile(`${chatRecordsPath(chatId)}/chat.json`, 'utf8')).toBe(
        '{"name":"Bracket"}\n',
      );
      expect(
        await two.filesystem.readFile(`${chatRecordsPath(chatId)}/${chatSegmentPath('device-a-remote-only')}`, 'utf8'),
      ).toBe('{"type":"turn.start"}\n');
      expect(projectedChats).toEqual([[chatId]]);

      second.stop();
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('row 7: a successful chat projection notifies even when a sibling fails, and retry keeps both', async () => {
    const remoteRoot = await temporaryRoot('remote-partial-chat');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    const firstChatId = 'chat-a';
    const secondChatId = 'chat-b';
    try {
      const one = await device({
        leg,
        label: 'a-partial-chat',
        remoteUrl: remote.url,
        files: {
          'bracket.scad': 'cube([8, 8, 8]);\n',
          [`${chatRecordsPath(firstChatId)}/chat.json`]: '{"name":"First"}\n',
          [`${chatRecordsPath(firstChatId)}/events.jsonl`]: '{"type":"first"}\n',
          [`${chatRecordsPath(secondChatId)}/chat.json`]: '{"name":"Second"}\n',
          [`${chatRecordsPath(secondChatId)}/events.jsonl`]: '{"type":"second"}\n',
        },
      });
      const head = await record({
        device: one,
        files: { 'bracket.scad': 'cube([8, 8, 8]);\n' },
        summary: 'Two chats',
      });
      const source = one.scheduler();
      source.start();
      source.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'save', revisionId: head });
      await vi.waitFor(
        () => {
          expect(selectSyncFacet(source.getSnapshot()).state).toBe('backedUp');
        },
        { timeout: 30_000 },
      );
      source.stop();

      const firstWritten = Promise.withResolvers<void>();
      let firstWrites = 0;
      let failSecond = true;
      const projectedChats: string[][] = [];
      const two = await device({
        leg,
        label: 'b-partial-chat',
        remoteUrl: remote.url,
        onChatsProjected: (chatIds) => projectedChats.push([...chatIds]),
        wrapFilesystem: (filesystem) =>
          Object.assign(Object.create(filesystem) as RootedFileSystem, {
            writeFile: async (path: string, content: Parameters<RootedFileSystem['writeFile']>[1]) => {
              if (path.startsWith(`${chatRecordsPath(secondChatId)}/`) && failSecond) {
                await firstWritten.promise;
                throw new Error('Second chat projection failed.');
              }
              await filesystem.writeFile(path, content);
              if (path.startsWith(`${chatRecordsPath(firstChatId)}/`)) {
                firstWrites += 1;
                if (firstWrites === 2) {
                  firstWritten.resolve();
                }
              }
            },
          }),
      });

      /*
       * R10: one record's failure is a *result*, not a rejected pull.
       *
       * A fetch that threw took the whole pull's history integration down with
       * it — the branch this device is on stayed behind because a chat could
       * not be written — so each projection got its own `try`/`catch` and
       * reports per ref. This row asserts that contract rather than the
       * rejection it used to (C21): the sibling that did land is on disk and
       * notified, the one that did not is named in `records`, and the retry
       * keeps both. The scheduler turns that entry into the durable projection
       * queue and renders its reason through `SyncFacet.error`.
       */
      const partial = await run<{ records: ReadonlyArray<{ name: string; status: string; reason?: string }> }>(
        two.actors.sync.fetch,
        { remote: 'tau', branch: 'main', deadlineMilliseconds: 25_000 },
      );
      expect(partial.records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: chatRefName(firstChatId), status: 'updated' }),
          expect.objectContaining({
            name: chatRefName(secondChatId),
            status: 'rejected',
            reason: 'Second chat projection failed.',
          }),
        ]),
      );
      await vi.waitFor(() => {
        expect(projectedChats).toEqual([[firstChatId]]);
      });
      expect(await two.filesystem.readFile(`${chatRecordsPath(firstChatId)}/chat.json`, 'utf8')).toBe(
        '{"name":"First"}\n',
      );
      expect(await two.filesystem.exists(`${chatRecordsPath(secondChatId)}/chat.json`)).toBe(false);

      failSecond = false;
      await run(two.actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 25_000 });
      expect(projectedChats).toEqual([[firstChatId], [secondChatId]]);
      expect(await two.filesystem.readFile(`${chatRecordsPath(firstChatId)}/chat.json`, 'utf8')).toBe(
        '{"name":"First"}\n',
      );
      expect(await two.filesystem.readFile(`${chatRecordsPath(secondChatId)}/chat.json`, 'utf8')).toBe(
        '{"name":"Second"}\n',
      );
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('row 8: a fresh device discovers remote branches and can switch to their exact tree', async () => {
    const remoteRoot = await temporaryRoot('remote-branches');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    try {
      const one = await device({ leg, label: 'a-branches', remoteUrl: remote.url, files: { 'main.ts': 'main\n' } });
      const main = await record({ device: one, files: { 'main.ts': 'main\n' }, summary: 'Main' });
      const feature = await one.port.writeRevision({
        parents: [revisionId(main)],
        tree: projectTree({ 'main.ts': 'feature\n', 'feature.ts': 'export const feature = true;\n' }),
        provenance: { source: 'user', actorId: 'actor-w13', createdAt: Date.UTC(2026, 8, 13, 10) },
        summary: { generated: 'Feature' },
      });
      await one.port.updateRef({
        name: 'refs/heads/feature',
        expectedHead: undefined,
        head: revisionId(feature.commitId),
      });
      await one.port.push({ remote: 'tau', atomic: true, refs: [{ name: mainRef }, { name: 'refs/heads/feature' }] });

      const two = await device({ leg, label: 'b-branches', remoteUrl: remote.url });
      const fetched = await run<{ branches: ReadonlyArray<{ name: string; head: string }> }>(two.actors.sync.fetch, {
        remote: 'tau',
        branch: 'main',
        deadlineMilliseconds: 25_000,
      });
      expect(fetched.branches).toEqual(
        expect.arrayContaining([
          { name: 'main', head: main },
          { name: 'feature', head: feature.commitId },
        ]),
      );
      await run(two.actors.branch.applySwitch, {
        projectId: 'project-1',
        branch: 'feature',
        checkoutId: undefined,
      });
      expect(await two.filesystem.readFile('main.ts', 'utf8')).toBe('feature\n');
      expect(await two.filesystem.readFile('feature.ts', 'utf8')).toBe('export const feature = true;\n');
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('row 9: generated exports stay off by default and an opted-in fresh device restores them without overwrite', async () => {
    const remoteRoot = await temporaryRoot('remote-evidence');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    const manifest = JSON.stringify({ syncLargeExports: true });
    try {
      const one = await device({
        leg,
        label: 'a-evidence',
        remoteUrl: remote.url,
        files: { 'main.ts': 'source\n', 'tau.json': manifest, 'exports/model.step': 'remote export\n' },
      });
      const main = await record({
        device: one,
        files: { 'main.ts': 'source\n', 'tau.json': manifest },
        summary: 'Opt in exports',
      });
      const pushed = await run<{ refs: ReadonlyArray<{ name: string; status: string; reason?: string }> }>(
        one.actors.sync.push,
        { remote: 'tau', branch: 'main', leases: {} },
      );
      expect(pushed.refs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: mainRef, status: 'updated' }),
          expect.objectContaining({ name: 'refs/tau/evidence/exports', status: 'updated' }),
        ]),
      );
      expect(await remote.git(['rev-parse', mainRef])).toBe(main);
      await expect(remote.git(['rev-parse', 'refs/tau/evidence/exports'])).resolves.toMatch(/^[\da-f]{40}$/u);

      const two = await device({ leg, label: 'b-evidence', remoteUrl: remote.url });
      await run(two.actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 25_000 });
      expect(await two.filesystem.readFile('exports/model.step', 'utf8')).toBe('remote export\n');

      await two.filesystem.writeFile('exports/model.step', 'local export\n');
      await run(two.actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 25_000 });
      expect(await two.filesystem.readFile('exports/model.step', 'utf8')).toBe('local export\n');

      const off = await device({
        leg,
        label: 'c-evidence-off',
        remoteUrl: remote.url,
        files: { 'tau.json': JSON.stringify({ syncLargeExports: false }) },
      });
      await run(off.actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 25_000 });
      expect(await off.filesystem.exists('exports/model.step')).toBe(false);
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('row 4 (red pin e): a device whose work the remote never took drains its queue on the next open', async () => {
    const remoteRoot = await temporaryRoot('remote-drain');
    const first = await startGitHttpBackend({ root: remoteRoot });
    const one = await device({
      leg,
      label: 'a-drain',
      remoteUrl: first.url,
      files: { 'bracket.scad': 'cube([3, 3, 3]);\n' },
    });
    /* The remote holds this device's first revision, so the two lines are
     * related and this device is simply *ahead* — the state of every device
     * that has unacknowledged work (review 2 R1). */
    const shared = await record({ device: one, files: { 'bracket.scad': 'cube([3, 3, 3]);\n' }, summary: 'Shared' });
    await one.port.push({ remote: 'tau', atomic: true, refs: [{ name: mainRef }] });
    const ahead = await record({
      device: one,
      files: { 'bracket.scad': 'cube([4, 4, 4]);\n' },
      summary: 'Unacknowledged',
      parent: shared,
    });
    await first.close();

    const offline = one.scheduler();
    offline.start();
    offline.send({ type: 'revisionMinted', checkoutId: 'live', trigger: 'close', revisionId: ahead });
    await vi.waitFor(
      async () => {
        const queued = await queueOf(one);
        expect(queued.entries.map((entry) => entry.ref)).toEqual([mainRef]);
      },
      { timeout: 30_000 },
    );
    offline.stop();

    const second = await startGitHttpBackend({ root: remoteRoot });
    try {
      await one.port.setRemote({ name: 'tau', url: second.url });

      /* The whole of D28's "retried on the next open", online: the open pulls,
       * finds nothing to integrate, and the queue is what it pushes first. */
      const reopened = one.scheduler();
      reopened.start();
      await vi.waitFor(
        () => {
          expect(selectSyncFacet(reopened.getSnapshot()).state).toBe('backedUp');
        },
        { timeout: 30_000 },
      );

      expect(await second.git(['rev-parse', mainRef])).toBe(ahead);
      const drained = await queueOf(one);
      expect(drained.entries).toEqual([]);
      expect(selectSyncFacet(reopened.getSnapshot())).toMatchObject({ pendingCount: 0, conflictRef: undefined });
      reopened.stop();
    } finally {
      await second.close();
    }
  }, 180_000);

  it('row 10: a branch the remote has never had is pushed on open, not read as backed up (D38)', async () => {
    const remoteRoot = await temporaryRoot('remote-new-branch');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    try {
      /* An import writes its setup revision straight to the ref: nothing is minted or queued. */
      const one = await device({ leg, label: 'a-new-branch', remoteUrl: remote.url, files: { 'main.ts': 'setup\n' } });
      const setup = await record({ device: one, files: { 'main.ts': 'setup\n' }, summary: 'Setup' });

      const opened = one.scheduler();
      opened.start();
      await vi.waitFor(
        async () => {
          expect(selectSyncFacet(opened.getSnapshot()).state).toBe('backedUp');
          expect(await remote.git(['rev-parse', mainRef])).toBe(setup);
        },
        { timeout: 30_000 },
      );
      opened.stop();
    } finally {
      await remote.close();
    }
  }, 180_000);

  /*
   * D54: a lease is the head this device integrated, not the head it last saw.
   * A fetch records the remote's head before any merge runs, and a merge that
   * does not happen (open files mid-save) left that lease in place — so the
   * next push, forced under a lease that still matched, overwrote the remote's
   * own commit. Observed live against GitHub on 2026-09-25.
   */
  it('row 11: a push never overwrites a remote commit this device fetched but did not merge (D54)', async () => {
    const remoteRoot = await temporaryRoot('remote-unmerged');
    const remote = await startGitHttpBackend({ root: remoteRoot });
    try {
      const one = await device({ leg, label: 'a-unmerged', remoteUrl: remote.url, files: { 'part.scad': 'a\n' } });
      const shared = await record({ device: one, files: { 'part.scad': 'a\n' }, summary: 'Shared' });
      await one.port.push({ remote: 'tau', atomic: true, refs: [{ name: mainRef }] });
      /* Someone else's commit on the remote, on top of the shared one. */
      const theirs = await remote.git([
        '-c',
        'user.name=Remote',
        '-c',
        'user.email=remote@example.com',
        'commit-tree',
        `${shared}^{tree}`,
        '-p',
        shared,
        '-m',
        'Remote edit',
      ]);
      await remote.git(['update-ref', mainRef, theirs, shared]);
      const mine = await record({ device: one, files: { 'part.scad': 'b\n' }, summary: 'Mine', parent: shared });

      const fetched = await run<{ leases: Readonly<Record<string, string>>; integration: string }>(
        one.actors.sync.fetch,
        { remote: 'tau', branch: 'main', deadlineMilliseconds: 25_000 },
      );
      expect(fetched).toMatchObject({ integration: 'diverged', leases: { [mainRef]: theirs } });

      const pushed = await run<{ refs: ReadonlyArray<{ name: string; status: string; reason?: string }> }>(
        one.actors.sync.push,
        { remote: 'tau', branch: 'main', leases: fetched.leases },
      );
      expect(pushed.refs).toContainEqual(
        expect.objectContaining({ name: mainRef, status: 'rejected', reason: 'leaseLost' }),
      );
      expect(await remote.git(['rev-parse', mainRef])).toBe(theirs);
      expect(await one.port.readRef(mainRef)).toBe(mine);
    } finally {
      await remote.close();
    }
  }, 180_000);
});

/*
 * The pull's own deadline, on the leg that speaks HTTP itself (P36).
 *
 * One row, not a leg pair: the native leg spawns `git`, whose transport has its
 * own timeouts, and the machine leaves `opening` on the deadline either way —
 * what is asserted here is the half that was missing, the *request* ending.
 */
describe.runIf(gitOnPath)('the open pull’s deadline over isomorphic-git', () => {
  it('row 5 (red pin g): a remote that never answers has its request aborted, and the queue takes over', async () => {
    const remoteRoot = await temporaryRoot('remote-hold');
    const remote = await startGitHttpBackend({ root: remoteRoot, hold: true });
    try {
      const one = await device({
        leg: legs[0]!,
        label: 'a-hold',
        remoteUrl: remote.url,
        files: { 'bracket.scad': 'cube([5, 5, 5]);\n' },
      });
      await record({ device: one, files: { 'bracket.scad': 'cube([5, 5, 5]);\n' }, summary: 'Held' });

      /* The signal the scheduler hands the port, at the value F16 gives it. */
      await expect(one.port.fetch({ remote: 'tau', signal: AbortSignal.timeout(150) })).rejects.toThrow(
        /abort|signal|time/iu,
      );

      /* And the machine's own exit: the pull is abandoned, what is owed is
       * recorded, and the project gets on with itself. */
      const scheduler = createActor(syncMachine.provide({ actors: one.actors.sync }), {
        input: {
          projectId: 'project-1',
          debounceMilliseconds: 5,
          retryMilliseconds: 30_000,
          pullRenderMilliseconds: 20,
          pullDeadlineMilliseconds: 150,
        },
      });
      scheduler.start();
      await vi.waitFor(
        () => {
          expect(selectSyncFacet(scheduler.getSnapshot()).state).toBe('queued');
        },
        { timeout: 30_000 },
      );
      expect(selectSyncFacet(scheduler.getSnapshot()).error).toContain('did not answer in time');
      scheduler.stop();
    } finally {
      await remote.close();
    }
  }, 180_000);
});
