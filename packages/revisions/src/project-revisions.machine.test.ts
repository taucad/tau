import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#project-revisions.machine.js';
import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutFenceActorInput } from '#checkout.machine.js';
import { checkoutsMachine } from '#checkouts.machine.js';
import type { CheckoutRecord } from '#checkouts.machine.js';
import { restoreMachine } from '#restore.machine.js';
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
 * --  `checkoutChanged` re-heads the checkout; the checkouts' own statuses feed
 *     the `RevisionStatus` projection; serializable snapshot; one machine value
 */

/** Let every queued microtask and the actors' promise handlers run. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const live: CheckoutRecord = { id: 'checkout-live', branch: 'main', leaseRunIds: [] };
const linked: CheckoutRecord = { id: 'checkout-b', branch: 'agent/b', leaseRunIds: [] };

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
const readyRegistry = async (harness: Harness): Promise<void> => {
  harness.promises.settle('sweepLeases', { output: { retiredRunIds: [] } });
  await flush();
  harness.promises.settle('listCheckouts', { output: { checkouts: [live, linked] } });
  await flush();
};

/** Admit a turn and drive it to the point where it asks its checkout to cut. */
const turnToRequesting = async (harness: Harness): Promise<void> => {
  harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
  harness.promises.settle('prepare', {
    output: { checkoutId: 'checkout-b', branch: 'agent/b', baseRevisionId: 'rev-1', staleRunIds: [] },
  });
  await flush();
  harness.promises.settle('writeLease', { output: { leaseIds: ['run-1'] } });
  await flush();
  harness.callbacks.sendBack('lease', { type: 'leaseGranted' });
  harness.actor.getSnapshot().context.turnRefs['turn-1']?.send({ type: 'turnCompleted' });
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

    const refs = harness.actor.getSnapshot().context.checkoutRefs;
    expect(Object.keys(refs)).toEqual(['checkout-live', 'checkout-b']);
    expect(refs['checkout-b']?.getSnapshot().context.branch).toBe('agent/b');
    expect(refs['checkout-b']?.getSnapshot().context.parentRef).toBeDefined();

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

  it('admits one turn per turn id', () => {
    const harness = start();

    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-2' });

    expect(Object.keys(harness.actor.getSnapshot().context.turnRefs)).toEqual(['turn-1']);
    expect(harness.promises.inputsFor('prepare')).toEqual([{ turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' }]);

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

    const refs = harness.actor.getSnapshot().context.checkoutRefs;
    expect(refs['checkout-b']?.getSnapshot().matches({ minting: 'acquiring' })).toBe(true);
    expect(refs['checkout-live']?.getSnapshot().matches('clean')).toBe(true);
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
    await readyRegistry(harness);
    harness.actor.send({ type: 'admitTurn', turnId: 'turn-1', chatId: 'chat-1', runId: 'run-1' });
    const turnRef = harness.actor.getSnapshot().context.turnRefs['turn-1'];

    harness.actor.send({
      type: 'turnFinalized',
      turnId: 'turn-1',
      chatId: 'chat-1',
      checkoutId: 'checkout-b',
      revisionId: 'rev-2',
      trigger: 'turn',
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

    await readyRegistry(harness);
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
    harness.actor.getSnapshot().context.checkoutRefs['checkout-b']?.send({
      type: 'changed',
      paths: ['a.ts'],
      generation: 1,
    });

    expect(selectRevisionStatus(harness.actor.getSnapshot())).toEqual({
      projectId: 'project-1',
      checkoutId: 'checkout-b',
      branch: 'agent/b',
      dirty: true,
      minting: false,
      headRevisionId: undefined,
      follow: 'pinned',
      attention: 0,
    });

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

  it('exports exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([projectRevisionsMachine]);
  });
});
