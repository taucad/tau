/**
 * Totality baseline for the project session machine (MC-R17). It locks today's answers before any state moves:
 * every public event is sampled in every reachable state, and each pair left unanswered must be on
 * `projectSessionIgnoredEvents`. A later change that answers an event removes its pair; this file then fails until
 * it does. `project-session.machine.test.ts` keeps its own contract row; both read the same table.
 *
 * The claim is bounded by the samples below, the projection (one snapshot per state value, and while closing, per
 * whether a revision client is there to quiesce) and the traversal limit. The children are silent fakes and the close's
 * invoked steps never settle, so the traversal delivers their answers as built-in events, each only where it can
 * arrive: a region's `startBound` while it is starting, `parkWindow` and `idleWindow` in `live.idle`, the producer
 * flush's bound in `closing.flushingProducers`, and a step's done or error event while that step runs. The `project`
 * and `revisions` children's answers (A7c) are public events, sampled under the close step ids the paths reach.
 * `childFailed` is sampled for one region; the start bound fails the others. `closing.stopping` is transient, never at
 * rest, so it is the one state no path reaches. Path table (the shortest path to each state value), kept current with
 * `pathTable`:
 *
 * 1. `opening.starting`, every region `starting`: initial
 * 2. `opening.starting`, the other 64 combinations of `starting`, `ready` and `failed` in which some region still
 *    starts: one `childReady`, `childFailed` or start bound per region that left `starting` (a combination with no
 *    region starting is done at once, into `live` or `failed`)
 * 3. `closing.cancellingRuns`: `close` (an opening session closes too), and with a revision client after
 *    `fileManagerChanged`
 * 4. `closing.flushingProducers`: then the run cancel's done event, with and without a revision client
 * 5. `failed`: `close`, the run cancel's error event
 * 6. `closing.closingParameters`: from row 4 without a client, the runtime's `runtimeFlushSettled`
 * 7. `live.idle`: the same path, the runtime refusing (a refused close goes live)
 * 8. `closing.closingParameters` with a client: from row 4 with a client, the same
 * 9. `closing.closingRuntime`: from row 6, the runtime's `parametersClosed`; the sync step has nothing to quiesce and
 *    passes through
 * 10. `live.busy`: from row 7, `projectedRunsChanged` with a run
 * 11. `closing.flushing`: from row 8, `parametersClosed`
 * 12. `closing.closingRuntime` with a client: from row 9, `fileManagerChanged`
 * 13. `closing.releasingAgentHost`: from row 9, `runtimeClosed`, and from row 12 the same
 * 14. `closed`: from row 13, the agent-host release's done event
 * 15. `closing.asking`: from row 10, `close` for the person, and with a client after `fileManagerChanged`
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { UnansweredEvent } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor, createCallbackLogic, matchesState } from 'xstate';
import type { AnyMachineSnapshot, EventObject, StateValue } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import {
  projectSessionEventTypes,
  projectSessionIgnoredEvents,
  projectSessionMachine,
} from '#machines/project-session.machine.js';
import type { ProjectSessionMachineEvent, ProjectSessionRegion } from '#machines/project-session.machine.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';

const regions: readonly ProjectSessionRegion[] = ['views', 'runtime', 'agentHost', 'compute'];

/** A file manager's stand-in: the session keeps the ref it is told and never reads it. */
const fileManagerStandIn = createCallbackLogic(() => undefined) as unknown as typeof fileManagerMachine;

