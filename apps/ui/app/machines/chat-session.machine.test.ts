import { util as zodUtility } from 'zod';
import { createActor } from 'xstate';
import { getShortestPaths } from 'xstate/graph';
import { describe, expect, it, vi } from 'vitest';

import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { MyUIMessage } from '@taucad/chat';
import * as machineModule from './chat-session.machine.js';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import { chatSessionIgnoredEvents, chatSessionMachine } from './chat-session.machine.js';
import type {
  ChatRequest,
  ChatSessionMachineEvent,
  ChatTurn,
  ChatTurnGesture,
  ChatTurnSettlementInput,
} from './chat-session.machine.js';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

const start = () => {
  const actor = createActor(chatSessionMachine, { input: { chatId: 'chat-1', projectId: 'proj_1' } });
  actor.start();
  return actor;
};

/** `state.value` of one region, as a dotted path. */
const regionPath = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  const [key, nested] = Object.entries(value as Record<string, unknown>)[0]!;
  return `${key}.${regionPath(nested)}`;
};

const runState = (actor: ReturnType<typeof start>): string =>
  regionPath((actor.getSnapshot().value as { run: unknown }).run);

const revisionState = (actor: ReturnType<typeof start>, facet: 'line' | 'tree' | 'sync'): string =>
  regionPath((actor.getSnapshot().value as { revision: Record<string, unknown> }).revision[facet]);

/**
 * The architecture's "Agent states, mapped to what the sidebar says" table.
 *
 * Every row is one state reached by its listed source event (D32). W20 renders
 * the glyph column; this suite owns the mapping.
 */
const agentStateRows: ReadonlyArray<{
  readonly signal: string;
  readonly events: readonly ChatSessionMachineEvent[];
  readonly run: string;
}> = [
  { signal: 'no session, no run', events: [], run: 'idle' },
  { signal: 'run.lifecycle: admitted', events: [{ type: 'runLifecycle', phase: 'admitted' }], run: 'queued.observing' },
  {
    signal: 'run.lifecycle: running with no tool part in flight',
    events: [{ type: 'runLifecycle', phase: 'running' }],
    run: 'running.generating',
  },
  {
    signal: 'tool part input-streaming / ACP tool_call in_progress',
    events: [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'toolParts', inFlight: 1, approvals: 0, toolName: 'write_file' },
    ],
    run: 'running.tool',
  },
  {
    signal: 'interrupt.recorded requested / ACP request_permission',
    events: [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'interruptRecorded', state: 'requested' },
    ],
    run: 'running.waiting.approval',
  },
  {
    signal: 'part approval-requested (batched)',
    events: [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'toolParts', inFlight: 1, approvals: 2, toolName: 'write_file' },
    ],
    run: 'running.waiting.approval',
  },
  {
    signal: 'run.lifecycle: paused (model asked a question)',
    events: [{ type: 'runLifecycle', phase: 'paused' }],
    run: 'running.waiting.input',
  },
  {
    signal: 'run.lifecycle: paused on an open approval (the log states the approval, then the pause)',
    events: [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'toolParts', inFlight: 0, approvals: 1 },
      { type: 'runLifecycle', phase: 'paused' },
    ],
    run: 'running.waiting.approval',
  },
  {
    signal: 'durableRunState: reattaching',
    events: [{ type: 'durableRunState', state: 'reattaching' }],
    run: 'running.reconnecting',
  },
  {
    signal: 'request lifecycle retrying',
    events: [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'requestLifecycle', phase: 'retrying' },
    ],
    run: 'running.reconnecting',
  },
  {
    signal: 'run.lifecycle: completed',
    events: [{ type: 'runLifecycle', phase: 'completed' }],
    run: 'done',
  },
  {
    signal: 'turn.finalized after run.lifecycle: completed does not change the run row',
    events: [
      { type: 'runLifecycle', phase: 'completed', runId: 'run-1' },
      { type: 'turnFinalizedObserved', runId: 'run-1', turnId: 'turn-1', branch: 'main' },
    ],
    run: 'done',
  },
  {
    signal: 'turn.failed after run.lifecycle: completed does not change the run row',
    events: [
      { type: 'runLifecycle', phase: 'completed', runId: 'run-1' },
      {
        type: 'turnFailedObserved',
        runId: 'run-1',
        turnId: 'turn-1',
        reason: 'revision cut failed',
      },
    ],
    run: 'done',
  },
  {
    signal: 'turn.conflicted after run.lifecycle: completed does not change the run row',
    events: [
      { type: 'runLifecycle', phase: 'completed', runId: 'run-1' },
      { type: 'turnConflictedObserved', runId: 'run-1', turnId: 'turn-1' },
    ],
    run: 'done',
  },
  {
    signal: 'run.lifecycle: failed',
    events: [{ type: 'runLifecycle', phase: 'failed', reason: 'Gateway refused' }],
    run: 'failed',
  },
  { signal: 'run.lifecycle: cancelled', events: [{ type: 'runLifecycle', phase: 'cancelled' }], run: 'stopped' },
  {
    signal: 'request lifecycle stopping',
    events: [
      { type: 'runLifecycle', phase: 'running' },
      { type: 'requestLifecycle', phase: 'stopping' },
    ],
    run: 'stopped',
  },
];

