/**
 * S48 Node set — the composition suite: proof that the machines *fit*.
 *
 * Each machine's own paths are covered by its unit suite (S47). This one runs
 * the real tree — `project-revisions` with its invoked and spawned children —
 * over scripted actors, and asserts the things only composition can break: the
 * ordered effect sequence of a whole turn, one revision for two chats on one
 * checkout, the CAS loser that re-reads instead of minting twice, a close that
 * lets every held resource go, a tree rebuilt from records alone, and the same
 * sequences over two different host actor sets (I4).
 *
 * @see docs/research/workspace-filesystem-north-star-blueprint.md S48
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { revisionId as toRevisionId } from '#algorithms/index.js';
import type { RootedFileSystem } from '@taucad/filesystem';
import { createActor } from 'xstate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutFenceActorInput } from '#checkout.machine.js';
import { branchMachine } from '#branch.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import { remoteMachine } from '#remote.machine.js';
import { restoreMachine } from '#restore.machine.js';
import type { CheckoutRecord } from '#revision-port.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { createProjectRevisionsActor } from '#revision-effects.js';
import type { TurnPlacement } from '#revision-effects.js';
import { publishMachine, selectPublishFacet } from '#publish.machine.js';
import { syncMachine } from '#sync.machine.js';
import { turnMachine } from '#turn.machine.js';
import type { TurnLeaseActorInput } from '#turn.machine.js';
import {
  createFakeCallbackActors,
  createFakePromiseActors,
  createManualClock,
  recordEmitted,
} from '#test/fake-actors.js';
import type { FakeCallbackActors, FakePromiseActors, ManualClock } from '#test/fake-actors.js';

/** Let every queued microtask and the actors' promise handlers run. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const live: CheckoutRecord = {
  id: 'checkout-live',
  projectId: 'project-1',
  root: '/projects/project-1',
  kind: 'live',
  branch: 'main',
  leaseRunIds: [],
  leaseChatIds: [],
};

type Tree = Readonly<{
  actor: ReturnType<typeof createActor<typeof projectRevisionsMachine>>;
  promises: FakePromiseActors;
  callbacks: FakeCallbackActors;
  emitted: ReturnType<typeof recordEmitted>;
  clock: ManualClock;
}>;

/**
 * The whole actor tree, with every effect scripted.
 *
 * Nothing here is a mock of a machine: the children are the real ones, so a
 * composition assertion is what the tree actually did.
 *
 * @param options - `scheduler` also scripts `publish` and `sync`, whose effects
 *   the other rows leave unprovided so their call log stays the turn's.
 * @returns The started root plus its scripted effect surface.
 */
