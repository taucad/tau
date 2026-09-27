import { createActor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';

import * as machineModule from '#resolution.machine.js';
import { resolutionMachine, selectResolutionFacet } from '#resolution.machine.js';
import type { ResolutionMachineEvent } from '#resolution.machine.js';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createFakeParent, createFakePromiseActors, recordEmitted } from '@taucad/xstate-testing/fakes';
import type { FakePromiseActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import type { IgnoredEvents } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';

/*
 * Path table — `resolution.machine` (S47, W21).
 *
 *  1  `open.loading` reads the conflict and fills the paths, labels and branch
 *  2  `loadConflict` failure → `open.failed` → `toast.error`; `reload` retries
 *  3  `keepMine(path)` applies the `mine` side and records the choice
 *  4  `keepTheirs(path)` applies the `theirs` side
 *  5  `openInEditor(path)` materializes and emits `conflictMaterialized`
 *  6  a path with no text to show says so and records no choice
 *  7  `resolvedInEditor` carries the resolved file in the actor's input only
 *  8  `applyResolution` failure → `resolving.failed` → `toast.error` → `idle`,
 *     every earlier choice kept
 *  9  `finish` with a path still unanswered is refused by the guard
 * 10  `finish` with every path answered mints, emits and sends `conflictResolved`
 * 11  `finishMerge` failure → `resolving.failed` → `toast.error` (and the
 *     parent's `childToast`, L2-F8) → `idle`, with
 *     every choice kept
 * 12  `askChat` → `seeding` → `turnRequested { revisionId, checkoutId, paths }`
 * 13  `seedTurn` failure → `resolving.failed` → `toast.error`
 * 14  `abandon` while resolving ends in `abandoned` and mints nothing
 * 15  `abandon` while still loading ends in `abandoned`
 * 16  `reload` while resolving re-reads the conflict
 * --  start and stop without a leaked child, serializable snapshot with no
 *     function and no bytes in context, one exported machine value
 */

/**
 * Known defects (MC-S5): public events a reachable state neither takes nor
 * declares ignored. W5 answers each one or moves it to an exported
 * `resolutionIgnoredEvents` (D13, MC-R17), and deletes the row as it lands.
 */
const knownDefects: IgnoredEvents = {
  resolution: [
    // W5: `finish` with a path still unanswered is refused without an answer.
    ['resolving.idle', 'finish'],
    ['open.loading', 'keepMine'],
    ['open.loading', 'keepTheirs'],
    ['open.loading', 'openInEditor'],
    ['open.loading', 'resolvedInEditor'],
    ['open.loading', 'askChat'],
    ['open.loading', 'finish'],
    ['open.loading', 'reload'],
    ['open.failed', 'keepMine'],
    ['open.failed', 'keepTheirs'],
    ['open.failed', 'openInEditor'],
    ['open.failed', 'resolvedInEditor'],
    ['open.failed', 'askChat'],
    ['open.failed', 'finish'],
    ['resolving.applying', 'keepMine'],
    ['resolving.applying', 'keepTheirs'],
    ['resolving.applying', 'openInEditor'],
    ['resolving.applying', 'resolvedInEditor'],
    ['resolving.applying', 'askChat'],
    ['resolving.applying', 'finish'],
    ['resolving.materializing', 'keepMine'],
    ['resolving.materializing', 'keepTheirs'],
    ['resolving.materializing', 'openInEditor'],
    ['resolving.materializing', 'resolvedInEditor'],
    ['resolving.materializing', 'askChat'],
    ['resolving.materializing', 'finish'],
    ['resolving.seeding', 'keepMine'],
    ['resolving.seeding', 'keepTheirs'],
    ['resolving.seeding', 'openInEditor'],
    ['resolving.seeding', 'resolvedInEditor'],
    ['resolving.seeding', 'askChat'],
    ['resolving.seeding', 'finish'],
    ['finishing', 'keepMine'],
    ['finishing', 'keepTheirs'],
    ['finishing', 'openInEditor'],
    ['finishing', 'resolvedInEditor'],
    ['finishing', 'askChat'],
    ['finishing', 'finish'],
    ['finishing', 'reload'],
  ],
};

/** Let every queued microtask and the actor's promise handlers run. */
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

type Harness = Readonly<{
  actor: ReturnType<typeof createActor<typeof resolutionMachine>>;
  promises: FakePromiseActors;
  parent: ReturnType<typeof createFakeParent>;
  emitted: ReturnType<typeof recordEmitted>;
}>;

const conflict = {
  branch: 'enclosure-v2',
  labels: { ours: 'main', theirs: 'enclosure-v2' },
  paths: [
    { path: 'enclosure.ts', openable: true },
    { path: 'params/wall.json', openable: false },
  ],
  checkoutId: 'checkout-enclosure',
};

const start = (): Harness => {
  const guard = guardActors({ ignore: knownDefects });
  const promises = createFakePromiseActors();
  const parent = createFakeParent();
  const actor = createActor(
    resolutionMachine.provide({
      actors: {
        loadConflict: promises.actor('loadConflict'),
        materialize: promises.actor('materialize'),
        applyResolution: promises.actor('applyResolution'),
        finishMerge: promises.actor('finishMerge'),
        seedTurn: promises.actor('seedTurn'),
      },
    }),
    {
      input: { projectId: 'project-1', revisionId: 'rev-conflict', parentRef: parent.ref },
      clock: new StepClock(),
      inspect: guard.inspect,
    },
  );
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, promises, parent, emitted };
};

