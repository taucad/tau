import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#checkouts.machine.js';
import { checkoutsMachine, selectLeaseSet } from '#checkouts.machine.js';
import type { CheckoutRecord } from '#revision-port.js';
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
 * 15  `leaseWritten { checkoutId, runId }` appends the lease and re-announces,
 *     arming the D10 switch guard and the A25/I9 removal guard (R1)
 * 16  `turnFinalized` retires only that turn's own lease, so a second chat on
 *     the same checkout keeps its lease (AC9, R2)
 * 17  every registry fact the parent has to route reaches it, not just the
 *     emit stream (R11)
 * 18  a lease written before the registry finished loading is not dropped: it
 *     is on the record once the load lands (R22)
 * 19  a turn that ended without ever writing a lease retires nothing (R23)
 * 20  a settlement or a stale-lease report that arrives before the registry
 *     finished loading still retires its lease (R30)
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
  leaseRunIds: ['run-7'],
  leaseChatIds: [],
};

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
      runId: 'run-7',
      revisionId: 'rev-2',
      trigger: 'turn',
      branch: 'main',
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

    /* Both run ids are leases the registry actually knows: a retirement for a
     * run id no record holds is left to `sweepLeases` (R23/R30). */
    await toReady(harness, { checkouts: [live, { ...linked, leaseRunIds: ['run-7', 'run-8'] }] });
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

  it('appends a lease a turn wrote and re-announces the registry', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toReady(harness);
    const announcements = parent.events.filter((event) => event.type === 'checkoutsChanged').length;
    actor.send({ type: 'leaseWritten', checkoutId: 'checkout-live', runId: 'run-9' });

    /* D10: the switch guard reads this set, so it has to contain the lease. */
    expect(selectLeaseSet(actor.getSnapshot())['checkout-live']).toEqual(['run-9']);
    expect(parent.events.filter((event) => event.type === 'checkoutsChanged')).toHaveLength(announcements + 1);

    /* A25/I9: the same lease now blocks removal. */
    actor.send({ type: 'removeCheckout', id: 'checkout-live' });

    expect(promises.inputsFor('removeCheckout')).toEqual([]);
    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);

    actor.stop();
  });

  it('ignores a lease written for a checkout it does not know', async () => {
    const harness = start();
    const { actor, parent } = harness;

    await toReady(harness);
    const announcements = parent.events.filter((event) => event.type === 'checkoutsChanged').length;
    actor.send({ type: 'leaseWritten', checkoutId: 'checkout-ghost', runId: 'run-9' });

    expect(actor.getSnapshot().context.checkouts).toEqual([live, linked]);
    expect(parent.events.filter((event) => event.type === 'checkoutsChanged')).toHaveLength(announcements);

    actor.stop();
  });

  it('retires only the finalizing turn\u2019s own lease, leaving a second chat leased', async () => {
    const harness = start();
    const { actor, promises } = harness;
    const shared: CheckoutRecord = { ...linked, leaseRunIds: ['run-a', 'run-b'] };

    await toReady(harness, { checkouts: [live, shared] });
    actor.send({
      type: 'turnFinalized',
      turnId: 'turn-a',
      chatId: 'chat-a',
      checkoutId: 'checkout-b',
      runId: 'run-a',
      revisionId: 'rev-2',
      trigger: 'turn',
      branch: 'main',
      runIds: ['run-a', 'run-b'],
    });
    promises.settle('retireLease', { output: undefined });
    await flush();

    /* AC9: two chats share the checkout; chat B is still working in it. */
    expect(promises.inputsFor('retireLease')).toEqual([{ projectId: 'project-1', runId: 'run-a' }]);
    expect(selectLeaseSet(actor.getSnapshot())['checkout-b']).toEqual(['run-b']);
    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);

    actor.stop();
  });

  it('sends every registry fact to the parent, not only to the emit stream', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    await toReady(harness, {
      retired: ['run-0'],
      checkouts: [live, { ...linked, leaseRunIds: [], removable: true }],
    });
    actor.send({ type: 'addCheckout', branch: 'main', from: 'rev-1' });

    expect(types(parent.events)).toContain('leaseRetired');
    expect(types(parent.events)).toContain('removalOffered');
    expect(types(parent.events)).toContain('checkoutFailed');

    expect(promises.inputsFor('addCheckout')).toEqual([]);

    actor.stop();
  });

  it('keeps a lease written before the registry finished loading', async () => {
    const harness = start();
    const { actor, parent } = harness;

    actor.send({ type: 'open' });
    actor.send({ type: 'leaseWritten', checkoutId: 'checkout-live', runId: 'run-9' });
    harness.promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
    await flush();
    harness.promises.settle('listCheckouts', { output: { checkouts: [live, linked] } });
    await flush();

    /* R1's whole point is that a lease is never silently dropped; nothing
     * orders `admitTurn` after the registry reaches `ready`. */
    expect(selectLeaseSet(actor.getSnapshot())['checkout-live']).toEqual(['run-9']);
    expect(parent.events.findLast((event) => event.type === 'checkoutsChanged')).toMatchObject({
      checkouts: [{ id: 'checkout-live', leaseRunIds: ['run-9'] }, linked],
    });

    actor.stop();
  });

  it('retires nothing for a turn that never wrote a lease', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    await toReady(harness);
    actor.send({ type: 'turnReleased', turnId: 'turn-1', checkoutId: 'checkout-live', runId: 'run-never' });

    /* R11 routes a retirement failure to the host, so retiring a lease that was
     * never written would surface a failure nobody can act on. */
    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);
    expect(promises.inputsFor('retireLease')).toEqual([]);
    expect(types(emitted)).not.toContain('checkoutFailed');

    actor.stop();
  });

  it('retires a lease whose settlement arrived before the registry loaded', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'open' });
    promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
    await flush();
    actor.send({
      type: 'turnFinalized',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      runId: 'run-7',
      revisionId: 'rev-2',
      trigger: 'turn',
      branch: 'main',
      runIds: ['run-7'],
    });
    promises.settle('listCheckouts', { output: { checkouts: [live, linked] } });
    await flush();
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(promises.inputsFor('retireLease')).toEqual([{ projectId: 'project-1', runId: 'run-7' }]);
    expect(selectLeaseSet(actor.getSnapshot())['checkout-b']).toEqual([]);

    actor.stop();
  });

  it('retires a lease reported stale before the registry loaded', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'open' });
    actor.send({ type: 'leaseStale', runId: 'run-7' });
    promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
    await flush();
    promises.settle('listCheckouts', { output: { checkouts: [live, linked] } });
    await flush();
    promises.settle('retireLease', { output: undefined });
    await flush();

    expect(promises.inputsFor('retireLease')).toEqual([{ projectId: 'project-1', runId: 'run-7' }]);

    actor.stop();
  });

  it('cancels a buffered lease whose turn already ended', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'open' });
    actor.send({ type: 'leaseWritten', checkoutId: 'checkout-live', runId: 'run-9' });
    actor.send({ type: 'turnReleased', turnId: 'turn-1', checkoutId: 'checkout-live', runId: 'run-9' });
    promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
    await flush();
    promises.settle('listCheckouts', { output: { checkouts: [live, linked] } });
    await flush();

    /* The registry never recorded that lease and the turn retired its own file,
     * so nothing is left to retire and nothing is left holding the checkout. */
    expect(selectLeaseSet(actor.getSnapshot())['checkout-live']).toEqual([]);
    expect(promises.inputsFor('retireLease')).toEqual([]);
    expect(actor.getSnapshot().matches({ ready: 'idle' })).toBe(true);

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
