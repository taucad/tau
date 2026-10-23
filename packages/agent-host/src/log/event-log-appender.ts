import { EventLogError } from '#log/event-log-error.js';
import { parseLogEvent } from '#log/event-schema.js';
import { createEventLogReducer } from '#log/reducer.js';
import type { ReplayAnomaly } from '#log/reducer.js';
import { foreignRunStanding, noteGrownRows, unsettledParsedRuns } from '#log/foreign-runs.js';
import type { ForeignRun } from '#log/foreign-runs.js';
import { mergeSegmentRows } from '#log/segments.js';
import type { ChatLogSegment, ParsedLogSegment } from '#log/segments.js';
import { parseEventLogBytes, serializeLogEventBytes } from '#log/serialization.js';
import type { AgentLogEvent, ProviderMessage, RowKey, UserProviderMessage } from '#log/event-types.js';

/**
 * Result of an idempotent event-log append: whether a row was written, and the log's end cursor after it, so a
 * replicator follows the end cursor rather than counting appends.
 *
 * @public
 */
export type EventLogAppendOutcome = Readonly<{ appended: boolean; endCursor: number }>;

/** One bounded read from an event-log cursor. @public */
export type EventLogBatch = {
  readonly cursor: number;
  readonly nextCursor: number;
  readonly endCursor: number;
  readonly events: readonly AgentLogEvent[];
};

/**
 * A read the log refuses rather than clamps (CL-R7): the reader's cursor is past the end (`cursor-ahead`, with the end
 * cursor), or the row before its cursor is not the row it last folded (`identity-mismatch`, with that row's key).
 *
 * @internal
 */
export type EventLogReadRefusal = Readonly<{
  status: 'refused';
  reason: 'cursor-ahead' | 'identity-mismatch';
  expected: Readonly<{ endCursor: number; last?: RowKey }>;
}>;

/** What one read answers: a batch that starts at the reader's cursor, or a refusal. @internal */
export type EventLogReadAnswer = (EventLogBatch & Readonly<{ status: 'batch' }>) | EventLogReadRefusal;

/**
 * The version-1 wire's read, kept only for clients in the support window (CL-R7): a cursor past the end is clamped
 * to the end instead of refused. New readers use the refusal and fold through `foldReadAnswer`.
 *
 * @internal
 * @param answer - The log's answer.
 * @returns The batch a version-1 client expects.
 */
export const v1Batch = (answer: EventLogReadAnswer): EventLogBatch =>
  answer.status === 'batch'
    ? { cursor: answer.cursor, nextCursor: answer.nextCursor, endCursor: answer.endCursor, events: answer.events }
    : {
        cursor: answer.expected.endCursor,
        nextCursor: answer.expected.endCursor,
        endCursor: answer.expected.endCursor,
        events: [],
      };

/** Something a tolerant open kept but could not use; reading never fails a chat (D16). @internal */
export type EventLogAnomaly = Readonly<{
  kind: 'quarantined' | 'order' | 'conflict' | 'history';
  message: string;
  /** Byte offset of a quarantined line. */
  byteOffset?: number;
  /** Cursor of the kept row the anomaly is about. */
  cursor?: number;
}>;

