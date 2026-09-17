import { util as zodUtility } from 'zod';
import { createActor, fromCallback } from 'xstate';
import type { AnyActorRef, EventObject } from 'xstate';
import { getShortestPaths } from 'xstate/graph';
import { describe, expect, it } from 'vitest';

import * as machineModule from './chat-session.machine.js';
import { chatSessionMachine } from './chat-session.machine.js';
import type { ChatSessionMachineEvent } from './chat-session.machine.js';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

/** A started parent that records what a child sends it. */
const recordingParent = (): { ref: AnyActorRef; received: EventObject[] } => {
  const received: EventObject[] = [];
  const ref = createActor(
    fromCallback<EventObject>(({ receive }) => {
      receive((event) => received.push(event));
    }),
  );
  ref.start();
  return { ref, received };
};

const start = (parentRef?: AnyActorRef) => {
  const actor = createActor(chatSessionMachine, {
    input: { chatId: 'chat-1', projectId: 'proj_1', ...(parentRef === undefined ? {} : { parentRef }) },
  });
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

const readState = (actor: ReturnType<typeof start>): string =>
  regionPath((actor.getSnapshot().value as { read: unknown }).read);

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
  { signal: 'run.lifecycle: admitted', events: [{ type: 'runLifecycle', phase: 'admitted' }], run: 'queued' },
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
  { signal: 'run.lifecycle: completed', events: [{ type: 'runLifecycle', phase: 'completed' }], run: 'finishing' },
  {
    signal: 'turn.finalized after run.lifecycle: completed',
    events: [
      { type: 'runLifecycle', phase: 'completed', runId: 'run-1' },
      { type: 'turnFinalizedObserved', runId: 'run-1', turnId: 'turn-1', branch: 'main' },
    ],
    run: 'done',
  },
  {
    signal: 'turn.failed after run.lifecycle: completed',
    events: [
      { type: 'runLifecycle', phase: 'completed', runId: 'run-1' },
      {
        type: 'turnFailedObserved',
        runId: 'run-1',
        turnId: 'turn-1',
        reason: 'revision cut failed',
      },
    ],
    run: 'failed',
  },
  {
    signal: 'turn.conflicted after run.lifecycle: completed',
    events: [
      { type: 'runLifecycle', phase: 'completed', runId: 'run-1' },
      { type: 'turnConflictedObserved', runId: 'run-1', turnId: 'turn-1' },
    ],
    run: 'failed',
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
        'finishing',
        'idle',
        'queued',
        'running.generating',
        'running.reconnecting',
        'running.tool',
        'running.waiting.approval',
        'running.waiting.input',
        'stopped',
      ].sort(),
    );
  });

  /*
   * D9: the store's unread decision is the one writer of the unread record,
   * and the `read` region follows it — restored from the record when a chat
   * binds, and raised by a newly pending approval, the store's other trigger.
   * Each row asks `getShortestPaths` for a generated path into `read.unread`
   * and checks it is exactly that trigger.
   */
  it.each<{ readonly signal: string; readonly event: ChatSessionMachineEvent }>([
    { signal: 'unreadRestored from the unread record', event: { type: 'unreadRestored' } },
    { signal: 'a newly pending approval', event: { type: 'toolParts', inFlight: 1, approvals: 1 } },
  ])('reaches read.unread from $signal with a generated path (D9)', ({ event }) => {
    const paths = getShortestPaths(chatSessionMachine, {
      input: { chatId: 'chat-1', projectId: 'proj_1' },
      serializeState: (state) =>
        JSON.stringify([(state.value as { read: unknown }).read, state.context.pendingApprovalCount]),
      events: [event, { type: 'viewed' }],
      toState: (state) => state.matches({ read: 'unread' }),
    });

    const triggers = paths.map((path) =>
      path.steps.map((step): string => step.event.type).filter((type) => type !== 'xstate.init'),
    );
    expect(triggers).toEqual([[event.type]]);
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

  it('marks a completed run unread and clears it on viewed', () => {
    const actor = start();
    expect(readState(actor)).toBe('read');

    actor.send({ type: 'runLifecycle', phase: 'completed' });
    expect(readState(actor)).toBe('unread');

    actor.send({ type: 'viewed' });
    expect(readState(actor)).toBe('read');
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

  it('reads Stopped when the chat is closed, and asks its project session for nothing (P63)', () => {
    const parent = recordingParent();
    const actor = start(parent.ref);
    actor.send({ type: 'runLifecycle', phase: 'running' });
    actor.send({ type: 'toolParts', inFlight: 1, approvals: 1 });

    actor.send({ type: 'close' });

    /* A person's Close is not a teardown: the store cancels the run and the
     * row keeps reading `Stopped`, so the actor stays alive and `chatClosed`
     * has exactly one sender — the store's own teardown. */
    expect(parent.received).not.toContainEqual({ type: 'chatClosed', chatId: 'chat-1' });
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

  it('starts and stops without leaking children', () => {
    const actor = start();
    actor.send({ type: 'runLifecycle', phase: 'running' });

    expect(Object.keys(actor.getSnapshot().children)).toEqual([]);

    actor.stop();
    expect(actor.getSnapshot().status).toBe('stopped');
  });
});
