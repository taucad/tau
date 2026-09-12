import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#restore.machine.js';
import { latestRevisionTarget, restoreMachine } from '#restore.machine.js';
import { createFakeParent, createFakePromiseActors, recordEmitted } from '#test/fake-actors.js';
import type { FakePromiseActors } from '#test/fake-actors.js';

/*
 * Path table — `restore.machine` (catalogue: 10).
 *
 *  1  `restore { revisionId }` plans against the selected checkout
 *  2  a plan that removes nothing and finds a clean tree applies without asking
 *  3  a plan that removes files asks first, and `confirm` applies
 *  4  a dirty tree asks even when the plan removes nothing
 *  5  `cancel` returns to `idle` and never applies
 *  6  `returnToLatest` plans against the latest sentinel
 *  7  `undo` plans the pre-restore head, and is refused when there is none
 *  8  `computePlan` failure → `failed` → `toast.error` → `idle`
 *  9  `applyPlan` failure → `failed` → `toast.error` → `idle`
 * 10  a revision no branch names leaves the checkout detached (A2/D10)
 * 11  a restore applies to whatever checkout the root selected (F10)
 * --  start and stop, serializable snapshot, one exported machine value
 */

/** Let every queued microtask and the actor's promise handlers run. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof restoreMachine>>;
  promises: FakePromiseActors;
  parent: ReturnType<typeof createFakeParent>;
  emitted: ReturnType<typeof recordEmitted>;
}>;

const start = (): Harness => {
  const promises = createFakePromiseActors();
  const parent = createFakeParent();
  const actor = createActor(
    restoreMachine.provide({
      actors: {
        computePlan: promises.actor('computePlan'),
        applyPlan: promises.actor('applyPlan'),
      },
    }),
    {
      input: { projectId: 'project-1', checkoutId: 'checkout-1', headRevisionId: 'rev-5', parentRef: parent.ref },
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, parent, emitted };
};

const plan = {
  planId: 'plan-1',
  revisionId: 'rev-3',
  revisionNumber: 3,
  removedPathCount: 0,
  dirty: false,
  unrecoverable: [],
};

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

describe('restoreMachine', () => {
  it('plans a restore against the selected checkout', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });

    expect(actor.getSnapshot().matches('planning')).toBe(true);
    expect(promises.inputsFor('computePlan')).toEqual([{ checkoutId: 'checkout-1', target: 'rev-3' }]);

    actor.stop();
  });

  it('applies a safe plan without asking', async () => {
    const { actor, promises, emitted, parent } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    promises.settle('computePlan', { output: plan });
    await flush();

    expect(actor.getSnapshot().matches('applying')).toBe(true);
    expect(promises.inputsFor('applyPlan')).toEqual([{ checkoutId: 'checkout-1', planId: 'plan-1' }]);

    promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3', branch: 'main' } });
    await flush();

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(emitted.find((event) => event.type === 'toast.restored')).toEqual({
      type: 'toast.restored',
      revisionNumber: 3,
      unrecoverable: [],
    });
    expect(parent.events.find((event) => event.type === 'checkoutChanged')).toEqual({
      type: 'checkoutChanged',
      checkoutId: 'checkout-1',
      revisionId: 'rev-3',
      treeId: 'tree-3',
      branch: 'main',
    });

    actor.stop();
  });

  it('asks before a plan that removes files, then applies on confirm', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    promises.settle('computePlan', { output: { ...plan, removedPathCount: 2 } });
    await flush();

    expect(actor.getSnapshot().matches('confirming')).toBe(true);

    actor.send({ type: 'confirm' });

    expect(actor.getSnapshot().matches('applying')).toBe(true);

    actor.stop();
  });

  it('asks when the tree is dirty even if nothing is removed', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    promises.settle('computePlan', { output: { ...plan, dirty: true } });
    await flush();

    expect(actor.getSnapshot().matches('confirming')).toBe(true);

    actor.stop();
  });

  it('cancels without applying', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    promises.settle('computePlan', { output: { ...plan, removedPathCount: 1 } });
    await flush();
    actor.send({ type: 'cancel' });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(promises.inputsFor('applyPlan')).toEqual([]);
    expect(actor.getSnapshot().context.planId).toBeUndefined();

    actor.stop();
  });

  it('plans the latest revision for returnToLatest', () => {
    const { actor, promises } = start();

    actor.send({ type: 'returnToLatest' });

    expect(promises.inputsFor('computePlan')).toEqual([{ checkoutId: 'checkout-1', target: latestRevisionTarget }]);

    actor.stop();
  });

  it('refuses undo until a restore has happened, then plans the pre-restore head', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'undo' });
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(promises.inputsFor('computePlan')).toEqual([]);

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    promises.settle('computePlan', { output: plan });
    await flush();
    promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3', branch: 'main' } });
    await flush();

    actor.send({ type: 'undo' });

    expect(promises.inputsFor('computePlan')[1]).toEqual({ checkoutId: 'checkout-1', target: 'rev-5' });

    actor.stop();
  });

  it('reports a planning failure as a toast and returns to idle', async () => {
    const { actor, promises, emitted } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    promises.settle('computePlan', { error: new Error('unknown revision') });
    await flush();

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(emitted.find((event) => event.type === 'toast.error')).toMatchObject({ message: 'unknown revision' });

    actor.stop();
  });

  it('reports an apply failure as a toast and returns to idle', async () => {
    const { actor, promises, emitted } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    promises.settle('computePlan', { output: plan });
    await flush();
    promises.settle('applyPlan', { error: new Error('write failed') });
    await flush();

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(types(emitted)).toContain('toast.error');

    actor.stop();
  });

  it('leaves the checkout detached when no branch names the revision', async () => {
    const { actor, promises, parent } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    promises.settle('computePlan', { output: plan });
    await flush();
    promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3', branch: undefined } });
    await flush();

    expect(parent.events.find((event) => event.type === 'checkoutChanged')).toEqual({
      type: 'checkoutChanged',
      checkoutId: 'checkout-1',
      revisionId: 'rev-3',
      treeId: 'tree-3',
      branch: undefined,
    });

    actor.stop();
  });

  it('applies to whatever checkout the root selected', () => {
    const { actor, promises } = start();

    actor.send({ type: 'selectCheckout', checkoutId: 'checkout-b', headRevisionId: 'rev-9' });
    actor.send({ type: 'restore', revisionId: 'rev-3' });

    expect(promises.inputsFor('computePlan')).toEqual([{ checkoutId: 'checkout-b', target: 'rev-3' }]);

    actor.stop();
  });

  it('starts and stops with a serializable snapshot and no function in context', () => {
    const { actor } = start();

    const persisted = actor.getPersistedSnapshot();

    expect(() => JSON.stringify(persisted)).not.toThrow();
    expect(JSON.stringify(persisted)).not.toContain('function');
    expect(Object.values(actor.getSnapshot().context).some((value) => typeof value === 'function')).toBe(false);

    actor.stop();

    expect(Object.keys(actor.getSnapshot().children)).toEqual([]);
  });

  it('exports exactly one machine value', () => {
    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([restoreMachine]);
  });
});