/** Start, load the conflict, and land in `resolving.idle`. */
const loaded = async (): Promise<Harness> => {
  const harness = start();
  harness.promises.settle('loadConflict', { output: conflict });
  await flush();
  return harness;
};

const types = (events: ReadonlyArray<{ type: string }>): readonly string[] => events.map((event) => event.type);

describe('resolutionMachine', () => {
  it('reads the conflict it was spawned for and offers one row per path', async () => {
    const { actor, promises } = await loaded();

    expect(promises.inputsFor('loadConflict')).toEqual([{ projectId: 'project-1', revisionId: 'rev-conflict' }]);
    expect(actor.getSnapshot().matches({ resolving: 'idle' })).toBe(true);
    const facet = selectResolutionFacet(actor.getSnapshot());
    expect(facet).toMatchObject({
      revisionId: 'rev-conflict',
      branch: 'enclosure-v2',
      labels: { ours: 'main', theirs: 'enclosure-v2' },
      busy: false,
      ready: false,
    });
    expect(facet.paths).toEqual([
      { path: 'enclosure.ts', openable: true, side: undefined },
      { path: 'params/wall.json', openable: false, side: undefined },
    ]);

    actor.stop();
  });

  it('says so when the conflict cannot be read, and reads it again on reload', async () => {
    const { actor, promises, emitted } = start();

    promises.settle('loadConflict', { error: new Error('the store is unreadable') });
    await flush();

    expect(actor.getSnapshot().matches({ open: 'failed' })).toBe(true);
    expect(emitted.filter((event) => event.type === 'toast.error')).toHaveLength(1);

    actor.send({ type: 'reload' });
    expect(actor.getSnapshot().matches({ open: 'loading' })).toBe(true);
    expect(promises.inputsFor('loadConflict')).toHaveLength(2);

    actor.stop();
  });

  it('keeps one side per file and records the choice', async () => {
    const { actor, promises } = await loaded();

    actor.send({ type: 'keepMine', path: 'enclosure.ts' });
    expect(actor.getSnapshot().matches({ resolving: 'applying' })).toBe(true);
    promises.settle('applyResolution', { output: undefined });
    await flush();

    actor.send({ type: 'keepTheirs', path: 'params/wall.json' });
    promises.settle('applyResolution', { output: undefined });
    await flush();

    expect(promises.inputsFor('applyResolution')).toEqual([
      { projectId: 'project-1', revisionId: 'rev-conflict', path: 'enclosure.ts', side: 'mine' },
      { projectId: 'project-1', revisionId: 'rev-conflict', path: 'params/wall.json', side: 'theirs' },
    ]);
    expect(selectResolutionFacet(actor.getSnapshot()).ready).toBe(true);

    actor.stop();
  });

  it('hands the editor marker text without putting it in context', async () => {
    const { actor, promises, emitted } = await loaded();

    actor.send({ type: 'openInEditor', path: 'enclosure.ts' });
    expect(actor.getSnapshot().matches({ resolving: 'materializing' })).toBe(true);
    promises.settle('materialize', {
      output: { path: 'enclosure.ts', text: '<<<<<<< main\nmine\n=======\ntheirs\n>>>>>>> enclosure-v2\n' },
    });
    await flush();

    expect(emitted.find((event) => event.type === 'conflictMaterialized')).toEqual({
      type: 'conflictMaterialized',
      path: 'enclosure.ts',
      text: '<<<<<<< main\nmine\n=======\ntheirs\n>>>>>>> enclosure-v2\n',
    });
    /* The text is a fact about the world, not state: nothing in context holds it. */
    expect(JSON.stringify(actor.getSnapshot().context)).not.toContain('<<<<<<<');
    expect(selectResolutionFacet(actor.getSnapshot()).paths[0]?.side).toBeUndefined();

    actor.stop();
  });

  it('says a file cannot be opened as text rather than opening an empty one', async () => {
    const { actor, promises, emitted } = await loaded();

    actor.send({ type: 'openInEditor', path: 'params/wall.json' });
    promises.settle('materialize', { output: { path: 'params/wall.json', text: undefined } });
    await flush();

    expect(types(emitted)).toContain('toast.error');
    expect(emitted.some((event) => event.type === 'conflictMaterialized')).toBe(false);
    expect(actor.getSnapshot().matches({ resolving: 'idle' })).toBe(true);

    actor.stop();
  });

  /*
   * C44. `openConflictInEditor` is fire-and-forget and this machine emitted a
   * fact only on success, so the pane could learn that a materialization failed
   * only by waiting 10 s and assuming. A failure is a fact like any other: it is
   * emitted for the same path, and sent through the parent the same way, so the
   * surface reacts to a signal instead of to a timer.
   */
  it('17 (C44): a materialization that fails says so for the path it failed on', async () => {
    const { actor, promises, parent, emitted } = await loaded();

    actor.send({ type: 'openInEditor', path: 'enclosure.ts' });
    promises.settle('materialize', { error: new Error('That file is no longer in this revision.') });
    await flush();

    expect(emitted.find((event) => event.type === 'conflictMaterializationFailed')).toEqual({
      type: 'conflictMaterializationFailed',
      path: 'enclosure.ts',
      reason: 'That file is no longer in this revision.',
    });
    expect(parent.events.find((event) => event.type === 'conflictMaterializationFailed')).toEqual({
      type: 'conflictMaterializationFailed',
      revisionId: 'rev-conflict',
      path: 'enclosure.ts',
      reason: 'That file is no longer in this revision.',
    });

    actor.stop();
  });

  it('17b (C44): a file with no text form is a failure of the same shape', async () => {
    const { actor, promises, parent } = await loaded();

    actor.send({ type: 'openInEditor', path: 'params/wall.json' });
    promises.settle('materialize', { output: { path: 'params/wall.json', text: undefined } });
    await flush();

    expect(parent.events.find((event) => event.type === 'conflictMaterializationFailed')).toEqual({
      type: 'conflictMaterializationFailed',
      revisionId: 'rev-conflict',
      path: 'params/wall.json',
      reason: 'That file cannot be opened as text. Keep one side instead.',
    });

    actor.stop();
  });

  it('sends the editor’s resolved file to the effect and keeps it out of context', async () => {
    const { actor, promises } = await loaded();

    actor.send({ type: 'resolvedInEditor', path: 'enclosure.ts', content: 'resolved by hand\n' });
    promises.settle('applyResolution', { output: undefined });
    await flush();

    expect(promises.inputsFor('applyResolution')).toEqual([
      {
        projectId: 'project-1',
        revisionId: 'rev-conflict',
        path: 'enclosure.ts',
        side: 'editor',
        content: 'resolved by hand\n',
      },
    ]);
    expect(JSON.stringify(actor.getSnapshot().context)).not.toContain('resolved by hand');
    expect(selectResolutionFacet(actor.getSnapshot()).paths[0]?.side).toBe('editor');

    actor.stop();
  });

  it('keeps the choices already made when one of them fails', async () => {
    const { actor, promises, emitted } = await loaded();

    actor.send({ type: 'keepMine', path: 'enclosure.ts' });
    promises.settle('applyResolution', { output: undefined });
    await flush();

    actor.send({ type: 'keepTheirs', path: 'params/wall.json' });
    promises.settle('applyResolution', { error: new Error('the store refused the write') });
    await flush();

    expect(actor.getSnapshot().matches({ resolving: 'idle' })).toBe(true);
    expect(emitted.filter((event) => event.type === 'toast.error')).toHaveLength(1);
    const facet = selectResolutionFacet(actor.getSnapshot());
    expect(facet.paths[0]?.side).toBe('mine');
    expect(facet.paths[1]?.side).toBeUndefined();
    expect(facet.ready).toBe(false);

    actor.stop();
  });

  it('refuses to finish while a file is still unanswered', async () => {
    const { actor, promises } = await loaded();

    actor.send({ type: 'keepMine', path: 'enclosure.ts' });
    promises.settle('applyResolution', { output: undefined });
    await flush();

    actor.send({ type: 'finish' });

    expect(actor.getSnapshot().matches({ resolving: 'idle' })).toBe(true);
    expect(promises.inputsFor('finishMerge')).toEqual([]);

    actor.stop();
  });

  it('mints the resolving revision once every file is answered', async () => {
    const { actor, promises, parent, emitted } = await loaded();

    for (const path of ['enclosure.ts', 'params/wall.json']) {
      actor.send({ type: 'keepMine', path });
      promises.settle('applyResolution', { output: undefined });
      // oxlint-disable-next-line eslint/no-await-in-loop -- one choice settles before the next is made.
      await flush();
    }

    actor.send({ type: 'finish' });
    expect(actor.getSnapshot().matches('finishing')).toBe(true);
    expect(promises.inputsFor('finishMerge')).toEqual([{ projectId: 'project-1', revisionId: 'rev-conflict' }]);

    promises.settle('finishMerge', { output: { revisionId: 'rev-resolved', branch: 'enclosure-v2' } });
    await flush();

    expect(actor.getSnapshot().matches('resolved')).toBe(true);
    const resolved = { type: 'conflictResolved', revisionId: 'rev-resolved', branch: 'enclosure-v2' };
    expect(emitted.find((event) => event.type === 'conflictResolved')).toEqual(resolved);
    expect(parent.events.find((event) => event.type === 'conflictResolved')).toEqual(resolved);

    actor.stop();
  });

  it('returns to the rows when the resolving revision cannot be minted', async () => {
    const { actor, promises, parent, emitted } = await loaded();

    for (const path of ['enclosure.ts', 'params/wall.json']) {
      actor.send({ type: 'keepTheirs', path });
      promises.settle('applyResolution', { output: undefined });
      // oxlint-disable-next-line eslint/no-await-in-loop -- one choice settles before the next is made.
      await flush();
    }
    actor.send({ type: 'finish' });
    promises.settle('finishMerge', { error: new Error('that branch moved while the merge was running') });
    await flush();

    expect(actor.getSnapshot().matches({ resolving: 'idle' })).toBe(true);
    expect(selectResolutionFacet(actor.getSnapshot()).ready).toBe(true);
    expect(emitted.some((event) => event.type === 'conflictResolved')).toBe(false);
    /* And it says why. This is the last button a person presses, so a failure
       that returns them to identical rows with no message is the one failure
       edge that reads as a broken control (review R3). */
    expect(emitted.find((event) => event.type === 'toast.error')).toEqual({
      type: 'toast.error',
      message: 'that branch moved while the merge was running',
    });
    /* L2-F8: and through the root, which is the only actor a host holds. */
    expect(parent.events.filter((event) => event.type === 'childToast')).toEqual([
      {
        type: 'childToast',
        subject: 'resolution',
        tone: 'error',
        message: 'that branch moved while the merge was running',
      },
    ]);

    actor.stop();
  });

  it('asks a chat to resolve it on the conflict branch’s own checkout', async () => {
    const { actor, promises, parent, emitted } = await loaded();

    actor.send({ type: 'askChat' });
    expect(actor.getSnapshot().matches({ resolving: 'seeding' })).toBe(true);
    promises.settle('seedTurn', { output: { checkoutId: 'checkout-enclosure', paths: ['enclosure.ts'] } });
    await flush();

    const requested = {
      type: 'turnRequested',
      revisionId: 'rev-conflict',
      checkoutId: 'checkout-enclosure',
      paths: ['enclosure.ts'],
    };
    expect(emitted.find((event) => event.type === 'turnRequested')).toEqual(requested);
    expect(parent.events.find((event) => event.type === 'turnRequested')).toEqual(requested);
    expect(actor.getSnapshot().matches({ resolving: 'idle' })).toBe(true);

    actor.stop();
  });

  it('says so when a chat cannot be asked', async () => {
    const { actor, promises, emitted } = await loaded();

    actor.send({ type: 'askChat' });
    promises.settle('seedTurn', { error: new Error('this branch has no checkout') });
    await flush();

    expect(types(emitted)).toContain('toast.error');
    expect(emitted.some((event) => event.type === 'turnRequested')).toBe(false);

    actor.stop();
  });

  it('abandons without minting anything, from the rows or while still loading', async () => {
    const resolving = await loaded();
    resolving.actor.send({ type: 'abandon' });
    expect(resolving.actor.getSnapshot().matches('abandoned')).toBe(true);
    expect(resolving.promises.inputsFor('finishMerge')).toEqual([]);
    expect(resolving.emitted.some((event) => event.type === 'conflictResolved')).toBe(false);
    resolving.actor.stop();

    const loading = start();
    loading.actor.send({ type: 'abandon' });
    expect(loading.actor.getSnapshot().matches('abandoned')).toBe(true);
    loading.actor.stop();
  });

  it('re-reads the conflict when the branch moved underneath it', async () => {
    const { actor, promises } = await loaded();

    actor.send({ type: 'reload' });

    expect(actor.getSnapshot().matches({ open: 'loading' })).toBe(true);
    expect(promises.inputsFor('loadConflict')).toHaveLength(2);

    actor.stop();
  });

  it('starts headlessly, serializes its context and exports exactly one machine value', async () => {
    const { actor } = await loaded();

    const { context } = actor.getSnapshot();
    /* `parentRef` is an actor ref, which XState serializes by id; nothing else
       in context may be a function or a byte array (I29, AC27). */
    const { parentRef: _parentRef, ...serializable } = context;
    expect(Object.values(serializable).every((value) => typeof value !== 'function')).toBe(true);
    const wire = JSON.stringify(serializable);
    expect(JSON.parse(wire)).toEqual(serializable);

    const isMachine = (value: unknown): boolean =>
      typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([resolutionMachine]);

    actor.stop();
    expect(actor.getSnapshot().status).toBe('stopped');
  });

  it('should answer every public event in every reachable state', () => {
    const outputs: Readonly<Record<string, unknown>> = {
      loadConflict: { ...conflict, paths: [conflict.paths[0]] },
      materialize: { path: 'enclosure.ts', text: '<<<<<<< main', ours: 'mine', theirs: 'theirs' },
      applyResolution: undefined,
      finishMerge: { revisionId: 'rev-resolved', branch: 'enclosure-v2' },
      seedTurn: { checkoutId: 'checkout-enclosure', paths: ['enclosure.ts'] },
    };
    /* Effect outcomes reach the states behind each invoke; they are not public. */
    const outcomes = Object.values(resolutionMachine.root.states)
      .flatMap((node) => [node, ...Object.values(node.states)])
      .flatMap((node) => node.invoke)
      .flatMap((invoke) => [
        { type: `xstate.done.actor.${invoke.id}`, output: outputs[typeof invoke.src === 'string' ? invoke.src : ''] },
        { type: `xstate.error.actor.${invoke.id}`, error: new Error('failed') },
      ]);
    const publicEvents: readonly ResolutionMachineEvent[] = [
      { type: 'keepMine', path: 'enclosure.ts' },
      { type: 'keepTheirs', path: 'enclosure.ts' },
      { type: 'openInEditor', path: 'enclosure.ts' },
      { type: 'resolvedInEditor', path: 'enclosure.ts', content: 'resolved' },
      { type: 'askChat' },
      { type: 'finish' },
      { type: 'abandon' },
      { type: 'reload' },
    ];
    const options = {
      input: { projectId: 'project-1', revisionId: 'rev-conflict', parentRef: undefined },
      events: [...publicEvents, ...outcomes],
      limit: 5000,
      /* `finish` is guarded on every path being chosen, so the projection keeps the chosen paths. */
      serializeState: (snapshot: AnyMachineSnapshot) =>
        JSON.stringify([snapshot.value, Object.keys(snapshot.context.chosen as Record<string, unknown>).toSorted()]),
    };

    expect(unansweredEvents(resolutionMachine, { ...options, ignore: knownDefects['resolution'] })).toEqual([]);
    expect(unreachedStates(resolutionMachine, options)).toEqual([]);
  });
});
