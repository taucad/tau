import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#project-revisions.machine.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import { createFakeCallbackActors, recordEmitted } from '#test/fake-actors.js';
import type { FakeCallbackActors } from '#test/fake-actors.js';

/*
 * Path table — `project-revisions.machine` (catalogue: 10).
 *
 *  1  start invokes the always-on children and opens the registry
 *  2  `checkoutsChanged` spawns one `checkout` per record, with `parentRef`
 *  3  a record already spawned is not spawned twice; a record that disappeared
 *     is stopped
 *  4  `admitTurn` spawns a `turn`; the same turn id is never admitted twice
 *  5  `cut` from a turn reaches that turn's checkout
 *  6  `revisionMinted` / `nothingToSave` / `cutFailed` reach the requesting turn
 *  7  `turnFinalized` reaches `checkouts`, stops the turn child and is re-emitted
 *  8  `leaseStale` reaches `checkouts`
 *  9  root `exit` stops every spawned child
 * 10  selection: `pinTo`, `followChat`, and D10's `switch` (re-root, apply to
 *     live, refused while a lease holds live)
 * --  `checkoutChanged` re-heads the checkout; `checkoutStatusChanged` feeds the
 *     `RevisionStatus` projection; serializable snapshot; one machine value
 */

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof projectRevisionsMachine>>;
  children: FakeCallbackActors;
  emitted: ReturnType<typeof recordEmitted>;
}>;

const live = { id: 'checkout-live', branch: 'main', leaseRunIds: [] };
const linked = { id: 'checkout-b', branch: 'agent/b', leaseRunIds: [] };

const start = (): Harness => {
  const children = createFakeCallbackActors();
  const actor = createActor(
    projectRevisionsMachine.provide({
      actors: {
        checkouts: children.actor('checkouts'),
        restore: children.actor('restore'),
        checkout: children.actor('checkout'),
        turn: children.actor('turn'),
      },
    }),
    { input: { projectId: 'project-1', liveCheckoutId: 'checkout-live' } },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, children, emitted };
};

const sentTo = (harness: Harness, name: string): ReadonlyArray<{ type: string }> =>
  harness.children.deliveries.filter((delivery) => delivery.name === name).map((delivery) => delivery.event);

const admitTurn = (harness: Harness): void => {
  harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
};

const registerCheckouts = (harness: Harness, checkouts = [live, linked]): void => {
  harness.actor.send({ type: 'checkoutsChanged', checkouts });
};

