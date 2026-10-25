import { EventLogError } from '#log/event-log-error.js';
import { parseLogEvent } from '#log/event-schema.js';
import { createEventLogReducer } from '#log/reducer.js';
import type { ReplayAnomaly } from '#log/reducer.js';
import { parseSegmentFrom, unsettledParsedRuns } from '#log/foreign-runs.js';
import type { ForeignRun, SegmentParse } from '#log/foreign-runs.js';
import { foreignClockAheadMilliseconds, mergeSegmentsUpTo } from '#log/segments.js';
import type { ChatLogSegment, ParsedLogSegment } from '#log/segments.js';
import { parseEventLogBytes, serializeLogEventBytes } from '#log/serialization.js';
import type { AgentLogEvent, ProviderMessage, RowKey } from '#log/event-types.js';
import { isAbandonedTurn } from '#log/event-types.js';

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
   * Whether another device has written this chat since this log first wrote under its current term (XD1): whether any
   * other device's segment, as the last open or refresh read it, holds more rows that are not this device's own runs
   * read back than it held, as read then. It compares what this device read, never another device's clock. `false`
   * before this log writes. A writer whose term another device's rows came after opens a new term for its next turn,
   * so that turn merges after them (terms merge whole, CL-R14). Absent where `refresh` is.
   */
  foreignWroteSinceTermBegan?(): Promise<boolean>;
  /**
   * Whether another device took this device's run over (XD3, round 17): its segment, as the last open or refresh read
   * it, says the run's turn as data (`abandonedTurnOf`), which a device appends only when it found the run abandoned
   * and went on past it. A row of this device's own read back from a segment never counts. Absent where `refresh` is.
   *
   * @param runId - This device's run, as its own rows name it.
   */
  runTakenOver?(runId: string): Promise<boolean>;
  /**
   * When a row written now is stamped (XD1, a hybrid logical clock): `now`, or one millisecond past the newest term
   * start in the history the last open or refresh folded, and past every row of another device's unsettled run that
   * fold held out of the history, whichever is later. The merge orders terms by their start, so a turn stamped this
   * way merges after every term its history read (`t7_projection_after_visible` in ChatLedger.lean), and after a held
   * run's term once its device settles it; and since the fold leaves out a term or row dated more than
   * `foreignClockAheadMilliseconds` past this clock, the stamp never runs further ahead than that bound, whatever
   * another device's clock says. The floor is computed once per fold, never per write. Absent where `refresh` is.
   */
  stampAfterRead?(now: number): Promise<number>;
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

/**
 * The message ids a row introduces into a history: what a later row may name.
 *
 * @param event - The row.
 * @returns The ids it introduces.
 */
const introducedBy = (event: AgentLogEvent): readonly string[] => {
  switch (event.type) {
    case 'message.appended':
    case 'turn.history-projection-committed': {
      return [event.message.id];
    }
    case 'safeguard.recorded': {
      return event.action === 'terminate' ? [] : [event.message.id];
    }
    case 'history.compacted': {
      return [event.summary.id];
    }
    default: {
      return [];
    }
  }
};

/** The own segment's device id in a merge: the empty string, which no segment file can be named. */
const ownDeviceId = '';

/*
 * Unchanged segments come back as the same bytes (`EventLogStorage.segments`), so no byte is compared. A new pull of
 * the remote with no new bytes still refolds: it can show another device's run abandoned (XD3, round 18).
 */
const sameSegments = (left: readonly ChatLogSegment[], right: readonly ChatLogSegment[]): boolean =>
  left.length === right.length &&
  left.every(
    (segment, index) =>
      segment.deviceId === right[index]!.deviceId &&
      segment.bytes === right[index]!.bytes &&
      segment.receivedAt === right[index]!.receivedAt &&
      segment.pulledQuiet === right[index]!.pulledQuiet,
  );

const encoder = new TextEncoder();

/**
 * The newest `recordedAt`, at most `notAfter`, among the rows of other devices' runs a fold held out of the history
 * (XD1, XD3). Those rows were read all the same: the hybrid clock follows them within the bound, so a term this device
 * writes, a takeover's included, starts after a held run's term and merges after it once its device settles the run.
 *
 * @param foreign - Other devices' parsed segments.
 * @param held - The held run ids, by device.
 * @param notAfter - The fold's bound.
 * @returns Epoch milliseconds, or negative infinity when no held row is within the bound.
 */
