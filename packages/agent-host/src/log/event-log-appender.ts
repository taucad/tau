import { EventLogError } from '#log/event-log-error.js';
import { parseLogEvent } from '#log/event-schema.js';
import { createEventLogReducer } from '#log/reducer.js';
import { parseEventLogBytes, serializeLogEventBytes } from '#log/serialization.js';
import type { AgentLogEvent } from '#log/event-types.js';

/** Result of an idempotent event-log append. @public */
export type EventLogAppendOutcome = { readonly appended: true } | { readonly appended: false };

/** One bounded read from an event-log cursor. @public */
export type EventLogBatch = {
  readonly cursor: number;
  readonly nextCursor: number;
  readonly endCursor: number;
  readonly events: readonly AgentLogEvent[];
};

/** Durable ordered event-log appender shared by browser and Node hosts. @public */
export type EventLogAppender = {
  /** Append and flush one event, or no-op when its epoch and sequence already exist unchanged. */
  append(event: AgentLogEvent): Promise<EventLogAppendOutcome>;
  /** Read the validated records currently visible to this appender. */
  read(): Promise<readonly AgentLogEvent[]>;
  /**
   * Read at most `limit` records starting at the zero-based cursor, and at
   * most `maxBytes` of serialized payload when one is named.
   *
   * A count alone does not bound a page: one record holding a whole file read
   * can be larger than every other record in the log put together. A record
   * that exceeds the budget on its own is still returned, so an oversized
   * record slows a reader down rather than wedging its cursor.
   */
  readBatch(input: {
    readonly cursor: number;
    readonly limit: number;
    readonly maxBytes?: number | undefined;
  }): Promise<EventLogBatch>;
  /** Flush pending operations and release the underlying file handle. */
  close(): Promise<void>;
};

/** Storage primitives used by environment-specific appenders. @internal */
export type EventLogStorage = {
  read(): Promise<Uint8Array<ArrayBuffer>>;
  append(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
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
 * @returns The records that fit, always at least one when the page is not empty.
 */
const byteBounded = (window: readonly AgentLogEvent[], maxBytes: number): AgentLogEvent[] => {
  const taken: AgentLogEvent[] = [];
  let total = 0;
  for (const event of window) {
    total += serializeLogEventBytes(event).byteLength;
    if (total > maxBytes && taken.length > 0) {
      break;
    }
    taken.push(event);
  }
  return taken;
};

/**
 * Build the shared appender over one environment-specific file.
 *
 * @internal
 * @param storage - Exclusive storage primitives for one event-log file.
 * @returns An initialized appender positioned after all valid records.
 */
export const createEventLogAppender = async (storage: EventLogStorage): Promise<EventLogAppender> => {
  const parsed = parseEventLogBytes(await storage.read());
  if (parsed.discardedTail) {
    await storage.truncate(parsed.validByteLength);
  }

  const reducer = createEventLogReducer();
  for (const event of parsed.events) {
    const transition = reducer.prepare(event);
    if (!transition.duplicate) {
      transition.commit();
    }
  }

  const events = [...parsed.events];
  const { needsSeparator: initialNeedsSeparator } = parsed;
  let needsSeparator = initialNeedsSeparator;
  let byteLength = parsed.validByteLength;
  let closed = false;
  let poisoned = false;
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

  return {
    append: async (candidate) =>
      enqueue(async () => {
        assertOpen();
        const event = parseLogEvent(candidate);
        const transition = reducer.prepare(event);
        if (transition.duplicate) {
          return { appended: false };
        }
        const bytes = serializeLogEventBytes(event, needsSeparator);
        try {
          await storage.append(bytes);
        } catch (appendError) {
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
        transition.commit();
        events.push(event);
        byteLength += bytes.byteLength;
        needsSeparator = false;
        return { appended: true };
      }),
    read: async () =>
      enqueue(async () => {
        assertOpen();
        return [...events];
      }),
    readBatch: async ({ cursor, limit, maxBytes }) =>
      enqueue(async () => {
        assertOpen();
        if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1) {
          throw new EventLogError('EVENT_INVALID', 'Event-log cursor and limit must be positive safe integers.');
        }
        if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) {
          throw new EventLogError('EVENT_INVALID', 'An event-log byte budget must be a positive safe integer.');
        }
        const boundedCursor = Math.min(cursor, events.length);
        const window = events.slice(boundedCursor, boundedCursor + limit);
        const batch = maxBytes === undefined ? window : byteBounded(window, maxBytes);
        return {
          cursor: boundedCursor,
          nextCursor: boundedCursor + batch.length,
          endCursor: events.length,
          events: batch,
        };
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
