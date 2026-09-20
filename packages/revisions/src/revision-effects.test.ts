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

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createMachine } from 'xstate';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { captureRevisionTree, ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RootedFileSystem } from '@taucad/filesystem';
import { classify, unlistedPathClassification } from '@taucad/filesystem/path-registry';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { materializeConflict, readConflictTerms } from '#revision-conflict.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort } from '#revision-port.js';
import { gitOnPath, nativeHarness } from '#test/native-git-harness.js';
import { generatedGitattributesPath, generatedIgnorePath } from '#workspace-config.js';
import { restoreMachine } from '#restore.machine.js';
import { createRevisionActors, revisionTreeId } from '#revision-effects.js';
import type { RevisionActors, RevisionActorsOptions } from '#revision-effects.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

type Fixture = {
  readonly root: string;
  readonly filesystem: RootedFileSystem;
  readonly port: RevisionPort;
  readonly actors: RevisionActors;
};

type ActorSet = Readonly<{
  name: 'isomorphic-git' | 'native-git';
  enabled: boolean;
}>;

type FixtureOptions = Partial<RevisionActorsOptions> & Readonly<{ actorSet?: ActorSet['name'] }>;

const actorSets: readonly ActorSet[] = [
  { name: 'isomorphic-git', enabled: true },
  { name: 'native-git', enabled: gitOnPath },
];

const captureMainAndLiveTrees = async (port: RevisionPort, filesystem: RootedFileSystem) => {
  const head = await port.readRef('main');
  const tree = await port.readTree(revisionId(head ?? ''));
  const live = await captureRevisionTree(filesystem, {
    exclude: (path) => !classify(path).versioned,
  });
  return { head, tree: tree?.entries(), live: live.entries() };
};

/**
 * One project directory with a port and an actor set over it.
 *
 * @param files - Files to write before the port is constructed.
 * @param wrap - Wraps the tree the *actors* write through; the port keeps the real one.
 * @param options - Host options plus the revision engine whose real port the actors use.
 * @returns The fixture the cases drive.
 */
const fixture = async (
  files: Readonly<Record<string, string>> = {},
  wrap: (filesystem: RootedFileSystem) => RootedFileSystem = (filesystem) => filesystem,
  options: FixtureOptions = {},
): Promise<Fixture> => {
  const { actorSet = 'isomorphic-git', ...extra } = options;
  const native =
    actorSet === 'native-git' ? await nativeHarness('project-1', 'tau-revision-effects-native-') : undefined;
  const root = native?.root ?? (await mkdtemp(join(tmpdir(), 'tau-revision-effects-')));
  roots.push(root);
  const filesystem = new NodeFsProvider(native?.liveRoot ?? root);
  const linkedRoot =
    native === undefined ? await mkdtemp(join(tmpdir(), 'tau-revision-effects-checkouts-')) : undefined;
  if (linkedRoot !== undefined) {
    roots.push(linkedRoot);
  }
  const linkedFilesystems = new Map<string, RootedFileSystem>();
  const linkedFilesystem = async (id: string): Promise<RootedFileSystem> => {
    const existing = linkedFilesystems.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const checkoutRoot = join(linkedRoot ?? '', id);
    await mkdir(checkoutRoot, { recursive: true });
    const created = new NodeFsProvider(checkoutRoot);
    linkedFilesystems.set(id, created);
    return created;
  };
  for (const [path, content] of Object.entries(files)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, written in order.
    await filesystem.writeFile(path, content);
  }
  const port =
    native?.port ??
    createIsomorphicGitRevisionPort({
      filesystem,
      checkouts: { projectId: 'project-1', root: linkedFilesystem },
    });
  const actors = createRevisionActors({
    port,
    projectId: 'project-1',
    authorityEpoch: 'epoch-1',
    filesystem: async (checkout) =>
      wrap(
        native === undefined
          ? checkout.kind === 'live'
            ? filesystem
            : await linkedFilesystem(checkout.id)
          : new NodeFsProvider(checkout.root),
      ),
    ...extra,
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
    /* EQ1: a vendored repository is the control plane at any depth. Git itself
     * never tracks a nested `.git`; capturing one as ordinary files put its
     * `config` — credentials included — into every revision. */
    await filesystem.writeFile('vendor/lib/.git/config', '[remote "origin"]\n');
    /* G0-3: `classify` answered with the first matching row, so a store under an
     * authored `.tau` control was that row's — authored and *versioned*. The
     * skill beside it still arrives, so an empty subtree cannot pass this. */
    await filesystem.writeFile('.tau/skills/cad/SKILL.md', '---\nname: cad\n---\n');
    await filesystem.writeFile('.tau/skills/cad/.git/config', '[remote "origin"]\n');
    /* G0b-9: a case alias of a reserved path wedged this cut. `classify` called it
     * authored and versioned, so the capture carried it — and `portable-tree`
     * refused the whole tree at commit, with no way out but deleting the file by
     * hand. Folded, it is the records row it resolves to on the disk that holds
     * it, and the cut simply leaves it out. */
    await filesystem.writeFile('Exports/x.step', 'solid alias\n');

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
    ).toEqual(['.gitattributes', '.gitignore', '.tau/skills/cad/SKILL.md', 'main.ts']);
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
        rename: async (from: string, to: string) => (swallowed.has(to) ? undefined : real.rename(from, to)),
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
    ).rejects.toThrow(/did not keep the paths this change wrote: notes\.md/u);
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
    const release = vi.fn();
    const onApplyingTree = vi.fn(() => release);
    const { port, actors, filesystem } = await fixture(
      { 'main.ts': 'export const size = 1;\n' },
      (filesystem) => filesystem,
      { onApplyingTree },
    );
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
    expect(onApplyingTree).toHaveBeenCalledWith(expect.objectContaining({ id: 'live' }), ['extra.txt']);
    expect(release).toHaveBeenCalledOnce();
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
    expect(revisionTreeId(left, 'sha1')).not.toBe(
      revisionTreeId(
        new ImmutableRevisionTree([
          ['a.txt', 'a\n', '100755'],
          ['nested/b.txt', 'b\n'],
        ]),
        'sha1',
      ),
    );
    expect(revisionTreeId(new ImmutableRevisionTree([]), 'sha1')).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  });
});

