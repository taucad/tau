/**
 * Totality baseline for the project session machine (MC-R17). It locks today's answers before any state moves:
 * every public event is sampled in every reachable state, and each pair left unanswered must be on
 * `projectSessionIgnoredEvents`. A later change that answers an event removes its pair; this file then fails until
 * it does. `project-session.machine.test.ts` keeps its own contract row; both read the same table.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value) and the traversal limit.
 * The children are silent fakes and the close steps never settle, so the traversal delivers their answers as built-in
 * events, each only where it can arrive: a region's `startBound` while it is starting, `parkWindow` and `idleWindow`
 * in `live.idle`, and a close step's done or error event while that step runs. `childFailed` is sampled for one
 * region; the start bound fails the others. `closing.stopping` is transient, never at rest, so it is the one state no
 * path reaches. Path table (the shortest path to each
 * state value), kept current with `pathTable`:
 *
 * 1. `opening.starting`, every region `starting`: initial
 * 2. `opening.starting`, the other 64 combinations of `starting`, `ready` and `failed` in which some region still
 *    starts: one `childReady`, `childFailed` or start bound per region that left `starting` (a combination with no
 *    region starting is done at once, into `live` or `failed`)
 * 3. `closing.cancellingRuns`: `close` (an opening session closes too)
 * 4. `closing.flushingProducers`: then the run cancel's done event
 * 5. `failed`: `close`, the run cancel's error event
 * 6. `closing.flushing`: then, from row 4, the producer flush's done event
 * 7. `live.idle`: from row 4, the producer flush's error event (a refused close goes live)
 * 8. `closing.releasingAgentHost`: from row 6, the sync flush's done event
 * 9. `live.busy`: from row 7, `projectedRunsChanged` with a run
 * 10. `closed`: from row 8, the agent-host release's done event
 * 11. `closing.asking`: from row 9, `close` for the person
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createCallbackLogic, matchesState } from 'xstate';
import type { AnyMachineSnapshot, EventObject, StateValue } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import {
  projectSessionEventTypes,
  projectSessionIgnoredEvents,
  projectSessionMachine,
} from '#machines/project-session.machine.js';
import type { ProjectSessionMachineEvent, ProjectSessionRegion } from '#machines/project-session.machine.js';

const regions: readonly ProjectSessionRegion[] = ['views', 'runtime', 'agentHost', 'compute'];

/** One or more samples of every event type; the mapped type fails to compile when the union gains a type. */
type Samples = {
  [T in ProjectSessionMachineEvent['type']]: ReadonlyArray<Extract<ProjectSessionMachineEvent, { type: T }>>;
};

const samples: Samples = {
  close: [
    { type: 'close', reason: 'user' },
    { type: 'close', reason: 'idle' },
  ],
  confirmClose: [{ type: 'confirmClose' }],
  cancelClose: [{ type: 'cancelClose' }],
  childReady: regions.map((region) => ({ type: 'childReady', region })),
  childFailed: [{ type: 'childFailed', region: 'runtime', reason: 'refused' }],
  projectedRunsChanged: [
    { type: 'projectedRunsChanged', runs: ['chat_1'], stoppableRuns: ['chat_1'] },
    { type: 'projectedRunsChanged', runs: [], stoppableRuns: [] },
  ],
  activity: [{ type: 'activity' }],
  visibilityChanged: [
    { type: 'visibilityChanged', visible: true, focused: true },
    { type: 'visibilityChanged', visible: false, focused: false },
  ],
  attention: [{ type: 'attention', count: 1 }],
  revisionState: [
    { type: 'revisionState', dirty: true, pushed: false, pendingCount: 1 },
    { type: 'revisionState', dirty: false, pushed: true, recording: true },
  ],
};

/** Children that never report and close steps that never settle: the traversal delivers their answers. */
const pending = fromSafeAsync(
  async (): Promise<never> =>
    new Promise<never>(() => {
      // Never settles: the traversal delivers the effect's answer as a built-in event.
    }),
);
const silent = createCallbackLogic<EventObject, { projectId: string }>(() => undefined);
const machine = projectSessionMachine.provide({
  actors: {
    cancelRuns: pending,
    flushProducers: pending,
    flushSync: pending,
    releaseAgentHost: pending,
    fileManager: silent,
    project: silent,
    agentHost: silent,
    compute: silent,
  },
});
const events: readonly ProjectSessionMachineEvent[] = Object.values(samples).flat();

const builtIn = (types: readonly string[]): readonly ProjectSessionMachineEvent[] =>
  types.map((type) =>
    type.startsWith('xstate.error.') ? { type, error: new Error('step failed') } : { type },
  ) as unknown as readonly ProjectSessionMachineEvent[];