/** Durable ordered event-log appender shared by browser and Node hosts. @public */
export type EventLogAppender = {
  /**
   * Append and flush one event, or no-op when its epoch and sequence already exist unchanged. Refused with
   * `LOG_FENCED`, writing nothing, when the log is no longer the log this appender read (D5).
   */
  append(event: AgentLogEvent): Promise<EventLogAppendOutcome>;
  /**
   * Read this device's own records, opaque rows included: the rows this appender writes and its cursors count. Run
   * bookkeeping — run ids, sequences, leadership epochs, resume markers — reads these, never another device's.
   */
  read(): Promise<readonly AgentLogEvent[]>;
  /**
   * Read at most `limit` records starting at the zero-based cursor, and at
   * most `maxBytes` of serialized payload when one is named.
   *
   * A count alone does not bound a page: one record holding a whole file read
   * can be larger than every other record in the log put together. A record
   * that exceeds the budget on its own is still returned, so an oversized
   * record slows a reader down rather than wedging its cursor.
   *
   * A cursor past the end, or a `last` key that is not the row at `cursor - 1`, is refused, never clamped (I4).
   */
  readBatch(input: {
    readonly cursor: number;
    readonly limit: number;
    readonly maxBytes?: number | undefined;
    readonly last?: RowKey | undefined;
  }): Promise<EventLogReadAnswer>;
  /**
   * The chat's provider history, maintained incrementally (L2a D18): the model's view of the chat.
   *
   * Over every device's segment where the storage has them (XD1): this device's rows merged with each other device's
   * `events/<deviceId>.jsonl` by `mergeLogSegments`. When those segments do not fold onto this log (two devices ran
   * the chat without seeing each other's turns), the history is this device's rows alone, as it was before a second
   * device wrote, and an anomaly says so.
   */
  messages(): Promise<readonly ProviderMessage[]>;
  /** `false` when a history row was rejected at open: the chat reads, and the host refuses to run it. */
  historyIntact(): Promise<boolean>;
  /**
   * Re-read the other devices' segments, so {@link EventLogAppender.messages} includes what sync brought since the
   * open. Absent on a log that has no other segments to read.
   */
  refresh?(): Promise<void>;
  /**
   * The runs other devices' segments hold unsettled, each segment folded on its own ledger (XD3): what the cross-device
   * run fence reads. A run this device's own rows name is this device's, never foreign. Absent where `refresh` is.
   *
   * Rejected `SEGMENTS_UNREADABLE` while the segments could not be read at the last open or refresh: an unread segment
   * may hold a live run, so the fence never reads it as none.
   */
  foreignRuns?(): Promise<readonly ForeignRun[]>;
  /**
   * When another device last wrote this chat, as the last open or refresh read its segments: the newest `recordedAt`
   * among rows that are not this device's own runs read back, in epoch milliseconds; `undefined` when none. A writer
   * whose term began before it opens a new term for its next turn, so that turn merges after the other device's
   * (terms merge whole, CL-R14). Absent where `refresh` is.
   */
  foreignWrittenAt?(): Promise<number | undefined>;
  /**
   * Whether the history is unknown: the other devices' segments cannot be read and this device's rows do not fold
   * without them (XD1). {@link EventLogAppender.historyIntact} then answers `true`, since nothing proves the history
   * invalid, but nothing may run or continue on it. Absent where `refresh` is.
   */
  historyUnknown?(): Promise<boolean>;
  /** What the open kept but could not use: quarantined lines, broken term rules, conflicting copies, history. */
  anomalies(): Promise<readonly EventLogAnomaly[]>;
  /** Flush pending operations and release the underlying file handle. */
  close(): Promise<void>;
};

/**
 * Storage primitives used by environment-specific appenders.
 *
 * The fence is not the port's: the appender checks the log's length inside `exclusive`, so the port supplies only a
 * lock and a size, and a refusal never reaches a rollback that could delete another writer's rows (D5; S3 F1).
 *
 * @internal
 */
