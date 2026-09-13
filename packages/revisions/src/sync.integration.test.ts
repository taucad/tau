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
 * | 2 | **red pin (a)** | a `close` revision that could not be pushed is in `.tau/revisions/sync-pending`, and a fresh actor retries it first |
 * | 3 | **red pin (d)** | device B's open pull brings device A's file into B's checkout with no reload, and B renders before the pull answers |
 * | 4 | **red pin (e)** | a device that is merely *ahead* of the remote drains its durable queue on the next open, online, and never reports a conflict (review 2 R1) |
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
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import { createActor } from 'xstate';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { chatRecordsPath } from '#chat-ref.js';
import { createRevisionHttpClient } from '#http-client.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { createRevisionActors } from '#revision-effects.js';
import { selectSyncFacet, syncMachine } from '#sync.machine.js';
import type { SyncQueueRecord } from '#sync.machine.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import type { RevisionPort } from '#revision-port.js';

const author = { name: 'Tau', email: 'tau@example.com' };
const chatId = 'c1';
const chatRef = `refs/tau/chats/${chatId}`;
const mainRef = 'refs/heads/main';
const syncQueuePath = '.tau/revisions/sync-pending';

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

type Leg = Readonly<{ name: string; port: (root: string, filesystem: RootedFileSystem) => RevisionPort }>;

const legs: readonly Leg[] = [
  {
    name: 'isomorphic-git',
    port: (_root, filesystem) =>
      createIsomorphicGitRevisionPort({
        filesystem,
        /* The browser leg reaches a remote only through a client (W11b §1.2). */
        http: createRevisionHttpClient(),
        checkouts: { projectId: 'project-1', root: () => filesystem },
      }),
  },
  { name: 'native git', port: (root) => createNativeGitRevisionPort({ repositoryPath: root }) },
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
  const port = leg.port(root, filesystem);
  await port.init({ author });
  if (remoteUrl !== undefined) {
    await port.setRemote({ name: 'tau', url: remoteUrl });
  }
  const actors = createRevisionActors({
    port,
    projectId: 'project-1',
    authorityEpoch: `epoch-${label}`,
    filesystem: () => filesystem,
    deviceId: () => `device-${label}`,
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
      expect(selectSyncFacet(scheduler.getSnapshot())).toMatchObject({ state: 'queued', pendingCount: 1 });

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
    await vi.waitFor(() => {
      expect(second.getSnapshot().context.pending.map((entry) => entry.ref)).toEqual([mainRef]);
    });
    expect(selectSyncFacet(second.getSnapshot())).toMatchObject({ state: 'queued', pendingCount: 1 });
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
