import { createActor } from 'xstate';
import { getSimplePaths } from 'xstate/graph';
import type { AnyEventObject } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#checkout.machine.js';
import { checkoutMachine, checkoutQueuedCutLimit } from '#checkout.machine.js';
import type { CheckoutFenceActorInput } from '#checkout.machine.js';
import {
  createFakeCallbackActors,
  createFakeParent,
  createFakePromiseActors,
  createManualClock,
  recordEmitted,
} from '#test/fake-actors.js';
import type { FakeCallbackActors, FakePromiseActors, ManualClock } from '#test/fake-actors.js';

/*
 * Path table — `checkout.machine` (catalogue: 24).
 *
 *  1  rehydrates from `input` and rests `clean`
 *  2  `changed` → `dirty` and bumps the write generation
 *  3  one `changed` carrying 50 paths is one transition (F9)
 *  4  `cut` mints: fence → cut → writeRevision → casHead → `clean` + `revisionMinted`
 *  5  the tree-hash gate (I5): equal `treeId` → `nothingToSave`, `writeRevision` never called
 *  6  a write during the mint lands in `dirty`, not `clean` (F4)
 *  7  a lost CAS goes `stale` → `rereading` → `dirty` and emits `casLost` (D24)
 *  8  `cut` actor failure → `failed` + `cutFailed`
 *  9  `writeRevision` failure → `failed` + `cutFailed`
 * 10  `casHead` failure → `failed` + `cutFailed`
 * 11  `readHead` failure while re-reading → `failed` + `cutFailed`
 * 12  `failed` is non-terminal: `cut` retries, `changed` returns to `dirty`
 * 13  a refused fence is an event, never `onError` → `failed` + `cutFailed`
 * 14  the fence is released when the mint leaves `minting`
 * 15  a `cut` arriving during a mint is served afterwards, so both requesters
 *     are answered when the mint succeeds
 * 16  `headChanged` adopts a new head without leaving `clean`
 * 17  every outcome is both sent to the parent and emitted, with its trigger and turn id
 * 18  start and stop leak no child, the snapshot is serializable and holds no function
 * 19  a mint that fails answers the waiting requests too, instead of stranding
 *     them behind a queue nothing drains (R4)
 * 20  the idle window mints one `idle` revision after the quiet period, and a
 *     burst of `changed` restarts it without churning the parent (S30, A38)
 * 21  the idle window survives a failed mint: re-entering `dirty` restarts it
 * 22  a `save` on an unchanged tree mints nothing and answers `nothingToSave`
 *     (I5, AC12)
 * 23  consecutive trigger-only requests queued during a mint collapse into one,
 *     turn-bearing requests keep their order (R13)
 * 24  the queue is capped, and the request that does not fit is answered
 *     `cutFailed { reason: 'queue-full' }` rather than dropped (R13)
 * --  `getSimplePaths` generates no state value the table above leaves unexercised
 */

const headTreeId = 'tree-head';
const nextTreeId = 'tree-next';

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof checkoutMachine>>;
  promises: FakePromiseActors;
  callbacks: FakeCallbackActors;
  parent: ReturnType<typeof createFakeParent>;
  emitted: ReturnType<typeof recordEmitted>;
  clock: ManualClock;
}>;