describe('chatSessionMachine', () => {
  it('starts headlessly and exports exactly one machine value', () => {
    const actor = start();

    expect(runState(actor)).toBe('idle');
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([chatSessionMachine]);

    actor.stop();
  });

  it.each(agentStateRows)('maps $signal to run.$run', ({ events, run }) => {
    const actor = start();
    for (const event of events) {
      actor.send(event);
    }

    expect(runState(actor)).toBe(run);

    actor.stop();
  });

  /*
   * V23 asks for `xstate/graph` coverage of `chat-session.run`.
   *
   * `getSimplePaths` is the blueprint's word (S47) and does not terminate here:
   * the run region is close to fully connected — `runLifecycle` reaches six
   * states from anywhere — so enumerating every acyclic path is factorial in
   * the edge count (measured: no answer in 200 s). `getShortestPaths` explores
   * the same graph and answers the question the row actually asks, which is
   * that every state in the agent-state table is reachable by a generated path.
   * `serializeState` collapses the other two regions so the graph is the run
   * region's, not its product with them.
   */
  it('covers every run state the agent-state table names with generated paths (V23)', () => {
    const paths = getShortestPaths(chatSessionMachine, {
      input: { chatId: 'chat-1', projectId: 'proj_1' },
      serializeState: (state) =>
        JSON.stringify([
          (state.value as { run: unknown }).run,
          state.context.toolsInFlight,
          state.context.pendingApprovalCount,
        ]),
      events: [
        { type: 'runLifecycle', phase: 'admitted' },
        { type: 'runLifecycle', phase: 'running' },
        { type: 'runLifecycle', phase: 'paused' },
        { type: 'runLifecycle', phase: 'completed', runId: 'run-1' },
        { type: 'runLifecycle', phase: 'failed' },
        { type: 'runLifecycle', phase: 'cancelled' },
        { type: 'turnFinalizedObserved', runId: 'run-1', turnId: 'turn-1', branch: 'main' },
        { type: 'turnFailedObserved', runId: 'run-1', turnId: 'turn-1', reason: 'revision cut failed' },
        { type: 'turnConflictedObserved', runId: 'run-1', turnId: 'turn-1' },
        { type: 'requestLifecycle', phase: 'retrying' },
        { type: 'requestLifecycle', phase: 'stopping' },
        { type: 'toolParts', inFlight: 1, approvals: 0 },
        { type: 'toolParts', inFlight: 0, approvals: 1 },
        { type: 'durableRunState', state: 'reattaching' },
        { type: 'close' },
      ] satisfies ChatSessionMachineEvent[],
    });
    const reached = new Set(
      paths.flatMap((path) => [
        regionPath((path.state.value as { run: unknown }).run),
        ...path.steps.map((step) => regionPath((step.state.value as { run: unknown }).run)),
      ]),
    );

    expect([...reached].sort()).toEqual(
      [
        'done',
        'failed',
        'idle',
        'queued.observing',
        'running.generating',
        'running.reconnecting',
        'running.tool',
        'running.waiting.approval',
        'running.waiting.input',
        'stopped',
      ].sort(),
    );
  });

  it('leaves the approval wait when the approvals clear, back to the tool that is still running', () => {
    const actor = start();
    actor.send({ type: 'runLifecycle', phase: 'running' });
    actor.send({ type: 'toolParts', inFlight: 1, approvals: 1, toolName: 'write_file' });
    expect(runState(actor)).toBe('running.waiting.approval');

    actor.send({ type: 'toolParts', inFlight: 1, approvals: 0 });

    expect(runState(actor)).toBe('running.tool');
    expect(actor.getSnapshot().context.toolName).toBe('write_file');
    actor.stop();
  });

  it('records the failure reason the row names', () => {
    const actor = start();
    actor.send({ type: 'runLifecycle', phase: 'failed', reason: 'Gateway refused' });

    expect(actor.getSnapshot().context.failureReason).toBe('Gateway refused');
    actor.stop();
  });

  it('holds no read state: unread is the store’s, derived from the log (PV-S8)', () => {
    const actor = start();
    actor.send({ type: 'runLifecycle', phase: 'completed' });

    expect(Object.keys(actor.getSnapshot().value as Record<string, unknown>).sort()).toEqual(['revision', 'run']);
    actor.stop();
  });

  it('tracks the revision facet the sidebar shows', () => {
    const actor = start();
    expect(revisionState(actor, 'line')).toBe('onMain');
    expect(revisionState(actor, 'tree')).toBe('clean');
    expect(revisionState(actor, 'sync')).toBe('synced');

    actor.send({ type: 'turnFinalized', branch: 'agent/idea-2' });
    actor.send({ type: 'dirtyChanged', dirty: true });
    actor.send({ type: 'syncState', state: 'pending' });

    expect(revisionState(actor, 'line')).toBe('onBranch');
    expect(actor.getSnapshot().context.branch).toBe('agent/idea-2');
    expect(revisionState(actor, 'tree')).toBe('dirty');
    expect(revisionState(actor, 'sync')).toBe('pending');

    actor.send({ type: 'syncState', state: 'conflicted' });
    expect(revisionState(actor, 'sync')).toBe('conflicted');

    actor.send({ type: 'turnFinalized', branch: 'main' });
    actor.send({ type: 'dirtyChanged', dirty: false });
    actor.send({ type: 'syncState', state: 'synced' });
    expect(revisionState(actor, 'line')).toBe('onMain');
    expect(revisionState(actor, 'tree')).toBe('clean');
    expect(revisionState(actor, 'sync')).toBe('synced');
    actor.stop();
  });

  it('reads Stopped when the chat is closed, and stays alive (P63)', () => {
    const actor = start();
    actor.send({ type: 'runLifecycle', phase: 'running' });
    actor.send({ type: 'toolParts', inFlight: 1, approvals: 1 });

    actor.send({ type: 'close' });

    /* A person's Close is not a teardown: the store cancels the run and the
     * row keeps reading `Stopped`, so the actor stays alive until the store's
     * own teardown stops its root (PV-S5). */
    expect(actor.getSnapshot().status).toBe('active');
    expect(runState(actor)).toBe('stopped');
    expect(actor.getSnapshot().context.pendingApprovalCount).toBe(0);
    actor.stop();
  });

  it('emits statusChanged for every visible move, and never for a token-free no-op', () => {
    const actor = start();
    const seen: string[] = [];
    actor.on('statusChanged', (event) => seen.push(event.chatId));

    actor.send({ type: 'runLifecycle', phase: 'running' });
    actor.send({ type: 'runLifecycle', phase: 'completed' });

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(new Set(seen)).toEqual(new Set(['chat-1']));
    actor.stop();
  });

  it('keeps a serializable snapshot with no function-valued context', () => {
    const actor = start();
    actor.send({ type: 'runLifecycle', phase: 'running' });

    const persisted = actor.getPersistedSnapshot();
    const context: Record<string, unknown> =
      'context' in persisted && zodUtility.isObject(persisted.context) ? persisted.context : {};
    expect(Object.keys(context)).not.toEqual([]);
    for (const [key, value] of Object.entries(context)) {
      expect(typeof value, key).not.toBe('function');
    }
    expect(() => JSON.stringify({ ...context, parentRef: undefined })).not.toThrow();
    actor.stop();
  });

  it('starts and stops without a page-owned host binding', () => {
    const actor = start();
    actor.send({ type: 'runLifecycle', phase: 'running' });

    expect(Object.keys(actor.getSnapshot().children)).toEqual([]);

    actor.stop();
    expect(actor.getSnapshot().status).toBe('stopped');
  });
});

