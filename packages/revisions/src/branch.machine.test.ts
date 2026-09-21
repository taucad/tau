import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#branch.machine.js';
import { branchMachine, branchRegistryMilliseconds, selectBranchFacet } from '#branch.machine.js';
import { createFakeParent, createFakePromiseActors, createManualClock, recordEmitted } from '#test/fake-actors.js';
import type { FakePromiseActors, ManualClock } from '#test/fake-actors.js';

/*
 * Path table — `branch.machine` (S47).
 *
 *  1  `switch` checks, then applies without asking, and the checkout change is
 *     both emitted and sent to the parent
 *  2  a `switch` the check calls risky asks first; `confirm` applies it
 *  3  `cancel` returns to `idle` and applies nothing
 *  4  `checkBranch` failure → `failed` → `toast.error` → `idle`
 *  5  `applySwitch` failure → `failed` → `toast.error` → `idle`
 *  6  `create` delegates `addCheckout` to the parent and settles on the
 *     registry's own `branchesChanged`
 *  7  `create` settles on `operationFailed` with the registry's reason
 *  8  `create` that is never answered fails on the bound (manual clock)
 *  9  `discard` asks first, delegates `removeCheckout`, and settles when the
 *     branch leaves the registry
 * 10  `discard` refused by the registry → `failed` with its reason
 * 11  `merge` that settles emits `branchMerged`
 * 12  `merge` that conflicts emits `mergeConflicted` with the paths and keeps
 *     both branches (no `checkoutChanged`)
 * 13  `merge` failure → `failed`
 * 14  `rename` applies and reports the new name
 * 15  `rename` failure → `failed`
 * 16  `selectBranch` moves the branch a merge lands on
 * 17  a second verb while one is in flight is ignored
 * 18  with no host check provided, a verb still reaches its effect
 * 19  `create` with no base records the selected tree first and branches from
 *     the revision that cut minted (P3)
 * 20  `create` with nothing to record branches from the selected head, and is
 *     refused `BRANCH_NEEDS_REVISION` when there is no head either (P3)
 * 21  a refusal carries the port's code out on `toast.error` (P4)
 * 22  `toast.branch` for a `create` names the checkout the registry made
 * 23  a recording cut that failed carries its own code out
 * 24  a recording cut the head moved under is `CAS_LOST`
 * --  start and stop with no child left running, serializable snapshot, no
 *     function in context, one exported machine value
 */

