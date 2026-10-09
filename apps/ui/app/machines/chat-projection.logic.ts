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
import {
  agentLogEventSchema,
  emptyChatLedger,
  foldReadAnswer,
  foldProjectionFacts,
  mergeLogSegments,
} from '@taucad/agent-host';
import type {
  AgentLiveEvent,
  AgentLogEvent,
  KnownProjectionEvent,
  ProjectionBatch,
  ProjectionSourceHealth,
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

type PresentationEvent = AgentLogEvent | KnownProjectionEvent;

type Block = AgentHostLiveBlocks extends Map<string, infer Value> ? Value : never;

type ChunkTree = Readonly<{
  length: number;
  height: number;
  items?: readonly UIMessageChunk[];
  left?: ChunkTree;
  right?: ChunkTree;
}>;
/** Immutable balanced batches keep append and suffix delivery independent of prior chunk count. */
export type ProjectedChunks = readonly UIMessageChunk[] | Readonly<{ length: number; trees: readonly ChunkTree[] }>;

const appendChunks = (previous: ProjectedChunks, items: readonly UIMessageChunk[]): ProjectedChunks => {
  if (items.length === 0) {
    return previous;
  }
  const trees: ChunkTree[] = Array.isArray(previous)
    ? previous.length === 0
      ? []
      : [{ length: previous.length, height: 0, items: previous }]
    : [...(previous as Exclude<ProjectedChunks, readonly UIMessageChunk[]>).trees];
  let tree: ChunkTree = { length: items.length, height: 0, items };
  while (trees.at(-1)?.height === tree.height) {
    const left = trees.pop()!;
    tree = {
      length: left.length + tree.length,
      height: tree.height + 1,
      left,
      right: tree,
    };
  }
  trees.push(tree);
  return { length: previous.length + items.length, trees };
};

/** Visit only a new suffix; subtree lengths skip the already delivered prefix. */
export function* chunksSince(chunks: ProjectedChunks, from = 0): Generator<UIMessageChunk> {
  if (Array.isArray(chunks)) {
    yield* chunks.slice(from);
    return;
  }
  const visit = function* (tree: ChunkTree, skip: number): Generator<UIMessageChunk> {
    if (tree.items !== undefined) {
      yield* tree.items.slice(skip);
    } else if (tree.left !== undefined && tree.right !== undefined) {
      if (skip < tree.left.length) {
        yield* visit(tree.left, skip);
      }
      yield* visit(tree.right, Math.max(0, skip - tree.left.length));
    }
  };
  let skip = from;
  for (const tree of (chunks as Exclude<ProjectedChunks, readonly UIMessageChunk[]>).trees) {
    if (skip >= tree.length) {
      skip -= tree.length;
    } else {
      yield* visit(tree, skip);
      skip = 0;
    }
  }
}

/** Full decoding is reserved for terminal/cold materialization and assertions. */
export const chunksOf = (chunks: ProjectedChunks | undefined): readonly UIMessageChunk[] =>
  chunks === undefined ? [] : [...chunksSince(chunks)];

/** The chunks owned by one provider envelope, retained across steering and compaction. */
type ProjectedMessageRange = Readonly<{
  id: string;
  from: number;
  to: number;
  blockKeys?: readonly string[];
  evicted?: true;
}>;

/** A visible input and the assistant output before the next authentic user input. */
export type TranscriptSegment = Readonly<{
  user?: MyUIMessage;
  chunks: ProjectedChunks;
  providerIds?: readonly string[];
  messages?: readonly ProjectedMessageRange[];
}>;

/** One run's durable UI stream and turn, consumed by a watch or transcript reader (PV-S11, PV-S15). @public */
export type RunView = Readonly<{
  chunks: ProjectedChunks;
  /** A non-append correction requires a fresh SDK stream at this existing run owner. */
  streamVersion?: number;
  user?: MyUIMessage;
  admittedAt: string;
  terminal?: 'completed' | 'failed' | 'cancelled';
  /** Prior assistant segments sealed by an authentic steering input. */
  segments?: readonly TranscriptSegment[];
  /** The active segment's input; the admitted user stays in `user`. */
  steering?: MyUIMessage;
  segmentId?: string;
  /** Provider identities resolve rewind prefixes independently from context compaction. */
  providerIds?: readonly string[];
  retired?: true;
  /** Each history message the active segment appended and its chunk range, so a rewind removes exactly what it dropped. */
  messages?: readonly ProjectedMessageRange[];
}>;

/** @public */
export type ChatProjection = Readonly<{
  /** Explicit resets retire held catch-up work even when both histories are empty. */
  resetVersion: number;
  ledger: ChatLedger;
  /** Exact host health echo, independent of additional locally folded history anomalies. */
  sourceHealth?: ProjectionSourceHealth;
  /** Open tool calls by call id, in the order they opened. */
  openTools: Readonly<Record<string, OpenToolCall>>;
  /** Durable chunks by run; the watch and transcript materializer share this one projection. */
  views: Readonly<Record<string, RunView>>;
  /** Other devices' segments, refolded only when their digest changes. Command selects never read these runs. */
  remote?: Readonly<{
    digest: string;
    views: Readonly<Record<string, RunView>>;
  }>;
  /** Open/closed block identities, stored as a JSON-safe record rather than a live Map. */
  blocks: Readonly<Record<string, Readonly<Record<string, Block>>>>;
  /** The watched run's ephemeral SDK stream. Durable views remain independent and replace it at terminal materialization. */
  live?: Readonly<{
    runId: string;
    chunks: ProjectedChunks;
    blocks: Readonly<Record<string, Block>>;
  }>;
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
  /** Atomically publish an independently validated captured fold at its original owner position. */
  | Readonly<{ type: 'catch-up'; base: ChatProjection; projection: ChatProjection }>
  | Readonly<{ type: 'batch'; answer: ChatProjectionReadAnswer }>
  | Readonly<{ type: 'facts'; answer: ProjectionBatch }>
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
  resetVersion: 0,
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

type ProjectionStep = Readonly<{
  state: ChatProjection;
  emit?: ChatProjectionEmitted;
}>;

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
 * Cut the active segment's dropped messages (the host reducer's prefix cut, at message granularity).
 *
 * A message is dropped when it is still in the history (not evicted by a compaction) and outside the retained prefix.
 * Dropped messages are a suffix of the history, so a kept run is trimmed at its end; the cut is not an append, so the
 * run's watch restarts.
 */
const trimMessageRanges = <Segment extends TranscriptSegment>(
  view: Segment,
  retained: ReadonlySet<string>,
): Segment => {
  const dropped = new Set(
    (view.messages ?? [])
      .filter((message) => message.evicted !== true && !retained.has(message.id))
      .map((message) => message.id),
  );
  if (dropped.size === 0) {
    return view;
  }
  const all = chunksOf(view.chunks);
  const chunks: UIMessageChunk[] = [];
  const messages: Array<NonNullable<RunView['messages']>[number]> = [];
  let at = 0;
  for (const message of view.messages ?? []) {
    chunks.push(...all.slice(at, message.from));
    at = message.to;
    if (!dropped.has(message.id)) {
      messages.push({ ...message, from: chunks.length, to: chunks.length + message.to - message.from });
      chunks.push(...all.slice(message.from, message.to));
    }
  }
  chunks.push(...all.slice(at));
  return {
    ...view,
    chunks,
    messages,
    ...(view.providerIds === undefined ? {} : { providerIds: view.providerIds.filter((id) => !dropped.has(id)) }),
  };
};

/** Keep range ownership when a run contains sealed steering segments as well as its active tail. */
const trimDropped = (view: RunView, retained: ReadonlySet<string>): RunView => {
  const own = trimMessageRanges(view, retained);
  const segments = view.segments?.map((segment) => trimMessageRanges(segment, retained));
  if (own === view && segments?.every((segment, index) => segment === view.segments?.[index]) !== false) {
    return view;
  }
  return { ...own, ...(segments === undefined ? {} : { segments }), streamVersion: (view.streamVersion ?? 0) + 1 };
};

/**
 * Retire visible attempts outside the explicit provider prefix, retaining run facts for revision consumers. A kept
 * run, and always the rewinding run itself (a regenerate re-admits the very message id the rewind drops), is trimmed
 * instead, which also retracts a resumed run's failure marker.
 */
const rewindViews = (views: Record<string, RunView>, runId: string, retainedIds: readonly string[]): void => {
  const retained = new Set(retainedIds);
  for (const [id, view] of Object.entries(views)) {
    if (view.retired === true) {
      continue;
    }
    // A compaction-evicted message is never dropped: its summary stands for it in the history.
    if (
      id === runId ||
      view.providerIds?.some((messageId) => retained.has(messageId)) === true ||
      view.messages?.some((message) => message.evicted === true) === true
    ) {
      views[id] = trimDropped(view, retained);
      continue;
    }
    const segments =
      view.segments
        ?.filter(
          (segment) =>
            segment.providerIds?.some((messageId) => retained.has(messageId)) === true ||
            segment.messages?.some((message) => message.evicted === true) === true,
        )
        .map((segment) => trimMessageRanges(segment, retained)) ?? [];
    const tail = segments.at(-1);
    const { steering: _steering, segmentId: _segmentId, messages: _messages, ...prior } = view;
    const segmentId = chunksOf(tail?.chunks).find((chunk) => chunk.type === 'start')?.messageId;
    views[id] =
      tail === undefined
        ? { ...view, retired: true }
        : {
            ...prior,
            chunks: tail.chunks,
            providerIds: tail.providerIds,
            messages: tail.messages,
            segments: segments.slice(0, -1),
            ...(tail.user === undefined || tail.user.id === view.user?.id ? {} : { steering: tail.user }),
            ...(segmentId === undefined ? {} : { segmentId }),
          };
  }
};

/** Replace only corrected block identities; ordinary deltas keep the bounded append path. */
const replaceBlockChunks = (
  previous: ProjectedChunks,
  chunks: readonly UIMessageChunk[],
  ids: ReadonlySet<string>,
): ProjectedChunks => {
  const rebuilt: UIMessageChunk[] = [];
  const replaced = new Set<string>();
  for (const chunk of chunksSince(previous)) {
    if ('id' in chunk && typeof chunk.id === 'string' && ids.has(chunk.id)) {
      if (!replaced.has(chunk.id)) {
        const { id } = chunk;
        rebuilt.push(...chunks.filter((candidate) => 'id' in candidate && candidate.id === id));
        replaced.add(id);
      }
    } else {
      rebuilt.push(chunk);
    }
  }
  for (const chunk of chunks) {
    if (!('id' in chunk) || typeof chunk.id !== 'string' || !replaced.has(chunk.id)) {
      rebuilt.push(chunk);
    }
  }
  return rebuilt;
};

/** Classify supported assistant checkpoint shapes once for durable and live projection owners. */
const assistantBlockChanges = (
  row: PresentationEvent,
  blocks: ReadonlyMap<string, Block>,
  previousKeys: readonly string[] = [],
) => {
  const message =
    row.type === 'message.appended'
      ? row.message
      : row.type === 'message.envelope-replaced'
        ? row.replacement
        : undefined;
  const keys = new Set<string>();
  const corrected = new Map<string, string>();
  if (message?.role !== 'assistant') {
    return { keys, corrected, removed: false };
  }
  const content = Array.isArray(message.content)
    ? message.content
    : typeof message.content === 'string'
      ? [{ type: 'text', text: message.content }]
      : [message.content];
  for (const [index, part] of content.entries()) {
    if (!isRecord(part)) {
      continue;
    }
    const kind = part['type'];
    const text = kind === 'text' ? part['text'] : kind === 'thinking' ? part['thinking'] : undefined;
    const key = JSON.stringify([row.runId, message.id, index]);
    if (typeof text !== 'string') {
      continue;
    }
    keys.add(key);
    const block = blocks.get(key);
    if (block !== undefined && (block.type !== kind || !text.startsWith(block.content))) {
      corrected.set(key, `${message.id}:${String(kind)}:${index}`);
    }
  }
  return { keys, corrected, removed: previousKeys.some((key) => !keys.has(key)) };
};

/** The history message a row appends, if any. */
const appendedId = (row: PresentationEvent): string | undefined =>
  row.type === 'message.appended' || row.type === 'turn.history-projection-committed' ? row.message.id : undefined;

const foldRunViews = (
  rows: readonly PresentationEvent[],
  previousViews: ChatProjection['views'],
  previousBlocks: ChatProjection['blocks'],
): Readonly<{
  views: ChatProjection['views'];
  blocks: ChatProjection['blocks'];
}> => {
  if (rows.length === 0) {
    return { views: previousViews, blocks: previousBlocks };
  }
  let views: Record<string, RunView> | undefined;
  let lastAdmittedAt = Object.values(previousViews).at(-1)?.admittedAt;
  const blockMaps = new Map<string, AgentHostLiveBlocks>();
  const nextBlocks = { ...previousBlocks };
  for (const row of rows) {
    let blocks = blockMaps.get(row.runId);
    if (blocks === undefined) {
      blocks = copyBlocks(previousBlocks[row.runId] ?? {});
      blockMaps.set(row.runId, blocks);
    }
    const admission: Readonly<Record<string, unknown>> | undefined =
      row.type === 'run.lifecycle' && row.state === 'admitted' && 'admission' in row && isRecord(row.admission)
        ? row.admission
        : undefined;
    const rewind =
      row.type === 'run.lifecycle' && 'rewind' in row && isRecord(row.rewind)
        ? row.rewind
        : isRecord(admission?.['rewind'])
          ? admission['rewind']
          : undefined;
    const retainedIds = rewind?.retainedMessageIds;
    if (Array.isArray(retainedIds) && retainedIds.every((id): id is string => typeof id === 'string')) {
      views ??= { ...previousViews };
      rewindViews(views, row.runId, retainedIds);
    }
    if (row.type === 'history.rewound') {
      views ??= { ...previousViews };
      rewindViews(views, row.runId, row.retainedMessageIds);
    }
    if (row.type === 'history.compacted') {
      const evicted = new Set(row.evictedMessageIds);
      for (const [id, view] of Object.entries(views ?? previousViews)) {
        const active = view.providerIds?.some((messageId) => evicted.has(messageId)) === true;
        const previousSegments = view.segments ?? [];
        const segments = view.segments?.map((segment) =>
          segment.providerIds?.some((messageId) => evicted.has(messageId))
            ? {
                ...segment,
                providerIds: [...segment.providerIds, row.summary.id],
                messages: segment.messages?.map((message) =>
                  evicted.has(message.id) ? ({ ...message, evicted: true } as const) : message,
                ),
              }
            : segment,
        );
        // Evicted messages stay visible: a later rewind keeps them.
        const messages = view.messages?.some((message) => evicted.has(message.id))
          ? view.messages.map((message): NonNullable<RunView['messages']>[number] =>
              evicted.has(message.id) ? { ...message, evicted: true } : message,
            )
          : undefined;
        if (
          active ||
          messages !== undefined ||
          segments?.some((segment, index) => segment !== previousSegments[index])
        ) {
          views ??= { ...previousViews };
          views[id] = {
            ...view,
            ...(active ? { providerIds: [...view.providerIds, row.summary.id] } : {}),
            ...(segments === undefined ? {} : { segments }),
            ...(messages === undefined ? {} : { messages }),
          };
        }
      }
    }
    const previous = (views ?? previousViews)[row.runId];
    /* A reopen continues the run's committed transcript: only the terminal marker it supersedes goes (resume
     * everywhere). A retracted failure marker leaves with its own `history.rewound` row. */
    const reopened = row.type === 'run.lifecycle' && row.state === 'running' && previous?.terminal !== undefined;
    const message =
      row.type === 'message.appended'
        ? row.message
        : row.type === 'message.envelope-replaced'
          ? row.replacement
          : undefined;
    const correctedIds = new Set<string>();
    const sealedSegment =
      row.type === 'message.envelope-replaced'
        ? previous?.segments?.find((segment) => segment.messages?.some((entry) => entry.id === row.messageId))
        : undefined;
    const messageSource = sealedSegment ?? previous;
    const messageRange =
      row.type === 'message.envelope-replaced'
        ? messageSource?.messages?.find((entry) => entry.id === row.messageId)
        : undefined;
    const changes = assistantBlockChanges(row, blocks, messageRange?.blockKeys);
    for (const [key, id] of changes.corrected) {
      correctedIds.add(id);
      blocks.delete(key);
    }
    const projectedBlockKeys = message?.role === 'assistant' ? [...changes.keys] : undefined;
    const removedBlock = changes.removed;
    // A replacement can rewrite any envelope, including removing parts. Rebuild only that envelope's owned range;
    // ordinary checkpoints on the newest message keep their append-only chunk path.
    const rewriteMessage =
      messageRange !== undefined &&
      message !== undefined &&
      (sealedSegment !== undefined ||
        messageRange !== messageSource?.messages?.at(-1) ||
        correctedIds.size > 0 ||
        removedBlock ||
        previous?.terminal === 'completed');
    const toolKey =
      message?.role === 'tool-input' ? JSON.stringify([row.runId, 'tool', message.toolCallId]) : undefined;
    const previousTool = toolKey === undefined ? undefined : blocks.get(toolKey);
    if (rewriteMessage) {
      for (const key of messageRange.blockKeys ?? []) {
        blocks.delete(key);
      }
      for (const key of projectedBlockKeys ?? []) {
        blocks.delete(key);
      }
      if (toolKey !== undefined) {
        blocks.delete(toolKey);
      }
    }
    const chunks = projectAgentHostEvent(row, blocks);
    if (rewriteMessage && toolKey !== undefined && previousTool?.closed) {
      // A corrected input precedes its already projected output; it cannot reopen that settled live block.
      blocks.set(toolKey, previousTool);
    }
    /* Only a completed run never reopens. A failed or cancelled one may resume, continuing its open checkpoint blocks
     * and replaying envelopes of messages it already projected, which its closed blocks dedupe. */
    if (row.type === 'run.lifecycle' && row.state === 'completed') {
      const prefix = `[${JSON.stringify(row.runId)},`;
      for (const key of blocks.keys()) {
        if (key.startsWith(prefix)) {
          blocks.delete(key);
        }
      }
    }
    const appended = appendedId(row);
    const projectedUser = projectAgentHostUserTurn(row);
    const user =
      projectedUser !== undefined && (previous?.user === undefined || previous.user.id === projectedUser.id)
        ? projectedUser
        : undefined;
    const steering =
      previous?.user !== undefined &&
      projectedUser?.id.startsWith('steer:') === true &&
      previous.user.id !== projectedUser.id
        ? projectedUser
        : undefined;
    const terminal =
      row.type === 'run.lifecycle' && (row.state === 'completed' || row.state === 'failed' || row.state === 'cancelled')
        ? row.state
        : undefined;
    if (
      chunks.length === 0 &&
      !rewriteMessage &&
      user === undefined &&
      steering === undefined &&
      appended === undefined &&
      previous !== undefined &&
      (row.type !== 'run.lifecycle' || terminal === previous.terminal)
    ) {
      continue;
    }
    if (
      chunks.length === 0 &&
      !rewriteMessage &&
      user === undefined &&
      steering === undefined &&
      terminal === undefined &&
      row.type !== 'run.lifecycle'
    ) {
      continue;
    }
    const admittedAt =
      previous?.admittedAt ??
      (lastAdmittedAt !== undefined && row.recordedAt < lastAdmittedAt ? lastAdmittedAt : row.recordedAt);
    if (previous === undefined) {
      lastAdmittedAt = admittedAt;
    }
    const segmentId = steering === undefined ? previous?.segmentId : `${row.runId}:${steering.id}`;
    const segments =
      steering === undefined
        ? user === undefined
          ? previous?.segments
          : previous?.segments?.map((segment, index) => (index === 0 ? { ...segment, user } : segment))
        : [
            ...(previous?.segments ?? []),
            {
              user: previous?.steering ?? previous?.user,
              chunks: previous?.chunks ?? [],
              providerIds: previous?.providerIds,
              messages: previous?.messages,
            },
          ];
    const initialChunks =
      sealedSegment?.chunks ??
      (steering === undefined
        ? reopened
          ? chunksOf(previous.chunks).filter((chunk) => !terminalChunks.has(chunk.type))
          : (previous?.chunks ?? [])
        : [{ type: 'start', messageId: segmentId } satisfies UIMessageChunk]);
    const providerId = row.type === 'message.appended' ? row.message.id : projectedUser?.id;
    views ??= { ...previousViews };
    const { terminal: _terminal, ...prior } = previous ?? {};
    const finalState = row.type === 'run.lifecycle' ? terminal : previous?.terminal;
    const rewrittenPrefix = rewriteMessage ? chunksOf(initialChunks) : undefined;
    const nextChunks =
      rewrittenPrefix !== undefined && messageRange !== undefined
        ? [...rewrittenPrefix.slice(0, messageRange.from), ...chunks, ...rewrittenPrefix.slice(messageRange.to)]
        : correctedIds.size === 0
          ? appendChunks(initialChunks, chunks)
          : replaceBlockChunks(initialChunks, chunks, correctedIds);
    // A steering input opens a new segment, whose ranges start over. Replacements keep the owning range and shift
    // later ranges by the exact difference, so a subsequent rewind removes only the messages it names.
    const segmentMessages = steering === undefined ? messageSource?.messages : [];
    const messages =
      messageRange !== undefined && segmentMessages !== undefined
        ? segmentMessages.map((entry) => {
            if (entry === messageRange) {
              return {
                ...entry,
                to: rewriteMessage ? entry.from + chunks.length : nextChunks.length,
                ...(projectedBlockKeys === undefined ? {} : { blockKeys: projectedBlockKeys }),
              };
            }
            const offset = chunks.length - (messageRange.to - messageRange.from);
            return rewriteMessage && entry.from >= messageRange.to
              ? { ...entry, from: entry.from + offset, to: entry.to + offset }
              : entry;
          })
        : appended === undefined
          ? correctedIds.size > 0 && segmentMessages !== undefined && segmentMessages.length > 0
            ? [...segmentMessages.slice(0, -1), { ...segmentMessages.at(-1)!, to: nextChunks.length }]
            : segmentMessages
          : [
              ...(segmentMessages ?? []),
              {
                id: appended,
                from: initialChunks.length,
                to: nextChunks.length,
                ...(projectedBlockKeys === undefined ? {} : { blockKeys: projectedBlockKeys }),
              },
            ];
    if (sealedSegment !== undefined && previous !== undefined) {
      views[row.runId] = {
        ...previous,
        segments: previous.segments?.map((segment) =>
          segment === sealedSegment ? { ...segment, chunks: nextChunks, messages } : segment,
        ),
        streamVersion: (previous.streamVersion ?? 0) + 1,
      };
      continue;
    }
    views[row.runId] = {
      ...prior,
      admittedAt,
      chunks: nextChunks,
      ...(messages === undefined ? {} : { messages }),
      ...(correctedIds.size === 0 && !rewriteMessage ? {} : { streamVersion: (previous?.streamVersion ?? 0) + 1 }),
      ...(previous?.user === undefined && user === undefined ? {} : { user: user ?? previous?.user }),
      ...(segments === undefined ? {} : { segments }),
      ...(steering === undefined ? {} : { steering, segmentId }),
      ...(providerId === undefined || previous?.providerIds?.includes(providerId)
        ? {}
        : {
            providerIds: [...(steering === undefined ? (previous?.providerIds ?? []) : []), providerId],
          }),
      ...(finalState === undefined ? {} : { terminal: finalState }),
    };
  }
  for (const [runId, blocks] of blockMaps) {
    if (blocks.size === 0) {
      // oxlint-disable-next-line typescript/no-dynamic-delete -- This batch owns the outer record.
      delete nextBlocks[runId];
    } else {
      nextBlocks[runId] = Object.fromEntries(blocks);
    }
  }
  return { views: views ?? previousViews, blocks: nextBlocks };
};

const copyBlocks = (blocks: Readonly<Record<string, Block>>): AgentHostLiveBlocks => new Map(Object.entries(blocks));

/** Apply a durable row to the ephemeral watch too, deduping it against live block offsets. */
const foldLiveRow = (
  live: NonNullable<ChatProjection['live']>,
  row: PresentationEvent,
): NonNullable<ChatProjection['live']> => {
  if (row.runId !== live.runId) {
    return live;
  }
  const blocks = copyBlocks(live.blocks);
  const chunks = projectAgentHostEvent(row, blocks);
  return {
    runId: live.runId,
    chunks: appendChunks(live.chunks, chunks),
    blocks: Object.fromEntries(blocks),
  };
};

/** Rebase ephemeral preview onto captured authority using content compatibility, never arrival order. */
const reconcileCapturedLive = (previous: ChatProjection, captured: ChatProjection): ChatProjection['live'] => {
  const { live } = previous;
  if (
    live === undefined ||
    previous.ledger.position.sourceGeneration !== captured.ledger.position.sourceGeneration ||
    captured.ledger.runs[live.runId] === undefined ||
    endedLifecycles.has(captured.ledger.runs[live.runId]!.lifecycle)
  ) {
    return undefined;
  }
  const { runId } = live;
  const view = captured.views[runId];
  if (view === undefined || view.retired === true) {
    return undefined;
  }
  const blocks = copyBlocks(captured.blocks[runId] ?? {});
  const grouped = (chunks: ProjectedChunks | undefined): Map<string, UIMessageChunk[]> => {
    const groups = new Map<string, UIMessageChunk[]>();
    for (const chunk of chunksSince(chunks ?? [])) {
      const id = 'toolCallId' in chunk ? `tool:${chunk.toolCallId}` : 'id' in chunk ? `block:${chunk.id}` : undefined;
      if (id !== undefined) {
        const group = groups.get(id) ?? [];
        group.push(chunk);
        groups.set(id, group);
      }
    }
    return groups;
  };
  const liveChunks = grouped(live.chunks);
  const oldChunks = grouped(previous.views[runId]?.chunks);
  const capturedChunks = grouped(view.chunks);
  const ownsMessage = (owner: RunView | undefined, id: string): boolean =>
    owner?.messages?.some((message) => message.id === id) === true ||
    owner?.segments?.some((segment) => segment.messages?.some((message) => message.id === id)) === true;
  const extra: UIMessageChunk[] = [];
  for (const [key, current] of Object.entries(live.blocks)) {
    const prior = previous.blocks[runId]?.[key];
    const durable = blocks.get(key);
    const identity: unknown = JSON.parse(key);
    if (!Array.isArray(identity) || typeof identity[1] !== 'string') {
      continue;
    }
    if (current.type === 'tool') {
      const callId: unknown = identity[2];
      if (typeof callId !== 'string') {
        continue;
      }
      const group = liveChunks.get(`tool:${callId}`) ?? [];
      if (durable === undefined && prior === undefined) {
        extra.push(...group);
        blocks.set(key, { ...current });
      } else if (durable?.type === 'tool' && !durable.closed && durable.input === 'available') {
        const before = oldChunks.get(`tool:${callId}`)?.findLast((chunk) => chunk.type === 'tool-input-available');
        const after = capturedChunks.get(`tool:${callId}`)?.findLast((chunk) => chunk.type === 'tool-input-available');
        // A retained output preview is meaningful only for the same authoritative input.
        if (
          before !== undefined &&
          after !== undefined &&
          JSON.stringify(before.input) === JSON.stringify(after.input)
        ) {
          const output = group.findLast(
            (chunk) => chunk.type === 'tool-output-available' || chunk.type === 'tool-output-error',
          );
          if (output !== undefined) {
            extra.push(output);
          }
        }
      }
      continue;
    }
    const messageId = identity[1];
    const contentIndex: unknown = identity[2];
    if (typeof contentIndex !== 'number') {
      continue;
    }
    if (durable === undefined) {
      if (prior !== undefined || ownsMessage(previous.views[runId], messageId) || ownsMessage(view, messageId)) {
        continue;
      }
    } else if (
      durable.type !== current.type ||
      durable.closed ||
      !current.content.startsWith(durable.content) ||
      (prior !== undefined && (prior.type !== durable.type || !durable.content.startsWith(prior.content)))
    ) {
      continue;
    }
    const identityFields = { runId, messageId, contentIndex };
    extra.push(
      ...projectAgentHostLiveEvent(
        current.type === 'text'
          ? { type: 'text-start', ...identityFields }
          : { type: 'thinking-start', ...identityFields, timestamp: current.startedAtMs },
        blocks,
      ),
    );
    extra.push(
      ...projectAgentHostLiveEvent(
        {
          type: current.type === 'text' ? 'text-delta' : 'thinking-delta',
          ...identityFields,
          delta: current.content,
          offset: 0,
        },
        blocks,
      ),
    );
    if (current.closed) {
      const ending = liveChunks
        .get(`block:${messageId}:${current.type}:${contentIndex}`)
        ?.findLast((chunk) => chunk.type === 'text-end' || chunk.type === 'reasoning-end');
      if (ending !== undefined) {
        extra.push(ending);
      }
      blocks.set(key, { ...current });
    }
  }
  return extra.length === 0
    ? undefined
    : { runId, chunks: appendChunks(view.chunks, extra), blocks: Object.fromEntries(blocks) };
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
  if (event.type === 'catch-up') {
    if (state.ledger !== event.base.ledger || state.resetVersion !== event.base.resetVersion) {
      return { state, emit: { type: 'stale' } };
    }
    const { remote: _remote, live: _live, ...captured } = event.projection;
    const live = reconcileCapturedLive(state, event.projection);
    const runId = state.live?.runId;
    const view = runId === undefined ? undefined : captured.views[runId];
    const views =
      runId === undefined || view === undefined
        ? captured.views
        : {
            ...captured.views,
            [runId]: { ...view, streamVersion: (state.views[runId]?.streamVersion ?? 0) + 1 },
          };
    return {
      state: {
        ...captured,
        views,
        resetVersion: state.resetVersion,
        ...(state.remote === undefined ? {} : { remote: state.remote }),
        ...(live === undefined ? {} : { live }),
      },
    };
  }
  if (event.type === 'reset') {
    return { state: { ...initialChatProjection, resetVersion: state.resetVersion + 1 } };
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
    const blocks = copyBlocks(prior?.blocks ?? state.blocks[runId] ?? {});
    const chunks = projectAgentHostLiveEvent(event.event, blocks);
    const view = state.views[runId];
    const previousChunks = prior?.chunks ?? view?.chunks ?? [];
    const ending = event.event.type === 'text-end' || event.event.type === 'thinking-end' ? event.event : undefined;
    const priorBlock =
      ending === undefined
        ? undefined
        : (prior?.blocks ?? state.blocks[runId])?.[JSON.stringify([runId, ending.messageId, ending.contentIndex])];
    const corrected =
      ending !== undefined && priorBlock !== undefined && !ending.content.startsWith(priorBlock.content);
    let liveChunks = appendChunks(previousChunks, chunks);
    if (corrected) {
      const kind = ending.type === 'text-end' ? 'text' : 'reasoning';
      const id = `${ending.messageId}:${ending.type === 'text-end' ? 'text' : 'thinking'}:${ending.contentIndex}`;
      liveChunks = replaceBlockChunks(
        previousChunks,
        [
          { type: kind === 'text' ? 'text-start' : 'reasoning-start', id },
          { type: kind === 'text' ? 'text-delta' : 'reasoning-delta', id, delta: ending.content },
          ...chunks,
        ],
        new Set([id]),
      );
    }
    return {
      state: {
        ...state,
        ...(corrected && view !== undefined
          ? { views: { ...state.views, [runId]: { ...view, streamVersion: (view.streamVersion ?? 0) + 1 } } }
          : {}),
        live: {
          runId,
          chunks: liveChunks,
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
    const view = state.views[event.runId];
    return {
      state: {
        ...durable,
        ...(view === undefined
          ? {}
          : { views: { ...state.views, [event.runId]: { ...view, streamVersion: (view.streamVersion ?? 0) + 1 } } }),
      },
    };
  }
  /* Any batch states where the log ends, even one this projection already holds or cannot fold yet. */
  const endCursor =
    event.answer.status === 'batch' ? Math.max(state.endCursor, event.answer.endCursor) : state.endCursor;
  const held = endCursor === state.endCursor ? state : { ...state, endCursor };
  const answer = event.type === 'facts' ? event.answer : fromCursor(event.answer, state.ledger.position.cursor);
  if (answer === undefined) {
    return { state: held };
  }
  const fold =
    'facts' in answer ? foldProjectionFacts({ ledger: state.ledger, answer }) : foldReadAnswer(state.ledger, answer);
  switch (fold.kind) {
    case 'folded': {
      if (fold.ledger === state.ledger || answer.status !== 'batch') {
        return { state: held };
      }
      let open: Record<string, OpenToolCall> | undefined;
      let { views } = state;
      /* ponytail: O(open blocks) per batch; a persistent map only if a run keeps hundreds open. */
      let { failure, attentionRow } = state;
      const parsedRows: readonly PresentationEvent[] =
        'facts' in answer
          ? fold.semanticRowIndices.flatMap((index): KnownProjectionEvent[] => {
              const fact = answer.facts[index];
              return fact?.classification === 'known' ? [{ ...fact.row, ...fact.effect }] : [];
            })
          : fold.semanticRowIndices.flatMap((index) => {
              const parsed = agentLogEventSchema.safeParse(answer.events[index]);
              return parsed.success ? [parsed.data] : [];
            });
      for (const row of parsedRows) {
        open = applyToolRow(open ?? { ...state.openTools }, row);
        failure = applyFailureRow(failure, row);
        attentionRow = attentionKeyOf(row) ?? attentionRow;
      }
      const rendered = foldRunViews(parsedRows, views, state.blocks);
      views = rendered.views;
      let live = parsedRows.some(
        (row) =>
          (row.type === 'run.lifecycle' && row.state === 'admitted' && row.runId !== state.live?.runId) ||
          (row.type === 'message.appended' && row.message.role === 'user' && row.message.id.startsWith('steer:')),
      )
        ? undefined
        : state.live;
      for (const row of parsedRows) {
        if (live !== undefined) {
          const currentLive = live;
          const message =
            row.runId === currentLive.runId
              ? row.type === 'message.appended'
                ? row.message
                : row.type === 'message.envelope-replaced'
                  ? row.replacement
                  : undefined
              : undefined;
          const liveBlocks = new Map(Object.entries(currentLive.blocks));
          const keyPrefix =
            message === undefined ? undefined : JSON.stringify([row.runId, message.id]).slice(0, -1) + ',';
          const previousKeys =
            keyPrefix === undefined ? [] : [...liveBlocks.keys()].filter((key) => key.startsWith(keyPrefix));
          const changes = assistantBlockChanges(row, liveBlocks, previousKeys);
          const replaced =
            changes.corrected.size > 0 ||
            changes.removed ||
            (views[currentLive.runId]?.streamVersion ?? 0) !== (state.views[currentLive.runId]?.streamVersion ?? 0);
          if (replaced) {
            const view = views[row.runId];
            if (view !== undefined) {
              views = { ...views, [row.runId]: { ...view, streamVersion: (view.streamVersion ?? 0) + 1 } };
            }
            live = undefined;
          } else {
            live = foldLiveRow(live, row);
          }
        }
      }
      return {
        state: {
          resetVersion: state.resetVersion,
          ledger: fold.ledger,
          sourceHealth: 'sourceHealth' in answer ? answer.sourceHealth : state.sourceHealth,
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
      return { state: { ...initialChatProjection, resetVersion: state.resetVersion + 1 }, emit: { type: 'reread' } };
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
      event.type !== 'facts' &&
      event.type !== 'catch-up' &&
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
    .filter(([, view]) => view.retired !== true)
    .map(([runId, view]) => ({ runId, ...view }))
    .toSorted((left, right) => left.admittedAt.localeCompare(right.admittedAt));

const messagesByChunks = new WeakMap<RunView['chunks'], Promise<MyUIMessage | undefined>>();
const finalizedMessages = new WeakMap<MyUIMessage, Map<NonNullable<RunView['terminal']>, MyUIMessage>>();

const materializeRun = async (view: RunView): Promise<MyUIMessage | undefined> => {
  let pending = messagesByChunks.get(view.chunks);
  if (pending === undefined) {
    pending = (async () => {
      if (view.chunks.length === 0) {
        return undefined;
      }
      const stream = new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunksSince(view.chunks)) {
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
  let finalized = finalizedMessages.get(message);
  if (finalized === undefined) {
    finalized = new Map();
    finalizedMessages.set(message, finalized);
  }
  const previous = finalized.get(view.terminal);
  if (previous !== undefined) {
    return previous;
  }
  const result = finalizeInterruptedToolParts([message], undefined, cause)[0]!;
  finalized.set(view.terminal, result);
  return result;
};

/** Materialize one log snapshot; the adapter versions its async result before writing to a ready SDK chat. @public */
export const materializeTranscript = async (
  projection: ChatProjection,
  watchedRunId?: string,
): Promise<MyUIMessage[]> => {
  const runs = selectTranscriptSource(projection);
  const transcripts = await Promise.all(
    runs.map(async (run) => {
      const segments = await Promise.all(
        (run.segments ?? []).map(async (segment) => {
          const assistant = await materializeRun({
            ...run,
            chunks: segment.chunks,
            terminal: undefined,
          });
          return [segment.user, assistant].filter((message): message is MyUIMessage => message !== undefined);
        }),
      );
      const messages = segments.flat();
      const user = run.steering ?? run.user;
      if (user !== undefined) {
        messages.push(user);
      }
      if (run.runId !== watchedRunId) {
        const assistant = await materializeRun(run);
        if (assistant !== undefined && (user !== undefined || assistant.parts.length > 0)) {
          messages.push(assistant);
        }
      }
      return messages;
    }),
  );
  return transcripts.flat();
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
export const selectPosition = (
  projection: ChatProjection,
): ChatLedger['position'] & Readonly<{ sourceHealth?: ProjectionSourceHealth }> =>
  projection.sourceHealth === undefined
    ? projection.ledger.position
    : { ...projection.ledger.position, sourceHealth: projection.sourceHealth };

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
  settlement?: Readonly<{
    type: 'turn.finalized' | 'turn.conflicted' | 'turn.failed';
    revisionId?: string;
  }>;
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
