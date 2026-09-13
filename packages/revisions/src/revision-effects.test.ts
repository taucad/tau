/**
 * The effects behind the machines, over a real port and a real directory.
 *
 * These are the claims the deleted `TurnRevisionRecorder` suite held that
 * survive the move: what a capture may contain, that applying a tree verifies
 * exactly the paths it wrote — refusing a write or a deletion that silently did
 * not land, and settling anyway when something else writes its own files
 * meanwhile — that an overlapping edit is a conflicted turn and a structural one
 * is too rather than a dead actor, and the lease file's own lifecycle. The
 * tree-hash claim is new and load-bearing: the I5 gate compares a host-computed
 * cut against an engine-recorded head, so the two have to be the same id.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { ImmutableRevisionTree, revisionId } from '@taucad/filesystem/revisions';
import type { RootedFileSystem } from '@taucad/filesystem';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { materializeConflict, readConflictTerms } from '#revision-conflict.js';
import { generatedIgnorePath } from '#workspace-config.js';
import { restoreMachine } from '#restore.machine.js';
import { createRevisionActors, revisionTreeId } from '#revision-effects.js';
import type { RevisionActors } from '#revision-effects.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type Fixture = {
  readonly root: string;
  readonly filesystem: RootedFileSystem;
  readonly port: ReturnType<typeof createIsomorphicGitRevisionPort>;
  readonly actors: RevisionActors;
};

/**
 * One project directory with a port and an actor set over it.
 *
 * @param files - Files to write before the port is constructed.
 * @param wrap - Wraps the tree the *actors* write through; the port keeps the real one.
 * @returns The fixture the cases drive.
 */
const fixture = async (
  files: Readonly<Record<string, string>> = {},
  wrap: (filesystem: RootedFileSystem) => RootedFileSystem = (filesystem) => filesystem,
): Promise<Fixture> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-revision-effects-'));
  roots.push(root);
  const filesystem = new NodeFsProvider(root);
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, written in order.
    await filesystem.writeFile(path, content);
  }
  const port = createIsomorphicGitRevisionPort({
    filesystem,
    checkouts: { projectId: 'project-1', root: () => filesystem },
  });
  const actors = createRevisionActors({
    port,
    projectId: 'project-1',
    authorityEpoch: 'epoch-1',
    filesystem: () => wrap(filesystem),
  });
  return { root, filesystem, port, actors };
};

/** Run one injected promise actor the way its machine would. */
/* Rejection reasons must be real errors; the snapshot's is typed loosely. */
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

describe('the tree a cut hashes', () => {
  it('computes the object id the engine itself records', async () => {
    const { port, actors } = await fixture({
      'main.ts': 'export const size = 1;\n',
      'src/nested/deep.txt': 'nested\n',
      'src/a.txt': 'a\n',
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });

    const cut = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const written = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: cut.cutId,
      treeId: cut.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });

    /* `writeRevision` refuses a mismatch, so reaching here is already the
     * claim; the assertion states it where a reader can see it. */
    const record = await port.readRevision(revisionId(written.revisionId));
    expect(record?.treeId).toBe(cut.treeId);
    expect(cut.treeId).toMatch(/^[\da-f]{40}$/u);
  }, 30_000);

  it('leaves out every path the registry does not version', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await filesystem.writeFile('node_modules/left/index.js', 'module.exports = 1;\n');
    await filesystem.writeFile('.tau/runs/run-1.json', '{}\n');
    await filesystem.writeFile('.tau/cache/blob', 'cached\n');
    await filesystem.writeFile('thumbnail.webp', 'not really an image\n');

    const cut = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const written = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: cut.cutId,
      treeId: cut.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });
    const tree = await port.readTree(revisionId(written.revisionId));

    expect(
      tree
        ?.entries()
        .map(({ path }) => path)
        .toSorted(),
    ).toEqual(['.gitignore', 'main.ts']);
  }, 30_000);

  it('refuses a capture whose paths differ only by case', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    /* Only a case-sensitive disk can even produce this; on a case-insensitive
     * one the second write replaces the first and there is nothing to refuse. */
    await filesystem.writeFile('Main.ts', 'export const size = 2;\n');
    const entries = await filesystem.readdir('');

    if (!entries.includes('Main.ts') || !entries.includes('main.ts')) {
      /* A case-insensitive filesystem: the hazard cannot occur here. */
      return;
    }
    await expect(run(actors.checkout.cut, { checkoutId: 'live', trigger: 'save' })).rejects.toThrow(
      /differ only by case/u,
    );
  }, 30_000);
});

