import { createActor } from 'xstate';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#turn.machine.js';
import { selectTurnHoldsLease, turnIgnoredEvents, turnMachine } from '#turn.machine.js';
import type { TurnLeaseActorInput, TurnMachineEvent, TurnMachineInput } from '#turn.machine.js';
import type { TurnAttemptKey, TurnLease } from '#turn.types.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import {
  createFakeCallbackActors,
  createFakeParent,
  createFakePromiseActors,
  recordEmitted,
} from '@taucad/xstate-testing/fakes';
import type { FakeCallbackActors, FakePromiseActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

/*
 * Path table — `turn.machine` (catalogue: 14; W5 target, `TurnProtocol.target.cfg`).
 *
 *  1  starts in `resolving` and calls `prepare` with its attempt key
 *  2  a resolved placement writes the record first, naming the attempt and the
 *     head; `turnPrepared` and `leaseWritten` reach the parent (R1, RM-R12)
 *  3  a superseded epoch sends `leaseStale { runId }` to the parent (F13)
 *  4  `prepare` failure → `refused` with the port's code and nothing to retire
 *  5  `writeLease` failure → `refused`
 *  6  the live-tree lease is held while acquiring and held, never after (F6)
 *  7  `leaseRefused` is an event: the record is retired, then `turnRefused` (TS-R1)
 *  8  `turnCompleted` before placement is buffered and replayed once placed (R6)
 *  9  `turnCompleted` captures, merges, then *sends* `cut{turn: result}`; this
 *     machine never mints
 * 10  `revisionMinted` → `settled` + `turnFinalized` naming the attempt, its
 *     own lease and the provenance set; the lease stays until `acknowledge`
 * 11  `nothingToSave` → `settled` finalized with no revision (I5)
 * 12  `cutFailed` → `turnCutRefused` (`CUT_FAILED`), back to `held` with the lease
 * 13  `casLost` → `finding`; a found result settles, none re-cuts once, then
 *     `turnCutRefused` with `CAS_LOST` (RM-R14, D24)
 * 14  no bound ends a cut: a cut answers or is withdrawn (RM-R3)
 * 15  a conflicted merge → `settled` + `turnConflicted`
 * 16  `turnAbandoned` while held → `settled` released; `acknowledge` retires
 *     the record and reports `turnRetired` (RM-R10)
 * 17  `turnAbandoned` while an effect runs is deferred until it settles (RM-R4)
 * 18  capture and merge failures → `turnCutRefused` and the lease is kept (RM-R13)
 * 19  a failed retirement refuses the acknowledgement and stays `settled`
 * 20  a dirty base is minted after the live-tree lease, through the checkout
 *     (RM-R12): `revisionMinted` becomes the base, `nothingToSave` keeps the head,
 *     `cutFailed` refuses `BASE_CUT_FAILED` after retiring the record
 * 21  the base cut has the same escapes as the result cut: `casLost` re-cuts
 *     once then refuses, and a release withdraws it with `cancelCut`
 * 22  every refusal names a code the page can phrase (P4)
 * 23  an answer to another request id is ignored (RM-R1)
 * 24  an adopted record finds its revisions before it serves a verb (RM-R14)
 * 25  `acknowledge` before settlement is refused `REVISIONS_BUSY` (RM-R11)
 * --  start and stop leak no child, the snapshot is serializable and holds no
 *     function, and the subpath exports exactly one machine value
 */

const key: TurnAttemptKey = { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1', attempt: 0 };

/** Let every queued microtask and the actor's promise handlers run. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof turnMachine>>;
  promises: FakePromiseActors;
  callbacks: FakeCallbackActors;
  parent: ReturnType<typeof createFakeParent>;
  emitted: ReturnType<typeof recordEmitted>;
  clock: StepClock;
}>;

const start = (options?: Readonly<{ checkoutId?: string; adopt?: TurnMachineInput['adopt'] }>): Harness => {
  const guard = guardActors({ ignore: { turn: turnIgnoredEvents } });
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const parent = createFakeParent();
  const clock = new StepClock();
  const actor = createActor(
    turnMachine.provide({
      actors: {
        prepare: promises.actor('prepare'),
        writeLease: promises.actor('writeLease'),
        retireLease: promises.actor('retireLease'),
        capture: promises.actor('capture'),
        merge: promises.actor('merge'),
        find: promises.actor('find'),
        lease: callbacks.actor<TurnLeaseActorInput>('lease'),
      },
    }),
    {
      clock,
      inspect: guard.inspect,
      input: {
        key,
        ...(options?.checkoutId === undefined ? {} : { checkoutId: options.checkoutId }),
        ...(options?.adopt === undefined ? {} : { adopt: options.adopt }),
        parentRef: parent.ref,
      },
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, parent, emitted, clock };
};

const preparedOutput = {
  checkoutId: 'checkout-1',
  branch: 'main',
  baseRevisionId: 'rev-1',
  dirty: false,
  staleRunIds: [],
};

const lease: TurnLease = {
  runId: 'run-1',
  turnId: 'turn-1',
  chatId: 'chat-1',
  checkoutId: 'checkout-1',
  attempt: 0,
  headRevisionId: 'rev-1',
  authorityEpoch: 'epoch-1',
  startedAt: 1,
};

const written = (leaseIds: readonly string[] = ['run-1'], held: readonly TurnAttemptKey[] = []) => ({
  output: { lease, leaseIds, held },
});

const cutsOf = (harness: Harness): readonly AnyEventObject[] =>
  harness.parent.events.filter((event) => event.type === 'cut');

const lastCutId = (harness: Harness): string => String(cutsOf(harness).at(-1)?.['requestId']);

/** Drive a turn to `held`, placed, with the live-tree lease granted. */
const toHeld = async (
  harness: Harness,
  options: Readonly<{ leaseIds?: readonly string[]; dirty?: boolean }> = {},
): Promise<void> => {
  harness.promises.settle('prepare', { output: { ...preparedOutput, dirty: options.dirty === true } });
  await flush();
  harness.promises.settle('writeLease', written(options.leaseIds));
  await flush();
  harness.callbacks.sendBack('lease', { type: 'leaseGranted' });
};

/** Drive a held turn to the point where the parent has been sent the result `cut`. */
const toRequesting = async (harness: Harness): Promise<void> => {
  harness.actor.send({ type: 'turnCompleted' });
  harness.promises.settle('capture', { output: { captureId: 'capture-1' } });
  await flush();
  harness.promises.settle('merge', { output: { status: 'recorded' } });
  await flush();
};

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

describe('turnMachine', () => {
  it('starts by resolving its placement from its attempt key', () => {
    const { actor, promises } = start({ checkoutId: 'checkout-9' });

    expect(actor.getSnapshot().matches('resolving')).toBe(true);
    expect(promises.inputsFor('prepare')).toEqual([{ key, checkoutId: 'checkout-9' }]);

    actor.stop();
  });

  it('should write the lease record before it mints the base', async () => {
    const harness = start();
    const { actor, promises, parent, callbacks } = harness;

    promises.settle('prepare', { output: { ...preparedOutput, dirty: true } });
    await flush();

    /* RM-R12: the record, naming the attempt and the head, before anything of the attempt is minted. */
    expect(actor.getSnapshot().matches('writingLease')).toBe(true);
    expect(promises.inputsFor('writeLease')).toEqual([{ key, checkoutId: 'checkout-1', headRevisionId: 'rev-1' }]);
    expect(cutsOf(harness)).toEqual([]);

    promises.settle('writeLease', written());
    await flush();
    expect(types(parent.events)).toEqual(['turnPrepared', 'leaseWritten']);
    expect(cutsOf(harness)).toEqual([]);

    callbacks.sendBack('lease', { type: 'leaseGranted' });
    expect(actor.getSnapshot().matches('basing')).toBe(true);
    expect(cutsOf(harness)).toEqual([
      {
        type: 'cut',
        requestId: 'run-1/0/base/0',
        trigger: 'turn',
        checkoutId: 'checkout-1',
        turn: { key, turnCut: 'base' },
        leaseIds: ['run-1'],
      },
    ]);
    actor.stop();
  });

  it('should name the admitting run in the pre-mint provenance when another chat holds a lease', async () => {
    const harness = start();
    const other: TurnAttemptKey = { chatId: 'chat-2', turnId: 'turn-9', runId: 'run-2', attempt: 0 };

    await toHeld(harness, { dirty: true, leaseIds: ['run-1', 'run-2'] });

    /* RM-R9: the base cut names this attempt, not the first lease on the checkout. */
    expect(cutsOf(harness)[0]).toMatchObject({ turn: { key, turnCut: 'base' }, leaseIds: ['run-1', 'run-2'] });
    expect(harness.parent.events.find((event) => event.type === 'leaseWritten')).toMatchObject({ key });
    harness.actor.stop();

    const listing = start();
    listing.promises.settle('prepare', { output: preparedOutput });
    await flush();
    listing.promises.settle('writeLease', written(['run-1', 'run-2'], [other]));
    await flush();
    expect(listing.parent.events.find((event) => event.type === 'leaseWritten')).toEqual({
      type: 'leaseWritten',
      key,
      checkoutId: 'checkout-1',
      leaseIds: ['run-1', 'run-2'],
      held: [other],
    });
    listing.actor.stop();
  });

  it('reports a superseded epoch as leaseStale to the parent', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    promises.settle('prepare', { output: { ...preparedOutput, staleRunIds: ['run-old', 'run-older'] } });
    await flush();

    expect(parent.events.filter((event) => event.type === 'leaseStale')).toEqual([
      { type: 'leaseStale', runId: 'run-old' },
      { type: 'leaseStale', runId: 'run-older' },
    ]);

    actor.stop();
  });

  it('refuses when prepare rejects, with no record to retire', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    promises.settle('prepare', {
      error: Object.assign(new Error('no checkout'), { code: 'ENGINE_UNAVAILABLE' }),
    });
    await flush();

    expect(actor.getSnapshot().matches('refused')).toBe(true);
    /* P4: the port classified it, so the page never has to read the sentence. */
    expect(parent.events.at(-1)).toEqual({
      type: 'turnRefused',
      key,
      code: 'ENGINE_UNAVAILABLE',
      reason: 'no checkout',
    });
    expect(promises.inputsFor('retireLease')).toEqual([]);

    actor.stop();
  });

  it('refuses when the record write rejects', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    promises.settle('prepare', { output: preparedOutput });
    await flush();
    promises.settle('writeLease', { error: new Error('read-only') });
    await flush();

    expect(actor.getSnapshot().matches('refused')).toBe(true);
    /* E5: nothing classified this, so the page says its own fallback. */
    expect(parent.events.at(-1)).toEqual({ type: 'turnRefused', key, code: undefined, reason: 'read-only' });

    actor.stop();
  });

  it('holds the live-tree lease while acquiring and held, and lets it go when settled', async () => {
    const harness = start();
    const { actor, callbacks } = harness;

    await toHeld(harness);
    expect(callbacks.active('lease')).toBe(1);
    expect(selectTurnHoldsLease(actor.getSnapshot())).toBe(true);

    actor.send({ type: 'turnAbandoned' });
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(callbacks.active('lease')).toBe(0);
    expect(selectTurnHoldsLease(actor.getSnapshot())).toBe(false);

    actor.stop();
  });

  it('should retire the lease record before answering a refused pre-mint', async () => {
    const harness = start();
    const { actor, promises, callbacks, parent } = harness;

    promises.settle('prepare', { output: preparedOutput });
    await flush();
    promises.settle('writeLease', written());
    await flush();
    callbacks.sendBack('lease', { type: 'leaseRefused', reason: 'held elsewhere' });

    /* TS-R1: the record goes first; the refusal is answered only after. */
    expect(actor.getSnapshot().matches('refusing')).toBe(true);
    expect(promises.inputsFor('retireLease')).toEqual([{ key, checkoutId: 'checkout-1', outcome: 'refused' }]);
    expect(types(parent.events)).not.toContain('turnRefused');

    promises.settle('retireLease', { output: undefined });
    await flush();
    expect(parent.events.at(-1)).toEqual({
      type: 'turnRefused',
      key,
      code: 'LEASE_UNAVAILABLE',
      reason: 'held elsewhere',
    });
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('should buffer turnCompleted while basing and replay it once held', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toHeld(harness, { dirty: true });
    actor.send({ type: 'turnCompleted' });
    expect(promises.inputsFor('capture')).toEqual([]);

    actor.send({ type: 'revisionMinted', requestId: lastCutId(harness), revisionId: 'rev-base' });

    expect(actor.getSnapshot().matches('capturing')).toBe(true);
    expect(promises.inputsFor('capture')).toEqual([{ checkoutId: 'checkout-1', turnId: 'turn-1' }]);
    /* The placement is reported once, after the base (RM-S14). */
    expect(harness.parent.events.filter((event) => event.type === 'turnPlaced')).toEqual([
      { type: 'turnPlaced', key, checkoutId: 'checkout-1', branch: 'main', baseRevisionId: 'rev-base' },
    ]);
    actor.stop();
  });

  it('should ignore leaseRefused once held', async () => {
    const harness = start();

    await toHeld(harness);
    harness.callbacks.sendBack('lease', { type: 'leaseRefused', reason: 'too late' });

    expect(harness.actor.getSnapshot().matches('held')).toBe(true);
    expect(harness.promises.inputsFor('retireLease')).toEqual([]);
    harness.actor.stop();
  });

  it('sends the result cut to the parent and never writes a revision itself', async () => {
    const harness = start();

    await toHeld(harness);
    await toRequesting(harness);

    expect(harness.actor.getSnapshot().matches('requesting')).toBe(true);
    expect(cutsOf(harness)).toEqual([
      {
        type: 'cut',
        requestId: 'run-1/0/result/0',
        trigger: 'turn',
        checkoutId: 'checkout-1',
        turn: { key, turnCut: 'result' },
        leaseIds: ['run-1'],
      },
    ]);
    harness.actor.stop();
  });

  it('should keep the lease until the settlement is acknowledged', async () => {
    const harness = start();
    const { actor, promises, parent, emitted } = harness;

    await toHeld(harness, { leaseIds: ['run-1', 'run-2'] });
    await toRequesting(harness);
    actor.send({ type: 'revisionMinted', requestId: lastCutId(harness), revisionId: 'rev-2' });

    /* RM-R10: announced on entering `settled`, and nothing is retired yet. */
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(emitted).toEqual([
      {
        type: 'turnFinalized',
        turnId: 'turn-1',
        chatId: 'chat-1',
        checkoutId: 'checkout-1',
        runId: 'run-1',
        attempt: 0,
        revisionId: 'rev-2',
        trigger: 'turn',
        branch: 'main',
        runIds: ['run-1', 'run-2'],
      },
    ]);
    expect(promises.inputsFor('retireLease')).toEqual([]);

    actor.send({ type: 'acknowledge' });
    expect(promises.inputsFor('retireLease')).toEqual([{ key, checkoutId: 'checkout-1', outcome: 'finalized' }]);
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(parent.events.at(-1)).toEqual({ type: 'turnRetired', key, checkoutId: 'checkout-1' });
    expect(actor.getSnapshot().status).toBe('done');
    /* Announced once, whatever came after it. */
    expect(emitted).toHaveLength(1);
  });

  it('should stay settled and refuse the acknowledgement when the retirement fails', async () => {
    const harness = start();
    const { actor, promises, parent, emitted } = harness;

    await toHeld(harness);
    await toRequesting(harness);
    actor.send({ type: 'nothingToSave', requestId: lastCutId(harness) });
    actor.send({ type: 'acknowledge' });
    promises.settle('retireLease', { error: Object.assign(new Error('lease file busy'), { code: 'ENGINE_FAILED' }) });
    await flush();

    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(parent.events.at(-1)).toEqual({
      type: 'acknowledgeRefused',
      key,
      code: 'ENGINE_FAILED',
      reason: 'lease file busy',
    });
    expect(emitted).toHaveLength(1);
    /* I5: nothing changed, so nothing was minted. */
    expect(actor.getSnapshot().context.revisionId).toBeUndefined();

    actor.send({ type: 'acknowledge' });
    promises.settle('retireLease', { output: undefined });
    await flush();
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('should refuse an acknowledgement before the attempt settles', async () => {
    const harness = start();

    await toHeld(harness);
    harness.actor.send({ type: 'acknowledge' });

    expect(harness.parent.events.at(-1)).toEqual({
      type: 'acknowledgeRefused',
      key,
      code: 'REVISIONS_BUSY',
      reason: 'This turn has not settled yet.',
    });
    expect(harness.actor.getSnapshot().matches('held')).toBe(true);
    harness.actor.stop();
  });

  it('should keep the lease and answer CUT_FAILED when the capture fails', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toHeld(harness);
    actor.send({ type: 'turnCompleted' });
    promises.settle('capture', { error: Object.assign(new Error('disk gone'), { code: 'ENGINE_FAILED' }) });
    await flush();

    /* RM-R13: the attempt keeps its lease, so the host may complete it again. */
    expect(actor.getSnapshot().matches('held')).toBe(true);
    expect(parent.events.at(-1)).toEqual({
      type: 'turnCutRefused',
      key,
      code: 'ENGINE_FAILED',
      reason: 'disk gone',
      cutFailures: 1,
    });
    expect(promises.inputsFor('retireLease')).toEqual([]);

    actor.send({ type: 'turnCompleted' });
    expect(actor.getSnapshot().matches('capturing')).toBe(true);
    actor.stop();
  });

  it('answers a failed merge and a failed cut with CUT_FAILED, keeping the lease', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toHeld(harness);
    actor.send({ type: 'turnCompleted' });
    promises.settle('capture', { output: { captureId: 'capture-1' } });
    await flush();
    promises.settle('merge', { error: new Error('merge broke') });
    await flush();
    expect(actor.getSnapshot().matches('held')).toBe(true);

    await toRequesting(harness);
    actor.send({ type: 'cutFailed', requestId: lastCutId(harness), reason: 'disk full' });

    expect(actor.getSnapshot().matches('held')).toBe(true);
    expect(
      parent.events.filter((event) => event.type === 'turnCutRefused').map((event): unknown => event['cutFailures']),
    ).toEqual([1, 2]);
    /* A release after a refused cut gives up on it: the attempt failed. */
    actor.send({ type: 'turnAbandoned' });
    expect(parent.events.at(-1)).toMatchObject({ type: 'turnReleased', outcome: 'failed', key });
    actor.stop();
  });

  it('should settle from the result it finds after losing the compare-and-swap', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toHeld(harness);
    await toRequesting(harness);
    actor.send({ type: 'casLost', requestId: lastCutId(harness) });

    expect(actor.getSnapshot().matches('finding')).toBe(true);
    expect(promises.inputsFor('find')).toEqual([{ key, checkoutId: 'checkout-1', stopAt: 'rev-1' }]);
    promises.settle('find', { output: { result: 'rev-won' } });
    await flush();

    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(emitted).toMatchObject([{ type: 'turnFinalized', revisionId: 'rev-won' }]);
    /* One result per attempt: nothing was cut again. */
    expect(cutsOf(harness)).toHaveLength(1);
    actor.stop();
  });

  it('re-cuts once when nothing is found after a lost CAS, then answers CAS_LOST', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toHeld(harness);
    await toRequesting(harness);
    actor.send({ type: 'casLost', requestId: lastCutId(harness) });
    promises.settle('find', { output: {} });
    await flush();

    expect(actor.getSnapshot().matches('requesting')).toBe(true);
    expect(lastCutId(harness)).toBe('run-1/0/result/1');

    actor.send({ type: 'casLost', requestId: lastCutId(harness) });
    promises.settle('find', { output: {} });
    await flush();

    expect(actor.getSnapshot().matches('held')).toBe(true);
    expect(parent.events.at(-1)).toMatchObject({ type: 'turnCutRefused', code: 'CAS_LOST' });
    actor.stop();
  });

  it('should ignore an answer to another request id', async () => {
    const harness = start();
    const { actor } = harness;

    await toHeld(harness);
    await toRequesting(harness);
    actor.send({ type: 'revisionMinted', requestId: 'run-1/0/base/0', revisionId: 'rev-stale' });
    actor.send({ type: 'revisionMinted', revisionId: 'rev-idle' });

    expect(actor.getSnapshot().matches('requesting')).toBe(true);
    actor.send({ type: 'revisionMinted', requestId: lastCutId(harness), revisionId: 'rev-2' });
    expect(actor.getSnapshot().context.revisionId).toBe('rev-2');
    actor.stop();
  });

  it('reaches conflicted when the merge conflicts', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toHeld(harness);
    actor.send({ type: 'turnCompleted' });
    promises.settle('capture', { output: { captureId: 'capture-1' } });
    await flush();
    promises.settle('merge', { output: { status: 'conflicted', conflictRevisionId: 'rev-c' } });
    await flush();

    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(emitted).toMatchObject([{ type: 'turnConflicted', revisionId: 'rev-c' }]);
    actor.stop();
  });

  it('settles an abandoned turn released and retires its record only when acknowledged', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toHeld(harness);
    actor.send({ type: 'turnAbandoned' });

    expect(parent.events.at(-1)).toEqual({
      type: 'turnReleased',
      key,
      turnId: 'turn-1',
      chatId: 'chat-1',
      runId: 'run-1',
      attempt: 0,
      checkoutId: 'checkout-1',
      outcome: 'released',
      reason: undefined,
      code: undefined,
    });
    expect(promises.inputsFor('retireLease')).toEqual([]);
    actor.send({ type: 'acknowledge' });
    expect(promises.inputsFor('retireLease')).toEqual([{ key, checkoutId: 'checkout-1', outcome: 'released' }]);
    actor.stop();
  });

  it('should retire the lease it wrote when released while writing it', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    promises.settle('prepare', { output: preparedOutput });
    await flush();
    actor.send({ type: 'turnAbandoned' });

    /* RM-R4: the write is still running, so the attempt waits for it. */
    expect(actor.getSnapshot().matches('writingLease')).toBe(true);
    promises.settle('writeLease', written());
    await flush();

    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(parent.events.at(-1)).toMatchObject({ type: 'turnReleased', outcome: 'released' });
    actor.send({ type: 'acknowledge' });
    expect(promises.inputsFor('retireLease')).toEqual([{ key, checkoutId: 'checkout-1', outcome: 'released' }]);
    promises.settle('retireLease', { output: undefined });
    await flush();
    expect(actor.getSnapshot().status).toBe('done');
  });

  it('releases a turn abandoned before it resolved, with no record to retire', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'turnAbandoned' });
    promises.settle('prepare', { output: preparedOutput });
    await flush();

    expect(actor.getSnapshot().matches('settled')).toBe(true);
    actor.send({ type: 'acknowledge' });
    expect(actor.getSnapshot().status).toBe('done');
    expect(promises.inputsFor('retireLease')).toEqual([]);
    expect(promises.inputsFor('writeLease')).toEqual([]);
  });

  it('should not leave merging until the merge settles', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toHeld(harness);
    actor.send({ type: 'turnCompleted' });
    promises.settle('capture', { output: { captureId: 'capture-1' } });
    await flush();
    actor.send({ type: 'turnAbandoned' });

    expect(actor.getSnapshot().matches('merging')).toBe(true);
    expect(promises.running('merge')).toBe(1);
    promises.settle('merge', { output: { status: 'recorded' } });
    await flush();

    /* A merge that landed after the release asks for no cut: the attempt was let go. */
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(cutsOf(harness)).toEqual([]);
    actor.stop();
  });

  it('should settle released after the effect when abandoned while finalizing', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toHeld(harness);
    actor.send({ type: 'turnCompleted' });
    actor.send({ type: 'turnAbandoned' });
    expect(actor.getSnapshot().matches('capturing')).toBe(true);
    promises.settle('capture', { output: { captureId: 'capture-1' } });
    await flush();

    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(parent.events.at(-1)).toMatchObject({ type: 'turnReleased', outcome: 'released' });
    actor.stop();
  });

  it('should cancel a queued cut when released while requesting', async () => {
    const harness = start();
    const { actor, parent } = harness;

    await toHeld(harness);
    await toRequesting(harness);
    const requestId = lastCutId(harness);
    actor.send({ type: 'turnAbandoned' });
    actor.send({ type: 'turnAbandoned' });

    expect(parent.events.filter((event) => event.type === 'cancelCut')).toEqual([
      { type: 'cancelCut', requestId, checkoutId: 'checkout-1' },
    ]);
    expect(actor.getSnapshot().matches('requesting')).toBe(true);

    actor.send({ type: 'cutCancelled', requestId });
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(parent.events.at(-1)).toMatchObject({ type: 'turnReleased', outcome: 'released' });
    actor.stop();
  });

  it('should finalize when the mint wins the race with a release', async () => {
    const harness = start();
    const { actor, emitted } = harness;

    await toHeld(harness);
    await toRequesting(harness);
    actor.send({ type: 'turnAbandoned' });
    actor.send({ type: 'revisionMinted', requestId: lastCutId(harness), revisionId: 'rev-2' });

    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(emitted).toMatchObject([{ type: 'turnFinalized', revisionId: 'rev-2' }]);
    actor.stop();
  });

  it('mints a dirty base after the lease and builds on it', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toHeld(harness, { dirty: true });
    actor.send({ type: 'revisionMinted', requestId: lastCutId(harness), revisionId: 'rev-base' });
    actor.send({ type: 'turnCompleted' });
    promises.settle('capture', { output: { captureId: 'capture-1' } });
    await flush();

    expect(promises.inputsFor('merge')).toEqual([
      { checkoutId: 'checkout-1', captureId: 'capture-1', baseRevisionId: 'rev-base' },
    ]);
    actor.stop();
  });

  it('keeps the resolved head when the dirty base has nothing to save', async () => {
    const harness = start();

    await toHeld(harness, { dirty: true });
    harness.actor.send({ type: 'nothingToSave', requestId: lastCutId(harness) });

    expect(harness.actor.getSnapshot().matches('held')).toBe(true);
    expect(harness.actor.getSnapshot().context.baseRevisionId).toBe('rev-1');
    harness.actor.stop();
  });

  it('refuses BASE_CUT_FAILED after retiring the record when the base cannot be minted', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toHeld(harness, { dirty: true });
    actor.send({ type: 'cutFailed', requestId: lastCutId(harness), reason: 'disk full' });

    expect(actor.getSnapshot().matches('refusing')).toBe(true);
    promises.settle('retireLease', { output: undefined });
    await flush();
    expect(parent.events.at(-1)).toEqual({ type: 'turnRefused', key, code: 'BASE_CUT_FAILED', reason: 'disk full' });
  });

  it('re-cuts a dirty base once when its mint loses the CAS, then refuses', async () => {
    const harness = start();
    const { actor } = harness;

    await toHeld(harness, { dirty: true });
    actor.send({ type: 'casLost', requestId: lastCutId(harness) });
    expect(lastCutId(harness)).toBe('run-1/0/base/1');
    actor.send({ type: 'casLost', requestId: lastCutId(harness) });

    expect(actor.getSnapshot().matches('refusing')).toBe(true);
    expect(actor.getSnapshot().context.code).toBe('BASE_CUT_FAILED');
    actor.stop();
  });

  it('withdraws the base cut when released while basing, and settles on its answer', async () => {
    const harness = start();
    const { actor, parent } = harness;

    await toHeld(harness, { dirty: true });
    actor.send({ type: 'turnAbandoned' });

    expect(parent.events.at(-1)).toEqual({ type: 'cancelCut', requestId: 'run-1/0/base/0', checkoutId: 'checkout-1' });
    actor.send({ type: 'revisionMinted', requestId: 'run-1/0/base/0', revisionId: 'rev-base' });

    expect(actor.getSnapshot().matches('settled')).toBe(true);
    /* The release names the base it minted (RM-S15). */
    expect(parent.events.at(-1)).toMatchObject({ type: 'turnReleased', outcome: 'released', revisionId: 'rev-base' });
    actor.stop();
  });

  it('holds no bound on a cut: the result waits however long the checkout takes', async () => {
    const harness = start();

    await toHeld(harness);
    await toRequesting(harness);
    harness.clock.advance(10 * 60_000);

    expect(harness.actor.getSnapshot().matches('requesting')).toBe(true);
    harness.actor.stop();
  });

  it('should find its revisions before serving a completion when adopted', async () => {
    const harness = start({ adopt: { checkoutId: 'checkout-1', headRevisionId: 'rev-1' } });
    const { actor, promises, emitted } = harness;

    expect(actor.getSnapshot().matches('adopting')).toBe(true);
    actor.send({ type: 'turnCompleted' });
    expect(promises.inputsFor('find')).toEqual([{ key, checkoutId: 'checkout-1', stopAt: 'rev-1' }]);
    promises.settle('find', { output: { base: 'rev-base', result: 'rev-result' } });
    await flush();

    /* The result is already on disk, so the completion settles without a second cut. */
    expect(actor.getSnapshot().matches('settled')).toBe(true);
    expect(emitted).toMatchObject([{ type: 'turnFinalized', revisionId: 'rev-result' }]);
    expect(cutsOf(harness)).toEqual([]);
    actor.stop();
  });

  it('starts and stops with no leaked child, a serializable snapshot and no function in context', async () => {
    const harness = start();
    const { actor, callbacks } = harness;

    await toHeld(harness);
    const persisted = actor.getPersistedSnapshot();

    expect(() => JSON.stringify(persisted)).not.toThrow();
    expect(JSON.stringify(persisted)).not.toContain('function');
    expect(Object.values(actor.getSnapshot().context).some((value) => typeof value === 'function')).toBe(false);

    actor.stop();

    expect(callbacks.active('lease')).toBe(0);
    expect(Object.keys(actor.getSnapshot().children)).toEqual([]);
  });

  it('exports exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([turnMachine]);
  });

  it('should answer every public event in every reachable state', () => {
    const invokeId = (path: string): string => turnMachine.getStateNodeById(`turn.${path}`).invoke[0]?.id ?? '';
    const ids = {
      prepare: invokeId('resolving'),
      writeLease: invokeId('writingLease'),
      capture: invokeId('capturing'),
      merge: invokeId('merging'),
      find: invokeId('finding'),
      adopt: invokeId('adopting'),
      retire: invokeId('retiring'),
      refuse: invokeId('refusing'),
    };
    const publicEvents: readonly TurnMachineEvent[] = [
      { type: 'turnCompleted' },
      { type: 'turnAbandoned' },
      { type: 'acknowledge' },
      { type: 'leaseGranted' },
      { type: 'leaseRefused', reason: 'held elsewhere' },
      { type: 'revisionMinted', requestId: 'run-1/0/base/0', revisionId: 'rev-base' },
      { type: 'revisionMinted', requestId: 'run-1/0/result/0', revisionId: 'rev-2' },
      { type: 'nothingToSave', requestId: 'run-1/0/result/0' },
      { type: 'cutFailed', requestId: 'run-1/0/result/0', reason: 'disk full' },
      { type: 'casLost', requestId: 'run-1/0/result/0' },
      { type: 'cutCancelled', requestId: 'run-1/0/result/0' },
    ];
    const effects = (id: string, output: unknown) => [
      { type: `xstate.done.actor.${id}`, output },
      { type: `xstate.error.actor.${id}`, error: new Error('broke') },
    ];
    const outcomes = [
      ...effects(ids.prepare, { ...preparedOutput, dirty: true }),
      /* A clean placement too, so the result cut takes the first sequence and its answers reach `finding`. */
      { type: `xstate.done.actor.${ids.prepare}`, output: preparedOutput },
      ...effects(ids.writeLease, written().output),
      ...effects(ids.capture, { captureId: 'capture-1' }),
      ...effects(ids.merge, { status: 'recorded' }),
      { type: `xstate.done.actor.${ids.merge}`, output: { status: 'conflicted', conflictRevisionId: 'rev-c' } },
      ...effects(ids.find, { result: 'rev-found' }),
      { type: `xstate.done.actor.${ids.find}`, output: {} },
      ...effects(ids.retire, undefined),
      ...effects(ids.refuse, undefined),
    ];
    const options = {
      input: { key, parentRef: undefined },
      /* Effect outcomes reach the states behind each invoke; they are not public. */
      events: [...publicEvents, ...outcomes],
      limit: 20_000,
      serializeState: (snapshot: AnyMachineSnapshot) => {
        const context = snapshot.context as Record<string, unknown>;
        return JSON.stringify([
          snapshot.value,
          context['outcome'],
          context['releasing'],
          context['cutSequence'],
          context['dirtyBase'],
        ]);
      },
    };

    expect(unansweredEvents(turnMachine, { ...options, ignore: turnIgnoredEvents })).toEqual([]);
    /* `admitting` is transient; `adopting` is reached only from an adopted input, which the next row walks. */
    expect(unreachedStates(turnMachine, options)).toEqual(['turn.admitting', 'turn.adopting']);
    expect(
      unansweredEvents(turnMachine, {
        ...options,
        ignore: turnIgnoredEvents,
        input: { key, adopt: { checkoutId: 'checkout-1', headRevisionId: 'rev-1' }, parentRef: undefined },
        events: [...publicEvents, ...effects(ids.adopt, { result: 'rev-found' }), ...outcomes],
      }),
    ).toEqual([]);
  });
});