/** Let every queued microtask and the actor's promise handlers run. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof branchMachine>>;
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
    branchMachine.provide({
      actors: {
        checkBranch: promises.actor('checkBranch'),
        applySwitch: promises.actor('applySwitch'),
        merge: promises.actor('merge'),
        rename: promises.actor('rename'),
      },
    }),
    {
      input: { projectId: 'project-1', currentBranch: 'main', parentRef: parent.ref },
      clock,
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, parent, emitted, clock };
};

const cleanCheck = { output: { needsConfirmation: false } } as const;
const riskyCheck = {
  output: { needsConfirmation: true, question: 'This overwrites changes that are not in a revision yet.' },
} as const;
const switched = {
  output: { checkoutId: 'live', revisionId: 'rev-9', treeId: 'tree-9', branch: 'bracket-fillet' },
} as const;

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

describe('branchMachine', () => {
  it('applies a switch the check clears, and tells the parent the checkout moved', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('applySwitch', switched);

    actor.send({ type: 'switch', branch: 'bracket-fillet', mode: 'applyToLive' });
    expect(actor.getSnapshot().matches('checking')).toBe(true);
    await flush();

    expect(promises.inputsFor('checkBranch')).toEqual([
      { projectId: 'project-1', operation: 'switch', branch: 'bracket-fillet', into: 'main' },
    ]);
    expect(promises.inputsFor('applySwitch')).toEqual([
      { projectId: 'project-1', branch: 'bracket-fillet', checkoutId: undefined },
    ]);
    expect(types(emitted)).toEqual(['checkoutChanged', 'toast.branch']);
    expect(parent.events).toContainEqual({
      type: 'checkoutChanged',
      checkoutId: 'live',
      revisionId: 'rev-9',
      treeId: 'tree-9',
      branch: 'bracket-fillet',
    });
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
    parent.stop();
  });

  it('asks before a risky switch and applies it on confirm', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', riskyCheck);
    promises.script('applySwitch', switched);

    actor.send({ type: 'switch', branch: 'bracket-fillet' });
    await flush();

    expect(actor.getSnapshot().matches('confirming')).toBe(true);
    expect(selectBranchFacet(actor.getSnapshot())).toEqual({
      busy: false,
      asking: true,
      operation: 'switch',
      branch: 'bracket-fillet',
      question: 'This overwrites changes that are not in a revision yet.',
    });
    expect(promises.inputsFor('applySwitch')).toEqual([]);

    actor.send({ type: 'confirm' });
    await flush();
    expect(types(emitted)).toContain('checkoutChanged');
    actor.stop();
  });

  it('applies nothing when the confirmation is cancelled', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', riskyCheck);

    actor.send({ type: 'switch', branch: 'bracket-fillet' });
    await flush();
    actor.send({ type: 'cancel' });

    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(actor.getSnapshot().context.operation).toBeUndefined();
    expect(promises.inputsFor('applySwitch')).toEqual([]);
    expect(emitted).toEqual([]);
    actor.stop();
  });

  it('fails with the check error and returns to idle', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', { error: new Error('That branch has no revisions yet.') });

    actor.send({ type: 'switch', branch: 'ghost' });
    await flush();

    expect(emitted).toEqual([
      { type: 'toast.error', operation: 'switch', branch: 'ghost', message: 'That branch has no revisions yet.' },
    ]);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
  });

  it('fails with the apply error and returns to idle', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('applySwitch', { error: new Error('The store holds no tree for that revision.') });

    actor.send({ type: 'switch', branch: 'bracket-fillet' });
    await flush();

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        operation: 'switch',
        branch: 'bracket-fillet',
        message: 'The store holds no tree for that revision.',
      },
    ]);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
  });

  it('creates a branch by asking the registry through the parent', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'enclosure-v2', from: 'rev-12' });
    await flush();

    /* A caller that named a base has already chosen one, so nothing is cut (P3). */
    expect(parent.events).toContainEqual({ type: 'addCheckout', branch: 'enclosure-v2', from: 'rev-12' });
    expect(types(parent.events)).not.toContain('cut');
    expect(actor.getSnapshot().matches({ applying: { creating: 'adding' } })).toBe(true);

    actor.send({ type: 'branchesChanged', branches: ['main', 'enclosure-v2'] });
    expect(emitted).toEqual([{ type: 'toast.branch', operation: 'create', branch: 'enclosure-v2' }]);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
    parent.stop();
  });

  it('reports the registry reason when a create is refused', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    /* With a base named the verb goes straight to the registry; without one it
     * records the selected tree first, which rows 19-20 cover. */
    actor.send({ type: 'create', name: 'main', from: 'rev-12' });
    await flush();
    actor.send({ type: 'operationFailed', reason: 'That branch already has a checkout.' });

    expect(emitted).toEqual([
      { type: 'toast.error', operation: 'create', branch: 'main', message: 'That branch already has a checkout.' },
    ]);
    actor.stop();
  });

  it('records the selected tree before adding, and branches from what it minted', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();

    /* The checkout is the sole minter (F2), so the verb asks the root to cut
     * and nothing reaches the registry until that answers. */
    expect(parent.events).toContainEqual({
      type: 'cut',
      trigger: 'switch',
      checkoutId: 'checkout-live',
      leaseIds: [],
    });
    expect(types(parent.events)).not.toContain('addCheckout');
    expect(actor.getSnapshot().matches({ applying: { creating: 'recording' } })).toBe(true);

    actor.send({ type: 'revisionMinted', checkoutId: 'checkout-live', trigger: 'switch', revisionId: 'rev-2' });

    expect(parent.events).toContainEqual({ type: 'addCheckout', branch: 'isolated-run', from: 'rev-2' });
    actor.send({ type: 'branchesChanged', branches: ['main', 'isolated-run'] });
    expect(emitted).toEqual([{ type: 'toast.branch', operation: 'create', branch: 'isolated-run' }]);
    actor.stop();
    parent.stop();
  });

  it('branches from the head when the selected tree has nothing to record', async () => {
    const { actor, promises, parent } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'isolated-run', checkoutId: 'checkout-live', head: 'rev-1' });
    await flush();
    actor.send({ type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'switch' });

    expect(parent.events).toContainEqual({ type: 'addCheckout', branch: 'isolated-run', from: 'rev-1' });
    actor.stop();
    parent.stop();
  });

  it('refuses a branch when there is no head and nothing to record', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();
    actor.send({ type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'switch' });

    expect(types(parent.events)).not.toContain('addCheckout');
    expect(emitted).toEqual([
      {
        type: 'toast.error',
        operation: 'create',
        branch: 'isolated-run',
        message: 'This project has nothing to branch from yet.',
        code: 'BRANCH_NEEDS_REVISION',
      },
    ]);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
    parent.stop();
  });

  it('carries the port code out with the refusal it came from', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'main', from: 'rev-12' });
    await flush();
    actor.send({
      type: 'operationFailed',
      reason: 'That branch already has a checkout.',
      code: 'CHECKOUT_CONFLICT',
    });

    /* P4: the page turns the code into words; the sentence here is a diagnostic. */
    expect(emitted).toEqual([
      {
        type: 'toast.error',
        operation: 'create',
        branch: 'main',
        message: 'That branch already has a checkout.',
        code: 'CHECKOUT_CONFLICT',
      },
    ]);
    actor.stop();
  });

  /*
   * Rows 23-24: `recording`'s two failure edges carried no code, so the page
   * fell back to "Tau could not finish that branch change" for a cut that
   * named exactly why it did not happen (review finding 11).
   */
  it('carries a failed recording cut out with its own code', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();
    actor.send({
      type: 'cutFailed',
      checkoutId: 'checkout-live',
      trigger: 'switch',
      reason: 'This project has no files open to record.',
      code: 'CHECKOUT_CONFLICT',
    });

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        operation: 'create',
        branch: 'isolated-run',
        message: 'This project has no files open to record.',
        code: 'CHECKOUT_CONFLICT',
      },
    ]);
    actor.stop();
  });

  it('names a contended recording cut CAS_LOST', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();
    actor.send({ type: 'casLost', checkoutId: 'checkout-live', trigger: 'switch' });

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        operation: 'create',
        branch: 'isolated-run',
        message: 'Something else changed this project first. Try again.',
        code: 'CAS_LOST',
      },
    ]);
    actor.stop();
  });

  it('names the checkout the registry made when a create settles', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'enclosure-v2', from: 'rev-12' });
    await flush();
    actor.send({
      type: 'branchesChanged',
      branches: ['main', 'enclosure-v2'],
      checkouts: [
        { branch: 'main', checkoutId: 'checkout-live', checkoutRoot: '/projects/project-1' },
        { branch: 'enclosure-v2', checkoutId: 'checkout-c', checkoutRoot: '/checkouts/checkout-c' },
      ],
    });

    expect(emitted).toEqual([
      {
        type: 'toast.branch',
        operation: 'create',
        branch: 'enclosure-v2',
        checkoutId: 'checkout-c',
        checkoutRoot: '/checkouts/checkout-c',
      },
    ]);
    actor.stop();
    parent.stop();
  });

  it('fails a create the registry never answers, on the bound', async () => {
    const { actor, promises, emitted, clock } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', name: 'enclosure-v2' });
    await flush();
    expect(emitted).toEqual([]);

    clock.advance(branchRegistryMilliseconds);

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        operation: 'create',
        branch: 'enclosure-v2',
        message: 'This project did not answer in time.',
      },
    ]);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
  });

  it('asks before a discard, then removes the checkout through the registry', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', {
      output: { needsConfirmation: true, question: 'Discarding this branch deletes its files.', checkoutId: 'co-2' },
    });

    actor.send({ type: 'discard', branch: 'bracket-fillet' });
    await flush();
    expect(actor.getSnapshot().matches('confirming')).toBe(true);

    actor.send({ type: 'confirm' });
    expect(parent.events).toContainEqual({ type: 'removeCheckout', id: 'co-2' });

    actor.send({ type: 'branchesChanged', branches: ['main'] });
    expect(emitted).toEqual([{ type: 'toast.branch', operation: 'discard', branch: 'bracket-fillet' }]);
    actor.stop();
    parent.stop();
  });

  it('reports the registry reason when a discard is refused', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', { output: { needsConfirmation: false, checkoutId: 'co-2' } });

    actor.send({ type: 'discard', branch: 'bracket-fillet' });
    await flush();
    actor.send({ type: 'operationFailed', reason: 'An agent is working in feature.' });

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        operation: 'discard',
        branch: 'bracket-fillet',
        message: 'An agent is working in feature.',
      },
    ]);
    actor.stop();
  });

  it('emits branchMerged when a merge settles', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('merge', { output: { status: 'merged', revisionId: 'rev-13' } });

    actor.send({ type: 'merge', branch: 'bracket-fillet' });
    await flush();

    expect(promises.inputsFor('merge')).toEqual([{ projectId: 'project-1', branch: 'bracket-fillet', into: 'main' }]);
    expect(emitted).toEqual([
      { type: 'branchMerged', branch: 'bracket-fillet', into: 'main', revisionId: 'rev-13' },
      { type: 'toast.branch', operation: 'merge', branch: 'bracket-fillet' },
    ]);
    expect(parent.events).toContainEqual({
      type: 'branchMerged',
      branch: 'bracket-fillet',
      into: 'main',
      revisionId: 'rev-13',
    });
    actor.stop();
    parent.stop();
  });

  it('emits mergeConflicted with the paths and moves no checkout', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('merge', { output: { status: 'conflicted', paths: ['bracket.scad'] } });

    actor.send({ type: 'merge', branch: 'bracket-fillet' });
    await flush();

    expect(emitted).toEqual([
      { type: 'mergeConflicted', branch: 'bracket-fillet', into: 'main', paths: ['bracket.scad'] },
    ]);
    expect(types(emitted)).not.toContain('checkoutChanged');
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
  });

  it('fails with the merge error', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('merge', { error: new Error('This project cannot merge yet.') });

    actor.send({ type: 'merge', branch: 'bracket-fillet' });
    await flush();

    expect(emitted).toEqual([
      { type: 'toast.error', operation: 'merge', branch: 'bracket-fillet', message: 'This project cannot merge yet.' },
    ]);
    actor.stop();
  });

  it('renames a branch and reports the name the host wrote', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('rename', { output: { branch: 'bracket-fillet-r3' } });

    actor.send({ type: 'rename', branch: 'bracket-fillet', name: 'bracket-fillet-r3' });
    await flush();

    expect(promises.inputsFor('rename')).toEqual([
      { projectId: 'project-1', branch: 'bracket-fillet', name: 'bracket-fillet-r3' },
    ]);
    expect(emitted).toEqual([{ type: 'toast.branch', operation: 'rename', branch: 'bracket-fillet-r3' }]);
    actor.stop();
  });

  it('fails with the rename error', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('rename', { error: new Error('That name is already taken.') });

    actor.send({ type: 'rename', branch: 'bracket-fillet', name: 'main' });
    await flush();

    expect(emitted).toEqual([
      { type: 'toast.error', operation: 'rename', branch: 'bracket-fillet', message: 'That name is already taken.' },
    ]);
    actor.stop();
  });

  it('merges into whatever branch the workbench moved to', async () => {
    const { actor, promises } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('merge', { output: { status: 'merged', revisionId: 'rev-13' } });

    actor.send({ type: 'selectBranch', branch: 'release' });
    actor.send({ type: 'merge', branch: 'bracket-fillet' });
    await flush();

    expect(promises.inputsFor('merge')).toEqual([
      { projectId: 'project-1', branch: 'bracket-fillet', into: 'release' },
    ]);
    actor.stop();
  });

  it('ignores a second verb while one is in flight', async () => {
    const { actor, promises } = start();

    actor.send({ type: 'switch', branch: 'bracket-fillet' });
    actor.send({ type: 'merge', branch: 'enclosure-v2' });
    await flush();

    expect(promises.inputsFor('checkBranch')).toEqual([
      { projectId: 'project-1', operation: 'switch', branch: 'bracket-fillet', into: 'main' },
    ]);
    actor.stop();
  });

  it('still reaches the registry when no host check is provided', async () => {
    const parent = createFakeParent();
    const actor = createActor(branchMachine, { input: { projectId: 'project-1', parentRef: parent.ref } });
    actor.start();

    actor.send({ type: 'create', name: 'enclosure-v2', from: 'rev-12' });
    await flush();

    /* With a base named the effect is still the registry verb; a base-less
     * create now records first, which rows 19-20 cover. */
    expect(parent.events).toContainEqual({ type: 'addCheckout', branch: 'enclosure-v2', from: 'rev-12' });
    actor.stop();
    parent.stop();
  });

  it('starts headlessly, keeps a serializable snapshot and exports one machine value', () => {
    const { actor } = start();

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches('idle')).toBe(true);
    expect(Object.keys(snapshot.children)).toEqual([]);
    const contextValues: readonly unknown[] = Object.values(snapshot.context);
    expect(contextValues.filter((value) => typeof value === 'function')).toEqual([]);
    expect(() => JSON.stringify(snapshot.context.conflicts)).not.toThrow();
    const exported: readonly unknown[] = Object.values(machineModule);
    expect(
      exported.filter(
        (value) =>
          typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value,
      ),
    ).toEqual([branchMachine]);

    actor.stop();
    expect(actor.getSnapshot().status).toBe('stopped');
  });
});
