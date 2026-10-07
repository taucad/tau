/**
 * The operation log and *Undo*, end to end (charter W7, D15).
 *
 * | Row | Acceptance |
 * | --- | --- |
 * | 1 | restore → save → undo → undo: four History rows, and the head's tree is the pre-restore tree |
 * | 2 | two devices, one line: A undoes its own operation after B minted on top — the inverse leaves B's bytes alone, or refuses with `UNDO_CONFLICT` and moves nothing |
 * | 3 | a crash between a mint and its push: the next session's queue names the head from the log, and its push lands it |
 * | 4 | the log reaches the remote, and a remote that refuses it still takes the history push (I8) |
 * | 5 | no pushed record lists an account's operations and a pseudonym's under one device |
 *
 * Rows 2–4 speak to a real `git http-backend` through the native leg, where
 * `git` is on `PATH`; rows 1 and 5 need no remote.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createActor } from 'xstate';
import { afterAll, describe, expect, it } from 'vitest';

import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { opsRefPrefix } from '#ops-ref.js';
import { selectRevisionStatus } from '#project-revisions.machine.js';
import type { RestoreMachineEmitted } from '#restore.machine.js';
import { remoteTrackingRef } from '#remotes.js';
import type { RevisionActor, RevisionUserActor } from '#revision-authority.js';
import { createProjectRevisionsActor, createRevisionActors } from '#revision-effects.js';
import type { RevisionActorsOptions, RevisionFileSystem } from '#revision-effects.js';
import type { RevisionPort } from '#revision-port.js';
import { readRevisionLog } from '#revision-verbs.js';
import type { SyncPushActorOutput } from '#sync.machine.js';
import type { SyncQueueRecord } from '#sync.types.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';
import { gitToolchainOnPath } from '#test/native-git-harness.js';

const author = { name: 'Tau', email: 'noreply@tau.new' };
const mainRef = 'refs/heads/main';
const ada: RevisionUserActor = { kind: 'user', id: 'user-ada', name: 'Ada' };

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map(async (root) => rm(root, { recursive: true, force: true })));
});

const temporaryRoot = async (label: string): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), `tau-w7-${label}-`));
  roots.push(root);
  return root;
};

const decoder = new TextDecoder();

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

type Project = Readonly<{ root: string; filesystem: RevisionFileSystem; port: RevisionPort }>;

/** One project directory and a port over it: the browser's leg, or a disk host's with a remote. */
const project = async (
  label: string,
  files: Readonly<Record<string, string>>,
  remoteUrl?: string,
): Promise<Project> => {
  const root = await temporaryRoot(label);
  const filesystem = new NodeFsProvider(root);
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, in order.
    await filesystem.writeFile(path, content);
  }
  const port =
    remoteUrl === undefined
      ? createIsomorphicGitRevisionPort({ filesystem, checkouts: { projectId: 'project-1', root: () => filesystem } })
      : createNativeGitRevisionPort({
          repositoryPath: root,
          remoteCredential: () => ({ repositoryUrl: remoteUrl, authorization: 'Bearer session-token' }),
        });
  await port.init({ author });
  if (remoteUrl !== undefined) {
    await port.setRemote({ name: 'tau', url: remoteUrl });
  }
  return { root, filesystem, port };
};

/** Mint the checkout's files onto `main` through the effects, the way a `save` cut does. */
const mint = async (
  actors: ReturnType<typeof createRevisionActors>,
  port: RevisionPort,
  trigger: 'save' | 'close' = 'save',
): Promise<string> => {
  const expectedHead = await port.readRef('main');
  const cut = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, { checkoutId: 'live', trigger });
  const written = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
    checkoutId: 'live',
    cutId: cut.cutId,
    treeId: cut.treeId,
    parents: expectedHead === undefined ? [] : [expectedHead],
    trigger,
    leaseIds: [],
  });
  await run(actors.checkout.casHead, {
    checkoutId: 'live',
    branch: 'main',
    expectedHead,
    head: written.revisionId,
  });
  return written.revisionId;
};

