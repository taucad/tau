/* oxlint-disable max-lines -- the root's path table and its enumeration row (MC-S5) are one suite */
import { createActor, initialTransition, transition } from 'xstate';
import type { ActorRefFrom, AnyActorRef, AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#project-revisions.machine.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import type { ProjectRevisionsMachineEvent } from '#project-revisions.machine.js';
import { releaseUnplacedTurns } from '#revision-effects.js';
import { checkoutIgnoredEvents, checkoutMachine } from '#checkout.machine.js';
import type { CheckoutFenceActorInput } from '#checkout.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import { RevisionPortError } from '#revision-port.js';
import type { CheckoutRecord, ConflictRecord } from '#revision-port.js';
import { remoteMachine } from '#remote.machine.js';
import { resolutionMachine } from '#resolution.machine.js';
import { restoreMachine } from '#restore.machine.js';
import { syncMachine } from '#sync.machine.js';
import { turnIgnoredEvents, turnMachine } from '#turn.machine.js';
import type { TurnLeaseActorInput } from '#turn.machine.js';
import type { TurnAttemptKey } from '#turn.types.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createFakeCallbackActors, createFakePromiseActors, recordEmitted } from '@taucad/xstate-testing/fakes';
import type { FakeCallbackActors, FakePromiseActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import type { IgnoredEvents } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

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
 *  8  (deleted with the epoch sweep, W8 TS-S7)
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
 * 31  a restore mints on its line through the checkout child — pre-restore cut,
 *     apply, `restore` cut with `restoredFrom` — and never detaches (D1, T2); a
 *     restore on a held checkout is refused before any cut (A1); an admission to
 *     the restoring checkout waits for it, the open question included (A2, M4);
 *     `restore` hears the selection's line, again when a live switch moves it (M1)
 * 32  the projection names its line: `unknown`, `unborn`, `branch` (D3)
 * 33  W5b, RV-W5b: a conflicted turn retires its lease through the registry and
 *     the parked scheduler resumes (F1); a scheduler cut naming an unknown
 *     checkout is answered at once (F8); a stale registry lease over a dirty
 *     checkout cannot spin the pull (F2)
 * --  `checkoutChanged` re-heads the checkout and keeps its branch; the checkouts'
 *     own statuses feed the `RevisionStatus` projection; serializable snapshot;
 *     one machine value
 */

/* Known defects (MC-S5): W5 answered every row the root's real children reached (RM-R11), so nothing is ignored. */
const knownDefects: IgnoredEvents = {};

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

/** This device's conflict line for `main` (D14). */
const conflictLine = 'conflicts/main/device-a';

/** One undecided conflicted revision on it. */
const undecided: ConflictRecord = { revisionId: 'rev-conflict', line: conflictLine, into: 'main', foreign: false };

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof projectRevisionsMachine>>;
  promises: FakePromiseActors;
  callbacks: FakeCallbackActors;
  emitted: ReturnType<typeof recordEmitted>;
}>;

const start = (): Harness => {
  const guard = guardActors({ ignore: { ...knownDefects, turn: turnIgnoredEvents, checkout: checkoutIgnoredEvents } });
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
            find: promises.actor('find'),
            lease: callbacks.actor<TurnLeaseActorInput>('lease'),
          },
        }),
      },
    }),
    {
      input: { projectId: 'project-1', liveCheckoutId: 'checkout-live' },
      clock: new StepClock(),
      inspect: guard.inspect,
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, emitted };
};

const registerCheckouts = (
  harness: Harness,
  checkouts: readonly CheckoutRecord[] = [live, linked],
  conflicts: readonly ConflictRecord[] = [],
): void => {
  harness.actor.send({ type: 'checkoutsChanged', checkouts, conflicts });
};

/** Bring the invoked `checkouts` child to `ready` through its own records. */
const readyRegistry = async (
  harness: Harness,
  checkouts: readonly CheckoutRecord[] = [live, linked],
  conflicts: readonly ConflictRecord[] = [],
): Promise<void> => {
  await flush();
  harness.promises.settle('listCheckouts', { output: { checkouts, conflicts } });
  await flush();
};

const attemptKey = (runId = 'run-1', turnId = 'turn-1', attempt = 0): TurnAttemptKey => ({
  chatId: 'chat-1',
  turnId,
  runId,
  attempt,
});
const key1 = attemptKey();

/** The host admits an attempt through its placement port (TS-S3). */
const admit = (harness: Harness, key: TurnAttemptKey = key1): void => {
  harness.actor.send({ type: 'admitTurn', key });
};

/** The `writeLease` effect's answer: the record, and the checkout's lease set with this run first. */
const leaseWritten = (checkoutId: string, key: TurnAttemptKey = key1) => ({
  output: {
    lease: { ...key, checkoutId, startedAt: 1 },
    leaseIds: [key.runId],
    held: [],
  },
});

const prepared = (checkoutId: string, branch: string) => ({
  output: { checkoutId, branch, baseRevisionId: 'rev-1', dirty: false },
});

/** The attempt actor for a key: the root keys them by run and attempt (RM-S4). */
const turnRefOf = (harness: Harness, key: TurnAttemptKey = key1) =>
  harness.actor.getSnapshot().context.turnRefs[`${key.runId}/${String(key.attempt)}`];

/** The id of the attempt's result cut (RM-R1). */
const resultCutId = (key: TurnAttemptKey = key1, sequence = 0): string =>
  `${key.runId}/${String(key.attempt)}/result/${String(sequence)}`;

/** Admit a turn and drive it to where it holds its lease on `checkout-b`. */
const turnToHeld = async (harness: Harness, key: TurnAttemptKey = key1): Promise<void> => {
  admit(harness, key);
  harness.promises.settle('prepare', prepared('checkout-b', 'agent/b'));
  await flush();
  harness.promises.settle('writeLease', leaseWritten('checkout-b', key));
  await flush();
  harness.callbacks.sendBack('lease', { type: 'leaseGranted' });
  await flush();
};

/** Admit a turn and drive it to the point where it asks its checkout to cut. */
const turnToRequesting = async (harness: Harness, key: TurnAttemptKey = key1): Promise<void> => {
  await turnToHeld(harness, key);
  harness.actor.send({ type: 'turnCompleted', key });
  harness.promises.settle('capture', { output: { captureId: 'capture-1' } });
  await flush();
  harness.promises.settle('merge', { output: { status: 'recorded' } });
  await flush();
};