describe('projectRevisionsMachine', () => {
  it('invokes the always-on children and opens the registry', () => {
    const harness = start();

    expect(harness.children.active('checkouts')).toBe(1);
    expect(harness.children.active('restore')).toBe(1);
    expect(sentTo(harness, 'checkouts').map((event) => event.type)).toEqual(['open']);

    harness.actor.stop();
  });

  it('spawns one checkout per registered record, each with a parent ref', () => {
    const harness = start();

    registerCheckouts(harness);

    expect(harness.children.active('checkout')).toBe(2);
    expect(harness.children.inputsFor('checkout')).toMatchObject([
      { checkoutId: 'checkout-live', branch: 'main' },
      { checkoutId: 'checkout-b', branch: 'agent/b' },
    ]);
    expect(harness.children.inputsFor('checkout').every((input) => (input as { parentRef?: unknown }).parentRef)).toBe(
      true,
    );

    harness.actor.stop();
  });

  it('never spawns one checkout twice and stops one that disappeared', () => {
    const harness = start();

    registerCheckouts(harness);
    registerCheckouts(harness);
    expect(harness.children.active('checkout')).toBe(2);

    registerCheckouts(harness, [live]);

    expect(harness.children.active('checkout')).toBe(1);
    expect(harness.children.releases('checkout')).toBe(1);
    expect(Object.keys(harness.actor.getSnapshot().context.checkoutRefs)).toEqual(['checkout-live']);

    harness.actor.stop();
  });

  it('admits one turn per turn id', () => {
    const harness = start();

    admitTurn(harness);
    admitTurn(harness);

    expect(harness.children.active('turn')).toBe(1);
    expect(harness.children.inputsFor('turn')).toMatchObject([{ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' }]);

    harness.actor.stop();
  });

  it('routes a turn cut to that turn checkout', () => {
    const harness = start();

    registerCheckouts(harness);
    admitTurn(harness);
    harness.actor.send({
      type: 'cut',
      trigger: 'turn',
      turnId: 'turn-1',
      checkoutId: 'checkout-b',
      leaseIds: ['run-1'],
    });

    const delivered = harness.children.deliveries.filter(
      (delivery) => delivery.name === 'checkout' && delivery.event.type === 'cut',
    );
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.input).toMatchObject({ checkoutId: 'checkout-b' });
    expect(delivered[0]?.event).toEqual({ type: 'cut', trigger: 'turn', turnId: 'turn-1', leaseIds: ['run-1'] });

    harness.actor.stop();
  });

  it('routes every cut outcome back to the requesting turn', () => {
    const harness = start();

    registerCheckouts(harness);
    admitTurn(harness);
    harness.actor.send({
      type: 'revisionMinted',
      checkoutId: 'checkout-b',
      trigger: 'turn',
      turnId: 'turn-1',
      revisionId: 'rev-2',
    });
    harness.actor.send({ type: 'nothingToSave', checkoutId: 'checkout-b', trigger: 'turn', turnId: 'turn-1' });
    harness.actor.send({
      type: 'cutFailed',
      checkoutId: 'checkout-b',
      trigger: 'turn',
      turnId: 'turn-1',
      reason: 'quota',
    });

    expect(sentTo(harness, 'turn').map((event) => event.type)).toEqual([
      'revisionMinted',
      'nothingToSave',
      'cutFailed',
    ]);

    harness.actor.stop();
  });

  it('sends a finalized turn to checkouts, stops the turn and re-emits it', () => {
    const harness = start();

    registerCheckouts(harness);
    admitTurn(harness);
    harness.actor.send({
      type: 'turnFinalized',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      revisionId: 'rev-2',
      trigger: 'turn',
      runIds: ['run-1'],
    });

    expect(sentTo(harness, 'checkouts').map((event) => event.type)).toContain('turnFinalized');
    expect(harness.children.active('turn')).toBe(0);
    expect(harness.actor.getSnapshot().context.turnRefs).toEqual({});
    expect(harness.emitted.map((event) => event.type)).toContain('turnFinalized');

    harness.actor.stop();
  });

  it('forwards a stale lease to checkouts', () => {
    const harness = start();

    harness.actor.send({ type: 'leaseStale', runId: 'run-9' });

    expect(sentTo(harness, 'checkouts')).toContainEqual({ type: 'leaseStale', runId: 'run-9' });

    harness.actor.stop();
  });

  it('stops every spawned child when the root stops', () => {
    const harness = start();

    registerCheckouts(harness);
    admitTurn(harness);
    harness.actor.stop();

    expect(harness.children.active('checkout')).toBe(0);
    expect(harness.children.active('turn')).toBe(0);
    expect(harness.children.active('checkouts')).toBe(0);
    expect(harness.children.active('restore')).toBe(0);
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
    expect(sentTo(harness, 'restore').filter((event) => event.type === 'selectCheckout')).toHaveLength(1);

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
      branch: undefined,
    });

    const delivered = harness.children.deliveries.filter(
      (delivery) => delivery.name === 'checkout' && delivery.event.type === 'headChanged',
    );
    expect(delivered).toHaveLength(1);
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
    harness.actor.send({
      type: 'checkoutStatusChanged',
      checkoutId: 'checkout-b',
      status: 'dirty',
      headRevisionId: 'rev-3',
    });
    harness.actor.send({ type: 'checkoutStatusChanged', checkoutId: 'checkout-live', status: 'failed' });

    expect(selectRevisionStatus(harness.actor.getSnapshot())).toEqual({
      projectId: 'project-1',
      checkoutId: 'checkout-b',
      branch: 'agent/b',
      dirty: true,
      minting: false,
      headRevisionId: 'rev-3',
      follow: 'pinned',
      attention: 1,
    });

    harness.actor.stop();
  });

  it('keeps a serializable snapshot with no function in context', () => {
    const harness = start();

    registerCheckouts(harness);
    admitTurn(harness);
    const persisted = harness.actor.getPersistedSnapshot();

    expect(() => JSON.stringify(persisted)).not.toThrow();
    expect(JSON.stringify(persisted)).not.toContain('function');
    expect(Object.values(harness.actor.getSnapshot().context).some((value) => typeof value === 'function')).toBe(false);

    harness.actor.stop();
  });

  it('exports exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([projectRevisionsMachine]);
  });
});
