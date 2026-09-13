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

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutFenceActorInput } from '#checkout.machine.js';
import { branchMachine } from '#branch.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import { remoteMachine } from '#remote.machine.js';
import { restoreMachine } from '#restore.machine.js';
import type { CheckoutRecord } from '#revision-port.js';
import { turnMachine } from '#turn.machine.js';
import type { TurnLeaseActorInput } from '#turn.machine.js';
import {
  createFakeCallbackActors,
  createFakePromiseActors,
  createManualClock,
  recordEmitted,
} from '#test/fake-actors.js';
import type { FakeCallbackActors, FakePromiseActors } from '#test/fake-actors.js';

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
}>;

/**
 * The whole actor tree, with every effect scripted.
 *
 * Nothing here is a mock of a machine: the children are the real ones, so a
 * composition assertion is what the tree actually did.
 *
 * @returns The started root plus its scripted effect surface.
 */
const startTree = (): Tree => {
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
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
      },
    }),
    { clock: createManualClock(), input: { projectId: 'project-1', liveCheckoutId: 'checkout-live' } },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, emitted };
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
  /* 1 — partial: S48(1) reads `project-revisions → checkouts → checkout → turn
   * → sync`. The last link is missing because `sync.machine` does not exist
   * yet (W13); everything before it is here, in order. */
  it('runs one scripted turn end to end in exactly one ordered effect sequence', async () => {
    const tree = startTree();
    await openRegistry(tree);
    await leaseTurn(tree, { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', leaseIds: ['run-1'] });
    await completeTurn(tree, 'turn-1');
    await mint(tree, 'rev-2');
    await flush();

    expect(names(tree.promises.calls)).toEqual([
      'readRemote',
      'sweepLeases',
      'listCheckouts',
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
    ]);
    expect(types(tree.emitted)).toContain('turnFinalized');
    expect(tree.promises.inputsFor('writeRevision')).toHaveLength(1);

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

  /* 7 */
  it('rehydrates the whole tree from records alone, with no persisted XState snapshot', async () => {
    const first = startTree();
    await openRegistry(first);
    await leaseTurn(first, { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', leaseIds: ['run-1'] });
    await completeTurn(first, 'turn-1');
    await mint(first, 'rev-2');
    await flush();
    const recorded: CheckoutRecord = { ...live, leaseRunIds: [], headRevisionId: 'rev-2' };
    const before = selectRevisionStatus(first.actor.getSnapshot());
    first.actor.stop();

    const second = startTree();
    await openRegistry(second, [recorded]);
    await flush();

    /* The same project, read back from what the host durably holds. `dirty`
     * and `minting` are live facts of a checkout that is not running, so they
     * come back false; the `branches` row is the record's too, and differs from
     * the first tree's in one field no record carried at that moment — `head`,
     * which the first tree still reads off a registry whose lease retirement
     * this script never settles. `leaseChatIds` now rehydrates like every other
     * field, because it is read from the leases on disk rather than from the
     * root's routing memory (W7 review R9). */
    expect(selectRevisionStatus(second.actor.getSnapshot())).toEqual({
      ...before,
      dirty: false,
      minting: false,
      headRevisionId: 'rev-2',
      branches: [
        {
          name: 'main',
          head: 'rev-2',
          checkoutId: 'checkout-live',
          checkoutRoot: '/projects/project-1',
          leaseChatIds: [],
        },
      ],
    });
    second.actor.stop();
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

  it('never restores a machine from a persisted snapshot', () => {
    const directory = new URL('.', import.meta.url).pathname;
    const offenders = readdirSync(directory)
      .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.test-d.ts'))
      .filter((entry) =>
        /getPersistedSnapshot|createActor\([^;]*\bsnapshot\b/su.test(readFileSync(join(directory, entry), 'utf8')),
      );

    expect(offenders).toEqual([]);
  });

  /* 8 — partial: determinism only; see the `it.todo` below for S48(8) proper. */
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

  it.todo('runs identical sequences over two actor sets (browser + native) — W22 owns AC28');

  /* 10 — the import boundary is proven in `machines.import-boundary.test.ts`,
   * which reads every `*.machine.ts` on disk; it is not repeated here. */

  it.todo(
    'closes the least-recently-touched idle project under budget and refuses with a list — needs sessions.machine (W19)',
  );
  it.todo('closes an idle project through its child timer on the manual clock — needs sessions.machine (W19)');
  /* `remote.machine` and its push/publish states exist; what does not exist is
   * the queue that sequences a publish behind a push — that is `sync.machine`'s
   * debounce, which W13 lands. */
  it.todo('ends a publish queued behind a push in `error` — needs the sync/publish queue (W13)');
});
