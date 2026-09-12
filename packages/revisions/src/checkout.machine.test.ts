import { createActor } from 'xstate';
import { getSimplePaths } from 'xstate/graph';
import type { AnyEventObject } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#checkout.machine.js';
import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutFenceActorInput } from '#checkout.machine.js';
import {
  createFakeCallbackActors,
  createFakeParent,
  createFakePromiseActors,
  recordEmitted,
} from '#test/fake-actors.js';
import type { FakeCallbackActors, FakePromiseActors } from '#test/fake-actors.js';

/*
 * Path table — `checkout.machine` (catalogue: 18).
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
 * 15  a `cut` arriving during a mint is served afterwards, so both requesters are answered
 * 16  `headChanged` adopts a new head without leaving `clean`
 * 17  every outcome is both sent to the parent and emitted, with its trigger and turn id
 * 18  start and stop leak no child, the snapshot is serializable and holds no function
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
}>;

const start = (options?: Readonly<{ headTreeId?: string; branch?: string }>): Harness => {
  const promises = createFakePromiseActors();
  const callbacks = createFakeCallbackActors();
  const parent = createFakeParent();
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
      input: {
        checkoutId: 'checkout-1',
        branch: options?.branch ?? 'main',
        headRevisionId: 'rev-1',
        headTreeId: options?.headTreeId ?? headTreeId,
        parentRef: parent.ref,
      },
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, callbacks, parent, emitted };
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

  it('adopts a new head without leaving clean', () => {
    const { actor } = start();

    actor.send({ type: 'headChanged', revisionId: 'rev-7', treeId: 'tree-7' });

    expect(actor.getSnapshot().matches('clean')).toBe(true);
    expect(actor.getSnapshot().context.headRevisionId).toBe('rev-7');
    expect(actor.getSnapshot().context.headTreeId).toBe('tree-7');

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
      '"dirty"',
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
