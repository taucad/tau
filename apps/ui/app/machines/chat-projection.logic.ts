/**
 * One chat's projection of its own log (W9 PV-S7, blueprint §5.6).
 *
 * It advances W3's ledger with W3's read fold, so a batch that does not start at
 * the projection's cursor is discarded and a refusal resets it (PV-R15), and it
 * keeps the one run fact the ledger does not: the tool calls still open, updated
 * per row. Its context is JSON-safe records. Run phase, open interrupts and tools
 * in flight are selects over it; the page's copies of them go (G02–G04).
 *
 * Durable run views and transcript materialization share this fold; a watched
 * run may also carry an ephemeral live overlay, never a second persisted log.
 */

import { createLogic } from 'xstate';
import { readUIMessageStream } from 'ai';
import type { UIMessageChunk } from 'ai';
import { agentLogEventSchema, emptyChatLedger, foldReadAnswer, mergeLogSegments } from '@taucad/agent-host';
import type {
  AgentLiveEvent,
  AgentLogEvent,
  ChatLedger,
  ChatLogSegment,
  RowKey,
  TurnPlacement,
} from '@taucad/agent-host';
import type { MyUIMessage } from '@taucad/chat';
import {
  projectAgentHostEvent,
  projectAgentHostLiveEvent,
  projectAgentHostUserTurn,
  runFailureText,
} from '#services/agent-host-event-projection.js';
import type { AgentHostLiveBlocks } from '#services/agent-host-event-projection.js';
import { finalizeInterruptedToolParts } from '#utils/chat.utils.js';

/** One read's answer, as the host's `read` and `attach` return it (W3 CL-R13). @public */
export type ChatProjectionReadAnswer = Parameters<typeof foldReadAnswer>[1];

/** A tool call the log opened (`tool-input`) and has not closed (`tool-output` or its run's end). @public */
export type OpenToolCall = Readonly<{ runId: string; toolName: string }>;

type Block = AgentHostLiveBlocks extends Map<string, infer Value> ? Value : never;

/** One run's durable UI stream and turn, consumed by a watch or transcript reader (PV-S11, PV-S15). @public */
export type RunView = Readonly<{
  chunks: readonly UIMessageChunk[];
  user?: MyUIMessage;
  admittedAt: string;
  terminal?: 'completed' | 'failed' | 'cancelled';
  /** Each history message the run appended and its chunk range, so a rewind removes exactly what it dropped. */
  messages?: ReadonlyArray<Readonly<{ id: string; from: number; to: number; evicted?: true }>>;
  /** A later rewind dropped this run's user turn (a regenerate or an edit): the transcript omits the run. */
  rewound?: true;
}>;