/*
 * The chat's turn, owned here (C3, policy §16).
 *
 * `queued` admits; the daemon owns settlement and a terminal lifecycle ends
 * this page's record of the run.
 */
describe('chatSessionMachine run ownership', () => {
  const turnOf = (runId: string, leaseTurnId: string): ChatTurn => ({
    runId,
    leaseTurnId,
    request: { kind: 'regenerate' },
  });

  /** A scripted admission; the settlement actor remains provided by the store during cutover. */
  const turnActors = (
    script: {
      readonly admit?: (input: { readonly chatId: string; readonly gesture: ChatTurnGesture }) => Promise<ChatTurn>;
      readonly settle?: (input: ChatTurnSettlementInput) => Promise<void>;
    } = {},
  ) => {
    const admissions: Array<{ readonly chatId: string; readonly gesture: ChatTurnGesture }> = [];
    const settlements: ChatTurnSettlementInput[] = [];
    /* No `signal.aborted` branch here: a fixture that models abandonment is a
     * fixture asserting itself (I8). The real `chatTurnAdmission` releases the
     * lease it took, and `chat-host-binding.test.ts` drives that path. */
    const admit = fromSafeAsync<{ type: 'turnAdmitted'; turn: ChatTurn }, { chatId: string; gesture: ChatTurnGesture }>(
      async ({ input }) => {
        admissions.push(input);
        const turn = await (script.admit?.(input) ?? Promise.resolve(turnOf('run-1', 'user-1')));
        return { type: 'turnAdmitted', turn };
      },
    );
    const settle = fromSafeAsync<void, ChatTurnSettlementInput>(async ({ input }) => {
      settlements.push(input);
      await (script.settle?.(input) ?? Promise.resolve());
    });
    return { admissions, settlements, actors: { admitTurn: admit, settleTurn: settle } };
  };

  const startOwning = (actors: ReturnType<typeof turnActors>['actors']) => {
    const actor = createActor(chatSessionMachine.provide({ actors }), {
      input: { chatId: 'chat-1', projectId: 'proj_1' },
    });
    actor.start();
    return actor;
  };

  const sendGesture: ChatTurnGesture = { kind: 'regenerate' };

  it('ends an admitted turn at the terminal run row without invoking page settlement', async () => {
    const script = turnActors();
    const actor = startOwning(script.actors);

    actor.send({ type: 'requestTurn', gesture: sendGesture });
    await vi.waitFor(() => {
      expect(runState(actor)).toBe('queued.dispatched');
    });
    actor.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-1' });

    expect(runState(actor)).toBe('done');
    expect(actor.getSnapshot().context.turn).toBeUndefined();
    expect(script.settlements).toEqual([]);
    actor.stop();
  });

  it('admits a held gesture when the preceding run ends', async () => {
    const script = turnActors();
    const actor = startOwning(script.actors);

    actor.send({ type: 'requestTurn', gesture: sendGesture });
    await vi.waitFor(() => {
      expect(runState(actor)).toBe('queued.dispatched');
    });
    actor.send({ type: 'requestTurn', gesture: { kind: 'edit', messageId: 'user-1', text: 'Edited.' } });
    expect(runState(actor)).toBe('queued.dispatched');
    expect(script.admissions).toHaveLength(1);
    actor.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-1' });
    await vi.waitFor(() => {
      expect(script.admissions).toHaveLength(2);
    });
    expect(script.admissions[1]?.gesture).toEqual({ kind: 'edit', messageId: 'user-1', text: 'Edited.' });
    expect(script.settlements).toEqual([]);

    actor.stop();
  });

  it('should hold only the replacing gesture\u2019s turn when a second gesture replaces an admission', async () => {
    const first = Promise.withResolvers<ChatTurn>();
    const script = turnActors({
      admit: async ({ gesture }) => (gesture.kind === 'regenerate' ? first.promise : turnOf('run-2', 'user-2')),
    });
    const actor = startOwning(script.actors);
    const dispatched: Array<{ readonly request: unknown }> = [];
    actor.on('startTurnRequest', (event) => dispatched.push(event));

    actor.send({ type: 'requestTurn', gesture: sendGesture });
    actor.send({ type: 'requestTurn', gesture: { kind: 'edit', messageId: 'user-2', text: 'Second.' } });
    await vi.waitFor(() => {
      expect(runState(actor)).toBe('queued.dispatched');
    });

    /* The replaced admission answers late. Its turn is not this chat's: the
     * actor that took its lease releases it, and nothing here adopts it. */
    first.resolve(turnOf('run-1', 'user-1'));
    await vi.waitFor(() => {
      expect(dispatched).toHaveLength(1);
    });
    expect(actor.getSnapshot().context.turn).toEqual(turnOf('run-2', 'user-2'));
    expect(runState(actor)).toBe('queued.dispatched');

    actor.stop();
  });

  it('records a failed run without invoking page settlement', async () => {
    const script = turnActors();
    const actor = startOwning(script.actors);

    actor.send({ type: 'requestTurn', gesture: sendGesture });
    await vi.waitFor(() => {
      expect(runState(actor)).toBe('queued.dispatched');
    });
    actor.send({ type: 'runLifecycle', phase: 'failed', runId: 'run-1', reason: 'Refused once.' });

    expect(script.settlements).toEqual([]);
    expect(runState(actor)).toBe('failed');
    expect(actor.getSnapshot().context.failureReason).toBe('Refused once.');

    actor.stop();
  });

  /* V5, on a chat that actually owns a turn. The row this replaces sent
   * `adoptRun` twice into a chat that never admitted anything, so it proved
   * only that `idle` is left behind — never that discovery cannot retire a live
   * turn, which is what V5 says. */
  it('should ignore adoptRun once this chat owns a turn', async () => {
    const script = turnActors();
    const actor = startOwning(script.actors);

    actor.send({ type: 'requestTurn', gesture: sendGesture });
    await vi.waitFor(() => {
      expect(runState(actor)).toBe('queued.dispatched');
    });

    actor.send({ type: 'adoptRun', runId: 'run-other' });

    expect(runState(actor)).toBe('queued.dispatched');
    expect(actor.getSnapshot().context.activeRunId).toBe('run-1');
    expect(actor.getSnapshot().context.turn).toEqual(turnOf('run-1', 'user-1'));

    actor.stop();
  });

  /* T3-D10: `adoptRun` was accepted only in `idle`, so a chat whose machine had
   * already reached a terminal state while a run of that chat was still live
   * elsewhere showed a terminal row and let the next gesture lease a second
   * checkout over the live run. The guard is what enforces V5, not the state. */
  it('should adopt a discovered run from a terminal state when it holds no turn', async () => {
    const script = turnActors();
    const actor = startOwning(script.actors);

    actor.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-1' });
    actor.send({ type: 'turnFinalizedObserved', runId: 'run-1', turnId: 'user-1' });
    expect(runState(actor)).toBe('done');

    actor.send({ type: 'adoptRun', runId: 'run-elsewhere' });

    expect(runState(actor)).toBe('running.reconnecting');
    expect(actor.getSnapshot().context.activeRunId).toBe('run-elsewhere');

    actor.stop();
  });

  /* W10-1: discovery must not reach *into* a turn this chat is taking. The
   * guard `hasNoOwnTurn` is true for the whole admission window — the lease is
   * taken before `turn` exists — so an `adoptRun` sent from `#bindSessionOwner`
   * (a rebind with a live `browserRuns` entry) stopped the admission actor and
   * took the person's parked message with it. */
  it('should ignore adoptRun while an admission is in flight', async () => {
    const admitted = Promise.withResolvers<ChatTurn>();
    const script = turnActors({ admit: async () => admitted.promise });
    const actor = startOwning(script.actors);

    actor.send({ type: 'requestTurn', gesture: sendGesture });
    expect(runState(actor)).toBe('queued.admitting');

    actor.send({ type: 'adoptRun', runId: 'run-elsewhere' });

    expect(runState(actor)).toBe('queued.admitting');
    admitted.resolve(turnOf('run-1', 'user-1'));
    await vi.waitFor(() => {
      expect(runState(actor)).toBe('queued.dispatched');
    });
    expect(actor.getSnapshot().context.turn).toEqual(turnOf('run-1', 'user-1'));

    actor.stop();
  });

  /**
   * V2 on a run this page adopted: the gesture made over it is held, and the
   * thing that releases it is the run ending. The held gesture has to be admitted there too
   * — navigating away mid-turn and back left the second message queued behind
   * a run that had already finished.
   */
  it('should admit a gesture held over an adopted run when its lifecycle ends', async () => {
    const script = turnActors();
    const actor = startOwning(script.actors);

    actor.send({ type: 'adoptRun', runId: 'run-adopted' });
    expect(runState(actor)).toBe('running.reconnecting');

    actor.send({ type: 'requestTurn', gesture: sendGesture });
    expect(script.admissions).toEqual([]);

    actor.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-adopted' });

    await vi.waitFor(() => {
      expect(script.admissions).toHaveLength(1);
    });
    expect(script.admissions[0]?.gesture).toEqual(sendGesture);

    actor.stop();
  });

  /*
   * V1/V2 in `queued.dispatched`. The lease is held and the request is out, but
   * the transport reports `running` only once bytes flow — so a gesture made
   * here is over a live turn exactly as one made in `running` is. Deleting this
   * state's own `requestTurn` handler sends the gesture to the root's, which
   * re-enters `queued.admitting` and leases a second checkout, and no row
   * anywhere noticed.
   */
  it('should hold a gesture made in queued.dispatched rather than lease a second checkout', async () => {
    const script = turnActors();
    const actor = startOwning(script.actors);
    const interrupts: unknown[] = [];
    actor.on('stopTurnRequest', (event) => interrupts.push(event));

    actor.send({ type: 'requestTurn', gesture: sendGesture });
    await vi.waitFor(() => {
      expect(runState(actor)).toBe('queued.dispatched');
    });

    actor.send({ type: 'requestTurn', gesture: { kind: 'edit', messageId: 'user-1', text: 'Second.' } });

    expect(runState(actor)).toBe('queued.dispatched');
    expect(script.admissions).toHaveLength(1);
    expect(interrupts).toHaveLength(1);
    expect(actor.getSnapshot().context.pendingGesture).toEqual({
      kind: 'edit',
      messageId: 'user-1',
      text: 'Second.',
    });

    actor.stop();
  });

  /* V1/V2 in `queued.observing`: a run this page did not admit. There is
   * nothing to admit over it either, and the gesture waits for it to settle. */
  it('should hold a gesture made over an admitted run this page did not start', async () => {
    const script = turnActors();
    const actor = startOwning(script.actors);
    const interrupts: unknown[] = [];
    actor.on('stopTurnRequest', (event) => interrupts.push(event));

    actor.send({ type: 'runLifecycle', phase: 'admitted', runId: 'run-elsewhere' });
    expect(runState(actor)).toBe('queued.observing');

    actor.send({ type: 'requestTurn', gesture: sendGesture });

    expect(runState(actor)).toBe('queued.observing');
    expect(script.admissions).toEqual([]);
    expect(interrupts).toHaveLength(1);
    expect(actor.getSnapshot().context.pendingGesture).toEqual(sendGesture);

    actor.stop();
  });

  /*
   * T3-D7. `ChatTurn.runId` is `string | undefined` precisely so a `continue`
   * can carry "no new run" — it resumes the run the host already has. Adopting
   * that `undefined` as the chat's run identity would lose the resumed run.
   */
  it('should keep the active run id when a turn mints none', async () => {
    const script = turnActors({
      admit: async () => ({ runId: undefined, leaseTurnId: undefined, request: { kind: 'continue' } }),
    });
    const actor = startOwning(script.actors);

    actor.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-1' });
    actor.send({ type: 'turnFinalizedObserved', runId: 'run-1', turnId: 'user-1' });
    expect(runState(actor)).toBe('done');

    actor.send({ type: 'requestTurn', gesture: { kind: 'continue' } });
    await vi.waitFor(() => {
      expect(runState(actor)).toBe('queued.dispatched');
    });

    expect(actor.getSnapshot().context.activeRunId).toBe('run-1');

    actor.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-1' });
    expect(runState(actor)).toBe('done');
    expect(script.settlements).toEqual([]);

    actor.stop();
  });

  it('should refuse to dispatch a turn no host can admit', async () => {
    const script = turnActors({
      admit: async () => {
        throw new Error('Browser agent host is not configured for this chat.');
      },
    });
    const actor = startOwning(script.actors);
    const dispatched: unknown[] = [];
    actor.on('startTurnRequest', (event) => dispatched.push(event));

    actor.send({ type: 'requestTurn', gesture: sendGesture });

    await vi.waitFor(() => {
      expect(runState(actor)).toBe('failed');
    });
    expect(actor.getSnapshot().context.failureReason).toBe('Browser agent host is not configured for this chat.');
    expect(dispatched).toEqual([]);
    expect(script.settlements).toEqual([]);

    actor.stop();
  });

  it('should dispatch exactly what the admission composed', async () => {
    const message: MyUIMessage = { id: 'user-9', role: 'user', parts: [] };
    const request: ChatRequest = { kind: 'send', message };
    const script = turnActors({
      admit: async (): Promise<ChatTurn> => ({ runId: 'run-9', leaseTurnId: 'user-9', request }),
    });
    const actor = startOwning(script.actors);
    const dispatched: Array<{ readonly chatId: string; readonly request: unknown }> = [];
    actor.on('startTurnRequest', (event) => dispatched.push(event));

    actor.send({ type: 'requestTurn', gesture: { kind: 'send', message } });

    await vi.waitFor(() => {
      expect(dispatched).toHaveLength(1);
    });
    expect(dispatched[0]).toMatchObject({ chatId: 'chat-1', request });
    expect(actor.getSnapshot().context.turn).toEqual({ runId: 'run-9', leaseTurnId: 'user-9', request });

    actor.stop();
  });
});