describe('a turn lease', () => {
  it('writes, reports every lease on its checkout, and retires idempotently', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });

    const first = await run<{ leaseIds: readonly string[] }>(actors.turn.writeLease, {
      runId: 'run-1',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'live',
      baseRevisionId: undefined,
    });
    expect(first.leaseIds).toEqual(['run-1']);

    /* Leases are plural: a second chat on the same checkout sees both, which is
     * the provenance set a settlement carries (AC9). */
    const second = await run<{ leaseIds: readonly string[] }>(actors.turn.writeLease, {
      runId: 'run-2',
      turnId: 'turn-2',
      chatId: 'chat-2',
      checkoutId: 'live',
      baseRevisionId: undefined,
    });
    /* This turn's own run first: the head of the set is the attribution a mint
     * records, and a directory read has no order of its own. */
    expect(second.leaseIds).toEqual(['run-2', 'run-1']);
    expect(JSON.parse(await filesystem.readFile('.tau/runs/run-2.json', 'utf8'))).toMatchObject({
      runId: 'run-2',
      turnId: 'turn-2',
      chatId: 'chat-2',
      checkoutId: 'live',
      authorityEpoch: 'epoch-1',
    });

    await run(actors.turn.retireLease, { runId: 'run-2', turnId: 'turn-2', checkoutId: 'live', outcome: 'finalized' });
    /* Retiring one that is already gone resolves: a rejection here would reach
     * the host as a user-visible failure for a non-event (R17). */
    await run(actors.turn.retireLease, { runId: 'run-2', turnId: 'turn-2', checkoutId: 'live', outcome: 'finalized' });
    expect(await filesystem.exists('.tau/runs/run-2.json')).toBe(false);
    expect(await filesystem.exists('.tau/runs/run-1.json')).toBe(true);
  }, 30_000);

  it('sweeps only the leases a superseded authority wrote, and lists the rest on the record', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await filesystem.writeFile(
      '.tau/runs/run-dead.json',
      JSON.stringify({
        runId: 'run-dead',
        turnId: 'turn-dead',
        chatId: 'chat-dead',
        checkoutId: 'live',
        authorityEpoch: 'epoch-0',
        startedAt: 1,
      }),
    );
    await run(actors.turn.writeLease, {
      runId: 'run-live',
      turnId: 'turn-live',
      chatId: 'chat-live',
      checkoutId: 'live',
      baseRevisionId: undefined,
    });

    const swept = await run<{ retiredRunIds: readonly string[] }>(actors.checkouts.sweepLeases, {
      projectId: 'project-1',
    });
    expect(swept.retiredRunIds).toEqual(['run-dead']);

    const registry = await run<{ checkouts: ReadonlyArray<{ id: string; leaseRunIds: readonly string[] }> }>(
      actors.checkouts.listCheckouts,
      { projectId: 'project-1' },
    );
    expect(registry.checkouts).toHaveLength(1);
    expect(registry.checkouts[0]).toMatchObject({ id: 'live', kind: 'live', leaseRunIds: ['run-live'] });
  }, 30_000);
});