/** The whole revision tree: the root and its children, as a host runs it. */
const startTree = async (
  target: Project,
  extra: Partial<RevisionActorsOptions> = {},
): Promise<
  Readonly<{
    actor: ReturnType<typeof createProjectRevisionsActor>['actor'];
    save: () => Promise<string>;
    undo: () => Promise<RestoreMachineEmitted>;
    restore: (revision: string) => Promise<string>;
  }>
> => {
  const { actor } = createProjectRevisionsActor({
    port: target.port,
    projectId: 'project-1',
    filesystem: async () => target.filesystem,
    actor: () => ada,
    ...extra,
  });
  actor.start();
  await expect.poll(() => actor.getSnapshot().context.registrySettled, { timeout: 10_000 }).toBe(true);
  const restoreChild = () => {
    const child = actor.getSnapshot().children.restore;
    if (child === undefined) {
      throw new Error('The tree has no restore child.');
    }
    return child;
  };
  const settledOn = async (from: string | undefined): Promise<string> => {
    await expect.poll(async () => target.port.readRef('main'), { timeout: 20_000 }).not.toBe(from);
    await expect.poll(() => restoreChild().getSnapshot().value, { timeout: 20_000 }).toBe('idle');
    return String(await target.port.readRef('main'));
  };
  return {
    actor,
    save: async () => {
      const from = await target.port.readRef('main');
      const checkoutId = actor.getSnapshot().context.selectedCheckoutId ?? 'live';
      actor.send({ type: 'cut', requestId: `save:${String(from)}`, trigger: 'save', checkoutId, leaseIds: [] });
      await expect.poll(async () => target.port.readRef('main'), { timeout: 20_000 }).not.toBe(from);
      return String(await target.port.readRef('main'));
    },
    /* The verb's one answer: the toast it emits when it lands or refuses. */
    undo: async () => {
      const answer = Promise.withResolvers<RestoreMachineEmitted>();
      const child = restoreChild();
      const subscriptions = [
        child.on('toast.undone', (event) => {
          answer.resolve(event);
        }),
        child.on('toast.error', (event) => {
          answer.resolve(event);
        }),
      ];
      child.send({ type: 'undoOperation' });
      const toast = await answer.promise;
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      await expect.poll(() => child.getSnapshot().value, { timeout: 20_000 }).toBe('idle');
      return toast;
    },
    restore: async (revision) => {
      const from = await target.port.readRef('main');
      restoreChild().send({ type: 'restore', revisionId: revision });
      await expect.poll(() => restoreChild().getSnapshot().value, { timeout: 20_000 }).toBe('confirming');
      restoreChild().send({ type: 'confirm' });
      return settledOn(from);
    },
  };
};