describe('chatSessionMachine — the machine contract (PV-S5, MC-R17)', () => {
  const events = [
    ...(['admitted', 'running', 'paused', 'completed', 'cancelled'] as const).map(
      (phase) => ({ type: 'runLifecycle', phase, runId: 'r' }) as const,
    ),
    { type: 'runLifecycle', phase: 'failed', runId: 'r', reason: 'x' },
    { type: 'requestTurn', gesture: { kind: 'continue' } },
    {
      type: 'turnAdmitted',
      turn: { runId: 'r', leaseTurnId: 't', request: { kind: 'continue' } },
    },
    { type: 'adoptRun', runId: 'r' },
    { type: 'reconcileSettlement', runId: 'r', outcome: 'completed' },
    { type: 'interruptRecorded', state: 'requested' },
    { type: 'interruptRecorded', state: 'resolved' },
    { type: 'toolParts', inFlight: 1, approvals: 0 },
    { type: 'toolParts', inFlight: 0, approvals: 1 },
    { type: 'toolParts', inFlight: 0, approvals: 0 },
    ...(['invoking', 'retrying', 'stopping', 'idle'] as const).map(
      (phase) => ({ type: 'requestLifecycle', phase }) as const,
    ),
    { type: 'durableRunState', state: 'reattaching' },
    { type: 'durableRunState', state: 'active' },
    { type: 'close' },
    { type: 'turnFinalized', branch: 'main' },
    { type: 'turnFinalizedObserved', runId: 'r' },
    { type: 'turnFailedObserved', runId: 'r', reason: 'x' },
    { type: 'turnConflictedObserved', runId: 'r' },
    { type: 'dirtyChanged', dirty: true },
    { type: 'syncState', state: 'pending' },
  ] satisfies ChatSessionMachineEvent[];

  it('answers every sampled event, or declares it ignored, in every reachable state', () => {
    expect(
      unansweredEvents(chatSessionMachine, {
        input: { chatId: 'chat-1', projectId: 'proj_1' },
        events,
        limit: 100_000,
        ignore: chatSessionIgnoredEvents,
        serializeState: (snapshot) =>
          JSON.stringify([
            snapshot.value,
            snapshot.context.turn !== undefined,
            snapshot.context.pendingGesture !== undefined,
            snapshot.context.pendingApprovalCount > 0,
            snapshot.context.toolsInFlight > 0,
          ]),
      }),
    ).toEqual([]);
  });

  it('leaves no dead letter, unanswered delivery or fault over a turn lifecycle', () => {
    const guard = guardActors({ ignore: { 'chat-session': chatSessionIgnoredEvents } });
    const actor = createActor(chatSessionMachine, {
      input: { chatId: 'chat-1', projectId: 'proj_1' },
      inspect: guard.inspect,
    }).start();
    actor.send({ type: 'runLifecycle', phase: 'admitted', runId: 'run-1' });
    actor.send({ type: 'runLifecycle', phase: 'running', runId: 'run-1' });
    actor.send({ type: 'toolParts', inFlight: 1, approvals: 0 });
    actor.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-1' });
    actor.send({ type: 'turnFinalizedObserved', runId: 'run-1', turnId: 'turn-1' });
    expect(actor.getSnapshot().matches({ run: 'done' })).toBe(true);
    actor.stop();
  });
});
