import { EventLogError } from '#log/event-log-error.js';
import { parseLogEvent } from '#log/event-schema.js';
import { createEventLogReducer } from '#log/reducer.js';
import type { ReplayAnomaly } from '#log/reducer.js';
import { parseEventLogBytes, serializeLogEventBytes } from '#log/serialization.js';
import type { AgentLogEvent, ProviderMessage, RowKey } from '#log/event-types.js';

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
  /** Read the records currently visible to this appender, opaque rows included. */
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
  /** The provider history the kept rows reduce to, maintained incrementally (L2a D18). */
  messages(): Promise<readonly ProviderMessage[]>;
  /** `false` when a history row was rejected at open: the chat reads, and the host refuses to run it. */
  historyIntact(): Promise<boolean>;
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
export const createEventLogAppender = async (storage: EventLogStorage): Promise<EventLogAppender> => {
  const bytesAtOpen = await storage.read();
  const parsed = parseEventLogBytes(bytesAtOpen);

  const reducer = createEventLogReducer();
  const anomalies: EventLogAnomaly[] = parsed.quarantined.map((byteOffset) => ({
    kind: 'quarantined',
    message: `Line at byte ${byteOffset} has no valid row envelope; it is skipped.`,
    byteOffset,
  }));
  const opaqueRows = new Set<AgentLogEvent>();
  for (const [cursor, row] of parsed.rows.entries()) {
    if (row.opaque) {
      opaqueRows.add(row.event);
    }
    const replayed: { readonly anomaly?: ReplayAnomaly } = reducer.replay(row.event);
    if (replayed.anomaly) {
      anomalies.push({ ...replayed.anomaly, cursor });
    }
  }

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
        const transition = reducer.prepare(event);
        if (transition.duplicate) {
          return { appended: false, endCursor: events.length };
        }
        const bytes = serializeLogEventBytes(event, needsSeparator);
        await guardedAppend(bytes);
        transition.commit();
        events.push(transition.event);
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
    messages: async () => enqueue(async () => reducer.messages()),
    historyIntact: async () => enqueue(async () => reducer.historyIntact() && parsed.quarantined.length === 0),
    anomalies: async () => enqueue(async () => [...anomalies]),
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
