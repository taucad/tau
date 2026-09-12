import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#checkouts.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import { createFakeParent, createFakePromiseActors, recordEmitted } from '#test/fake-actors.js';
import type { FakePromiseActors } from '#test/fake-actors.js';

/*
 * Path table — `checkouts.machine` (catalogue: 14).
 *
 *  1  `open` sweeps stale leases, then rehydrates the registry from records
 *  2  a sweep that retired runs announces `leaseRetired` for each
 *  3  `sweepLeases` failure → `failed`
 *  4  `listCheckouts` failure → `failed`
 *  5  `failed` accepts `open` again
 *  6  `addCheckout` appends a checkout and announces the new registry
 *  7  a branch that already has a checkout is refused (one checkout per branch)
 *  8  `addCheckout` failure keeps the registry and announces `checkoutFailed`
 *  9  `removeCheckout` drops a checkout and announces the new registry
 * 10  a checkout a lease holds is never removed (A25/I9)
 * 11  `removeCheckout` failure announces `checkoutFailed`
 * 12  `turnFinalized` retires the lease without removing the checkout (D17)
 * 13  `leaseStale { runId }` retires that lease
 * 14  two retirements in one burst are both served
 * --  a removable record offers removal; `open` rehydrates from records again;
 *     start and stop, serializable snapshot, one exported machine value
 */

/** Let every queued microtask and the actor's promise handlers run. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof checkoutsMachine>>;
  promises: FakePromiseActors;
  parent: ReturnType<typeof createFakeParent>;
  emitted: ReturnType<typeof recordEmitted>;
}>;

const live = { id: 'checkout-live', branch: 'main', leaseRunIds: [] };
const linked = { id: 'checkout-b', branch: 'agent/b', leaseRunIds: ['run-7'] };

const start = (): Harness => {
  const promises = createFakePromiseActors();
  const parent = createFakeParent();
  const actor = createActor(
    checkoutsMachine.provide({
      actors: {
        listCheckouts: promises.actor('listCheckouts'),
        addCheckout: promises.actor('addCheckout'),
        removeCheckout: promises.actor('removeCheckout'),
        sweepLeases: promises.actor('sweepLeases'),
        retireLease: promises.actor('retireLease'),
      },
    }),
    { input: { projectId: 'project-1', parentRef: parent.ref } },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, parent, emitted };
};

/** Open the registry with the two default records. */
const toReady = async (
  harness: Harness,
  options?: Readonly<{ retired?: readonly string[]; checkouts?: readonly unknown[] }>,
): Promise<void> => {
  harness.actor.send({ type: 'open' });
  harness.promises.settle('sweepLeases', { output: { retiredRunIds: options?.retired ?? [] } });
  await flush();
  harness.promises.settle('listCheckouts', { output: { checkouts: options?.checkouts ?? [live, linked] } });
  await flush();
};

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

