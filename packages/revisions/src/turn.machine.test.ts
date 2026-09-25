import { createActor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#turn.machine.js';
import { selectTurnHoldsLease, turnMachine } from '#turn.machine.js';
import type { TurnLeaseActorInput, TurnMachineEvent } from '#turn.machine.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import {
  createFakeCallbackActors,
  createFakeParent,
  createFakePromiseActors,
  recordEmitted,
} from '@taucad/xstate-testing/fakes';
import type { FakeCallbackActors, FakePromiseActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import type { IgnoredEvents } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

/*
 * Path table — `turn.machine` (catalogue: 14).
 *
 *  1  starts in `preparing.resolving` and calls `prepare` with its input
 *  2  a resolved placement writes the lease and reaches `leased`; `turnPrepared`
 *     and `leaseWritten` reach the parent (R1)
 *  3  a superseded epoch sends `leaseStale { runId }` to the parent (F13)
 *  4  `prepare` failure → `failed` with no lease to retire
 *  5  `writeLease` failure → `failed`
 *  6  the lease is held for the whole `leased` state and released on exit (F6)
 *  7  `leaseRefused` is an event, never `onError`
 *  8  `leased.acquiring` waits for `leaseGranted`; `turnCompleted` is buffered
 *     until `leased.held`, and only `held` reports holding the lease (R6)
 *  9  `turnCompleted` captures, merges, then *sends* `cut` to the parent; this
 *     machine never calls `writeRevision`
 * 10  `revisionMinted` → lease retired → `finalized` + `turnFinalized`, whose
 *     `runId` is this turn's own lease and `runIds` the provenance set (R2)
 * 11  `nothingToSave` → `finalized` with `revisionId: undefined` (I5)
 * 12  `cutFailed` → `failed`
 * 13  `casLost` → fails fast with reason `cas-lost` (R5; retry policy is W6)
 * 14  no answer inside the bound (step clock) → `failed`
 * 15  a conflicted merge → `conflicted` + `turnConflicted`
 * 16  `turnAbandoned` while leased → lease retired → `released`, and the parent
 *     is told `turnReleased` so the registry can drop the lease (R12)
 * 17  `release` while finalizing → `released`
 * 18  `capture` and `merge` failures → `failed`
 * 19  a retirement failure *after* a mint keeps the settlement (R7); one before
 *     the mint still fails
 * 20  a dirty base is minted before the lease is written, through the checkout
 *     (R10): `revisionMinted` adopts the base, `nothingToSave` skips it,
 *     `cutFailed` fails the turn
 * 21  the base mint has the same escapes as the cut it mirrors (R21): `casLost`
 *     fails it fast, the settlement bound ends it, and `release` /
 *     `turnAbandoned` end any of `preparing` with no lease to retire
 * 22  every failure names a `code` the page can phrase (P4): the port's own on
 *     a rejection that carried one, the turn's own for a lost CAS, a waited-out
 *     cut or base cut and a refused lease, and none at all when nothing
 *     classified it (E5)
 * --  start and stop leak no child, the snapshot is serializable and holds no
 *     function, and the subpath exports exactly one machine value
 */

/**
 * Known defects (MC-S5): public events a reachable state neither takes nor
 * declares ignored. W5 answers each one or moves it to an exported
 * `turnIgnoredEvents` (D13, MC-R17), and deletes the row as it lands.
 */
const knownDefects: IgnoredEvents = {
  turn: [
    // W5: totality — a lease or cut answer, or a repeated turn signal, outside the state that waits for it.
    ['preparing.resolving', 'leaseGranted'],
    ['preparing.resolving', 'leaseRefused'],
    ['preparing.resolving', 'revisionMinted'],
    ['preparing.resolving', 'nothingToSave'],
    ['preparing.resolving', 'cutFailed'],
    ['preparing.resolving', 'casLost'],
    ['preparing.basing', 'leaseGranted'],
    ['preparing.basing', 'leaseRefused'],
    ['preparing.writingLease', 'leaseGranted'],
    ['preparing.writingLease', 'leaseRefused'],
    ['preparing.writingLease', 'revisionMinted'],
    ['preparing.writingLease', 'nothingToSave'],
    ['preparing.writingLease', 'cutFailed'],
    ['preparing.writingLease', 'casLost'],
    ['leased.acquiring', 'revisionMinted'],
    ['leased.acquiring', 'nothingToSave'],
    ['leased.acquiring', 'cutFailed'],
    ['leased.acquiring', 'casLost'],
    ['leased.held', 'leaseGranted'],
    ['leased.held', 'revisionMinted'],
    ['leased.held', 'nothingToSave'],
    ['leased.held', 'cutFailed'],
    ['leased.held', 'casLost'],
    ['finalizing.capturing', 'turnCompleted'],
    ['finalizing.capturing', 'leaseGranted'],
    ['finalizing.capturing', 'leaseRefused'],
    ['finalizing.capturing', 'revisionMinted'],
    ['finalizing.capturing', 'nothingToSave'],
    ['finalizing.capturing', 'cutFailed'],
    ['finalizing.capturing', 'casLost'],
    ['finalizing.merging', 'turnCompleted'],
    ['finalizing.merging', 'leaseGranted'],
    ['finalizing.merging', 'leaseRefused'],
    ['finalizing.merging', 'revisionMinted'],
    ['finalizing.merging', 'nothingToSave'],
    ['finalizing.merging', 'cutFailed'],
    ['finalizing.merging', 'casLost'],
    ['finalizing.requesting', 'turnCompleted'],
    ['finalizing.requesting', 'leaseGranted'],
    ['finalizing.requesting', 'leaseRefused'],
    ['retiring', 'turnCompleted'],
    ['retiring', 'turnAbandoned'],
    ['retiring', 'release'],
    ['retiring', 'leaseGranted'],
    ['retiring', 'leaseRefused'],
    ['retiring', 'revisionMinted'],
    ['retiring', 'nothingToSave'],
    ['retiring', 'cutFailed'],
    ['retiring', 'casLost'],
  ],
};

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

const start = (options?: Readonly<{ checkoutId?: string }>): Harness => {
  const guard = guardActors({ ignore: knownDefects });
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
        lease: callbacks.actor<TurnLeaseActorInput>('lease'),
      },
    }),
    {
      clock,
      inspect: guard.inspect,
      input: {
        turnId: 'turn-1',
        chatId: 'chat-1',
        runId: 'run-1',
        ...(options?.checkoutId === undefined ? {} : { checkoutId: options.checkoutId }),
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

/** Drive a turn to `leased.held` with the lease granted. */
const toLeased = async (harness: Harness, leaseIds: readonly string[] = ['run-1']): Promise<void> => {
  harness.promises.settle('prepare', { output: preparedOutput });
  await flush();
  harness.promises.settle('writeLease', { output: { leaseIds } });
  await flush();
  harness.callbacks.sendBack('lease', { type: 'leaseGranted' });
};

/** Drive a leased turn to the point where the parent has been sent `cut`. */
const toRequesting = async (harness: Harness): Promise<void> => {
  harness.actor.send({ type: 'turnCompleted' });
  harness.promises.settle('capture', { output: { captureId: 'capture-1' } });
  await flush();
  harness.promises.settle('merge', { output: { status: 'recorded' } });
  await flush();
};

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

describe('turnMachine', () => {
  it('starts by resolving its placement from input', () => {
    const { actor, promises } = start({ checkoutId: 'checkout-9' });

    expect(actor.getSnapshot().matches({ preparing: 'resolving' })).toBe(true);
    expect(promises.inputsFor('prepare')).toEqual([
      { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', checkoutId: 'checkout-9' },
    ]);

    actor.stop();
  });

  it('writes the lease and reaches leased, telling the parent what was prepared and leased', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toLeased(harness);

    expect(actor.getSnapshot().matches('leased')).toBe(true);
    expect(actor.getSnapshot().context.checkoutId).toBe('checkout-1');
    expect(promises.inputsFor('writeLease')).toEqual([
      {
        runId: 'run-1',
        turnId: 'turn-1',
        chatId: 'chat-1',
        checkoutId: 'checkout-1',
        baseRevisionId: 'rev-1',
      },
    ]);
    expect(parent.events.find((event) => event.type === 'turnPrepared')).toEqual({
      type: 'turnPrepared',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-1',
      branch: 'main',
    });
    /* R1: the registry's lease set only grows if the turn says so. */
    expect(parent.events.find((event) => event.type === 'leaseWritten')).toEqual({
      type: 'leaseWritten',
      checkoutId: 'checkout-1',
      runId: 'run-1',
    });

    actor.stop();
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

  it('fails when prepare rejects, with no lease to retire', async () => {
    const harness = start();
    const { actor, promises } = harness;

    promises.settle('prepare', {
      error: Object.assign(new Error('no checkout'), { code: 'ENGINE_UNAVAILABLE' }),
    });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.reason).toContain('no checkout');
    /* P4: the port classified it, so the page never has to read the sentence. */
    expect(actor.getSnapshot().context.code).toBe('ENGINE_UNAVAILABLE');
    expect(promises.inputsFor('retireLease')).toEqual([]);

    actor.stop();
  });

  it('fails when the lease write rejects', async () => {
    const harness = start();
    const { actor, promises } = harness;

    promises.settle('prepare', { output: preparedOutput });
    await flush();
    promises.settle('writeLease', { error: new Error('read-only') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    /* E5: nothing classified this, so the page says its own fallback. */
    expect(actor.getSnapshot().context.code).toBeUndefined();

    actor.stop();
  });

  it('holds the lease for the whole leased state and releases it on exit', async () => {
    const harness = start();
    const { actor, callbacks } = harness;

    await toLeased(harness);
    expect(callbacks.active('lease')).toBe(1);

    actor.send({ type: 'turnCompleted' });

    expect(callbacks.active('lease')).toBe(0);
    expect(callbacks.releases('lease')).toBe(1);

    actor.stop();
  });

  it('treats a refused lease as an event, not an error', async () => {
    const harness = start();
    const { actor, callbacks } = harness;

    harness.promises.settle('prepare', { output: preparedOutput });
    await flush();
    harness.promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
    await flush();
    callbacks.sendBack('lease', { type: 'leaseRefused', reason: 'another document holds it' });
    await flush();

    expect(actor.getSnapshot().matches('retiring')).toBe(true);
    expect(actor.getSnapshot().context.reason).toContain('another document holds it');
    expect(actor.getSnapshot().context.code).toBe('LEASE_UNAVAILABLE');

    actor.stop();
  });

  it('waits for the lease to be granted, buffering turnCompleted until it is', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;

    promises.settle('prepare', { output: preparedOutput });
    await flush();
    promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
    await flush();

    expect(actor.getSnapshot().matches({ leased: 'acquiring' })).toBe(true);
    expect(selectTurnHoldsLease(actor.getSnapshot())).toBe(false);

    actor.send({ type: 'turnCompleted' });
    expect(actor.getSnapshot().matches({ leased: 'acquiring' })).toBe(true);

    callbacks.sendBack('lease', { type: 'leaseGranted' });

    expect(actor.getSnapshot().matches({ finalizing: 'capturing' })).toBe(true);

    actor.stop();
  });

  it('reports holding the lease only once it is granted', async () => {
    const harness = start();

    await toLeased(harness);

    expect(harness.actor.getSnapshot().matches({ leased: 'held' })).toBe(true);
    expect(selectTurnHoldsLease(harness.actor.getSnapshot())).toBe(true);

    harness.actor.stop();
  });

  it('sends cut to the parent and never writes a revision itself', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toLeased(harness);
    await toRequesting(harness);

    expect(actor.getSnapshot().matches({ finalizing: 'requesting' })).toBe(true);
    expect(parent.events.find((event) => event.type === 'cut')).toEqual({
      type: 'cut',
      trigger: 'turn',
      turnId: 'turn-1',
      checkoutId: 'checkout-1',
      leaseIds: ['run-1'],
    });
    expect(Object.keys(machineModule)).not.toContain('writeRevision');
    expect(promises.calls.map((call) => call.name)).not.toContain('writeRevision');

    actor.stop();
  });

  it('finalizes on revisionMinted, naming its own lease and the provenance set', async () => {
    const harness = start();
    const { actor, promises, parent, emitted } = harness;

    await toLeased(harness, ['run-1', 'run-2']);
    await toRequesting(harness);
    actor.send({ type: 'revisionMinted', trigger: 'turn', turnId: 'turn-1', revisionId: 'rev-2' });

    expect(actor.getSnapshot().matches('retiring')).toBe(true);
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches('finalized')).toBe(true);
    const finalized = {
      type: 'turnFinalized',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-1',
      runId: 'run-1',
      revisionId: 'rev-2',
      trigger: 'turn',
      /* R7: the settling checkout's branch, carried rather than read off the
       * store's HEAD, which names the live checkout. */
      branch: 'main',
      runIds: ['run-1', 'run-2'],
    };
    expect(emitted.find((event) => event.type === 'turnFinalized')).toEqual(finalized);
    expect(parent.events.find((event) => event.type === 'turnFinalized')).toEqual(finalized);

    actor.stop();
  });

  it('finalizes with no revision when nothing changed', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toLeased(harness);
    await toRequesting(harness);
    actor.send({ type: 'nothingToSave', trigger: 'turn', turnId: 'turn-1' });
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches('finalized')).toBe(true);
    expect(emitted.find((event) => event.type === 'turnFinalized')).toMatchObject({ revisionId: undefined });

    actor.stop();
  });

  it('fails when the cut fails', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toLeased(harness);
    await toRequesting(harness);
    actor.send({ type: 'cutFailed', trigger: 'turn', turnId: 'turn-1', reason: 'disk full' });
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.reason).toContain('disk full');

    actor.stop();
  });

  it('re-cuts once when its cut loses the CAS, then fails', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toLeased(harness);
    await toRequesting(harness);
    const cutsBefore = parent.events.filter((event) => event.type === 'cut').length;
    actor.send({ type: 'casLost', trigger: 'turn', turnId: 'turn-1' });

    /* The checkout re-read the head before it answered, so one re-ask records
     * onto what the branch names now (D24). */
    expect(actor.getSnapshot().matches({ finalizing: 'requesting' })).toBe(true);
    expect(actor.getSnapshot().context.casRetries).toBe(1);
    expect(parent.events.filter((event) => event.type === 'cut').length).toBe(cutsBefore + 1);

    actor.send({ type: 'casLost', trigger: 'turn', turnId: 'turn-1' });

    expect(actor.getSnapshot().matches('retiring')).toBe(true);
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.reason).toBe('cas-lost');
    expect(actor.getSnapshot().context.code).toBe('CAS_LOST');
    /* The code travels with the release, which is what the page reads. */
    expect(parent.events.find((event) => event.type === 'turnReleased')).toMatchObject({ code: 'CAS_LOST' });

    actor.stop();
  });

  it('fails when no cut outcome arrives inside the bound', async () => {
    const harness = start();
    const { actor, promises, clock } = harness;

    await toLeased(harness);
    await toRequesting(harness);
    clock.advance(60_000);
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.code).toBe('CUT_TIMED_OUT');

    actor.stop();
  });

  it('reaches conflicted when the merge conflicts', async () => {
    const harness = start();
    const { actor, promises, parent, emitted } = harness;

    await toLeased(harness);
    actor.send({ type: 'turnCompleted' });
    promises.settle('capture', { output: { captureId: 'capture-1' } });
    await flush();
    promises.settle('merge', { output: { status: 'conflicted', conflictRevisionId: 'rev-c' } });
    await flush();
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches('conflicted')).toBe(true);
    expect(types(emitted)).toContain('turnConflicted');
    expect(types(parent.events)).toContain('turnConflicted');
    expect(emitted.find((event) => event.type === 'turnConflicted')).toMatchObject({ revisionId: 'rev-c' });

    actor.stop();
  });

  it('releases an abandoned turn, retires its lease and tells the parent', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toLeased(harness);
    actor.send({ type: 'turnAbandoned' });

    expect(actor.getSnapshot().matches('retiring')).toBe(true);
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches('released')).toBe(true);
    expect(promises.inputsFor('retireLease')).toEqual([
      { runId: 'run-1', turnId: 'turn-1', checkoutId: 'checkout-1', outcome: 'released' },
    ]);
    /* R12: the root drops the ref, and the registry drops the lease. */
    expect(parent.events.find((event) => event.type === 'turnReleased')).toEqual({
      type: 'turnReleased',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-1',
      runId: 'run-1',
      outcome: 'released',
    });

    actor.stop();
  });

  it('tells the parent when it ends failed', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toLeased(harness);
    await toRequesting(harness);
    actor.send({ type: 'cutFailed', trigger: 'turn', turnId: 'turn-1', reason: 'disk full' });
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(parent.events.find((event) => event.type === 'turnReleased')).toMatchObject({
      turnId: 'turn-1',
      runId: 'run-1',
      outcome: 'failed',
    });

    actor.stop();
  });

  it('releases a turn that is released while finalizing', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toLeased(harness);
    await toRequesting(harness);
    actor.send({ type: 'release' });
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches('released')).toBe(true);

    actor.stop();
  });

  it('fails when capture or merge rejects', async () => {
    const first = start();
    await toLeased(first);
    first.actor.send({ type: 'turnCompleted' });
    first.promises.settle('capture', { error: new Error('capture broke') });
    await flush();
    first.promises.settle('retireLease', { output: undefined });
    await flush();
    expect(first.actor.getSnapshot().matches('failed')).toBe(true);
    first.actor.stop();

    const second = start();
    await toLeased(second);
    second.actor.send({ type: 'turnCompleted' });
    second.promises.settle('capture', { output: { captureId: 'capture-1' } });
    await flush();
    second.promises.settle('merge', {
      error: Object.assign(new Error('merge broke'), { code: 'MISSING_LARGE_OBJECT' }),
    });
    await flush();
    second.promises.settle('retireLease', { output: undefined });
    await flush();
    expect(second.actor.getSnapshot().matches('failed')).toBe(true);
    expect(second.actor.getSnapshot().context.code).toBe('MISSING_LARGE_OBJECT');
    second.actor.stop();
  });

  it('keeps a finalized settlement when retiring the lease fails after the mint', async () => {
    const harness = start();
    const { actor, promises, emitted, parent } = harness;

    await toLeased(harness);
    await toRequesting(harness);
    actor.send({ type: 'revisionMinted', trigger: 'turn', turnId: 'turn-1', revisionId: 'rev-2' });
    promises.settle('retireLease', { error: new Error('lease file gone') });
    await flush();

    /* A4: the host-attested settlement survives a failed lease cleanup; the
     * orphan lease is `sweepLeases`' problem (F13). */
    expect(actor.getSnapshot().matches('finalized')).toBe(true);
    expect(emitted.find((event) => event.type === 'turnFinalized')).toMatchObject({ revisionId: 'rev-2' });
    expect(types(parent.events)).toContain('turnFinalized');

    actor.stop();
  });

  it('still fails when the retirement fails before any mint', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toLeased(harness);
    actor.send({ type: 'turnAbandoned' });
    promises.settle('retireLease', { error: new Error('lease file gone') });
    await flush();

    expect(actor.getSnapshot().matches('released')).toBe(true);

    const second = start();
    await toLeased(second);
    await toRequesting(second);
    second.actor.send({ type: 'cutFailed', trigger: 'turn', turnId: 'turn-1', reason: 'quota' });
    second.promises.settle('retireLease', { error: new Error('lease file gone') });
    await flush();

    expect(second.actor.getSnapshot().matches('failed')).toBe(true);

    actor.stop();
    second.actor.stop();
  });

  it('mints a dirty base through the checkout before writing its lease', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    promises.settle('prepare', { output: { ...preparedOutput, dirty: true } });
    await flush();

    expect(actor.getSnapshot().matches({ preparing: 'basing' })).toBe(true);
    /* `turn`, not `save`: the base mint is this turn's own first act, so the
     * revision is attributed to the turn rather than to a person who did not
     * ask for it. */
    expect(parent.events.find((event) => event.type === 'cut')).toEqual({
      type: 'cut',
      trigger: 'turn',
      turnId: 'turn-1',
      checkoutId: 'checkout-1',
      leaseIds: [],
    });
    expect(promises.inputsFor('writeLease')).toEqual([]);

    actor.send({ type: 'revisionMinted', trigger: 'save', turnId: 'turn-1', revisionId: 'rev-base' });
    await flush();

    expect(actor.getSnapshot().context.baseRevisionId).toBe('rev-base');
    expect(promises.inputsFor('writeLease')).toEqual([
      {
        runId: 'run-1',
        turnId: 'turn-1',
        chatId: 'chat-1',
        checkoutId: 'checkout-1',
        baseRevisionId: 'rev-base',
      },
    ]);

    actor.stop();
  });

  it('keeps the resolved base when the dirty base has nothing to save', async () => {
    const harness = start();
    const { actor, promises } = harness;

    promises.settle('prepare', { output: { ...preparedOutput, dirty: true } });
    await flush();
    actor.send({ type: 'nothingToSave', trigger: 'save', turnId: 'turn-1' });
    await flush();

    expect(actor.getSnapshot().context.baseRevisionId).toBe('rev-1');
    expect(promises.inputsFor('writeLease')).toHaveLength(1);

    actor.stop();
  });

  it('fails when the dirty base cannot be minted', async () => {
    const harness = start();
    const { actor, promises } = harness;

    promises.settle('prepare', { output: { ...preparedOutput, dirty: true } });
    await flush();
    actor.send({ type: 'cutFailed', trigger: 'save', turnId: 'turn-1', reason: 'quota' });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(promises.inputsFor('writeLease')).toEqual([]);

    actor.stop();
  });

  it('re-cuts a dirty base once when its mint loses the CAS, then fails', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    promises.settle('prepare', { output: { ...preparedOutput, dirty: true } });
    await flush();
    const cutsBefore = parent.events.filter((event) => event.type === 'cut').length;
    actor.send({ type: 'casLost', trigger: 'turn', turnId: 'turn-1' });

    expect(actor.getSnapshot().matches({ preparing: 'basing' })).toBe(true);
    expect(actor.getSnapshot().context.casRetries).toBe(1);
    expect(parent.events.filter((event) => event.type === 'cut').length).toBe(cutsBefore + 1);

    actor.send({ type: 'casLost', trigger: 'turn', turnId: 'turn-1' });

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.reason).toBe('cas-lost');
    expect(actor.getSnapshot().context.code).toBe('CAS_LOST');
    expect(promises.inputsFor('writeLease')).toEqual([]);

    actor.stop();
  });

  it('fails a dirty base the checkout never answers', async () => {
    const harness = start();
    const { actor, promises, clock } = harness;

    promises.settle('prepare', { output: { ...preparedOutput, dirty: true } });
    await flush();
    clock.advance(60_000);

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    /* Its own code: the base cut and the turn's cut fail for different reasons
     * and a person is told different things (P4). */
    expect(actor.getSnapshot().context.code).toBe('BASE_CUT_TIMED_OUT');
    expect(promises.inputsFor('writeLease')).toEqual([]);

    actor.stop();
  });

  it('releases a preparing turn with no lease to retire', async () => {
    const first = start();
    first.actor.send({ type: 'turnAbandoned' });

    expect(first.actor.getSnapshot().matches('released')).toBe(true);
    expect(first.promises.inputsFor('retireLease')).toEqual([]);
    first.actor.stop();

    const second = start();
    second.promises.settle('prepare', { output: { ...preparedOutput, dirty: true } });
    await flush();
    second.actor.send({ type: 'release' });

    expect(second.actor.getSnapshot().matches('released')).toBe(true);
    expect(second.promises.inputsFor('retireLease')).toEqual([]);
    second.actor.stop();
  });

  it('starts and stops with no leaked child, a serializable snapshot and no function in context', async () => {
    const harness = start();
    const { actor, callbacks } = harness;

    await toLeased(harness);
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
    const prepareInvoke = invokeId('preparing.resolving');
    const writeLeaseInvoke = invokeId('preparing.writingLease');
    const captureInvoke = invokeId('finalizing.capturing');
    const mergeInvoke = invokeId('finalizing.merging');
    const retireInvoke = invokeId('retiring');
    const publicEvents: readonly TurnMachineEvent[] = [
      { type: 'turnCompleted' },
      { type: 'turnAbandoned' },
      { type: 'release' },
      { type: 'leaseGranted' },
      { type: 'leaseRefused', reason: 'held elsewhere' },
      { type: 'revisionMinted', trigger: 'turn', turnId: 'turn-1', revisionId: 'rev-2' },
      { type: 'nothingToSave', trigger: 'turn', turnId: 'turn-1' },
      { type: 'cutFailed', trigger: 'turn', turnId: 'turn-1', reason: 'disk full' },
      { type: 'casLost', trigger: 'turn', turnId: 'turn-1' },
    ];
    const options = {
      input: { turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1', parentRef: undefined },
      /* Effect outcomes reach the states behind each invoke; they are not public. */
      events: [
        ...publicEvents,
        { type: `xstate.done.actor.${prepareInvoke}`, output: { ...preparedOutput, dirty: true } },
        { type: `xstate.error.actor.${prepareInvoke}`, error: new Error('no checkout') },
        { type: `xstate.done.actor.${writeLeaseInvoke}`, output: { leaseIds: ['run-1'] } },
        { type: `xstate.error.actor.${writeLeaseInvoke}`, error: new Error('read-only') },
        { type: `xstate.done.actor.${captureInvoke}`, output: { captureId: 'capture-1' } },
        { type: `xstate.error.actor.${captureInvoke}`, error: new Error('capture broke') },
        { type: `xstate.done.actor.${mergeInvoke}`, output: { status: 'recorded' } },
        { type: `xstate.done.actor.${mergeInvoke}`, output: { status: 'conflicted', conflictRevisionId: 'rev-c' } },
        { type: `xstate.error.actor.${mergeInvoke}`, error: new Error('merge broke') },
        { type: `xstate.done.actor.${retireInvoke}`, output: undefined },
        { type: `xstate.error.actor.${retireInvoke}`, error: new Error('lease file gone') },
      ],
      limit: 20_000,
      /* `retiring` settles on the outcome it carries, so the projection keeps it. */
      serializeState: (snapshot: AnyMachineSnapshot) =>
        JSON.stringify([snapshot.value, (snapshot.context as { outcome?: unknown }).outcome]),
    };

    expect(unansweredEvents(turnMachine, { ...options, ignore: knownDefects['turn'] })).toEqual([]);
    expect(unreachedStates(turnMachine, options)).toEqual([]);
  });
});