describe('settling a turn', () => {
  it('applies the captured tree to the checkout and records it', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const base = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const baseRevision = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: base.cutId,
      treeId: base.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });

    await filesystem.writeFile('main.ts', 'export const size = 2;\n');
    const captured = await run<{ captureId: string }>(actors.turn.capture, { checkoutId: 'live', turnId: 'turn-1' });
    const merged = await run<{ status: string }>(actors.turn.merge, {
      checkoutId: 'live',
      captureId: captured.captureId,
      baseRevisionId: baseRevision.revisionId,
    });

    expect(merged.status).toBe('recorded');
    expect(await filesystem.readFile('main.ts', 'utf8')).toBe('export const size = 2;\n');
  }, 30_000);

  it('reports an overlapping edit as a conflict, and mints no revision', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const base = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const baseRevision = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: base.cutId,
      treeId: base.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });

    /* The ordinary conflict, not the structural one: the turn and the live tree
     * edited the same line of the same file from the same base. */
    await filesystem.writeFile('main.ts', 'export const size = 2; // the turn\n');
    const captured = await run<{ captureId: string }>(actors.turn.capture, { checkoutId: 'live', turnId: 'turn-1' });
    await filesystem.writeFile('main.ts', 'export const size = 3; // the workspace\n');
    const merged = await run<{ status: string }>(actors.turn.merge, {
      checkoutId: 'live',
      captureId: captured.captureId,
      baseRevisionId: baseRevision.revisionId,
    });

    expect(merged.status).toBe('conflicted');
    /* Nothing was written over the live tree: the turn conflicts and the
     * workspace keeps exactly what it had. (That a conflicted turn then asks for
     * no cut at all is `turn.machine`'s `retiring → conflicted` path.) */
    expect(await filesystem.readFile('main.ts', 'utf8')).toBe('export const size = 3; // the workspace\n');
  }, 30_000);

  it('refuses to publish when an applied write or deletion silently did not land', async () => {
    const swallowed = new Set(['notes.md']);
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' }, (real) =>
      Object.assign(Object.create(real) as RootedFileSystem, {
        writeFile: async (path: string, content: Parameters<RootedFileSystem['writeFile']>[1]) =>
          swallowed.has(path) ? undefined : real.writeFile(path, content),
        unlink: async (path: string) => (swallowed.has(path) ? undefined : real.unlink(path)),
      }),
    );
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const base = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const baseRevision = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: base.cutId,
      treeId: base.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });

    /* The turn adds a file; the live tree does not have it, so settling has to
     * write it — and this checkout accepts the call and keeps nothing. */
    await filesystem.writeFile('notes.md', 'the turn wrote this\n');
    const captured = await run<{ captureId: string }>(actors.turn.capture, { checkoutId: 'live', turnId: 'turn-1' });
    await filesystem.unlink('notes.md');

    await expect(
      run(actors.turn.merge, {
        checkoutId: 'live',
        captureId: captured.captureId,
        baseRevisionId: baseRevision.revisionId,
      }),
    ).rejects.toThrow(/did not keep the paths this write applied: notes\.md/u);
  }, 30_000);

  it('settles when something else writes its own files between the merge and its verification', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' }, (real) =>
      Object.assign(Object.create(real) as RootedFileSystem, {
        writeFile: async (path: string, content: Parameters<RootedFileSystem['writeFile']>[1]) => {
          await real.writeFile(path, content);
          /* The preview pipeline writes into the same root, unfenced, while the
           * settlement is applying its tree. A whole-tree comparison would fail
           * on bytes this write never touched. */
          await real.writeFile('preview.txt', `rendered at ${String(Date.now())}\n`);
        },
      }),
    );
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const base = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const baseRevision = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: base.cutId,
      treeId: base.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });

    await filesystem.writeFile('notes.md', 'the turn wrote this\n');
    const captured = await run<{ captureId: string }>(actors.turn.capture, { checkoutId: 'live', turnId: 'turn-1' });
    await filesystem.unlink('notes.md');
    const merged = await run<{ status: string }>(actors.turn.merge, {
      checkoutId: 'live',
      captureId: captured.captureId,
      baseRevisionId: baseRevision.revisionId,
    });

    expect(merged.status).toBe('recorded');
    expect(await filesystem.readFile('notes.md', 'utf8')).toBe('the turn wrote this\n');
  }, 30_000);

  it('records the run that minted even when the checkout holds several leases', async () => {
    const { port, actors } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const cut = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'turn',
    });
    const written = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: cut.cutId,
      treeId: cut.treeId,
      parents: [],
      trigger: 'turn',
      turnId: 'turn-2',
      /* `writeLease` puts the minting turn's own run first; a second chat
       * holding the same checkout must not cost the revision its attribution. */
      leaseIds: ['run-2', 'run-1'],
    });

    const record = await port.readRevision(revisionId(written.revisionId));
    expect(record?.provenance).toMatchObject({ source: 'agent', runId: 'run-2' });
  }, 30_000);

  it('reports a structural conflict as a conflicted turn rather than throwing', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    /* The turn adds `notes` as a file while the live tree adds `notes/today.txt`
     * under the same name. Neither tree is invalid; their *merge* is, and
     * `mergeRevisionTrees` throws a `TypeError` building it today (W10 makes it
     * a conflict value). A turn may not die of that. */
    const base = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([]),
      provenance: { source: 'user', actorId: 'tau-host', createdAt: Date.now() },
      summary: { generated: 'base' },
    });
    await filesystem.unlink('main.ts');
    await filesystem.writeFile('notes', 'the turn wrote a file\n');
    const captured = await run<{ captureId: string }>(actors.turn.capture, { checkoutId: 'live', turnId: 'turn-1' });
    await filesystem.unlink('notes');
    await filesystem.writeFile('notes/today.txt', 'the live tree wrote a directory\n');
    const merged = await run<{ status: string }>(actors.turn.merge, {
      checkoutId: 'live',
      captureId: captured.captureId,
      baseRevisionId: base.commitId,
    });

    expect(merged.status).toBe('conflicted');
  }, 30_000);
});