/** A region's start bound, delivered where that region is still starting. */
const startBound = (region: ProjectSessionRegion) =>
  `xstate.after.startBound.project-session.opening.starting.${region}.starting`;
const closeSteps = ['cancellingRuns', 'flushingProducers', 'flushing', 'releasingAgentHost'] as const;
/** Timers and invoke answers, built in and so never public; offered only in the state that arms or runs them. */
const builtInsAt = (snapshot: AnyMachineSnapshot): readonly ProjectSessionMachineEvent[] => [
  ...builtIn(
    regions
      .filter((region) => snapshot.matches({ opening: { starting: { [region]: 'starting' } } }))
      .map((region) => startBound(region)),
  ),
  ...builtIn(
    snapshot.matches({ live: 'idle' })
      ? ['xstate.after.parkWindow.project-session.live.idle', 'xstate.after.idleWindow.project-session.live.idle']
      : [],
  ),
  ...builtIn(
    closeSteps.flatMap((step) =>
      snapshot.matches({ closing: step })
        ? [
            `xstate.done.actor.0.project-session.closing.${step}`,
            `xstate.error.actor.0.project-session.closing.${step}`,
          ]
        : [],
    ),
  ),
];
const options = {
  input: { projectId: 'p' },
  events: (snapshot: AnyMachineSnapshot) => [...events, ...builtInsAt(snapshot)],
  limit: 4000,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

/** The active leaf paths of a state value, dotted and joined, e.g. `opening.starting.views.ready | …`. */
const leaves = (value: StateValue, prefix = ''): string[] =>
  typeof value === 'string'
    ? [`${prefix}${value}`]
    : Object.entries(value).flatMap(([key, child]) =>
        child === undefined ? [`${prefix}${key}`] : leaves(child, `${prefix}${key}.`),
      );
const dotted = (value: StateValue): string => leaves(value).join(' | ');

describe('project session machine totality baseline', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...projectSessionEventTypes].toSorted());
    expect(new Set(projectSessionEventTypes).size).toBe(projectSessionEventTypes.length);
  });

  it('should reach every state along the documented path table', () => {
    const rows = pathTable(machine, options).map((row) => ({
      state: dotted(row.state),
      events: row.events.map((event) => event.type),
    }));
    const opening = rows.filter((row) => row.state.startsWith('opening.'));
    // Rows 1 and 2: each region's leaf is one step from `starting`, so a row takes one event per region that left it.
    expect(opening).toHaveLength(65);
    expect(
      opening.filter(
        (row) => row.events.length !== row.state.split(' | ').filter((leaf) => !leaf.endsWith('.starting')).length,
      ),
    ).toEqual([]);
    const done = (step: (typeof closeSteps)[number]) => `xstate.done.actor.0.project-session.closing.${step}`;
    const refused = ['close', done('cancellingRuns'), 'xstate.error.actor.0.project-session.closing.flushingProducers'];
    expect(rows.filter((row) => !row.state.startsWith('opening.'))).toEqual([
      { state: 'closing.cancellingRuns', events: ['close'] },
      { state: 'closing.flushingProducers', events: ['close', done('cancellingRuns')] },
      { state: 'failed', events: ['close', 'xstate.error.actor.0.project-session.closing.cancellingRuns'] },
      { state: 'closing.flushing', events: ['close', done('cancellingRuns'), done('flushingProducers')] },
      { state: 'live.idle', events: refused },
      {
        state: 'closing.releasingAgentHost',
        events: ['close', done('cancellingRuns'), done('flushingProducers'), done('flushing')],
      },
      { state: 'live.busy', events: [...refused, 'projectedRunsChanged'] },
      {
        state: 'closed',
        events: [
          'close',
          done('cancellingRuns'),
          done('flushingProducers'),
          done('flushing'),
          done('releasingAgentHost'),
        ],
      },
      { state: 'closing.asking', events: [...refused, 'projectedRunsChanged', 'close'] },
    ]);
    // `closing.stopping` is transient: its entry stops the children and its `always` leaves for `closed` at once.
    expect(unreachedStates(machine, options)).toEqual(['project-session.closing.stopping']);
  });

  it('should answer every sampled event in every reachable state except the declared baseline', () => {
    expect(unansweredEvents(machine, { ...options, ignore: projectSessionIgnoredEvents })).toEqual([]);
  });

  it('should declare no baseline pair that the machine now answers', () => {
    const gaps: UnansweredEvent[] = unansweredEvents(machine, options);
    const stale = projectSessionIgnoredEvents.filter(
      ([state, eventType]) =>
        !gaps.some((gap) => gap.eventType === eventType && (state === '*' || matchesState(state, gap.state))),
    );
    expect(stale).toEqual([]);
  });
});