/** The close step ids the traversal's paths reach, and one nothing asked. */
const answeredIds = ['close:0', 'close:1', 'close:2', 'close:3', 'close:4'] as const;

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
  /* The child's report carries the file manager it built; the session only keeps the ref, so a stand-in serves. */
  fileManagerChanged: [
    { type: 'fileManagerChanged', fileManagerRef: createActor(fileManagerStandIn) },
    { type: 'fileManagerChanged', fileManagerRef: undefined },
  ],
  childFailed: [{ type: 'childFailed', region: 'runtime', reason: 'refused' }],
  /* The `project` child's reports (A6d): the session keeps the runtime's ref and passes the chat facts on. */
  runtimeChanged: [
    { type: 'runtimeChanged', runtimeRef: createActor(createCallbackLogic(() => undefined)) },
    { type: 'runtimeChanged', runtimeRef: undefined },
  ],
  chatReady: [{ type: 'chatReady' }],
  chatFocused: [{ type: 'chatFocused', requestedChatId: 'chat-1', chatId: 'chat-1' }],
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
  chatRequested: [{ type: 'chatRequested', chatId: 'chat-1' }],
  /* The `revisions` child's word that the project's chats arrived, which the session passes to its `project` (A7b). */
  revisionChatsChanged: [
    { type: 'revisionChatsChanged', ready: true },
    { type: 'revisionChatsChanged', ready: false },
  ],
  /* A14: the `revisions` child's word on the file check, and the `fileCheck` child's patience; answered everywhere. */
  fileCheckChanged: [
    { type: 'fileCheckChanged', settled: false, judged: true },
    { type: 'fileCheckChanged', settled: false, judged: false },
    { type: 'fileCheckChanged', settled: true, judged: true },
  ],
  fileCheckSlow: [{ type: 'fileCheckSlow', check: 1 }],
  revisionState: [
    { type: 'revisionState', dirty: true, pushed: false, pendingCount: 1 },
    { type: 'revisionState', dirty: false, pushed: true, recording: true },
  ],
  /* A7c: a leave or unload flush asked of the session, its expiry, and its children's answers. A close step asks under
   * `close:<n>`, counted per session, so the answers are sampled under the ids the traversal's paths reach, under a
   * leave flush's id and under an id nothing asked. */
  flushAsked: [
    { type: 'flushAsked', requestId: 'leave-1', kind: 'leave' },
    { type: 'flushAsked', requestId: 'unload-1', kind: 'unload' },
  ],
  flushExpired: [{ type: 'flushExpired', requestId: 'leave-1' }],
  runtimeFlushSettled: [
    ...answeredIds.map((requestId) => ({ type: 'runtimeFlushSettled', requestId }) as const),
    { type: 'runtimeFlushSettled', requestId: 'close:1', error: 'refused' },
    { type: 'runtimeFlushSettled', requestId: 'leave-1' },
  ],
  syncQuiesced: [
    ...answeredIds.map((requestId) => ({ type: 'syncQuiesced', requestId }) as const),
    { type: 'syncQuiesced', requestId: 'close:3', error: 'refused' },
  ],
  parametersClosed: [
    ...answeredIds.map((requestId) => ({ type: 'parametersClosed', requestId }) as const),
    { type: 'parametersClosed', requestId: 'close:2', error: 'refused' },
  ],
  runtimeClosed: [
    ...answeredIds.map((requestId) => ({ type: 'runtimeClosed', requestId }) as const),
    { type: 'runtimeClosed', requestId: 'close:3', error: 'refused' },
  ],
  /* A6e: the `project` child's report that the choices select another kernel; the session hands it back. */
  replaceRuntime: [{ type: 'replaceRuntime' }],
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
    releaseAgentHost: pending,
    fileManager: silent,
    project: silent,
    agentHost: silent,
    compute: silent,
    presence: silent,
    revisions: silent,
    hostConnector: silent,
    unload: silent,
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
const closeSteps = ['cancellingRuns', 'releasingAgentHost'] as const;
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
    snapshot.matches({ closing: 'flushingProducers' })
      ? ['xstate.after.producerFlush.project-session.closing.flushingProducers']
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
  limit: 8000,
  /* A closing session with a revision client waits in `closing.flushing` for its `quiesce`; one without passes through
   * it. The projection tells the two apart while closing, so the traversal reaches the waiting step. */
  serializeState: (snapshot: AnyMachineSnapshot) =>
    `${JSON.stringify(snapshot.value)}${
      snapshot.matches('closing') && (snapshot.context as { revisionsRef?: unknown }).revisionsRef !== undefined
        ? ' with revisions'
        : ''
    }`,
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
    const flushed = ['close', done('cancellingRuns'), 'runtimeFlushSettled'];
    const withClient = ['close', 'fileManagerChanged', done('cancellingRuns')];
    const closed = [...flushed, 'parametersClosed'];
    expect(rows.filter((row) => !row.state.startsWith('opening.'))).toEqual([
      { state: 'closing.cancellingRuns', events: ['close'] },
      { state: 'closing.cancellingRuns', events: ['close', 'fileManagerChanged'] },
      { state: 'closing.flushingProducers', events: ['close', done('cancellingRuns')] },
      { state: 'failed', events: ['close', 'xstate.error.actor.0.project-session.closing.cancellingRuns'] },
      { state: 'closing.flushingProducers', events: withClient },
      { state: 'closing.closingParameters', events: flushed },
      { state: 'live.idle', events: flushed },
      { state: 'closing.closingParameters', events: [...withClient, 'runtimeFlushSettled'] },
      { state: 'closing.closingRuntime', events: closed },
      { state: 'live.busy', events: [...flushed, 'projectedRunsChanged'] },
      { state: 'closing.flushing', events: [...withClient, 'runtimeFlushSettled', 'parametersClosed'] },
      { state: 'closing.closingRuntime', events: [...closed, 'fileManagerChanged'] },
      { state: 'closing.releasingAgentHost', events: [...closed, 'runtimeClosed'] },
      { state: 'closing.asking', events: [...flushed, 'projectedRunsChanged', 'close'] },
      { state: 'closing.releasingAgentHost', events: [...closed, 'fileManagerChanged', 'runtimeClosed'] },
      { state: 'closed', events: [...closed, 'runtimeClosed', done('releasingAgentHost')] },
      { state: 'closing.asking', events: [...flushed, 'projectedRunsChanged', 'close', 'fileManagerChanged'] },
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