describe('restore, through the machine that owns it', () => {
  it('plans a restore, applies it under confirmation, and puts the tree back', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const first = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const firstRevision = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: first.cutId,
      treeId: first.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(firstRevision.revisionId) });
    /* A second revision that adds a file, so restoring the first is a deletion
     * — the risky plan that needs confirmation. */
    await filesystem.writeFile('extra.txt', 'added later\n');
    const second = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const secondRevision = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: second.cutId,
      treeId: second.treeId,
      parents: [firstRevision.revisionId],
      trigger: 'save',
      leaseIds: [],
    });
    await port.updateRef({
      name: 'main',
      expectedHead: revisionId(firstRevision.revisionId),
      head: revisionId(secondRevision.revisionId),
    });

    const restore = createActor(restoreMachine.provide({ actors: actors.restore }), {
      input: { projectId: 'project-1', checkoutId: 'live', headRevisionId: secondRevision.revisionId },
    });
    const changes: unknown[] = [];
    restore.on('checkoutChanged', (event) => changes.push(event));
    restore.start();
    restore.send({ type: 'restore', revisionId: firstRevision.revisionId });
    await expect.poll(() => restore.getSnapshot().value, { timeout: 10_000 }).toBe('confirming');
    /* The plan is the real one: restoring the first revision removes the file
     * the second added, and nothing else. */
    expect(restore.getSnapshot().context.removedPathCount).toBe(1);
    expect(restore.getSnapshot().context.revisionNumber).toBe(1);
    expect(restore.getSnapshot().context.unrecoverable).toEqual([]);

    restore.send({ type: 'confirm' });
    await expect.poll(() => changes.length, { timeout: 10_000 }).toBe(1);
    /* Detached, and correctly so (A2): `main` names the second revision, so no
     * branch names the one this restore put back. */
    expect(changes[0]).toMatchObject({
      checkoutId: 'live',
      revisionId: firstRevision.revisionId,
      treeId: first.treeId,
      branch: undefined,
    });
    await expect(port.readRef('main')).resolves.toBe(secondRevision.revisionId);
    expect(await filesystem.exists('extra.txt')).toBe(false);
    restore.stop();
  }, 30_000);
});

describe('the tree id', () => {
  it('is stable for the same bytes and different for different ones', () => {
    const left = new ImmutableRevisionTree([
      ['a.txt', 'a\n'],
      ['nested/b.txt', 'b\n'],
    ]);
    const right = new ImmutableRevisionTree([
      ['nested/b.txt', 'b\n'],
      ['a.txt', 'a\n'],
    ]);
    const changed = new ImmutableRevisionTree([
      ['a.txt', 'a\n'],
      ['nested/b.txt', 'c\n'],
    ]);

    expect(revisionTreeId(left, 'sha1')).toBe(revisionTreeId(right, 'sha1'));
    expect(revisionTreeId(left, 'sha1')).not.toBe(revisionTreeId(changed, 'sha1'));
    expect(revisionTreeId(new ImmutableRevisionTree([]), 'sha1')).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  });
});

