import { createActor } from 'xstate';
import { getSimplePaths } from 'xstate/graph';
import type { AnyEventObject, AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#checkout.machine.js';
import {
  checkoutIgnoredEvents,
  checkoutMachine,
  checkoutQueuedCutLimit,
  selectCheckoutDirty,
} from '#checkout.machine.js';
import type { CheckoutFenceActorInput, CheckoutMachineEvent } from '#checkout.machine.js';
import type { TurnCutOf } from '#turn.types.js';
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
 * Path table — `checkout.machine` (catalogue: 30).
 *
 *  1  rehydrates from `input` and rests `clean`
 *  2  `changed` → `dirty` and bumps the write generation
 *  3  one `changed` carrying 50 paths is one transition (F9)
 *  4  `cut` mints: fence → cut → writeRevision → casHead → `clean` + `revisionMinted`
 *  5  the tree-hash gate (I5): equal `treeId` → `nothingToSave`, `writeRevision` never called
 *  6  a write during the mint lands in `dirty`, not `clean` (F4)
 *  7  a lost CAS goes `stale` → `rereading` → `dirty` and emits `casLost` (D24)
 *  8  `cut` actor failure → `failed` + `cutFailed`
 *  9  `writeRevision` failure → `failed` + `cutFailed`, carrying the `close`
 *     trigger and the store's sentence a host's close flush rejects with (C74)
 * 10  `casHead` failure → `failed` + `cutFailed`
 * 11  `readHead` failure while re-reading → `failed`, answering nobody twice
 * 12  `failed` is non-terminal: `cut` retries, `changed` returns to `dirty`
 * 13  a refused fence is an event, never `onError` → `failed` + `cutFailed`
 * 14  the fence is released when the mint leaves `minting`
 * 15  a `cut` arriving during a mint is served afterwards, so both requesters
 *     are answered when the mint succeeds
 * 16  `headMoved` in `clean` re-reads branch, head and tree, and rests `clean`
 *     when nothing was written since (RM-R5)
 * 17  every outcome is both sent to the parent and emitted, with its trigger,
 *     request id and turn
 * 18  start and stop leak no child, the snapshot is serializable and holds no function
 * 19  a mint that fails answers the waiting requests too, instead of stranding
 *     them behind a queue nothing drains (R4)
 * 20  the idle window mints one `idle` revision after the quiet period, and a
 *     burst of `changed` restarts it without churning the parent (S30, A38)
 * 21  the idle window survives a failed mint: re-entering `dirty` restarts it
 * 22  a `save` on an unchanged tree mints nothing and answers `nothingToSave`
 *     (I5, AC12)
 * 23  consecutive trigger-only requests queued during a mint merge into one
 *     mint that keeps every requester; turn requests keep their order (RM-R2)
 * 24  the queue is capped, and the request that does not fit is answered
 *     `cutFailed { reason: 'queue-full' }` with its own id (R13)
 * 25  a head move during a mint is deferred: the mint's own compare-and-swap
 *     answers, then the head is re-read, also after a failed mint (RM-R6)
 * 26  `cancelCut` withdraws a queued request and answers `cutCancelled`; for the
 *     running mint or an unknown id it changes nothing (RM-R4)
 * 27  a trigger-only cut that finds a lease after its capture writes nothing,
 *     answers `nothingToSave` naming the lease, and stays `dirty` (RM-R16)
 * 28  the status fact carries the branch and head tree (RM-R5)
 * 29  `selectCheckoutDirty` reads the declared `dirty` tag (MC-R28)
 * --  `getSimplePaths` generates no state value the table above leaves unexercised
 */

const headTreeId = 'tree-head';
const nextTreeId = 'tree-next';

const turnOf = (turnId: string, runId = `run-${turnId}`): TurnCutOf => ({
  key: { chatId: 'chat-1', turnId, runId, attempt: 1 },
  turnCut: 'result',
});

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof checkoutMachine>>;
  promises: FakePromiseActors;
  callbacks: FakeCallbackActors;
  parent: ReturnType<typeof createFakeParent>;
  emitted: ReturnType<typeof recordEmitted>;
  clock: StepClock;
}>;