const startTree = (options: Readonly<{ scheduler?: boolean }> = {}): Tree => {
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const clock = createManualClock();
  const actor = createActor(
    projectRevisionsMachine.provide({
      actors: {
        checkouts: checkoutsMachine.provide({
          actors: {
            listCheckouts: promises.actor('listCheckouts'),
            addCheckout: promises.actor('addCheckout'),
            removeCheckout: promises.actor('removeCheckout'),
            sweepLeases: promises.actor('sweepLeases'),
            retireLease: promises.actor('retireRegistryLease'),
          },
        }),
        restore: restoreMachine.provide({
          actors: { computePlan: promises.actor('computePlan'), applyPlan: promises.actor('applyPlan') },
        }),
        checkout: checkoutMachine.provide({
          actors: {
            cut: promises.actor('cut'),
            writeRevision: promises.actor('writeRevision'),
            casHead: promises.actor('casHead'),
            readHead: promises.actor('readHead'),
            fence: callbacks.actor<CheckoutFenceActorInput>('fence'),
          },
        }),
        remote: remoteMachine.provide({
          actors: {
            readRemote: promises.actor('readRemote'),
            writeRemote: promises.actor('writeRemote'),
            removeRemote: promises.actor('removeRemote'),
            authorize: promises.actor('authorize'),
            validate: promises.actor('validate'),
            initialSync: promises.actor('initialSync'),
          },
        }),
        branch: branchMachine.provide({
          actors: {
            checkBranch: promises.actor('checkBranch'),
            applySwitch: promises.actor('applySwitch'),
            merge: promises.actor('mergeBranch'),
            rename: promises.actor('renameBranch'),
          },
        }),
        turn: turnMachine.provide({
          actors: {
            prepare: promises.actor('prepare'),
            writeLease: promises.actor('writeLease'),
            retireLease: promises.actor('retireTurnLease'),
            capture: promises.actor('capture'),
            merge: promises.actor('merge'),
            lease: callbacks.actor<TurnLeaseActorInput>('lease'),
          },
        }),
        /* Scripted only where a row drives them: an unprovided child's effects
         * are never invoked while it idles, so the turn rows keep the call log
         * they assert on. */
        ...(options.scheduler === true
          ? {
              publish: publishMachine.provide({
                actors: {
                  listVersions: promises.actor('listVersions'),
                  createTag: promises.actor('createTag'),
                  push: promises.actor('publishPush'),
                  createPublication: promises.actor('createPublication'),
                },
              }),
              sync: syncMachine.provide({
                actors: {
                  readPending: promises.actor('readPending'),
                  writePending: promises.actor('writePending'),
                  readRemote: promises.actor('syncReadRemote'),
                  push: promises.actor('syncPush'),
                  fetch: promises.actor('syncFetch'),
                  fastForward: promises.actor('fastForward'),
                },
              }),
            }
          : {}),
      },
    }),
    { clock, input: { projectId: 'project-1', liveCheckoutId: 'checkout-live' } },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, emitted, clock };
};

/** Bring the registry to `ready` over one live checkout. */
const openRegistry = async (tree: Tree, checkouts: readonly CheckoutRecord[] = [live]): Promise<void> => {
  tree.promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
  await flush();
  tree.promises.settle('listCheckouts', { output: { checkouts } });
  await flush();
};

/** Admit one turn and lease the live checkout for it. */
const leaseTurn = async (
  tree: Tree,
  turn: Readonly<{ turnId: string; chatId: string; runId: string; leaseIds: readonly string[] }>,
): Promise<void> => {
  const { turnId, chatId, runId, leaseIds } = turn;
  tree.actor.send({ type: 'admitTurn', turnId, chatId, runId });
  tree.promises.settle('prepare', {
    output: { checkoutId: 'checkout-live', branch: 'main', baseRevisionId: 'rev-1', dirty: false, staleRunIds: [] },
  });
  await flush();
  tree.promises.settle('writeLease', { output: { leaseIds } });
  await flush();
  tree.callbacks.sendBack('lease', { type: 'leaseGranted' });
};

/** Drive one leased turn from completion to its cut request. */
const completeTurn = async (tree: Tree, turnId: string): Promise<void> => {
  tree.actor.send({ type: 'turnCompleted', turnId });
  tree.promises.settle('capture', { output: { captureId: `capture-${turnId}` } });
  await flush();
  tree.promises.settle('merge', { output: { status: 'recorded' } });
  await flush();
};

/** Settle the cut the checkout is running: tree, revision, head. */
const mint = async (tree: Tree, revisionId: string): Promise<void> => {
  tree.callbacks.sendBack('fence', { type: 'fenceGranted' });
  tree.promises.settle('cut', { output: { treeId: `tree-${revisionId}`, cutId: `cut-${revisionId}` } });
  await flush();
  tree.promises.settle('writeRevision', { output: { revisionId } });
  await flush();
  tree.promises.settle('casHead', { output: { status: 'updated', head: revisionId } });
  await flush();
  /* The turn retires its own lease before it attests the settlement: the fact
   * a reader sees is only published once nothing is holding the tree. */
  if (tree.promises.running('retireTurnLease') > 0) {
    tree.promises.settle('retireTurnLease', { output: undefined });
    await flush();
  }
};

const names = (calls: ReadonlyArray<{ name: string }>): readonly string[] => calls.map((call) => call.name);
const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