const start = (options?: Readonly<{ headTreeId?: string; branch?: string; idleWindow?: number }>): Harness => {
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const parent = createFakeParent();
  const clock = createManualClock();
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
  harness.promises.settle('writeRevision', { output: { revisionId: 'rev-2' } });
  await flush();
};

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

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
    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: ['run-1'] });

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
        turnId: 'turn-1',
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
    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: ['run-1'] });
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
    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: nextTreeId, cutId: 'cut-1' } });
    await flush();
    actor.send({ type: 'changed', paths: ['b.ts'], generation: 2 });
    promises.settle('writeRevision', { output: { revisionId: 'rev-2' } });
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
    actor.send({ type: 'cut', trigger: 'idle', leaseIds: [] });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'conflicted', head: 'rev-9' } });
    await flush();

    expect(actor.getSnapshot().matches('rereading')).toBe(true);
    expect(types(emitted)).toContain('casLost');
    expect(types(parent.events)).toContain('casLost');

    promises.settle('readHead', { output: { revisionId: 'rev-9', treeId: 'tree-9' } });
    await flush();

    expect(actor.getSnapshot().matches('dirty')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-9');
    expect(actor.getSnapshot().context.headTreeId).toBe('tree-9');

    actor.stop();
  });

  it('fails with cutFailed when the cut actor rejects', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { error: new Error('quota') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.reason).toContain('quota');
    expect(types(emitted)).toContain('cutFailed');

    actor.stop();
  });

  it('fails with cutFailed when writeRevision rejects', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: nextTreeId, cutId: 'cut-1' } });
    await flush();
    promises.settle('writeRevision', { error: new Error('disk full') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(types(emitted)).toContain('cutFailed');

    actor.stop();
  });

  it('fails with cutFailed when casHead rejects', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
    await mintToCas(harness);
    promises.settle('casHead', { error: new Error('ref locked') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(types(emitted)).toContain('cutFailed');

    actor.stop();
  });

  it('fails when the head re-read rejects', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'cut', trigger: 'idle', leaseIds: [] });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'conflicted', head: 'rev-9' } });
    await flush();
    promises.settle('readHead', { error: new Error('ESTALE') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);

    actor.stop();
  });

  it('keeps failure non-terminal: cut retries and changed returns to dirty', async () => {
    const harness = start();
    const { actor, promises, callbacks } = harness;

    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
    callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { error: new Error('quota') });
    await flush();
    expect(actor.getSnapshot().matches('failed')).toBe(true);

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 3 });
    expect(actor.getSnapshot().matches('dirty')).toBe(true);

    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
    expect(actor.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);

    actor.stop();
  });

  it('treats a refused fence as an event, not an error', async () => {
    const harness = start();
    const { actor, callbacks, emitted } = harness;

    actor.send({ type: 'cut', trigger: 'close', leaseIds: [] });
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

    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: [] });
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

    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: [] });
    await mintToCas(harness);
    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-2', leaseIds: [] });
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(actor.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: nextTreeId, cutId: 'cut-2' } });
    await flush();

    const answered = parent.events.filter(
      (event): event is AnyEventObject & { turnId?: string } =>
        event.type === 'revisionMinted' || event.type === 'nothingToSave',
    );
    expect(answered.map((event) => event.turnId)).toEqual(['turn-1', 'turn-2']);

    actor.stop();
  });

  it('answers every queued request when the mint fails', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-2', leaseIds: [] });
    actor.send({ type: 'cut', trigger: 'restore', leaseIds: [] });
    promises.settle('cut', { error: new Error('disk full') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    /* AC9: a turn waits on its answer with a bound; an unanswered request
     * strands it until the timeout, and the queue never drains. */
    const answered = parent.events.filter(
      (event): event is AnyEventObject & { turnId?: string; trigger?: string } => event.type === 'cutFailed',
    );
    expect(answered.map((event) => event.turnId)).toEqual(['turn-1', 'turn-2', undefined]);
    expect(answered.map((event) => event.trigger)).toEqual(['turn', 'turn', 'restore']);
    expect(actor.getSnapshot().context.queued).toEqual([]);

    actor.stop();
  });

  it('adopts a new head without leaving clean', () => {
    const { actor } = start();

    actor.send({ type: 'headChanged', revisionId: 'rev-7', treeId: 'tree-7' });

    expect(actor.getSnapshot().matches('clean')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-7');
    expect(actor.getSnapshot().context.headTreeId).toBe('tree-7');

    actor.stop();
  });

  it('adopts an applied head as clean', () => {
    const { actor } = start();

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'headChanged', revisionId: 'rev-7', treeId: 'tree-7' });

    expect(actor.getSnapshot().matches('clean')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-7');

    actor.stop();
  });

  it('sends and emits the same minted outcome with its trigger and turn id', async () => {
    const harness = start();
    const { actor, promises, emitted, parent } = harness;

    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: ['run-1'] });
    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    const expected = {
      type: 'revisionMinted',
      checkoutId: 'checkout-1',
      trigger: 'turn',
      turnId: 'turn-1',
      revisionId: 'rev-2',
    };
    expect(emitted.find((event) => event.type === 'revisionMinted')).toEqual(expected);
    expect(parent.events.find((event) => event.type === 'revisionMinted')).toEqual(expected);

    actor.stop();
  });

  it('starts and stops with no leaked child, a serializable snapshot and no function in context', () => {
    const { actor, callbacks } = start();

    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
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
    expect(actor.getSnapshot().context.pending).toEqual({ trigger: 'idle', leaseIds: [] });

    await mintToCas(harness);
    promises.settle('casHead', { output: { status: 'updated', head: 'rev-2' } });
    await flush();

    expect(emitted.filter((event) => event.type === 'revisionMinted')).toEqual([
      {
        type: 'revisionMinted',
        checkoutId: 'checkout-1',
        trigger: 'idle',
        revisionId: 'rev-2',
      },
    ]);

    actor.stop();
  });

  it('restarts the idle window after a failed mint', async () => {
    const harness = start({ idleWindow: 1000 });
    const { actor, clock, callbacks } = harness;

    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
    callbacks.sendBack('fence', { type: 'fenceRefused', reason: 'held' });
    await flush();
    expect(actor.getSnapshot().matches('failed')).toBe(true);

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    expect(actor.getSnapshot().matches({ dirty: 'quiet' })).toBe(true);

    clock.advance(1000);

    expect(actor.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);
    expect(actor.getSnapshot().context.pending?.trigger).toBe('idle');

    actor.stop();
  });

  it('mints nothing for a save on a tree that equals the head (AC12)', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'changed', paths: ['a.ts'], generation: 1 });
    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
    harness.callbacks.sendBack('fence', { type: 'fenceGranted' });
    promises.settle('cut', { output: { treeId: headTreeId, cutId: 'cut-1' } });
    await flush();

    expect(promises.inputsFor('writeRevision')).toEqual([]);
    expect(emitted.filter((event) => event.type === 'nothingToSave')).toEqual([
      { type: 'nothingToSave', checkoutId: 'checkout-1', trigger: 'save' },
    ]);

    actor.stop();
  });

  it('collapses consecutive trigger-only requests queued behind a mint', async () => {
    const harness = start();
    const { actor } = harness;

    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: ['run-1'] });
    actor.send({ type: 'cut', trigger: 'save', leaseIds: [] });
    actor.send({ type: 'cut', trigger: 'idle', leaseIds: [] });
    actor.send({ type: 'cut', trigger: 'close', leaseIds: [] });
    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-2', leaseIds: ['run-2'] });
    actor.send({ type: 'cut', trigger: 'hidden', leaseIds: [] });

    /* Three trigger-only wishes are one cut, and the later trigger wins; the
     * two turns keep their own places because each is waiting for an answer. */
    expect(actor.getSnapshot().context.queued).toEqual([
      { trigger: 'close', leaseIds: [] },
      { trigger: 'turn', turnId: 'turn-2', leaseIds: ['run-2'] },
      { trigger: 'hidden', leaseIds: [] },
    ]);

    actor.stop();
  });

  it('refuses a request that does not fit the queue instead of dropping it', () => {
    const harness = start();
    const { actor, emitted, parent } = harness;

    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-0', leaseIds: [] });
    for (let index = 0; index < checkoutQueuedCutLimit; index += 1) {
      actor.send({ type: 'cut', trigger: 'turn', turnId: `turn-${index + 1}`, leaseIds: [] });
    }
    actor.send({ type: 'cut', trigger: 'turn', turnId: 'turn-over', leaseIds: [] });

    expect(actor.getSnapshot().context.queued).toHaveLength(checkoutQueuedCutLimit);
    const refusal = {
      type: 'cutFailed',
      checkoutId: 'checkout-1',
      trigger: 'turn',
      turnId: 'turn-over',
      reason: 'queue-full',
    };
    expect(emitted.find((event) => event.type === 'cutFailed')).toEqual(refusal);
    expect(parent.events.find((event) => event.type === 'cutFailed')).toEqual(refusal);

    actor.stop();
  });

  it('exercises every state value xstate/graph can generate', () => {
    const paths = getSimplePaths(checkoutMachine, {
      events: [
        { type: 'changed', paths: ['a.ts'], generation: 1 },
        { type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: [] },
        { type: 'headChanged', revisionId: 'rev-2', treeId: 'tree-2' },
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
});
