/**
 * What the `project-revisions` root takes from its checkout registry.
 *
 * The registry reads records once, at `loading`, and republishes them on every
 * lease change; the root keeps its own heads and branches against those
 * republishes, and the registry retires every settled turn's lease. The cases
 * live beside `project-revisions.machine.test.ts` rather than in it — that file
 * is at `max-lines` — with the same real children and stubbed effects.
 *
 * Path table:
 *
 *  1  a republished record never re-heads a checkout backwards (W0.10, L7 D-L7-1)
 *  2  a live switch reaches the checkout's branch, and a republish keeps it (W0.10, W5 F7)
 *  3  a conflicted turn's lease is retired like a finalized one's (W0.8, L7 P-1)
 */

import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import { checkoutIgnoredEvents, checkoutMachine } from '#checkout.machine.js';
import type { CheckoutFenceActorInput } from '#checkout.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import { remoteMachine } from '#remote.machine.js';
import { resolutionMachine } from '#resolution.machine.js';
import { restoreMachine } from '#restore.machine.js';
import type { CheckoutRecord } from '#revision-port.js';
import { syncMachine } from '#sync.machine.js';
import { turnIgnoredEvents, turnMachine } from '#turn.machine.js';
import type { TurnLeaseActorInput } from '#turn.machine.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createFakeCallbackActors, createFakePromiseActors, recordEmitted } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import type { IgnoredEvents } from '@taucad/xstate-testing/inspect';

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

/* W5 answered every row this suite reached (RM-R11), so nothing is ignored. */
const knownDefects: IgnoredEvents = {};

const start = () => {
  const guard = guardActors({ ignore: { ...knownDefects, turn: turnIgnoredEvents, checkout: checkoutIgnoredEvents } });
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const stub = promises.actor;
  const actor = createActor(
    projectRevisionsMachine.provide({
      actors: {
        checkouts: checkoutsMachine.provide({
          actors: {
            listCheckouts: stub('listCheckouts'),
            addCheckout: stub('addCheckout'),
            removeCheckout: stub('removeCheckout'),
            retireLease: stub('retireRegistryLease'),
          },
        }),
        restore: restoreMachine.provide({ actors: { computePlan: stub('computePlan'), applyPlan: stub('applyPlan') } }),
        checkout: checkoutMachine.provide({
          actors: {
            cut: stub('cut'),
            writeRevision: stub('writeRevision'),
            casHead: stub('casHead'),
            readHead: stub('readHead'),
            fence: callbacks.actor<CheckoutFenceActorInput>('fence'),
          },
        }),
        remote: remoteMachine.provide({
          actors: {
            readRemote: stub('readRemote'),
            writeRemote: stub('writeRemote'),
            removeRemote: stub('removeRemote'),
            authorize: stub('authorize'),
            validate: stub('validate'),
            initialSync: stub('initialSync'),
          },
        }),
        resolution: resolutionMachine.provide({
          actors: {
            loadConflict: stub('loadConflict'),
            materialize: stub('materialize'),
            applyResolution: stub('applyResolution'),
            finishMerge: stub('finishMerge'),
            seedTurn: stub('seedTurn'),
          },
        }),
        sync: syncMachine.provide({
          actors: {
            readPending: stub('readPending'),
            writePending: stub('writePending'),
            readRemote: stub('readSyncRemote'),
            push: stub('syncPush'),
            fetch: stub('syncFetch'),
            fastForward: stub('syncFastForward'),
            merge: stub('syncMerge'),
            connectivity: callbacks.actor('connectivity'),
          },
        }),
        turn: turnMachine.provide({
          actors: {
            prepare: stub('prepare'),
            writeLease: stub('writeLease'),
            retireLease: stub('retireTurnLease'),
            capture: stub('capture'),
            merge: stub('merge'),
            lease: callbacks.actor<TurnLeaseActorInput>('lease'),
          },
        }),
      },
    }),
    {
      clock: new StepClock(),
      inspect: guard.inspect,
      input: { projectId: 'project-1', liveCheckoutId: 'checkout-live' },
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, emitted };
};

type Harness = ReturnType<typeof start>;

/** Bring the invoked `checkouts` child to `ready` through its own records. */
const readyRegistry = async (harness: Harness, checkouts: readonly CheckoutRecord[]): Promise<void> => {
  await flush();
  harness.promises.settle('listCheckouts', { output: { checkouts } });
  await flush();
};

const key = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 0 } as const;

/** The view the page reads: status first, then the registry (RM-R5). */
const viewOfLive = (harness: Harness) => selectRevisionStatus(harness.actor.getSnapshot());