export type EventLogStorage = {
  read(): Promise<Uint8Array<ArrayBuffer>>;
  append(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
  /** Current byte length of the log. */
  size(): Promise<number>;
  /** Run `section` while no other writer of this log can append (identity for a lock held for the log's life). */
  exclusive<Result>(section: () => Promise<Result>): Promise<Result>;
  /**
   * Every *other* device's segment of this chat, as sync projected it beside the log (`events/<deviceId>.jsonl`).
   * Read only; this device's own log is never among them. Absent where a log has no chat directory.
   *
   * A segment whose file did not change since the last call is answered with the same `bytes` object, so a refresh
   * that finds nothing new costs no read and no fold (`readChatSegments`). The segments come in device-id order, the
   * merge's deterministic tie-break, and are not sorted again here. A segment that could not be read for longer than
   * the staleness bound comes back empty with `unreadable` set; one that may still hold a live run rejects the read.
   */
  segments?(): Promise<readonly ChatLogSegment[]>;
};

/** Options for {@link createEventLogAppender}. @internal */
export type EventLogAppenderOptions = Readonly<{
  /** This device's time in epoch milliseconds, which the foreign-run staleness bound reads; `Date.now` by default. */
  now?: (() => number) | undefined;
}>;

/** Whether `next` is `prior`'s parsed bytes with more appended after them. */
const grewFrom = (prior: Uint8Array<ArrayBuffer>, validByteLength: number, next: Uint8Array<ArrayBuffer>): boolean => {
  if (next.byteLength <= prior.byteLength || validByteLength === 0) {
    return false;
  }
  for (let index = 0; index < validByteLength; index++) {
    if (prior[index] !== next[index]) {
      return false;
    }
  }
  return true;
};

/** The own segment's device id in a merge: the empty string, which no segment file can be named. */
const ownDeviceId = '';

/* Unchanged segments come back as the same bytes (`EventLogStorage.segments`), so no byte is compared. */
const sameSegments = (left: readonly ChatLogSegment[], right: readonly ChatLogSegment[]): boolean =>
  left.length === right.length &&
  left.every((segment, index) => segment.deviceId === right[index]!.deviceId && segment.bytes === right[index]!.bytes);

/**
 * Whether a row of a run its device abandoned mid-flight joins this device's history (XD3): the person's own words do
 * — the committed user turn, a steer, an external turn's message, and the rewind an edit or retry asked for — and
 * nothing the run produced does. Its partial reply, its tool calls with no output and the host's own reminders about
 * them stay out, so the model is never shown a call it must answer or an answer cut short.
 *
 * @param event - One row of the abandoned run.
 * @returns Whether the row is kept.
 */
const keptOfAbandonedRun = (event: AgentLogEvent): boolean => {
  if (event.type === 'turn.history-projection-committed' || event.type === 'history.rewound') {
    return true;
  }
  if (event.type !== 'message.appended' || event.message.role !== 'user') {
    return false;
  }
  const kind = event.message.metadata?.tauInternal?.['kind'];
  return kind === undefined || kind === 'external-agent';
};

/**
 * The rows of one segment the history keeps while some of its runs are abandoned (XD3): every row of a run that is
 * not, and {@link keptOfAbandonedRun} of each that is. A run abandoned before it committed its turn holds the person's
 * message only in its admission; that message joins as the run's user turn, under the admission row's own key.
 *
 * @param events - One device's rows.
 * @param abandoned - The run ids its device abandoned.
 * @returns The rows the merge folds.
 */
const withoutAbandonedOutput = (
  events: readonly AgentLogEvent[],
  abandoned: ReadonlySet<string>,
): readonly AgentLogEvent[] => {
  const said = new Set<string>();
  for (const event of events) {
    if (abandoned.has(event.runId) && keptOfAbandonedRun(event) && 'message' in event) {
      said.add(event.message.id);
    }
  }
  return events.flatMap((event): AgentLogEvent[] => {
    if (!abandoned.has(event.runId)) {
      return [event];
    }
    if (keptOfAbandonedRun(event)) {
      return [event];
    }
    const admitted =
      event.type === 'run.lifecycle' && event.state === 'admitted' ? admittedMessageOf(event) : undefined;
    if (admitted === undefined || said.has(admitted.id)) {
      return [];
    }
    said.add(admitted.id);
    let rejoined = rejoinedAdmissions.get(event);
    if (rejoined === undefined) {
      const { version, leaderEpoch, sequence, recordedAt, runId, epoch } = event;
      rejoined = {
        version,
        leaderEpoch,
        sequence,
        recordedAt,
        runId,
        ...(epoch === undefined ? {} : { epoch }),
        type: 'message.appended',
        message: admitted,
      };
      rejoinedAdmissions.set(event, rejoined);
    }
    return [rejoined];
  });
};

/* One rejoined message per admission row, so a refold that changes nothing about it replays the same row object. */
const rejoinedAdmissions = new WeakMap<AgentLogEvent, AgentLogEvent>();

/**
 * The person's message an admission row carries, when it carries one.
 *
 * @param event - A `run.lifecycle` `admitted` row.
 * @returns The user message, or `undefined`.
 */
const admittedMessageOf = (event: AgentLogEvent): UserProviderMessage | undefined => {
  const { admission } = event as { readonly admission?: { readonly message?: unknown } };
  const message = admission?.message as { readonly role?: unknown; readonly id?: unknown } | undefined;
  return message?.role === 'user' && typeof message.id === 'string' ? (message as UserProviderMessage) : undefined;
};

const encoder = new TextEncoder();

/**
 * Take the longest prefix of a page that fits a byte budget.
 *
 * Measured with the same serializer the file is written with, so the budget is
 * the bytes the reader will actually receive rather than an estimate. The
 * first record is always taken: a cursor must advance even past a record no
 * budget could hold.
 *
 * @param window - The count-bounded page.
 * @param maxBytes - Serialized-byte budget for the page.
 * @param opaque - Rows kept as written; they are measured as written, not re-validated.
 * @returns The records that fit, always at least one when the page is not empty.
 */
const byteBounded = (
  window: readonly AgentLogEvent[],
  maxBytes: number,
  opaque: ReadonlySet<AgentLogEvent>,
): AgentLogEvent[] => {
  const taken: AgentLogEvent[] = [];
  let total = 0;
  for (const event of window) {
    total += opaque.has(event)
      ? encoder.encode(`${JSON.stringify(event)}\n`).byteLength
      : serializeLogEventBytes(event).byteLength;
    if (total > maxBytes && taken.length > 0) {
      break;
    }
    taken.push(event);
  }
  return taken;
};

const keyOf = (event: AgentLogEvent): RowKey => ({ leaderEpoch: event.leaderEpoch, sequence: event.sequence });

/** Read a bounded page from the canonical tolerant row sequence. @internal */
export const readEventLogBatch = (
  events: readonly AgentLogEvent[],
  opaqueRows: ReadonlySet<AgentLogEvent>,
  { cursor, limit, maxBytes, last }: Parameters<EventLogAppender['readBatch']>[0],
): EventLogReadAnswer => {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new EventLogError('EVENT_INVALID', 'Event-log cursor and limit must be positive safe integers.');
  }
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) {
    throw new EventLogError('EVENT_INVALID', 'An event-log byte budget must be a positive safe integer.');
  }
  const endCursor = events.length;
  if (cursor > endCursor) {
    return { status: 'refused', reason: 'cursor-ahead', expected: { endCursor } };
  }
  const prior = cursor === 0 ? undefined : events[cursor - 1];
  if (last !== undefined && (prior?.leaderEpoch !== last.leaderEpoch || prior.sequence !== last.sequence)) {
    return {
      status: 'refused',
      reason: 'identity-mismatch',
      expected: { endCursor, ...(prior ? { last: keyOf(prior) } : {}) },
    };
  }
  const window = events.slice(cursor, cursor + limit);
  const batch = maxBytes === undefined ? window : byteBounded(window, maxBytes, opaqueRows);
  return { status: 'batch', cursor, nextCursor: cursor + batch.length, endCursor, events: batch };
};