const newestHeldRow = (
  foreign: readonly ParsedLogSegment[],
  held: ReadonlyMap<string, ReadonlySet<string>>,
  notAfter: number,
): number => {
  let newest = Number.NEGATIVE_INFINITY;
  for (const segment of foreign) {
    const heldIds = held.get(segment.deviceId);
    for (const event of heldIds === undefined ? [] : segment.events) {
      const recorded = Date.parse(event.recordedAt);
      if (heldIds!.has(event.runId) && recorded <= notAfter && recorded > newest) {
        newest = recorded;
      }
    }
  }
  return newest;
};

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
  /**
   * The run ids this device's own rows name (XD3): the runs it ran, and another device's run whose person's turn it
   * appended on finding the run abandoned, which no longer holds the chat here.
   */
  const ownRunIds = new Set<string>();
  /** The runs this device ran: its rows hold their lifecycle, so their rows read back from a segment are its own. */
  const ranHere = new Set<string>();
  /** The latest `recordedAt` among this device's own rows: its own terms always join the history it reads. */
  let ownNewest = Number.NEGATIVE_INFINITY;
  const noteOwn = (event: AgentLogEvent): void => {
    const at = Date.parse(event.recordedAt);
    if (!Number.isNaN(at) && at > ownNewest) {
      ownNewest = at;
    }
    ownRunIds.add(event.runId);
    if (event.type === 'run.lifecycle') {
      ranHere.add(event.runId);
    }
  };
  const cursorOf = new Map<AgentLogEvent, number>();
  for (const [cursor, row] of parsed.rows.entries()) {
    if (row.opaque) {
      opaqueRows.add(row.event);
    }
    const kept = terms.replay(row.event);
    if (!kept.duplicate && kept.anomaly?.kind !== 'conflict') {
      ownRows.push(row.event);
      noteOwn(row.event);
      cursorOf.set(row.event, cursor);
    }
    const replayed: { readonly anomaly?: ReplayAnomaly } = own.replay(row.event);
    if (replayed.anomaly) {
      anomalies.push({ ...replayed.anomaly, cursor });
    }
  }

  let segments: readonly ChatLogSegment[] = [];
  let foreign: readonly ParsedLogSegment[] = [];
  /** How many rows each other device's segment held, not counting this device's runs read back. */
  const foreignFrontier = (): ReadonlyMap<string, number> =>
    new Map(
      foreign.map((segment) => [segment.deviceId, segment.events.filter((event) => !ranHere.has(event.runId)).length]),
    );
  /** The term this log last wrote under, and the other devices' rows as read when it first wrote under it. */
  let termFrontier: Readonly<{ leaderEpoch: string; rows: ReadonlyMap<string, number> }> | undefined;
  /** Every run the foreign segments hold unsettled, as the last fold read them (XD3). */
  let foreignUnsettled: readonly ForeignRun[] = [];
  /*
   * Each device's segment as last parsed. An unchanged segment is parsed once, whichever other segment moved; one that
   * only grew (a row, a heartbeat) parses its new lines alone and keeps the rows it already had, so the fold can replay
   * just what was appended.
   */
  const parsedSegments = new Map<string, SegmentParse>();
  const parse = (deviceId: string, bytes: Uint8Array<ArrayBuffer>): readonly AgentLogEvent[] => {
    const next = parseSegmentFrom(parsedSegments.get(deviceId), bytes);
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
  /*
   * Round 17: what is gone is one rule for every history this log folds, however many segments remain. A message is
   * gone when no row here introduces it: not this device's, nor any segment's as read, held-out runs' rows included. A
   * row naming a gone message leaves that name out; a name some row here introduces, only later, still breaks the
   * history.
   */
  let introduced = new Set<string>();
  const introduce = (events: readonly AgentLogEvent[]): void => {
    for (const event of events) {
      for (const id of introducedBy(event)) {
        introduced.add(id);
      }
    }
  };
  introduce(ownRows);
  /* Every name the rows read now introduce: this device's and every segment's as last parsed. */
  const introduceRead = (): void => {
    introduced = new Set();
    introduce(ownRows);
    for (const segment of foreign) {
      introduce(segment.events);
    }
  };
  /* The names the merged fold left out as gone: should a segment bring one later, the merge is folded again whole. */
  let mergedGone = new Set<string>();
  let merged: ReturnType<typeof createEventLogReducer> | undefined;
  /* Whether the merged fold goes on with `rows`: they extend what it replayed, and nothing it left out as gone is back. */
  const keepsMerged = (rows: readonly AgentLogEvent[]): boolean =>
    merged !== undefined && extendsMerged(rows) && ![...mergedGone].some((messageId) => introduced.has(messageId));
  /* A merged fold from nothing, which leaves out as gone, and records, each name no row read introduces. */
  const freshMerged = (): ReturnType<typeof createEventLogReducer> => {
    const left = new Set<string>();
    mergedGone = left;
    return createEventLogReducer('history', {
      gone: (messageId) => {
        if (introduced.has(messageId)) {
          return false;
        }
        left.add(messageId);
        return true;
      },
    });
  };
  let mergedAnomalies: EventLogAnomaly[] = [];
  let segmentFailure: EventLogAnomaly | undefined;
  /** When a term this fold left out as dated past the bound comes within it, so the history takes it up then. */
  let refoldAt: number | undefined;
  /**
   * The earliest time this device may stamp a row with (round 16, a hybrid logical clock): one past the newest start
   * among the terms the last fold kept, and past the rows of the runs it held out, within the bound. Computed once per
   * fold, never per write.
   */
  let stampFloor = Number.NEGATIVE_INFINITY;
  const fold = (): void => {
    refoldAt = undefined;
    if (segments.length === 0) {
      stampFloor = Number.NEGATIVE_INFINITY;
      foreign = [];
      introduceRead();
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
      receivedAt: segment.receivedAt,
      pulledQuiet: segment.pulledQuiet,
    }));
    introduceRead();
    /*
     * XD3: a run another device has not settled stays out of the history, live or not, unless this device ran it (its
     * own rows read back from a segment): its dangling turn would otherwise be answered here, or its open tool calls
     * closed here as disconnected, while that device may still run it. The person's words of a run that settles before
     * committing its turn reach the history as data: the device that settles it, or the one that finds it abandoned
     * and goes on, appends them (`abandonedTurnOf`), and every copy merges as one.
     */
    const held = new Map<string, Set<string>>();
    foreignUnsettled = unsettledParsedRuns(foreign, now());
    for (const run of foreignUnsettled) {
      if (ranHere.has(run.runId)) {
        continue;
      }
      const ids = held.get(run.deviceId) ?? new Set<string>();
      ids.add(run.runId);
      held.set(run.deviceId, ids);
    }
    const toMerge: ParsedLogSegment[] = [
      { deviceId: ownDeviceId, events: ownRows },
      ...foreign.map((segment) => {
        const heldIds = held.get(segment.deviceId);
        return heldIds === undefined
          ? segment
          : { deviceId: segment.deviceId, events: segment.events.filter((event) => !heldIds.has(event.runId)) };
      }),
    ];
    /*
     * A term another device dated more than the bound past this clock is left out until this clock comes within it,
     * and said so; this device's own terms always join. The rows kept are a prefix of the whole merge, and the clock
     * this device stamps by is after their newest start and never further ahead than the bound (round 16).
     */
    const notAfter = Math.max(now() + foreignClockAheadMilliseconds, ownNewest);
    const bounded = mergeSegmentsUpTo(toMerge, notAfter, {
      onConflict: ({ key, keptDeviceId, droppedDeviceId }) => {
        conflicts.push({
          kind: 'conflict',
          message: `Leader epoch "${key.leaderEpoch}" sequence ${key.sequence} differs between devices; the copy from "${
            keptDeviceId || 'this device'
          }" is kept over "${droppedDeviceId || 'this device'}".`,
        });
      },
    });
    const { rows } = bounded;
    /* Negative infinity stays itself: with nothing read, the wall clock alone stamps. */
    stampFloor = Math.max(bounded.newestStart ?? Number.NEGATIVE_INFINITY, newestHeldRow(foreign, held, notAfter)) + 1;
    for (const later of bounded.later) {
      conflicts.push({
        kind: 'history',
        message: `Leader epoch "${later.leaderEpoch}" starts at ${new Date(later.startedAt).toISOString()}, more than ${String(
          foreignClockAheadMilliseconds / 60_000,
        )} minutes ahead of this device's clock; the history leaves its rows out until this clock comes within that.`,
      });
      const within = later.startedAt - foreignClockAheadMilliseconds;
      refoldAt = refoldAt === undefined ? within : Math.min(refoldAt, within);
    }
    /* Only what the rows add past those already replayed, when they extend them; otherwise the whole merge again. */
    const extends_ = keepsMerged(rows);
    const next = extends_ ? merged! : freshMerged();
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
      lenient = createEventLogReducer('log', { gone: (messageId) => !introduced.has(messageId) });
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
  /** The merged fold's anomalies now: what it left out as gone, too, as its rows are replayed and appended. */
  const mergedAnomaliesNow = (): EventLogAnomaly[] =>
    mergedGone.size === 0 ? mergedAnomalies : [...mergedAnomalies, gone];
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
        if (termFrontier?.leaderEpoch !== transition.event.leaderEpoch) {
          termFrontier = { leaderEpoch: transition.event.leaderEpoch, rows: foreignFrontier() };
        }
        events.push(transition.event);
        ownRows.push(transition.event);
        introduce([transition.event]);
        noteOwn(transition.event);
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
        return [...anomalies.filter((anomaly) => anomaly.kind !== 'history'), ...mergedAnomaliesNow(), ...failure];
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
          stampAfterRead: async (wall: number) =>
            enqueue(async () => {
              assertOpen();
              return Math.max(wall, stampFloor);
            }),
          foreignWroteSinceTermBegan: async () =>
            enqueue(async () => {
              assertOpen();
              if (termFrontier === undefined) {
                return false;
              }
              const seen = termFrontier.rows;
              return [...foreignFrontier()].some(([deviceId, rows]) => rows > (seen.get(deviceId) ?? 0));
            }),
          runTakenOver: async (runId: string) =>
            enqueue(async () => {
              assertOpen();
              const said = foreign.flatMap((segment) =>
                segment.events.filter(
                  (event) =>
                    event.runId === runId && event.type === 'message.appended' && isAbandonedTurn(event.message),
                ),
              );
              return said.some(
                (event) =>
                  !ownRows.some((row) => row.leaderEpoch === event.leaderEpoch && row.sequence === event.sequence),
              );
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