describe('the checkout registry', () => {
  it('should bracket linked-checkout preparation before either placement outcome', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-revision-admission-'));
    roots.push(root);
    const filesystem = new NodeFsProvider(root);
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      checkouts: { projectId: 'project-1', root: () => filesystem },
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await port.writeRevision({
      tree: new ImmutableRevisionTree([['main.ts', new TextEncoder().encode('one\n')]]),
      parents: [],
      provenance: { source: 'user', actorId: 'person-1', createdAt: 1 },
      summary: { generated: 'base' },
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'refs/heads/main', expectedHead: undefined, head });
    const linked = await port.addCheckout?.({ branch: 'candidate', from: head });
    expect(linked?.kind).toBe('linked');

    const events: string[] = [];
    let refuse = false;
    const actors = createRevisionActors({
      port,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => filesystem,
      useFileSystem: async (checkout, operation) => {
        events.push(`open:${checkout.kind}`);
        try {
          if (refuse) {
            throw new Error('candidate admission refused');
          }
          return await operation(filesystem);
        } finally {
          events.push(`close:${checkout.kind}`);
        }
      },
      onPlacement: (placement) => {
        events.push(placement.status);
      },
    });

    await run(actors.turn.prepare, {
      turnId: 'turn-1',
      chatId: 'chat-1',
      runId: 'run-1',
      checkoutId: linked?.id,
    });
    expect(events).toEqual(['open:linked', 'close:linked', 'placed']);

    events.length = 0;
    refuse = true;
    await expect(
      run(actors.turn.prepare, {
        turnId: 'turn-2',
        chatId: 'chat-1',
        runId: 'run-2',
        checkoutId: linked?.id,
      }),
    ).rejects.toThrow('candidate admission refused');
    expect(events).toEqual(['open:linked', 'close:linked', 'refused']);
  });

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

for (const actorSet of actorSets) {
  describe.runIf(actorSet.enabled)(`revision ingress safety — ${actorSet.name}`, () => {
    const synchronized = async () => {
      const context = await fixture({ 'main.ts': 'base\n' }, (filesystem) => filesystem, {
        actorSet: actorSet.name,
      });
      const { port, filesystem } = context;
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      const baseTree = await captureRevisionTree(filesystem, { exclude: (path) => !classify(path).versioned });
      const baseReceipt = await port.writeRevision({
        parents: [],
        tree: baseTree,
        provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 13) },
        summary: { generated: 'Base' },
      });
      const base = revisionId(baseReceipt.commitId);
      await port.updateRef({ name: 'main', expectedHead: undefined, head: base });
      await port.setHead('main');
      const remoteTree = new ImmutableRevisionTree(
        baseTree
          .entries()
          .map((entry) => [entry.path, entry.path === 'main.ts' ? 'remote\n' : entry.content, entry.mode]),
      );
      const remoteReceipt = await port.writeRevision({
        parents: [base],
        tree: remoteTree,
        provenance: { source: 'user', actorId: 'grace', createdAt: Date.UTC(2026, 8, 13, 1) },
        summary: { generated: 'Remote' },
      });
      const remote = revisionId(remoteReceipt.commitId);
      await port.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: remote });
      return { ...context, base, baseTree, remote, remoteTree };
    };

    it('preserves dirty and leased files, and rejects protected target paths before writing', async () => {
      const context = await synchronized();
      await context.filesystem.writeFile('main.ts', 'unsaved\n');
      await expect(run(context.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toMatchObject({
        code: 'CHECKOUT_CONFLICT',
      });
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('unsaved\n');
      expect(await context.port.readRef('main')).toBe(context.base);

      await context.filesystem.writeFile('main.ts', 'base\n');
      await run(context.actors.turn.writeLease, {
        runId: 'run-1',
        turnId: 'turn-1',
        chatId: 'chat-1',
        checkoutId: 'live',
      });
      await expect(run(context.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toMatchObject({
        code: 'CHECKOUT_CONFLICT',
      });
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('base\n');
      await run(context.actors.turn.retireLease, { runId: 'run-1' });

      const protectedTree = new ImmutableRevisionTree([
        ...context.remoteTree.entries().map((entry) => [entry.path, entry.content, entry.mode] as const),
        ['.tau/chats/victim/chat.json', 'remote record'],
      ]);
      const protectedReceipt = await context.port.writeRevision({
        parents: [context.remote],
        tree: protectedTree,
        provenance: { source: 'user', actorId: 'mallory', createdAt: Date.UTC(2026, 8, 13, 2) },
        summary: { generated: 'Protected-path injection' },
      });
      const protectedHead = revisionId(protectedReceipt.commitId);
      await context.port.updateRef({
        name: 'refs/remotes/tau/main',
        expectedHead: context.remote,
        head: protectedHead,
      });
      await context.filesystem.writeFile('.tau/chats/victim/chat.json', 'local record');
      await expect(run(context.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toMatchObject({
        code: 'UNSUPPORTED_OPERATION',
      });
      expect(await context.filesystem.readFile('.tau/chats/victim/chat.json', 'utf8')).toBe('local record');
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('base\n');
      expect(await context.port.readRef('main')).toBe(context.base);
    }, 30_000);

    it('rolls the checkout back when application fails or the ref CAS loses', async () => {
      const context = await synchronized();
      let failWrite = true;
      const wrapped = Object.assign(Object.create(context.filesystem) as RootedFileSystem, {
        writeFile: async (path: string, content: Parameters<RootedFileSystem['writeFile']>[1]) => {
          if (path.includes('.main.ts.') && path.endsWith('.tmp') && failWrite) {
            failWrite = false;
            throw new Error('injected write failure');
          }
          return context.filesystem.writeFile(path, content);
        },
      });
      const failingActors = createRevisionActors({
        port: context.port,
        projectId: 'project-1',
        authorityEpoch: 'epoch-1',
        filesystem: () => wrapped,
      });
      await expect(run(failingActors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toThrow(
        /injected write failure/u,
      );
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('base\n');
      expect(await context.port.readRef('main')).toBe(context.base);

      const refusingPort: RevisionPort = {
        ...context.port,
        updateRef: async (input) =>
          input.name === 'refs/heads/main' || input.name === 'main'
            ? {
                status: 'conflicted',
                name: input.name,
                expectedHead: input.expectedHead,
                actualHead: context.base,
                proposedHead: input.head,
              }
            : context.port.updateRef(input),
      };
      const refusingActors = createRevisionActors({
        port: refusingPort,
        projectId: 'project-1',
        authorityEpoch: 'epoch-1',
        filesystem: () => context.filesystem,
      });
      await expect(run(refusingActors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toMatchObject({
        code: 'CHECKOUT_CONFLICT',
      });
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('base\n');
      expect(await context.port.readRef('main')).toBe(context.base);
    }, 30_000);

    it('keeps the source branch when a rename destination CAS loses', async () => {
      const context = await synchronized();
      await context.port.updateRef({ name: 'rename-source', expectedHead: undefined, head: context.remote });
      const racingPort: RevisionPort = {
        ...context.port,
        updateRef: async (input) => {
          if (input.name === 'rename-target') {
            await context.port.updateRef({ name: 'rename-target', expectedHead: undefined, head: context.base });
            return {
              status: 'conflicted',
              name: input.name,
              expectedHead: input.expectedHead,
              actualHead: context.base,
              proposedHead: input.head,
            };
          }
          return context.port.updateRef(input);
        },
      };
      const racingActors = createRevisionActors({
        port: racingPort,
        projectId: 'project-1',
        authorityEpoch: 'epoch-1',
        filesystem: () => context.filesystem,
      });

      await expect(
        run(racingActors.branch.rename, {
          projectId: 'project-1',
          branch: 'rename-source',
          name: 'rename-target',
        }),
      ).rejects.toMatchObject({ code: 'CHECKOUT_CONFLICT' });
      expect(await context.port.readRef('rename-source')).toBe(context.remote);
      expect(await context.port.readRef('rename-target')).toBe(context.base);
    }, 30_000);

    it('aborts a stopped apply and drains the in-flight port operation before settling', async () => {
      const context = await synchronized();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const heldPort: RevisionPort = {
        ...context.port,
        readTree: async (id) => {
          if (id === context.remote) {
            entered.resolve();
            await release.promise;
          }
          return context.port.readTree(id);
        },
      };
      const heldActors = createRevisionActors({
        port: heldPort,
        projectId: 'project-1',
        authorityEpoch: 'epoch-1',
        filesystem: () => context.filesystem,
      });
      const running = createActor(heldActors.sync.fastForward!, {
        input: { remote: 'tau', branch: 'main' },
      });
      running.start();
      await entered.promise;
      running.stop();

      const draining = heldActors.settled();
      expect(await Promise.race([draining.then(() => 'settled'), Promise.resolve('pending')])).toBe('pending');
      release.resolve();
      await draining;

      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('base\n');
      expect(await context.port.readRef('main')).toBe(context.base);
    }, 30_000);

    it('preserves a write that lands during replacement and rejects the stale fast-forward', async () => {
      const context = await synchronized();
      let injected = false;
      const wrapped = Object.assign(Object.create(context.filesystem) as RootedFileSystem, {
        rename: async (from: string, to: string) => {
          if (from === 'main.ts' && to.includes('.main.ts.') && !injected) {
            injected = true;
            await context.filesystem.writeFile('main.ts', 'user edit after validation\n');
          }
          return context.filesystem.rename(from, to);
        },
      });
      const actors = createRevisionActors({
        port: context.port,
        projectId: 'project-1',
        authorityEpoch: 'epoch-1',
        filesystem: () => wrapped,
      });

      await expect(run(actors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toMatchObject({
        code: 'CHECKOUT_CONFLICT',
      });
      expect(injected).toBe(true);
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('user edit after validation\n');
      expect(await context.port.readRef('main')).toBe(context.base);
    }, 30_000);

    it('revalidates the current branch before applying a fetched fast-forward', async () => {
      const context = await synchronized();
      const localTree = new ImmutableRevisionTree(
        context.baseTree
          .entries()
          .map((entry) => [entry.path, entry.path === 'main.ts' ? 'new local revision\n' : entry.content, entry.mode]),
      );
      const local = await context.port.writeRevision({
        parents: [context.base],
        tree: localTree,
        provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 13, 3) },
        summary: { generated: 'New local revision' },
      });
      await context.filesystem.writeFile('main.ts', 'new local revision\n');
      await context.port.updateRef({ name: 'main', expectedHead: context.base, head: revisionId(local.commitId) });

      await expect(run(context.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).rejects.toMatchObject({
        code: 'CHECKOUT_CONFLICT',
      });
      expect(await context.port.readRef('main')).toBe(local.commitId);
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('new local revision\n');
    }, 30_000);

    it('does not advance a branch that another checkout has open', async () => {
      const context = await synchronized();
      const feature = await context.port.addCheckout?.({ branch: 'feature', from: context.base });
      expect(feature).toMatchObject({ kind: 'linked', branch: 'feature' });
      await context.port.updateRef({ name: 'refs/remotes/tau/feature', expectedHead: undefined, head: context.base });
      const wrappedPort: RevisionPort = {
        ...context.port,
        listRemoteRefs: async () => [
          { name: 'refs/heads/main', head: context.base },
          { name: 'refs/heads/feature', head: context.remote },
        ],
        fetch: async () => {
          await context.port.updateRef({
            name: 'refs/remotes/tau/feature',
            expectedHead: context.base,
            head: context.remote,
          });
          return { refs: [{ name: 'refs/remotes/tau/feature', head: context.remote }] };
        },
      };
      const actors = createRevisionActors({
        port: wrappedPort,
        projectId: 'project-1',
        authorityEpoch: 'epoch-1',
        filesystem: () => context.filesystem,
      });

      await run(actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 10_000 });
      expect(await context.port.readRef('feature')).toBe(context.base);
    }, 30_000);
  });
}

describe('checkout fence cancellation', () => {
  it('keeps a later waiter behind the active owner when the middle waiter stops', async () => {
    const { actors } = await fixture();
    const { fence } = actors.checkout;
    if (fence === undefined) {
      throw new Error('The checkout fence actor is required.');
    }
    const owner = (onGranted: () => void) =>
      createActor(
        createMachine({
          invoke: { src: fence, input: { checkoutId: 'live' } },
          on: { fenceGranted: { actions: onGranted } },
        }),
      );
    const firstGranted = Promise.withResolvers<void>();
    let thirdGranted = false;
    const first = owner(firstGranted.resolve);
    const second = owner(() => undefined);
    const third = owner(() => {
      thirdGranted = true;
    });
    first.start();
    await firstGranted.promise;
    second.start();
    second.stop();
    third.start();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(thirdGranted).toBe(false);
    first.stop();
    await expect.poll(() => thirdGranted).toBe(true);
    third.stop();
    await actors.settled();
  });
});

describe('independent sync record failures', () => {
  it('pushes history and a second chat when the first chat cannot be prepared', async () => {
    const context = await fixture({
      'main.ts': 'base\n',
      '.tau/chats/chat-one/chat.json': '{"name":"one"}',
      '.tau/chats/chat-one/events.jsonl': 'one\n',
      '.tau/chats/chat-two/chat.json': '{"name":"two"}',
      '.tau/chats/chat-two/events.jsonl': 'two\n',
    });
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const tree = await captureRevisionTree(context.filesystem, { exclude: (path) => !classify(path).versioned });
    const mainReceipt = await context.port.writeRevision({
      parents: [],
      tree,
      provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 13) },
      summary: { generated: 'Main' },
    });
    const main = revisionId(mainReceipt.commitId);
    await context.port.updateRef({ name: 'main', expectedHead: undefined, head: main });
    await context.port.setHead('main');
    const pushes: string[][] = [];
    const isolatedPort: RevisionPort = {
      ...context.port,
      writeRevision: async (input) => {
        if (input.summary.generated === 'Chat chat-one') {
          throw new Error('chat-one preparation failed');
        }
        return context.port.writeRevision(input);
      },
      push: async (input) => {
        pushes.push(input.refs.map((ref) => ref.name));
        return {
          refs: await Promise.all(
            input.refs.map(
              async (ref) =>
                ({
                  name: ref.name,
                  status: 'updated',
                  head: await context.port.readRef(ref.name),
                }) as const,
            ),
          ),
        };
      },
    };
    const actors = createRevisionActors({
      port: isolatedPort,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => context.filesystem,
      deviceId: () => 'device-one',
    });

    const result = await run<{ refs: ReadonlyArray<{ name: string; status: string; reason?: string }> }>(
      actors.sync.push,
      { remote: 'tau', branch: 'main', leases: {} },
    );
    expect(pushes).toContainEqual(['refs/heads/main']);
    expect(pushes).toContainEqual(['refs/tau/chats/chat-two']);
    expect(pushes).not.toContainEqual(['refs/tau/chats/chat-one']);
    expect(result.refs).toContainEqual(
      expect.objectContaining({
        name: 'refs/tau/chats/chat-one',
        status: 'rejected',
        reason: 'chat-one preparation failed',
      }),
    );
    expect(result.refs).toContainEqual(expect.objectContaining({ name: 'refs/tau/chats/chat-two', status: 'updated' }));
  }, 30_000);

  /* Lane E2's two-client row 3 found this on the wire: every refusal class
   * rendered *Sync now*, because a whole-push throw was flattened here into
   * per-ref `rejected` outcomes, and the scheduler read those as a ref refusal.
   * The throw is the scheduler's to classify (its R5 path). */
  it('lets a whole-push refusal reach the scheduler with its code, instead of flattening it per ref', async () => {
    const context = await fixture({ 'main.ts': 'base\n' });
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const tree = await captureRevisionTree(context.filesystem, { exclude: (path) => !classify(path).versioned });
    const receipt = await context.port.writeRevision({
      parents: [],
      tree,
      provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 13) },
      summary: { generated: 'Main' },
    });
    await context.port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });
    await context.port.setHead('main');
    const refusing: RevisionPort = {
      ...context.port,
      push: async () => {
        throw new RevisionPortError('REMOTE_NOT_ENTITLED', 'Syncing files to Tau Cloud is a paid plan feature.');
      },
    };
    const actors = createRevisionActors({
      port: refusing,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => context.filesystem,
      deviceId: () => 'device-one',
    });

    await expect(run(actors.sync.push, { remote: 'tau', branch: 'main', leases: {} })).rejects.toMatchObject({
      code: 'REMOTE_NOT_ENTITLED',
      message: 'Syncing files to Tau Cloud is a paid plan feature.',
    });
  }, 30_000);

  it('keeps a server’s per-ref refusal per ref, so records still push beside it', async () => {
    const context = await fixture({ 'main.ts': 'base\n' });
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const tree = await captureRevisionTree(context.filesystem, { exclude: (path) => !classify(path).versioned });
    const receipt = await context.port.writeRevision({
      parents: [],
      tree,
      provenance: { source: 'user', actorId: 'ada', createdAt: Date.UTC(2026, 8, 13) },
      summary: { generated: 'Main' },
    });
    await context.port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });
    await context.port.setHead('main');
    const refusing: RevisionPort = {
      ...context.port,
      push: async () => {
        throw new RevisionPortError('REMOTE_REJECTED', 'Tau: refused refs/heads/main — it does not fast-forward 1a2b');
      },
    };
    const actors = createRevisionActors({
      port: refusing,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => context.filesystem,
      deviceId: () => 'device-one',
    });

    const result = await run<{ refs: ReadonlyArray<{ name: string; status: string; reason?: string }> }>(
      actors.sync.push,
      { remote: 'tau', branch: 'main', leases: {} },
    );
    expect(result.refs).toContainEqual(
      expect.objectContaining({
        name: 'refs/heads/main',
        status: 'rejected',
        reason: 'Tau: refused refs/heads/main — it does not fast-forward 1a2b',
      }),
    );
  }, 30_000);

  it('drains a delayed valid projection before reporting a sibling record failure', async () => {
    const delayed = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const context = await fixture({ 'tau.json': '{"syncChats":true}\n' });
    const projecting = Object.assign(Object.create(context.filesystem) as RootedFileSystem, {
      writeFile: async (path: string, content: Parameters<RootedFileSystem['writeFile']>[1]) => {
        if (path.endsWith('/broken/chat.json')) {
          throw new Error('broken chat cannot be written');
        }
        if (path.endsWith('/valid/events/device-a.jsonl')) {
          started.resolve();
          await delayed.promise;
        }
        return context.filesystem.writeFile(path, content);
      },
    });
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const record = async (id: string, tree: ImmutableRevisionTree) => {
      const receipt = await context.port.writeRevision({
        parents: [],
        tree,
        provenance: { source: 'user', actorId: 'device-a', createdAt: 1 },
        summary: { generated: `Chat ${id}` },
      });
      return { name: `refs/remotes/tau/tau/chats/${id}`, head: revisionId(receipt.commitId) };
    };
    const references = await Promise.all([
      record('broken', new ImmutableRevisionTree([['chat.json', '{"name":"Broken"}']])),
      record('valid', new ImmutableRevisionTree([['events/device-a.jsonl', '{"sequence":0}\n']])),
    ]);
    const remote: RevisionPort = {
      ...context.port,
      listRemoteRefs: async () =>
        references.map((ref) => ({ name: ref.name.replace('refs/remotes/tau/', 'refs/'), head: ref.head })),
      fetch: async () => ({ refs: references }),
    };
    const actors = createRevisionActors({
      port: remote,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => projecting,
      deviceId: () => 'device-b',
    });

    let settled = false;
    const fetching = (async () => {
      const result = await run<Readonly<{ records?: ReadonlyArray<Readonly<{ name: string; status: string }>> }>>(
        actors.sync.fetch,
        { remote: 'tau', branch: 'main', deadlineMilliseconds: 10_000 },
      );
      settled = true;
      return result;
    })();
    await started.promise;
    await Promise.resolve();
    expect(settled).toBe(false);
    delayed.resolve();
    const result = await fetching;
    expect(result.records).toEqual([
      expect.objectContaining({ name: 'refs/tau/chats/broken', status: 'rejected' }),
      expect.objectContaining({ name: 'refs/tau/chats/valid', status: 'updated' }),
    ]);
    expect(await context.filesystem.readFile('.tau/chats/valid/events/device-a.jsonl', 'utf8')).toBe(
      '{"sequence":0}\n',
    );
  }, 30_000);

  it('retains a differing local export before adopting and re-offering the fetched value', async () => {
    const context = await fixture({
      'tau.json': '{"syncLargeExports":true}\n',
      'exports/shared.step': 'old local output\n',
      'exports/local.step': 'local only\n',
    });
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await context.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        ['exports/shared.step', 'new remote output\n'],
        ['exports/remote.step', 'remote only\n'],
      ]),
      provenance: { source: 'user', actorId: 'device-a', createdAt: 1 },
      summary: { generated: 'Remote exports' },
    });
    const head = revisionId(receipt.commitId);
    const fetchedRef = { name: 'refs/remotes/tau/tau/evidence/exports', head };
    let offered: ImmutableRevisionTree | undefined;
    let offeredParents: readonly string[] | undefined;
    const remote: RevisionPort = {
      ...context.port,
      listRemoteRefs: async () => [{ name: 'refs/tau/evidence/exports', head }],
      fetch: async () => ({ refs: [fetchedRef] }),
      push: async (input) => ({
        refs: await Promise.all(
          input.refs.map(async (ref) => {
            const localHead = await context.port.readRef(ref.name);
            offered = localHead === undefined ? undefined : await context.port.readTree(localHead);
            const revision = localHead === undefined ? undefined : await context.port.readRevision(localHead);
            offeredParents = revision?.parents;
            return { name: ref.name, status: 'updated', head: localHead };
          }),
        ),
      }),
    };
    const actors = createRevisionActors({
      port: remote,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => context.filesystem,
    });

    await run(actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 10_000 });
    expect(await context.filesystem.readFile('exports/shared.step', 'utf8')).toBe('new remote output\n');
    expect(await context.filesystem.readFile('exports/local.step', 'utf8')).toBe('local only\n');
    expect(await context.filesystem.readFile('exports/remote.step', 'utf8')).toBe('remote only\n');
    const conflicts = await context.filesystem.readdir('.tau/artifacts/sync-conflicts');
    expect(conflicts).toHaveLength(1);
    expect(await context.filesystem.readFile(`.tau/artifacts/sync-conflicts/${conflicts[0]}`, 'utf8')).toBe(
      'old local output\n',
    );

    await run(actors.sync.push, { remote: 'tau', branch: 'main', leases: { 'refs/tau/evidence/exports': head } });
    expect(new TextDecoder().decode(offered?.get('exports/shared.step'))).toBe('new remote output\n');
    expect(new TextDecoder().decode(offered?.get('exports/local.step'))).toBe('local only\n');
    expect(new TextDecoder().decode(offered?.get('exports/remote.step'))).toBe('remote only\n');
    expect(offered?.entries().some((entry) => entry.path.startsWith('.tau/artifacts/sync-conflicts/'))).toBe(true);
    expect(offeredParents).toContain(head);
  }, 30_000);
});

