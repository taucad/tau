/**
 * Totality baseline for the workspace connection machine (MC-R17). It locks today's answers before any state moves:
 * every public event is sampled in every reachable state, and each pair left unanswered must be on
 * `workspaceConnectionIgnoredEvents`. A later change that answers an event removes its pair; this file then fails
 * until it does.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value) and the traversal limit.
 * Each step's invoke answers with a built-in `xstate.done.actor` or `xstate.error.actor` event, offered only in the
 * state that runs it. `failed` is reached first from `registering`, so the traversal samples `retry` with
 * `failedPhase: 'registering'`; `retry` is a transition function that answers every phase. Path table (the shortest
 * path to each state value), kept current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `selecting`: `beginSelection`
 * 3. `registering`: `beginSelection`, `workspaceSelected`
 * 4. `mounting`: then the register step's done event
 * 5. `failed`: `beginSelection`, `workspaceSelected`, the register step's error event
 * 6. `browsing`: then, from `mounting`, the mount step's done event
 * 7. `discovering`: then the browser yield's done event
 * 8. `publishing`: then the catalog step's done event
 * 9. `ready`: then the publish step's done event
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { matchesState } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import {
  workspaceConnectionEventTypes,
  workspaceConnectionIgnoredEvents,
  workspaceConnectionMachine,
} from '#hooks/workspace-connection.machine.js';
import type {
  PreparedWorkspaceCatalog,
  RegisteredWorkspace,
  WorkspaceConnectionEvent,
  WorkspaceConnectionServices,
} from '#hooks/workspace-connection.machine.js';

const workspace: RegisteredWorkspace = {
  workspace: { workspaceId: 'wsp_1', name: 'Parts', slug: 'parts', lastConnectedAt: 0, path: '/home/person/parts' },
  minted: true,
};
const catalog: PreparedWorkspaceCatalog = {
  projectCount: 1,
  candidateCount: 1,
  conflictCount: 0,
  publish: async () => undefined,
};

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = {
  [T in WorkspaceConnectionEvent['type']]: ReadonlyArray<Extract<WorkspaceConnectionEvent, { type: T }>>;
};

const samples: Samples = {
  beginSelection: [{ type: 'beginSelection', operationId: 'op_1' }],
  selectionCancelled: [{ type: 'selectionCancelled' }],
  workspaceSelected: [
    { type: 'workspaceSelected', operationId: 'op_1', selection: { backend: 'node', path: '/home/person/parts' } },
  ],
  retry: [{ type: 'retry' }],
  workspaceRegistered: [{ type: 'workspaceRegistered', workspace }],
  workspaceCatalogPrepared: [{ type: 'workspaceCatalogPrepared', catalog }],
};

/** Every step settles only when the traversal delivers its built-in answer. */
const pending = fromSafeAsync(
  async (): Promise<never> =>
    new Promise<never>(() => {
      // Never settles: the traversal delivers the effect's answer as a built-in event.
    }),
);
const machine = workspaceConnectionMachine.provide({
  actors: {
    registerWorkspaceActor: pending,
    mountWorkspaceActor: pending,
    yieldToBrowserActor: pending,
    prepareWorkspaceCatalogActor: pending,
    publishWorkspaceCatalogActor: pending,
  },
});
const services: WorkspaceConnectionServices = {
  registerWorkspace: async () => workspace,
  mountWorkspace: async () => undefined,
  prepareWorkspaceCatalog: async () => catalog,
};
const events: readonly WorkspaceConnectionEvent[] = Object.values(samples).flat();

/** Each step's invoke answers, built in and so never public; offered only in the state whose invoke runs. */
const stepAnswers = (state: string): readonly WorkspaceConnectionEvent[] =>
  [
    { type: `xstate.done.actor.0.workspace-connection.${state}` },
    { type: `xstate.error.actor.0.workspace-connection.${state}`, error: new Error(`${state} failed`) },
  ] as unknown as readonly WorkspaceConnectionEvent[];
const steps = ['registering', 'mounting', 'browsing', 'discovering', 'publishing'] as const;
const options = {
  input: services,
  events: (snapshot: AnyMachineSnapshot) => [
    ...events,
    ...steps.filter((step) => snapshot.matches(step)).flatMap((step) => stepAnswers(step)),
  ],
  limit: 200,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

describe('workspace connection machine totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...workspaceConnectionEventTypes].toSorted());
    expect(new Set(workspaceConnectionEventTypes).size).toBe(workspaceConnectionEventTypes.length);
  });

  it('should reach every state along the documented path table', () => {
    const picked = ['beginSelection', 'workspaceSelected'];
    const done = (step: (typeof steps)[number]) => `xstate.done.actor.0.workspace-connection.${step}`;
    expect(
      pathTable(machine, options).map((row) => ({ state: row.state, events: row.events.map((event) => event.type) })),
    ).toEqual([
      { state: 'idle', events: [] },
      { state: 'selecting', events: ['beginSelection'] },
      { state: 'registering', events: picked },
      { state: 'mounting', events: [...picked, done('registering')] },
      { state: 'failed', events: [...picked, 'xstate.error.actor.0.workspace-connection.registering'] },
      { state: 'browsing', events: [...picked, done('registering'), done('mounting')] },
      { state: 'discovering', events: [...picked, done('registering'), done('mounting'), done('browsing')] },
      {
        state: 'publishing',
        events: [...picked, done('registering'), done('mounting'), done('browsing'), done('discovering')],
      },
      {
        state: 'ready',
        events: [
          ...picked,
          done('registering'),
          done('mounting'),
          done('browsing'),
          done('discovering'),
          done('publishing'),
        ],
      },
    ]);
    expect(unreachedStates(machine, options)).toEqual([]);
  });

  it('should answer every sampled event in every reachable state except the declared baseline', () => {
    expect(unansweredEvents(machine, { ...options, ignore: workspaceConnectionIgnoredEvents })).toEqual([]);
  });

  it('should declare no baseline pair that the machine now answers', () => {
    const gaps: UnansweredEvent[] = unansweredEvents(machine, options);
    const stale = workspaceConnectionIgnoredEvents.filter(
      ([state, eventType]) =>
        !gaps.some((gap) => gap.eventType === eventType && (state === '*' || matchesState(state, gap.state))),
    );
    expect(stale).toEqual([]);
  });
});
