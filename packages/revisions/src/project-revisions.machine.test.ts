import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#project-revisions.machine.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutFenceActorInput } from '#checkout.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import { RevisionPortError } from '#revision-port.js';
import type { CheckoutRecord } from '#revision-port.js';
import { remoteMachine } from '#remote.machine.js';
import { resolutionMachine } from '#resolution.machine.js';
import { restoreMachine } from '#restore.machine.js';
import { syncMachine } from '#sync.machine.js';
import { turnMachine } from '#turn.machine.js';
import type { TurnLeaseActorInput } from '#turn.machine.js';
import {
  createFakeCallbackActors,
  createFakePromiseActors,
  createManualClock,
  recordEmitted,
} from '#test/fake-actors.js';
import type { FakeCallbackActors, FakePromiseActors } from '#test/fake-actors.js';

/*
 * Path table — `project-revisions.machine` (catalogue: 10).
 *
 * The children here are the real machines with their effects stubbed, so a
 * routing assertion is what the child actually did, not what a mock recorded.
 *
 *  1  start invokes the always-on children and opens the registry
 *  2  `checkoutsChanged` spawns one `checkout` per record, with `parentRef`
 *  3  a record already spawned is not spawned twice; a record that disappeared
 *     is stopped
 *  4  `admitTurn` spawns a `turn`; the same turn id is never admitted twice
 *  5  `cut` from a turn reaches that turn's checkout and no other
 *  6  `revisionMinted` reaches the requesting turn, which settles
 *  7  `turnFinalized` reaches `checkouts`, stops the turn child and is re-emitted
 *  8  `leaseStale` reaches `checkouts`
 *  9  root `exit` stops every spawned child
 * 10  selection: `pinTo`, `followChat`, and D10's `switch` (re-root, apply to
 *     live, refused while a lease holds live)
 * 11  the four inbound forwarders — `changed` to a checkout, `turnCompleted`,
 *     `turnAbandoned` and `release` to a turn (R9)
 * 12  a lease written inside a turn reaches the registry and comes back on the
 *     record, arming D10's switch guard and A25/I9's removal guard (R1)
 * 13  a rehydrated head tree makes the first cut a no-op (I5, R3)
 * 14  `casLost` reaches the requesting turn instead of expiring its bound (R5)
 * 15  a `cut` naming a checkout the root has not spawned is answered `cutFailed`
 * 16  `restore` learns the selection as soon as the registry resolves one (R8)
 * 17  a released turn is dropped and its lease leaves the registry (R12)
 * 18  the registry facts a host needs are re-emitted by the root (R11)
 * 19  an admission that arrives before the registry answers is held, replayed
 *     when it does, and lands its lease on the record (W3c §7.1); a turn that
 *     fails before leasing retires nothing and surfaces no failure (R23)
 * 20  nothing runs inside the held window, so the phantom run id R30 guarded
 *     against cannot be written at all, and Switch and removal stay available
 * 21  a `remote` verb is routed to the invoked `remote` child and its facet
 *     reaches the `RevisionStatus` projection (W11b)
 * 22  a `branch` verb is routed to the invoked `branch` child, whose delegated
 *     registry verb reaches `checkouts` and settles on its answer (W7)
 * 23  `addCheckout`/`removeCheckout` from a host reach the registry (W7)
 * 24  the `branches` facet carries the chats placed on each branch (S26)
 * 25  one `resolution` child per conflicted head, spawned from the records, not
 *     spawned twice, retired when the head moves off the conflicted revision
 * 26  the `conflicts` facet before and after its child reads, and `attention`
 * 27  a per-file verb is routed by revision id; one for an unknown revision is
 *     dropped rather than thrown
 * 28  `conflictResolved` is re-emitted and the registry is asked to read again
 * 29  `turnRequested` is re-emitted for whatever starts a chat turn (W10)
 * 30  a turn-ending verb that names a run reaches the queue as well as the ref,
 *     and a run id another turn already holds is refused whatever turn id
 *     carries it (T4-02, T4-hyp1)
 * --  `checkoutChanged` re-heads the checkout; the checkouts' own statuses feed
 *     the `RevisionStatus` projection; serializable snapshot; one machine value
 */

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
const linked: CheckoutRecord = {
  id: 'checkout-b',
  projectId: 'project-1',
  root: '/checkouts/checkout-b',
  kind: 'linked',
  branch: 'agent/b',
  leaseRunIds: [],
  leaseChatIds: [],
};

/** The same linked checkout, but its head is a conflicted revision (W10). */
const conflictedLinked: CheckoutRecord = {
  ...linked,
  headRevisionId: 'rev-conflict',
  conflicted: true,
};

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof projectRevisionsMachine>>;
  promises: FakePromiseActors;
  callbacks: FakeCallbackActors;
  emitted: ReturnType<typeof recordEmitted>;
}>;

