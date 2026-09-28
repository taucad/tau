/**
 * One chat's projection of its own log (W9 PV-S7, blueprint §5.6).
 *
 * It advances W3's ledger with W3's read fold, so a batch that does not start at
 * the projection's cursor is discarded and a refusal resets it (PV-R15), and it
 * keeps the one run fact the ledger does not: the tool calls still open, updated
 * per row. Its context is JSON-safe records. Run phase, open interrupts and tools
 * in flight are selects over it; the page's copies of them go (G02–G04).
 *
 * ponytail: the run views, chunks and live overlay of §5.6 land with the steps
 * that read them (PV-S11, PV-S12, PV-S15); this step needs only the ledger and the
 * open tool calls.
 */

import { createLogic } from 'xstate';
import { emptyChatLedger, foldReadAnswer } from '@taucad/agent-host';
import type { ChatLedger, RowKey, TurnPlacement } from '@taucad/agent-host';
import { runFailureText } from '#services/agent-host-event-projection.js';

/** One read's answer, as the host's `read` and `attach` return it (W3 CL-R13). @public */
export type ChatProjectionReadAnswer = Parameters<typeof foldReadAnswer>[1];

/** A tool call the log opened (`tool-input`) and has not closed (`tool-output` or its run's end). @public */
export type OpenToolCall = Readonly<{ runId: string; toolName: string }>;

/** @public */
export type ChatProjection = Readonly<{
  ledger: ChatLedger;
  /** Open tool calls by call id, in the order they opened. */
  openTools: Readonly<Record<string, OpenToolCall>>;
  /** The log's end as the last answer stated it; the projection holds the whole log once its cursor reaches it. */
  endCursor: number;
  /** What the last `failed` row said, for the run it failed; cleared by that run's next lifecycle row. */
  failure?: Readonly<{ runId: string; text: string }>;
  /** The newest row that asks for the person: a run that completed or failed, or an interrupt it opened (PV-S8). */
  attentionRow?: RowKey;
  /** Why the log could not be read (`unreadable`); the chat reads and runs nothing. */
  fault?: string;
}>;

/** @public */
export type ChatProjectionEvent =
  | Readonly<{ type: 'batch'; answer: ChatProjectionReadAnswer }>
  /** The reader starts over from cursor 0 (a refusal, or a new reader). */
  | Readonly<{ type: 'reset' }>;

/** What the projection tells its reader. @public */
export type ChatProjectionEmitted =
  /** Discard what you read and read again from cursor 0 (SC-R12). */
  | Readonly<{ type: 'reread' }>
  /** The batch did not start at this cursor: read again from `selectPosition`. */
  | Readonly<{ type: 'stale' }>;

