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

import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor, createMachine } from 'xstate';

import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { captureRevisionTree, ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { FileStatEntry, RootedFileSystem } from '@taucad/filesystem';
import { classify, unlistedPathClassification } from '@taucad/filesystem/path-registry';

import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { lfsObjectPath, lfsPointerFor } from '#lfs.js';
import { writeChatRef } from '#chat-ref.js';
import { materializeConflict, readConflictTerms } from '#revision-conflict.js';
import { RevisionPortError } from '#revision-port.js';
import type { ConflictRecord, RevisionPort } from '#revision-port.js';
import { gitToolchainOnPath, nativeHarness } from '#test/native-git-harness.js';
import { generatedGitattributesPath, generatedIgnorePath } from '#workspace-config.js';
import { createOpsLog, opsRefName } from '#ops-ref.js';
import { selectRevisionStatus } from '#project-revisions.machine.js';
import {
  createProjectRevisionsActor as createProjectRevisionsActorUntracked,
  createRevisionActors as createRevisionActorsUntracked,
  describeTurnRelease,
  revisionTreeId,
  admissionMilliseconds,
  syncQuiesceMilliseconds,
} from '#revision-effects.js';
import type { RevisionActors, RevisionActorsOptions } from '#revision-effects.js';
import type { ParameterRecordCodec, RevisionId } from '#algorithms/index.js';
import type { SyncMergeActorOutput } from '#sync.machine.js';
import type { RevisionStreamHandlers } from '#revision-stream.js';
import { syncPullDeadlineMilliseconds } from '#sync.machine.js';
import { turnCutSettlementMilliseconds } from '#turn.machine.js';

const roots: string[] = [];

/* A fixture's effects may still be committing the operation log (B1): wait, then remove. */
const settles: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(settles.splice(0).map(async (settle) => settle()));
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const createRevisionActors: typeof createRevisionActorsUntracked = (options) => {
  const actors = createRevisionActorsUntracked(options);
  settles.push(actors.settled);
  return actors;
};

const createProjectRevisionsActor: typeof createProjectRevisionsActorUntracked = (options) => {
  const created = createProjectRevisionsActorUntracked(options);
  settles.push(created.settled);
  return created;
};

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
  { name: 'native-git', enabled: gitToolchainOnPath },
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

/** The record device (R1) the conflict-line fixtures record as. */
const recorderDevice = '00000000-0000-4000-8000-00000000000a';

/**
 * Name the record device a host's `host` form records under, before any effect
 * reads `.git/ops-devices.json`.
 *
 * @param filesystem - The records filesystem `.git/` lives in.
 * @param device - The record device id.
 */
const ownRecordDevice = async (filesystem: RootedFileSystem, device: string): Promise<void> => {
  await filesystem.writeFile('.git/ops-devices.json', JSON.stringify({ version: 1, devices: { host: device } }));
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

describe('lifecycle bounds', () => {
  it('nests every inner bound strictly inside the wait that awaits it (rule 9)', () => {
    expect(syncPullDeadlineMilliseconds).toBeLessThan(syncQuiesceMilliseconds);
    expect(turnCutSettlementMilliseconds).toBeLessThan(admissionMilliseconds);
  });
});

describe('the capture memo', () => {
  it('reads a same-size rewrite after the clock steps back, instead of trusting the high-water mark (RV-W4W5a #5)', async () => {
    const realNow = Date.now();
    /* The wall clock ran a minute ahead for the first capture, then was corrected. */
    let reading = realNow + 60_000;
    const { port, actors, root } = await fixture(
      { 'part.ts': 'zzzz\n' },
      (real) =>
        /* The memo engages only where the tree can be stat'ed in one call, as
         * the workspace views can and the bare provider cannot. */
        Object.assign(Object.create(real) as RootedFileSystem, {
          statTree: async (): Promise<FileStatEntry[]> => {
            const stat = await real.stat('part.ts');
            return [{ ...stat, path: 'part.ts', name: 'part.ts' }];
          },
        }),
      { clock: () => reading },
    );
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await run(actors.checkout.captureTree, { checkoutId: 'live' });

    reading = realNow;
    /* Written moments ago by the corrected clock: too recent to trust. */
    const writtenAt = new Date(realNow - 500);
    await writeFile(join(root, 'part.ts'), 'aaaa\n');
    await utimes(join(root, 'part.ts'), writtenAt, writtenAt);
    const before = await run<{ treeId: string }>(actors.checkout.captureTree, { checkoutId: 'live' });
    /* Same size, same timestamp: only the racy-time guard can tell. */
    await writeFile(join(root, 'part.ts'), 'bbbb\n');
    await utimes(join(root, 'part.ts'), writtenAt, writtenAt);
    const after = await run<{ treeId: string }>(actors.checkout.captureTree, { checkoutId: 'live' });

    expect(after.treeId).not.toBe(before.treeId);
  }, 30_000);
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
      /cannot be checked out together on every computer.*Main\.ts/u,
    );
  }, 30_000);

  it('refuses a capture holding one name in two Unicode spellings (L2-F7)', async () => {
    const composed = 'caf\u00E9.ts';
    const decomposed = 'cafe\u0301.ts';
    const { port, actors, filesystem } = await fixture({ [composed]: 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    await filesystem.writeFile(decomposed, 'export const size = 2;\n');
    const entries = await filesystem.readdir('');

    if (!entries.includes(composed) || !entries.includes(decomposed)) {
      /* A normalizing filesystem (APFS, HFS+): both spellings name one file, so there is nothing to refuse. */
      return;
    }
    await expect(run(actors.checkout.cut, { checkoutId: 'live', trigger: 'save' })).rejects.toThrow(
      /cannot be checked out together on every computer/u,
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

type TreeFact = Readonly<{ type: string; trigger?: string; revisionId?: string; checkoutId?: string }>;

/**
 * The composed project tree over a fixture's port, as a host runs it.
 *
 * A restore is three steps the root routes between its children — the
 * pre-restore cut, the apply, the `restore` cut — so its claims are made
 * through the tree, not by driving one child's actors by hand.
 */
const startTree = async (
  port: RevisionPort,
  filesystem: RootedFileSystem,
  extra: Partial<RevisionActorsOptions> = {},
) => {
  const { actor } = createProjectRevisionsActor({
    port,
    projectId: 'project-1',
    authorityEpoch: 'epoch-1',
    filesystem: async () => filesystem,
    ...extra,
  });
  const facts: TreeFact[] = [];
  actor.on('*', (event) => {
    facts.push(event as TreeFact);
  });
  actor.start();
  await expect.poll(() => actor.getSnapshot().context.registrySettled, { timeout: 10_000 }).toBe(true);
  const mintedIds = (): readonly string[] =>
    facts.flatMap((fact) => (fact.type === 'revisionMinted' && fact.revisionId !== undefined ? [fact.revisionId] : []));
  /** The `count`th revision a cut with this trigger minted, once it has. */
  const minted = async (trigger: string, count = 1): Promise<string> => {
    const answers = () => facts.filter((fact) => fact.trigger === trigger && fact.type !== 'checkoutStatusChanged');
    await expect.poll(() => answers().length, { timeout: 20_000 }).toBeGreaterThanOrEqual(count);
    const answer = answers()[count - 1];
    if (answer?.type !== 'revisionMinted' || answer.revisionId === undefined) {
      throw new Error(`The ${trigger} cut answered ${String(answer?.type)}.`);
    }
    return answer.revisionId;
  };
  let saves = 0;
  const save = async (): Promise<string> => {
    saves += 1;
    actor.send({
      type: 'cut',
      trigger: 'save',
      checkoutId: selectRevisionStatus(actor.getSnapshot()).checkoutId,
      leaseIds: [],
    });
    return minted('save', saves);
  };
  return { actor, facts, minted, mintedIds, save };
};

describe('restore, through the machine that owns it', () => {
  it('should materialize original bytes from a pointerised revision tree', async () => {
    const original = 'solid bracket\nendsolid bracket\n';
    const { port, actors, filesystem } = await fixture({ 'models/bracket.step': original });
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
    const { pointer } = lfsPointerFor(new TextEncoder().encode(original));
    expect(await filesystem.readFile(`.git/${lfsObjectPath(pointer.oid)}`, 'utf8')).toBe(original);

    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(written.revisionId) });
    await filesystem.writeFile('models/bracket.step', 'solid changed\nendsolid changed\n');
    const changed = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const second = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: changed.cutId,
      treeId: changed.treeId,
      parents: [written.revisionId],
      trigger: 'save',
      leaseIds: [],
    });
    await port.updateRef({
      name: 'main',
      expectedHead: revisionId(written.revisionId),
      head: revisionId(second.revisionId),
    });
    const plan = await run<{ planId: string }>(actors.restore.computePlan, {
      checkoutId: 'live',
      target: written.revisionId,
    });
    await run(actors.restore.applyPlan, { checkoutId: 'live', planId: plan.planId });

    expect(await filesystem.readFile('models/bracket.step', 'utf8')).toBe(original);
  }, 30_000);

  it('restores by minting a restore revision on main, never a detached head (T3)', async () => {
    const release = vi.fn();
    const onApplyingTree = vi.fn(() => release);
    const { port, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const tree = await startTree(port, filesystem, { onApplyingTree });
    const first = await tree.save();
    /* A second revision that adds a file, so restoring the first is a deletion
     * — the risky plan that needs confirmation. */
    await filesystem.writeFile('extra.txt', 'added later\n');
    const second = await tree.save();

    const restoreRef = tree.actor.getSnapshot().children.restore;
    restoreRef?.send({ type: 'restore', revisionId: first });
    await expect.poll(() => restoreRef?.getSnapshot().value, { timeout: 10_000 }).toBe('confirming');
    /* The plan is the real one: restoring the first revision removes the file
     * the second added, and nothing else; the line numbers it `Rev 1`. */
    expect(restoreRef?.getSnapshot().context.removedPathCount).toBe(1);
    expect(restoreRef?.getSnapshot().context.revisionNumber).toBe(1);

    restoreRef?.send({ type: 'confirm' });
    /* The first `restore` answer is the pre-restore cut's: a clean tree mints nothing. */
    const restored = await tree.minted('restore', 2);

    /* `main` fast-forwarded to a new revision whose tree is the restored one. */
    await expect(port.readRef('main')).resolves.toBe(restored);
    const record = await port.readRevision(revisionId(restored));
    expect(record?.parents).toEqual([second]);
    const firstRecord = await port.readRevision(revisionId(first));
    expect(record?.treeId).toBe(firstRecord?.treeId);
    expect(record?.provenance).toMatchObject({ source: 'restore', trigger: 'restore', restoredFrom: first });
    expect(record?.summary.generated).toBe('Restored Rev 1');
    expect(selectRevisionStatus(tree.actor.getSnapshot())).toMatchObject({
      line: { kind: 'branch', name: 'main' },
      headRevisionId: restored,
    });
    expect(tree.facts.filter((fact) => fact.type === 'checkoutChanged')).toEqual([]);
    expect(await filesystem.exists('extra.txt')).toBe(false);
    expect(onApplyingTree).toHaveBeenCalledWith(expect.objectContaining({ id: 'live' }), ['extra.txt']);
    expect(release).toHaveBeenCalledOnce();
    tree.actor.stop();
  }, 30_000);

  it('mints a dirty checkout before restoring it, and leaves no revision unreachable (I1, L1 probe)', async () => {
    const { port, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const tree = await startTree(port, filesystem);
    const first = await tree.save();
    await filesystem.writeFile('late.ts', 'export const late = true;\n');
    const second = await tree.save();
    /* Unsaved work: the bytes a restore must never discard without minting. */
    await filesystem.writeFile('main.ts', 'export const size = 3;\n');

    const restoreRef = tree.actor.getSnapshot().children.restore;
    restoreRef?.send({ type: 'restore', revisionId: first });
    const before = await tree.minted('restore');
    await expect.poll(() => restoreRef?.getSnapshot().value, { timeout: 10_000 }).toBe('confirming');
    restoreRef?.send({ type: 'confirm' });
    const restored = await tree.minted('restore', 2);

    /* Two rows: the pre-restore cut (the person's own bytes) and the restore. */
    const beforeRecord = await port.readRevision(revisionId(before));
    expect(beforeRecord?.parents).toEqual([second]);
    expect(beforeRecord?.provenance).toMatchObject({ source: 'user', trigger: 'restore' });
    expect(beforeRecord?.provenance.restoredFrom).toBeUndefined();
    const beforeTree = await port.readTree(revisionId(before));
    expect(beforeTree?.has('late.ts')).toBe(true);
    const restoredRecord = await port.readRevision(revisionId(restored));
    expect(restoredRecord?.parents).toEqual([before]);

    /* L1's probe, re-run: a save after the restore moves `main` forward and
     * every revision this tree minted is reachable from a ref — no orphan. */
    await filesystem.writeFile('main.ts', 'export const size = 4;\n');
    const after = await tree.save();
    const afterRecord = await port.readRevision(revisionId(after));
    expect(afterRecord?.parents).toEqual([restored]);
    await expect(port.readRef('main')).resolves.toBe(after);
    const history = await port.log({ heads: [revisionId(after)] });
    const reachable = new Set(history.map((entry) => entry.id));
    expect(tree.mintedIds().filter((id) => !reachable.has(revisionId(id)))).toEqual([]);
    expect(tree.facts.map((fact) => fact.type)).not.toContain('casLost');

    /* *Undo restore* restores the restore row's first parent (D2): the dirty work comes back. */
    restoreRef?.send({ type: 'undo' });
    const undone = await tree.minted('restore', 4);
    const undoneRecord = await port.readRevision(revisionId(undone));
    expect(undoneRecord?.provenance.restoredFrom).toBe(before);
    expect(await filesystem.readFile('main.ts', 'utf8')).toBe('export const size = 3;\n');
    tree.actor.stop();
  }, 60_000);

  it('stays on its line when the target is another branch’s tip (A5)', async () => {
    const { port, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const tree = await startTree(port, filesystem);
    const first = await tree.save();
    await filesystem.writeFile('main.ts', 'export const size = 2;\n');
    const second = await tree.save();
    /* `other` names the first revision, so the old apply would have moved HEAD onto it. */
    await port.updateRef({ name: 'other', expectedHead: undefined, head: revisionId(first) });

    tree.actor.getSnapshot().children.restore?.send({ type: 'restore', revisionId: first });
    const restored = await tree.minted('restore', 2);

    const head = await port.readHead();
    expect(head).toMatchObject({ branch: 'main', head: restored });
    await expect(port.readRef('other')).resolves.toBe(first);
    const restoredRecord = await port.readRevision(revisionId(restored));
    expect(restoredRecord?.parents).toEqual([second]);
    tree.actor.stop();
  }, 30_000);

  it('reads a checkout spawned over a stale tree as dirty, after a first render that waited for nothing (D4)', async () => {
    const { port, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const first = await startTree(port, filesystem);
    await first.save();
    first.actor.stop();
    /* Bytes that changed while no actor watched: a reload over an edited tree. */
    await filesystem.writeFile('main.ts', 'export const size = 5;\n');

    const reopened = await startTree(port, filesystem);

    await expect.poll(() => selectRevisionStatus(reopened.actor.getSnapshot()).dirty, { timeout: 10_000 }).toBe(true);
    reopened.actor.stop();
  }, 30_000);

  it('numbers a restore by the line’s first-parent ordinal and invents none off the line (D5, A9)', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const write = async (parents: readonly string[]): Promise<string> => {
      const cut = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
        checkoutId: 'live',
        trigger: 'save',
      });
      const written = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
        checkoutId: 'live',
        cutId: cut.cutId,
        treeId: cut.treeId,
        parents,
        trigger: 'save',
        leaseIds: [],
      });
      return written.revisionId;
    };
    const first = await write([]);
    await filesystem.writeFile('other.ts', 'export const other = 1;\n');
    /* Another line's revision, recorded between main's two: a whole-graph index
     * would count it and name main's second revision `Rev 3`. */
    const aside = await write([first]);
    await port.updateRef({ name: 'other', expectedHead: undefined, head: revisionId(aside) });
    await filesystem.unlink('other.ts');
    await filesystem.writeFile('main.ts', 'export const size = 2;\n');
    const second = await write([first]);
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(second) });

    const onLine = await run<{ revisionNumber: number | undefined }>(actors.restore.computePlan, {
      checkoutId: 'live',
      target: second,
    });
    const offLine = await run<{ revisionNumber: number | undefined }>(actors.restore.computePlan, {
      checkoutId: 'live',
      target: aside,
    });

    expect(onLine.revisionNumber).toBe(2);
    expect(offLine.revisionNumber).toBeUndefined();
  }, 30_000);

  it('applies nothing when the files changed after the plan (A3)', async () => {
    const { port, actors, filesystem } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const cut = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const first = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: cut.cutId,
      treeId: cut.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(first.revisionId) });
    const plan = await run<{ planId: string }>(actors.restore.computePlan, {
      checkoutId: 'live',
      target: first.revisionId,
    });
    /* A write that lands after the pre-restore cut and the plan. */
    await filesystem.writeFile('main.ts', 'export const size = 9;\n');

    await expect(run(actors.restore.applyPlan, { checkoutId: 'live', planId: plan.planId })).rejects.toMatchObject({
      code: 'CHECKOUT_CONFLICT',
    });
    expect(await filesystem.readFile('main.ts', 'utf8')).toBe('export const size = 9;\n');
  }, 30_000);

  it('applies nothing, in the agent sentence, when a turn took the files while the question was open (A3, M4)', async () => {
    const { port, actors } = await fixture({ 'main.ts': 'export const size = 1;\n' });
    await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const cut = await run<{ treeId: string; cutId: string }>(actors.checkout.cut, {
      checkoutId: 'live',
      trigger: 'save',
    });
    const first = await run<{ revisionId: string }>(actors.checkout.writeRevision, {
      checkoutId: 'live',
      cutId: cut.cutId,
      treeId: cut.treeId,
      parents: [],
      trigger: 'save',
      leaseIds: [],
    });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(first.revisionId) });
    const plan = await run<{ planId: string }>(actors.restore.computePlan, {
      checkoutId: 'live',
      target: first.revisionId,
    });
    /* Another window's turn leases the checkout before the person confirms. */
    await run(actors.turn.writeLease, {
      runId: 'run-1',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'live',
      baseRevisionId: first.revisionId,
    });

    await expect(run(actors.restore.applyPlan, { checkoutId: 'live', planId: plan.planId })).rejects.toMatchObject({
      code: 'LEASE_UNAVAILABLE',
      message: 'An agent is working in this project’s files.',
    });
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

    it('fast-forwards an unborn checkout that holds only files the remote already has (E2E-D defect A)', async () => {
      const unborn = async (localProject: string) => {
        const context = await fixture({ 'tau.json': localProject }, (filesystem) => filesystem, {
          actorSet: actorSet.name,
        });
        await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
        await context.port.setHead('main');
        const remoteReceipt = await context.port.writeRevision({
          parents: [],
          tree: new ImmutableRevisionTree([
            ['tau.json', '{"id":"project-1"}\n'],
            ['main.scad', 'cube(1);\n'],
          ]),
          provenance: { source: 'user', actorId: 'grace', createdAt: Date.UTC(2026, 8, 13) },
          summary: { generated: 'Remote' },
        });
        const remote = revisionId(remoteReceipt.commitId);
        await context.port.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: remote });
        return { ...context, remote };
      };

      /* The opener's `tau.json` is the remote's own: nothing here is work, so the pull lands as is. */
      const opened = await unborn('{"id":"project-1"}\n');
      await expect(run(opened.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).resolves.toStrictEqual({
        checkoutId: 'live',
        revisionId: opened.remote,
        treeId: expect.any(String) as string,
      });
      expect(await opened.port.readRef('main')).toBe(opened.remote);
      expect(await opened.filesystem.readFile('main.scad', 'utf8')).toBe('cube(1);\n');

      /* A file the remote holds differently is still work: minted first (rule 6), never overwritten. */
      const edited = await unborn('{"id":"project-1","name":"mine"}\n');
      await expect(run(edited.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).resolves.toMatchObject({
        status: 'held',
        hold: 'dirty',
        revisionId: edited.remote,
      });
      expect(await edited.port.readRef('main')).toBeUndefined();
      expect(await edited.filesystem.readFile('tau.json', 'utf8')).toBe('{"id":"project-1","name":"mine"}\n');
    }, 30_000);

    /* W13c + W13d: the same rule for a cut taken before that pull lands (a close, a hidden tab), or before any fetch. */
    it('cuts nothing to save on an unborn checkout that holds only what its open brings', async () => {
      const unbornCut = async (files: Readonly<Record<string, string>>, fetched = true, connected = true) => {
        const context = await fixture(files, (filesystem) => filesystem, { actorSet: actorSet.name });
        await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
        await context.port.setHead('main');
        if (connected) {
          await context.port.setRemote({ name: 'tau', url: 'https://tau.test/v1/git/project-1.git' });
        }
        const remoteReceipt = await context.port.writeRevision({
          parents: [],
          tree: new ImmutableRevisionTree([
            ['tau.json', '{"id":"project-1"}\n'],
            ['main.scad', 'cube(1);\n'],
          ]),
          provenance: { source: 'user', actorId: 'grace', createdAt: Date.UTC(2026, 8, 13) },
          summary: { generated: 'Remote' },
        });
        if (fetched) {
          await context.port.updateRef({
            name: 'refs/remotes/tau/main',
            expectedHead: undefined,
            head: revisionId(remoteReceipt.commitId),
          });
        }
        return run<{ treeId: string; cutId: string; nothingToSave?: boolean }>(context.actors.checkout.cut, {
          checkoutId: 'live',
          trigger: 'close',
        });
      };

      await expect(unbornCut({ 'tau.json': '{"id":"project-1"}\n' })).resolves.toMatchObject({ nothingToSave: true });
      /* Work the remote does not hold is still work: the cut is an ordinary one. */
      await expect(unbornCut({ 'tau.json': '{"id":"project-1","name":"mine"}\n' })).resolves.not.toHaveProperty(
        'nothingToSave',
      );
      await expect(unbornCut({ 'tau.json': '{"id":"project-1"}\n', 'notes.md': 'mine\n' })).resolves.not.toHaveProperty(
        'nothingToSave',
      );
      /* W13d: never fetched — a fresh device opened offline — the opener's own manifest is setup too… */
      await expect(unbornCut({ 'tau.json': '{"id":"project-1","name":"mine"}\n' }, false)).resolves.toMatchObject({
        nothingToSave: true,
      });
      /* …but not another project's manifest, nor any other file. */
      await expect(unbornCut({ 'tau.json': '{"id":"project-2"}\n' }, false)).resolves.not.toHaveProperty(
        'nothingToSave',
      );
      await expect(
        unbornCut({ 'tau.json': '{"id":"project-1"}\n', 'notes.md': 'mine\n' }, false),
      ).resolves.not.toHaveProperty('nothingToSave');
      /* No remote, no pull to merge a root into: an unborn line's first cut is an ordinary one. */
      await expect(unbornCut({ 'tau.json': '{"id":"project-1"}\n' }, false, false)).resolves.not.toHaveProperty(
        'nothingToSave',
      );
    }, 30_000);

    it('preserves dirty and leased files, and rejects protected target paths before writing', async () => {
      const context = await synchronized();
      await context.filesystem.writeFile('main.ts', 'unsaved\n');
      /* Held, not failed (D12): the scheduler mints a dirty checkout first. */
      await expect(run(context.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).resolves.toMatchObject({
        status: 'held',
        hold: 'dirty',
        revisionId: context.remote,
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
      /* And a leased one waits for its lease (rule 9). */
      await expect(run(context.actors.sync.fastForward, { remote: 'tau', branch: 'main' })).resolves.toMatchObject({
        status: 'held',
        hold: 'leased',
        revisionId: context.remote,
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
      const running = createActor(heldActors.sync.fastForward, {
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

    /**
     * Two lines from one base: `local` is this device's head and its files,
     * `remote` is what the fetch left in `refs/remotes/tau/main`.
     *
     * @param lines - The base files, and what each side changed.
     * @param extra - Host options, such as the parameters codec.
     * @returns The fixture and the three revisions.
     */
    const divergedLines = async (
      lines: Readonly<{
        base: Readonly<Record<string, string>>;
        local: Readonly<Record<string, string>>;
        remote: Readonly<Record<string, string>>;
      }>,
      extra: FixtureOptions = {},
    ) => {
      const context = await fixture(lines.base, (filesystem) => filesystem, {
        actorSet: actorSet.name,
        deviceId: () => 'device-a',
        ...extra,
      });
      const { port, filesystem } = context;
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      const capture = async () => captureRevisionTree(filesystem, { exclude: (path) => !classify(path).versioned });
      const record = async (parents: readonly RevisionId[], tree: ImmutableRevisionTree, summary: string) => {
        const written = await port.writeRevision({
          parents,
          tree,
          provenance: { source: 'user', actorId: summary, createdAt: Date.UTC(2026, 8, 25) },
          summary: { generated: summary },
        });
        return revisionId(written.commitId);
      };
      const baseTree = await capture();
      const base = await record([], baseTree, 'Base');
      await port.updateRef({ name: 'main', expectedHead: undefined, head: base });
      await port.setHead('main');
      for (const [path, content] of Object.entries(lines.local)) {
        // oxlint-disable-next-line no-await-in-loop -- a handful of fixture files, in order.
        await filesystem.writeFile(path, content);
      }
      const local = await record([base], await capture(), 'Local');
      await port.updateRef({ name: 'main', expectedHead: base, head: local });
      const remoteTree = new ImmutableRevisionTree([
        ...baseTree
          .entries()
          .filter((entry) => !(entry.path in lines.remote))
          .map((entry) => [entry.path, entry.content, entry.mode] as const),
        ...Object.entries(lines.remote),
      ]);
      const remote = await record([base], remoteTree, 'Remote');
      await port.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: remote });
      return { ...context, base, local, remote };
    };

    it('auto-merges a diverged clean checkout that changed other files, and lands the merge revision (D12)', async () => {
      const context = await divergedLines({
        base: { 'main.ts': 'base\n' },
        local: { 'local.ts': 'mine\n' },
        remote: { 'main.ts': 'theirs\n' },
      });

      const outcome = await run<SyncMergeActorOutput>(context.actors.sync.merge, { remote: 'tau', branch: 'main' });

      const head = await context.port.readRef('main');
      expect(outcome).toEqual({
        status: 'merged',
        moved: { checkoutId: 'live', revisionId: head, treeId: expect.any(String) as string },
      });
      const landed = await context.port.readRevision(revisionId(head ?? ''));
      expect(landed?.parents).toEqual([context.local, context.remote]);
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('theirs\n');
      expect(await context.filesystem.readFile('local.ts', 'utf8')).toBe('mine\n');
    }, 30_000);

    it('applies nothing to a checkout a turn holds, and says it is held rather than failed (rule 9)', async () => {
      const context = await divergedLines({
        base: { 'main.ts': 'base\n' },
        local: { 'local.ts': 'mine\n' },
        remote: { 'main.ts': 'theirs\n' },
      });
      await run(context.actors.turn.writeLease, {
        runId: 'run-1',
        turnId: 'turn-1',
        chatId: 'chat-1',
        checkoutId: 'live',
      });
      const held = { status: 'held', hold: 'leased', checkoutId: 'live', revisionId: context.remote };

      /* Clean: nothing is re-based under the turn. */
      await expect(run(context.actors.sync.merge, { remote: 'tau', branch: 'main' })).resolves.toEqual(held);
      expect(await context.port.readRef('main')).toBe(context.local);
      expect(await context.filesystem.readFile('main.ts', 'utf8')).toBe('base\n');

      /* The turn's own writes make the checkout dirty; it is still read as leased, never minted. */
      await context.filesystem.writeFile('local.ts', 'the agent is writing\n');
      await expect(run(context.actors.sync.merge, { remote: 'tau', branch: 'main' })).resolves.toEqual(held);
      expect(await context.port.readRef('main')).toBe(context.local);

      /* The same guard refuses a person's *Merge into* in the agent sentence. */
      await context.port.updateRef({ name: 'side', expectedHead: undefined, head: context.remote });
      await expect(
        run(context.actors.branch.merge, { projectId: 'project-1', branch: 'side', into: 'main' }),
      ).rejects.toThrow('An agent is working in this project’s files.');
    }, 30_000);

    it('holds a dirty checkout for its merge cut instead of refusing the merge (D12)', async () => {
      const context = await divergedLines({
        base: { 'main.ts': 'base\n' },
        local: { 'local.ts': 'mine\n' },
        remote: { 'main.ts': 'theirs\n' },
      });
      await context.filesystem.writeFile('local.ts', 'unsaved\n');

      await expect(run(context.actors.sync.merge, { remote: 'tau', branch: 'main' })).resolves.toMatchObject({
        status: 'held',
        hold: 'dirty',
        revisionId: context.remote,
      });
      expect(await context.port.readRef('main')).toBe(context.local);
      expect(await context.filesystem.readFile('local.ts', 'utf8')).toBe('unsaved\n');
    }, 30_000);

    it('merges disjoint `.tau/parameters` keys through the codec the host injects, at every merge (D12)', async () => {
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      const parameters: ParameterRecordCodec = {
        read: (bytes) => JSON.parse(decoder.decode(bytes)) as unknown,
        serialize: (record) => encoder.encode(`${JSON.stringify(record)}\n`),
      };
      const lines = {
        base: { '.tau/parameters/x.json': '{"a":1,"b":1}\n' },
        local: { '.tau/parameters/x.json': '{"a":2,"b":1}\n' },
        remote: { '.tau/parameters/x.json': '{"a":1,"b":2}\n' },
      };

      const withCodec = await divergedLines(lines, { parameters });
      await expect(run(withCodec.actors.sync.merge, { remote: 'tau', branch: 'main' })).resolves.toMatchObject({
        status: 'merged',
      });
      expect(JSON.parse(await withCodec.filesystem.readFile('.tau/parameters/x.json', 'utf8'))).toEqual({
        a: 2,
        b: 2,
      });

      /* Without one, the record is never merged unvalidated. */
      const withoutCodec = await divergedLines(lines);
      await expect(run(withoutCodec.actors.sync.merge, { remote: 'tau', branch: 'main' })).resolves.toMatchObject({
        status: 'conflicted',
        paths: ['.tau/parameters/x.json'],
      });
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
    const owner = (onGranted: () => void) =>
      createActor(
        createMachine({
          invoke: { src: fence, input: { checkoutId: 'live' } },
          on: {
            fenceGranted: (_, enq) => {
              enq(onGranted);
              return {};
            },
          },
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

  /** A project on `main` holding two chats, and actors over a port whose `push` the row answers. */
  const twoChatProject = async (
    answer: (input: Parameters<RevisionPort['push']>[0]) => Promise<Awaited<ReturnType<RevisionPort['push']>>>,
    wrap: (port: RevisionPort) => Partial<RevisionPort> = () => ({}),
    chatIds: readonly string[] = ['chat-one', 'chat-two'],
  ) => {
    const context = await fixture({
      'main.ts': 'base\n',
      ...Object.fromEntries(
        chatIds.flatMap((id) => [
          [`.tau/chats/${id}/chat.json`, `{"name":"${id}"}`],
          [`.tau/chats/${id}/events.jsonl`, `${id}\n`],
        ]),
      ),
    });
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
    const pushes: Array<Readonly<{ refs: readonly string[]; atomic: boolean }>> = [];
    const port: RevisionPort = {
      ...context.port,
      push: async (input) => {
        pushes.push({ refs: input.refs.map((ref) => ref.name), atomic: input.atomic === true });
        return answer(input);
      },
      ...wrap(context.port),
    };
    const actors = createRevisionActors({
      port,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => context.filesystem,
      deviceId: () => 'device-one',
    });
    return { ...context, pushes, actors };
  };

  /* W13c: N chats were N pushes, each its own advertisement; the record set is one non-atomic push now. */
  it('offers every record ref in one non-atomic push beside the atomic history push', async () => {
    const { pushes, actors, port } = await twoChatProject(async (input) => ({
      refs: await Promise.all(
        input.refs.map(
          async (ref) => ({ name: ref.name, status: 'updated', head: await port.readRef(ref.name) }) as const,
        ),
      ),
    }));

    const result = await run<{ refs: ReadonlyArray<{ name: string; status: string }> }>(actors.sync.push, {
      remote: 'tau',
      branch: 'main',
      leases: {},
    });
    expect(pushes).toEqual([
      { refs: ['refs/heads/main'], atomic: true },
      { refs: ['refs/tau/chats/chat-one', 'refs/tau/chats/chat-two'], atomic: false },
    ]);
    expect(result.refs.map((entry) => [entry.name, entry.status])).toEqual([
      ['refs/heads/main', 'updated'],
      ['refs/tau/chats/chat-one', 'updated'],
      ['refs/tau/chats/chat-two', 'updated'],
    ]);
  }, 30_000);

  /* The Tau Hosted Remote's `pre-receive` refuses a push whole: one refused chat must fail only itself. */
  it('re-offers each record alone when the record push was refused whole', async () => {
    const refusal = 'Tau: refused refs/tau/chats/chat-one — it rewrites events/x.jsonl';
    const { pushes, actors, port } = await twoChatProject(
      async (input) => ({
        refs: await Promise.all(
          input.refs.map(async (ref) =>
            input.refs.length > 1 && ref.name.startsWith('refs/tau/')
              ? ({ name: ref.name, status: 'rejected', head: undefined, reason: 'pre-receive hook declined' } as const)
              : ref.name === 'refs/tau/chats/chat-one'
                ? ({ name: ref.name, status: 'rejected', head: undefined, reason: refusal } as const)
                : ({ name: ref.name, status: 'updated', head: await port.readRef(ref.name) } as const),
          ),
        ),
      }),
      () => ({ listRemoteRefs: async () => [] }),
    );

    const result = await run<{ refs: ReadonlyArray<{ name: string; status: string; reason?: string }> }>(
      actors.sync.push,
      { remote: 'tau', branch: 'main', leases: {} },
    );
    expect(pushes.map((push) => push.refs)).toEqual([
      ['refs/heads/main'],
      ['refs/tau/chats/chat-one', 'refs/tau/chats/chat-two'],
      ['refs/tau/chats/chat-one'],
      ['refs/tau/chats/chat-two'],
    ]);
    expect(result.refs).toContainEqual(
      expect.objectContaining({ name: 'refs/tau/chats/chat-one', status: 'rejected', reason: refusal }),
    );
    expect(result.refs).toContainEqual(expect.objectContaining({ name: 'refs/tau/chats/chat-two', status: 'updated' }));
  }, 30_000);

  /* W13d: a 429 is the whole push's; offering each record alone would spend N more requests on the same limit. */
  it('stops at a rate-limited record push instead of offering each record alone', async () => {
    const limited = new RevisionPortError('REMOTE_UNAVAILABLE', 'Too many requests; retry shortly.', {
      retryAfterMilliseconds: 20_000,
    });
    const { pushes, actors, port } = await twoChatProject(async (input) => {
      if (input.refs.length > 1) {
        throw limited;
      }
      return {
        refs: await Promise.all(
          input.refs.map(
            async (ref) => ({ name: ref.name, status: 'updated', head: await port.readRef(ref.name) }) as const,
          ),
        ),
      };
    });

    await expect(run(actors.sync.push, { remote: 'tau', branch: 'main', leases: {} })).rejects.toBe(limited);
    expect(pushes.map((push) => push.refs)).toEqual([
      ['refs/heads/main'],
      ['refs/tau/chats/chat-one', 'refs/tau/chats/chat-two'],
    ]);
  }, 30_000);

  /*
   * W13c chat-ref C (b): a replay that finds nothing new offered the unchanged
   * local chain again, and the remote refused it on every sync. The remote
   * already holds every byte, so this device takes its head and pushes nothing.
   */
  it('pushes nothing after a replay that has nothing new, and follows the fetched head', async () => {
    const chatRef = 'refs/tau/chats/chat-one';
    const tracking = 'refs/remotes/tau/tau/chats/chat-one';
    const remote: { head?: RevisionId } = {};
    const { pushes, actors, port, filesystem } = await twoChatProject(
      async (input) => ({
        refs: await Promise.all(
          input.refs.map(async (ref) =>
            ref.name === chatRef
              ? ({
                  name: ref.name,
                  status: 'rejected',
                  head: undefined,
                  reason: 'Tau: refused — it does not fast-forward',
                } as const)
              : ({ name: ref.name, status: 'updated', head: await port.readRef(ref.name) } as const),
          ),
        ),
      }),
      (inner) => ({
        listRemoteRefs: async () => [{ name: chatRef, head: remote.head! }],
        fetch: async () => {
          await inner.updateRef({ name: tracking, expectedHead: undefined, head: remote.head! });
          return { refs: [{ name: tracking, head: remote.head! }] };
        },
      }),
      ['chat-one'],
    );
    /* The same bytes on a chain the remote holds and this device never wrote,
     * under the record device this host names its segment by (EQ10(a)). */
    await ownRecordDevice(filesystem, recorderDevice);
    const own = await writeChatRef({
      port,
      filesystem,
      deviceId: recorderDevice,
      chatId: 'chat-one',
      syncChats: true,
      actorId: 'ada',
      now: 1,
    });
    const remoteReceipt = await port.writeRevision({
      parents: [],
      tree: (await port.readTree(own.head!))!,
      largeObjects: false,
      provenance: { source: 'user', actorId: 'grace', createdAt: 2 },
      summary: { generated: 'Chat chat-one' },
    });
    remote.head = revisionId(remoteReceipt.commitId);
    const remoteHead = remote.head;

    const result = await run<{ refs: ReadonlyArray<{ name: string; status: string; head?: string }> }>(
      actors.sync.push,
      { remote: 'tau', branch: 'main', leases: { [chatRef]: remoteHead } },
    );
    expect(pushes.filter((push) => push.refs.includes(chatRef))).toHaveLength(1);
    expect(result.refs).toContainEqual({ name: chatRef, status: 'upToDate', head: remoteHead });
    expect(await port.readRef(chatRef)).toBe(remoteHead);
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

  /* RV-W7 #11: two hosts sharing a record device (a copied `.git`) would each owe the other's refusal forever. */
  it('moves a log the remote refuses as a rewrite to a new record device, and offers it there', async () => {
    const { pushes, actors, port, filesystem } = await twoChatProject(
      async (input) => ({
        refs: await Promise.all(
          input.refs.map(async (ref) =>
            ref.name === refused
              ? ({
                  name: ref.name,
                  status: 'rejected',
                  head: undefined,
                  reason: `Tau: refused ${ref.name} — it does not fast-forward 1234; fetch and merge first.`,
                } as const)
              : ({ name: ref.name, status: 'updated', head: await port.readRef(ref.name) } as const),
          ),
        ),
      }),
      () => ({}),
      [],
    );
    /* This host's log for its unattributed form, written before the push. */
    const log = createOpsLog({ port, recordsFileSystem: async () => filesystem, now: () => 1, actorId: 'tau-host' });
    await log.append(undefined, { v: 1, ref: 'refs/heads/main', to: 'r1', kind: 'save', actor: 'tau-host', at: 1 });
    const refused = opsRefName(await log.deviceFor(undefined));

    const result = await run<{ refs: ReadonlyArray<{ name: string; status: string }> }>(actors.sync.push, {
      remote: 'tau',
      branch: 'main',
      leases: {},
    });

    const stored = JSON.parse(await filesystem.readFile('.git/ops-devices.json', 'utf8')) as {
      devices: Record<string, string>;
      retired: string[];
    };
    const successor = opsRefName(stored.devices['host'] ?? '');
    expect(successor).not.toBe(refused);
    expect(stored.retired).toEqual([refused.slice('refs/tau/ops/'.length)]);
    expect(pushes.at(-1)).toEqual({ refs: [successor], atomic: false });
    expect(result.refs).toContainEqual(expect.objectContaining({ name: successor, status: 'updated' }));
    expect(result.refs.map((entry) => entry.name)).not.toContain(refused);
  }, 30_000);

  /* RV-W7 #5: a record conflict still wrote the other device's log, and the page has to hear of it. */
  it('announces a chat whose record conflicted, because its segments were still written', async () => {
    const context = await fixture({ '.tau/chats/talk/chat.json': '{"name":"Local name"}' });
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await context.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([
        ['chat.json', '{"name":"Remote name"}'],
        ['events/device-a.jsonl', '{"sequence":0}\n'],
      ]),
      provenance: { source: 'user', actorId: 'device-a', createdAt: 1 },
      summary: { generated: 'Chat talk' },
    });
    const fetchedRef = { name: 'refs/remotes/tau/tau/chats/talk', head: revisionId(receipt.commitId) };
    await context.port.updateRef({ name: fetchedRef.name, expectedHead: undefined, head: fetchedRef.head });
    const projected: string[][] = [];
    const actors = createRevisionActors({
      port: {
        ...context.port,
        listRemoteRefs: async () => [{ name: 'refs/tau/chats/talk', head: fetchedRef.head }],
        fetch: async () => ({ refs: [fetchedRef] }),
      },
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => context.filesystem,
      deviceId: () => 'device-b',
      onChatsProjected: (chatIds) => projected.push([...chatIds]),
    });

    const result = await run<Readonly<{ records?: ReadonlyArray<Readonly<{ name: string; status: string }>> }>>(
      actors.sync.fetch,
      { remote: 'tau', branch: 'main', deadlineMilliseconds: 10_000 },
    );

    expect(result.records).toContainEqual(expect.objectContaining({ name: 'refs/tau/chats/talk', status: 'rejected' }));
    expect(await context.filesystem.readFile('.tau/chats/talk/events/device-a.jsonl', 'utf8')).toBe('{"sequence":0}\n');
    expect(projected).toEqual([['talk']]);
  }, 30_000);

  /* RV-W7 #1: operation logs are pushed, never pulled. */
  it('never asks the remote for another device’s operation log', async () => {
    const context = await fixture({ 'main.ts': 'base\n' });
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await context.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['main.ts', 'base\n']]),
      provenance: { source: 'user', actorId: 'device-a', createdAt: 1 },
      summary: { generated: 'Main' },
    });
    const head = revisionId(receipt.commitId);
    const requested: Array<readonly string[] | undefined> = [];
    const actors = createRevisionActors({
      port: {
        ...context.port,
        listRemoteRefs: async () => [
          { name: 'refs/heads/main', head },
          { name: 'refs/tau/ops/0f0e0d0c-0b0a-4908-8706-050403020100', head },
        ],
        fetch: async (input) => {
          requested.push(input.refs);
          return { refs: [] };
        },
      },
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => context.filesystem,
    });

    await run(actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 10_000 });

    expect(requested).toEqual([['refs/heads/main']]);
  }, 30_000);

  /* W13d: this device's own push, echoed back by the stream, brings nothing new. */
  it('fetches nothing when every advertised tip is the one already tracked, as after its own push', async () => {
    const context = await fixture({ 'main.ts': 'base\n' });
    await context.port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
    const receipt = await context.port.writeRevision({
      parents: [],
      tree: new ImmutableRevisionTree([['main.ts', 'base\n']]),
      provenance: { source: 'user', actorId: 'device-a', createdAt: 1 },
      summary: { generated: 'Main' },
    });
    const head = revisionId(receipt.commitId);
    await context.port.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head });
    let advertisedHead = head;
    const requested: Array<readonly string[] | undefined> = [];
    const actors = createRevisionActors({
      port: {
        ...context.port,
        listRemoteRefs: async () => [{ name: 'refs/heads/main', head: advertisedHead }],
        fetch: async (input) => {
          requested.push(input.refs);
          return { refs: [] };
        },
      },
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => context.filesystem,
    });

    await run(actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 10_000 });
    expect(requested).toEqual([]);

    /* Another device's move is still fetched. */
    advertisedHead = revisionId('0'.repeat(39) + '1');
    await run(actors.sync.fetch, { remote: 'tau', branch: 'main', deadlineMilliseconds: 10_000 });
    expect(requested).toEqual([['refs/heads/main']]);
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
    ): Promise<
      Fixture & {
        readonly base: string;
        readonly ours: string;
        readonly theirs: string;
        readonly write: (
          content: Readonly<Record<string, string>>,
          parents: readonly string[],
          summary: string,
        ) => Promise<string>;
      }
    > => {
      const context = await fixture({ 'a.txt': 'base\n' }, (filesystem) => filesystem, {
        actorSet: actorSet.name,
        deviceId: () => 'device-a',
      });
      const { port, filesystem } = context;
      await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });
      await port.setHead('main');
      await ownRecordDevice(filesystem, recorderDevice);
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
      return { ...context, base, ours, theirs, write };
    };

    /** This device's conflict line for `main` (D14), named by its record device (R1). */
    const line = `conflicts/main/${recorderDevice}`;

    const listed = async (context: Fixture): Promise<readonly ConflictRecord[]> => {
      const { conflicts } = await run<{ conflicts: readonly ConflictRecord[] }>(
        context.actors.checkouts.listCheckouts,
        {
          projectId: 'project-1',
        },
      );
      return conflicts;
    };

    it('records a conflicted revision on main’s conflict line and leaves both branches untouched (D14)', async () => {
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
      /* The source branch no longer moves, and no checkout is made for the line. */
      expect(await port.readRef('feature')).toBe(theirs);
      const checkouts = await port.listCheckouts?.();
      expect(checkouts?.map((checkout) => checkout.branch)).not.toContain(line);

      const head = await port.readRef(line);
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

    it('records a sync conflict on the conflict line and loads it from there (D14)', async () => {
      const { port, actors, theirs } = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
      await port.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: revisionId(theirs) });

      const outcome = await run<{ status: string; branch?: string; paths?: readonly string[] }>(actors.sync.merge, {
        projectId: 'project-1',
        remote: 'tau',
        branch: 'main',
      });
      expect(outcome).toStrictEqual({ status: 'conflicted', branch: line, into: 'main', paths: ['a.txt'] });

      const conflict = await port.readRef(line);
      await expect(
        run<{ paths: ReadonlyArray<{ path: string }> }>(actors.resolution.loadConflict, {
          projectId: 'project-1',
          revisionId: conflict,
        }),
      ).resolves.toMatchObject({ paths: [{ path: 'a.txt' }] });
    }, 30_000);

    it('lands a sync decision on main, so the next sync merge has nothing left to compose (E2E-D defect B)', async () => {
      const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
      const { port, actors, filesystem, theirs } = context;
      await port.updateRef({ name: 'refs/remotes/tau/main', expectedHead: undefined, head: revisionId(theirs) });
      const sync = async (): Promise<SyncMergeActorOutput> =>
        run<SyncMergeActorOutput>(actors.sync.merge, { projectId: 'project-1', remote: 'tau', branch: 'main' });

      await expect(sync()).resolves.toMatchObject({ status: 'conflicted', branch: line, into: 'main' });
      const revision = (await port.readRef(line)) ?? '';
      await run(actors.resolution.applyResolution, {
        projectId: 'project-1',
        revisionId: revision,
        path: 'a.txt',
        side: 'theirs',
      });
      const finished = await run<{ revisionId: string }>(actors.resolution.finishMerge, {
        projectId: 'project-1',
        revisionId: revision,
      });

      /* The decision is on main itself, not on a branch with its own checkout. */
      expect(await port.readRef('main')).toBe(finished.revisionId);
      expect(await filesystem.readFile('a.txt', 'utf8')).toBe('theirs\n');
      const checkouts = await port.listCheckouts?.();
      expect(checkouts?.map((checkout) => checkout.branch)).not.toContain(line);
      /* The re-pull that follows composes nothing and refuses nothing. */
      await expect(sync()).resolves.toMatchObject({ status: 'merged' });
      expect(await port.readRef('main')).toBe(finished.revisionId);
      expect(await listed(context)).toStrictEqual([]);
    }, 30_000);

    it('parents a second conflict on the line’s tip, re-records nothing, and lists both (D14)', async () => {
      const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
      const { port, actors, filesystem, ours, theirs } = context;
      const merge = async (): Promise<unknown> =>
        run(actors.branch.merge, { projectId: 'project-1', branch: 'feature', into: 'main' });

      await merge();
      const first = (await port.readRef(line)) ?? '';
      /* A re-pull of the same divergence reaches the same conflict. */
      await merge();
      expect(await port.readRef(line)).toBe(first);

      /* This device keeps working on `main`; the next divergence is a second conflict. */
      const later = await context.write({ 'a.txt': 'mine, later\n' }, [ours], 'Later');
      await port.updateRef({ name: 'main', expectedHead: revisionId(ours), head: revisionId(later) });
      await filesystem.writeFile('a.txt', 'mine, later\n');
      await merge();
      const second = (await port.readRef(line)) ?? '';
      const record = await port.readRevision(revisionId(second));
      expect(record?.parents).toStrictEqual([theirs, later, first]);

      const both = await listed(context);
      expect(both.map((conflict) => conflict.revisionId)).toStrictEqual([second, first]);
      expect(await listed(context)).toContainEqual({ revisionId: first, line, into: 'main', foreign: false });
    }, 30_000);

    it('refuses a branch named conflicts, at creation and at rename (D14)', async () => {
      const { actors } = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });

      await expect(
        run(actors.checkouts.addCheckout, { projectId: 'project-1', branch: 'conflicts', from: '' }),
      ).rejects.toMatchObject({
        code: 'BRANCH_NAME_RESERVED',
        message: expect.stringContaining('conflicts') as unknown as string,
      });
      await expect(
        run(actors.branch.rename, { projectId: 'project-1', branch: 'feature', name: 'conflicts/mine' }),
      ).rejects.toMatchObject({ code: 'BRANCH_NAME_RESERVED' });
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
    const keep = async (
      context: Fixture,
      choice: Readonly<{ revisionId: string; path: string; side: string; content?: string }>,
    ): Promise<void> => run(context.actors.resolution.applyResolution, { projectId: 'project-1', ...choice });

    describe('resolving what the merge could not', () => {
      /** Merge `feature` into `main` and answer with the conflicted revision. */
      const conflicted = async (context: Fixture): Promise<string> => {
        const outcome = await run<{ status: string }>(context.actors.branch.merge, {
          projectId: 'project-1',
          branch: 'feature',
          into: 'main',
        });
        expect(outcome.status).toBe('conflicted');
        return (await context.port.readRef(line)) ?? '';
      };

      it('lands the decision on main as a merge with the conflicted revision among its parents (D14)', async () => {
        const context = await twoLines({
          ours: 'mine\n',
          theirs: 'theirs\n',
          extra: { 'settled.txt': 'theirs only\n' },
        });
        const revision = await conflicted(context);
        expect(await listed(context)).toHaveLength(1);

        await keep(context, { revisionId: revision, path: 'a.txt', side: 'mine' });
        const finished = await run<{ revisionId: string; branch?: string }>(context.actors.resolution.finishMerge, {
          projectId: 'project-1',
          revisionId: revision,
        });

        expect(finished.branch).toBe(line);
        expect(await context.port.readRef('main')).toBe(finished.revisionId);
        const landed = await context.port.readRevision(revisionId(finished.revisionId));
        expect(landed?.parents).toStrictEqual([context.ours, revision]);
        const resolvedTree = await context.port.readTree(revisionId(finished.revisionId));
        expect(new TextDecoder().decode(resolvedTree?.get('a.txt'))).toBe('mine\n');
        /* Everything that settled rides through untouched, and no marker byte
         reaches the tree (A22). */
        expect(new TextDecoder().decode(resolvedTree?.get('settled.txt'))).toBe('theirs only\n');
        expect(new TextDecoder().decode(resolvedTree?.get('a.txt'))).not.toContain('<<<<<<<');
        /* The live files carry it, the line never moved, and ancestry hides it. */
        expect(await context.filesystem.readFile('settled.txt', 'utf8')).toBe('theirs only\n');
        expect(await context.port.readRef(line)).toBe(revision);
        expect(await listed(context)).toStrictEqual([]);
      }, 30_000);

      /* RV-W7 #7: a decision made here is a merge, and Undo never reaches past it. */
      it('refuses to undo past the decision this host just landed, by name', async () => {
        const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
        const revision = await conflicted(context);
        await keep(context, { revisionId: revision, path: 'a.txt', side: 'mine' });
        await run(context.actors.resolution.finishMerge, { projectId: 'project-1', revisionId: revision });

        await expect(run(context.actors.restore.computePlan, { checkoutId: 'live', undo: true })).rejects.toMatchObject(
          { code: 'UNDO_PAST_MERGE' },
        );
      }, 30_000);

      it('refuses an edited choice whose sides moved since, and a decision whose line is gone (RV-W6 F9, F11)', async () => {
        const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
        const revision = await conflicted(context);
        await run(context.actors.resolution.applyResolution, {
          projectId: 'project-1',
          revisionId: revision,
          path: 'a.txt',
          side: 'editor',
          content: 'blended\n',
        });
        /* The file on main moved after the person edited against it. */
        const later = await context.write({ 'a.txt': 'mine, later\n' }, [context.ours], 'Later');
        await context.port.updateRef({ name: 'main', expectedHead: revisionId(context.ours), head: revisionId(later) });
        await context.filesystem.writeFile('a.txt', 'mine, later\n');
        await expect(
          run(context.actors.resolution.finishMerge, { projectId: 'project-1', revisionId: revision }),
        ).rejects.toThrow(/a\.txt changed since you edited it/u);
        expect(await context.port.readRef('main')).toBe(later);

        /* The line it decides is gone: nowhere to land, and Remove is the way out. */
        await context.port.updateRef({ name: 'main', expectedHead: revisionId(later) });
        await expect(
          run(context.actors.resolution.finishMerge, { projectId: 'project-1', revisionId: revision }),
        ).rejects.toThrow(/nowhere to land\. Remove it from Branches/u);
      }, 30_000);

      it('counts a decision landed on the remote’s main as decided while this main has diverged (RV-W6 F6)', async () => {
        const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
        const revision = await conflicted(context);
        expect(await listed(context)).toHaveLength(1);

        /* Another device decided it and pushed; this device's own main moved on elsewhere. */
        const decided = await context.write({ 'a.txt': 'decided\n' }, [context.ours, revision], 'Decided elsewhere');
        await context.port.updateRef({
          name: 'refs/remotes/tau/main',
          expectedHead: undefined,
          head: revisionId(decided),
        });
        const local = await context.write({ 'a.txt': 'mine\n', 'b.txt': 'later\n' }, [context.ours], 'Later here');
        await context.port.updateRef({ name: 'main', expectedHead: revisionId(context.ours), head: revisionId(local) });

        expect(await listed(context)).toStrictEqual([]);
      }, 30_000);

      it('a branch-merge conflict decided on a second device keeps the feature’s hunks (RV-W6 F1)', async () => {
        const context = await twoLines({
          ours: 'mine\n',
          theirs: 'theirs\n',
          extra: { 'settled.txt': 'theirs only\n' },
        });
        const revision = await conflicted(context);
        /* Another device over the same store: the line is foreign to it, and its `main` is the recorder's. */
        await ownRecordDevice(context.filesystem, '00000000-0000-4000-8000-00000000000b');
        const second = createRevisionActors({
          port: context.port,
          projectId: 'project-1',
          authorityEpoch: 'epoch-1',
          deviceId: () => 'device-b',
          filesystem: async () => context.filesystem,
        });
        const loaded = await run<{ paths: ReadonlyArray<{ path: string }> }>(second.resolution.loadConflict, {
          projectId: 'project-1',
          revisionId: revision,
        });
        expect(loaded.paths.map((entry) => entry.path)).toStrictEqual(['a.txt']);

        await run(second.resolution.applyResolution, {
          projectId: 'project-1',
          revisionId: revision,
          path: 'a.txt',
          side: 'mine',
        });
        const finished = await run<{ revisionId: string }>(second.resolution.finishMerge, {
          projectId: 'project-1',
          revisionId: revision,
        });
        const landedTree = await context.port.readTree(revisionId(finished.revisionId));
        expect(new TextDecoder().decode(landedTree?.get('a.txt'))).toBe('mine\n');
        expect(new TextDecoder().decode(landedTree?.get('settled.txt'))).toBe('theirs only\n');
      }, 30_000);

      it('keeps the other side’s clean hunks under Keep mine (RV-W5b2 R2-4)', async () => {
        const context = await twoLines({
          ours: 'one\nTWO mine\nthree\nfour\nfive\n',
          theirs: 'one\nTWO theirs\nthree\nfour\nFIVE\n',
        });
        /* The base the two sides changed, rather than twoLines' one-line file. */
        const base = await context.write({ 'a.txt': 'one\ntwo\nthree\nfour\nfive\n' }, [], 'Five lines');
        const ours = await context.write({ 'a.txt': 'one\nTWO mine\nthree\nfour\nfive\n' }, [base], 'Ours');
        const theirs = await context.write({ 'a.txt': 'one\nTWO theirs\nthree\nfour\nFIVE\n' }, [base], 'Theirs');
        await context.port.updateRef({ name: 'main', expectedHead: revisionId(context.ours), head: revisionId(ours) });
        await context.port.updateRef({
          name: 'feature',
          expectedHead: revisionId(context.theirs),
          head: revisionId(theirs),
        });
        const revision = await conflicted(context);

        await keep(context, { revisionId: revision, path: 'a.txt', side: 'mine' });
        const finished = await run<{ revisionId: string }>(context.actors.resolution.finishMerge, {
          projectId: 'project-1',
          revisionId: revision,
        });

        const resolvedTree = await context.port.readTree(revisionId(finished.revisionId));
        expect(new TextDecoder().decode(resolvedTree?.get('a.txt'))).toBe('one\nTWO mine\nthree\nfour\nFIVE\n');
      }, 30_000);

      it('carries work main gained after the conflict, and refuses over unsaved files (D14, I1)', async () => {
        const context = await twoLines({ ours: 'mine\n', theirs: 'theirs\n' });
        const revision = await conflicted(context);
        /* This device kept working after the conflict was recorded. */
        const later = await context.write({ 'a.txt': 'mine\n', 'b.txt': 'later\n' }, [context.ours], 'Later');
        await context.port.updateRef({ name: 'main', expectedHead: revisionId(context.ours), head: revisionId(later) });
        await context.filesystem.writeFile('b.txt', 'later\n');
        await keep(context, { revisionId: revision, path: 'a.txt', side: 'theirs' });

        /* A file no revision holds is never overwritten. */
        await context.filesystem.writeFile('b.txt', 'typed, not saved\n');
        await expect(
          run(context.actors.resolution.finishMerge, { projectId: 'project-1', revisionId: revision }),
        ).rejects.toMatchObject({ message: expect.stringContaining('not in a revision yet') as unknown as string });
        expect(await context.port.readRef('main')).toBe(later);
        await context.filesystem.writeFile('b.txt', 'later\n');

        const finished = await run<{ revisionId: string }>(context.actors.resolution.finishMerge, {
          projectId: 'project-1',
          revisionId: revision,
        });
        const resolvedTree = await context.port.readTree(revisionId(finished.revisionId));
        expect(new TextDecoder().decode(resolvedTree?.get('a.txt'))).toBe('theirs\n');
        expect(new TextDecoder().decode(resolvedTree?.get('b.txt'))).toBe('later\n');
        const landed = await context.port.readRevision(revisionId(finished.revisionId));
        expect(landed?.parents).toStrictEqual([later, revision]);
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
        /* Refused, and nothing moved: the line still holds the conflict and main is where it was. */
        expect(await context.port.readRef(line)).toBe(revision);
        expect(await context.port.readRef('main')).toBe(context.ours);
      }, 30_000);
    });

    describe('recording an editor’s overlapping edit (D14, RV-W5b2 R2-1)', () => {
      /** Another device's revision over `base` was applied to `main` while an editor held `base`. */
      const applied = async (theirs: string | undefined): Promise<Awaited<ReturnType<typeof twoLines>>> => {
        const context = await twoLines({ ours: 'base\n', theirs });
        await context.port.updateRef({
          name: 'main',
          expectedHead: revisionId(context.ours),
          head: revisionId(context.theirs),
        });
        await (theirs === undefined
          ? context.filesystem.unlink('a.txt')
          : context.filesystem.writeFile('a.txt', theirs));
        return context;
      };

      it('records it on the conflict line with the exact three terms, and writes nothing', async () => {
        const context = await applied('theirs\n');

        const outcome = await context.actors.recordEditorConflict({ path: 'a.txt', base: 'base\n', mine: 'mine\n' });

        expect(outcome).toMatchObject({ status: 'recorded', line, into: 'main' });
        const revision = outcome.status === 'recorded' ? outcome.revisionId : '';
        expect(await context.port.readRef(line)).toBe(revision);
        expect(await context.port.readRef('main')).toBe(context.theirs);
        expect(await context.filesystem.readFile('a.txt', 'utf8')).toBe('theirs\n');
        const opened = await run<{ ours: string; theirs: string; text?: string }>(
          context.actors.resolution.materialize,
          { projectId: 'project-1', revisionId: revision, path: 'a.txt' },
        );
        expect({ ours: opened.ours, theirs: opened.theirs }).toStrictEqual({ ours: 'mine\n', theirs: 'theirs\n' });
        expect(opened.text).toContain('<<<<<<<');

        /* A reload is a fresh actor set over the same store: the decision is still there. */
        const reloaded = createRevisionActors({
          port: context.port,
          projectId: 'project-1',
          authorityEpoch: 'epoch-1',
          deviceId: () => 'device-a',
          filesystem: async () => context.filesystem,
        });
        const relisted = await run<{ conflicts: readonly ConflictRecord[] }>(reloaded.checkouts.listCheckouts, {
          projectId: 'project-1',
        });
        expect(relisted.conflicts).toStrictEqual([{ revisionId: revision, line, into: 'main', foreign: false }]);

        await keep(context, { revisionId: revision, path: 'a.txt', side: 'mine' });
        const finished = await run<{ revisionId: string }>(context.actors.resolution.finishMerge, {
          projectId: 'project-1',
          revisionId: revision,
        });
        expect(await context.filesystem.readFile('a.txt', 'utf8')).toBe('mine\n');
        expect(await context.port.readRef('main')).toBe(finished.revisionId);
        expect(await listed(context)).toStrictEqual([]);
      }, 30_000);

      it('lists the decision at once and offers its line to the remote, through the project tree', async () => {
        const context = await applied('theirs\n');
        const tree = createProjectRevisionsActor({
          port: context.port,
          projectId: 'project-1',
          authorityEpoch: 'epoch-1',
          deviceId: () => 'device-a',
          filesystem: async () => context.filesystem,
        });
        tree.actor.start();
        try {
          await expect.poll(() => tree.actor.getSnapshot().context.registrySettled, { timeout: 10_000 }).toBe(true);
          /* Record what the wrapper sends the root; `send` is a prototype getter, so the instance shadows it. */
          const sent: Array<Readonly<{ type: string }>> = [];
          const original = tree.actor.send;
          Object.defineProperty(tree.actor, 'send', {
            value: (event: Parameters<typeof original>[0]) => {
              sent.push(event);
              original(event);
            },
          });

          const outcome = await tree.recordEditorConflict({ path: 'a.txt', base: 'base\n', mine: 'mine\n' });

          expect(outcome).toMatchObject({ status: 'recorded', line });
          /* The card needs no reload, and the line travels now rather than with the next save. */
          expect(sent.map((event) => event.type)).toStrictEqual(['mergeConflicted', 'syncNow']);
          await expect
            .poll(() => tree.actor.getSnapshot().context.conflicts.map((conflict) => conflict.line), {
              timeout: 10_000,
            })
            .toStrictEqual([line]);
        } finally {
          tree.actor.stop();
        }
      }, 30_000);

      it('keeps the edit a conflict when no revision holds what it was made from (RV-W6 F10)', async () => {
        const context = await twoLines({ ours: 'base\n', theirs: 'theirs\n' });
        /* A line whose every revision already holds the arrived text. */
        const only = await context.write({ 'a.txt': 'theirs\n' }, [], 'Only');
        await context.port.updateRef({ name: 'main', expectedHead: revisionId(context.ours), head: revisionId(only) });
        await context.filesystem.writeFile('a.txt', 'theirs\n');

        const outcome = await context.actors.recordEditorConflict({
          path: 'a.txt',
          base: 'never saved\n',
          mine: 'mine\n',
        });
        const revision = outcome.status === 'recorded' ? outcome.revisionId : '';
        const loaded = await run<{ paths: ReadonlyArray<{ path: string }> }>(context.actors.resolution.loadConflict, {
          projectId: 'project-1',
          revisionId: revision,
        });
        expect(loaded.paths.map((entry) => entry.path)).toStrictEqual(['a.txt']);
      }, 30_000);

      it('asks keep-or-let-go when the other side deleted the file (R2-3)', async () => {
        const context = await applied(undefined);

        const outcome = await context.actors.recordEditorConflict({ path: 'a.txt', base: 'base\n', mine: 'mine\n' });
        const revision = outcome.status === 'recorded' ? outcome.revisionId : '';
        const loaded = await run<{ paths: ReadonlyArray<{ path: string; openable: boolean }> }>(
          context.actors.resolution.loadConflict,
          { projectId: 'project-1', revisionId: revision },
        );
        expect(loaded.paths).toStrictEqual([{ path: 'a.txt', openable: false }]);

        await keep(context, { revisionId: revision, path: 'a.txt', side: 'theirs' });
        const finished = await run<{ revisionId: string }>(context.actors.resolution.finishMerge, {
          projectId: 'project-1',
          revisionId: revision,
        });
        const landedTree = await context.port.readTree(revisionId(finished.revisionId));
        expect(landedTree?.has('a.txt')).toBe(false);
      }, 30_000);

      it('answers unchanged when the file is back on the bytes the edit was made from', async () => {
        const context = await twoLines({ ours: 'base\n', theirs: 'theirs\n' });

        await expect(
          context.actors.recordEditorConflict({ path: 'a.txt', base: 'base\n', mine: 'mine\n' }),
        ).resolves.toStrictEqual({ status: 'unchanged' });
        expect(await context.port.readRef(line)).toBeUndefined();
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

describe('the revision stream subscription (W5b; RV-W5b F3, F5, F9)', () => {
  type Stream = { handlers: RevisionStreamHandlers; stopped: boolean };
  const subscription = () => {
    const streams: Stream[] = [];
    const actors = createRevisionActors({
      port: { init: vi.fn(async () => undefined) } as unknown as RevisionPort,
      projectId: 'p',
      authorityEpoch: 'e',
      filesystem: () => {
        throw new Error('unused');
      },
      remoteMoves: (_input, handlers) => {
        const stream: Stream = { handlers, stopped: false };
        streams.push(stream);
        return () => {
          stream.stopped = true;
        };
      },
    });
    const actor = createActor(actors.sync.remoteMoves, { input: { projectId: 'p' } });
    actor.start();
    return { actors, actor, streams };
  };
  const refusal = new RevisionPortError('REMOTE_UNAUTHORIZED', 'This credential cannot read the stream.');

  it('ignores a late refusal from a stream it already stopped, so the live one stays owned (F3)', () => {
    const { actor, streams } = subscription();
    actor.send({ type: 'watch', remote: 'tau' });
    actor.send({ type: 'unwatch' });
    actor.send({ type: 'watch', remote: 'tau' });
    expect(streams).toHaveLength(2);

    streams[0]?.handlers.refused(refusal);
    actor.send({ type: 'unwatch' });

    expect(streams[1]?.stopped).toBe(true);
    actor.stop();
  });

  it('does not re-read a stream that refused this session until the remote is watched afresh (F5)', () => {
    const { actor, streams } = subscription();
    actor.send({ type: 'watch', remote: 'tau' });
    streams[0]?.handlers.refused(refusal);

    /* Every open re-sends `watch`: a refused stream must not become a request per pull. */
    actor.send({ type: 'watch', remote: 'tau' });
    expect(streams).toHaveLength(1);

    actor.send({ type: 'unwatch' });
    actor.send({ type: 'watch', remote: 'tau' });
    expect(streams).toHaveLength(2);
    actor.stop();
  });

  it('lets a stopped open pull go without waiting out the tail (F9)', async () => {
    const { actors, actor } = subscription();
    actor.send({ type: 'watch', remote: 'tau' });
    const fetch = createActor(actors.sync.fetch, {
      input: { remote: 'tau', branch: 'main', deadlineMilliseconds: 10_000 },
    });
    fetch.subscribe({ error: () => undefined });
    fetch.start();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    fetch.stop();
    const stopped = performance.now();
    await actors.settled();

    expect(performance.now() - stopped).toBeLessThan(1000);
    actor.stop();
  });
});

describe('the fact a released turn publishes', () => {
  const released = {
    turnId: 'turn-1',
    chatId: 'chat-1',
    runId: 'run-1',
    checkoutId: 'checkout-1',
  } as const;

  /* P4: the machine's `reason` is a diagnostic — "The checkout did not settle
   * the cut in time." names a thing a person has never heard of — so the
   * category travels beside it and the page chooses the words. */
  it('carries the refusal’s category beside its diagnostic', () => {
    expect(
      describeTurnRelease({
        ...released,
        outcome: 'failed',
        reason: 'The checkout did not settle the cut in time.',
        code: 'CUT_TIMED_OUT',
      }),
    ).toMatchObject({ type: 'turn.failed', code: 'CUT_TIMED_OUT' });
  });

  /* E5: a failure nothing classified carries no code at all, and the page says
   * its own fallback rather than a sentence nobody can act on. */
  it('omits the category entirely when the failure carried none', () => {
    const failure = describeTurnRelease({ ...released, outcome: 'failed', reason: 'ENOENT: no such file' });

    expect(failure).toMatchObject({ reason: 'ENOENT: no such file' });
    expect(failure === undefined ? [] : Object.keys(failure)).not.toContain('code');
  });

  /* A release is not an unclassified failure: the turn was let go before it
   * recorded anything, and the page can say exactly that. */
  it('names a released turn with its own category', () => {
    expect(describeTurnRelease({ ...released, outcome: 'released' })).toMatchObject({
      reason: 'The turn ended before it recorded a revision.',
      code: 'TURN_RELEASED',
    });
  });

  it('stays silent for the outcomes that settle through their own fact', () => {
    expect(describeTurnRelease({ ...released, outcome: 'finalized' })).toBeUndefined();
    expect(describeTurnRelease({ ...released, outcome: 'conflicted' })).toBeUndefined();
  });
});
