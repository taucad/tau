import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#restore.machine.js';
import { restoreCutMilliseconds, restoreMachine } from '#restore.machine.js';
import { createFakeParent, createFakePromiseActors, createManualClock, recordEmitted } from '#test/fake-actors.js';
import type { FakePromiseActors, ManualClock } from '#test/fake-actors.js';

/*
 * Path table — `restore.machine` (catalogue: 12).
 *
 *  1  `restore { revisionId }` first mints the checkout: a `restore` cut through the parent (D1)
 *  2  the pre-restore cut's answer plans against the selected checkout; a plan that removes
 *     nothing and finds a clean tree applies without asking
 *  3  a plan that removes files asks first, and `confirm` applies
 *  4  a dirty tree asks even when the plan removes nothing
 *  5  `cancel` returns to `idle` and never applies
 *  6  the restore stays pinned to the checkout it planned against: a re-root mid-restore
 *     re-targets only the next verb (A6)
 *  7  the applied tree is minted as a `restore` revision carrying `restoredFrom`; the line
 *     fast-forwards and no `checkoutChanged` names a detached head (D1, T1)
 *  8  restore-to-current mints nothing: `nothingToSave` on the restore cut settles with no
 *     *Restored* toast and nothing to undo (A8)
 *  9  `undo` plans the first parent of the restore revision, and is refused — out loud — when there
 *     is none, or when the selection has left the checkout or line it was minted on (D2, M1)
 * 10  a failure at any step — the pre-restore cut, `computePlan`, `applyPlan`, a lost CAS on
 *     the restore cut — is `failed` → `toast.error` → `idle`, and a refused pre-restore cut
 *     applies nothing; a restore cut that fails after the apply says the files are back (N1)
 * 11  answers addressed to a turn, another trigger, another checkout or an earlier cut are not
 *     this verb's (N2)
 * 12  a restore applies to whatever checkout the root selected (F10)
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
  clock: ManualClock;
}>;

const start = (): Harness => {
  const promises = createFakePromiseActors();
  const parent = createFakeParent();
  const clock = createManualClock();
  const actor = createActor(
    restoreMachine.provide({
      actors: {
        computePlan: promises.actor('computePlan'),
        applyPlan: promises.actor('applyPlan'),
      },
    }),
    {
      clock,
      input: { projectId: 'project-1', checkoutId: 'checkout-1', parentRef: parent.ref },
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  /* The root announces the selection and its line before any verb (R8). */
  actor.send({ type: 'selectCheckout', checkoutId: 'checkout-1', branch: 'main' });
  return { actor, promises, parent, emitted, clock };
};

const plan = {
  planId: 'plan-1',
  revisionId: 'rev-3',
  revisionNumber: 3,
  removedPathCount: 0,
  dirty: false,
};

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

const cutsAsked = (parent: Harness['parent']) => parent.events.filter((event) => event.type === 'cut');

/** The id of the last cut this verb asked for, which the checkout echoes on its answer (N2). */
const lastRequestId = (parent: Harness['parent']): string => {
  const requestId: unknown = cutsAsked(parent).at(-1)?.['requestId'];
  if (typeof requestId !== 'string') {
    throw new TypeError('The restore asked for no cut.');
  }
  return requestId;
};

/** How the root addresses the answer to this verb's last cut. */
const ours = (harness: Harness): Readonly<{ checkoutId: string; trigger: 'restore'; requestId: string }> => ({
  checkoutId: 'checkout-1',
  trigger: 'restore',
  requestId: lastRequestId(harness.parent),
});

/** Answer the pre-restore cut the way the checkout child would. */
const mintBefore = (harness: Harness, answer: 'revisionMinted' | 'nothingToSave' = 'nothingToSave'): void => {
  harness.actor.send(
    answer === 'revisionMinted'
      ? { type: 'revisionMinted', ...ours(harness), revisionId: 'rev-5' }
      : { type: 'nothingToSave', ...ours(harness) },
  );
};