describe('the checkout registry', () => {
  /* A25/S36, the offer half: a linked checkout whose branch the live one already
   * contains, untouched for more than a month, is *offered* for removal. The
   * offer is data — W7's pane renders it — and nothing is ever removed silently.
   */
  it('offers a long-merged branch’s checkout for removal, and never the live one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revision-registry-'));
    roots.push(root);
    const filesystem = new NodeFsProvider(root);
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      checkouts: { projectId: 'project-1', root: () => filesystem },
    });
    const day = 24 * 60 * 60 * 1000;
    const recordedAt = Date.UTC(2026, 0, 1);
    const actors = createRevisionActors({
      port,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => filesystem,
      /* Forty days after the revision both branches name. */
      clock: () => recordedAt + 40 * day,
    });

    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await port.setHead('main');
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['part.ts', 'one\n']]),
      provenance: { source: 'user', actorId: 'ada', createdAt: recordedAt },
      summary: { generated: 'First' },
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'main', expectedHead: undefined, head });
    await port.addCheckout?.({ branch: 'side', from: head });

    const listed = await run<{ checkouts: ReadonlyArray<{ kind: string; branch?: string; removable?: boolean }> }>(
      actors.checkouts.listCheckouts,
      { projectId: 'project-1' },
    );
    const live = listed.checkouts.find((checkout) => checkout.kind === 'live');
    const side = listed.checkouts.find((checkout) => checkout.branch === 'side');
    expect(live?.removable).toBeUndefined();
    expect(side?.removable).toBe(true);
  }, 30_000);

  it('keeps a recently merged branch’s checkout, and refuses to discard unsaved work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revision-registry-recent-'));
    roots.push(root);
    const filesystem = new NodeFsProvider(root);
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      checkouts: { projectId: 'project-1', root: () => filesystem },
    });
    const recordedAt = Date.UTC(2026, 0, 1);
    const actors = createRevisionActors({
      port,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => filesystem,
      clock: () => recordedAt + 60_000,
    });

    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await port.setHead('main');
    await filesystem.writeFile('part.ts', 'one\n');
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['part.ts', 'one\n']]),
      provenance: { source: 'user', actorId: 'ada', createdAt: recordedAt },
      summary: { generated: 'First' },
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'main', expectedHead: undefined, head });
    const added = await port.addCheckout?.({ branch: 'side', from: head });

    const listed = await run<{ checkouts: ReadonlyArray<{ branch?: string; removable?: boolean }> }>(
      actors.checkouts.listCheckouts,
      { projectId: 'project-1' },
    );
    expect(listed.checkouts.find((checkout) => checkout.branch === 'side')?.removable).toBeUndefined();

    // And the tree that has moved on from its head cannot be discarded at all.
    await filesystem.writeFile('part.ts', 'two\n');
    await expect(run(actors.checkouts.removeCheckout, { projectId: 'project-1', id: added?.id ?? '' })).rejects.toThrow(
      /not in a revision yet/u,
    );
  }, 30_000);
});

