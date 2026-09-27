import { createActor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#branch.machine.js';
import { branchMachine, selectBranchFacet } from '#branch.machine.js';
import type { BranchMachineEvent } from '#branch.machine.js';
import { RevisionPortError } from '#revision-port.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createFakeParent, createFakePromiseActors, recordEmitted } from '@taucad/xstate-testing/fakes';
import type { FakePromiseActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

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
 *     registry's `checkoutAdded` for its own request id
 *  7  `create` settles on `operationFailed` with the registry's reason
 *  8  `create` waits for the registry however long it is busy, with no bound (RM-S8)
 *  9  `discard` asks first, delegates `removeCheckout`, and settles on the
 *     registry's `checkoutRemoved` for its own request id
 * 10  `discard` refused by the registry → `failed` with its reason
 * 11  `merge` that settles emits `branchMerged`
 * 12  `merge` that conflicts emits `mergeConflicted` with the paths and keeps
 *     both branches (no `checkoutChanged`)
 * 13  `merge` failure → `failed`
 * 14  `rename` applies and reports the new name
 * 15  `rename` failure → `failed`
 * 16  `selectBranch` moves the branch a merge lands on
 * 17  a second verb while one is in flight is refused `REVISIONS_BUSY` by its id (RM-R11)
 * 18  with no host check provided, a verb still reaches its effect
 * 19  `create` with no base records the selected tree first and branches from
 *     the revision that cut minted (P3)
 * 20  `create` with nothing to record branches from the selected head, and is
 *     refused `BRANCH_NEEDS_REVISION` when there is no head either (P3)
 * 21  a refusal carries the port's code out on `toast.error` (P4)
 * 22  `toast.branch` for a `create` names the checkout the registry made
 * 23  a recording cut that failed carries its own code out
 * 24  a recording cut the head moved under is `CAS_LOST`
 * 25  an ambient cut's answer does not settle a recording `create`
 * 26  a `checkBranch` refusal carries its code out, as an applied verb does
 * 27  a rename that moved a checkout's HEAD sends `checkoutChanged` for it (RM-R5)
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
  clock: StepClock;
}>;

const start = (): Harness => {
  const guard = guardActors();
  const promises = createFakePromiseActors();
  const parent = createFakeParent();
  const clock = new StepClock();
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
      inspect: guard.inspect,
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

    actor.send({ type: 'switch', requestId: 'req-1', branch: 'bracket-fillet', mode: 'applyToLive' });
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

    actor.send({ type: 'switch', requestId: 'req-1', branch: 'bracket-fillet' });
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

    actor.send({ type: 'switch', requestId: 'req-1', branch: 'bracket-fillet' });
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

    actor.send({ type: 'switch', requestId: 'req-1', branch: 'ghost' });
    await flush();

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
        operation: 'switch',
        branch: 'ghost',
        message: 'That branch has no revisions yet.',
      },
    ]);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
  });

  it('fails with the apply error and returns to idle', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('applySwitch', { error: new Error('The store holds no tree for that revision.') });

    actor.send({ type: 'switch', requestId: 'req-1', branch: 'bracket-fillet' });
    await flush();

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
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

    actor.send({ type: 'create', requestId: 'req-1', name: 'enclosure-v2', from: 'rev-12' });
    await flush();

    /* A caller that named a base has already chosen one, so nothing is cut (P3). */
    expect(parent.events).toContainEqual({
      type: 'addCheckout',
      requestId: 'req-1/add',
      branch: 'enclosure-v2',
      from: 'rev-12',
    });
    expect(types(parent.events)).not.toContain('cut');
    expect(actor.getSnapshot().matches({ applying: { creating: 'adding' } })).toBe(true);

    actor.send({
      type: 'checkoutAdded',
      requestId: 'req-1/add',
      checkoutId: 'checkout-c',
      checkoutRoot: '/checkouts/checkout-c',
    });
    expect(emitted).toEqual([
      {
        type: 'toast.branch',
        requestId: 'req-1',
        operation: 'create',
        branch: 'enclosure-v2',
        checkoutId: 'checkout-c',
        checkoutRoot: '/checkouts/checkout-c',
      },
    ]);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
    parent.stop();
  });

  it('reports the registry reason when a create is refused', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    /* With a base named the verb goes straight to the registry; without one it
     * records the selected tree first, which rows 19-20 cover. */
    actor.send({ type: 'create', requestId: 'req-1', name: 'main', from: 'rev-12' });
    await flush();
    actor.send({ type: 'operationFailed', requestId: 'req-1/add', reason: 'That branch already has a checkout.' });

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
        operation: 'create',
        branch: 'main',
        message: 'That branch already has a checkout.',
      },
    ]);
    actor.stop();
  });

  it('records the selected tree before adding, and branches from what it minted', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', requestId: 'req-1', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();

    /* The checkout is the sole minter (F2), so the verb asks the root to cut
     * and nothing reaches the registry until that answers. */
    expect(parent.events).toContainEqual({
      type: 'cut',
      requestId: 'req-1/cut',
      trigger: 'switch',
      checkoutId: 'checkout-live',
      leaseIds: [],
    });
    expect(types(parent.events)).not.toContain('addCheckout');
    expect(actor.getSnapshot().matches({ applying: { creating: 'recording' } })).toBe(true);

    actor.send({
      type: 'revisionMinted',
      checkoutId: 'checkout-live',
      trigger: 'switch',
      requestId: 'req-1/cut',
      revisionId: 'rev-2',
    });

    expect(parent.events).toContainEqual({
      type: 'addCheckout',
      requestId: 'req-1/add',
      branch: 'isolated-run',
      from: 'rev-2',
    });
    actor.send({
      type: 'checkoutAdded',
      requestId: 'req-1/add',
      checkoutId: 'checkout-d',
      checkoutRoot: '/checkouts/checkout-d',
    });
    expect(types(emitted)).toEqual(['toast.branch']);
    actor.stop();
    parent.stop();
  });

  it('branches from the head when the selected tree has nothing to record', async () => {
    const { actor, promises, parent } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({
      type: 'create',
      requestId: 'req-1',
      name: 'isolated-run',
      checkoutId: 'checkout-live',
      head: 'rev-1',
    });
    await flush();
    actor.send({ type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'switch', requestId: 'req-1/cut' });

    expect(parent.events).toContainEqual({
      type: 'addCheckout',
      requestId: 'req-1/add',
      branch: 'isolated-run',
      from: 'rev-1',
    });
    actor.stop();
    parent.stop();
  });

  it('refuses a branch when there is no head and nothing to record', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', requestId: 'req-1', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();
    actor.send({ type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'switch', requestId: 'req-1/cut' });

    expect(types(parent.events)).not.toContain('addCheckout');
    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
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

    actor.send({ type: 'create', requestId: 'req-1', name: 'main', from: 'rev-12' });
    await flush();
    actor.send({
      type: 'operationFailed',
      requestId: 'req-1/add',
      reason: 'That branch already has a checkout.',
      code: 'CHECKOUT_CONFLICT',
    });

    /* P4: the page turns the code into words; the sentence here is a diagnostic. */
    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
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

    actor.send({ type: 'create', requestId: 'req-1', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();
    actor.send({
      type: 'cutFailed',
      checkoutId: 'checkout-live',
      trigger: 'switch',
      requestId: 'req-1/cut',
      reason: 'This project has no files open to record.',
      code: 'CHECKOUT_CONFLICT',
    });

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
        operation: 'create',
        branch: 'isolated-run',
        message: 'This project has no files open to record.',
        code: 'CHECKOUT_CONFLICT',
      },
    ]);
    actor.stop();
  });

  /*
   * An ambient cut — `save`, `idle`, `hidden`, `close` — carries no turn id
   * either, so the checkout match alone let somebody else's revision settle the
   * branch this verb is still recording for.
   */
  it('ignores an ambient cut answer while recording, and settles on the switch it asked for', async () => {
    const { actor, promises, parent } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', requestId: 'req-1', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();
    actor.send({ type: 'revisionMinted', checkoutId: 'checkout-live', trigger: 'save', revisionId: 'rev-save' });

    expect(actor.getSnapshot().matches({ applying: { creating: 'recording' } })).toBe(true);
    expect(types(parent.events)).not.toContain('addCheckout');

    actor.send({
      type: 'revisionMinted',
      checkoutId: 'checkout-live',
      trigger: 'switch',
      requestId: 'req-1/cut',
      revisionId: 'rev-2',
    });

    expect(parent.events).toContainEqual({
      type: 'addCheckout',
      requestId: 'req-1/add',
      branch: 'isolated-run',
      from: 'rev-2',
    });
    actor.stop();
    parent.stop();
  });

  it('carries the check refusal code out, the way an applied verb does', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', {
      error: new RevisionPortError('ENGINE_UNAVAILABLE', 'This project could not be reached.'),
    });

    actor.send({ type: 'switch', requestId: 'req-1', branch: 'bracket-fillet' });
    await flush();

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
        operation: 'switch',
        branch: 'bracket-fillet',
        message: 'This project could not be reached.',
        code: 'ENGINE_UNAVAILABLE',
      },
    ]);
    actor.stop();
  });

  it('names a contended recording cut CAS_LOST', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', requestId: 'req-1', name: 'isolated-run', checkoutId: 'checkout-live' });
    await flush();
    actor.send({ type: 'casLost', checkoutId: 'checkout-live', trigger: 'switch', requestId: 'req-1/cut' });

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
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

    actor.send({ type: 'create', requestId: 'req-1', name: 'enclosure-v2', from: 'rev-12' });
    await flush();
    /* An answer to another request is not this verb's (RM-R1). */
    actor.send({
      type: 'checkoutAdded',
      requestId: 'req-0/add',
      checkoutId: 'checkout-x',
      checkoutRoot: '/checkouts/x',
    });
    expect(emitted).toEqual([]);
    actor.send({
      type: 'checkoutAdded',
      requestId: 'req-1/add',
      checkoutId: 'checkout-c',
      checkoutRoot: '/checkouts/checkout-c',
    });

    expect(emitted).toEqual([
      {
        type: 'toast.branch',
        requestId: 'req-1',
        operation: 'create',
        branch: 'enclosure-v2',
        checkoutId: 'checkout-c',
        checkoutRoot: '/checkouts/checkout-c',
      },
    ]);
    actor.stop();
    parent.stop();
  });

  /* RM-S8: the registry answers by id whenever it gets to the add, so no bound fails a slow one. */
  it('should answer a create that arrives while the registry is busy', async () => {
    const { actor, promises, parent, emitted, clock } = start();
    promises.script('checkBranch', cleanCheck);

    actor.send({ type: 'create', requestId: 'req-1', name: 'enclosure-v2', from: 'rev-12' });
    await flush();
    /* Twice the deleted 30 s registry bound. */
    clock.advance(60_000);
    expect(emitted).toEqual([]);
    expect(actor.getSnapshot().matches({ applying: { creating: 'adding' } })).toBe(true);

    actor.send({
      type: 'checkoutAdded',
      requestId: 'req-1/add',
      checkoutId: 'checkout-c',
      checkoutRoot: '/checkouts/checkout-c',
    });

    expect(types(emitted)).toEqual(['toast.branch']);
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
    parent.stop();
  });

  it('asks before a discard, then removes the checkout through the registry', async () => {
    const { actor, promises, parent, emitted } = start();
    promises.script('checkBranch', {
      output: { needsConfirmation: true, question: 'Discarding this branch deletes its files.', checkoutId: 'co-2' },
    });

    actor.send({ type: 'discard', requestId: 'req-1', branch: 'bracket-fillet' });
    await flush();
    expect(actor.getSnapshot().matches('confirming')).toBe(true);

    actor.send({ type: 'confirm' });
    expect(parent.events).toContainEqual({ type: 'removeCheckout', requestId: 'req-1/remove', id: 'co-2' });

    actor.send({ type: 'checkoutRemoved', requestId: 'req-1/remove' });
    expect(emitted).toEqual([
      { type: 'toast.branch', requestId: 'req-1', operation: 'discard', branch: 'bracket-fillet' },
    ]);
    actor.stop();
    parent.stop();
  });

  it('reports the registry reason when a discard is refused', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', { output: { needsConfirmation: false, checkoutId: 'co-2' } });

    actor.send({ type: 'discard', requestId: 'req-1', branch: 'bracket-fillet' });
    await flush();
    actor.send({ type: 'operationFailed', requestId: 'req-1/remove', reason: 'An agent is working in feature.' });

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
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

    actor.send({ type: 'merge', requestId: 'req-1', branch: 'bracket-fillet' });
    await flush();

    expect(promises.inputsFor('merge')).toEqual([{ projectId: 'project-1', branch: 'bracket-fillet', into: 'main' }]);
    expect(emitted).toEqual([
      { type: 'branchMerged', branch: 'bracket-fillet', into: 'main', revisionId: 'rev-13' },
      { type: 'toast.branch', requestId: 'req-1', operation: 'merge', branch: 'bracket-fillet' },
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

    actor.send({ type: 'merge', requestId: 'req-1', branch: 'bracket-fillet' });
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

    actor.send({ type: 'merge', requestId: 'req-1', branch: 'bracket-fillet' });
    await flush();

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
        operation: 'merge',
        branch: 'bracket-fillet',
        message: 'This project cannot merge yet.',
      },
    ]);
    actor.stop();
  });

  it('renames a branch and reports the name the host wrote', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('rename', { output: { branch: 'bracket-fillet-r3' } });

    actor.send({ type: 'rename', requestId: 'req-1', branch: 'bracket-fillet', name: 'bracket-fillet-r3' });
    await flush();

    expect(promises.inputsFor('rename')).toEqual([
      { projectId: 'project-1', branch: 'bracket-fillet', name: 'bracket-fillet-r3' },
    ]);
    expect(emitted).toEqual([
      { type: 'toast.branch', requestId: 'req-1', operation: 'rename', branch: 'bracket-fillet-r3' },
    ]);
    actor.stop();
  });

  it('fails with the rename error', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('rename', { error: new Error('That name is already taken.') });

    actor.send({ type: 'rename', requestId: 'req-1', branch: 'bracket-fillet', name: 'main' });
    await flush();

    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-1',
        operation: 'rename',
        branch: 'bracket-fillet',
        message: 'That name is already taken.',
      },
    ]);
    actor.stop();
  });

  it('merges into whatever branch the workbench moved to', async () => {
    const { actor, promises } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('merge', { output: { status: 'merged', revisionId: 'rev-13' } });

    actor.send({ type: 'selectBranch', branch: 'release' });
    actor.send({ type: 'merge', requestId: 'req-1', branch: 'bracket-fillet' });
    await flush();

    expect(promises.inputsFor('merge')).toEqual([
      { projectId: 'project-1', branch: 'bracket-fillet', into: 'release' },
    ]);
    actor.stop();
  });

  it('should refuse a verb while busy with REVISIONS_BUSY', async () => {
    const { actor, promises, emitted } = start();
    promises.script('checkBranch', riskyCheck);

    actor.send({ type: 'switch', requestId: 'req-1', branch: 'bracket-fillet' });
    actor.send({ type: 'merge', requestId: 'req-2', branch: 'enclosure-v2' });
    await flush();
    actor.send({ type: 'create', requestId: 'req-3', name: 'enclosure-v3' });

    expect(promises.inputsFor('checkBranch')).toEqual([
      { projectId: 'project-1', operation: 'switch', branch: 'bracket-fillet', into: 'main' },
    ]);
    expect(emitted).toEqual([
      {
        type: 'toast.error',
        requestId: 'req-2',
        operation: 'merge',
        branch: 'enclosure-v2',
        message: 'Another branch change is still running.',
        code: 'REVISIONS_BUSY',
      },
      {
        type: 'toast.error',
        requestId: 'req-3',
        operation: 'create',
        branch: 'enclosure-v3',
        message: 'Another branch change is still running.',
        code: 'REVISIONS_BUSY',
      },
    ]);
    expect(actor.getSnapshot().matches('confirming')).toBe(true);
    actor.stop();
  });

  it('should tell the parent which checkout a rename moved', async () => {
    const { actor, promises, parent } = start();
    promises.script('checkBranch', cleanCheck);
    promises.script('rename', { output: { branch: 'bracket-fillet-r3', checkoutId: 'checkout-b' } });

    actor.send({ type: 'rename', requestId: 'req-1', branch: 'bracket-fillet', name: 'bracket-fillet-r3' });
    await flush();

    expect(parent.events).toContainEqual({ type: 'checkoutChanged', checkoutId: 'checkout-b' });
    actor.stop();
    parent.stop();
  });

  it('still reaches the registry when no host check is provided', async () => {
    const parent = createFakeParent();
    const guard = guardActors();
    const actor = createActor(branchMachine, {
      input: { projectId: 'project-1', parentRef: parent.ref },
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.start();

    actor.send({ type: 'create', requestId: 'req-1', name: 'enclosure-v2', from: 'rev-12' });
    await flush();

    /* With a base named the effect is still the registry verb; a base-less
     * create now records first, which rows 19-20 cover. */
    expect(parent.events).toContainEqual({
      type: 'addCheckout',
      requestId: 'req-1/add',
      branch: 'enclosure-v2',
      from: 'rev-12',
    });
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

  it('should answer every public event in every reachable state', () => {
    const parent = createFakeParent();
    const outputs: Readonly<Record<string, unknown>> = {
      checkBranch: { needsConfirmation: true, question: 'This overwrites changes that are not in a revision yet.' },
      applySwitch: switched.output,
      merge: { status: 'conflicted', paths: ['enclosure.ts'] },
      rename: { branch: 'enclosure-v4' },
    };
    /* Effect outcomes reach the states behind each invoke; they are not public. */
    const invokes = [
      branchMachine.getStateNodeById('branch.checking'),
      branchMachine.getStateNodeById('branch.applying.switching'),
      branchMachine.getStateNodeById('branch.applying.merging'),
      branchMachine.getStateNodeById('branch.applying.renaming'),
    ].flatMap((node) => node.invoke);
    const outcomes = invokes.flatMap((invoke) => [
      { type: `xstate.done.actor.${invoke.id}`, output: outputs[typeof invoke.src === 'string' ? invoke.src : ''] },
      { type: `xstate.error.actor.${invoke.id}`, error: new Error('failed') },
    ]);
    const publicEvents: readonly BranchMachineEvent[] = [
      { type: 'switch', requestId: 'req-1', branch: 'bracket-fillet', mode: 'applyToLive' },
      { type: 'merge', requestId: 'req-1', branch: 'enclosure-v2' },
      { type: 'discard', requestId: 'req-1', branch: 'enclosure-v2' },
      { type: 'create', requestId: 'req-1', name: 'enclosure-v2', from: 'rev-12' },
      { type: 'create', requestId: 'req-1', name: 'enclosure-v3', checkoutId: 'checkout-live', head: 'rev-1' },
      { type: 'rename', requestId: 'req-1', branch: 'enclosure-v2', name: 'enclosure-v4' },
      { type: 'confirm' },
      { type: 'cancel' },
      { type: 'selectBranch', branch: 'main' },
      { type: 'checkoutAdded', requestId: 'req-1/add', checkoutId: 'checkout-c', checkoutRoot: '/checkouts/c' },
      { type: 'checkoutRemoved', requestId: 'req-1/remove' },
      { type: 'operationFailed', requestId: 'req-1/add', reason: 'That branch already has a checkout.' },
      {
        type: 'revisionMinted',
        checkoutId: 'checkout-live',
        trigger: 'switch',
        requestId: 'req-1/cut',
        revisionId: 'rev-2',
      },
      { type: 'nothingToSave', checkoutId: 'checkout-live', trigger: 'switch', requestId: 'req-1/cut' },
      {
        type: 'cutFailed',
        checkoutId: 'checkout-live',
        trigger: 'switch',
        requestId: 'req-1/cut',
        reason: 'The cut failed.',
      },
      { type: 'casLost', checkoutId: 'checkout-live', trigger: 'switch', requestId: 'req-1/cut' },
    ];
    const options = {
      input: { projectId: 'project-1', currentBranch: 'main', parentRef: parent.ref },
      events: [...publicEvents, ...outcomes],
      limit: 20_000,
      /* The verb and its base pick the `applying` branch, so the projection keeps both. */
      serializeState: (snapshot: AnyMachineSnapshot) =>
        JSON.stringify([snapshot.value, snapshot.context.operation, snapshot.context.from]),
    };

    expect(unansweredEvents(branchMachine, options)).toEqual([]);
    // W5: `creating.routing` is a transient `always` node; a total `choice` state is never listed.
    expect(unreachedStates(branchMachine, options)).toEqual(['branch.applying.creating.routing']);
    parent.stop();
  });
});
