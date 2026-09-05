// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { EventLogError } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { parseLogEvent } from '#log/event-schema.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createEventLogReducer } from '#log/reducer.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { parseEventLogBytes, serializeLogEventBytes } from '#log/serialization.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
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
  /** Read at most `limit` records starting at the zero-based cursor. */
  readBatch(input: { readonly cursor: number; readonly limit: number }): Promise<EventLogBatch>;
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
    readBatch: async ({ cursor, limit }) =>
      enqueue(async () => {
        assertOpen();
        if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1) {
          throw new EventLogError('EVENT_INVALID', 'Event-log cursor and limit must be positive safe integers.');
        }
        const boundedCursor = Math.min(cursor, events.length);
        const batch = events.slice(boundedCursor, boundedCursor + limit);
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