/** @public */
export type ChatProjection = Readonly<{
  ledger: ChatLedger;
  /** Open tool calls by call id, in the order they opened. */
  openTools: Readonly<Record<string, OpenToolCall>>;
  /** Durable chunks by run; the watch and transcript materializer share this one projection. */
  views: Readonly<Record<string, RunView>>;
  /** Other devices' segments, refolded only when their digest changes. Command selects never read these runs. */
  remote?: Readonly<{ digest: string; views: Readonly<Record<string, RunView>> }>;
  /** Open/closed block identities, stored as a JSON-safe record rather than a live Map. */
  blocks: Readonly<Record<string, Block>>;
  /** The watched run's ephemeral SDK stream. Durable views remain independent and replace it at terminal materialization. */
  live?: Readonly<{ runId: string; chunks: readonly UIMessageChunk[]; blocks: Readonly<Record<string, Block>> }>;
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
  | Readonly<{ type: 'reset' }>
  /** A non-durable model delta; it never advances the log cursor or transcript source. */
  | Readonly<{ type: 'live'; event: AgentLiveEvent }>
  /** Retire only the named ephemeral overlay after terminal delivery or reader loss. */
  | Readonly<{ type: 'clear-live'; runId: string }>
  /** Other devices' projected segment files; no own-log cursor applies to them. */
  | Readonly<{ type: 'remote'; segments: readonly ChatLogSegment[] }>;

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
  views: {},
  blocks: {},
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
  if (
    row['state'] === 'failed' ||
    (row['state'] === 'cancelled' && isRecord(row['detail']) && row['detail']['code'] === 'USER_STOPPED')
  ) {
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

/** FNV-1a over every byte; equal sizes and tail keys can still hide a corrected earlier row. */
const hashSegment = (bytes: Uint8Array<ArrayBuffer>): number => {
  let hash = 2_166_136_261;
  for (const byte of bytes) {
    // oxlint-disable-next-line eslint/no-bitwise -- FNV-1a requires XORing each byte into the hash.
    hash = Math.imul(hash ^ byte, 16_777_619);
  }
  // oxlint-disable-next-line eslint/no-bitwise -- Keep the bounded unsigned 32-bit digest.
  return hash >>> 0;
};

/** One bounded digest of the segment bytes that can change the merged transcript. @public */
export const digestLogSegments = (segments: readonly ChatLogSegment[]): string =>
  JSON.stringify(
    segments
      .map(({ deviceId, bytes }) => ({ deviceId, byteLength: bytes.byteLength, hash: hashSegment(bytes) }))
      .toSorted((left, right) => (left.deviceId < right.deviceId ? -1 : left.deviceId > right.deviceId ? 1 : 0)),
  );

/** A terminal row's chunk: always a view's last, and superseded when the run reopens. */
const terminalChunks: ReadonlySet<UIMessageChunk['type']> = new Set(['finish', 'error', 'abort']);

/**
 * One view after a `history.rewound` row (the host reducer's prefix cut, at message granularity).
 *
 * A message is dropped when it is still in the history (not evicted by a compaction) and outside the retained prefix.
 * Dropped messages are a suffix of the history, so an earlier run is kept whole, trimmed at its end, or — its user turn
 * dropped — hidden. The rewinding run's own turn is never hidden: it is admitted before the rewind row, and a
 * regenerate re-admits the very message id the rewind drops.
 */
const rewindView = (view: RunView, retained: ReadonlySet<string>, own: boolean): RunView => {
  const dropped = (view.messages ?? []).filter((message) => message.evicted !== true && !retained.has(message.id));
  if (dropped.length === 0) {
    return view;
  }
  if (!own && dropped.some((message) => message.id === view.user?.id)) {
    return view.rewound ? view : { ...view, rewound: true };
  }
  const chunks: UIMessageChunk[] = [];
  const messages: Array<NonNullable<RunView['messages']>[number]> = [];
  let at = 0;
  for (const message of view.messages ?? []) {
    chunks.push(...view.chunks.slice(at, message.from));
    at = message.to;
    if (!dropped.includes(message)) {
      messages.push({ ...message, from: chunks.length, to: chunks.length + message.to - message.from });
      chunks.push(...view.chunks.slice(message.from, message.to));
    }
  }
  chunks.push(...view.chunks.slice(at));
  return { ...view, chunks, messages };
};

/** A compaction marks the messages it evicted (a later rewind keeps them); a rewind cuts every view. */
const foldHistoryRow = (
  views: ChatProjection['views'],
  row: Extract<AgentLogEvent, { readonly type: 'history.rewound' | 'history.compacted' }>,
): ChatProjection['views'] => {
  let next = views;
  for (const [runId, view] of Object.entries(views)) {
    let folded = view;
    if (row.type === 'history.rewound') {
      folded = rewindView(view, new Set(row.retainedMessageIds), runId === row.runId);
    } else if (view.messages?.some((message) => row.evictedMessageIds.includes(message.id)) === true) {
      folded = {
        ...view,
        messages: view.messages.map((message): NonNullable<RunView['messages']>[number] =>
          row.evictedMessageIds.includes(message.id) ? { ...message, evicted: true } : message,
        ),
      };
    }
    if (folded !== view) {
      next = { ...next, [runId]: folded };
    }
  }
  return next;
};

/** The history message a row appends, if any. */
const appendedId = (row: AgentLogEvent): string | undefined =>
  row.type === 'message.appended' || row.type === 'turn.history-projection-committed' ? row.message.id : undefined;

const foldRunViews = (
  rows: readonly AgentLogEvent[],
  previousViews: ChatProjection['views'],
  previousBlocks: ChatProjection['blocks'],
): Readonly<{ views: ChatProjection['views']; blocks: ChatProjection['blocks'] }> => {
  let views = previousViews;
  let lastAdmittedAt = Object.values(previousViews).at(-1)?.admittedAt;
  const blocks: AgentHostLiveBlocks = new Map(
    Object.entries(previousBlocks).map(([key, block]) => [key, { ...block }]),
  );
  for (const row of rows) {
    if (row.type === 'history.rewound' || row.type === 'history.compacted') {
      views = foldHistoryRow(views, row);
      continue;
    }
    const previous = views[row.runId];
    /* A reopen continues the run's committed transcript: only the terminal marker it supersedes goes (resume
     * everywhere). A retracted failure marker leaves with its own `history.rewound` row. */
    const reopened = row.type === 'run.lifecycle' && row.state === 'running' && previous?.terminal !== undefined;
    const kept = reopened ? previous.chunks.filter((chunk) => !terminalChunks.has(chunk.type)) : previous?.chunks;
    const chunks = projectAgentHostEvent(row, blocks);
    const appended = appendedId(row);
    const user = projectAgentHostUserTurn(row);
    const terminal =
      row.type === 'run.lifecycle' && (row.state === 'completed' || row.state === 'failed' || row.state === 'cancelled')
        ? row.state
        : undefined;
    if (
      chunks.length === 0 &&
      user === undefined &&
      appended === undefined &&
      previous !== undefined &&
      (row.type !== 'run.lifecycle' || terminal === previous.terminal)
    ) {
      continue;
    }
    if (chunks.length === 0 && user === undefined && terminal === undefined && row.type !== 'run.lifecycle') {
      continue;
    }
    // The merged rows already preserve each device's term order; clamp a backwards clock before sorting runs.
    const admittedAt =
      previous?.admittedAt ??
      (lastAdmittedAt !== undefined && row.recordedAt < lastAdmittedAt ? lastAdmittedAt : row.recordedAt);
    if (previous === undefined) {
      lastAdmittedAt = admittedAt;
    }
    const from = kept?.length ?? 0;
    const messages =
      appended === undefined
        ? previous?.messages
        : [...(previous?.messages ?? []), { id: appended, from, to: from + chunks.length }];
    views = {
      ...views,
      [row.runId]: {
        admittedAt,
        chunks: [...(kept ?? []), ...chunks],
        ...(messages === undefined ? {} : { messages }),
        ...(previous?.rewound === undefined ? {} : { rewound: previous.rewound }),
        ...(previous?.user === undefined && user === undefined ? {} : { user: user ?? previous?.user }),
        ...(row.type === 'run.lifecycle'
          ? terminal === undefined
            ? {}
            : { terminal }
          : previous?.terminal === undefined
            ? {}
            : { terminal: previous.terminal }),
      },
    };
  }
  return { views, blocks: Object.fromEntries(blocks) };
};

const copyBlocks = (blocks: ChatProjection['blocks']): AgentHostLiveBlocks =>
  new Map(Object.entries(blocks).map(([key, block]) => [key, { ...block }]));

/** Apply a durable row to the ephemeral watch too, deduping it against live block offsets. */
const foldLiveRow = (
  live: NonNullable<ChatProjection['live']>,
  row: AgentLogEvent,
): NonNullable<ChatProjection['live']> => {
  if (row.runId !== live.runId) {
    return live;
  }
  const blocks = copyBlocks(live.blocks);
  const chunks = projectAgentHostEvent(row, blocks);
  return { runId: live.runId, chunks: [...live.chunks, ...chunks], blocks: Object.fromEntries(blocks) };
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
  if (event.type === 'remote') {
    const digest = digestLogSegments(event.segments);
    if (digest === state.remote?.digest) {
      return { state };
    }
    const { views } = foldRunViews(mergeLogSegments(event.segments), {}, {});
    return { state: { ...state, remote: { digest, views } } };
  }
  if (event.type === 'live') {
    const { runId } = event.event;
    const lifecycle = state.ledger.runs[runId]?.lifecycle;
    if (lifecycle === undefined || endedLifecycles.has(lifecycle)) {
      return { state };
    }
    const prior = state.live?.runId === runId ? state.live : undefined;
    const blocks = copyBlocks(prior?.blocks ?? state.blocks);
    const chunks = projectAgentHostLiveEvent(event.event, blocks);
    return {
      state: {
        ...state,
        live: {
          runId,
          chunks: [...(prior?.chunks ?? state.views[runId]?.chunks ?? []), ...chunks],
          blocks: Object.fromEntries(blocks),
        },
      },
    };
  }
  if (event.type === 'clear-live') {
    if (state.live?.runId !== event.runId) {
      return { state };
    }
    const { live: _live, ...durable } = state;
    return { state: durable };
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
      let { views } = state;
      /* ponytail: O(open blocks) per batch; a persistent map only if a run keeps hundreds open. */
      let { failure, attentionRow } = state;
      for (const row of answer.events) {
        open = applyToolRow(open ?? { ...state.openTools }, row);
        failure = applyFailureRow(failure, row);
        attentionRow = attentionKeyOf(row) ?? attentionRow;
      }
      const parsedRows = answer.events.flatMap((row) => {
        const parsed = agentLogEventSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      });
      const rendered = foldRunViews(parsedRows, views, state.blocks);
      views = rendered.views;
      let live = parsedRows.some(
        (row) => row.type === 'run.lifecycle' && row.state === 'admitted' && row.runId !== state.live?.runId,
      )
        ? undefined
        : state.live;
      for (const row of parsedRows) {
        if (live !== undefined) {
          live = foldLiveRow(live, row);
        }
      }
      return {
        state: {
          ledger: fold.ledger,
          openTools: open ?? state.openTools,
          views,
          blocks: rendered.blocks,
          ...(live === undefined ? {} : { live }),
          ...(state.remote === undefined ? {} : { remote: state.remote }),
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
    if (
      event.type !== 'batch' &&
      event.type !== 'reset' &&
      event.type !== 'remote' &&
      event.type !== 'live' &&
      event.type !== 'clear-live'
    ) {
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

/** Ordered run sources for the one SDK transcript, with the own log winning a duplicate run id. @public */
export const selectTranscriptSource = (
  projection: ChatProjection,
): ReadonlyArray<RunView & { readonly runId: string }> =>
  Object.entries({ ...projection.remote?.views, ...projection.views })
    .filter(([, view]) => view.rewound !== true)
    .map(([runId, view]) => ({ runId, ...view }))
    .toSorted((left, right) => left.admittedAt.localeCompare(right.admittedAt));

const messagesByChunks = new WeakMap<RunView['chunks'], Promise<MyUIMessage | undefined>>();

const materializeRun = async (view: RunView): Promise<MyUIMessage | undefined> => {
  let pending = messagesByChunks.get(view.chunks);
  if (pending === undefined) {
    pending = (async () => {
      if (view.chunks.length === 0) {
        return undefined;
      }
      const stream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of view.chunks) {
            // The ledger owns run failure; only malformed SDK reconstruction should reject this transcript.
            if (chunk.type === 'error') {
              continue;
            }
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      let message: MyUIMessage | undefined;
      for await (const next of readUIMessageStream<MyUIMessage>({ stream, terminateOnError: true })) {
        message = next;
      }
      return message;
    })();
    messagesByChunks.set(view.chunks, pending);
  }
  const message = await pending;
  if (message === undefined || view.terminal === undefined) {
    return message;
  }
  const cause = view.terminal === 'completed' ? 'success' : view.terminal === 'cancelled' ? 'user_stop' : 'error';
  return finalizeInterruptedToolParts([message], undefined, cause)[0];
};

/** Materialize one log snapshot; the adapter versions its async result before writing to a ready SDK chat. @public */
export const materializeTranscript = async (
  projection: ChatProjection,
  watchedRunId?: string,
): Promise<MyUIMessage[]> => {
  const runs = selectTranscriptSource(projection);
  const assistants = await Promise.all(runs.map(async (run) => materializeRun(run)));
  return runs.flatMap((run, index) => [
    ...(run.user === undefined ? [] : [run.user]),
    ...(run.runId === watchedRunId || assistants[index] === undefined ? [] : [assistants[index]]),
  ]);
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
  /** Host-confirmed change for this attempt, independent of selected checkout status. */
  hasChanges?: boolean;
  /** Earlier verified result for this user turn; never progress for the current attempt. */
  previousRevisionId?: string;
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
  const runs = Object.values(projection.ledger.runs).filter((entry) => entry.turnId === turnId);
  const run = runs.at(-1);
  if (run === undefined) {
    return undefined;
  }
  const lifecycle = run.lifecycle ?? 'admitted';
  const event = run.settlements.find((settlement) => settlement.attempt === run.attempt)?.event;
  /* A `turn.failed` names the base its placement minted (TS-S9); the log's row type does not declare it yet. */
  const revisionId =
    event !== undefined && 'revisionId' in event && typeof event.revisionId === 'string' ? event.revisionId : undefined;
  const prior = runs
    .flatMap((entry) =>
      entry.settlements.filter(
        (settlement) =>
          (entry !== run || settlement.attempt < run.attempt) &&
          entry.changes?.[settlement.attempt] !== undefined &&
          settlement.event.type === 'turn.finalized' &&
          settlement.event.revisionId !== undefined &&
          settlement.event.revisionId !== entry.placement?.baseRevisionId,
      ),
    )
    .at(-1);
  return {
    attempt: run.attempt,
    hasChanges: run.changes?.[run.attempt] !== undefined,
    ...(prior?.event.type === 'turn.finalized' ? { previousRevisionId: prior.event.revisionId } : {}),
    ...(isTerminal(lifecycle) ? { terminal: lifecycle } : {}),
    isWaiting: lifecycle === 'paused' || Object.keys(run.pendingInterrupts).length > 0,
    ...(run.placement === undefined ? {} : { placement: run.placement }),
    ...(event === undefined
      ? {}
      : { settlement: { type: event.type, ...(revisionId === undefined ? {} : { revisionId }) } }),
  };
};
