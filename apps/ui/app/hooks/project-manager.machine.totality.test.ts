/**
 * Totality baseline for the project manager machine (MC-R17). It locks today's answers before any state moves:
 * every public event is sampled in every reachable state, and each pair left unanswered must be on
 * `projectManagerIgnoredEvents`. A later change that answers an event removes its pair; this file then fails until
 * it does.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value) and the traversal limit.
 * The worker invoke never settles, so the traversal delivers its answers (`xstate.done.actor.initializeWorkerActor`
 * and `xstate.error.actor.initializeWorkerActor`) as built-in events, offered only in `creatingWorker`, where the
 * invoke runs; they are never sampled as public. Path table (the shortest path to each state value), kept current
 * with `pathTable`:
 *
 * 1. `initializing`: initial
 * 2. `creatingWorker`: `initialize`
 * 3. `ready`: `initialize`, the worker invoke's done event
 * 4. `error`: `initialize`, the worker invoke's error event
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import type { Remote } from 'comlink';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { matchesState } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import type { ObjectStoreWorker as ObjectStoreWorkerType } from '#hooks/object-store.worker.js';
import {
  projectManagerEventTypes,
  projectManagerIgnoredEvents,
  projectManagerMachine,
} from '#hooks/project-manager.machine.js';
import type { ProjectManagerEvent } from '#hooks/project-manager.machine.js';

vi.mock('#hooks/object-store.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
  },
}));

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = { [T in ProjectManagerEvent['type']]: ReadonlyArray<Extract<ProjectManagerEvent, { type: T }>> };

const samples: Samples = {
  initialize: [{ type: 'initialize' }],
  workerInitialized: [
    {
      type: 'workerInitialized',
      worker: mock<Worker>(),
      wrappedWorker: mock<Remote<ObjectStoreWorkerType>>(),
    },
  ],
};

const pending = fromSafeAsync(
  async (): Promise<never> =>
    new Promise<never>(() => {
      // Never settles: the traversal delivers the effect's answer as a built-in event.
    }),
);
const machine = projectManagerMachine.provide({
  actors: {
    initializeWorkerActor: pending,
  },
});
const events: readonly ProjectManagerEvent[] = Object.values(samples).flat();
/** The worker invoke's answers, built in and so never public; offered only while the invoke runs. */
const workerAnswers = [
  { type: 'xstate.done.actor.initializeWorkerActor' },
  { type: 'xstate.error.actor.initializeWorkerActor', error: new Error('worker failed') },
] as unknown as readonly ProjectManagerEvent[];
const options = {
  events: (snapshot: AnyMachineSnapshot) =>
    snapshot.matches('creatingWorker') ? [...events, ...workerAnswers] : events,
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

describe('project manager machine totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...projectManagerEventTypes].toSorted());
    expect(new Set(projectManagerEventTypes).size).toBe(projectManagerEventTypes.length);
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(machine, options).map((row) => ({ state: row.state, events: row.events.map((event) => event.type) })),
    ).toEqual([
      { state: 'initializing', events: [] },
      { state: 'creatingWorker', events: ['initialize'] },
      { state: 'ready', events: ['initialize', 'xstate.done.actor.initializeWorkerActor'] },
      { state: 'error', events: ['initialize', 'xstate.error.actor.initializeWorkerActor'] },
    ]);
    expect(unreachedStates(machine, options)).toEqual([]);
  });

  it('should answer every sampled event in every reachable state except the declared baseline', () => {
    expect(unansweredEvents(machine, { ...options, ignore: projectManagerIgnoredEvents })).toEqual([]);
  });

  it('should declare no baseline pair that the machine now answers', () => {
    const gaps: UnansweredEvent[] = unansweredEvents(machine, options);
    const stale = projectManagerIgnoredEvents.filter(
      ([state, eventType]) =>
        !gaps.some((gap) => gap.eventType === eventType && (state === '*' || matchesState(state, gap.state))),
    );
    expect(stale).toEqual([]);
  });
});