/** @public */
export const initialChatProjection: ChatProjection = Object.freeze({
  ledger: emptyChatLedger,
  openTools: {},
  endCursor: 0,
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const endedLifecycles: ReadonlySet<unknown> = new Set(['paused', 'completed', 'failed', 'cancelled']);

/**
 * Apply one row to the open tool calls: O(1) per row, except a run's end, which
 * closes that run's calls (L3 D19).
 *
 * @param open - The calls open before the row.
 * @param row - One row, unparsed: a row this reader does not know changes nothing (D14).
 * @returns The calls open after it; the same object when the row changes nothing.
 */
const applyToolRow = (open: Record<string, OpenToolCall>, row: unknown): Record<string, OpenToolCall> => {
  if (!isRecord(row) || typeof row['runId'] !== 'string') {
    return open;
  }
  const { runId } = row;
  if (row['type'] === 'run.lifecycle') {
    if (!endedLifecycles.has(row['state'])) {
      return open;
    }
    for (const [callId, call] of Object.entries(open)) {
      if (call.runId === runId) {
        // oxlint-disable-next-line typescript/no-dynamic-delete -- `open` is this batch's own copy; a delete is O(1) (D19).
        delete open[callId];
      }
    }
    return open;
  }
  const message = row['type'] === 'message.appended' ? row['message'] : undefined;
  if (!isRecord(message) || typeof message['toolCallId'] !== 'string') {
    return open;
  }
  if (message['role'] === 'tool-input' && typeof message['toolName'] === 'string') {
    open[message['toolCallId']] = { runId, toolName: message['toolName'] };
  } else if (message['role'] === 'tool-output') {
    // oxlint-disable-next-line typescript/no-dynamic-delete -- `open` is this batch's own copy; a delete is O(1) (D19).
    delete open[message['toolCallId']];
  }
  return open;
};

/**
 * Keep what a `failed` row said about its run until that run's next lifecycle row.
 *
 * @param failure - The failure held before the row.
 * @param row - One row, unparsed.
 * @returns The failure held after it.
 */
const applyFailureRow = (failure: ChatProjection['failure'], row: unknown): ChatProjection['failure'] => {
  if (!isRecord(row) || row['type'] !== 'run.lifecycle' || typeof row['runId'] !== 'string') {
    return failure;
  }
  if (row['state'] === 'failed') {
    return { runId: row['runId'], text: runFailureText(row['detail']) };
  }
  return failure?.runId === row['runId'] ? undefined : failure;
};

/**
 * The row's key when it asks for the person (§5.8): a run that completed or failed, or an interrupt it opened. A
 * cancelled run is the person's own doing and asks for nothing.
 *
 * @param row - One row, unparsed.
 * @returns Its key, or `undefined`.
 */
const attentionKeyOf = (row: unknown): RowKey | undefined => {
  if (!isRecord(row) || typeof row['leaderEpoch'] !== 'string' || typeof row['sequence'] !== 'number') {
    return undefined;
  }
  const asks =
    (row['type'] === 'run.lifecycle' && (row['state'] === 'completed' || row['state'] === 'failed')) ||
    (row['type'] === 'interrupt.recorded' && row['phase'] === 'requested');
  return asks ? { leaderEpoch: row['leaderEpoch'], sequence: row['sequence'] } : undefined;
};

type ProjectionStep = Readonly<{ state: ChatProjection; emit?: ChatProjectionEmitted }>;

/**
 * Drop the rows of a batch this projection already holds (SC-R12): a stream that starts over replays the log from
 * row 0, and only its rows past this cursor are new.
 *
 * @param answer - The answer as read.
 * @param cursor - The projection's cursor.
 * @returns The answer from `cursor` on; `undefined` when it holds nothing new.
 */
const fromCursor = (answer: ChatProjectionReadAnswer, cursor: number): ChatProjectionReadAnswer | undefined => {
  if (answer.status !== 'batch' || answer.cursor >= cursor || answer.events.length === 0) {
    return answer;
  }
  if (answer.nextCursor <= cursor) {
    return undefined;
  }
  return { ...answer, cursor, events: answer.events.slice(cursor - answer.cursor) };
};

/**
 * The projection's reducer: total, and it never throws (RB1).
 *
 * @param state - The projection before the event.
 * @param event - One read's answer, or a reset.
 * @returns The projection after it, and what its reader must do next.
 * @public
 */
export const reduceChatProjection = (state: ChatProjection, event: ChatProjectionEvent): ProjectionStep => {
  if (event.type === 'reset') {
    return { state: initialChatProjection };
  }
  /* Any batch states where the log ends, even one this projection already holds or cannot fold yet. */
  const endCursor =
    event.answer.status === 'batch' ? Math.max(state.endCursor, event.answer.endCursor) : state.endCursor;
  const held = endCursor === state.endCursor ? state : { ...state, endCursor };
  const answer = fromCursor(event.answer, state.ledger.position.cursor);
  if (answer === undefined) {
    return { state: held };
  }
  const fold = foldReadAnswer(state.ledger, answer);
  switch (fold.kind) {
    case 'folded': {
      if (fold.ledger === state.ledger || answer.status !== 'batch') {
        return { state: held };
      }
      let open: Record<string, OpenToolCall> | undefined;
      let { failure, attentionRow } = state;
      for (const row of answer.events) {
        open = applyToolRow(open ?? { ...state.openTools }, row);
        failure = applyFailureRow(failure, row);
        attentionRow = attentionKeyOf(row) ?? attentionRow;
      }
      return {
        state: {
          ledger: fold.ledger,
          openTools: open ?? state.openTools,
          endCursor,
          ...(failure === undefined ? {} : { failure }),
          ...(attentionRow === undefined ? {} : { attentionRow }),
          ...(state.fault === undefined ? {} : { fault: state.fault }),
        },
      };
    }
    case 'stale': {
      return { state: held, emit: { type: 'stale' } };
    }
    case 'reset': {
      return { state: initialChatProjection, emit: { type: 'reread' } };
    }
    case 'refused': {
      /* `owner-fenced` keeps the state: the reader reconnects to the newer owner (§5.5). */
      return fold.reason === 'unreadable' ? { state: { ...held, fault: 'unreadable' } } : { state: held };
    }
  }
};

/**
 * The projection as an actor: `@xstate.init` and every foreign event change nothing (L1 N13, MC-R20).
 *
 * @public
 */
export const chatProjectionLogic = createLogic<
  ChatProjection,
  unknown,
  ChatProjectionEvent | Readonly<{ type: string }>,
  undefined,
  ChatProjectionEmitted
>({
  id: 'chatProjection',
  context: initialChatProjection,
  run: ({ context, event }, enq) => {
    if (event.type !== 'batch' && event.type !== 'reset') {
      return undefined;
    }
    const step = reduceChatProjection(context, event as ChatProjectionEvent);
    if (step.emit !== undefined) {
      enq.emit(step.emit);
    }
    return step.state === context ? undefined : { context: step.state };
  },
});

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

/** The chat's current run: the run of its last lifecycle row. @public */
export const selectCurrentRun = (
  projection: ChatProjection,
): (Readonly<{ runId: string }> & ChatLedger['runs'][string]) | undefined => {
  const runId = projection.ledger.currentRunId;
  const run = runId === undefined ? undefined : projection.ledger.runs[runId];
  return runId === undefined || run === undefined ? undefined : { runId, ...run };
};

/** @public */
export type ChatRunPhase = 'none' | 'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * The current run's lifecycle, replacing `lastState.phase` and `#syncRunPhase` (G02).
 *
 * @param projection - The chat's projection.
 * @returns Its phase; `none` before any lifecycle row.
 * @public
 */
export const selectRunPhase = (projection: ChatProjection): ChatRunPhase =>
  selectCurrentRun(projection)?.lifecycle ?? 'none';

/**
 * The current run's open interrupts, replacing `pendingApprovalCount` and the approval scans (G03).
 *
 * @param projection - The chat's projection.
 * @returns Each open interrupt's id and the row that requested it.
 * @public
 */
export const selectOpenInterrupts = (projection: ChatProjection): Readonly<Record<string, RowKey>> =>
  selectCurrentRun(projection)?.pendingInterrupts ?? {};

/**
 * The tool calls in flight and the newest one's name, replacing the per-chunk scans (G04, L3 D19).
 *
 * @param projection - The chat's projection.
 * @returns How many calls are open, and the last opened call's tool.
 * @public
 */
export const selectToolsInFlight = (projection: ChatProjection): Readonly<{ count: number; toolName?: string }> => {
  const calls = Object.values(projection.openTools);
  const last = calls.at(-1);
  return last === undefined ? { count: 0 } : { count: calls.length, toolName: last.toolName };
};

/**
 * Whether the projection holds the log to the end its last answer stated. A replay's earlier pages hold history, so
 * the page reports a run's phase only once this holds.
 *
 * @param projection - The chat's projection.
 * @returns Whether the reader has caught up.
 * @public
 */
export const selectCaughtUp = (projection: ChatProjection): boolean =>
  projection.ledger.position.cursor >= projection.endCursor;

/**
 * Why a run failed, as its `failed` row said.
 *
 * @param projection - The chat's projection.
 * @param runId - The run.
 * @returns The failure's text, while that run's last lifecycle row is `failed`.
 * @public
 */
export const selectRunFailure = (projection: ChatProjection, runId: string): string | undefined =>
  projection.failure?.runId === runId ? projection.failure.text : undefined;

/**
 * The row unread compares with the chat's read receipt (§5.8, LT01).
 *
 * @param projection - The chat's projection.
 * @returns The newest attention row, or `undefined` while the log holds none.
 * @public
 */
export const selectAttentionRow = (projection: ChatProjection): RowKey | undefined => projection.attentionRow;

/**
 * Where a reader of this chat's log resumes: exactly what a `read` sends.
 *
 * @param projection - The chat's projection.
 * @returns The cursor and the last folded row's key.
 * @public
 */
export const selectPosition = (projection: ChatProjection): ChatLedger['position'] => projection.ledger.position;

/** What a turn's newest attempt says about its revision (§5.8): the log facts the revision card reads. @public */
export type TurnRevisionLog = Readonly<{
  attempt: number;
  /** The attempt's terminal lifecycle, once its terminal row is folded. */
  terminal?: 'completed' | 'failed' | 'cancelled';
  /** The attempt waits on the person: it paused, or an interrupt it opened is still open. */
  isWaiting: boolean;
  /** Attempt 1's placement of record; a run without one never settles (legacy). */
  placement?: TurnPlacement;
  /** The attempt's settlement row, and the revision it names. */
  settlement?: Readonly<{ type: 'turn.finalized' | 'turn.conflicted' | 'turn.failed'; revisionId?: string }>;
}>;

const isTerminal = (lifecycle: string): lifecycle is 'completed' | 'failed' | 'cancelled' =>
  lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled';

/**
 * One turn's revision facts, from the newest run that names it (PV-S9), replacing the revision card's seven sources
 * (PV-F17).
 *
 * @param projection - The chat's projection.
 * @param turnId - The turn's user-message id.
 * @returns The newest attempt's facts, or `undefined` while the log holds no run for the turn.
 * @public
 */
export const selectTurnRevision = (projection: ChatProjection, turnId: string): TurnRevisionLog | undefined => {
  const run = Object.values(projection.ledger.runs).findLast((entry) => entry.turnId === turnId);
  if (run === undefined) {
    return undefined;
  }
  const lifecycle = run.lifecycle ?? 'admitted';
  const event = run.settlements.find((settlement) => settlement.attempt === run.attempt)?.event;
  /* A `turn.failed` names the base its placement minted (TS-S9); the log's row type does not declare it yet. */
  const revisionId =
    event !== undefined && 'revisionId' in event && typeof event.revisionId === 'string' ? event.revisionId : undefined;
  return {
    attempt: run.attempt,
    ...(isTerminal(lifecycle) ? { terminal: lifecycle } : {}),
    isWaiting: lifecycle === 'paused' || Object.keys(run.pendingInterrupts).length > 0,
    ...(run.placement === undefined ? {} : { placement: run.placement }),
    ...(event === undefined
      ? {}
      : { settlement: { type: event.type, ...(revisionId === undefined ? {} : { revisionId }) } }),
  };
};