describe('projectRevisionsMachine and its checkout registry', () => {
  /* W0.10, L7 D-L7-1: the registry republishes the heads it read at `loading`
   * on every lease change, which used to re-head the checkout backwards. */
  it("should keep a checkout's head when the registry re-announces a stale record", async () => {
    const harness = start();
    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);
    const head = () =>
      harness.actor.getSnapshot().context.checkoutRefs['checkout-live']?.getSnapshot().context.headRevisionId;

    /* A producer's fact is a hint: the checkout re-reads its own head. */
    harness.actor.send({ type: 'checkoutChanged', checkoutId: 'checkout-live', revisionId: 'rev-2' });
    harness.promises.settle('readHead', { output: { revisionId: 'rev-2', treeId: 'tree-2', branch: 'main' } });
    await flush();
    /* The registry republishes the record it read at `loading`, still at `rev-1`. */
    harness.actor.send({
      type: 'leaseWritten',
      key: { ...key, runId: 'run-9' },
      checkoutId: 'checkout-live',
      leaseIds: ['run-9'],
    });
    await flush();

    expect(head()).toBe('rev-2');
    expect(viewOfLive(harness)).toMatchObject({ headRevisionId: 'rev-2', branch: 'main' });
    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({ leaseRunIds: ['run-9'] });

    harness.actor.stop();
  });

  /* W0.10, W5 F7: a checkout actor's branch was fixed at spawn, so a save after
   * a live switch to a fresh branch compare-and-swapped `main`. */
  it('should mint a save on the switched-to branch after a live switch', async () => {
    const harness = start();
    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);

    harness.actor.send({ type: 'checkoutChanged', checkoutId: 'checkout-live', branch: 'feature' });
    harness.promises.settle('readHead', { output: { revisionId: 'rev-1', treeId: 'tree-1', branch: 'feature' } });
    await flush();
    /* The registry's next announcements, on a lease landing and retiring, still name `main`. */
    harness.actor.send({
      type: 'leaseWritten',
      key: { ...key, runId: 'run-9' },
      checkoutId: 'checkout-live',
      leaseIds: ['run-9'],
    });
    harness.actor.send({ type: 'acknowledge', key: { ...key, runId: 'run-9' } });
    await flush();
    harness.promises.settle('retireRegistryLease', { output: undefined });
    await flush();
    harness.actor.send({ type: 'changed', checkoutId: 'checkout-live', paths: ['a.ts'], generation: 1 });
    harness.actor.send({
      type: 'cut',
      requestId: 'save-1',
      trigger: 'save',
      checkoutId: 'checkout-live',
      leaseIds: [],
    });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    harness.promises.settle('cut', { output: { treeId: 'tree-2', cutId: 'cut-1' } });
    await flush();
    harness.promises.settle('writeRevision', { output: { status: 'written', revisionId: 'rev-2' } });
    await flush();

    expect(harness.promises.inputsFor('casHead')).toEqual([
      { checkoutId: 'checkout-live', branch: 'feature', expectedHead: 'rev-1', head: 'rev-2' },
    ]);
    expect(viewOfLive(harness).branch).toBe('feature');

    harness.actor.stop();
  });

  /* W0.8, L7 P-1: the registry had no `turnConflicted` handler, so a
   * conflicted turn's lease stayed on the record and every later save on that
   * checkout was answered `nothingToSave` by the root until a reload. */
  it('should retire the lease of a conflicted turn', async () => {
    const harness = start();
    await readyRegistry(harness, [live]);

    harness.actor.send({ type: 'admitTurn', key });
    harness.promises.settle('prepare', {
      output: { checkoutId: 'checkout-live', branch: 'main', baseRevisionId: undefined, dirty: false },
    });
    await flush();
    harness.promises.settle('writeLease', {
      output: {
        lease: { ...key, checkoutId: 'checkout-live', startedAt: 1 },
        leaseIds: ['run-1'],
        held: [],
      },
    });
    await flush();
    harness.callbacks.sendBack('lease', { type: 'leaseGranted' });
    harness.actor.send({ type: 'turnCompleted', key });
    harness.promises.settle('capture', { output: { captureId: 'capture-1' } });
    await flush();
    harness.promises.settle('merge', { output: { status: 'conflicted', conflictRevisionId: 'rev-conflict' } });
    await flush();

    /* The host acknowledges the settlement, so the record retires, then the registry drops it (RM-R10). */
    harness.actor.send({ type: 'acknowledge', key });
    await flush();
    harness.promises.settle('retireTurnLease', { output: undefined });
    await flush();
    expect(harness.emitted.map((event) => event.type)).toContain('turnConflicted');
    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([
      { projectId: 'project-1', runId: 'run-1', key },
    ]);
    harness.promises.settle('retireRegistryLease', { output: undefined });
    await flush();

    expect(harness.actor.getSnapshot().children.checkouts?.getSnapshot().context.checkouts[0]?.leaseRunIds).toEqual([]);
    harness.actor.send({ type: 'changed', checkoutId: 'checkout-live', paths: ['a.ts'], generation: 1 });
    harness.actor.send({
      type: 'cut',
      requestId: 'save-1',
      trigger: 'save',
      checkoutId: 'checkout-live',
      leaseIds: [],
    });

    expect(harness.emitted.find((event) => event.type === 'nothingToSave')).toBeUndefined();
    expect(
      harness.actor
        .getSnapshot()
        .context.checkoutRefs['checkout-live']?.getSnapshot()
        .matches({ minting: 'acquiring' }),
    ).toBe(true);

    harness.actor.stop();
  });
});