for (const actorSet of actorSets) {
  describe.runIf(actorSet.enabled)(`merging two lines — ${actorSet.name}`, () => {
    /** A project on `main` with a `feature` branch that moved on from the same base. */
    const twoLines = async (
      /* `theirs: undefined` is a delete on the feature side — the other half of a
       modify-delete, which a resolution has to be able to answer (review R7). */
      sides: Readonly<{ ours: string; theirs: string | undefined; extra?: Readonly<Record<string, string>> }>,
    ): Promise<Fixture & { readonly base: string; readonly ours: string; readonly theirs: string }> => {
      const context = await fixture({ 'a.txt': 'base\n' }, (filesystem) => filesystem, { actorSet: actorSet.name });
      const { port, filesystem } = context;
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      await port.setHead('main');
      /* The store generates its own ignore file, and it is versioned like any
       other authored path — so every hand-written tree here carries it, or the
       live checkout reads as dirty against its own head. */
      const generated = await Promise.all(
        [generatedGitattributesPath, generatedIgnorePath].map(
          async (path) => [path, new TextDecoder().decode(await filesystem.readFile(path))] as const,
        ),
      );
      const write = async (
        content: Readonly<Record<string, string>>,
        parents: readonly string[],
        summary: string,
      ): Promise<string> => {
        const receipt = await port.writeRevision({
          parents: parents.map((parent) => revisionId(parent)),
          tree: new ImmutableRevisionTree([...generated, ...Object.entries(content)]),
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
      const before = await captureMainAndLiveTrees(port, filesystem);

      const outcome = await run<{ status: string; paths?: readonly string[] }>(actors.branch.merge, {
        projectId: 'project-1',
        branch: 'feature',
        into: 'main',
      });

      expect(outcome).toStrictEqual({ status: 'conflicted', paths: ['a.txt'] });
      /* AC14 first clause: `main` and the live checkout are byte-identical. */
      expect(before.head).toBe(ours);
      expect(before.tree).toBeDefined();
      expect(await captureMainAndLiveTrees(port, filesystem)).toStrictEqual(before);

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

    it('loads a sync conflict from its dedicated branch', async () => {
      const { port, actors, theirs } = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
      await port.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: revisionId(theirs) });

      const outcome = await run<{ status: string; branch?: string; paths?: readonly string[] }>(actors.sync.merge, {
        projectId: 'project-1',
        remote: 'tau',
        branch: 'main',
      });
      expect(outcome).toStrictEqual({
        status: 'conflicted',
        branch: 'sync/tau/main',
        into: 'main',
        paths: ['a.txt'],
      });

      const conflict = await port.readRef('sync/tau/main');
      await expect(
        run<{ paths: ReadonlyArray<{ path: string }> }>(actors.resolution.loadConflict, {
          projectId: 'project-1',
          revisionId: conflict,
        }),
      ).resolves.toMatchObject({ paths: [{ path: 'a.txt' }] });
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

    it('restores the target checkout when publishing the merge loses its lease', async () => {
      const context = await twoLines({ ours: 'base\n', theirs: 'theirs\n', extra: { 'b.txt': 'theirs only\n' } });
      const refusingPort: RevisionPort = {
        ...context.port,
        updateRef: async (input) =>
          input.name === 'main'
            ? {
                status: 'conflicted',
                name: input.name,
                expectedHead: input.expectedHead,
                actualHead: revisionId(context.ours),
                proposedHead: input.head,
              }
            : context.port.updateRef(input),
      };
      const actors = createRevisionActors({
        port: refusingPort,
        projectId: 'project-1',
        authorityEpoch: 'epoch-1',
        filesystem: () => context.filesystem,
      });

      await expect(
        run(actors.branch.merge, { projectId: 'project-1', branch: 'feature', into: 'main' }),
      ).rejects.toThrow(/moved while the merge was running/u);
      expect(await context.port.readRef('main')).toBe(context.ours);
      expect(await context.filesystem.readFile('a.txt', 'utf8')).toBe('base\n');
      expect(await context.filesystem.exists('b.txt')).toBe(false);
    }, 30_000);

    it('refuses to overwrite work no revision holds', async () => {
      const { actors, filesystem } = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
      await filesystem.writeFile('a.txt', 'unsaved\n');

      await expect(
        run(actors.branch.merge, { projectId: 'project-1', branch: 'feature', into: 'main' }),
      ).rejects.toThrow(/not in a revision yet/u);
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
        const context = await twoLines({
          ours: 'mine\n',
          theirs: 'theirs\n',
          extra: { 'settled.txt': 'theirs only\n' },
        });
        const revision = await conflicted(context);
        const before = await captureMainAndLiveTrees(context.port, context.filesystem);

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
        expect(before.head).toBe(context.ours);
        expect(before.tree).toBeDefined();
        expect(await captureMainAndLiveTrees(context.port, context.filesystem)).toStrictEqual(before);
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
}

describe('the durable queue’s writer', () => {
  const queuePath = '.git/sync-pending';

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

/**
 * Ruling P51 (W18 DEF-1): *Connect Tau Cloud* is the verb that registers the
 * project on it. The git server authorizes against a `project` row that, until
 * P51, only publishing ever wrote — after a push — so a never-published project
 * answered `404` on both advertisements and could not be connected at all.
 *
 * `authorize` is where it runs: before `validating` asks for an advertisement.
 */
describe('connecting a remote', () => {
  it('pauses the old destination rather than erasing its queue and tracking refs (C12)', async () => {
    const { actors, port, filesystem } = await fixture({ 'main.scad': 'cube(1);\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['main.scad', 'cube(1);\n']]),
      provenance: { source: 'user', actorId: 'user-1', createdAt: 1 },
      summary: { generated: 'Local work' },
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'refs/remotes/origin/main', expectedHead: undefined, head });
    await port.setRemote({ name: 'origin', url: 'https://github.com/old/project.git' });
    await run<void>(actors.sync.writePending, {
      projectId: 'project-1',
      record: { version: 1, entries: [{ ref: 'refs/heads/main', reason: 'offline', recordedAt: 1 }] },
    });

    await run(actors.remote.writeRemote, {
      projectId: 'project-1',
      kind: 'git',
      url: 'https://github.com/new/project.git',
      provider: 'github',
      repositoryId: '22',
    });

    /* The lease a reconnect would compare against, and the work that never
     * reached any remote, both survive the replacement: policy Rule 9 pauses
     * the old destination's queue, and `SyncQueueEntry.remote` is what keeps
     * the entry from being offered to the new one. */
    expect(await port.readRef('refs/remotes/origin/main')).toBe(head);
    expect(JSON.parse(await filesystem.readFile('.git/sync-pending', 'utf8'))).toEqual({
      version: 1,
      entries: [{ ref: 'refs/heads/main', reason: 'offline', recordedAt: 1 }],
    });
    expect(await port.listRemotes()).toEqual([
      expect.objectContaining({ name: 'github-22', url: 'https://github.com/new/project.git', repositoryId: '22' }),
    ]);
  });

  it('registers the project on Tau Cloud, and only on Tau Cloud', async () => {
    const registered: string[] = [];
    const registerRemoteProject = vi.fn(async (id: string) => {
      registered.push(id);
    });
    const { actors } = await fixture({}, (filesystem) => filesystem, { registerRemoteProject });

    await run(actors.remote.authorize, { kind: 'tau', url: 'https://api.tau.new/v1/git/project-1.git' });
    expect(registered).toEqual(['project-1']);

    await run(actors.remote.authorize, { kind: 'git', url: 'https://github.com/owner/repository.git' });
    expect(registered).toEqual(['project-1']);
  });

  it('connects without a host that can register, as every host did before P51', async () => {
    const { actors } = await fixture();
    await expect(
      run(actors.remote.authorize, { kind: 'tau', url: 'https://api.tau.new/v1/git/project-1.git' }),
    ).resolves.toBeUndefined();
  });

  it('fails the connection when Tau Cloud refuses the registration', async () => {
    const registerRemoteProject = vi.fn(async () => {
      throw new Error('That project id already belongs to another account.');
    });
    const { actors } = await fixture({}, (filesystem) => filesystem, { registerRemoteProject });
    await expect(
      run(actors.remote.authorize, { kind: 'tau', url: 'https://api.tau.new/v1/git/project-1.git' }),
    ).rejects.toThrow('another account');
  });
});

/**
 * EQ6 / W10.6: the layout is data, so revisions read the classifier they are given.
 *
 * Four `classify` sites inside the actor closure and one in `portable-tree.ts`
 * imported Tau's own registry directly, which made the rule "what Tau's layout
 * says" rather than "what this project's policy says" — the same coupling D6
 * removed from the composed view in L1.
 */
describe('the path policy a project is given', () => {
  /* Everything under `drawings/` is this policy's derived output; nothing else
   * is. Tau's own rows say the opposite about all four of these paths, so a
   * capture that still read the registry cannot pass. */
  const testPolicy = {
    classify: (path: string) =>
      path.startsWith('drawings/') ? { ...unlistedPathClassification, versioned: false } : unlistedPathClassification,
  };

  it('excludes what that policy says and captures what Tau’s own rows would hide', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' }, (given) => given, {
      policy: testPolicy,
    });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await filesystem.writeFile('drawings/plan.dxf', 'DXF\n');
    await filesystem.writeFile('node_modules/left/index.js', 'module.exports = 1;\n');
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
    const paths = (tree?.entries() ?? []).map((entry) => entry.path).sort();

    /* This policy's own exclusion holds… */
    expect(paths).not.toContain('drawings/plan.dxf');
    /* …and Tau's, which this project never named, does not apply. */
    expect(paths).toContain('node_modules/left/index.js');
    expect(paths).toContain('thumbnail.webp');
  }, 30_000);
});