const start = (): Harness => {
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
          actors: {
            computePlan: promises.actor('computePlan'),
            applyPlan: promises.actor('applyPlan'),
          },
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
        /* The remote child's own paths are its own suite's; here it only has to
         * be the one this root invokes, so the projection has a real facet. */
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
        /* Spawned per conflicted head (W10); its own paths are its own suite's. */
        resolution: resolutionMachine.provide({
          actors: {
            loadConflict: promises.actor('loadConflict'),
            materialize: promises.actor('materialize'),
            applyResolution: promises.actor('applyResolution'),
            finishMerge: promises.actor('finishMerge'),
            seedTurn: promises.actor('seedTurn'),
          },
        }),
        /* The scheduler, so the routes into and out of it are observable here
         * (W13). Its own paths are its own suite's; these names are prefixed
         * because two children have a `merge` and a `readRemote`. */
        sync: syncMachine.provide({
          actors: {
            readPending: promises.actor('readPending'),
            writePending: promises.actor('writePending'),
            readRemote: promises.actor('readSyncRemote'),
            push: promises.actor('syncPush'),
            fetch: promises.actor('syncFetch'),
            fastForward: promises.actor('syncFastForward'),
            merge: promises.actor('syncMerge'),
            connectivity: callbacks.actor('connectivity'),
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

const registerCheckouts = (harness: Harness, checkouts: readonly CheckoutRecord[] = [live, linked]): void => {
  harness.actor.send({ type: 'checkoutsChanged', checkouts });
};

/** Bring the invoked `checkouts` child to `ready` through its own records. */
const readyRegistry = async (
  harness: Harness,
  checkouts: readonly CheckoutRecord[] = [live, linked],
): Promise<void> => {
  harness.promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
  await flush();
  harness.promises.settle('listCheckouts', { output: { checkouts } });
  await flush();
};

/** Admit a turn and drive it to the point where it asks its checkout to cut. */
const turnToRequesting = async (harness: Harness): Promise<void> => {
  harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
  harness.promises.settle('prepare', {
    output: {
      checkoutId: 'checkout-b',
      branch: 'agent/b',
      baseRevisionId: 'rev-1',
      dirty: false,
      staleRunIds: [],
    },
  });
  await flush();
  harness.promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
  await flush();
  harness.callbacks.sendBack('lease', { type: 'leaseGranted' });
  harness.actor.send({ type: 'turnCompleted', turnId: 'turn-1' });
  harness.promises.settle('capture', { output: { captureId: 'capture-1' } });
  await flush();
  harness.promises.settle('merge', { output: { status: 'recorded' } });
  await flush();
};

describe('projectRevisionsMachine', () => {
  it('invokes the always-on children and opens the registry', async () => {
    const harness = start();

    /* `open` reached `checkouts`, which swept its leases with the project id. */
    expect(harness.promises.inputsFor('sweepLeases')).toEqual([{ projectId: 'project-1' }]);

    await readyRegistry(harness);
    expect(harness.actor.getSnapshot().context.checkouts).toEqual([live, linked]);

    harness.actor.stop();
  });

  it('spawns one checkout per registered record, each with a parent ref', () => {
    const harness = start();

    registerCheckouts(harness);

    const references = harness.actor.getSnapshot().context.checkoutRefs;
    expect(Object.keys(references)).toEqual(['checkout-live', 'checkout-b']);
    expect(references['checkout-b']?.getSnapshot().context.branch).toBe('agent/b');
    expect(references['checkout-b']?.getSnapshot().context.parentRef).toBeDefined();

    harness.actor.stop();
  });

  it('never spawns one checkout twice and stops one that disappeared', () => {
    const harness = start();

    registerCheckouts(harness);
    const first = harness.actor.getSnapshot().context.checkoutRefs['checkout-live'];
    const dropped = harness.actor.getSnapshot().context.checkoutRefs['checkout-b'];
    registerCheckouts(harness);

    expect(harness.actor.getSnapshot().context.checkoutRefs['checkout-live']).toBe(first);

    registerCheckouts(harness, [live]);

    expect(Object.keys(harness.actor.getSnapshot().context.checkoutRefs)).toEqual(['checkout-live']);
    expect(dropped?.getSnapshot().status).toBe('stopped');

    harness.actor.stop();
  });

  it('adopts a changed head when the registry refreshes an existing checkout', () => {
    const harness = start();
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }, linked]);

    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-2', headTreeId: 'tree-2' }, linked]);

    expect(harness.actor.getSnapshot().context.checkoutRefs['checkout-live']?.getSnapshot().context).toMatchObject({
      headRevisionId: 'rev-2',
      headTreeId: 'tree-2',
    });
    expect(selectRevisionStatus(harness.actor.getSnapshot())).toMatchObject({
      headRevisionId: 'rev-2',
      dirty: false,
    });
    harness.actor.stop();
  });

  it('refreshes checkout records when a branch merge settles', async () => {
    const harness = start();
    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }, linked]);
    harness.actor.send({
      type: 'branchMerged',
      branch: 'agent/b',
      into: 'main',
      revisionId: 'rev-2',
    });

    expect(harness.promises.inputsFor('listCheckouts')).toHaveLength(2);
    harness.actor.stop();
  });

  it('admits one turn per turn id', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-2' });

    expect(Object.keys(harness.actor.getSnapshot().context.turnRefs)).toEqual(['turn-1']);
    expect(harness.promises.inputsFor('prepare')).toEqual([{ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' }]);

    harness.actor.stop();
  });

  /*
   * V8: a held turn id delays an admission inside its owner.
   *
   * An edit or a *Try again* leases the turn id of the message it rewinds to,
   * which is the id the previous run of that turn leased. Refusing the second
   * admission outright — which is what `TURN_ALREADY_LEASED` did — put a
   * banner in front of the person for a condition that clears itself in well
   * under a second. The root knows when the hold ends, so the root waits.
   */
  it('queues an admission for a held turn id and answers it when that turn retires', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToRequesting(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-2' });

    expect(harness.emitted.filter((event) => event.type === 'turnRefused')).toEqual([]);
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([
      { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-2' },
    ]);
    expect(harness.promises.inputsFor('prepare')).toEqual([{ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' }]);

    harness.actor.send({
      type: 'turnReleased',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      runId: 'run-1',
      outcome: 'released',
    });
    await flush();

    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([]);
    expect(harness.promises.inputsFor('prepare')).toEqual([
      { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' },
      { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-2' },
    ]);

    harness.actor.stop();
  });

  /* The one thing `TURN_ALREADY_LEASED` still means (V9): a run id is minted
   * once per gesture and is the idempotency key, so the same one admitted
   * twice is a bug in the caller, never a queue. */
  it('refuses the same run id admitted twice', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToRequesting(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });

    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([]);
    expect(harness.emitted.find((event) => event.type === 'turnRefused')).toMatchObject({
      turnId: 'turn-1',
      chatId: 'chat-1',
      runId: 'run-1',
      code: 'TURN_ALREADY_LEASED',
    });

    harness.actor.stop();
  });

  /*
   * T4-02: a queued admission outlives the wait that asked for it.
   *
   * Every host bounds its admission wait (30 s) while the queue has neither a
   * bound nor a removal verb, so an entry whose caller had already given up was
   * still raised when the turn ahead of it retired. The turn that spawned took
   * the checkout's lease with nothing left to send it `turnCompleted`: the
   * checkout read as held for the rest of the session, every manual save on it
   * answered `nothingToSave`, and every later edit of that message queued
   * behind it. A lease has no heartbeat by policy (§8), so the caller giving
   * up is its only liveness signal — the verb that host already sends has to
   * reach the queue as well as the ref.
   */
  it('should drop a queued admission whose caller abandoned its run before the holding turn retired', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToRequesting(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-2' });

    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([
      { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-2' },
    ]);

    /* The caller's wait expired. It names the run it gave up on, which is not
     * the run the same turn id is still held by (V8). */
    harness.actor.send({ type: 'turnAbandoned', turnId: 'turn-1', runId: 'run-2' });

    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([]);
    /* The other run of that turn id is still recording. */
    expect(harness.actor.getSnapshot().context.turnRefs['turn-1']?.getSnapshot().context.outcome).toBeUndefined();

    harness.actor.send({
      type: 'turnReleased',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      runId: 'run-1',
      outcome: 'released',
    });
    await flush();

    /* Nothing is raised for the abandoned run, so no turn takes a lease that
     * nothing will ever retire. */
    expect(harness.promises.inputsFor('prepare')).toEqual([{ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' }]);

    harness.actor.stop();
  });

  /*
   * T4-hyp1: the V9 guard read the run id of the turn id it was handed, so the
   * same run arriving under a *different* turn id passed `turnIsNew` and
   * spawned a second turn. A run id is the lease's own key
   * (`.tau/runs/<runId>.json`), so that is two turns writing one lease file and
   * each retiring the other's.
   */
  it('should refuse a turn whose run id another turn already holds', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToRequesting(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-2', chatId: 'chat-1', runId: 'run-1' });

    expect(Object.keys(harness.actor.getSnapshot().context.turnRefs)).toEqual(['turn-1']);
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([]);
    expect(harness.emitted.find((event) => event.type === 'turnRefused')).toMatchObject({
      turnId: 'turn-2',
      chatId: 'chat-1',
      runId: 'run-1',
      code: 'TURN_ALREADY_LEASED',
    });

    harness.actor.stop();
  });

  it('routes a turn cut to that turn checkout and to no other', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({
      type: 'cut',
      trigger: 'turn',
      turnId: 'turn-1',
      checkoutId: 'checkout-b',
      leaseIds: ['run-1'],
    });

    const references = harness.actor.getSnapshot().context.checkoutRefs;
    expect(references['checkout-b']?.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);
    expect(references['checkout-live']?.getSnapshot().matches('clean')).toBe(true);
    expect(harness.callbacks.inputsFor('fence')).toEqual([{ checkoutId: 'checkout-b' }]);

    harness.actor.stop();
  });

  it('routes a cut outcome back to the requesting turn', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToRequesting(harness);

    expect(
      harness.actor.getSnapshot().context.turnRefs['turn-1']?.getSnapshot().matches({ finalizing: 'requesting' }),
    ).toBe(true);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'checkout-b',
      trigger: 'turn',
      turnId: 'turn-1',
      revisionId: 'rev-2',
    });

    expect(harness.actor.getSnapshot().context.turnRefs['turn-1']?.getSnapshot().matches('retiring')).toBe(true);
    expect(harness.emitted.map((event) => event.type)).toContain('revisionMinted');

    harness.actor.stop();
  });

  it('sends a finalized turn to checkouts, stops the turn and re-emits it', async () => {
    const harness = start();

    registerCheckouts(harness);
    /* The registry has to hold the lease for its retirement to mean anything:
     * a run id no record holds is left to `sweepLeases` (R23/R30). */
    await readyRegistry(harness, [{ ...live, leaseRunIds: ['run-1'] }, linked]);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    const turnRef = harness.actor.getSnapshot().context.turnRefs['turn-1'];

    harness.actor.send({
      type: 'turnFinalized',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      runId: 'run-1',
      revisionId: 'rev-2',
      trigger: 'turn',
      branch: 'main',
      runIds: ['run-1'],
    });

    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([{ projectId: 'project-1', runId: 'run-1' }]);
    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(turnRef?.getSnapshot().status).toBe('stopped');
    expect(harness.emitted.map((event) => event.type)).toContain('turnFinalized');

    harness.actor.stop();
  });

  it('forwards a stale lease to checkouts', async () => {
    const harness = start();

    await readyRegistry(harness, [{ ...live, leaseRunIds: ['run-9'] }, linked]);
    harness.actor.send({ type: 'leaseStale', runId: 'run-9' });

    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([{ projectId: 'project-1', runId: 'run-9' }]);

    harness.actor.stop();
  });

  it('stops every spawned child when the root stops', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    const { checkoutRefs, turnRefs } = harness.actor.getSnapshot().context;

    harness.actor.stop();

    for (const ref of [...Object.values(checkoutRefs), ...Object.values(turnRefs)]) {
      expect(ref.getSnapshot().status).toBe('stopped');
    }
  });

  it('pins the workbench and follows a chat', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({
      type: 'turnPrepared',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      branch: 'agent/b',
    });

    harness.actor.send({ type: 'pinTo', checkoutId: 'checkout-b' });
    expect(harness.actor.getSnapshot().context.selectedCheckoutId).toBe('checkout-b');
    expect(harness.actor.getSnapshot().context.follow).toBe('pinned');

    harness.actor.send({ type: 'followChat', chatId: 'chat-1' });
    expect(harness.actor.getSnapshot().context.follow).toBe('chat');
    expect(harness.actor.getSnapshot().context.selectedCheckoutId).toBe('checkout-b');

    registerCheckouts(harness, [live]);
    expect(harness.actor.getSnapshot().context.chatCheckouts).toEqual({});

    harness.actor.send({ type: 'followChat', chatId: 'chat-unknown' });
    expect(harness.actor.getSnapshot().context.selectedCheckoutId).toBe('checkout-live');

    harness.actor.stop();
  });

  it('re-roots a switch onto a branch that already has a checkout', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'switch', branch: 'agent/b' });

    expect(harness.actor.getSnapshot().context.selectedCheckoutId).toBe('checkout-b');
    expect(harness.emitted.find((event) => event.type === 'switchResolved')).toEqual({
      type: 'switchResolved',
      branch: 'agent/b',
      mode: 'reroot',
      checkoutId: 'checkout-b',
    });

    harness.actor.stop();
  });

  it('applies a switch to the live checkout when no lease holds it', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'switch', branch: 'agent/new' });

    expect(harness.emitted.find((event) => event.type === 'switchResolved')).toMatchObject({
      mode: 'applyToLive',
      checkoutId: 'checkout-live',
    });
    /* Resolving is not applying: the decision goes to the machine that owns the
       verb's lifecycle, or the emit is a report nothing acts on (review R3). */
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context).toMatchObject({
      operation: 'switch',
      branch: 'agent/new',
      mode: 'applyToLive',
      checkoutId: 'checkout-live',
    });

    harness.actor.stop();
  });

  it('refuses a switch while a lease holds the live checkout', () => {
    const harness = start();

    registerCheckouts(harness, [{ ...live, leaseRunIds: ['run-1'] }, linked]);
    harness.actor.send({ type: 'switch', branch: 'agent/new' });

    expect(harness.emitted.find((event) => event.type === 'switchRefused')).toMatchObject({
      branch: 'agent/new',
    });
    expect(harness.emitted.find((event) => event.type === 'switchResolved')).toBeUndefined();

    harness.actor.stop();
  });

  it('re-heads a checkout that a restore moved', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({
      type: 'checkoutChanged',
      checkoutId: 'checkout-b',
      revisionId: 'rev-4',
      treeId: 'tree-4',
      branch: undefined,
    });

    const ref = harness.actor.getSnapshot().context.checkoutRefs['checkout-b'];
    expect(ref?.getSnapshot().context.headRevisionId).toBe('rev-4');
    expect(ref?.getSnapshot().context.headTreeId).toBe('tree-4');
    expect(harness.actor.getSnapshot().context.checkouts[1]).toMatchObject({
      headRevisionId: 'rev-4',
      branch: undefined,
    });

    harness.actor.stop();
  });

  it('projects a RevisionStatus from the statuses its checkouts report', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'pinTo', checkoutId: 'checkout-b' });
    harness.actor.send({ type: 'changed', checkoutId: 'checkout-b', paths: ['a.ts'], generation: 1 });

    expect(selectRevisionStatus(harness.actor.getSnapshot())).toEqual({
      projectId: 'project-1',
      checkoutId: 'checkout-b',
      checkoutRoot: '/checkouts/checkout-b',
      branch: 'agent/b',
      projectDirty: true,
      dirty: true,
      minting: false,
      headRevisionId: undefined,
      follow: 'pinned',
      attention: 0,
      /* The restore child is idle until someone asks for a restore, and the
       * plan's two risk facts are read from it rather than copied (S19). */
      restore: { asking: false, busy: false, removedPathCount: 0, dirty: false, revisionNumber: undefined },
      /* Same rule for the remote child: the facet is read from it, and it is
         still reading git's remotes list here (S26 shows *Sync* only once a
         remote exists, D26). */
      remote: {
        kind: 'none',
        url: undefined,
        provider: undefined,
        repositoryId: undefined,
        fetchOnly: false,
        phase: 'none',
        storage: undefined,
        overQuota: [],
        error: undefined,
      },
      /* One row per branch, because one branch is one checkout (A2); the chips
       * are the chats whose turns were placed there (S26, W7). */
      branches: [
        {
          name: 'main',
          head: undefined,
          checkoutId: 'checkout-live',
          checkoutRoot: '/projects/project-1',
          leaseChatIds: [],
        },
        {
          name: 'agent/b',
          head: undefined,
          checkoutId: 'checkout-b',
          checkoutRoot: '/checkouts/checkout-b',
          leaseChatIds: [],
        },
      ],
      branchVerb: { busy: false, asking: false, operation: undefined, branch: undefined, question: undefined },
      /* W8's own row, filled here only because this assertion is one object
         literal: leaving it out keeps the suite red on a facet W13 does not
         own. Disclosed in the W13 report. */
      publish: { phase: 'idle', tags: [], publicationId: undefined, shareUrl: undefined, error: undefined },
      /* The scheduler is still reading its own record and git's remotes list,
         which is exactly what `Checking…` means in the Sync row (S26). */
      sync: { state: 'checking', pendingCount: 0, online: true, conflictRef: undefined, error: undefined },
      /* W10's row, empty until a merge records a conflicted head: existence is
         record-derived, so there is nothing here to be stale (S33). */
      conflicts: [],
    });

    harness.actor.stop();
  });

  it('keeps project dirtiness independent from the selected checkout', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'changed', checkoutId: 'checkout-b', paths: ['a.ts'], generation: 1 });

    expect(selectRevisionStatus(harness.actor.getSnapshot())).toMatchObject({
      checkoutId: 'checkout-live',
      dirty: false,
      projectDirty: true,
    });
    harness.actor.stop();
  });

  it('routes a remote verb to the remote child and projects its facet', async () => {
    const harness = start();
    harness.promises.settle('readRemote', { output: { remote: undefined } });
    await flush();

    harness.actor.send({ type: 'remote', event: { type: 'connect', kind: 'tau' } });
    await flush();
    harness.promises.settle('writeRemote', {
      output: { remote: { name: 'tau', url: 'https://api.tau.new/v1/git/project-1.git', kind: 'tau' } },
    });
    await flush();
    harness.promises.settle('authorize', { output: undefined });
    await flush();
    harness.promises.settle('validate', { output: { storage: { used: 1, quota: 2 } } });
    await flush();
    harness.promises.settle('initialSync', { output: {} });
    await flush();

    expect(selectRevisionStatus(harness.actor.getSnapshot()).remote).toStrictEqual({
      kind: 'tau',
      url: 'https://api.tau.new/v1/git/project-1.git',
      provider: undefined,
      repositoryId: undefined,
      fetchOnly: false,
      phase: 'connected',
      storage: { used: 1, quota: 2 },
      quota: undefined,
      overQuota: [],
      error: undefined,
      reason: undefined,
    });

    harness.actor.stop();
  });

  it('forwards a content change and the three turn verbs from the root', async () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'changed', checkoutId: 'checkout-b', paths: ['a.ts'], generation: 3 });

    const checkoutRef = harness.actor.getSnapshot().context.checkoutRefs['checkout-b'];
    expect(checkoutRef?.getSnapshot().matches('dirty')).toBe(true);
    expect(checkoutRef?.getSnapshot().context.writeGeneration).toBe(3);
    expect(harness.actor.getSnapshot().context.checkoutRefs['checkout-live']?.getSnapshot().matches('clean')).toBe(
      true,
    );

    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    harness.promises.settle('prepare', {
      output: {
        checkoutId: 'checkout-b',
        branch: 'agent/b',
        baseRevisionId: 'rev-1',
        dirty: false,
        staleRunIds: [],
      },
    });
    await flush();
    harness.promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
    await flush();
    harness.callbacks.sendBack('lease', { type: 'leaseGranted' });

    harness.actor.send({ type: 'turnAbandoned', turnId: 'turn-1' });
    expect(harness.actor.getSnapshot().context.turnRefs['turn-1']?.getSnapshot().matches('retiring')).toBe(true);

    harness.actor.stop();
  });

  it('routes a lease written inside a turn into the registry record', async () => {
    const harness = start();

    await readyRegistry(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    harness.promises.settle('prepare', {
      output: {
        checkoutId: 'checkout-live',
        branch: 'main',
        baseRevisionId: 'rev-1',
        dirty: false,
        staleRunIds: [],
      },
    });
    await flush();
    harness.promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
    await flush();

    /* A25/I9: the registry now knows the live checkout is held. */
    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({
      id: 'checkout-live',
      leaseRunIds: ['run-1'],
      leaseChatIds: [],
    });

    /* D10: and the switch guard reads the same set. */
    harness.actor.send({ type: 'switch', branch: 'agent/new' });
    expect(harness.emitted.find((event) => event.type === 'switchRefused')).toMatchObject({ branch: 'agent/new' });
    expect(harness.emitted.find((event) => event.type === 'switchResolved')).toBeUndefined();

    harness.actor.stop();
  });

  it('mints nothing on the first cut after rehydrating an unchanged head tree', async () => {
    const harness = start();

    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);
    harness.actor.send({
      type: 'cut',
      trigger: 'save',
      turnId: 'turn-1',
      checkoutId: 'checkout-live',
      leaseIds: [],
    });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    harness.promises.settle('cut', { output: { treeId: 'tree-1', cutId: 'cut-1' } });
    await flush();

    /* I5: the gate needs the head's tree, and rehydration is where it comes from. */
    expect(harness.promises.inputsFor('writeRevision')).toEqual([]);
    expect(harness.actor.getSnapshot().context.checkoutRefs['checkout-live']?.getSnapshot().matches('clean')).toBe(
      true,
    );

    harness.actor.stop();
  });

  it('routes a lost CAS to the requesting turn instead of leaving it to time out', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToRequesting(harness);
    /* One loss is a re-cut against the head the checkout just re-read (D24). */
    harness.actor.send({ type: 'casLost', checkoutId: 'checkout-b', trigger: 'turn', turnId: 'turn-1' });

    const turnRef = harness.actor.getSnapshot().context.turnRefs['turn-1'];
    expect(turnRef?.getSnapshot().matches({ finalizing: 'requesting' })).toBe(true);
    expect(turnRef?.getSnapshot().context.casRetries).toBe(1);

    /* The second is contention this turn cannot win by trying harder. */
    harness.actor.send({ type: 'casLost', checkoutId: 'checkout-b', trigger: 'turn', turnId: 'turn-1' });

    expect(turnRef?.getSnapshot().matches('retiring')).toBe(true);
    expect(turnRef?.getSnapshot().context.reason).toBe('cas-lost');
    expect(harness.emitted.map((event) => event.type)).toContain('casLost');

    harness.actor.stop();
  });

  /*
   * W6-a2 R1: the autosave triggers are not allowed to record a running turn's
   * bytes. The browser fires `hidden` on every `visibilitychange` and `close` on
   * every `pagehide` with no condition of its own, so the decline has to live
   * here, at the one place both legs route through.
   */
  it('declines a trigger-only cut while a turn holds that checkout', async () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    harness.promises.settle('prepare', {
      output: { checkoutId: 'checkout-b', branch: 'agent/b', baseRevisionId: 'rev-1', dirty: false, staleRunIds: [] },
    });
    await flush();
    harness.promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
    await flush();
    harness.callbacks.sendBack('lease', { type: 'leaseGranted' });

    /* The person switches tab while the agent is still writing. */
    harness.actor.send({ type: 'cut', trigger: 'hidden', checkoutId: 'checkout-b', leaseIds: [] });

    expect(harness.actor.getSnapshot().context.checkoutRefs['checkout-b']?.getSnapshot().matches('clean')).toBe(true);
    expect(harness.callbacks.inputsFor('fence')).toEqual([]);
    /* Declined, never dropped: the page renders *Nothing to save* and a host
     * flushing on close stops waiting (R2 — no outcome is silent). */
    expect(harness.emitted.filter((event) => event.type === 'nothingToSave')).toEqual([
      { type: 'nothingToSave', checkoutId: 'checkout-b', trigger: 'hidden' },
    ]);

    /* A checkout no turn holds still records: the decline is per checkout. */
    harness.actor.send({ type: 'cut', trigger: 'hidden', checkoutId: 'checkout-live', leaseIds: [] });
    expect(harness.callbacks.inputsFor('fence')).toEqual([{ checkoutId: 'checkout-live' }]);

    harness.actor.stop();
  });

  /* The second window over one project: no turn actor of this root's own, and
   * the lease is the only fact that says someone is recording (a2 R1). */
  it('declines a trigger-only cut while another host holds the lease', () => {
    const harness = start();

    registerCheckouts(harness, [{ ...live, leaseRunIds: ['run-elsewhere'] }, linked]);
    harness.actor.send({ type: 'cut', trigger: 'close', checkoutId: 'checkout-live', leaseIds: [] });

    expect(harness.callbacks.inputsFor('fence')).toEqual([]);
    expect(harness.emitted.filter((event) => event.type === 'nothingToSave')).toEqual([
      { type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'close' },
    ]);

    harness.actor.stop();
  });

  it('answers a cut naming a checkout it has not spawned', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToRequesting(harness);
    harness.actor.send({
      type: 'cut',
      trigger: 'turn',
      turnId: 'turn-1',
      checkoutId: 'checkout-ghost',
      leaseIds: ['run-1'],
    });

    const turnRef = harness.actor.getSnapshot().context.turnRefs['turn-1'];
    expect(turnRef?.getSnapshot().matches('retiring')).toBe(true);
    expect(turnRef?.getSnapshot().context.reason).toContain('checkout-ghost');

    harness.actor.stop();
  });

  it('tells restore which checkout the registry resolved, and its head', async () => {
    const harness = start();

    harness.promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
    await flush();
    harness.promises.settle('listCheckouts', {
      output: { checkouts: [{ ...live, headRevisionId: 'rev-9' }, linked] },
    });
    await flush();

    /* `restore`'s invoke input was evaluated before any record existed, so the
     * head it plans an undo against has to arrive as an announcement (R8). */
    const restoreRef = harness.actor.getSnapshot().children['restore'];
    expect(restoreRef?.getSnapshot().context.checkoutId).toBe('checkout-live');
    expect(restoreRef?.getSnapshot().context.headRevisionId).toBe('rev-9');

    harness.actor.send({ type: 'pinTo', checkoutId: 'checkout-b' });
    expect(restoreRef?.getSnapshot().context.checkoutId).toBe('checkout-b');

    harness.actor.stop();
  });

  it('drops a released turn and its lease', async () => {
    const harness = start();

    await readyRegistry(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    harness.promises.settle('prepare', {
      output: {
        checkoutId: 'checkout-live',
        branch: 'main',
        baseRevisionId: 'rev-1',
        dirty: false,
        staleRunIds: [],
      },
    });
    await flush();
    harness.promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
    await flush();
    const turnRef = harness.actor.getSnapshot().context.turnRefs['turn-1'];

    harness.actor.send({ type: 'turnAbandoned', turnId: 'turn-1' });
    harness.promises.settle('retireTurnLease', { output: undefined });
    await flush();

    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(turnRef?.getSnapshot().status).not.toBe('active');
    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([{ projectId: 'project-1', runId: 'run-1' }]);

    harness.promises.settle('retireRegistryLease', { output: undefined });
    await flush();

    /* The lease the turn wrote reached the record, and its release took it off
     * again — no phantom run id is left holding the checkout (R30). */
    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({ leaseRunIds: [] });

    harness.actor.stop();
  });

  it('re-emits the registry facts a host has to show', async () => {
    const harness = start();

    harness.promises.settle('sweepLeases', { output: { retiredRunIds: ['run-0'] } });
    await flush();
    harness.promises.settle('listCheckouts', {
      output: { checkouts: [live, { ...linked, removable: true }] },
    });
    await flush();

    expect(harness.emitted.map((event) => event.type)).toContain('leaseRetired');
    expect(harness.emitted.map((event) => event.type)).toContain('removalOffered');

    harness.actor.stop();
  });

  it('holds an admission that arrives before the registry, then replays it', async () => {
    const harness = start();

    /* Nothing orders `admitTurn` after the first `checkoutsChanged`. */
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });

    /* Held, not run: placement resolving here would name a checkout no actor
     * represents, and the turn's cut would be answered `cutFailed`. */
    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(harness.promises.inputsFor('prepare')).toEqual([]);
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([
      { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' },
    ]);

    await readyRegistry(harness);

    expect(harness.promises.inputsFor('prepare')).toEqual([{ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' }]);
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([]);

    harness.promises.settle('prepare', {
      output: {
        checkoutId: 'checkout-live',
        branch: 'main',
        baseRevisionId: 'rev-1',
        dirty: false,
        staleRunIds: [],
      },
    });
    await flush();
    harness.promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
    await flush();

    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({
      id: 'checkout-live',
      leaseRunIds: ['run-1'],
      leaseChatIds: [],
    });

    harness.actor.stop();
  });

  it('writes no lease at all inside the held window, so no phantom run id survives', async () => {
    const harness = start();

    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    /* The whole turn happens inside the window the buffer exists for. */
    harness.actor.send({ type: 'turnAbandoned', turnId: 'turn-1' });
    await flush();
    await readyRegistry(harness);

    /* A held admission is still replayed: the turn ran nowhere, so abandoning
     * it before the registry answered reached no actor. It is the lease that
     * must not exist, and none was written. */
    expect(harness.promises.inputsFor('writeLease')).toEqual([]);
    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({
      id: 'checkout-live',
      leaseRunIds: [],
      leaseChatIds: [],
    });

    /* D10 and A25/I9 both read that set; a phantom run id blocks them for the
     * rest of the session. */
    harness.actor.send({ type: 'switch', branch: 'agent/new' });
    expect(harness.emitted.find((event) => event.type === 'switchRefused')).toBeUndefined();
    expect(harness.emitted.find((event) => event.type === 'switchResolved')).toMatchObject({
      mode: 'applyToLive',
      checkoutId: 'checkout-live',
    });

    harness.actor.stop();
  });

  it('retires nothing when a turn fails before it leases', async () => {
    const harness = start();

    await readyRegistry(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    harness.promises.settle('prepare', { error: new Error('no checkout') });
    await flush();

    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([]);
    expect(harness.emitted.map((event) => event.type)).not.toContain('checkoutFailed');

    harness.actor.stop();
  });

  it('keeps a serializable snapshot with no function in context', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    const persisted = harness.actor.getPersistedSnapshot();

    expect(() => JSON.stringify(persisted)).not.toThrow();
    expect(JSON.stringify(persisted)).not.toContain('function');
    expect(Object.values(harness.actor.getSnapshot().context).some((value) => typeof value === 'function')).toBe(false);

    harness.actor.stop();
  });

  it('routes a branch verb to the branch child, which asks the registry through this root', async () => {
    const harness = start();

    await readyRegistry(harness);
    harness.actor.send({ type: 'branch', event: { type: 'create', name: 'enclosure-v2', from: 'rev-12' } });
    await flush();

    /* The registry is the one writer: `branch` never calls the port itself. */
    expect(harness.promises.inputsFor('addCheckout')).toEqual([
      { projectId: 'project-1', branch: 'enclosure-v2', from: 'rev-12' },
    ]);

    harness.promises.settle('addCheckout', {
      output: {
        checkout: {
          id: 'checkout-c',
          projectId: 'project-1',
          root: '/checkouts/checkout-c',
          kind: 'linked',
          branch: 'enclosure-v2',
          leaseRunIds: [],
          leaseChatIds: [],
        },
      },
    });
    await flush();

    /* The registry's own announcement is what settles the delegated verb. */
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().matches('idle')).toBe(true);
    expect(selectRevisionStatus(harness.actor.getSnapshot()).branches.map((row) => row.name)).toContain('enclosure-v2');

    harness.actor.stop();
  });

  /* A fresh project has files and no revision. *New branch* there used to reach
   * the registry with no base, which the port refuses as unborn — so the
   * composer's picker made no checkout and the turn leased the project itself.
   * The sequence moved to the `branch` child (P3); the root names the selection
   * and forwards the cut's trigger-only answers. */
  it('records the files first when a branch is made on a project that has no revision yet', async () => {
    const harness = start();

    await readyRegistry(harness, [live]);
    harness.actor.send({ type: 'branch', event: { type: 'create', name: 'isolated-run' } });
    await flush();

    /* The root names where the person is standing; only it knows. */
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context).toMatchObject({
      checkoutId: 'checkout-live',
      head: undefined,
    });
    /* The checkout is the sole minter (F2), so the verb asks it and waits. */
    expect(harness.promises.inputsFor('addCheckout')).toEqual([]);
    expect(harness.actor.getSnapshot().children['checkout:checkout-live']?.getSnapshot().matches('minting')).toBe(true);

    harness.actor.send({ type: 'revisionMinted', checkoutId: 'checkout-live', trigger: 'switch', revisionId: 'rev-1' });
    await flush();

    expect(harness.promises.inputsFor('addCheckout')).toEqual([
      { projectId: 'project-1', branch: 'isolated-run', from: 'rev-1' },
    ]);

    harness.actor.stop();
  });

  it('names the selected head on a branch verb, so a clean tree branches from it', async () => {
    const harness = start();

    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);
    harness.actor.send({ type: 'branch', event: { type: 'create', name: 'isolated-run' } });
    await flush();

    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context).toMatchObject({
      checkoutId: 'checkout-live',
      head: 'rev-1',
    });
    harness.actor.send({ type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'switch' });
    await flush();

    expect(harness.promises.inputsFor('addCheckout')).toEqual([
      { projectId: 'project-1', branch: 'isolated-run', from: 'rev-1' },
    ]);

    harness.actor.stop();
  });

  it('tells the branch child when the registry refuses its delegated verb', async () => {
    const harness = start();

    /* A head to branch from: with none, the verb records the files first. The
     * cut's answer is what takes it to the registry now (P3). */
    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }, linked]);
    harness.actor.send({ type: 'branch', event: { type: 'create', name: 'enclosure-v2' } });
    await flush();
    harness.actor.send({ type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'switch' });
    await flush();
    harness.promises.settle('addCheckout', {
      error: new RevisionPortError('CHECKOUT_CONFLICT', 'That branch already has a checkout.'),
    });
    await flush();

    /* P4: the code rides out with the refusal, so the page can choose words. */
    expect(harness.emitted).toContainEqual({
      type: 'checkoutFailed',
      operation: 'add',
      reason: 'That branch already has a checkout.',
      code: 'CHECKOUT_CONFLICT',
    });
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context.reasonCode).toBe('CHECKOUT_CONFLICT');
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().matches('idle')).toBe(true);

    harness.actor.stop();
  });

  it('routes a host addCheckout and removeCheckout to the registry', async () => {
    const harness = start();

    await readyRegistry(harness);
    harness.actor.send({ type: 'addCheckout', branch: 'enclosure-v2', from: 'rev-12' });
    await flush();
    expect(harness.promises.inputsFor('addCheckout')).toEqual([
      { projectId: 'project-1', branch: 'enclosure-v2', from: 'rev-12' },
    ]);
    harness.promises.settle('addCheckout', {
      output: {
        checkout: {
          id: 'checkout-c',
          projectId: 'project-1',
          root: '/checkouts/checkout-c',
          kind: 'linked',
          branch: 'enclosure-v2',
          leaseRunIds: [],
          leaseChatIds: [],
        },
      },
    });
    await flush();

    harness.actor.send({ type: 'removeCheckout', id: 'checkout-c' });
    await flush();
    expect(harness.promises.inputsFor('removeCheckout')).toEqual([{ projectId: 'project-1', id: 'checkout-c' }]);

    harness.actor.stop();
  });

  it('carries the chats placed on each branch in the branches facet, from the records alone', async () => {
    const harness = start();

    /* No `turnPrepared`: the chips must come from the leases the registry read
       off disk, or a reload loses them and *Follow chat* with them (I3, S26;
       review R9). This is exactly the state a rehydrated host is in. */
    registerCheckouts(harness, [live, { ...linked, leaseRunIds: ['run-1'], leaseChatIds: ['chat-1'] }]);
    await flush();

    expect(selectRevisionStatus(harness.actor.getSnapshot()).branches).toEqual([
      {
        name: 'main',
        head: undefined,
        checkoutId: 'checkout-live',
        checkoutRoot: '/projects/project-1',
        leaseChatIds: [],
      },
      {
        name: 'agent/b',
        head: undefined,
        checkoutId: 'checkout-b',
        checkoutRoot: '/checkouts/checkout-b',
        leaseChatIds: ['chat-1'],
      },
    ]);

    harness.actor.stop();
  });

  /* 25–28: the conflict cards (W10, S33). */
  it('spawns one resolution child per conflicted head and retires it when the head moves', async () => {
    const harness = start();

    registerCheckouts(harness, [live, conflictedLinked]);
    await flush();

    expect(Object.keys(harness.actor.getSnapshot().context.resolutionRefs)).toEqual(['rev-conflict']);
    expect(harness.promises.inputsFor('loadConflict')).toEqual([
      { projectId: 'project-1', revisionId: 'rev-conflict' },
    ]);
    /* Not spawned twice for the same head. */
    registerCheckouts(harness, [live, conflictedLinked]);
    await flush();
    expect(harness.promises.inputsFor('loadConflict')).toHaveLength(1);

    /* The head moved off the conflicted revision: the card, and its child, go. */
    registerCheckouts(harness, [live, { ...linked, headRevisionId: 'rev-resolved' }]);
    await flush();
    expect(harness.actor.getSnapshot().context.resolutionRefs).toEqual({});

    harness.actor.stop();
  });

  it('projects the conflict card from the records and its child, and counts it as attention', async () => {
    const harness = start();

    registerCheckouts(harness, [live, conflictedLinked]);
    await flush();
    /* Before the child has read anything, the card exists and says so. */
    expect(selectRevisionStatus(harness.actor.getSnapshot()).conflicts).toEqual([
      { revisionId: 'rev-conflict', branch: 'agent/b', labels: undefined, paths: [], busy: true, ready: false },
    ]);
    const projectedPathCounts: number[] = [];
    const subscription = harness.actor.subscribe((snapshot) => {
      projectedPathCounts.push(selectRevisionStatus(snapshot).conflicts[0]?.paths.length ?? 0);
    });

    harness.promises.settle('loadConflict', {
      output: {
        branch: 'agent/b',
        labels: { ours: 'main', theirs: 'agent/b' },
        paths: [{ path: 'enclosure.ts', openable: true }],
        checkoutId: 'checkout-b',
      },
    });
    await flush();

    const status = selectRevisionStatus(harness.actor.getSnapshot());
    expect(status.conflicts).toEqual([
      {
        revisionId: 'rev-conflict',
        branch: 'agent/b',
        labels: { ours: 'main', theirs: 'agent/b' },
        paths: [{ path: 'enclosure.ts', openable: true, side: undefined }],
        busy: false,
        ready: false,
      },
    ]);
    /* A conflict needs a person, like a failed cut does (`revision.conflicted`). */
    expect(status.attention).toBe(1);
    expect(projectedPathCounts.at(-1)).toBe(1);

    subscription.unsubscribe();
    harness.actor.stop();
  });

  it('routes a per-file verb to the conflicted revision it names', async () => {
    const harness = start();

    registerCheckouts(harness, [live, conflictedLinked]);
    await flush();
    harness.promises.settle('loadConflict', {
      output: {
        branch: 'agent/b',
        labels: { ours: 'main', theirs: 'agent/b' },
        paths: [{ path: 'enclosure.ts', openable: true }],
        checkoutId: 'checkout-b',
      },
    });
    await flush();

    harness.actor.send({
      type: 'resolution',
      revisionId: 'rev-conflict',
      event: { type: 'keepMine', path: 'enclosure.ts' },
    });
    await flush();

    expect(harness.promises.inputsFor('applyResolution')).toEqual([
      { projectId: 'project-1', revisionId: 'rev-conflict', path: 'enclosure.ts', side: 'mine' },
    ]);
    /* A verb for a revision this project holds no card for is dropped, not thrown. */
    harness.actor.send({
      type: 'resolution',
      revisionId: 'rev-missing',
      event: { type: 'keepMine', path: 'enclosure.ts' },
    });
    await flush();
    expect(harness.promises.inputsFor('applyResolution')).toHaveLength(1);

    harness.actor.stop();
  });

  it('re-emits a resolved conflict and asks the registry to read again', async () => {
    const harness = start();

    await readyRegistry(harness, [live, conflictedLinked]);
    harness.promises.settle('loadConflict', {
      output: {
        branch: 'agent/b',
        labels: { ours: 'main', theirs: 'agent/b' },
        paths: [{ path: 'enclosure.ts', openable: true }],
        checkoutId: 'checkout-b',
      },
    });
    await flush();
    harness.actor.send({
      type: 'resolution',
      revisionId: 'rev-conflict',
      event: { type: 'keepMine', path: 'enclosure.ts' },
    });
    harness.promises.settle('applyResolution', { output: undefined });
    await flush();
    harness.actor.send({ type: 'resolution', revisionId: 'rev-conflict', event: { type: 'finish' } });
    harness.promises.settle('finishMerge', { output: { revisionId: 'rev-resolved', branch: 'agent/b' } });
    await flush();

    expect(harness.emitted.find((event) => event.type === 'conflictResolved')).toEqual({
      type: 'conflictResolved',
      revisionId: 'rev-resolved',
      branch: 'agent/b',
    });
    /* The registry is re-read, which is what retires the card (one writer). */
    expect(harness.promises.inputsFor('listCheckouts')).toHaveLength(2);

    harness.actor.stop();
  });

  it('forwards a connected remote to the scheduler, which starts on the fact (W18 review DEF-6b, P53)', async () => {
    const harness = start();

    await readyRegistry(harness, [live]);
    harness.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    harness.promises.settle('readSyncRemote', { output: { remote: undefined } });
    await flush();
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.state).toBe('noRemote');

    harness.actor.send({ type: 'remoteConnected', kind: 'tau', url: 'https://api.tau.new/git/p1', name: 'tau' });
    await flush();
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.state).toBe('checking');

    harness.actor.send({ type: 'remoteDisconnected' });
    await flush();
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.state).toBe('noRemote');

    harness.actor.stop();
  });

  it('tells the scheduler a conflict was composed, so `Needs resolution` is not sticky (W13 review 2 R6/P37)', async () => {
    const harness = start();
    const conflictedLive: CheckoutRecord = { ...live, headRevisionId: 'rev-conflict', conflicted: true };

    /* The scheduler rehydrates, pulls, and finds the two lines diverged. */
    harness.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    harness.promises.settle('readSyncRemote', { output: { remote: 'tau' } });
    await flush();
    harness.promises.settle('syncFetch', {
      output: { leases: {}, integration: 'diverged', branches: [{ name: 'remote-feature', head: 'rev-remote' }] },
    });
    await flush();
    expect(selectRevisionStatus(harness.actor.getSnapshot()).branches).toContainEqual({
      name: 'remote-feature',
      head: 'rev-remote',
      checkoutId: undefined,
      checkoutRoot: undefined,
      leaseChatIds: [],
    });
    harness.promises.settle('syncMerge', {
      output: { status: 'conflicted', branch: 'main', into: 'main', paths: ['enclosure.ts'] },
    });
    await flush();
    await readyRegistry(harness, [conflictedLive]);
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.state).toBe('conflicted');

    /* W10's resolution settles on the branch the scheduler tracks. */
    harness.promises.settle('loadConflict', {
      output: {
        branch: 'main',
        labels: { ours: 'main', theirs: 'agent/b' },
        paths: [{ path: 'enclosure.ts', openable: true }],
        checkoutId: 'checkout-live',
      },
    });
    await flush();
    harness.actor.send({
      type: 'resolution',
      revisionId: 'rev-conflict',
      event: { type: 'keepMine', path: 'enclosure.ts' },
    });
    harness.promises.settle('applyResolution', { output: undefined });
    await flush();
    harness.actor.send({ type: 'resolution', revisionId: 'rev-conflict', event: { type: 'finish' } });
    harness.promises.settle('finishMerge', { output: { revisionId: 'rev-resolved', branch: 'main' } });
    await flush();

    /* Pulling again, not still `Needs resolution`: whether the remote takes the
     * composed revision is the remote's answer. */
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.state).not.toBe('conflicted');
    expect(harness.promises.inputsFor('syncFetch')).toHaveLength(2);

    harness.actor.stop();
  });

  it('re-emits a request to have a chat resolve one', async () => {
    const harness = start();

    registerCheckouts(harness, [live, conflictedLinked]);
    await flush();
    harness.promises.settle('loadConflict', {
      output: {
        branch: 'agent/b',
        labels: { ours: 'main', theirs: 'agent/b' },
        paths: [{ path: 'enclosure.ts', openable: true }],
        checkoutId: 'checkout-b',
      },
    });
    await flush();

    harness.actor.send({ type: 'resolution', revisionId: 'rev-conflict', event: { type: 'askChat' } });
    harness.promises.settle('seedTurn', { output: { checkoutId: 'checkout-b', paths: ['enclosure.ts'] } });
    await flush();

    expect(harness.emitted.find((event) => event.type === 'turnRequested')).toEqual({
      type: 'turnRequested',
      revisionId: 'rev-conflict',
      checkoutId: 'checkout-b',
      paths: ['enclosure.ts'],
    });

    harness.actor.stop();
  });

  it('exports exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([projectRevisionsMachine]);
  });
});

describe('root invokes notify the host on every child transition (P45)', () => {
  type InvokeEntry = Readonly<{ id?: string; onSnapshot?: unknown }>;
  const configured = projectRevisionsMachine.config.invoke as InvokeEntry | readonly InvokeEntry[] | undefined;
  const entries: readonly InvokeEntry[] =
    configured === undefined ? [] : Array.isArray(configured) ? configured : [configured];
  const children = ['checkouts', 'restore', 'remote', 'branch', 'publish', 'sync'] as const;

  it('invokes the six always-on children', () => {
    expect(entries.map((entry) => entry.id)).toStrictEqual([...children]);
  });

  it.each(children)('declares onSnapshot on %s so a child transition is a root snapshot', (id) => {
    expect(entries.find((entry) => entry.id === id)?.onSnapshot).toStrictEqual({ actions: [] });
  });
});