const start = (options?: Readonly<{ headTreeId?: string; branch?: string; idleWindow?: number }>): Harness => {
  const guard = guardActors({ ignore: { checkout: checkoutIgnoredEvents } });
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const parent = createFakeParent();
  const clock = new StepClock();
  const actor = createActor(
    checkoutMachine.provide({
      actors: {
        cut: promises.actor('cut'),
        writeRevision: promises.actor('writeRevision'),
        casHead: promises.actor('casHead'),
        readHead: promises.actor('readHead'),
        fence: callbacks.actor<CheckoutFenceActorInput>('fence'),
      },
    }),
    {
      clock,
      inspect: guard.inspect,
      input: {
        checkoutId: 'checkout-1',
        branch: options?.branch ?? 'main',
        headRevisionId: 'rev-1',
        headTreeId: options?.headTreeId ?? headTreeId,
        ...(options?.idleWindow === undefined ? {} : { idleWindow: options.idleWindow }),
        parentRef: parent.ref,
      },
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, parent, emitted, clock };
};

/** Let every queued microtask and the actor's promise handlers run. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

/** Drive one successful mint to the point where `casHead` is the running actor. */
const mintToCas = async (harness: Harness, treeId = nextTreeId): Promise<void> => {
  harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
  harness.promises.settle('cut', { output: { treeId, cutId: 'cut-1' } });
  await flush();
  harness.promises.settle('writeRevision', { output: { status: 'written', revisionId: 'rev-2' } });
  await flush();
};

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

const answersOf = (events: readonly AnyEventObject[]): AnyEventObject[] =>
  events.filter((event) =>
    ['revisionMinted', 'nothingToSave', 'cutFailed', 'casLost', 'cutCancelled'].includes(event.type),
  );

describe('checkoutMachine', () => {
  it('rehydrates from input and rests clean', () => {
    const { actor } = start();

    expect(actor.getSnapshot().matches('clean')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-1');
    expect(actor.getSnapshot().context.writeGeneration).toBe(0);

    actor.stop();
  });

  it('moves to dirty on changed and adopts the write generation', () => {
    const { actor } = start();

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 4 });

    expect(actor.getSnapshot().matches('dirty')).toBe(true);
    expect(actor.getSnapshot().context.writeGeneration).toBe(4);

    actor.stop();
  });

  it('takes one transition for a batch of fifty paths', () => {
    const { actor } = start();
    let transitions = 0;
    actor.subscribe(() => {
      transitions += 1;
    });

    actor.send({
      type: 'changed',
      paths: Array.from({ length: 50 }, (_, index) => `file-${index}.ts`),
      generation: 1,
    });

    expect(transitions).toBe(1);
    expect(actor.getSnapshot().matches('dirty')).toBe(true);

    actor.stop();
  });

  it('mints through fence, cut, writeRevision and casHead', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] });

    expect(actor.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);
    expect(callbacks.active('fence')).toBe(1);

    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(actor.getSnapshot().matches('clean')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-2');
    expect(actor.getSnapshot().context.headTreeId).toBe(nextTreeId);
    expect(promises.inputsFor('cut')).toEqual([{ checkoutId: 'checkout-1', trigger: 'turn' }]);
    expect(promises.inputsFor('writeRevision')).toEqual([
      {
        checkoutId: 'checkout-1',
        cutId: 'cut-1',
        treeId: nextTreeId,
        parents: ['rev-1'],
        trigger: 'turn',
        turn: turnOf('turn-1'),
        leaseIds: ['run-1'],
      },
    ]);
    expect(promises.inputsFor('casHead')).toEqual([
      { checkoutId: 'checkout-1', branch: 'main', expectedHead: 'rev-1', head: 'rev-2' },
    ]);

    actor.stop();
  });

  it('mints nothing when the cut tree equals the head tree', async () => {
    const harness = start();
    const { actor, promises, emitted, parent } = harness;

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: headTreeId, cutId: 'cut-1' } });
    await flush();

    expect(promises.inputsFor('writeRevision')).toEqual([]);
    expect(types(emitted)).toContain('nothingToSave');
    expect(types(parent.events)).toContain('nothingToSave');
    expect(actor.getSnapshot().matches('clean')).toBe(true);

    actor.stop();
  });

  it('lands in dirty when a write arrives during the mint', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: nextTreeId, cutId: 'cut-1' } });
    await flush();
    actor.send({ type: 'changed', paths: ['b.ts'], generation: 2 });
    promises.settle('writeRevision', { output: { status: 'written', revisionId: 'rev-2' } });
    await flush();
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(actor.getSnapshot().matches('dirty')).toBe(true);

    actor.stop();
  });

  it('re-reads the head and returns to dirty when it loses the CAS', async () => {
    const harness = start();
    const { actor, promises, emitted, parent } = harness;

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'idle', leaseIds: [] });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'conflicted', head: 'rev-9' } });
    await flush();

    expect(actor.getSnapshot().matches('rereading')).toBe(true);
    expect(types(emitted)).toContain('casLost');
    expect(types(parent.events)).toContain('casLost');

    promises.settle('readHead', { output: { revisionId: 'rev-9', treeId: 'tree-9', branch: 'main' } });
    await flush();

    expect(actor.getSnapshot().matches('dirty')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-9');
    expect(actor.getSnapshot().context.headTreeId).toBe('tree-9');

    actor.stop();
  });

  it('fails with cutFailed when the cut actor rejects', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'save', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { error: new Error('quota') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.reason).toContain('quota');
    expect(types(emitted)).toContain('cutFailed');

    actor.stop();
  });

  /*
   * Under the `close` trigger, because that refusal is the one a host has to
   * carry out of the process (C74).
   *
   * A host's close flush listens for `cutFailed` for its request and rejects
   * with `event.reason`, so the store's own sentence is the whole propagation:
   * drop it and the close cut stops rejecting — it waits out the flush bound and
   * reports a deadline instead of the refusal, which is the data-loss class C70
   * pins at the daemon.
   */
  it('fails with cutFailed when writeRevision rejects, carrying the trigger and the store’s sentence', async () => {
    const harness = start();
    const { actor, promises, emitted, parent } = harness;

    actor.send({ type: 'cut', requestId: 'close-1', trigger: 'close', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: nextTreeId, cutId: 'cut-1' } });
    await flush();
    promises.settle('writeRevision', { error: new Error('the store is out of space') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    const refusal = emitted.find((event) => event.type === 'cutFailed');
    expect(refusal).toMatchObject({
      checkoutId: 'checkout-1',
      trigger: 'close',
      requestId: 'close-1',
      reason: expect.stringContaining('out of space') as unknown as string,
    });
    expect(parent.events.find((event) => event.type === 'cutFailed')).toEqual(refusal);

    actor.stop();
  });

  it('fails with cutFailed when casHead rejects', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'save', leaseIds: [] });
    await mintToCas(harness);
    promises.settle('casHead', { error: new Error('ref locked') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(types(emitted)).toContain('cutFailed');

    actor.stop();
  });

  it('fails when the head re-read rejects, answering its requester once', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'idle', leaseIds: [] });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'conflicted', head: 'rev-9' } });
    await flush();
    promises.settle('readHead', { error: new Error('ESTALE') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(answersOf(parent.events).map((event) => event.type)).toEqual(['casLost']);

    actor.stop();
  });

  it('keeps failure non-terminal: cut retries and changed returns to dirty', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'save', leaseIds: [] });
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { error: new Error('quota') });
    await flush();
    expect(actor.getSnapshot().matches('failed')).toBe(true);

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 3 });
    expect(actor.getSnapshot().matches('dirty')).toBe(true);

    actor.send({ type: 'cut', requestId: 'r-2', trigger: 'save', leaseIds: [] });
    expect(actor.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);

    actor.stop();
  });

  it('treats a refused fence as an event, not an error', async () => {
    const harness = start();
    const { actor, callbacks, emitted } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'close', leaseIds: [] });
    callbacks.sendBack('fence', { type: 'fenceRefused', reason: 'held elsewhere' });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.reason).toContain('held elsewhere');
    expect(types(emitted)).toContain('cutFailed');
    expect(callbacks.releases('fence')).toBe(1);

    actor.stop();
  });

  it('releases the fence when the mint completes', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: [] });
    await mintToCas(harness);
    expect(callbacks.active('fence')).toBe(1);

    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(callbacks.active('fence')).toBe(0);
    expect(callbacks.releases('fence')).toBe(1);

    actor.stop();
  });

  it('serves a cut that arrives during a mint, answering both requesters', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: [] });
    await mintToCas(harness);
    actor.send({ type: 'cut', requestId: 'r-2', trigger: 'turn', turn: turnOf('turn-2'), leaseIds: [] });
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(actor.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: nextTreeId, cutId: 'cut-2' } });
    await flush();

    expect(answersOf(parent.events).map((event): unknown => event['requestId'])).toEqual(['r-1', 'r-2']);

    actor.stop();
  });

  it('answers every queued request when the mint fails', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    actor.send({ type: 'cut', requestId: 'r-2', trigger: 'turn', turn: turnOf('turn-2'), leaseIds: [] });
    actor.send({ type: 'cut', requestId: 'r-3', trigger: 'restore', leaseIds: [] });
    promises.settle('cut', { error: new Error('disk full') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    const answered = parent.events.filter((event) => event.type === 'cutFailed');
    expect(answered.map((event): unknown => event['requestId'])).toEqual(['r-1', 'r-2', 'r-3']);
    expect(answered.map((event): unknown => event['trigger'])).toEqual(['turn', 'turn', 'restore']);
    expect(actor.getSnapshot().context.queued).toEqual([]);

    actor.stop();
  });

  /* RM-R5: a producer's fact is a hint; the actor re-reads branch, head and tree from the store. */
  it('should reread the head instead of adopting a finalized hint', async () => {
    const { actor, promises, parent } = start();

    actor.send({ type: 'headMoved' });

    expect(actor.getSnapshot().matches('rereading')).toBe(true);
    promises.settle('readHead', { output: { revisionId: 'rev-7', treeId: 'tree-7', branch: 'feature' } });
    await flush();

    expect(actor.getSnapshot().matches('clean')).toBe(true);
    expect(actor.getSnapshot().context).toMatchObject({
      headRevisionId: 'rev-7',
      headTreeId: 'tree-7',
      branch: 'feature',
    });
    expect(parent.events.findLast((event) => event.type === 'checkoutStatusChanged')).toEqual({
      type: 'checkoutStatusChanged',
      checkoutId: 'checkout-1',
      status: 'clean',
      branch: 'feature',
      headRevisionId: 'rev-7',
      headTreeId: 'tree-7',
    });

    actor.stop();
  });

  it('re-reads into dirty when the tree was written since it was clean', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'headMoved' });
    promises.settle('readHead', { output: { revisionId: 'rev-7', treeId: 'tree-7', branch: 'main' } });
    await flush();

    expect(actor.getSnapshot().matches('dirty')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-7');

    actor.stop();
  });

  /* W0.9, L7 D-L7-3, RM-R6: a head fact used to exit `minting` and answer nobody, so
   * the turn waited out its 30 s bound while the abandoned `casHead` still
   * published. The mint's own compare-and-swap answers; the head is re-read after. */
  it('should defer a head move during a mint and re-read after it settles', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] });
    await mintToCas(harness);
    actor.send({ type: 'headMoved' });
    await flush();

    expect(actor.getSnapshot().matches({ minting: 'publishing' })).toBe(true);
    expect(answersOf(parent.events)).toEqual([]);

    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(answersOf(parent.events)).toEqual([
      {
        type: 'revisionMinted',
        checkoutId: 'checkout-1',
        trigger: 'turn',
        requestId: 'r-1',
        turn: turnOf('turn-1'),
        revisionId: 'rev-2',
        branch: 'main',
      },
    ]);
    expect(promises.inputsFor('casHead')).toEqual([
      { checkoutId: 'checkout-1', branch: 'main', expectedHead: 'rev-1', head: 'rev-2' },
    ]);
    expect(actor.getSnapshot().matches('rereading')).toBe(true);

    promises.settle('readHead', { output: { revisionId: 'rev-3', treeId: 'tree-3', branch: 'main' } });
    await flush();

    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-3');
    expect(answersOf(parent.events)).toHaveLength(1);

    actor.stop();
  });

  it('should re-read a head that moved during a mint that failed, answering once', async () => {
    const harness = start();
    const { actor, promises, callbacks, parent } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] });
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    actor.send({ type: 'headMoved' });
    promises.settle('cut', { error: new Error('EIO') });
    await flush();

    expect(actor.getSnapshot().matches('rereading')).toBe(true);

    promises.settle('readHead', { output: { revisionId: 'rev-0', treeId: 'tree-0', branch: 'feature' } });
    await flush();

    expect(actor.getSnapshot().context.branch).toBe('feature');
    expect(parent.events.filter((event) => event.type === 'cutFailed')).toHaveLength(1);

    actor.stop();
  });

  it('re-reads again when the head moves during a re-read', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'headMoved' });
    actor.send({ type: 'headMoved' });
    promises.settle('readHead', { output: { revisionId: 'rev-7', treeId: 'tree-7', branch: 'main' } });
    await flush();

    expect(actor.getSnapshot().matches('rereading')).toBe(true);
    promises.settle('readHead', { output: { revisionId: 'rev-8', treeId: 'tree-8', branch: 'main' } });
    await flush();

    expect(actor.getSnapshot().matches('clean')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-8');

    actor.stop();
  });

  it('sends and emits the same minted outcome with its trigger, request id and turn', async () => {
    const harness = start();
    const { actor, promises, emitted, parent } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    const expected = {
      type: 'revisionMinted',
      checkoutId: 'checkout-1',
      trigger: 'turn',
      requestId: 'r-1',
      turn: turnOf('turn-1'),
      revisionId: 'rev-2',
      branch: 'main',
    };
    expect(emitted.find((event) => event.type === 'revisionMinted')).toEqual(expected);
    expect(parent.events.find((event) => event.type === 'revisionMinted')).toEqual(expected);

    actor.stop();
  });

  it('starts and stops with no leaked child, a serializable snapshot and no function in context', () => {
    const { actor, callbacks } = start();

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'save', leaseIds: [] });
    const persisted = actor.getPersistedSnapshot();

    expect(() => JSON.stringify(persisted)).not.toThrow();
    expect(JSON.stringify(persisted)).not.toContain('function');
    expect(Object.values(actor.getSnapshot().context).some((value) => typeof value === 'function')).toBe(false);

    actor.stop();

    expect(callbacks.active('fence')).toBe(0);
    expect(Object.keys(actor.getSnapshot().children)).toEqual([]);
  });

  it('exports exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([checkoutMachine]);
  });

  it('mints one idle revision after the quiet window, restarted by every write', async () => {
    const harness = start({ idleWindow: 1000 });
    const { actor, clock, promises, emitted, parent } = harness;

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    expect(actor.getSnapshot().matches({ dirty: 'quiet' })).toBe(true);

    /* A burst restarts the window; a checkout that is still being typed into
     * is not quiet. */
    for (let generation = 2; generation <= 25; generation += 1) {
      clock.advance(900);
      actor.send({ type: 'changed', paths: ['a.ts'], generation });
      expect(actor.getSnapshot().matches({ dirty: 'quiet' })).toBe(true);
    }
    expect(actor.getSnapshot().context.writeGeneration).toBe(25);
    /*
     * And *without* churning the parent (A38): `matches({ dirty: 'quiet' })`
     * alone would hold for a transition that re-entered `dirty` on every write.
     * The self-transition's domain is `dirty` — the LCA of its source and
     * target — so only `quiet` is re-entered and `dirty.entry`'s status send
     * does not re-run. Twenty-five writes, one `dirty` on the wire.
     */
    expect(parent.events.filter((event) => event.type === 'checkoutStatusChanged')).toHaveLength(2);

    clock.advance(1000);

    expect(actor.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);
    expect((actor.getSnapshot().context as Record<string, unknown>)['pending']).toEqual({
      trigger: 'idle',
      requesters: [],
      leaseIds: [],
    });

    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(emitted.filter((event) => event.type === 'revisionMinted')).toEqual([
      {
        type: 'revisionMinted',
        checkoutId: 'checkout-1',
        trigger: 'idle',
        revisionId: 'rev-2',
        branch: 'main',
      },
    ]);

    actor.stop();
  });

  it('restarts the idle window after a failed mint', async () => {
    const harness = start({ idleWindow: 1000 });
    const { actor, clock, callbacks } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'save', leaseIds: [] });
    callbacks.sendBack('fence', { type: 'fenceRefused', reason: 'held' });
    await flush();
    expect(actor.getSnapshot().matches('failed')).toBe(true);

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    expect(actor.getSnapshot().matches({ dirty: 'quiet' })).toBe(true);

    clock.advance(1000);

    expect(actor.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);
    expect((actor.getSnapshot().context as Record<string, { trigger?: string }>)['pending']?.trigger).toBe('idle');

    actor.stop();
  });

  it('mints nothing for a save on a tree that equals the head (AC12)', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'cut', requestId: 'save-1', trigger: 'save', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: headTreeId, cutId: 'cut-1' } });
    await flush();

    expect(promises.inputsFor('writeRevision')).toEqual([]);
    expect(emitted.filter((event) => event.type === 'nothingToSave')).toEqual([
      { type: 'nothingToSave', checkoutId: 'checkout-1', trigger: 'save', requestId: 'save-1' },
    ]);

    actor.stop();
  });

  it('merges consecutive trigger-only requests queued behind a mint, keeping every requester', () => {
    const harness = start();
    const { actor } = harness;

    actor.send({ type: 'cut', requestId: 't-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] });
    actor.send({ type: 'cut', requestId: 's-1', trigger: 'save', leaseIds: [] });
    actor.send({ type: 'cut', requestId: 'i-1', trigger: 'idle', leaseIds: [] });
    actor.send({ type: 'cut', requestId: 'c-1', trigger: 'close', leaseIds: [] });
    actor.send({ type: 'cut', requestId: 't-2', trigger: 'turn', turn: turnOf('turn-2'), leaseIds: ['run-2'] });
    actor.send({ type: 'cut', requestId: 'h-1', trigger: 'hidden', leaseIds: [] });

    /* Three trigger-only wishes are one mint recording the later trigger; the
     * two turns keep their own places because each names its attempt. */
    expect(actor.getSnapshot().context.queued).toEqual([
      {
        trigger: 'close',
        requesters: [
          { requestId: 's-1', trigger: 'save' },
          { requestId: 'i-1', trigger: 'idle' },
          { requestId: 'c-1', trigger: 'close' },
        ],
        leaseIds: [],
      },
      {
        trigger: 'turn',
        requesters: [{ requestId: 't-2', trigger: 'turn' }],
        turn: turnOf('turn-2'),
        leaseIds: ['run-2'],
      },
      { trigger: 'hidden', requesters: [{ requestId: 'h-1', trigger: 'hidden' }], leaseIds: [] },
    ]);

    actor.stop();
  });

  /* L7 D-L7-2, RM-R2: R13 replaced a queued trigger-only request, and the replaced requester was never answered. */
  it('should answer every coalesced requester with its own request id', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'cut', requestId: 't-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] });
    actor.send({ type: 'cut', requestId: 'branch-1/cut', trigger: 'switch', leaseIds: [] });
    actor.send({ type: 'cut', requestId: 'save-1', trigger: 'save', leaseIds: [] });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: 'tree-3', cutId: 'cut-2' } });
    await flush();
    promises.settle('writeRevision', { output: { status: 'written', revisionId: 'rev-3' } });
    await flush();
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-3' } });
    await flush();

    expect(
      answersOf(parent.events).map((event): unknown[] => [event['requestId'], event['trigger'], event['revisionId']]),
    ).toEqual([
      ['t-1', 'turn', 'rev-2'],
      ['branch-1/cut', 'switch', 'rev-3'],
      ['save-1', 'save', 'rev-3'],
    ]);
    expect(promises.inputsFor('writeRevision').at(-1)).toMatchObject({ trigger: 'save' });

    actor.stop();
  });

  it('refuses a request that does not fit the queue instead of dropping it', () => {
    const harness = start();
    const { actor, emitted, parent } = harness;

    actor.send({ type: 'cut', requestId: 'r-0', trigger: 'turn', turn: turnOf('turn-0'), leaseIds: [] });
    for (let index = 0; index < checkoutQueuedCutLimit; index += 1) {
      actor.send({
        type: 'cut',
        requestId: `r-${index + 1}`,
        trigger: 'turn',
        turn: turnOf(`turn-${index + 1}`),
        leaseIds: [],
      });
    }
    actor.send({ type: 'cut', requestId: 'r-over', trigger: 'turn', turn: turnOf('turn-over'), leaseIds: [] });

    expect(actor.getSnapshot().context.queued).toHaveLength(checkoutQueuedCutLimit);
    const refusal = {
      type: 'cutFailed',
      checkoutId: 'checkout-1',
      trigger: 'turn',
      requestId: 'r-over',
      turn: turnOf('turn-over'),
      reason: 'queue-full',
    };
    expect(emitted.find((event) => event.type === 'cutFailed')).toEqual(refusal);
    expect(parent.events.find((event) => event.type === 'cutFailed')).toEqual(refusal);

    actor.stop();
  });

  /* RM-R4: a released turn withdraws its queued cut, and the checkout says so. */
  it('should cancel a queued cut and answer cutCancelled with its id', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'cut', requestId: 'save-1', trigger: 'save', leaseIds: [] });
    actor.send({ type: 'cut', requestId: 't-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] });
    actor.send({ type: 'cancelCut', requestId: 't-1' });

    expect(answersOf(parent.events)).toEqual([
      { type: 'cutCancelled', checkoutId: 'checkout-1', requestId: 't-1', turn: turnOf('turn-1') },
    ]);
    expect(actor.getSnapshot().context.queued).toEqual([]);

    /* The running mint answers for itself; cancelling it changes nothing. */
    actor.send({ type: 'cancelCut', requestId: 'save-1' });
    actor.send({ type: 'cancelCut', requestId: 'unknown' });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(answersOf(parent.events).map((event): unknown[] => [event.type, event['requestId']])).toEqual([
      ['cutCancelled', 't-1'],
      ['revisionMinted', 'save-1'],
    ]);

    actor.stop();
  });

  it('keeps a merged entry for its other requesters when one of them cancels', () => {
    const harness = start();
    const { actor } = harness;

    actor.send({ type: 'cut', requestId: 'r-0', trigger: 'turn', turn: turnOf('turn-0'), leaseIds: [] });
    actor.send({ type: 'cut', requestId: 's-1', trigger: 'save', leaseIds: [] });
    actor.send({ type: 'cut', requestId: 's-2', trigger: 'close', leaseIds: [] });
    actor.send({ type: 'cancelCut', requestId: 's-1' });

    expect(actor.getSnapshot().context.queued).toEqual([
      { trigger: 'close', requesters: [{ requestId: 's-2', trigger: 'close' }], leaseIds: [] },
    ]);

    actor.stop();
  });

  /* RM-R16: the fresh fence — a lease written by another tab after the capture holds the checkout. */
  it('writes nothing, names the lease and stays dirty when a save finds a lease', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;
    const heldBy = { chatId: 'chat-2', turnId: 'turn-9', runId: 'run-9', attempt: 1 };

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'cut', requestId: 'save-1', trigger: 'save', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: nextTreeId, cutId: 'cut-1' } });
    await flush();
    promises.settle('writeRevision', { output: { status: 'held', heldBy } });
    await flush();

    expect(answersOf(parent.events)).toEqual([
      { type: 'nothingToSave', checkoutId: 'checkout-1', trigger: 'save', requestId: 'save-1', heldBy },
    ]);
    expect(promises.inputsFor('casHead')).toEqual([]);
    expect(actor.getSnapshot().matches('dirty')).toBe(true);

    actor.stop();
  });

  it('reports its branch and head tree with every status (RM-R5)', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'save', leaseIds: [] });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(parent.events.findLast((event) => event.type === 'checkoutStatusChanged')).toEqual({
      type: 'checkoutStatusChanged',
      checkoutId: 'checkout-1',
      status: 'clean',
      branch: 'main',
      headRevisionId: 'rev-2',
      headTreeId: nextTreeId,
    });

    actor.stop();
  });

  it('selects dirtiness from the declared tag (MC-R28)', () => {
    const { actor } = start();

    expect(selectCheckoutDirty(actor.getSnapshot())).toBe(false);
    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    expect(selectCheckoutDirty(actor.getSnapshot())).toBe(true);
    actor.send({ type: 'cut', requestId: 'r-1', trigger: 'save', leaseIds: [] });
    expect(selectCheckoutDirty(actor.getSnapshot())).toBe(true);

    actor.stop();
  });

  it('exercises every state value xstate/graph can generate', () => {
    const paths = getSimplePaths(checkoutMachine, {
      events: [
        { type: 'changed', paths: ['a.ts'], generation: 1 },
        { type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: [] },
        { type: 'headMoved' },
        { type: 'fenceGranted' },
        { type: 'fenceRefused', reason: 'held' },
      ],
      input: { checkoutId: 'checkout-1', branch: 'main' },
      /* Coverage is over state values: serializing context too would make the
       * space infinite, because a queued cut adds a request on every `cut`. */
      serializeState: (state): string => JSON.stringify(state.value as unknown),
      limit: 200,
    });
    const exercised = new Set([
      '"clean"',
      '{"dirty":"quiet"}',
      '"failed"',
      '"stale"',
      '"rereading"',
      '{"minting":"acquiring"}',
      '{"minting":"cutting"}',
      '{"minting":"writing"}',
      '{"minting":"publishing"}',
    ]);
    const generated = new Set(paths.map((path) => JSON.stringify(path.state.value)));

    expect(paths.length).toBeGreaterThan(0);
    expect([...generated].filter((value) => !exercised.has(value))).toEqual([]);
  });

  it('should answer every public event in every reachable state', () => {
    const invokeId = (path: string): string => checkoutMachine.getStateNodeById(`checkout.${path}`).invoke[0]?.id ?? '';
    const cutInvoke = invokeId('minting.cutting');
    const writeInvoke = invokeId('minting.writing');
    const casInvoke = invokeId('minting.publishing');
    const readHeadInvoke = invokeId('rereading');
    const publicEvents: readonly CheckoutMachineEvent[] = [
      { type: 'changed', paths: ['a.ts'], generation: 1 },
      { type: 'cut', requestId: 'r-1', trigger: 'turn', turn: turnOf('turn-1'), leaseIds: ['run-1'] },
      { type: 'cancelCut', requestId: 'r-1' },
      { type: 'headMoved' },
      { type: 'fenceGranted' },
      { type: 'fenceRefused', reason: 'held elsewhere' },
    ];
    const options = {
      input: {
        checkoutId: 'checkout-1',
        branch: 'main',
        headRevisionId: 'rev-1',
        headTreeId,
        parentRef: undefined,
      },
      /* Effect outcomes reach the states behind each invoke; they are not public. */
      events: [
        ...publicEvents,
        { type: `xstate.done.actor.${cutInvoke}`, output: { treeId: nextTreeId, cutId: 'cut-1' } },
        { type: `xstate.error.actor.${cutInvoke}`, error: new Error('quota') },
        { type: `xstate.done.actor.${writeInvoke}`, output: { status: 'written', revisionId: 'rev-2' } },
        {
          type: `xstate.done.actor.${writeInvoke}`,
          output: { status: 'held', heldBy: { chatId: 'c', turnId: 't', runId: 'r', attempt: 1 } },
        },
        { type: `xstate.error.actor.${writeInvoke}`, error: new Error('the store is out of space') },
        { type: `xstate.done.actor.${casInvoke}`, output: { status: 'updated', head: 'rev-2' } },
        { type: `xstate.done.actor.${casInvoke}`, output: { status: 'conflicted', head: 'rev-9' } },
        { type: `xstate.error.actor.${casInvoke}`, error: new Error('ref locked') },
        {
          type: `xstate.done.actor.${readHeadInvoke}`,
          output: { revisionId: 'rev-9', treeId: 'tree-9', branch: 'main' },
        },
        { type: `xstate.error.actor.${readHeadInvoke}`, error: new Error('ESTALE') },
      ],
      limit: 20_000,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };

    expect(unansweredEvents(checkoutMachine, { ...options, ignore: checkoutIgnoredEvents })).toEqual([]);
    /* Routing states — `stale` and the finals `MintExit` routes through — are left in the macrostep that enters them. */
    const transient = new Set(['checkout.dirty.elapsed', 'checkout.minting.done', 'checkout.stale']);
    expect(unreachedStates(checkoutMachine, options).filter((id) => !transient.has(id))).toEqual([]);
  });
});