/**
 * Build the shared appender over one environment-specific file.
 *
 * Opening reads tolerantly and writes nothing: a torn final line is repaired by the first guarded append, not at open,
 * so a reader can never truncate another writer's append in flight.
 *
 * @internal
 * @param storage - Storage primitives for one event-log file.
 * @returns An initialized appender positioned after all kept records.
 */
export const createEventLogAppender = async (
  storage: EventLogStorage,
  options: EventLogAppenderOptions = {},
): Promise<EventLogAppender> => {
  const now = options.now ?? Date.now;
  const bytesAtOpen = await storage.read();
  const parsed = parseEventLogBytes(bytesAtOpen);

  /*
   * Two concerns, kept apart (XD1). The term rules are this device's: its own rows, its own epochs, checked at every
   * append (`terms`). The message history is the chat's: `own` folds this device's rows exactly as a one-device log
   * always has, and `merged` folds them together with every other device's segment once there is one.
   */
  const terms = createEventLogReducer('terms');
  /*
   * The history over this device's rows alone, as a one-device log has always folded it, term rules included. Folding
   * it in `history` mode over the rows `terms` kept would drop the duplicated sequence work, but it reports a
   * different history verdict on corpora the Lean ledger goldens pin (`chat-ledger.differential.test.ts`), so the
   * duplication stays.
   */
  const own = createEventLogReducer();
  const anomalies: EventLogAnomaly[] = parsed.quarantined.map((byteOffset) => ({
    kind: 'quarantined',
    message: `Line at byte ${byteOffset} has no valid row envelope; it is skipped.`,
    byteOffset,
  }));
  const opaqueRows = new Set<AgentLogEvent>();
  /** This device's rows a merge folds, in file order: each key once, as the term rules kept it. */
  const ownRows: AgentLogEvent[] = [];
  /** The run ids this device's own rows name: never another device's runs (XD3). */
  const ownRunIds = new Set<string>();
  const cursorOf = new Map<AgentLogEvent, number>();
  for (const [cursor, row] of parsed.rows.entries()) {
    if (row.opaque) {
      opaqueRows.add(row.event);
    }
    const kept = terms.replay(row.event);
    if (!kept.duplicate && kept.anomaly?.kind !== 'conflict') {
      ownRows.push(row.event);
      ownRunIds.add(row.event.runId);
      cursorOf.set(row.event, cursor);
    }
    const replayed: { readonly anomaly?: ReplayAnomaly } = own.replay(row.event);
    if (replayed.anomaly) {
      anomalies.push({ ...replayed.anomaly, cursor });
    }
  }

  let segments: readonly ChatLogSegment[] = [];
  let foreign: readonly ParsedLogSegment[] = [];
  /** Every run the foreign segments hold unsettled, as the last fold read them (XD3). */
  let foreignUnsettled: readonly ForeignRun[] = [];
  /*
   * Each device's segment as last parsed. An unchanged segment is parsed once, whichever other segment moved; one that
   * only grew (a row, a heartbeat) parses its new lines alone and keeps the rows it already had, so the fold can replay
   * just what was appended.
   */
  const parsedSegments = new Map<
    string,
    Readonly<{ bytes: Uint8Array<ArrayBuffer>; events: readonly AgentLogEvent[]; validByteLength: number }>
  >();
  const parse = (deviceId: string, bytes: Uint8Array<ArrayBuffer>): readonly AgentLogEvent[] => {
    const prior = parsedSegments.get(deviceId);
    if (prior?.bytes === bytes) {
      return prior.events;
    }
    let next: Readonly<{ bytes: Uint8Array<ArrayBuffer>; events: readonly AgentLogEvent[]; validByteLength: number }>;
    if (prior !== undefined && grewFrom(prior.bytes, prior.validByteLength, bytes)) {
      const tail = parseEventLogBytes(bytes.slice(prior.validByteLength));
      const events = tail.events.length === 0 ? prior.events : [...prior.events, ...tail.events];
      if (events !== prior.events) {
        /* Its runs fold on from the rows already folded (XD3). */
        noteGrownRows(events, prior.events);
      }
      next = { bytes, events, validByteLength: prior.validByteLength + tail.validByteLength };
    } else {
      const whole = parseEventLogBytes(bytes);
      next = { bytes, events: whole.events, validByteLength: whole.validByteLength };
    }
    parsedSegments.set(deviceId, next);
    return next.events;
  };
  /** The rows the merged fold replayed, in order: a fold whose rows extend them replays only the rest. */
  let mergedRows: AgentLogEvent[] = [];
  /** Where each term's rows begin in {@link mergedRows}: terms merge whole, so these places decide an extension. */
  let mergedTermStarts: number[] = [];
  const termStartsOf = (rows: readonly AgentLogEvent[]): number[] =>
    rows.flatMap((row, index) => (index === 0 || rows[index - 1]!.leaderEpoch !== row.leaderEpoch ? [index] : []));
  /*
   * Whether `rows` are `mergedRows` with more after them, checked at each term's first row and at the last row
   * rather than row by row: terms merge whole and rows only ever append, so an old row moved anywhere moves one of
   * those places.
   */
  const extendsMerged = (rows: readonly AgentLogEvent[]): boolean => {
    const { length } = mergedRows;
    return (
      rows.length >= length &&
      (length === 0 || rows[length - 1] === mergedRows[length - 1]) &&
      mergedTermStarts.every((index) => rows[index] === mergedRows[index])
    );
  };
  let mergedReplayAnomalies: EventLogAnomaly[] = [];
  let merged: ReturnType<typeof createEventLogReducer> | undefined;
  let mergedAnomalies: EventLogAnomaly[] = [];
  let segmentFailure: EventLogAnomaly | undefined;
  /** When the fence would next answer differently about a foreign run this fold read, so the history follows it (XD3). */
  let refoldAt: number | undefined;
  const fold = (): void => {
    refoldAt = undefined;
    if (segments.length === 0) {
      foreign = [];
      foreignUnsettled = [];
      merged = undefined;
      mergedRows = [];
      mergedTermStarts = [];
      mergedReplayAnomalies = [];
      mergedAnomalies = [];
      return;
    }
    const conflicts: EventLogAnomaly[] = [];
    for (const deviceId of parsedSegments.keys()) {
      if (!segments.some((segment) => segment.deviceId === deviceId)) {
        parsedSegments.delete(deviceId);
      }
    }
    foreign = segments.map((segment) => ({
      deviceId: segment.deviceId,
      events: parse(segment.deviceId, segment.bytes),
    }));
    /*
     * XD3: a run another device has not settled stays out of the history while it holds the chat, unless it is this
     * device's own run read back from a segment: its dangling turn would otherwise be answered here, or its open tool
     * calls closed here as disconnected, while that device still runs it. Once it is past the fence's staleness bound
     * its device is gone, and the person's turn joins the history without what the run left half done.
     */
    const at = now();
    const held = new Map<string, Set<string>>();
    const abandoned = new Map<string, Set<string>>();
    foreignUnsettled = unsettledParsedRuns(foreign);
    for (const run of foreignUnsettled) {
      if (ownRunIds.has(run.runId)) {
        continue;
      }
      /* The fence's own rule (`foreignRunStanding`): the history refolds whenever the fence's answer would change. */
      const standing = foreignRunStanding(run, at);
      const into = standing.abandoned ? abandoned : held;
      const ids = into.get(run.deviceId) ?? new Set<string>();
      ids.add(run.runId);
      into.set(run.deviceId, ids);
      if (standing.changesAt !== undefined) {
        refoldAt = refoldAt === undefined ? standing.changesAt : Math.min(refoldAt, standing.changesAt);
      }
    }
    const toMerge: ParsedLogSegment[] = [
      { deviceId: ownDeviceId, events: ownRows },
      ...foreign.map((segment) => {
        const heldIds = held.get(segment.deviceId);
        const abandonedIds = abandoned.get(segment.deviceId);
        return heldIds === undefined && abandonedIds === undefined
          ? segment
          : {
              deviceId: segment.deviceId,
              events: withoutAbandonedOutput(
                heldIds === undefined ? segment.events : segment.events.filter((event) => !heldIds.has(event.runId)),
                abandonedIds ?? new Set(),
              ),
            };
      }),
    ];
    const rows = mergeSegmentRows(toMerge, {
      onConflict: ({ key, keptDeviceId, droppedDeviceId }) => {
        conflicts.push({
          kind: 'conflict',
          message: `Leader epoch "${key.leaderEpoch}" sequence ${key.sequence} differs between devices; the copy from "${
            keptDeviceId || 'this device'
          }" is kept over "${droppedDeviceId || 'this device'}".`,
        });
      },
    });
    /* Only what the rows add past those already replayed, when they extend them; otherwise the whole merge again. */
    const extends_ = merged !== undefined && extendsMerged(rows);
    const next = extends_ ? merged! : createEventLogReducer('history');
    const replayAnomalies = extends_ ? mergedReplayAnomalies : [];
    for (const row of rows.slice(extends_ ? mergedRows.length : 0)) {
      const replayed = next.replay(row);
      if (replayed.anomaly) {
        const cursor = cursorOf.get(row);
        replayAnomalies.push({ ...replayed.anomaly, ...(cursor === undefined ? {} : { cursor }) });
      }
    }
    if (extends_) {
      for (let index = Math.max(mergedRows.length, 1); index < rows.length; index++) {
        if (rows[index - 1]!.leaderEpoch !== rows[index]!.leaderEpoch) {
          mergedTermStarts.push(index);
        }
      }
      if (mergedRows.length === 0 && rows.length > 0) {
        mergedTermStarts.unshift(0);
      }
    } else {
      mergedTermStarts = termStartsOf(rows);
    }
    merged = next;
    mergedRows = rows as AgentLogEvent[];
    mergedReplayAnomalies = replayAnomalies;
    mergedAnomalies = [...conflicts, ...replayAnomalies];
  };
  /*
   * Reading never fails a chat (D16): segments that cannot be read leave the history as it was, and say so. The fence
   * does not read that as "no other device": `foreignRuns` refuses until a read succeeds.
   */
  const readSegments = async (): Promise<void> => {
    if (storage.segments === undefined) {
      return;
    }
    let next: readonly ChatLogSegment[];
    try {
      next = await storage.segments();
      segmentFailure = undefined;
    } catch (error) {
      segmentFailure = {
        kind: 'history',
        message: `The other devices' segments could not be read, so the history leaves out what they hold now: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
      return;
    }
    if (!sameSegments(segments, next) || (refoldAt !== undefined && now() >= refoldAt)) {
      segments = next;
      fold();
    }
  };
  await readSegments();
  /**
   * The history the model reads: the merge, unless it does not fold while this device's rows alone still do — two
   * devices that each ran the chat without the other's turns, written before a run fence existed.
   *
   * @returns The fold whose messages are the chat's history.
   */
  const history = (): ReturnType<typeof createEventLogReducer> => {
    if (merged !== undefined && (merged.historyIntact() || !own.historyIntact())) {
      return merged;
    }
    return ownWithoutGone() ?? own;
  };
  /*
   * XD1: this device's rows, written over the merged history, can name another device's messages. With no merge to
   * read they do not fold alone. While the segments cannot be read that history is unknown, never invalid: the fence
   * refuses `SEGMENTS_UNREADABLE` (`wait`) until a read succeeds. Once the read succeeds and no segment holds those
   * messages (a device removed from the project took its segment), the history is this device's rows with the names
   * of what is gone left out, and says so.
   */
  const historyUnknown = (): boolean => merged === undefined && segmentFailure !== undefined && !own.historyIntact();
  let lenient: ReturnType<typeof createEventLogReducer> | undefined;
  const ownWithoutGone = (): ReturnType<typeof createEventLogReducer> | undefined => {
    if (storage.segments === undefined || merged !== undefined || segmentFailure !== undefined || own.historyIntact()) {
      return undefined;
    }
    if (lenient === undefined) {
      lenient = createEventLogReducer('log', { missingMessages: 'skip' });
      for (const event of events) {
        lenient.replay(event);
      }
    }
    return lenient;
  };
  const gone: EventLogAnomaly = {
    kind: 'history',
    message:
      "This device's rows name messages no segment here holds (another device's segment is gone); the history leaves those names out.",
  };
  const divergence: EventLogAnomaly = {
    kind: 'history',
    message: "The other devices' segments do not fold onto this device's log; the history is this device's rows alone.",
  };

  const events = [...parsed.events];
  let { needsSeparator } = parsed;
  /** The bytes this appender's view covers: the log as it read it. */
  let byteLength = parsed.validByteLength;
  /** A torn final line seen at open, repaired by the first guarded append if its bytes are still exactly the tail. */
  let tornTail: Uint8Array<ArrayBuffer> | undefined = parsed.discardedTail
    ? bytesAtOpen.slice(parsed.validByteLength)
    : undefined;
  let closed = false;
  let poisoned = false;
  let fenced = false;
  let pending: Promise<void> = Promise.resolve();

  const enqueue = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const prior = pending;
    const next = Promise.withResolvers<void>();
    pending = next.promise;
    await prior;
    try {
      const result = await operation();
      return result;
    } finally {
      next.resolve();
    }
  };

  const assertOpen = (): void => {
    if (closed) {
      throw new EventLogError(
        'LOG_CLOSED',
        'The event log is closed; create a new appender before reading or writing.',
      );
    }
    if (poisoned) {
      throw new EventLogError(
        'LOG_POISONED',
        'The event log could not roll back a failed append; close this handle and recover the file before reuse.',
      );
    }
  };

  const fencedError = (): EventLogError =>
    new EventLogError(
      'LOG_FENCED',
      'This chat log changed under this writer; nothing was written. Reopen the log, or answer from the current leader.',
    );

  /* D5, CL-R11: the conditional append. Inside the binding's lock, the log must still be exactly the bytes this
   * appender read (or those plus the torn tail it saw at open); otherwise another writer appended, and this writer's
   * view, and so its term's claim, is stale. The refusal writes nothing and never rolls back. */
  /**
   * Compare bytes, not lengths: another writer's line can be exactly as long as the torn one (T9).
   *
   * @param torn - The torn tail read at open.
   * @returns Whether the log's tail past this view is still exactly those bytes.
   */
  const isTornTail = async (torn: Uint8Array<ArrayBuffer>): Promise<boolean> => {
    const bytes = await storage.read();
    const tail = bytes.subarray(byteLength);
    return tail.byteLength === torn.byteLength && tail.every((byte, index) => byte === torn[index]);
  };

  const guardedAppend = async (bytes: Uint8Array<ArrayBuffer>): Promise<void> =>
    storage.exclusive(async () => {
      const size = await storage.size();
      if (tornTail !== undefined && size === byteLength + tornTail.byteLength && (await isTornTail(tornTail))) {
        await storage.truncate(byteLength);
      } else if (size !== byteLength) {
        fenced = true;
        throw fencedError();
      }
      tornTail = undefined;
      try {
        await storage.append(bytes);
      } catch (appendError) {
        // Safe: no other writer can append inside this section, so the bytes past `byteLength` are this append's.
        try {
          await storage.truncate(byteLength);
        } catch (rollbackError) {
          poisoned = true;
          throw new EventLogError(
            'LOG_POISONED',
            'The event-log append failed and its partial bytes could not be rolled back.',
            { cause: new AggregateError([appendError, rollbackError], 'Append and rollback both failed.') },
          );
        }
        throw appendError;
      }
    });

  return {
    append: async (candidate) =>
      enqueue(async () => {
        assertOpen();
        if (fenced) {
          throw fencedError();
        }
        const event = parseLogEvent(candidate);
        /* The term rules first, on this device's rows: a duplicate is answered before any history rule runs. */
        const term = terms.prepare(event);
        if (term.duplicate) {
          return { appended: false, endCursor: events.length };
        }
        const folding = history();
        const transition = folding.prepare(term.event);
        if (transition.duplicate) {
          return { appended: false, endCursor: events.length };
        }
        const bytes = serializeLogEventBytes(event, needsSeparator);
        await guardedAppend(bytes);
        term.commit();
        transition.commit();
        /* Rebuilt from the log when next needed, with this row. */
        lenient = undefined;
        /* The other fold follows tolerantly: a row naming another device's message does not apply to `own`. */
        if (folding !== own) {
          own.replay(transition.event);
        } else if (merged !== undefined) {
          merged.replay(transition.event);
        }
        if (merged !== undefined) {
          if (mergedRows.at(-1)?.leaderEpoch !== transition.event.leaderEpoch) {
            mergedTermStarts.push(mergedRows.length);
          }
          mergedRows.push(transition.event);
        }
        events.push(transition.event);
        ownRows.push(transition.event);
        ownRunIds.add(transition.event.runId);
        cursorOf.set(transition.event, events.length - 1);
        byteLength += bytes.byteLength;
        needsSeparator = false;
        return { appended: true, endCursor: events.length };
      }),
    read: async () =>
      enqueue(async () => {
        assertOpen();
        return [...events];
      }),
    readBatch: async ({ cursor, limit, maxBytes, last }) =>
      enqueue(async () => {
        assertOpen();
        return readEventLogBatch(events, opaqueRows, { cursor, limit, maxBytes, last });
      }),
    messages: async () => enqueue(async () => history().messages()),
    historyIntact: async () =>
      enqueue(async () => (historyUnknown() || history().historyIntact()) && parsed.quarantined.length === 0),
    anomalies: async () =>
      enqueue(async () => {
        const failure: EventLogAnomaly[] = [
          ...(segmentFailure === undefined ? [] : [segmentFailure]),
          ...segments.flatMap((segment): EventLogAnomaly[] =>
            segment.unreadable === undefined
              ? []
              : [
                  {
                    kind: 'history',
                    message: `The segment from "${segment.deviceId}" has not read, nor changed, for longer than the run staleness bound, so the history leaves it out: ${segment.unreadable}`,
                  },
                ],
          ),
        ];
        if (merged === undefined) {
          return history() === lenient
            ? [...anomalies.filter((anomaly) => anomaly.kind !== 'history'), gone, ...failure]
            : [...anomalies, ...failure];
        }
        if (history() === own) {
          return [...anomalies, divergence, ...failure];
        }
        return [...anomalies.filter((anomaly) => anomaly.kind !== 'history'), ...mergedAnomalies, ...failure];
      }),
    ...(storage.segments === undefined
      ? {}
      : {
          refresh: async () =>
            enqueue(async () => {
              assertOpen();
              await readSegments();
            }),
          historyUnknown: async () => enqueue(async () => historyUnknown()),
          foreignWrittenAt: async () =>
            enqueue(async () => {
              assertOpen();
              let newest: number | undefined;
              for (const segment of foreign) {
                for (const event of segment.events) {
                  const at = Date.parse(event.recordedAt);
                  if (!ownRunIds.has(event.runId) && !Number.isNaN(at) && (newest === undefined || at > newest)) {
                    newest = at;
                  }
                }
              }
              return newest;
            }),
          foreignRuns: async () =>
            enqueue(async () => {
              assertOpen();
              if (segmentFailure !== undefined) {
                throw new EventLogError(
                  'SEGMENTS_UNREADABLE',
                  "Another device's copy of this chat could not be read, so whether it is running the chat is unknown.",
                  { cause: segmentFailure.message },
                );
              }
              return foreignUnsettled.filter((run) => !ownRunIds.has(run.runId));
            }),
        }),
    close: async () =>
      enqueue(async () => {
        if (closed) {
          return;
        }
        closed = true;
        await storage.close();
      }),
  };
};