describe('revision machine composition (S48 Node set)', () => {
  /* 1 — the revision is minted by the checkout, routed by the root and pushed
   * by the composed scheduler after its real debounce. */
  it('runs one scripted turn end to end in exactly one ordered effect sequence', async () => {
    const tree = startTree({ scheduler: true });
    await openRegistry(tree);
    tree.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    tree.promises.settle('syncReadRemote', { output: { remote: 'tau' } });
    await flush();
    tree.promises.settle('syncFetch', {
      output: { leases: { 'refs/heads/main': 'rev-1' }, integration: 'upToDate' },
    });
    await flush();
    await leaseTurn(tree, { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', leaseIds: ['run-1'] });
    await completeTurn(tree, 'turn-1');
    await mint(tree, 'rev-2');
    await flush();
    tree.clock.advance(2000);
    await flush();
    tree.promises.settle('syncPush', {
      output: { refs: [{ name: 'refs/heads/main', status: 'updated', head: 'rev-2' }] },
    });
    await flush();
    tree.promises.settle('writePending', { output: undefined });
    await flush();

    expect(names(tree.promises.calls)).toEqual([
      'readRemote',
      'readPending',
      'sweepLeases',
      'listCheckouts',
      'syncReadRemote',
      'syncFetch',
      'prepare',
      'writeLease',
      'capture',
      'merge',
      'cut',
      'writeRevision',
      'casHead',
      'retireTurnLease',
      /* The registry retires the same lease from the record last: the turn
       * lets the tree go, then the checkout stops advertising it (R1, R12). */
      'retireRegistryLease',
      'syncPush',
      'writePending',
    ]);
    expect(types(tree.emitted)).toEqual(['revisionMinted', 'turnFinalized']);
    expect(tree.promises.inputsFor('writeRevision')).toHaveLength(1);
    expect(tree.promises.inputsFor('syncPush')).toEqual([
      { remote: 'tau', branch: 'main', leases: { 'refs/heads/main': 'rev-1' } },
    ]);

    tree.actor.stop();
  });

  /* 2 */
  it('records one revision for two chats sharing a checkout, with both leases in its provenance', async () => {
    const tree = startTree();
    await openRegistry(tree);
    await leaseTurn(tree, { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', leaseIds: ['run-1'] });
    await leaseTurn(tree, { turnId: 'turn-2', chatId: 'chat-2', runId: 'run-2', leaseIds: ['run-1', 'run-2'] });
    await completeTurn(tree, 'turn-2');
    await mint(tree, 'rev-2');
    await flush();

    /* One cut, one revision — and no branch was created to hold the second
     * chat: `addCheckout` was never asked for one (S6, D11). */
    expect(tree.promises.inputsFor('writeRevision')).toEqual([
      expect.objectContaining({ checkoutId: 'checkout-live', turnId: 'turn-2', leaseIds: ['run-1', 'run-2'] }),
    ]);
    expect(tree.promises.inputsFor('addCheckout')).toEqual([]);

    tree.actor.stop();
  });

  /* 3 */
  it('re-reads the head a concurrent writer moved instead of minting a second revision', async () => {
    const tree = startTree();
    await openRegistry(tree);
    await leaseTurn(tree, { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', leaseIds: ['run-1'] });
    await completeTurn(tree, 'turn-1');
    tree.callbacks.sendBack('fence', { type: 'fenceGranted' });
    tree.promises.settle('cut', { output: { treeId: 'tree-2', cutId: 'cut-2' } });
    await flush();
    tree.promises.settle('writeRevision', { output: { revisionId: 'rev-2' } });
    await flush();
    tree.promises.settle('casHead', { output: { status: 'conflicted', head: 'rev-9' } });
    await flush();
    tree.promises.settle('readHead', { output: { revisionId: 'rev-9', treeId: 'tree-9' } });
    await flush();

    expect(tree.promises.inputsFor('writeRevision')).toHaveLength(1);
    expect(names(tree.promises.calls).filter((name) => name === 'casHead')).toHaveLength(1);
    expect(selectRevisionStatus(tree.actor.getSnapshot()).headRevisionId).toBe('rev-9');

    tree.actor.stop();
  });

  /* 4 */
  it('lets every held resource go when the project closes during a running turn', async () => {
    const tree = startTree();
    await openRegistry(tree);
    await leaseTurn(tree, { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', leaseIds: ['run-1'] });
    expect(tree.callbacks.active('lease')).toBe(1);

    tree.actor.stop();
    await flush();

    expect(tree.callbacks.active('lease')).toBe(0);
    expect(tree.callbacks.releases('lease')).toBe(1);
    expect(tree.callbacks.active('fence')).toBe(0);
    /* A close is not a settlement: nothing was minted behind the user's back. */
    expect(tree.promises.inputsFor('writeRevision')).toEqual([]);
  });

  /* 7 — the conflict path (AC14, W22 G4). A merge that collides mints on the
   * source branch and leaves the target alone; what a person must then see is
   * the *Needs resolution* card, **without reopening the project**. That makes
   * the registry re-read — and therefore the wire from `branch.machine`'s
   * `conflicted` state back to the root — the load-bearing link, and it is the
   * one no unit suite can see: each proves its own half from a projection that
   * was already conflicted. */
  it('shows the conflicted branch as needing resolution without reopening the project', async () => {
    const tree = startTree();
    const branched: CheckoutRecord = {
      id: 'checkout-fillet',
      projectId: 'project-1',
      root: '/checkouts/checkout-fillet',
      kind: 'linked',
      branch: 'bracket-fillet',
      headRevisionId: 'rev-theirs',
      leaseRunIds: [],
      leaseChatIds: [],
    };
    await openRegistry(tree, [live, branched]);

    tree.actor.send({ type: 'branch', event: { type: 'merge', branch: 'bracket-fillet' } });
    await flush();
    tree.promises.settle('checkBranch', { output: { needsConfirmation: false } });
    await flush();
    tree.promises.settle('mergeBranch', {
      output: { status: 'conflicted', revisionId: 'rev-conflicted', paths: ['src/bracket.ts'] },
    });
    await flush();

    /* The registry is re-read because the merge moved the source branch, and it
       now answers with the conflicted head — the only record-derived fact the
       card needs to exist (I3). */
    tree.promises.settle('listCheckouts', {
      output: {
        checkouts: [live, { ...branched, headRevisionId: 'rev-conflicted', conflicted: true }],
      },
    });
    await flush();

    const status = selectRevisionStatus(tree.actor.getSnapshot());
    expect(status.conflicts).toEqual([
      expect.objectContaining({ revisionId: 'rev-conflicted', branch: 'bracket-fillet' }),
    ]);
    expect(status.attention).toBe(1);
    expect(types(tree.emitted)).toContain('mergeConflicted');

    tree.actor.stop();
  });

  /* 8 — deterministic scripted actors, complementing the two real ports below. */
  it('produces the same sequence on every run of the same script', async () => {
    const run = async (): Promise<Readonly<{ calls: readonly string[]; emitted: readonly string[] }>> => {
      const tree = startTree();
      await openRegistry(tree);
      await leaseTurn(tree, { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', leaseIds: ['run-1'] });
      await completeTurn(tree, 'turn-1');
      await mint(tree, 'rev-2');
      await flush();
      const result = { calls: names(tree.promises.calls), emitted: types(tree.emitted) };
      tree.actor.stop();
      return result;
    };

    /* One actor set, run twice. That is determinism — a real precondition for
     * the two-set comparison, and not the comparison itself: nothing here
     * substitutes a native actor set for the browser one. */
    const first = await run();
    const second = await run();

    expect(second).toEqual(first);
  });

  /* 8 proper — `S48(8) two actor sets` below: the same script over the browser
   * and native ports, dumped and compared. 10 — the import boundary is proven
   * in `machines.import-boundary.test.ts`, which reads every `*.machine.ts` and
   * every generated `./*-machine` subpath; it is not repeated here.
   *
   * 5 and 6 are not here and are not missing. `sessions.machine` and
   * `project-session.machine` are app-local (`apps/ui/app/machines`), because
   * they own React-bound resources (W19 §7.1); this package cannot reach them
   * without an import-boundary crossing that I20 forbids. Their composition
   * home is `apps/ui/app/machines/sessions.composition.test.tsx`: the budget
   * close and the refusal are pins b and b2 there, and the idle close through
   * the child timer on a manual clock is `closes an idle project through its
   * own child timer` in the same file. */

  /* 14, the selection half — S48(14) is one verb across two layers: the root
   * moves `selectedCheckoutId` and publishes the route it resolves to, and the
   * workbench re-roots at it. This is the first half; the second is
   * `apps/ui/app/machines/sessions.composition.test.tsx`'s
   * "follows the selection to a new root without remounting the workbench".
   *
   * "Without reload" is the assertion that the *restore* child never ran: a
   * re-root that computed or applied a plan would be this project's files being
   * rewritten under the person, which is what switching branches used to mean. */
  it('re-roots the workbench selection onto a linked checkout without restoring anything', async () => {
    const tree = startTree();
    const branched: CheckoutRecord = {
      id: 'checkout-fillet',
      projectId: 'project-1',
      root: '/checkouts/checkout-fillet',
      kind: 'linked',
      branch: 'bracket-fillet',
      headRevisionId: 'rev-theirs',
      leaseRunIds: [],
      leaseChatIds: [],
    };
    await openRegistry(tree, [live, branched]);
    expect(selectRevisionStatus(tree.actor.getSnapshot()).checkoutRoot).toBe('/projects/project-1');

    tree.actor.send({ type: 'switch', branch: 'bracket-fillet' });
    await flush();

    const status = selectRevisionStatus(tree.actor.getSnapshot());
    expect(status.checkoutId).toBe('checkout-fillet');
    expect(status.checkoutRoot).toBe('/checkouts/checkout-fillet');
    expect(status.follow).toBe('pinned');
    expect(tree.emitted).toContainEqual(
      expect.objectContaining({ type: 'switchResolved', mode: 'reroot', checkoutId: 'checkout-fillet' }),
    );
    /* Nothing was restored, and no second checkout was created for the branch
     * that already had one. */
    expect(tree.promises.inputsFor('computePlan')).toEqual([]);
    expect(tree.promises.inputsFor('applyPlan')).toEqual([]);
    expect(tree.promises.inputsFor('addCheckout')).toEqual([]);

    tree.actor.stop();
  });

  /* 9 — the publish child asks its parent, the parent forwards to sync, and
   * only the correlated scheduler settlement may complete the publish. */
  it('ends a publish whose real publish → root → sync push fails in `error`', async () => {
    const tree = startTree({ scheduler: true });
    await openRegistry(tree);
    const { children } = tree.actor.getSnapshot();
    const { sync, publish } = children;

    /* First publish: the scheduler finished rehydrating before the publish
     * effect created its Tau remote, so the correlated request must carry the
     * remote across the publish → root → sync wire. */
    tree.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    tree.promises.settle('syncReadRemote', { output: { remote: undefined } });
    await flush();

    /* The dialog, through to the push it waits for the settlement of. */
    publish?.send({ type: 'publish' });
    tree.promises.settle('listVersions', {
      output: { tags: [], revisionId: 'rev-2', expected: 'rev-1', remoteTags: {} },
    });
    await flush();
    publish?.send({
      type: 'confirm',
      draft: { tag: 'v1', projectName: 'p', entryPath: 'main.ts', visibility: 'public', title: 'p' },
    });
    tree.promises.settle('createTag', { output: { name: 'v1', revisionId: 'rev-2' } });
    await flush();
    tree.promises.settle('publishPush', { output: { pushId: 'push-1', remote: 'tau' } });
    await flush();

    if (!sync) {
      throw new Error('the sync machine is not composed under the root');
    }
    expect(sync.getSnapshot().context.pushId).toBe('push-1');
    expect(tree.promises.inputsFor('syncPush')).toEqual([{ remote: 'tau', branch: 'main', leases: {} }]);
    tree.promises.settle('syncPush', { error: new Error('Failed to fetch') });
    await flush();
    tree.promises.settle('writePending', { output: undefined });
    await flush();

    /* The raw state, not the facet: `working` covers `pushing` and
     * `publishing` alike, so only the state name says whether the machine is
     * still waiting for a settlement or has already published over one. */
    const settled = publish?.getSnapshot();
    if (!settled) {
      throw new Error('the publish machine is not composed under the root');
    }

    expect(settled.value).toBe('error');
    expect(selectPublishFacet(settled).error).toBeDefined();

    tree.actor.stop();
  });
});

/* ------------------------------------------------------------------------ *
 * S48(8) — the same script over two real actor sets.
 *
 * Every row above scripts the effect surface, which proves the machines fit
 * each other. This one proves they fit a *host*: `createProjectRevisionsActor`
 * is the one composition both legs use, so the only difference between the two
 * runs below is the `RevisionPort` underneath it — `isomorphic-git` over a
 * provider (the page's) and the `git` binary over a directory (a disk host's).
 *
 * The dump is the sequence the machines produced — every emitted fact in order
 * plus the projection the host renders — with the two host-specific values
 * normalized (the temporary root, and the checkout id each registry mints).
 * Everything else, the revision ids included, is compared verbatim: I4 says
 * identical edits name identical revisions, so a divergence in an id is a
 * divergence in the substrate, not in the script.
 * ------------------------------------------------------------------------ */

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
  await Promise.all(temporaryRoots.map(async (root) => rm(root, { force: true, recursive: true })));
});

/**
 * Wait for a fact the real effects produce.
 *
 * Unlike the scripted rows above, these effects are real work — `git` spawns a
 * process per command — so the wait is against a deadline rather than a count
 * of microtask turns.
 */
const until = async (predicate: () => boolean, label: string, timeoutMilliseconds = 60_000): Promise<void> => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${label}.`);
    }
    // oxlint-disable-next-line no-await-in-loop -- polling a real effect is sequential by definition.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }
};

type ActorSet = 'browser' | 'native';
type RevisionProjection = ReturnType<typeof selectRevisionStatus>;
type RecordedHead = Readonly<{
  revisionId: string | undefined;
  treeId: string | undefined;
  paths: readonly string[];
  provenance: unknown;
}>;

/** One run's ordered facts, plus what the host would render at the end. */
type Dump = Readonly<{
  /** Every sent event and observed effect, in execution order. */
  facts: readonly unknown[];
  emitted: readonly unknown[];
  status: RevisionProjection;
  /** The projection rebuilt by a fresh actor over these records alone. */
  rehydratedStatus: RevisionProjection;
  /** What the close revision recorded, as the port holds it. */
  head: RecordedHead;
  /** What the `close` cut recorded, read back out of the store (S48(12)). */
  closeRevisionFiles: readonly string[];
  /** Durable JSON under the host storage root after both actors stopped. */
  storedJson: ReadonlyArray<Readonly<{ path: string; text: string }>>;
}>;

const decoder = new TextDecoder();

/** Read only durable JSON, skipping the git implementation's own database. */
const storedJsonUnder = (root: string, directory = root): ReadonlyArray<Readonly<{ path: string; text: string }>> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '.git' ? [] : storedJsonUnder(root, path);
    }
    return entry.name.endsWith('.json')
      ? [{ path: path.slice(root.length + 1), text: readFileSync(path, 'utf8') }]
      : [];
  });

/**
 * Run the same scripted turn over one actor set and dump what it did.
 *
 * @param set - Which port the composition is wired over.
 * @returns The ordered emitted facts, the final projection and the files the
 *   close revision recorded.
 */
const runScriptedTurn = async (set: ActorSet): Promise<Dump> => {
  const root = await mkdtemp(join(tmpdir(), `tau-w22-${set}-`));
  temporaryRoots.push(root);
  const filesystem: RootedFileSystem = new NodeFsProvider(root);
  await filesystem.writeFile('main.ts', 'export const size = 1;\n');
  const port =
    set === 'browser'
      ? createIsomorphicGitRevisionPort({
          filesystem,
          checkouts: { projectId: 'project-1', root: () => filesystem },
        })
      : createNativeGitRevisionPort({ repositoryPath: root });
  await port.init({ author: { name: 'Tau', email: 'noreply@tau.new' } });

  /* Fixed, because a revision id is a function of its bytes *and* its time: two
   * hosts that disagree about the clock disagree about I4 for a reason that has
   * nothing to do with either leg. */
  const createdAt = Date.UTC(2026, 8, 13, 0, 0, 0);
  const placements: TurnPlacement[] = [];
  const facts: unknown[] = [];
  const startActor = () =>
    createProjectRevisionsActor({
      port,
      projectId: 'project-1',
      authorityEpoch: 'epoch-1',
      filesystem: () => filesystem,
      clock: () => createdAt,
      actorId: 'actor-1',
      actor: () => ({ kind: 'agent', id: 'model-1', runId: 'run-1' }),
      deviceId: () => 'device-1',
      onPlacement: (placement) => {
        placements.push(placement);
        facts.push({ effect: 'placement', placement });
      },
    });
  const { actor, settled } = startActor();
  const emitted = recordEmitted(actor);
  actor.on('*', (event) => {
    facts.push({ effect: 'emit', event });
  });
  actor.start();

  await until(() => actor.getSnapshot().context.registrySettled, `${set}: the registry to settle`);
  const admit = { type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' } as const;
  facts.push({ sent: admit });
  actor.send(admit);
  await until(() => placements.some((placement) => placement.status === 'leased'), `${set}: the turn to be placed`);
  /* The turn's edit, written where a host's agent writes it: into the checkout,
   * before the completion that records it. */
  await filesystem.writeFile('main.ts', 'export const size = 2;\n');
  facts.push({ effect: 'write', path: 'main.ts' });
  const completed = { type: 'turnCompleted', turnId: 'turn-1' } as const;
  facts.push({ sent: completed });
  actor.send(completed);
  /* `leaseRetired`, not `turnFinalized`: a trigger-only cut that lands while the
   * turn still holds the checkout is answered `nothingToSave` by design
   * (`project-revisions.machine.ts:747`, a2 R1), so the close below has to wait
   * for the tree to actually be let go. This is the composition fact the row
   * before it proves — the turn retires its lease before it attests — read from
   * the other side. */
  await until(() => emitted.some((event) => event.type === 'leaseRetired'), `${set}: the turn lease to retire`);

  /* S48(12)'s half that is host-neutral: an edit buffered after the last turn
   * is inside the revision the *close* cut records, not left on the floor. The
   * page's wire from `pagehide` to this event is pinned at its own owner
   * (`apps/ui/app/hooks/use-revision-status.test.tsx`, W13 P32). */
  await filesystem.writeFile('late.ts', 'export const late = true;\n');
  facts.push({ effect: 'write', path: 'late.ts' });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 10);
  });
  const close = {
    type: 'cut',
    trigger: 'close',
    checkoutId: selectRevisionStatus(actor.getSnapshot()).checkoutId,
    leaseIds: [],
  } as const;
  facts.push({ sent: close });
  actor.send(close);
  await until(() => {
    const answer = emitted.find((event) => event['trigger'] === 'close');
    if (answer !== undefined && answer.type !== 'revisionMinted') {
      throw new Error(`${set}: the close cut answered ${answer.type}, so nothing was recorded.`);
    }
    return answer !== undefined;
  }, `${set}: the close revision`);

  const status = selectRevisionStatus(actor.getSnapshot());
  const closeRevisionId = status.headRevisionId;
  const tree = closeRevisionId === undefined ? undefined : await port.readTree(toRevisionId(closeRevisionId));
  const record = closeRevisionId === undefined ? undefined : await port.readRevision(toRevisionId(closeRevisionId));
  const closeRevisionFiles = (tree?.entries() ?? [])
    .map((entry) => `${entry.path}=${decoder.decode(entry.content)}`)
    .toSorted();
  /* What the two legs put *into* the port, so a divergence names its own cause:
   * the same recorded tree and provenance must produce the same revision id
   * (the port-level proof is `revision-port.conformance.test.ts`'s I4 row), so
   * a difference here is a difference the composed effects made. */
  const head = {
    revisionId: record?.id,
    treeId: record?.treeId,
    paths: (tree?.entries() ?? []).map((entry) => entry.path).toSorted(),
    provenance: record?.provenance,
  };

  actor.stop();
  await settled();

  /* A new actor receives no snapshot. Its only input is the same port, so the
   * projection below can only have come from records the first actor wrote. */
  const rehydrated = startActor();
  rehydrated.actor.start();
  await until(
    () => rehydrated.actor.getSnapshot().context.registrySettled,
    `${set}: the replacement registry to settle`,
  );
  const rehydratedStatus = selectRevisionStatus(rehydrated.actor.getSnapshot());
  rehydrated.actor.stop();
  await rehydrated.settled();

  /* The two host-specific values, and only those: where the project is on this
   * host, and the id its registry minted for the live checkout. */
  const checkoutId = status.checkoutId ?? '';
  const normalize = <Value>(value: Value): Value =>
    JSON.parse(
      JSON.stringify(value ?? null)
        .split(root)
        .join('<root>')
        .split(checkoutId)
        .join('<live>'),
    ) as Value;
  return {
    facts: normalize(facts),
    emitted: normalize(emitted),
    status: normalize(status),
    rehydratedStatus: normalize(rehydratedStatus),
    head: normalize(head),
    closeRevisionFiles,
    storedJson: storedJsonUnder(root),
  };
};

describe.runIf(gitOnPath)('S48(8) — identical sequences over the browser and native actor sets (AC28, I4)', () => {
  /* Both runs are done once and shared: the native leg spawns a `git` process
   * per command, so running the script twice to ask two questions about it
   * would double the slowest thing in this file. */
  let browser: Dump;
  let native: Dump;

  beforeAll(async () => {
    browser = await runScriptedTurn('browser');
    native = await runScriptedTurn('native');
  }, 600_000);

  it('runs the same scripted turn to the same ordered facts and the same projection (AC28)', () => {
    expect(native.facts).toStrictEqual(browser.facts);
    expect(native.emitted).toStrictEqual(browser.emitted);
    expect(native.status).toStrictEqual(browser.status);
  });

  it.each<ActorSet>(['browser', 'native'])(
    'rehydrates the whole tree from records alone, with no persisted XState snapshot (%s)',
    (set) => {
      const dump = set === 'browser' ? browser : native;
      const { branches: beforeBranches, ...before } = dump.status;
      const { branches: afterBranches, ...after } = dump.rehydratedStatus;
      expect(after).toStrictEqual(before);
      expect(beforeBranches).toHaveLength(1);
      expect(afterBranches).toEqual([
        {
          name: 'main',
          head: dump.head.revisionId,
          checkoutId: dump.status.checkoutId,
          checkoutRoot: dump.status.checkoutRoot,
          leaseChatIds: [],
        },
      ]);
      expect(
        dump.storedJson.filter(
          ({ path, text }) =>
            /snapshot/iu.test(path) ||
            (/"value"\s*:/u.test(text) && /"context"\s*:/u.test(text) && /"children"\s*:/u.test(text)),
        ),
      ).toEqual([]);
    },
  );

  /* W11b-a3 closed the former I4 divergence by making both initializers write
   * the same generated attributes. Raw revision identity stays in this dump. */
  it('names the same revision for the same edits on both actor sets (I4)', () => {
    expect(native.head).toStrictEqual(browser.head);
  });

  it.each<[ActorSet]>([['browser'], ['native']])(
    'records the edit buffered after the last turn inside the close revision (%s)',
    async (set) => {
      const dump = await runScriptedTurn(set);

      /* The generated workspace config (`.gitignore`, `.gitattributes`) is in
       * the tree too — S16's files are versioned; the two the row is about are
       * the turn's edit and the one buffered after it. */
      expect(dump.closeRevisionFiles).toContain('main.ts=export const size = 2;\n');
      expect(dump.closeRevisionFiles).toContain('late.ts=export const late = true;\n');
    },
    300_000,
  );
});