describe('projectRevisionsMachine', () => {
  it('invokes the always-on children and opens the registry', async () => {
    const harness = start();

    /* `open` reached `checkouts`, which lists the records with the project id and sweeps nothing (W8 TS-S7). */
    expect(harness.promises.inputsFor('listCheckouts')).toEqual([{ projectId: 'project-1' }]);

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

  /* RM-R5: the registry's head is spawn input only; the checkout's own head is the one shown. */
  it('keeps the head the checkout holds when the registry refreshes its record', () => {
    const harness = start();
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }, linked]);

    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-2', headTreeId: 'tree-2' }, linked]);

    expect(harness.actor.getSnapshot().context.checkoutRefs['checkout-live']?.getSnapshot().context).toMatchObject({
      headRevisionId: 'rev-1',
      headTreeId: 'tree-1',
    });
    expect(selectRevisionStatus(harness.actor.getSnapshot())).toMatchObject({
      headRevisionId: 'rev-1',
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

  /* TS-R2: an admission replayed for an attempt is answered by that attempt, never a second actor. */
  it('admits one actor per attempt', () => {
    const harness = start();

    registerCheckouts(harness);
    admit(harness);
    admit(harness);

    expect(Object.keys(harness.actor.getSnapshot().context.turnRefs)).toEqual(['run-1/0']);
    expect(harness.promises.inputsFor('prepare')).toEqual([{ key: key1 }]);

    harness.actor.stop();
  });

  /*
   * V8, RM-S4: an edit or a *Try again* reuses the turn id of the message it
   * rewinds to under a new run. Request ids route every answer, so the new
   * run runs beside the old one, and a verb names exactly one attempt.
   */
  it('should end only the named attempt when a turn id is reused', () => {
    const [initial] = initialTransition(projectRevisionsMachine, {
      projectId: 'project-1',
      liveCheckoutId: 'checkout-live',
    });
    const second = attemptKey('run-2');
    const events: ProjectRevisionsMachineEvent[] = [
      { type: 'checkoutsChanged', checkouts: [live], conflicts: [] },
      { type: 'admitTurn', key: key1 },
      { type: 'admitTurn', key: second },
    ];
    let admitted = initial;
    for (const event of events) {
      [admitted] = transition(projectRevisionsMachine, admitted, event);
    }

    expect(Object.keys(admitted.context.turnFacts)).toEqual(['run-1/0', 'run-2/0']);

    const [ended, actions] = transition(projectRevisionsMachine, admitted, { type: 'turnAbandoned', key: second });
    const targets = actions.flatMap((action) => {
      const { target, event } = action as unknown as { target?: { id?: unknown }; event?: { type?: unknown } };
      return event?.type === 'turnAbandoned' ? [target?.id] : [];
    });

    expect(targets).toEqual(['turn:run-2:0']);
    expect(Object.keys(ended.context.turnFacts)).toEqual(['run-1/0', 'run-2/0']);
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
  /* TS-R2: the page re-admits an attempt it is already waiting on; the attempt answers with its placement. */
  it('answers a replayed admission from the placed attempt it names', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToHeld(harness);
    admit(harness);

    expect(harness.promises.inputsFor('prepare')).toEqual([{ key: key1 }]);
    expect(harness.emitted.filter((event) => event.type === 'turnPlaced')).toHaveLength(2);

    harness.actor.stop();
  });

  /* The one thing `TURN_ALREADY_LEASED` still means (V9): a run id is minted
   * once per gesture and is the idempotency key, so the same one admitted
   * twice is a bug in the caller, never a queue. */
  /* V9: a run id is its lease's own key, so a second attempt of it while one is live is refused. */
  it('refuses a second attempt of a run while the first is live', async () => {
    const harness = start();

    registerCheckouts(harness);
    await turnToRequesting(harness);
    admit(harness, attemptKey('run-1', 'turn-1', 1));

    expect(Object.keys(harness.actor.getSnapshot().context.turnRefs)).toEqual(['run-1/0']);
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
  it('should drop a queued admission whose caller abandoned its run before the registry answered', async () => {
    const harness = start();

    admit(harness);
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([{ key: key1 }]);

    /* The caller's wait expired; it names the attempt it gave up on. */
    harness.actor.send({ type: 'turnAbandoned', key: key1 });
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([]);
    /* The dropped admission is still answered, as every admission is (RM-R1, GM.r1 L1). */
    expect(harness.emitted.filter((event) => event.type === 'turnRefused')).toMatchObject([
      { type: 'turnRefused', key: key1, runId: key1.runId, code: undefined },
    ]);

    await readyRegistry(harness);

    /* Nothing is raised for the abandoned run, so no turn takes a lease that nothing will ever retire. */
    expect(harness.promises.inputsFor('prepare')).toEqual([]);

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
    admit(harness, attemptKey('run-1', 'turn-2'));

    expect(Object.keys(harness.actor.getSnapshot().context.turnRefs)).toEqual(['run-1/0']);
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
      requestId: resultCutId(),
      trigger: 'turn',
      turn: { key: key1, turnCut: 'result' },
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

    expect(turnRefOf(harness)?.getSnapshot().matches('requesting')).toBe(true);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'checkout-b',
      trigger: 'turn',
      requestId: resultCutId(),
      turn: { key: key1, turnCut: 'result' },
      revisionId: 'rev-2',
      branch: 'agent/b',
    });

    /* The attempt waits in `settled` for the host's acknowledgement, then retires its record (RM-R10). */
    expect(turnRefOf(harness)?.getSnapshot().matches('settled')).toBe(true);
    harness.actor.send({ type: 'acknowledge', key: key1 });
    expect(turnRefOf(harness)?.getSnapshot().matches('retiring')).toBe(true);
    expect(harness.emitted.map((event) => event.type)).toContain('revisionMinted');
    expect(harness.emitted.map((event) => event.type)).toContain('turnFinalized');

    harness.actor.stop();
  });

  it('sends a retired turn to checkouts, stops the turn and re-emits its settlement', async () => {
    const harness = start();

    /* The registry has to hold the lease for its retirement to mean anything:
     * a run id no record holds retires nothing (R23/R30); `leaseWritten` puts it there. */
    await readyRegistry(harness);
    await turnToRequesting(harness);
    const turnRef = turnRefOf(harness);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'checkout-b',
      trigger: 'turn',
      requestId: resultCutId(),
      turn: { key: key1, turnCut: 'result' },
      revisionId: 'rev-2',
      branch: 'agent/b',
    });
    expect(harness.emitted.map((event) => event.type)).toContain('turnFinalized');
    /* RM-R10: the lease outlives the settlement until the retirement lands. */
    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([]);

    harness.actor.send({ type: 'acknowledge', key: key1 });
    harness.promises.settle('retireTurnLease', { output: undefined });
    await flush();

    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([
      { projectId: 'project-1', runId: 'run-1', key: key1 },
    ]);
    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    /* The attempt reached its final state, and the root dropped it. */
    expect(turnRef?.getSnapshot().status).toBe('done');
    expect(harness.emitted.map((event) => event.type)).toContain('turnRetired');

    harness.actor.stop();
  });

  it('stops every spawned child when the root stops', () => {
    const harness = start();

    registerCheckouts(harness);
    admit(harness);
    const { checkoutRefs, turnRefs } = harness.actor.getSnapshot().context;

    harness.actor.stop();

    for (const ref of [...Object.values(checkoutRefs), ...Object.values(turnRefs)]) {
      expect(ref.getSnapshot().status).toBe('stopped');
    }
  });

  it('pins the workbench and follows a chat', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'turnPrepared', key: key1, checkoutId: 'checkout-b', branch: 'agent/b' });

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
    harness.actor.send({ type: 'switch', requestId: 'switch-1', branch: 'agent/b' });

    expect(harness.actor.getSnapshot().context.selectedCheckoutId).toBe('checkout-b');
    expect(harness.emitted.find((event) => event.type === 'switchResolved')).toEqual({
      type: 'switchResolved',
      requestId: 'switch-1',
      branch: 'agent/b',
      mode: 'reroot',
      checkoutId: 'checkout-b',
    });

    harness.actor.stop();
  });

  it('applies a switch to the live checkout when no lease holds it', () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'switch', requestId: 'switch-1', branch: 'agent/new' });

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
    harness.actor.send({ type: 'switch', requestId: 'switch-1', branch: 'agent/new' });

    expect(harness.emitted.find((event) => event.type === 'switchRefused')).toMatchObject({
      branch: 'agent/new',
    });
    expect(harness.emitted.find((event) => event.type === 'switchResolved')).toBeUndefined();

    harness.actor.stop();
  });

  /* RM-R5: a producer's fact is a hint, so the checkout re-reads and reports its own head. */
  it('re-heads a checkout that a restore moved', async () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'checkoutChanged', checkoutId: 'checkout-b', revisionId: 'rev-4', treeId: 'tree-4' });
    harness.promises.settle('readHead', { output: { revisionId: 'rev-4', treeId: 'tree-4', branch: 'agent/b' } });
    await flush();

    const ref = harness.actor.getSnapshot().context.checkoutRefs['checkout-b'];
    expect(ref?.getSnapshot().context.headRevisionId).toBe('rev-4');
    expect(ref?.getSnapshot().context.headTreeId).toBe('tree-4');
    harness.actor.send({ type: 'pinTo', checkoutId: 'checkout-b' });
    expect(selectRevisionStatus(harness.actor.getSnapshot())).toMatchObject({
      headRevisionId: 'rev-4',
      line: { kind: 'branch', name: 'agent/b' },
    });

    harness.actor.stop();
  });

  it('publishes to the line a live Switch moved the same checkout onto (N9)', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-5', headTreeId: 'tree-5' }, linked]);

    actor.send({
      type: 'checkoutChanged',
      checkoutId: 'checkout-live',
      revisionId: 'rev-5',
      treeId: 'tree-5',
      branch: 'feature',
    });
    /* The hint re-reads; the checkout reports the line it found (RM-R5). */
    promises.settle('readHead', { output: { revisionId: 'rev-5', treeId: 'tree-5', branch: 'feature' } });
    await flush();
    actor.send({ type: 'cut', requestId: 'save-1', checkoutId: 'checkout-live', trigger: 'save', leaseIds: [] });
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: 'tree-6', cutId: 'cut-1' } });
    await flush();
    promises.settle('writeRevision', { output: { revisionId: 'rev-6' } });
    await flush();

    expect(promises.inputsFor('casHead')).toEqual([
      { checkoutId: 'checkout-live', branch: 'feature', expectedHead: 'rev-5', head: 'rev-6' },
    ]);

    actor.stop();
  });

  it('follows a rename of the branch a dirty checkout tracks without calling it clean (N9)', async () => {
    const harness = start();
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-5', headTreeId: 'tree-5' }, linked]);
    harness.actor.send({ type: 'changed', checkoutId: 'checkout-live', paths: ['main.ts'], generation: 1 });

    /* A listing that moved the line is a hint: the checkout re-reads it (RM-R5). */
    registerCheckouts(harness, [{ ...live, branch: 'renamed', headRevisionId: 'rev-5', headTreeId: 'tree-5' }, linked]);
    harness.promises.settle('readHead', { output: { revisionId: 'rev-5', treeId: 'tree-5', branch: 'renamed' } });
    await flush();

    const child = harness.actor.getSnapshot().context.checkoutRefs['checkout-live']?.getSnapshot();
    expect(child?.context.branch).toBe('renamed');
    expect(child?.matches('dirty')).toBe(true);

    harness.actor.stop();
  });

  it('names the line explicitly: unknown before the registry, unborn without a revision, then the branch (D3)', async () => {
    const harness = start();

    expect(selectRevisionStatus(harness.actor.getSnapshot()).line).toEqual({ kind: 'unknown' });

    registerCheckouts(harness);
    expect(selectRevisionStatus(harness.actor.getSnapshot()).line).toEqual({ kind: 'unborn', name: 'main' });

    /* The listing that names a first revision is a hint; the checkout re-reads its own head (RM-R5). */
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }, linked]);
    harness.promises.settle('readHead', { output: { revisionId: 'rev-1', treeId: 'tree-1', branch: 'main' } });
    await flush();
    expect(selectRevisionStatus(harness.actor.getSnapshot()).line).toEqual({ kind: 'branch', name: 'main' });

    harness.actor.stop();
  });

  it('restores by minting on the line: pre-restore cut, apply, restore cut — never a detached head (D1, T2)', async () => {
    const harness = start();
    const { actor, promises, callbacks, emitted } = harness;
    const bornLive = { ...live, headRevisionId: 'rev-5', headTreeId: 'tree-5' };
    registerCheckouts(harness, [bornLive, linked]);
    const restoreRef = actor.getSnapshot().children['restore'];

    restoreRef?.send({ type: 'restore', revisionId: 'rev-3' });
    /* The pre-restore cut reaches the live checkout, and a clean tree mints nothing. */
    expect(promises.inputsFor('cut')).toEqual([]);
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    expect(promises.inputsFor('cut')).toEqual([{ checkoutId: 'checkout-live', trigger: 'restore', generation: 0 }]);
    promises.settle('cut', { output: { treeId: 'tree-5', cutId: 'cut-1' } });
    await flush();

    expect(promises.inputsFor('computePlan')).toEqual([{ checkoutId: 'checkout-live', target: 'rev-3' }]);
    promises.settle('computePlan', {
      output: { planId: 'plan-1', revisionId: 'rev-3', revisionNumber: 3, removedPathCount: 0, dirty: false },
    });
    await flush();
    promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3' } });
    await flush();

    /* The applied tree is minted by the checkout itself, on top of the head it had. */
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: 'tree-3', cutId: 'cut-2' } });
    await flush();
    expect(promises.inputsFor('writeRevision')).toEqual([
      {
        checkoutId: 'checkout-live',
        cutId: 'cut-2',
        treeId: 'tree-3',
        parents: ['rev-5'],
        trigger: 'restore',
        leaseIds: [],
        restoredFrom: 'rev-3',
      },
    ]);
    promises.settle('writeRevision', { output: { revisionId: 'rev-6' } });
    await flush();
    expect(promises.inputsFor('casHead')).toEqual([
      { checkoutId: 'checkout-live', branch: 'main', expectedHead: 'rev-5', head: 'rev-6' },
    ]);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-6' } });
    await flush();

    const status = selectRevisionStatus(actor.getSnapshot());
    expect(status.line).toEqual({ kind: 'branch', name: 'main' });
    expect(status.headRevisionId).toBe('rev-6');
    expect(status.restore.busy).toBe(false);
    expect(actor.getSnapshot().context.checkouts[0]).toMatchObject({ branch: 'main' });
    expect(emitted.find((event) => event.type === 'revisionMinted')).toMatchObject({
      trigger: 'restore',
      revisionId: 'rev-6',
    });
    expect(restoreRef?.getSnapshot().context.restoredRevisionId).toBe('rev-6');

    actor.stop();
  });

  /* W1 palette/strip: offer Undo restore exactly when the machine would answer it, never UNDO_UNAVAILABLE. */
  it('says a restore is undoable only while its row is the selected head this root minted (M1)', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;
    /* A reload, or a restore another device made: the head is a restore row this root never minted. */
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-5', headTreeId: 'tree-5' }, linked]);
    expect(selectRevisionStatus(actor.getSnapshot()).restore.undoable).toBe(false);

    actor.getSnapshot().children['restore']?.send({ type: 'restore', revisionId: 'rev-3' });
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: 'tree-5', cutId: 'cut-1' } });
    await flush();
    promises.settle('computePlan', {
      output: { planId: 'plan-1', revisionId: 'rev-3', revisionNumber: 3, removedPathCount: 0, dirty: false },
    });
    await flush();
    promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3' } });
    await flush();
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: 'tree-3', cutId: 'cut-2' } });
    await flush();
    promises.settle('writeRevision', { output: { revisionId: 'rev-6' } });
    await flush();
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-6' } });
    await flush();
    expect(selectRevisionStatus(actor.getSnapshot()).restore.undoable).toBe(true);

    /* A save on top: the restore row is history now, and Undo would not reverse the newest change. */
    actor.send({
      type: 'checkoutStatusChanged',
      checkoutId: 'checkout-live',
      status: 'clean',
      branch: 'main',
      headRevisionId: 'rev-7',
    });
    expect(selectRevisionStatus(actor.getSnapshot()).restore.undoable).toBe(false);

    actor.stop();
  });

  it('refuses a restore on a checkout a turn holds before any cut, in Switch’s words (A1)', () => {
    const harness = start();
    const { actor, promises } = harness;
    registerCheckouts(harness, [
      { ...live, headRevisionId: 'rev-5', headTreeId: 'tree-5', leaseRunIds: ['run-1'] },
      linked,
    ]);
    const restoreRef = actor.getSnapshot().children['restore'];
    const toasts: unknown[] = [];
    restoreRef?.on('toast.error', (toast) => toasts.push(toast));

    restoreRef?.send({ type: 'restore', revisionId: 'rev-3' });

    expect(restoreRef?.getSnapshot().matches('idle')).toBe(true);
    expect(harness.callbacks.active('fence')).toBe(0);
    expect(promises.inputsFor('computePlan')).toEqual([]);
    expect(toasts).toEqual([
      { type: 'toast.error', message: 'An agent is working in this project’s files.', code: 'LEASE_UNAVAILABLE' },
    ]);

    actor.stop();
  });

  it('holds an admission to the restoring checkout until the restore settles (A2)', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-5', headTreeId: 'tree-5' }, linked]);
    const restoreRef = actor.getSnapshot().children['restore'];

    restoreRef?.send({ type: 'restore', revisionId: 'rev-3' });
    actor.send({ type: 'admitTurn', key: key1 });

    expect(actor.getSnapshot().context.turnRefs['run-1/0']).toBeUndefined();
    expect(actor.getSnapshot().context.pendingAdmissions).toEqual([{ key: key1 }]);

    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: 'tree-5', cutId: 'cut-1' } });
    await flush();
    promises.settle('computePlan', { error: new Error('unknown revision') });
    await flush();

    expect(restoreRef?.getSnapshot().matches('idle')).toBe(true);
    expect(actor.getSnapshot().context.turnRefs['run-1/0']).toBeDefined();
    expect(actor.getSnapshot().context.pendingAdmissions).toEqual([]);

    actor.stop();
  });

  it('holds an admission made while the restore question is open until the restore row lands (A2, M4)', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-5', headTreeId: 'tree-5' }, linked]);
    const restoreRef = actor.getSnapshot().children['restore'];

    restoreRef?.send({ type: 'restore', revisionId: 'rev-3' });
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: 'tree-5', cutId: 'cut-1' } });
    await flush();
    promises.settle('computePlan', {
      output: { planId: 'plan-1', revisionId: 'rev-3', revisionNumber: 3, removedPathCount: 2, dirty: false },
    });
    await flush();
    expect(restoreRef?.getSnapshot().matches('confirming')).toBe(true);

    /* The person has not answered yet; a chat turn arrives for the same files. */
    actor.send({ type: 'admitTurn', key: key1 });
    expect(actor.getSnapshot().context.turnRefs['run-1/0']).toBeUndefined();

    restoreRef?.send({ type: 'confirm' });
    promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3' } });
    await flush();
    /* The turn still waits: the files are the target's, and the restore row is not minted yet. */
    expect(actor.getSnapshot().context.turnRefs['run-1/0']).toBeUndefined();

    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: 'tree-3', cutId: 'cut-2' } });
    await flush();
    promises.settle('writeRevision', { output: { revisionId: 'rev-6' } });
    await flush();
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-6' } });
    await flush();

    expect(restoreRef?.getSnapshot().context.restoredRevisionId).toBe('rev-6');
    expect(actor.getSnapshot().context.turnRefs['run-1/0']).toBeDefined();
    expect(actor.getSnapshot().context.pendingAdmissions).toEqual([]);

    actor.stop();
  });

  it('tells restore the selection’s line, and again when a live switch moves it under the same id (M1)', async () => {
    const harness = start();
    const { actor } = harness;
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-5', headTreeId: 'tree-5' }, linked]);
    const restoreRef = actor.getSnapshot().children['restore'];
    expect(restoreRef?.getSnapshot().context).toMatchObject({ checkoutId: 'checkout-live', branch: 'main' });

    actor.send({
      type: 'checkoutChanged',
      checkoutId: 'checkout-live',
      revisionId: 'rev-9',
      treeId: 'tree-9',
      branch: 'feature',
    });
    /* The hint re-reads; the line the checkout reports is what restore is told (RM-R5). */
    harness.promises.settle('readHead', { output: { revisionId: 'rev-9', treeId: 'tree-9', branch: 'feature' } });
    await flush();

    expect(restoreRef?.getSnapshot().context).toMatchObject({ checkoutId: 'checkout-live', branch: 'feature' });

    actor.stop();
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
      line: { kind: 'unborn', name: 'agent/b' },
      registrySettled: true,
      projectDirty: true,
      dirty: true,
      minting: false,
      headRevisionId: undefined,
      follow: 'pinned',
      attention: 0,
      /* The restore child is idle until someone asks for a restore, and the
       * plan's two risk facts are read from it rather than copied (S19). */
      restore: {
        asking: false,
        busy: false,
        removedPathCount: 0,
        dirty: false,
        revisionNumber: undefined,
        undoable: false,
        canUndo: false,
      },
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

  it('forwards a content change and the turn verbs from the root', async () => {
    const harness = start();

    registerCheckouts(harness);
    harness.actor.send({ type: 'changed', checkoutId: 'checkout-b', paths: ['a.ts'], generation: 3 });

    const checkoutRef = harness.actor.getSnapshot().context.checkoutRefs['checkout-b'];
    expect(checkoutRef?.getSnapshot().matches('dirty')).toBe(true);
    expect(checkoutRef?.getSnapshot().context.writeGeneration).toBe(3);
    expect(harness.actor.getSnapshot().context.checkoutRefs['checkout-live']?.getSnapshot().matches('clean')).toBe(
      true,
    );

    await turnToHeld(harness);
    harness.actor.send({ type: 'turnAbandoned', key: key1 });
    harness.actor.send({ type: 'acknowledge', key: key1 });

    /* Released, then acknowledged by the host, so its record retires (RM-R10). */
    expect(turnRefOf(harness)?.getSnapshot().matches('retiring')).toBe(true);

    harness.actor.stop();
  });

  it('routes a lease written inside a turn into the registry record', async () => {
    const harness = start();

    await readyRegistry(harness);
    admit(harness);
    harness.promises.settle('prepare', prepared('checkout-live', 'main'));
    await flush();
    harness.promises.settle('writeLease', leaseWritten('checkout-live'));
    await flush();

    /* A25/I9: the registry now knows the live checkout is held. */
    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({
      id: 'checkout-live',
      leaseRunIds: ['run-1'],
      leaseChatIds: [],
    });

    /* D10: and the switch guard reads the same set. */
    harness.actor.send({ type: 'switch', requestId: 'switch-1', branch: 'agent/new' });
    expect(harness.emitted.find((event) => event.type === 'switchRefused')).toMatchObject({ branch: 'agent/new' });
    expect(harness.emitted.find((event) => event.type === 'switchResolved')).toBeUndefined();

    harness.actor.stop();
  });

  it('mints nothing on the first cut after rehydrating an unchanged head tree', async () => {
    const harness = start();

    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);
    harness.actor.send({
      type: 'cut',
      requestId: 'save-1',
      trigger: 'save',
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
    const turnRef = turnRefOf(harness);
    const lost = (sequence: number) =>
      ({
        type: 'casLost',
        checkoutId: 'checkout-b',
        trigger: 'turn',
        requestId: resultCutId(key1, sequence),
        turn: { key: key1, turnCut: 'result' },
      }) as const;

    /* One loss looks for the attempt's own result, then re-cuts against the head the checkout re-read (RM-R14, D24). */
    harness.actor.send(lost(0));
    expect(turnRef?.getSnapshot().matches('finding')).toBe(true);
    harness.promises.settle('find', { output: {} });
    await flush();
    expect(turnRef?.getSnapshot().matches('requesting')).toBe(true);
    expect(turnRef?.getSnapshot().context.casRetries).toBe(1);

    /* The second is contention this turn cannot win by trying harder: the cut is refused and the lease kept (RM-R13). */
    harness.actor.send(lost(1));
    harness.promises.settle('find', { output: {} });
    await flush();

    /* The attempt keeps its lease for the host's next `complete` (RM-R13, TS-Q9). */
    expect(turnRef?.getSnapshot().matches('held')).toBe(true);
    expect(turnRef?.getSnapshot().context).toMatchObject({ code: 'CAS_LOST' });
    expect(harness.emitted.map((event) => event.type)).toEqual(expect.arrayContaining(['casLost', 'turnCutRefused']));
    expect(harness.emitted.map((event) => event.type)).not.toContain('turnReleased');

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
    await turnToHeld(harness);

    /* The person switches tab while the agent is still writing. */
    harness.actor.send({
      type: 'cut',
      requestId: 'hidden-1',
      trigger: 'hidden',
      checkoutId: 'checkout-b',
      leaseIds: [],
    });

    expect(harness.actor.getSnapshot().context.checkoutRefs['checkout-b']?.getSnapshot().matches('clean')).toBe(true);
    expect(harness.callbacks.inputsFor('fence')).toEqual([]);
    /* Declined, never dropped: the page renders *Nothing to save* and a host
     * flushing on close stops waiting on its own id (R2, RM-R16). */
    expect(harness.emitted.filter((event) => event.type === 'nothingToSave')).toEqual([
      { type: 'nothingToSave', checkoutId: 'checkout-b', trigger: 'hidden', requestId: 'hidden-1', heldBy: key1 },
    ]);
    expect(harness.emitted).toContainEqual({ type: 'leaseHeld', key: key1, checkoutId: 'checkout-b' });

    /* A checkout no turn holds still records: the decline is per checkout. */
    harness.actor.send({
      type: 'cut',
      requestId: 'hidden-2',
      trigger: 'hidden',
      checkoutId: 'checkout-live',
      leaseIds: [],
    });
    expect(harness.callbacks.inputsFor('fence')).toEqual([{ checkoutId: 'checkout-live' }]);

    harness.actor.stop();
  });

  /* The second window over one project, or a refused turn whose retirement the
   * registry has not heard yet: the registry's list lags, so the cut reads the
   * records itself and the fresh fence answers `nothingToSave{heldBy}` (RM-R16, D10). */
  it('should leave a lease it does not hold to the fresh fence rather than the registry list', () => {
    const harness = start();

    registerCheckouts(harness, [{ ...live, leaseRunIds: ['run-elsewhere'] }, linked]);
    harness.actor.send({
      type: 'cut',
      requestId: 'close-1',
      trigger: 'close',
      checkoutId: 'checkout-live',
      leaseIds: [],
    });

    expect(harness.callbacks.inputsFor('fence')).toEqual([{ checkoutId: 'checkout-live' }]);
    expect(harness.emitted.filter((event) => event.type === 'nothingToSave')).toEqual([]);

    harness.actor.stop();
  });

  it('answers a cut naming a checkout it has not spawned', async () => {
    const harness = start();

    registerCheckouts(harness);
    /* A host's own save waits on its id, so the refusal is emitted with it (RM-R11). */
    harness.actor.send({
      type: 'cut',
      requestId: 'save-1',
      trigger: 'save',
      checkoutId: 'checkout-ghost',
      leaseIds: [],
    });
    expect(harness.emitted.find((event) => event.type === 'cutFailed')).toMatchObject({
      requestId: 'save-1',
      code: 'CHECKOUT_UNKNOWN',
    });

    /* A turn's cut is answered to the attempt, which keeps its lease and refuses the cut (RM-R13). */
    await turnToRequesting(harness);
    harness.actor.send({
      type: 'cut',
      requestId: resultCutId(),
      trigger: 'turn',
      turn: { key: key1, turnCut: 'result' },
      checkoutId: 'checkout-ghost',
      leaseIds: ['run-1'],
    });

    const turnRef = turnRefOf(harness);
    expect(harness.emitted.find((event) => event.type === 'turnCutRefused')).toMatchObject({ key: key1 });
    expect(turnRef?.getSnapshot().matches('held')).toBe(true);
    expect(turnRef?.getSnapshot().context.reason).toContain('checkout-ghost');

    harness.actor.stop();
  });

  it('tells restore which checkout the registry resolved', async () => {
    const harness = start();

    await flush();
    harness.promises.settle('listCheckouts', {
      output: { checkouts: [{ ...live, headRevisionId: 'rev-9' }, linked], conflicts: [] },
    });
    await flush();

    /* `restore`'s invoke input was evaluated before any record existed, so the
     * checkout it restores has to arrive as an announcement (R8). */
    const restoreRef = harness.actor.getSnapshot().children['restore'];
    expect(restoreRef?.getSnapshot().context.checkoutId).toBe('checkout-live');

    harness.actor.send({ type: 'pinTo', checkoutId: 'checkout-b' });
    expect(restoreRef?.getSnapshot().context.checkoutId).toBe('checkout-b');

    harness.actor.stop();
  });

  it('drops a released turn and its lease', async () => {
    const harness = start();

    await readyRegistry(harness);
    admit(harness);
    harness.promises.settle('prepare', prepared('checkout-live', 'main'));
    await flush();
    harness.promises.settle('writeLease', leaseWritten('checkout-live'));
    await flush();
    const turnRef = turnRefOf(harness);

    harness.actor.send({ type: 'turnAbandoned', key: key1 });
    harness.actor.send({ type: 'acknowledge', key: key1 });
    harness.promises.settle('retireTurnLease', { output: undefined });
    await flush();

    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(turnRef?.getSnapshot().status).not.toBe('active');
    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([
      { projectId: 'project-1', runId: 'run-1', key: key1 },
    ]);

    harness.promises.settle('retireRegistryLease', { output: undefined });
    await flush();

    /* The lease the turn wrote reached the record, and its release took it off
     * again — no phantom run id is left holding the checkout (R30). */
    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({ leaseRunIds: [] });

    harness.actor.stop();
  });

  it('routes the answer to the scheduler’s merge cut, and a retired lease, into the scheduler (D12, rule 9)', async () => {
    const harness = start();
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);
    harness.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    harness.promises.settle('readSyncRemote', { output: { remote: 'tau' } });
    await flush();
    harness.promises.settle('syncFetch', { output: { leases: {}, integration: 'fastForward' } });
    await flush();
    harness.promises.settle('syncFastForward', {
      output: { status: 'held', hold: 'dirty', checkoutId: 'checkout-live', revisionId: 'remote-2' },
    });
    await flush();

    /* The scheduler asked the checkout actor, through this root, for a `merge`
     * cut; the tree is already the head's, so the answer is *nothing to save*,
     * and only that answer reaching the scheduler lets it pull again. */
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    harness.promises.settle('cut', { output: { treeId: 'tree-1', cutId: 'cut-1' } });
    await flush();
    expect(harness.promises.inputsFor('syncFetch')).toHaveLength(2);

    /* Leased this time: parked until the registry says the lease retired. */
    harness.promises.settle('syncFetch', { output: { leases: {}, integration: 'fastForward' } });
    await flush();
    harness.promises.settle('syncFastForward', {
      output: { status: 'held', hold: 'leased', checkoutId: 'checkout-live', revisionId: 'remote-2' },
    });
    await flush();
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.arrived).toBe('remote-2');

    harness.actor.send({ type: 'leaseRetired', runId: 'run-1' });
    await flush();
    expect(harness.promises.inputsFor('syncFetch')).toHaveLength(3);

    harness.actor.stop();
  });

  it('resumes a scheduler parked behind a turn that ended conflicted (rule 9, RV-W5b F1)', async () => {
    const harness = start();
    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1', leaseRunIds: ['run-7'] }]);
    harness.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    harness.promises.settle('readSyncRemote', { output: { remote: 'tau' } });
    await flush();
    harness.promises.settle('syncFetch', { output: { leases: {}, integration: 'fastForward' } });
    await flush();
    harness.promises.settle('syncFastForward', {
      output: { status: 'held', hold: 'leased', checkoutId: 'checkout-live', revisionId: 'remote-2' },
    });
    await flush();
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.arrived).toBe('remote-2');

    /* A conflicted turn retires like every other outcome (W8 `turnEnded`). */
    harness.actor.send({
      type: 'turnRetired',
      key: { chatId: 'chat-7', turnId: 'turn-7', runId: 'run-7', attempt: 0 },
      checkoutId: 'checkout-live',
    });
    await flush();
    harness.promises.settle('retireRegistryLease', { output: undefined });
    await flush();

    expect(harness.promises.inputsFor('syncFetch')).toHaveLength(2);
    expect(harness.actor.getSnapshot().context.checkouts.find(({ id }) => id === 'checkout-live')?.leaseRunIds).toEqual(
      [],
    );

    harness.actor.stop();
  });

  it('answers a scheduler cut naming a checkout it has not spawned at once (RV-W5b F8)', async () => {
    const harness = start();
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);
    harness.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    harness.promises.settle('readSyncRemote', { output: { remote: 'tau' } });
    await flush();
    harness.promises.settle('syncFetch', { output: { leases: {}, integration: 'fastForward' } });
    await flush();
    harness.promises.settle('syncFastForward', {
      output: { status: 'held', hold: 'dirty', checkoutId: 'checkout-ghost', revisionId: 'remote-2' },
    });
    await flush();

    /* No clock advance: the answer, not the pull deadline, settles it. */
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync).toMatchObject({
      state: 'queued',
      error: 'This project has no checkout checkout-ghost.',
    });

    harness.actor.stop();
  });

  it('cannot spin the pull over a lease another tab holds and a dirty checkout (RV-W5b F2)', async () => {
    const harness = start();
    const heldBy = { chatId: 'chat-7', turnId: 'turn-7', runId: 'run-7', attempt: 0 };
    registerCheckouts(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1', leaseRunIds: ['run-7'] }]);
    harness.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    harness.promises.settle('readSyncRemote', { output: { remote: 'tau' } });
    await flush();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (harness.promises.running('syncFetch') === 0) {
        break;
      }
      harness.promises.settle('syncFetch', { output: { leases: {}, integration: 'fastForward' } });
      // eslint-disable-next-line no-await-in-loop -- one pull at a time.
      await flush();
      harness.promises.settle('syncFastForward', {
        output: { status: 'held', hold: 'dirty', checkoutId: 'checkout-live', revisionId: 'remote-2' },
      });
      // eslint-disable-next-line no-await-in-loop -- one pull at a time.
      await flush();
      /* The merge cut reaches the checkout; the fresh fence finds the other tab's lease (RM-R16). */
      harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
      harness.promises.settle('cut', { output: { treeId: 'tree-mine', cutId: `cut-${String(attempt)}` } });
      // eslint-disable-next-line no-await-in-loop -- one pull at a time.
      await flush();
      harness.promises.settle('writeRevision', { output: { status: 'held', heldBy } });
      // eslint-disable-next-line no-await-in-loop -- one pull at a time.
      await flush();
      // eslint-disable-next-line no-await-in-loop -- one pull at a time.
      await flush();
    }

    /* One immediate re-pull, then the backoff: no timers advanced, two pulls, nothing published. */
    expect(harness.promises.inputsFor('syncFetch')).toHaveLength(2);
    expect(harness.promises.inputsFor('casHead')).toHaveLength(0);

    harness.actor.stop();
  });

  it('re-emits the registry facts a host has to show', async () => {
    const harness = start();

    harness.promises.settle('listCheckouts', {
      output: { checkouts: [live, { ...linked, removable: true }], conflicts: [] },
    });
    await flush();

    expect(harness.emitted.map((event) => event.type)).toContain('removalOffered');

    harness.actor.stop();
  });

  it('releases every turn a close would wait on, buffered or still placing, and names their runs (RV-W2b #5)', async () => {
    const harness = start();
    harness.actor.send({ type: 'admitTurn', key: attemptKey('run-0', 'turn-0') });

    expect(releaseUnplacedTurns(harness.actor)).toEqual(['run-0']);
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([]);

    await readyRegistry(harness);
    harness.actor.send({ type: 'admitTurn', key: key1 });
    expect(Object.keys(harness.actor.getSnapshot().context.turnRefs)).toEqual(['run-1/0']);

    expect(releaseUnplacedTurns(harness.actor)).toEqual(['run-1']);
    await flush();
    /* The attempt releases whatever it is granted (TS-R1), so nothing is left
     * holding every checkout and a close cuts them all; a second close asks nothing again. */
    expect(harness.actor.getSnapshot().context.turnFacts['run-1/0']).toMatchObject({ abandoned: true });
    expect(releaseUnplacedTurns(harness.actor)).toEqual([]);
    expect(harness.promises.inputsFor('prepare')).toEqual([{ key: key1 }]);

    harness.actor.stop();
  });

  it('holds an admission that arrives before the registry, then replays it', async () => {
    const harness = start();

    /* Nothing orders `admitTurn` after the first `checkoutsChanged`. */
    admit(harness);

    /* Held, not run: placement resolving here would name a checkout no actor
     * represents, and the turn's cut would be answered `cutFailed`. */
    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(harness.promises.inputsFor('prepare')).toEqual([]);
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([{ key: key1 }]);

    await readyRegistry(harness);

    expect(harness.promises.inputsFor('prepare')).toEqual([{ key: key1 }]);
    expect(harness.actor.getSnapshot().context.pendingAdmissions).toEqual([]);

    harness.promises.settle('prepare', prepared('checkout-live', 'main'));
    await flush();
    harness.promises.settle('writeLease', leaseWritten('checkout-live'));
    await flush();

    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({
      id: 'checkout-live',
      leaseRunIds: ['run-1'],
      leaseChatIds: [],
    });

    harness.actor.stop();
  });

  /* RM-R11: an empty registry is still an answer, so a buffered admission is released and `prepare` refuses it. */
  it('should answer an admission when the registry lists no checkouts', async () => {
    const harness = start();

    admit(harness);
    await readyRegistry(harness, []);

    expect(harness.promises.inputsFor('prepare')).toEqual([{ key: key1 }]);
    harness.promises.settle('prepare', {
      error: new RevisionPortError(
        'CHECKOUT_CONFLICT',
        'That chat is working in files this project does not have open.',
      ),
    });
    await flush();

    expect(harness.emitted.find((event) => event.type === 'turnRefused')).toMatchObject({
      key: key1,
      code: 'CHECKOUT_CONFLICT',
    });
    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});

    harness.actor.stop();
  });

  it('writes no lease at all inside the held window, so no phantom run id survives', async () => {
    const harness = start();

    admit(harness);
    /* The whole turn happens inside the window the buffer exists for. */
    harness.actor.send({ type: 'turnAbandoned', key: key1 });
    await flush();
    await readyRegistry(harness);

    /* The abandoned admission leaves the buffer, so nothing is placed and no lease exists. */
    expect(harness.promises.inputsFor('prepare')).toEqual([]);
    expect(harness.promises.inputsFor('writeLease')).toEqual([]);
    expect(harness.actor.getSnapshot().context.checkouts[0]).toMatchObject({
      id: 'checkout-live',
      leaseRunIds: [],
      leaseChatIds: [],
    });

    /* D10 and A25/I9 both read that set; a phantom run id blocks them for the
     * rest of the session. */
    harness.actor.send({ type: 'switch', requestId: 'switch-1', branch: 'agent/new' });
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
    admit(harness);
    harness.promises.settle('prepare', { error: new Error('no checkout') });
    await flush();

    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(harness.promises.inputsFor('retireTurnLease')).toEqual([]);
    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([]);
    expect(harness.emitted.find((event) => event.type === 'turnRefused')).toMatchObject({ key: key1 });
    expect(harness.emitted.map((event) => event.type)).not.toContain('checkoutFailed');

    harness.actor.stop();
  });

  /* RM-R14: a restarted root adopts the record a verb names; the attempt finds its own result, so no second cut is made. */
  it('should adopt a lease record and settle it without a second cut', async () => {
    const harness = start();

    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', leaseRunIds: ['run-1'] }, linked]);
    harness.actor.send({ type: 'turnCompleted', key: key1 });
    const turnRef = turnRefOf(harness);

    expect(turnRef?.getSnapshot().matches('adopting')).toBe(true);
    expect(harness.promises.inputsFor('find')).toEqual([{ key: key1, checkoutId: 'checkout-live', stopAt: undefined }]);
    harness.promises.settle('find', { output: { result: 'rev-7' } });
    await flush();

    expect(harness.emitted.find((event) => event.type === 'turnFinalized')).toMatchObject({ revisionId: 'rev-7' });
    expect(harness.callbacks.inputsFor('fence')).toEqual([]);
    expect(harness.promises.inputsFor('capture')).toEqual([]);

    /* Not a legacy admission, so the lease stays until the host acknowledges (RM-R10). */
    expect(turnRef?.getSnapshot().matches('settled')).toBe(true);
    harness.actor.send({ type: 'acknowledge', key: key1 });
    expect(harness.promises.inputsFor('retireTurnLease')).toEqual([
      { key: key1, checkoutId: 'checkout-live', outcome: 'finalized' },
    ]);

    harness.actor.stop();
  });

  /* RM-R13, TS-Q9: a refused cut keeps the lease and holds the attempt for the host's next `complete`. */
  it('should keep the lease and hold the attempt when its cut is refused', async () => {
    const harness = start();

    await readyRegistry(harness);
    await turnToRequesting(harness);
    harness.actor.send({
      type: 'cutFailed',
      checkoutId: 'checkout-b',
      trigger: 'turn',
      requestId: resultCutId(),
      turn: { key: key1, turnCut: 'result' },
      reason: 'disk full',
    });
    await flush();

    expect(harness.emitted.find((event) => event.type === 'turnCutRefused')).toMatchObject({
      key: key1,
      cutFailures: 1,
    });
    expect(harness.emitted.map((event) => event.type)).not.toContain('turnReleased');
    expect(turnRefOf(harness)?.getSnapshot().matches('held')).toBe(true);
    expect(harness.promises.inputsFor('retireTurnLease')).toEqual([]);

    harness.actor.stop();
  });

  /* A retired attempt of this root is not a record to adopt, though the registry still lists its run (I20). */
  it('should not re-adopt an attempt it retired when a late verb names it', async () => {
    const harness = start();

    await readyRegistry(harness);
    await turnToHeld(harness);
    harness.actor.send({ type: 'turnAbandoned', key: key1 });
    harness.actor.send({ type: 'acknowledge', key: key1 });
    await flush();
    harness.promises.settle('retireTurnLease', { output: undefined });
    await flush();
    /* The registry has not dropped the run yet: its retirement is still running. */
    expect(
      harness.actor.getSnapshot().context.checkouts.find((checkout) => checkout.id === 'checkout-b'),
    ).toMatchObject({
      leaseRunIds: ['run-1'],
    });

    harness.actor.send({ type: 'turnCompleted', key: key1 });

    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(harness.promises.inputsFor('find')).toEqual([]);

    harness.actor.stop();
  });

  it('should forget a retired attempt once the registry drops its run', async () => {
    const harness = start();

    await readyRegistry(harness);
    await turnToHeld(harness);
    harness.actor.send({ type: 'turnAbandoned', key: key1 });
    harness.actor.send({ type: 'acknowledge', key: key1 });
    await flush();
    harness.promises.settle('retireTurnLease', { output: undefined });
    await flush();
    expect(harness.actor.getSnapshot().context.retiredAttempts).toEqual(['run-1/0']);

    registerCheckouts(harness, [live, linked]);

    expect(harness.actor.getSnapshot().context.retiredAttempts).toEqual([]);

    harness.actor.stop();
  });

  it('keeps a serializable snapshot with no function in context', () => {
    const harness = start();

    registerCheckouts(harness);
    admit(harness);
    const persisted = harness.actor.getPersistedSnapshot();

    expect(() => JSON.stringify(persisted)).not.toThrow();
    expect(JSON.stringify(persisted)).not.toContain('function');
    expect(Object.values(harness.actor.getSnapshot().context).some((value) => typeof value === 'function')).toBe(false);

    harness.actor.stop();
  });

  it('routes a branch verb to the branch child, which asks the registry through this root', async () => {
    const harness = start();

    await readyRegistry(harness);
    harness.actor.send({
      type: 'branch',
      event: { type: 'create', requestId: 'create-1', name: 'enclosure-v2', from: 'rev-12' },
    });
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

  /* A registry still loading takes no verb: a *New branch* from a named base
   * asked for then was dropped, and waited out its whole bound (W4 a3b). */
  it('asks the registry for a branch sent before the registry answered, once it answers', async () => {
    const harness = start();

    harness.actor.send({
      type: 'branch',
      event: { type: 'create', requestId: 'create-1', name: 'enclosure-v2', from: 'rev-12' },
    });
    await flush();
    expect(harness.promises.inputsFor('addCheckout')).toEqual([]);

    await readyRegistry(harness);

    expect(harness.promises.inputsFor('addCheckout')).toEqual([
      { projectId: 'project-1', branch: 'enclosure-v2', from: 'rev-12' },
    ]);
    harness.promises.settle('addCheckout', {
      error: Object.assign(new Error('no such revision'), { code: 'UNKNOWN_REVISION' }),
    });
    await flush();
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context.reasonCode).toBe('UNKNOWN_REVISION');

    harness.actor.stop();
  });

  /* The clock never moves here, so a verb the registry dropped would sit busy
   * forever instead of failing at its 30 s bound (W4 a3c). */
  it('makes a new branch asked for while a lease is retiring, once the retirement lands', async () => {
    const harness = start();
    await readyRegistry(harness, [live, { ...linked, leaseRunIds: ['run-9'] }]);
    const retiring = { chatId: 'chat-9', turnId: 'turn-9', runId: 'run-9', attempt: 0 };
    harness.actor.send({ type: 'turnRetired', key: retiring, checkoutId: 'checkout-b' });
    await flush();
    expect(harness.promises.inputsFor('retireRegistryLease')).toEqual([
      { projectId: 'project-1', runId: 'run-9', key: retiring },
    ]);

    harness.actor.send({
      type: 'branch',
      event: { type: 'create', requestId: 'create-1', name: 'enclosure-v2', from: 'rev-12' },
    });
    await flush();
    expect(harness.promises.inputsFor('addCheckout')).toEqual([]);
    harness.promises.settle('retireRegistryLease', { output: undefined });
    await flush();

    expect(harness.promises.inputsFor('addCheckout')).toEqual([
      { projectId: 'project-1', branch: 'enclosure-v2', from: 'rev-12' },
    ]);

    harness.actor.stop();
  });

  it('refuses a new branch at once when the registry failed to open', async () => {
    const harness = start();
    await flush();
    harness.promises.settle('listCheckouts', { error: new Error('no runs directory') });
    await flush();

    harness.actor.send({
      type: 'branch',
      event: { type: 'create', requestId: 'create-1', name: 'enclosure-v2', from: 'rev-12' },
    });
    await flush();

    /* `failed` is transient: the verb is back to idle, carrying the open's refusal. */
    expect(selectRevisionStatus(harness.actor.getSnapshot()).branchVerb.busy).toBe(false);
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context.reason).toBe('no runs directory');
    expect(harness.promises.inputsFor('addCheckout')).toEqual([]);

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
    harness.actor.send({ type: 'branch', event: { type: 'create', requestId: 'create-1', name: 'isolated-run' } });
    await flush();

    /* The root names where the person is standing; only it knows. */
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context).toMatchObject({
      checkoutId: 'checkout-live',
      head: undefined,
    });
    /* The checkout is the sole minter (F2), so the verb asks it and waits. */
    expect(harness.promises.inputsFor('addCheckout')).toEqual([]);
    /* Spawned children are not in the typed `schemas.children` map, so they are read by id. */
    const children: Readonly<Record<string, AnyActorRef | undefined>> = harness.actor.getSnapshot().children;
    const liveCheckout: ActorRefFrom<typeof checkoutMachine> | undefined = children['checkout:checkout-live'];
    expect(liveCheckout?.getSnapshot().matches('minting')).toBe(true);

    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'checkout-live',
      trigger: 'switch',
      requestId: 'create-1/cut',
      revisionId: 'rev-1',
      branch: 'main',
    });
    await flush();

    expect(harness.promises.inputsFor('addCheckout')).toEqual([
      { projectId: 'project-1', branch: 'isolated-run', from: 'rev-1' },
    ]);

    harness.actor.stop();
  });

  it('names the selected head on a branch verb, so a clean tree branches from it', async () => {
    const harness = start();

    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);
    harness.actor.send({ type: 'branch', event: { type: 'create', requestId: 'create-1', name: 'isolated-run' } });
    await flush();

    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context).toMatchObject({
      checkoutId: 'checkout-live',
      head: 'rev-1',
    });
    harness.actor.send({
      type: 'nothingToSave',
      checkoutId: 'checkout-live',
      trigger: 'switch',
      requestId: 'create-1/cut',
    });
    await flush();

    expect(harness.promises.inputsFor('addCheckout')).toEqual([
      { projectId: 'project-1', branch: 'isolated-run', from: 'rev-1' },
    ]);

    harness.actor.stop();
  });

  it('says whether the checkout registry has answered, so a rootless first projection is not read as no checkout (D41)', async () => {
    const harness = start();
    expect(selectRevisionStatus(harness.actor.getSnapshot()).registrySettled).toBe(false);

    await readyRegistry(harness, [live]);

    expect(selectRevisionStatus(harness.actor.getSnapshot()).registrySettled).toBe(true);
    harness.actor.stop();
  });

  it('reads a checked-out branch row at the live head, not the lagging registry record (D47)', async () => {
    const harness = start();

    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }]);
    harness.actor.send({
      type: 'checkoutStatusChanged',
      checkoutId: 'checkout-live',
      status: 'clean',
      branch: 'main',
      headRevisionId: 'rev-2',
    });
    await flush();

    const status = selectRevisionStatus(harness.actor.getSnapshot());
    expect(status.headRevisionId).toBe('rev-2');
    expect(status.branches.find((row) => row.checkoutId === 'checkout-live')?.head).toBe('rev-2');

    harness.actor.stop();
  });

  /*
   * A trigger-only cut naming no checkout was dropped on the floor, so the
   * `branch` child sat in `recording` for the whole 30 s bound and the person
   * watched a spinner rather than a refusal (review finding 10).
   */
  it('refuses a branch made on a project with nothing selected, without waiting out the bound', async () => {
    const harness = start();

    await readyRegistry(harness, []);
    /* The child's own words for this refusal, which the page keys on: a name
     * collision it is not, so *Pick another name* would never clear it. */
    const refusals = recordEmitted(harness.actor.getSnapshot().children.branch!);
    harness.actor.send({ type: 'branch', event: { type: 'create', requestId: 'create-1', name: 'isolated-run' } });
    await flush();

    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().matches('idle')).toBe(true);
    expect(harness.actor.getSnapshot().children.branch?.getSnapshot().context.reasonCode).toBe('CHECKOUT_UNKNOWN');
    expect(refusals).toContainEqual({
      type: 'toast.error',
      requestId: 'create-1',
      operation: 'create',
      branch: 'isolated-run',
      message: 'This project has no checkout checkout-live.',
      code: 'CHECKOUT_UNKNOWN',
    });

    harness.actor.stop();
  });

  it('tells the branch child when the registry refuses its delegated verb', async () => {
    const harness = start();

    /* A head to branch from: with none, the verb records the files first. The
     * cut's answer is what takes it to the registry now (P3). */
    await readyRegistry(harness, [{ ...live, headRevisionId: 'rev-1', headTreeId: 'tree-1' }, linked]);
    harness.actor.send({ type: 'branch', event: { type: 'create', requestId: 'create-1', name: 'enclosure-v2' } });
    await flush();
    harness.actor.send({
      type: 'nothingToSave',
      checkoutId: 'checkout-live',
      trigger: 'switch',
      requestId: 'create-1/cut',
    });
    await flush();
    harness.promises.settle('addCheckout', {
      error: new RevisionPortError('CHECKOUT_CONFLICT', 'That branch already has a checkout.'),
    });
    await flush();

    /* P4: the code rides out with the refusal, so the page can choose words. */
    expect(harness.emitted).toContainEqual({
      type: 'checkoutFailed',
      requestId: 'create-1/add',
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
    harness.actor.send({ type: 'addCheckout', requestId: 'add-1', branch: 'enclosure-v2', from: 'rev-12' });
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

    harness.actor.send({ type: 'removeCheckout', requestId: 'remove-1', id: 'checkout-c' });
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
  it('spawns one resolution child per undecided conflict and retires it once the line contains it (D14)', async () => {
    const harness = start();

    registerCheckouts(harness, [live, linked], [undecided]);
    await flush();

    expect(Object.keys(harness.actor.getSnapshot().context.resolutionRefs)).toEqual(['rev-conflict']);
    expect(harness.promises.inputsFor('loadConflict')).toEqual([
      { projectId: 'project-1', revisionId: 'rev-conflict' },
    ]);
    /* Not spawned twice for the same head. */
    registerCheckouts(harness, [live, linked], [undecided]);
    await flush();
    expect(harness.promises.inputsFor('loadConflict')).toHaveLength(1);

    /* A decision landed: the listing no longer holds it, and the card and its child go. */
    registerCheckouts(harness, [live, linked], []);
    await flush();
    expect(harness.actor.getSnapshot().context.resolutionRefs).toEqual({});

    harness.actor.stop();
  });

  it('projects the conflict card from the records and its child, and counts it as attention', async () => {
    const harness = start();

    registerCheckouts(harness, [live, linked], [undecided]);
    await flush();
    /* Before the child has read anything, the card exists and says so. */
    expect(selectRevisionStatus(harness.actor.getSnapshot()).conflicts).toEqual([
      {
        revisionId: 'rev-conflict',
        branch: conflictLine,
        into: 'main',
        foreign: false,
        labels: undefined,
        paths: [],
        busy: true,
        ready: false,
      },
    ]);
    const projectedPathCounts: number[] = [];
    const subscription = harness.actor.subscribe((snapshot) => {
      projectedPathCounts.push(selectRevisionStatus(snapshot).conflicts[0]?.paths.length ?? 0);
    });

    harness.promises.settle('loadConflict', {
      output: {
        branch: conflictLine,
        labels: { ours: 'main', theirs: 'agent/b' },
        paths: [{ path: 'enclosure.ts', openable: true }],
        checkoutId: 'checkout-live',
      },
    });
    await flush();

    const status = selectRevisionStatus(harness.actor.getSnapshot());
    expect(status.conflicts).toEqual([
      {
        revisionId: 'rev-conflict',
        branch: conflictLine,
        into: 'main',
        foreign: false,
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

    registerCheckouts(harness, [live, linked], [undecided]);
    await flush();
    harness.promises.settle('loadConflict', {
      output: {
        branch: conflictLine,
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

    await readyRegistry(harness, [live, linked], [undecided]);
    harness.promises.settle('loadConflict', {
      output: {
        branch: conflictLine,
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
    harness.promises.settle('finishMerge', { output: { revisionId: 'rev-resolved', branch: conflictLine } });
    await flush();

    expect(harness.emitted.find((event) => event.type === 'conflictResolved')).toEqual({
      type: 'conflictResolved',
      revisionId: 'rev-resolved',
      branch: conflictLine,
    });
    /* The registry is re-read, which is what retires the card (one writer). */
    expect(harness.promises.inputsFor('listCheckouts')).toHaveLength(2);

    harness.actor.stop();
  });

  it('re-emits a child toast, so a refused finish reaches the host with its reason (L2-F8)', async () => {
    const harness = start();

    await readyRegistry(harness, [live, linked], [undecided]);
    harness.promises.settle('loadConflict', {
      output: {
        branch: conflictLine,
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
    harness.promises.settle('finishMerge', { error: new Error('The disk is full.') });
    await flush();

    expect(harness.emitted.filter((event) => event.type === 'childToast')).toEqual([
      {
        type: 'childToast',
        subject: 'resolution',
        tone: 'error',
        message: expect.stringContaining('The disk is full.') as unknown as string,
      },
    ]);

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

  it('D50: pulls the branch the live checkout switched to, not the one the project opened on', async () => {
    const harness = start();

    await readyRegistry(harness, [live]);
    harness.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    harness.promises.settle('readSyncRemote', { output: { remote: 'origin', branch: 'main' } });
    await flush();
    harness.promises.settle('syncFetch', { output: { leases: {}, integration: 'upToDate' } });
    await flush();
    expect(harness.promises.inputsFor('syncFetch').at(-1)).toMatchObject({ branch: 'main' });

    harness.actor.send({
      type: 'checkoutChanged',
      checkoutId: live.id,
      revisionId: 'rev-feature',
      treeId: 'tree-feature',
      branch: 'feature',
    });
    /* The hint re-reads; the branch the checkout reports is what the scheduler pulls (RM-R5). */
    harness.promises.settle('readHead', {
      output: { revisionId: 'rev-feature', treeId: 'tree-feature', branch: 'feature' },
    });
    await flush();

    expect(harness.promises.inputsFor('syncFetch')).toHaveLength(2);
    expect(harness.promises.inputsFor('syncFetch').at(-1)).toMatchObject({ branch: 'feature' });

    harness.actor.stop();
  });

  it('tells the scheduler a conflict was composed, so `Needs resolution` is not sticky (W13 review 2 R6/P37)', async () => {
    const harness = start();

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
      output: { status: 'conflicted', branch: conflictLine, into: 'main', paths: ['enclosure.ts'] },
    });
    await flush();
    await readyRegistry(harness, [live], [undecided]);
    /* The merge changed the records while the registry was loading, so it lists them again. */
    await readyRegistry(harness, [live], [undecided]);
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.state).toBe('conflicted');

    /* W10's resolution settles on the conflict line the scheduler recorded. */
    harness.promises.settle('loadConflict', {
      output: {
        branch: conflictLine,
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
    harness.promises.settle('finishMerge', { output: { revisionId: 'rev-resolved', branch: conflictLine } });
    await flush();

    /* Pulling again, not still `Needs resolution`: whether the remote takes the
     * composed revision is the remote's answer. */
    expect(selectRevisionStatus(harness.actor.getSnapshot()).sync.state).not.toBe('conflicted');
    expect(harness.promises.inputsFor('syncFetch')).toHaveLength(2);

    harness.actor.stop();
  });

  it('re-emits a request to have a chat resolve one', async () => {
    const harness = start();

    registerCheckouts(harness, [live, linked], [undecided]);
    await flush();
    harness.promises.settle('loadConflict', {
      output: {
        branch: conflictLine,
        labels: { ours: 'main', theirs: 'agent/b' },
        paths: [{ path: 'enclosure.ts', openable: true }],
        checkoutId: 'checkout-live',
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

  it('re-reads the registry when a fetch brings a conflict line, and lists only undecided lines (D14)', async () => {
    const harness = start();

    await readyRegistry(harness, [live]);
    harness.promises.settle('readPending', { output: { version: 1, entries: [] } });
    await flush();
    harness.promises.settle('readSyncRemote', { output: { remote: 'tau' } });
    await flush();
    /* Another device's line arrives with the fetch; a line already decided rides along. */
    harness.promises.settle('syncFetch', {
      output: {
        leases: {},
        integration: 'upToDate',
        branches: [
          { name: 'main', head: 'rev-1' },
          { name: 'conflicts/main/device-b', head: 'rev-foreign' },
          { name: 'conflicts/main/device-c', head: 'rev-decided' },
        ],
      },
    });
    await flush();
    expect(harness.promises.inputsFor('listCheckouts')).toHaveLength(2);
    harness.promises.settle('listCheckouts', {
      output: {
        checkouts: [live],
        conflicts: [{ revisionId: 'rev-foreign', line: 'conflicts/main/device-b', into: 'main', foreign: true }],
      },
    });
    await flush();

    const status = selectRevisionStatus(harness.actor.getSnapshot());
    expect(status.conflicts.map(({ branch, into, foreign }) => ({ branch, into, foreign }))).toEqual([
      { branch: 'conflicts/main/device-b', into: 'main', foreign: true },
    ]);
    expect(status.branches.map((branch) => branch.name)).toEqual(['main', 'conflicts/main/device-b']);

    harness.actor.stop();
  });

  it('exports exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([projectRevisionsMachine]);
  });

  it('should answer every public event in every reachable state', () => {
    const settlement = {
      key: key1,
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      runId: 'run-1',
      attempt: 0,
      revisionId: 'rev-2',
      trigger: 'turn',
      branch: 'agent/b',
      runIds: ['run-1'],
    } as const;
    const publicEvents: readonly ProjectRevisionsMachineEvent[] = [
      { type: 'checkoutsChanged', checkouts: [live, linked], conflicts: [] },
      { type: 'branchesFetched', branches: [{ name: 'remote-feature', head: 'rev-remote' }] },
      {
        type: 'checkoutStatusChanged',
        checkoutId: 'checkout-live',
        status: 'dirty',
        branch: 'main',
        headRevisionId: 'rev-1',
      },
      { type: 'admitTurn', key: key1 },
      { type: 'turnPrepared', key: key1, checkoutId: 'checkout-b', branch: 'agent/b' },
      { type: 'cut', requestId: 'save-1', trigger: 'save', checkoutId: 'checkout-live', leaseIds: [] },
      { type: 'cancelCut', requestId: 'save-1', checkoutId: 'checkout-live' },
      {
        type: 'revisionMinted',
        checkoutId: 'checkout-live',
        trigger: 'save',
        requestId: 'save-1',
        revisionId: 'rev-2',
        branch: 'main',
      },
      { type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'save', requestId: 'save-1' },
      { type: 'cutFailed', checkoutId: 'checkout-live', trigger: 'save', requestId: 'save-1', reason: 'write failed' },
      { type: 'casLost', checkoutId: 'checkout-live', trigger: 'save', requestId: 'save-1' },
      { type: 'cutCancelled', checkoutId: 'checkout-live', requestId: 'save-1' },
      { type: 'turnFinalized', ...settlement },
      { type: 'turnConflicted', ...settlement },
      { type: 'checkoutChanged', checkoutId: 'checkout-b', revisionId: 'rev-4', treeId: 'tree-4', branch: undefined },
      { type: 'changed', checkoutId: 'checkout-b', paths: ['a.ts'], generation: 1 },
      { type: 'turnCompleted', key: key1 },
      { type: 'turnAbandoned', key: key1 },
      { type: 'acknowledge', key: key1 },
      { type: 'leaseWritten', key: key1, checkoutId: 'checkout-live', leaseIds: ['run-1'] },
      { type: 'turnPlaced', key: key1, checkoutId: 'checkout-b', branch: 'agent/b', baseRevisionId: 'rev-1' },
      { type: 'turnCutRefused', key: key1, reason: 'disk full', cutFailures: 1 },
      {
        type: 'turnReleased',
        key: key1,
        turnId: 'turn-1',
        chatId: 'chat-1',
        checkoutId: 'checkout-b',
        runId: 'run-1',
        attempt: 0,
        outcome: 'released',
      },
      { type: 'turnRefused', key: key1, code: 'LEASE_UNAVAILABLE', reason: 'held elsewhere' },
      { type: 'turnRetired', key: key1, checkoutId: 'checkout-b' },
      { type: 'acknowledgeRefused', key: key1, code: 'REVISIONS_BUSY', reason: 'This turn has not settled yet.' },
      { type: 'leaseRetired', runId: 'run-0' },
      { type: 'removalOffered', checkoutId: 'checkout-b' },
      { type: 'checkoutFailed', operation: 'add', reason: 'That branch already has a checkout.' },
      { type: 'addCheckout', requestId: 'add-1', branch: 'enclosure-v2', from: 'rev-12' },
      { type: 'removeCheckout', requestId: 'remove-1', id: 'checkout-b' },
      { type: 'switch', requestId: 'switch-1', branch: 'agent/b' },
      { type: 'followChat', chatId: 'chat-1' },
      { type: 'pinTo', checkoutId: 'checkout-b' },
      { type: 'remote', event: { type: 'connect', kind: 'tau' } },
      { type: 'branch', event: { type: 'create', requestId: 'create-1', name: 'enclosure-v2', from: 'rev-12' } },
      { type: 'publish', event: { type: 'publish', requestId: 'publish-1' } },
      { type: 'sync', event: { type: 'online' } },
      { type: 'syncNow', pushId: 'push-1' },
      { type: 'pushSettled', pushId: 'push-1', outcome: 'backedUp' },
      { type: 'resolution', revisionId: 'rev-conflict', event: { type: 'keepMine', path: 'enclosure.ts' } },
      { type: 'mergeConflicted', branch: 'agent/b', into: 'main', paths: ['enclosure.ts'] },
      { type: 'branchMerged', branch: 'agent/b', into: 'main', revisionId: 'rev-2' },
      { type: 'remoteConnected', kind: 'tau', url: 'https://api.tau.new/git/p1', name: 'tau' },
      { type: 'remoteDisconnected' },
      { type: 'conflictResolved', revisionId: 'rev-conflict', branch: 'agent/b' },
      { type: 'resolutionChanged', revisionId: 'rev-conflict' },
      {
        type: 'conflictMaterialized',
        revisionId: 'rev-conflict',
        path: 'enclosure.ts',
        text: '',
        ours: '',
        theirs: '',
      },
      { type: 'conflictMaterializationFailed', revisionId: 'rev-conflict', path: 'enclosure.ts', reason: 'binary' },
      { type: 'turnRequested', revisionId: 'rev-conflict', checkoutId: 'checkout-b', paths: ['enclosure.ts'] },
    ];
    /* The root is one `ready` state whose invokes never leave it, so the public
     * events are the whole sample: no invoke outcome is needed to reach a state. */
    const options = {
      input: { projectId: 'project-1', liveCheckoutId: 'checkout-live' },
      events: publicEvents,
      limit: 1000,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };

    /* RV4-F3, still open: the root spawns `checkout`, `turn` and `resolution` by
     * string key, which the walk cannot resolve. Spawning by logic value
     * overflows the definition's declaration type (TS7056), so it waits on W2's
     * machine contract. */
    const notProvided = "Actor source 'checkout' is not provided";
    expect(() => unansweredEvents(projectRevisionsMachine, options)).toThrow(notProvided);
    expect(() => unreachedStates(projectRevisionsMachine, options)).toThrow(notProvided);
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
    expect(entries.find((entry) => entry.id === id)?.onSnapshot).toStrictEqual({});
  });
});