describe('merging two lines', () => {
  /** A project on `main` with a `feature` branch that moved on from the same base. */
  const twoLines = async (
    /* `theirs: undefined` is a delete on the feature side — the other half of a
       modify-delete, which a resolution has to be able to answer (review R7). */
    sides: Readonly<{ ours: string; theirs: string | undefined; extra?: Readonly<Record<string, string>> }>,
  ): Promise<Fixture & { readonly base: string; readonly ours: string; readonly theirs: string }> => {
    const context = await fixture({ 'a.txt': 'base\n' });
    const { port, filesystem } = context;
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await port.setHead('main');
    /* The store generates its own ignore file, and it is versioned like any
       other authored path — so every hand-written tree here carries it, or the
       live checkout reads as dirty against its own head. */
    const generated = new TextDecoder().decode(await filesystem.readFile(generatedIgnorePath));
    const write = async (
      content: Readonly<Record<string, string>>,
      parents: readonly string[],
      summary: string,
    ): Promise<string> => {
      const receipt = await port.writeRevision({
        parents: parents.map((parent) => revisionId(parent)),
        tree: new ImmutableRevisionTree([[generatedIgnorePath, generated], ...Object.entries(content)]),
        provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 13) },
        summary: { generated: summary },
      });
      return receipt.commitId;
    };

    const base = await write({ 'a.txt': 'base\n' }, [], 'Base');
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(base) });
    await port.updateRef({ name: 'feature', expectedHead: undefined, head: revisionId(base) });
    const theirs = await write(
      { ...(sides.theirs === undefined ? {} : { 'a.txt': sides.theirs }), ...sides.extra },
      [base],
      'Theirs',
    );
    await port.updateRef({ name: 'feature', expectedHead: revisionId(base), head: revisionId(theirs) });
    const ours = await write({ 'a.txt': sides.ours }, [base], 'Ours');
    await port.updateRef({ name: 'main', expectedHead: revisionId(base), head: revisionId(ours) });
    /* The live tree is on `main` and clean, which is the state the verb needs. */
    await filesystem.writeFile('a.txt', sides.ours);
    return { ...context, base, ours, theirs };
  };

  it('mints a conflicted revision on the source branch and leaves the target untouched', async () => {
    const { port, actors, filesystem, ours, theirs } = await twoLines({
      ours: 'mine\n',
      theirs: 'theirs\n',
      extra: { 'settled.txt': 'only one side wrote this\n' },
    });

    const outcome = await run<{ status: string; paths?: readonly string[] }>(actors.branch.merge, {
      projectId: 'project-1',
      branch: 'feature',
      into: 'main',
    });

    expect(outcome).toStrictEqual({ status: 'conflicted', paths: ['a.txt'] });
    /* AC14 first clause: `main` and the live checkout are byte-identical. */
    expect(await port.readRef('main')).toBe(ours);
    expect(new TextDecoder().decode(await filesystem.readFile('a.txt'))).toBe('mine\n');

    const head = await port.readRef('feature');
    expect(head).not.toBe(theirs);
    const conflicted = await port.readRevision(revisionId(head ?? ''));
    expect(conflicted?.receipt.conflicted).toBe(true);
    expect(conflicted?.parents).toStrictEqual([theirs, ours]);
    const terms = await readConflictTerms(port, head ?? '');
    expect(terms?.conflicts.map((conflict) => conflict.path)).toStrictEqual(['a.txt']);
    expect(terms?.labels).toStrictEqual({ ours: 'main', theirs: 'feature' });
    expect(await materializeConflict(port, { revisionId: head ?? '', path: 'a.txt' })).toBe(
      '<<<<<<< main\nmine\n=======\ntheirs\n>>>>>>> feature\n',
    );
  }, 30_000);

  it('records a merge revision and rewrites the target when the two lines settle', async () => {
    const { port, actors, filesystem, ours, theirs } = await twoLines({
      ours: 'base\n',
      theirs: 'theirs\n',
      extra: { 'b.txt': 'theirs only\n' },
    });

    const outcome = await run<{ status: string; revisionId?: string }>(actors.branch.merge, {
      projectId: 'project-1',
      branch: 'feature',
      into: 'main',
    });

    expect(outcome.status).toBe('merged');
    /* `ours` did not change `a.txt`, so the merge is a real composition of two
       lines rather than a fast-forward: `main` gains a revision of its own. */
    const head = await port.readRef('main');
    expect(head).toBe(outcome.revisionId);
    const record = await port.readRevision(revisionId(head ?? ''));
    expect(record?.parents).toStrictEqual([ours, theirs]);
    expect(record?.provenance.source).toBe('merge');
    expect(new TextDecoder().decode(await filesystem.readFile('a.txt'))).toBe('theirs\n');
    expect(new TextDecoder().decode(await filesystem.readFile('b.txt'))).toBe('theirs only\n');
  }, 30_000);

  it('refuses to overwrite work no revision holds', async () => {
    const { actors, filesystem } = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
    await filesystem.writeFile('a.txt', 'unsaved\n');

    await expect(run(actors.branch.merge, { projectId: 'project-1', branch: 'feature', into: 'main' })).rejects.toThrow(
      /not in a revision yet/u,
    );
  }, 30_000);

  it('fast-forwards a target that has not moved, without recording a merge', async () => {
    const { port, actors, filesystem, base, ours, theirs } = await twoLines({ ours: 'base\n', theirs: 'theirs\n' });
    /* Put `main` back at the base: nothing of its own to compose. */
    await port.updateRef({ name: 'main', expectedHead: revisionId(ours), head: revisionId(base) });
    await filesystem.writeFile('a.txt', 'base\n');

    const outcome = await run<{ status: string; revisionId?: string }>(actors.branch.merge, {
      projectId: 'project-1',
      branch: 'feature',
      into: 'main',
    });

    expect(outcome).toStrictEqual({ status: 'merged', revisionId: theirs });
    expect(await port.readRef('main')).toBe(theirs);
    expect(new TextDecoder().decode(await filesystem.readFile('a.txt'))).toBe('theirs\n');
  }, 30_000);

  it('says a line already merged is merged, rather than failing', async () => {
    const { port, actors, base, theirs } = await twoLines({ ours: 'base\n', theirs: 'theirs\n' });
    await port.updateRef({ name: 'feature', expectedHead: revisionId(theirs), head: revisionId(base) });

    const outcome = await run<{ status: string }>(actors.branch.merge, {
      projectId: 'project-1',
      branch: 'feature',
      into: 'main',
    });

    expect(outcome.status).toBe('merged');
  }, 30_000);

  /* The composition `finishMerge` performs is the subtlest code in the lane and
     the machine suite proves none of it — fake actors prove the choreography.
     These run the real effect over a real port (review R7). */
  describe('resolving what the merge could not', () => {
    /** Merge `feature` into `main` and answer with the conflicted revision. */
    const conflicted = async (context: Fixture): Promise<string> => {
      const outcome = await run<{ status: string }>(context.actors.branch.merge, {
        projectId: 'project-1',
        branch: 'feature',
        into: 'main',
      });
      expect(outcome.status).toBe('conflicted');
      return (await context.port.readRef('feature')) ?? '';
    };

    const keep = async (
      context: Fixture,
      choice: Readonly<{ revisionId: string; path: string; side: string; content?: string }>,
    ): Promise<void> => run(context.actors.resolution.applyResolution, { projectId: 'project-1', ...choice });

    it('composes the chosen sides into one revision and moves the branch onto it', async () => {
      const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n', extra: { 'settled.txt': 'theirs only\n' } });
      const revision = await conflicted(context);

      await keep(context, { revisionId: revision, path: 'a.txt', side: 'mine' });
      const finished = await run<{ revisionId: string; branch?: string }>(context.actors.resolution.finishMerge, {
        projectId: 'project-1',
        revisionId: revision,
      });

      expect(finished.branch).toBe('feature');
      expect(await context.port.readRef('feature')).toBe(finished.revisionId);
      const resolvedTree = await context.port.readTree(revisionId(finished.revisionId));
      expect(new TextDecoder().decode(resolvedTree?.get('a.txt'))).toBe('mine\n');
      /* Everything that settled rides through untouched, and no marker byte
         reaches the tree (A22). */
      expect(new TextDecoder().decode(resolvedTree?.get('settled.txt'))).toBe('theirs only\n');
      expect(new TextDecoder().decode(resolvedTree?.get('a.txt'))).not.toContain('<<<<<<<');
      /* And the branch merged into is still exactly where it was (AC14). */
      expect(await context.port.readRef('main')).toBe(context.ours);
    }, 30_000);

    it('takes the editor’s bytes when a person composed the two sides by hand', async () => {
      const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
      const revision = await conflicted(context);

      await keep(context, { revisionId: revision, path: 'a.txt', side: 'editor', content: 'mine and theirs\n' });
      const finished = await run<{ revisionId: string }>(context.actors.resolution.finishMerge, {
        projectId: 'project-1',
        revisionId: revision,
      });

      const resolvedTree = await context.port.readTree(revisionId(finished.revisionId));
      expect(new TextDecoder().decode(resolvedTree?.get('a.txt'))).toBe('mine and theirs\n');
    }, 30_000);

    it('deletes the file when the side a person kept had deleted it', async () => {
      const context = await twoLines({
        ours: 'mine\n',
        theirs: undefined,
        extra: { 'settled.txt': 'theirs only\n' },
      });
      const revision = await conflicted(context);

      /* A modify-delete: keeping the `feature` side means the path is gone, and
         the resolved tree must not carry it at all. */
      await keep(context, { revisionId: revision, path: 'a.txt', side: 'theirs' });
      const finished = await run<{ revisionId: string }>(context.actors.resolution.finishMerge, {
        projectId: 'project-1',
        revisionId: revision,
      });

      const resolvedTree = await context.port.readTree(revisionId(finished.revisionId));
      expect(resolvedTree?.has('a.txt')).toBe(false);
      expect(resolvedTree?.has('settled.txt')).toBe(true);
    }, 30_000);

    /* R4 through the effect that used to throw: the file `a` is conflicted and
       `a/b.txt` settles, so a scan of the settled set alone saw no collision and
       `finishMerge` composed a tree the model refuses — a `TypeError` on a
       failure edge that said nothing. It is a typed conflict now, so the person
       is asked the one question they can answer. */
    it('answers a file-versus-directory collision with a choice, not a TypeError', async () => {
      const context = await twoLines({
        ours: 'mine\n',
        theirs: undefined,
        extra: { 'a.txt/b.txt': 'a directory\n' },
      });
      const revision = await conflicted(context);

      const terms = await readConflictTerms(context.port, revision);
      expect(terms?.conflicts).toStrictEqual([
        expect.objectContaining({ type: 'file-directory', path: 'a.txt', directoryPath: 'a.txt/b.txt' }),
      ]);

      await keep(context, { revisionId: revision, path: 'a.txt', side: 'mine' });
      const finished = await run<{ revisionId: string }>(context.actors.resolution.finishMerge, {
        projectId: 'project-1',
        revisionId: revision,
      });

      const resolvedTree = await context.port.readTree(revisionId(finished.revisionId));
      expect(new TextDecoder().decode(resolvedTree?.get('a.txt'))).toBe('mine\n');
      expect(resolvedTree?.has('a.txt/b.txt')).toBe(false);
    }, 30_000);

    it('refuses a path that is not part of the conflict, and a finish with a side still missing', async () => {
      const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
      const revision = await conflicted(context);

      await expect(keep(context, { revisionId: revision, path: 'settled.txt', side: 'mine' })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
      await expect(keep(context, { revisionId: revision, path: 'a.txt', side: 'editor' })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
      await expect(
        run(context.actors.resolution.finishMerge, { projectId: 'project-1', revisionId: revision }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
      /* Refused, and nothing moved: the branch still holds the conflict. */
      expect(await context.port.readRef('feature')).toBe(revision);
    }, 30_000);
  });
});

describe('the durable queue’s writer', () => {
  const queuePath = '.tau/revisions/sync-pending';

  it('serializes two overlapping writes, so a settle never tears the record (review 2 R5)', async () => {
    const writes: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' }, (real) =>
      Object.assign(Object.create(real) as RootedFileSystem, {
        writeFile: async (path: string, content: Parameters<RootedFileSystem['writeFile']>[1]) => {
          writes.push(path);
          if (writes.length === 1) {
            /* Hold the first write open: a keepalive answer landing while a push
             * settles is exactly this overlap, and an unserialized writer would
             * start the second write here. */
            await new Promise<void>((resolve) => {
              releaseFirst = resolve;
            });
          }
          return real.writeFile(path, content);
        },
      }),
    );
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });

    const first = run<void>(actors.sync.writePending, {
      projectId: 'project-1',
      record: { version: 1, entries: [{ ref: 'refs/heads/main', reason: 'first', recordedAt: 1 }] },
    });
    await vi.waitFor(() => {
      expect(writes).toHaveLength(1);
    });
    const second = run<void>(actors.sync.writePending, {
      projectId: 'project-1',
      record: { version: 1, entries: [{ ref: 'refs/tau/chats/c1', reason: 'second', recordedAt: 2 }] },
    });
    /* The second writer has not touched the filesystem at all yet. */
    await Promise.resolve();
    expect(writes).toHaveLength(1);

    releaseFirst?.();
    await Promise.all([first, second]);

    /* Last caller, last writer — and a parseable record, always. */
    const stored: unknown = JSON.parse(await filesystem.readFile(queuePath, 'utf8'));
    expect(stored).toEqual({
      version: 1,
      entries: [{ ref: 'refs/tau/chats/c1', reason: 'second', recordedAt: 2 }],
    });
  });
});