describe('checkoutsMachine', () => {
  it('sweeps leases then rehydrates the registry from records', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'open' });
    expect(actor.getSnapshot().matches('recovering')).toBe(true);
    expect(promises.inputsFor('sweepLeases')).toEqual([{ projectId: 'project-1' }]);

    promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
    await flush();
    expect(actor.getSnapshot().matches('loading')).toBe(true);

    promises.settle('listCheckouts', { output: { checkouts: [live, linked] } });
    await flush();

    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(actor.getSnapshot().context.checkouts).toEqual([live, linked]);
    expect(parent.events.find((event) => event.type === 'checkoutsChanged')).toEqual({
      type: 'checkoutsChanged',
      checkouts: [live, linked],
    });

    actor.stop();
  });

  it('announces every lease the sweep retired', async () => {
    const harness = start();

    await toReady(harness, { retired: ['run-1', 'run-2'] });

    expect(harness.emitted.filter((event) => event.type === 'leaseRetired')).toEqual([
      { type: 'leaseRetired', runId: 'run-1' },
      { type: 'leaseRetired', runId: 'run-2' },
    ]);

    harness.actor.stop();
  });

  it('fails when the sweep rejects', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'open' });
    promises.settle('sweepLeases', { error: new Error('no runs directory') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);

    actor.stop();
  });

  it('fails when listing checkouts rejects, and reopens on open', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'open' });
    promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
    await flush();
    promises.settle('listCheckouts', { error: new Error('registry unreadable') });
    await flush();

    expect(actor.getSnapshot().matches('failed')).toBe(true);

    actor.send({ type: 'open' });
    expect(actor.getSnapshot().matches('recovering')).toBe(true);

    actor.stop();
  });

  it('adds a checkout and announces the new registry', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toReady(harness);
    actor.send({ type: 'addCheckout', branch: 'agent/c', from: 'rev-1' });

    expect(actor.getSnapshot().matches({ ready: 'adding' })).toBe(true);
    expect(promises.inputsFor('addCheckout')).toEqual([{ projectId: 'project-1', branch: 'agent/c', from: 'rev-1' }]);

    const added = { id: 'checkout-c', branch: 'agent/c', leaseRunIds: [] };
    promises.settle('addCheckout', { output: { checkout: added } });
    await flush();

    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(actor.getSnapshot().context.checkouts).toEqual([live, linked, added]);
    expect(parent.events.filter((event) => event.type === 'checkoutsChanged')).toHaveLength(2);

    actor.stop();
  });

  it('refuses a second checkout on one branch', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toReady(harness);
    actor.send({ type: 'addCheckout', branch: 'main', from: 'rev-1' });

    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(promises.inputsFor('addCheckout')).toEqual([]);
    expect(emitted.find((event) => event.type === 'checkoutFailed')).toMatchObject({ operation: 'add' });

    actor.stop();
  });

  it('keeps the registry when adding a checkout fails', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toReady(harness);
    actor.send({ type: 'addCheckout', branch: 'agent/c', from: 'rev-1' });
    promises.settle('addCheckout', { error: new Error('cannot nest a worktree') });
    await flush();

    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(actor.getSnapshot().context.checkouts).toEqual([live, linked]);
    expect(emitted.find((event) => event.type === 'checkoutFailed')).toMatchObject({
      operation: 'add',
      reason: 'cannot nest a worktree',
    });

    actor.stop();
  });

  it('removes an unleased checkout and announces the new registry', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toReady(harness);
    actor.send({ type: 'removeCheckout', id: 'checkout-live' });

    expect(actor.getSnapshot().matches({ ready: 'removing' })).toBe(true);
    promises.settle('removeCheckout', { output: undefined });
    await flush();

    expect(actor.getSnapshot().context.checkouts).toEqual([linked]);

    actor.stop();
  });

  it('never removes a checkout a lease holds', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toReady(harness);
    actor.send({ type: 'removeCheckout', id: 'checkout-b' });

    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(promises.inputsFor('removeCheckout')).toEqual([]);
    expect(emitted.find((event) => event.type === 'checkoutFailed')).toMatchObject({ operation: 'remove' });

    actor.stop();
  });

  it('announces a failure when removing a checkout rejects', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toReady(harness);
    actor.send({ type: 'removeCheckout', id: 'checkout-live' });
    promises.settle('removeCheckout', { error: new Error('directory busy') });
    await flush();

    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(actor.getSnapshot().context.checkouts).toEqual([live, linked]);
    expect(types(emitted)).toContain('checkoutFailed');

    actor.stop();
  });

  it('retires a finalized turn lease without removing its checkout', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toReady(harness);
    actor.send({
      type: 'turnFinalized',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      revisionId: 'rev-2',
      trigger: 'turn',
      runIds: ['run-7'],
    });

    expect(actor.getSnapshot().matches({ ready: 'retiring' })).toBe(true);
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(actor.getSnapshot().context.checkouts.map((checkout) => checkout.id)).toEqual([
      'checkout-live',
      'checkout-b',
    ]);
    expect(actor.getSnapshot().context.checkouts[1]?.leaseRunIds).toEqual([]);
    expect(emitted.find((event) => event.type === 'leaseRetired')).toEqual({
      type: 'leaseRetired',
      runId: 'run-7',
    });

    actor.stop();
  });

  it('retires a stale lease reported by a preparing turn', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toReady(harness);
    actor.send({ type: 'leaseStale', runId: 'run-7' });
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(promises.inputsFor('retireLease')).toEqual([{ projectId: 'project-1', runId: 'run-7' }]);

    actor.stop();
  });

  it('serves every retirement in a burst', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toReady(harness);
    actor.send({ type: 'leaseStale', runId: 'run-7' });
    actor.send({ type: 'leaseStale', runId: 'run-8' });
    promises.settle('retireLease', { output: undefined });
    await flush();
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(promises.inputsFor('retireLease')).toEqual([
      { projectId: 'project-1', runId: 'run-7' },
      { projectId: 'project-1', runId: 'run-8' },
    ]);
    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);

    actor.stop();
  });

  it('stays ready when retiring a lease rejects', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toReady(harness);
    actor.send({ type: 'leaseStale', runId: 'run-7' });
    promises.settle('retireLease', { error: new Error('lease file gone') });
    await flush();

    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(types(emitted)).toContain('checkoutFailed');

    actor.stop();
  });

  it('offers removal for a record the host marked removable', async () => {
    const harness = start();

    await toReady(harness, {
      checkouts: [live, { ...linked, leaseRunIds: [], removable: true }],
    });

    expect(harness.emitted.find((event) => event.type === 'removalOffered')).toEqual({
      type: 'removalOffered',
      checkoutId: 'checkout-b',
    });

    harness.actor.stop();
  });

  it('rehydrates from records again on a second open', async () => {
    const harness = start();
    const { actor, promises } = harness;

    await toReady(harness);
    actor.send({ type: 'open' });

    expect(actor.getSnapshot().matches('loading')).toBe(true);
    promises.settle('listCheckouts', { output: { checkouts: [live] } });
    await flush();

    expect(actor.getSnapshot().context.checkouts).toEqual([live]);

    actor.stop();
  });

  it('starts and stops with a serializable snapshot and no function in context', async () => {
    const harness = start();

    await toReady(harness);
    const persisted = harness.actor.getPersistedSnapshot();

    expect(() => JSON.stringify(persisted)).not.toThrow();
    expect(JSON.stringify(persisted)).not.toContain('function');
    expect(Object.values(harness.actor.getSnapshot().context).some((value) => typeof value === 'function')).toBe(false);

    harness.actor.stop();

    expect(Object.keys(harness.actor.getSnapshot().children)).toEqual([]);
  });

  it('exports exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([checkoutsMachine]);
  });
});