describe('Undo through the tree (D15)', () => {
  it('row 1: restore → save → undo → undo leaves four rows and the pre-restore tree', async () => {
    const target = await project('four-rows', { 'main.ts': 'export const size = 1;\n' });
    const tree = await startTree(target);
    const first = await tree.save();
    await target.filesystem.writeFile('main.ts', 'export const size = 2;\n');
    await target.filesystem.writeFile('extra.txt', 'added later\n');
    const beforeRestore = await tree.save();

    const restored = await tree.restore(first);
    await target.filesystem.writeFile('main.ts', 'export const size = 3;\n');
    const saved = await tree.save();
    await expect.poll(() => tree.actor.getSnapshot().children.restore?.getSnapshot().context.canUndo).toBe(true);
    const firstUndo = await tree.undo();
    const secondUndo = await tree.undo();

    expect(firstUndo).toEqual({ type: 'toast.undone', revisionNumber: 4 });
    expect(secondUndo).toEqual({ type: 'toast.undone', revisionNumber: 3 });
    const rows = await readRevisionLog(target.port, { branch: 'main' });
    expect(rows.map((row) => [row.revisionNumber, row.summary])).toEqual([
      [6, 'Undid Rev 3'],
      [5, 'Undid Rev 4'],
      [4, 'Saved changes (save)'],
      [3, 'Restored Rev 1'],
      [2, 'Saved changes (save)'],
      [1, 'Saved changes (save)'],
    ]);
    expect(rows.slice(2).map((row) => row.revisionId)).toEqual([saved, restored, beforeRestore, first]);
    const [head] = rows;
    const pre = await target.port.readRevision(revisionId(beforeRestore));
    expect(head?.treeId).toBe(pre?.treeId);
    expect(await target.filesystem.readFile('main.ts', 'utf8')).toBe('export const size = 2;\n');
    expect(await target.filesystem.readFile('extra.txt', 'utf8')).toBe('added later\n');
    tree.actor.stop();
  }, 90_000);

  it('row 5: an account and its pseudonym never share a record device', async () => {
    const target = await project('privacy', { 'main.ts': 'export const size = 1;\n' });
    const pseudonym: RevisionUserActor = { kind: 'user', id: 'anon:9c1d', anonymous: true };
    let current: RevisionActor = ada;
    const actors = createRevisionActors({
      port: target.port,
      projectId: 'project-1',
      filesystem: async () => target.filesystem,
      deviceId: () => 'laptop-7',
      actor: () => current,
    });
    await mint(actors, target.port);
    current = pseudonym;
    await target.filesystem.writeFile('main.ts', 'export const size = 2;\n');
    await mint(actors, target.port);

    /* The log commit is queued behind the save (B1); the push reads it once it lands. */
    await expect
      .poll(async () => {
        const queued = await target.port.listRefs(opsRefPrefix);
        return queued.length;
      })
      .toBe(2);
    const logs = await target.port.listRefs(opsRefPrefix);
    const texts = await Promise.all(
      logs.map(async (log) => {
        const tree = await target.port.readTree(log.head);
        return (
          tree
            ?.entries()
            .map((file) => decoder.decode(file.content))
            .join('') ?? ''
        );
      }),
    );
    /* Each log names one form, and no log name is the host's device id. */
    expect(
      texts
        .map((text) => `${String(text.includes(ada.id))}/${String(text.includes(pseudonym.id))}`)
        .toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(['false/true', 'true/false']);
    expect(logs.every((log) => !log.name.includes('laptop'))).toBe(true);
    /* The device file is a host's own and in no tree: not a log's, not the history's. */
    const main = await target.port.readRef('main');
    const trees = await Promise.all(
      [...logs.map((log) => log.head), ...(main === undefined ? [] : [main])].map(async (head) =>
        target.port.readTree(head),
      ),
    );
    expect(
      trees
        .flatMap((tree) => tree?.entries().map((file) => file.path) ?? [])
        .filter((path) => path.includes('ops-devices')),
    ).toEqual([]);
  }, 60_000);
});

describe.runIf(gitToolchainOnPath)('the operation log over git http-backend (D15)', () => {
  it('row 2: an undo after another device minted on top reverses only its own delta', async () => {
    const remote = await startGitHttpBackend({ root: await temporaryRoot('remote-two') });
    try {
      const a = await project('two-a', { 'a.txt': 'alpha 1\n', 'b.txt': 'bravo 1\n' }, remote.url);
      const tree = await startTree(a);
      await tree.save();
      await a.filesystem.writeFile('a.txt', 'alpha 2\n');
      const mine = await tree.save();
      await expect.poll(async () => remote.git(['rev-parse', mainRef]), { timeout: 30_000 }).toBe(mine);

      /* Device B: fetch A's line, change only `b.txt`, push on top. */
      const b = await project('two-b', {}, remote.url);
      await b.port.fetch({ remote: 'tau' });
      const base = revisionId(String(await b.port.readRef(remoteTrackingRef('tau', mainRef))));
      const baseTree = await b.port.readTree(base);
      const theirs = await b.port.writeRevision({
        parents: [base],
        tree: new ImmutableRevisionTree([
          ['a.txt', baseTree!.get('a.txt')!],
          ['b.txt', new TextEncoder().encode('bravo 2 from B\n')],
        ]),
        provenance: { source: 'user', actorId: 'user-bea', createdAt: Date.UTC(2026, 8, 26) },
        summary: { generated: 'B edits b.txt' },
      });
      await b.port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(theirs.commitId) });
      await b.port.push({ remote: 'tau', refs: [{ name: mainRef, expected: base }] });

      tree.actor.send({ type: 'sync', event: { type: 'remoteMoved', generation: 1, refs: [mainRef] } });
      await expect.poll(async () => a.port.readRef('main'), { timeout: 30_000 }).toBe(theirs.commitId);
      await expect
        .poll(async () => a.filesystem.readFile('b.txt', 'utf8'), { timeout: 30_000 })
        .toBe('bravo 2 from B\n');
      /* The checkout has adopted the arrived head, as a person would see it do. */
      await expect
        .poll(() => selectRevisionStatus(tree.actor.getSnapshot()).headRevisionId, { timeout: 30_000 })
        .toBe(theirs.commitId);

      const answer = await tree.undo();

      expect(answer).toMatchObject({ type: 'toast.undone' });
      const head = String(await a.port.readRef('main'));
      const record = await a.port.readRevision(revisionId(head));
      expect(record?.parents).toEqual([theirs.commitId]);
      const undone = await a.port.readTree(revisionId(head));
      expect(decoder.decode(undone?.get('a.txt'))).toBe('alpha 1\n');
      /* B's bytes, exactly: the inverse of A's own delta never reaches them. */
      expect(decoder.decode(undone?.get('b.txt'))).toBe('bravo 2 from B\n');
      tree.actor.stop();
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('row 2b: an undo whose inverse overlaps the later revision refuses and moves nothing', async () => {
    const remote = await startGitHttpBackend({ root: await temporaryRoot('remote-overlap') });
    try {
      const a = await project('overlap-a', { 'a.txt': 'alpha 1\n' }, remote.url);
      const tree = await startTree(a);
      await tree.save();
      await a.filesystem.writeFile('a.txt', 'alpha 2\n');
      const mine = await tree.save();
      await expect.poll(async () => remote.git(['rev-parse', mainRef]), { timeout: 30_000 }).toBe(mine);

      const b = await project('overlap-b', {}, remote.url);
      await b.port.fetch({ remote: 'tau' });
      const base = revisionId(String(await b.port.readRef(remoteTrackingRef('tau', mainRef))));
      const theirs = await b.port.writeRevision({
        parents: [base],
        tree: new ImmutableRevisionTree([['a.txt', new TextEncoder().encode('alpha 3 from B\n')]]),
        provenance: { source: 'user', actorId: 'user-bea', createdAt: Date.UTC(2026, 8, 26) },
        summary: { generated: 'B edits a.txt' },
      });
      await b.port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(theirs.commitId) });
      await b.port.push({ remote: 'tau', refs: [{ name: mainRef, expected: base }] });
      tree.actor.send({ type: 'sync', event: { type: 'remoteMoved', generation: 1, refs: [mainRef] } });
      await expect.poll(async () => a.port.readRef('main'), { timeout: 30_000 }).toBe(theirs.commitId);
      await expect
        .poll(async () => a.filesystem.readFile('a.txt', 'utf8'), { timeout: 30_000 })
        .toBe('alpha 3 from B\n');
      await expect
        .poll(() => selectRevisionStatus(tree.actor.getSnapshot()).headRevisionId, { timeout: 30_000 })
        .toBe(theirs.commitId);

      const answer = await tree.undo();

      expect(answer).toMatchObject({ type: 'toast.error', code: 'UNDO_CONFLICT' });
      expect(await a.port.readRef('main')).toBe(theirs.commitId);
      expect(await a.filesystem.readFile('a.txt', 'utf8')).toBe('alpha 3 from B\n');
      tree.actor.stop();
    } finally {
      await remote.close();
    }
  }, 180_000);

  it('row 3: a crash between a mint and its push is replayed from the log', async () => {
    const remote = await startGitHttpBackend({ root: await temporaryRoot('remote-crash') });
    try {
      const target = await project('crash', { 'main.ts': 'export const size = 1;\n' }, remote.url);
      const options = {
        port: target.port,
        projectId: 'project-1',
        filesystem: async () => target.filesystem,
        actor: () => ada,
      } satisfies RevisionActorsOptions;
      const head = await mint(createRevisionActors(options), target.port);

      /* The process died here: no push ran, so no queue entry was ever written. */
      const reopened = createRevisionActors(options);
      const queue = await run<SyncQueueRecord>(reopened.sync.readPending, { projectId: 'project-1' });

      expect(queue.entries).toEqual([
        expect.objectContaining({ ref: mainRef, operation: 'push', remote: 'tau', head, expected: undefined }),
      ]);
      await run<SyncPushActorOutput>(reopened.sync.push, { remote: 'tau', branch: 'main', leases: {} });
      expect(await remote.git(['rev-parse', mainRef])).toBe(head);
      /* Acknowledged now, so a later open owes nothing. */
      const after = await run<SyncQueueRecord>(createRevisionActors(options).sync.readPending, {
        projectId: 'project-1',
      });
      expect(after.entries).toEqual([]);
    } finally {
      await remote.close();
    }
  }, 120_000);

  it('row 4: the log reaches the remote beside the history it describes', async () => {
    const remote = await startGitHttpBackend({ root: await temporaryRoot('remote-ops') });
    try {
      const target = await project('ops', { 'main.ts': 'export const size = 1;\n' }, remote.url);
      const actors = createRevisionActors({
        port: target.port,
        projectId: 'project-1',
        filesystem: async () => target.filesystem,
        actor: () => ada,
      });
      const head = await mint(actors, target.port);

      /* The push waits for the queued log commit (B1), so the log it offers is the one read after it. */
      await run<SyncPushActorOutput>(actors.sync.push, { remote: 'tau', branch: 'main', leases: {} });
      const [log] = await target.port.listRefs(opsRefPrefix);
      expect(log).toBeDefined();

      expect(await remote.git(['rev-parse', mainRef])).toBe(head);
      expect(await remote.git(['rev-parse', String(log?.name)])).toBe(log?.head);
    } finally {
      await remote.close();
    }
  }, 120_000);

  it('row 4b: a remote that refuses the log still takes the history push (I8)', async () => {
    const device = '0f0e0d0c-0b0a-4908-8706-050403020100';
    const refused = `${opsRefPrefix}/${device}`;
    const remote = await startGitHttpBackend({ root: await temporaryRoot('remote-ops-refused'), refusedRef: refused });
    try {
      const target = await project('ops-refused', { 'main.ts': 'export const size = 1;\n' }, remote.url);
      /* This host's record device for Ada, chosen before anything is recorded. */
      await target.filesystem.writeFile(
        '.git/ops-devices.json',
        `${JSON.stringify({ version: 1, devices: { [ada.id]: device } })}\n`,
      );
      const actors = createRevisionActors({
        port: target.port,
        projectId: 'project-1',
        filesystem: async () => target.filesystem,
        actor: () => ada,
      });
      const head = await mint(actors, target.port);

      const pushed = await run<SyncPushActorOutput>(actors.sync.push, { remote: 'tau', branch: 'main', leases: {} });

      expect(await remote.git(['rev-parse', mainRef])).toBe(head);
      expect(pushed.refs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: mainRef, status: 'updated' }),
          expect.objectContaining({ name: refused, status: 'rejected' }),
        ]),
      );
    } finally {
      await remote.close();
    }
  }, 120_000);
});