/** Drive one restore of `rev-3` to the point where the restore cut is waiting. */
const applyRestore = async (harness: Harness): Promise<void> => {
  harness.actor.send({ type: 'restore', revisionId: 'rev-3' });
  mintBefore(harness);
  harness.promises.settle('computePlan', { output: plan });
  await flush();
  harness.promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3' } });
  await flush();
};

describe('restoreMachine', () => {
  it('mints the checkout before it plans anything', () => {
    const { actor, promises, parent } = start();

    actor.send({ type: 'restore', revisionId: 'rev-3' });

    expect(actor.getSnapshot().matches('recording')).toBe(true);
    expect(cutsAsked(parent)).toEqual([
      { type: 'cut', trigger: 'restore', checkoutId: 'checkout-1', leaseIds: [], requestId: lastRequestId(parent) },
    ]);
    expect(promises.inputsFor('computePlan')).toEqual([]);

    actor.stop();
  });

  it('plans against the selected checkout once the pre-restore cut settles, and applies a safe plan without asking', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    mintBefore(harness, 'revisionMinted');

    expect(actor.getSnapshot().matches('planning')).toBe(true);
    expect(promises.inputsFor('computePlan')).toEqual([{ checkoutId: 'checkout-1', target: 'rev-3' }]);

    promises.settle('computePlan', { output: plan });
    await flush();

    expect(actor.getSnapshot().matches('applying')).toBe(true);
    expect(promises.inputsFor('applyPlan')).toEqual([{ checkoutId: 'checkout-1', planId: 'plan-1' }]);

    actor.stop();
  });

  it('mints the applied tree as a restore revision and never detaches (T1)', async () => {
    const harness = start();
    const { actor, parent, emitted } = harness;

    await applyRestore(harness);

    expect(actor.getSnapshot().matches('minting')).toBe(true);
    expect(cutsAsked(parent).at(-1)).toEqual({
      type: 'cut',
      trigger: 'restore',
      checkoutId: 'checkout-1',
      leaseIds: [],
      requestId: lastRequestId(parent),
      restoredFrom: 'rev-3',
    });

    actor.send({ type: 'revisionMinted', ...ours(harness), revisionId: 'rev-6' });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(actor.getSnapshot().context.restoredRevisionId).toBe('rev-6');
    expect(emitted.find((event) => event.type === 'toast.restored')).toEqual({
      type: 'toast.restored',
      revisionNumber: 3,
    });
    /* The checkout's own mint moved its head; nothing names a detached one. */
    expect(types(parent.events)).not.toContain('checkoutChanged');
    expect(types(emitted)).not.toContain('checkoutChanged');

    actor.stop();
  });

  it('mints nothing, says nothing and offers no undo for a restore to the tree the checkout already has (A8)', async () => {
    const harness = start();
    const { actor, emitted } = harness;

    await applyRestore(harness);
    actor.send({ type: 'nothingToSave', ...ours(harness) });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(actor.getSnapshot().context.restoredRevisionId).toBeUndefined();
    expect(types(emitted)).not.toContain('toast.restored');

    actor.stop();
  });

  it('asks before a plan that removes files, then applies on confirm', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    mintBefore(harness);
    promises.settle('computePlan', { output: { ...plan, removedPathCount: 2 } });
    await flush();

    expect(actor.getSnapshot().matches('confirming')).toBe(true);

    actor.send({ type: 'confirm' });

    expect(actor.getSnapshot().matches('applying')).toBe(true);

    actor.stop();
  });

  it('asks when the tree is dirty even if nothing is removed', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    mintBefore(harness);
    promises.settle('computePlan', { output: { ...plan, dirty: true } });
    await flush();

    expect(actor.getSnapshot().matches('confirming')).toBe(true);

    actor.stop();
  });

  it('cancels without applying', async () => {
    const harness = start();
    const { actor, promises } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    mintBefore(harness);
    promises.settle('computePlan', { output: { ...plan, removedPathCount: 1 } });
    await flush();
    actor.send({ type: 'cancel' });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(promises.inputsFor('applyPlan')).toEqual([]);
    expect(actor.getSnapshot().context.planId).toBeUndefined();

    actor.stop();
  });

  it('refuses undo until a restore has minted, then plans that revision’s first parent (D2)', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'undo' });
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(cutsAsked(parent)).toEqual([]);

    await applyRestore(harness);
    actor.send({ type: 'revisionMinted', ...ours(harness), revisionId: 'rev-6' });
    actor.send({ type: 'undo' });
    mintBefore(harness);

    expect(promises.inputsFor('computePlan')[1]).toEqual({
      checkoutId: 'checkout-1',
      target: 'rev-6',
      firstParent: true,
    });

    actor.stop();
  });

  it('refuses Undo once the selection has left the checkout the restore minted on, even mid-restore (M1, P1)', async () => {
    const harness = start();
    const { actor, promises, parent, emitted } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    /* *Follow chat* re-roots while the restore is running; A6 keeps the restore on checkout-1. */
    actor.send({ type: 'selectCheckout', checkoutId: 'checkout-b', branch: 'b' });
    mintBefore(harness);
    promises.settle('computePlan', { output: plan });
    await flush();
    promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3' } });
    await flush();
    actor.send({ type: 'revisionMinted', ...ours(harness), revisionId: 'rev-6' });
    const cutsBefore = cutsAsked(parent).length;

    actor.send({ type: 'undo' });

    /* The earlier tree of checkout-1 is never planned onto checkout-b, and the refusal is said. */
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(cutsAsked(parent)).toHaveLength(cutsBefore);
    expect(promises.inputsFor('computePlan')).toHaveLength(1);
    expect(emitted.at(-1)).toMatchObject({ type: 'toast.error', code: 'UNDO_UNAVAILABLE' });

    actor.stop();
  });

  it('refuses Undo when the checkout it restored has moved to another branch under the same id (M1)', async () => {
    const harness = start();
    const { actor, promises, parent, emitted } = harness;

    await applyRestore(harness);
    actor.send({ type: 'revisionMinted', ...ours(harness), revisionId: 'rev-6' });
    /* A head re-announce on the same line keeps Undo. */
    actor.send({ type: 'selectCheckout', checkoutId: 'checkout-1', branch: 'main' });
    expect(actor.getSnapshot().context.restoredRevisionId).toBe('rev-6');

    /* A live *Switch* main → feature keeps the checkout id. */
    actor.send({ type: 'selectCheckout', checkoutId: 'checkout-1', branch: 'feature' });
    const cutsBefore = cutsAsked(parent).length;
    actor.send({ type: 'undo' });

    expect(cutsAsked(parent)).toHaveLength(cutsBefore);
    expect(promises.inputsFor('computePlan')).toHaveLength(1);
    expect(emitted.at(-1)).toMatchObject({ type: 'toast.error', code: 'UNDO_UNAVAILABLE' });

    actor.stop();
  });

  it('takes no answer to a cut it stopped waiting for, so a late one never starts the next restore (N2)', () => {
    const harness = start();
    const { actor, clock, promises } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    const late = ours(harness);
    clock.advance(restoreCutMilliseconds);
    expect(actor.getSnapshot().matches('idle')).toBe(true);

    actor.send({ type: 'restore', revisionId: 'rev-2' });
    expect(lastRequestId(harness.parent)).not.toBe(late.requestId);
    actor.send({ type: 'nothingToSave', ...late });

    expect(actor.getSnapshot().matches('recording')).toBe(true);
    expect(promises.inputsFor('computePlan')).toEqual([]);

    mintBefore(harness);
    expect(promises.inputsFor('computePlan')).toEqual([{ checkoutId: 'checkout-1', target: 'rev-2' }]);

    actor.stop();
  });

  it('applies nothing when the pre-restore cut is refused', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    actor.send({ type: 'cutFailed', ...ours(harness), reason: 'An agent is working in this project’s files.' });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(promises.inputsFor('computePlan')).toEqual([]);
    expect(emitted.find((event) => event.type === 'toast.error')).toMatchObject({
      message: 'An agent is working in this project’s files.',
    });

    actor.stop();
  });

  it('applies nothing when the pre-restore cut loses its CAS, and says so in CAS_LOST’s words (A7)', () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    actor.send({ type: 'casLost', ...ours(harness) });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(promises.inputsFor('computePlan')).toEqual([]);
    expect(emitted.find((event) => event.type === 'toast.error')).toEqual({
      type: 'toast.error',
      message: 'Something else changed this project first. Try again.',
      code: 'CAS_LOST',
    });

    actor.stop();
  });

  it('says the files are back but unrecorded when the restore cut loses its CAS (N1)', async () => {
    const harness = start();
    const { actor, emitted } = harness;

    await applyRestore(harness);
    actor.send({ type: 'casLost', ...ours(harness) });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(actor.getSnapshot().context.restoredRevisionId).toBeUndefined();
    /* Not CAS_LOST's "Try again": the files are already restored (A7, N1). */
    expect(emitted.find((event) => event.type === 'toast.error')).toMatchObject({ code: 'RESTORE_UNRECORDED' });

    actor.stop();
  });

  it('ignores answers that are not its own cut', () => {
    const harness = start();
    const { actor } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    actor.send({ type: 'nothingToSave', checkoutId: 'checkout-1', trigger: 'save' });
    actor.send({ type: 'nothingToSave', checkoutId: 'checkout-2', trigger: 'restore' });
    actor.send({ type: 'nothingToSave', checkoutId: 'checkout-1', trigger: 'restore', turnId: 'turn-1' });

    expect(actor.getSnapshot().matches('recording')).toBe(true);

    actor.stop();
  });

  it('reports a planning failure as a toast and returns to idle', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    mintBefore(harness);
    promises.settle('computePlan', { error: new Error('unknown revision') });
    await flush();

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(emitted.find((event) => event.type === 'toast.error')).toMatchObject({ message: 'unknown revision' });

    actor.stop();
  });

  it('reports an apply failure as a toast and returns to idle', async () => {
    const harness = start();
    const { actor, promises, emitted } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    mintBefore(harness);
    promises.settle('computePlan', { output: plan });
    await flush();
    promises.settle('applyPlan', { error: new Error('write failed') });
    await flush();

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(types(emitted)).toContain('toast.error');

    actor.stop();
  });

  it('stays on the checkout it planned against when the root re-roots mid-restore (A6)', async () => {
    const harness = start();
    const { actor, promises, parent } = harness;

    actor.send({ type: 'restore', revisionId: 'rev-3' });
    actor.send({ type: 'selectCheckout', checkoutId: 'checkout-b' });
    mintBefore(harness);
    promises.settle('computePlan', { output: plan });
    await flush();
    promises.settle('applyPlan', { output: { revisionId: 'rev-3', treeId: 'tree-3' } });
    await flush();

    expect(promises.inputsFor('computePlan')).toEqual([{ checkoutId: 'checkout-1', target: 'rev-3' }]);
    expect(promises.inputsFor('applyPlan')).toEqual([{ checkoutId: 'checkout-1', planId: 'plan-1' }]);
    expect(cutsAsked(parent)).toMatchObject([{ checkoutId: 'checkout-1' }, { checkoutId: 'checkout-1' }]);

    actor.send({ type: 'revisionMinted', ...ours(harness), revisionId: 'rev-6' });
    actor.send({ type: 'restore', revisionId: 'rev-2' });

    expect(cutsAsked(parent).at(-1)).toMatchObject({ checkoutId: 'checkout-b' });

    actor.stop();
  });

  it('applies to whatever checkout the root selected', () => {
    const harness = start();
    const { actor, parent } = harness;

    actor.send({ type: 'selectCheckout', checkoutId: 'checkout-b' });
    actor.send({ type: 'restore', revisionId: 'rev-3' });

    expect(cutsAsked(parent)).toEqual([
      { type: 'cut', trigger: 'restore', checkoutId: 'checkout-b', leaseIds: [], requestId: lastRequestId(parent) },
    ]);

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
