import { describe, expect, it } from 'vitest';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import { memoryEventLogStorage } from '#log/event-log-storage.fixture.js';
import type { AgentLogEvent } from '#log/event-types.js';

const row = (sequence: number): AgentLogEvent => ({
  version: 1,
  leaderEpoch: 'e01',
  epoch: 1,
  sequence,
  recordedAt: '2026-09-26T00:00:00.000Z',
  runId: 'run-1',
  type: 'run.lifecycle',
  state: sequence === 0 ? 'admitted' : 'running',
});
const key = (sequence: number) => ({ leaderEpoch: 'e01', sequence });

describe('readBatch (CL-R7)', () => {
  const opened = async () => {
    const log = await createEventLogAppender(memoryEventLogStorage().storage);
    for (const sequence of [0, 1, 2]) {
      // oxlint-disable-next-line no-await-in-loop -- rows are appended in order.
      await log.append(row(sequence));
    }
    return log;
  };

  // CL-A4, I4: a read the log cannot answer from the reader's position is refused, never clamped.
  it('should refuse a cursor past the end', async () => {
    const log = await opened();

    await expect(log.readBatch({ cursor: 5, limit: 2 })).resolves.toEqual({
      status: 'refused',
      reason: 'cursor-ahead',
      expected: { endCursor: 3 },
    });
  });

  it('should refuse a read whose last row is not the row before its cursor', async () => {
    const log = await opened();

    await expect(log.readBatch({ cursor: 1, limit: 2, last: key(1) })).resolves.toEqual({
      status: 'refused',
      reason: 'identity-mismatch',
      expected: { endCursor: 3, last: key(0) },
    });
    await expect(log.readBatch({ cursor: 1, limit: 2, last: key(0) })).resolves.toEqual({
      status: 'batch',
      cursor: 1,
      nextCursor: 3,
      endCursor: 3,
      events: [row(1), row(2)],
    });
  });
});

/**
 * A file that tells written bytes from durable ones: `append` and `truncate` are durable at once, `write` is not until
 * `sync`. It counts flushes and fence checks so a test can see what one batch costs.
 */
const syncedStorage = (
  options: Readonly<{ failWriteAt?: number; failSync?: boolean }> = {},
): {
  readonly storage: EventLogStorage;
  readonly counts: { syncs: number; sizes: number; writes: number };
  bytes(): Uint8Array<ArrayBuffer>;
  durable(): number;
} => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  let durable = 0;
  const counts = { syncs: 0, sizes: 0, writes: 0 };
  const put = (next: Uint8Array<ArrayBuffer>): void => {
    const combined = new Uint8Array(new ArrayBuffer(bytes.byteLength + next.byteLength));
    combined.set(bytes);
    combined.set(next, bytes.byteLength);
    bytes = combined;
  };
  return {
    storage: {
      read: async () => bytes,
      append: async (next) => {
        put(next);
        durable = bytes.byteLength;
        counts.syncs += 1;
      },
      write: async (next) => {
        counts.writes += 1;
        if (options.failWriteAt === counts.writes) {
          /* A short write: half the line lands, then the port fails. */
          put(next.slice(0, Math.floor(next.byteLength / 2)));
          throw new Error('injected short write');
        }
        put(next);
      },
      sync: async () => {
        counts.syncs += 1;
        if (options.failSync === true) {
          throw new Error('injected flush failure');
        }
        durable = bytes.byteLength;
      },
      truncate: async (size) => {
        bytes = bytes.slice(0, size);
        durable = Math.min(durable, size);
      },
      close: async () => undefined,
      size: async () => {
        counts.sizes += 1;
        return bytes.byteLength;
      },
      exclusive: async (section) => section(),
    },
    bytes: () => bytes,
    durable: () => durable,
    counts,
  };
};

const message = (sequence: number, text: string): AgentLogEvent => ({
  version: 1,
  leaderEpoch: 'e01',
  epoch: 1,
  sequence,
  recordedAt: '2026-09-26T00:00:00.000Z',
  runId: 'run-1',
  type: 'message.appended',
  message: { id: `m-${sequence}`, role: 'user', content: [{ type: 'text', text }] },
});

describe('appendMany (WP-10 step A, group commit)', () => {
  it('should write a batch with one fence check and one flush', async () => {
    const file = syncedStorage();
    const log = await createEventLogAppender(file.storage);
    const before = { ...file.counts };

    const batch = await log.appendMany!([row(0), row(1), message(2, 'hello')]);

    expect(batch).toEqual({
      outcomes: [
        { appended: true, endCursor: 1 },
        { appended: true, endCursor: 2 },
        { appended: true, endCursor: 3 },
      ],
      known: true,
    });
    expect(file.counts.syncs - before.syncs).toBe(1);
    expect(file.counts.sizes - before.sizes).toBe(1);
    expect(file.durable()).toBe(file.bytes().byteLength);
    await expect(log.read()).resolves.toEqual([row(0), row(1), message(2, 'hello')]);
  });

  it('should fold what a reopen reads exactly as per-row appends do', async () => {
    const one = syncedStorage();
    const many = syncedStorage();
    const perRow = await createEventLogAppender(one.storage);
    const batched = await createEventLogAppender(many.storage);
    const rows = [row(0), row(1), message(2, 'a'), message(3, 'b')];
    for (const event of rows) {
      // oxlint-disable-next-line no-await-in-loop -- rows are appended in order.
      await perRow.append(event);
    }
    await batched.appendMany!(rows);

    expect(many.bytes()).toEqual(one.bytes());
    const reopened = await createEventLogAppender(many.storage);
    await expect(reopened.messages()).resolves.toEqual(await perRow.messages());
  });

  it('should answer a duplicate in a batch without writing it', async () => {
    const file = syncedStorage();
    const log = await createEventLogAppender(file.storage);
    await log.append(row(0));

    const batch = await log.appendMany!([row(0), row(1)]);

    expect(batch.outcomes).toEqual([
      { appended: false, endCursor: 1 },
      { appended: true, endCursor: 2 },
    ]);
    await expect(log.read()).resolves.toEqual([row(0), row(1)]);
  });

  it('should end a batch at a refused row, the rows before it durable', async () => {
    const file = syncedStorage();
    const log = await createEventLogAppender(file.storage);

    /* Sequence 5 skips 2 to 4: the term rules refuse it. */
    const batch = await log.appendMany!([row(0), row(1), row(5), row(2)]);

    expect(batch.outcomes).toEqual([
      { appended: true, endCursor: 1 },
      { appended: true, endCursor: 2 },
    ]);
    expect(batch.known).toBe(true);
    expect(batch.failure).toBeDefined();
    expect(file.durable()).toBe(file.bytes().byteLength);
    await expect(createEventLogAppender(file.storage).then(async (reopened) => reopened.read())).resolves.toEqual([
      row(0),
      row(1),
    ]);
  });

  it('should roll back a failed write and keep the rows before it', async () => {
    const file = syncedStorage({ failWriteAt: 2 });
    const log = await createEventLogAppender(file.storage);

    const batch = await log.appendMany!([row(0), row(1), row(2)]);

    expect(batch.outcomes).toEqual([{ appended: true, endCursor: 1 }]);
    expect(batch).toMatchObject({ known: true, failure: { message: 'injected short write' } });
    expect(file.durable()).toBe(file.bytes().byteLength);
    await expect(log.read()).resolves.toEqual([row(0)]);
    /* The appender is still usable: the next row lands after the first. */
    await expect(log.append(row(1))).resolves.toEqual({ appended: true, endCursor: 2 });
  });

  it('should poison the appender when the flush after a batch fails', async () => {
    const file = syncedStorage({ failSync: true });
    const log = await createEventLogAppender(file.storage);

    const batch = await log.appendMany!([row(0), row(1)]);

    expect(batch).toMatchObject({ outcomes: [], known: false, failure: { code: 'LOG_POISONED' } });
    await expect(log.append(row(2))).rejects.toMatchObject({ code: 'LOG_POISONED' });
  });

  it('should refuse a stale view LOG_FENCED and write nothing', async () => {
    const file = syncedStorage();
    const stale = await createEventLogAppender(file.storage);
    const current = await createEventLogAppender(file.storage);
    await current.append(row(0));
    const length = file.bytes().byteLength;

    const batch = await stale.appendMany!([row(0), row(1)]);

    expect(batch).toMatchObject({ outcomes: [], known: true, failure: { code: 'LOG_FENCED' } });
    expect(file.bytes().byteLength).toBe(length);
  });

  it('should write a batch row by row on a port without write and sync', async () => {
    const file = memoryEventLogStorage();
    const log = await createEventLogAppender(file.storage);

    const batch = await log.appendMany!([row(0), row(1)]);

    expect(batch.outcomes.map((outcome) => outcome.appended)).toEqual([true, true]);
    await expect(log.read()).resolves.toEqual([row(0), row(1)]);
  });

  // The crash-injection gate: a crash anywhere inside a batch's write leaves a prefix of its rows (batch_crash_reachable).
  it('should reopen a prefix of the batch from a crash at every byte offset', async () => {
    const file = syncedStorage();
    const log = await createEventLogAppender(file.storage);
    await log.append(row(0));
    const start = file.durable();
    const rows = [row(1), message(2, 'x'.repeat(40)), message(3, 'é'.repeat(7)), row(4)];
    await log.appendMany!(rows);
    const whole = file.bytes();
    const intended = [row(0), ...rows];

    for (let offset = start; offset <= whole.byteLength; offset += 1) {
      const crashed = memoryEventLogStorage(whole.slice(0, offset));
      // oxlint-disable-next-line no-await-in-loop -- each offset is its own reopen.
      const reopened = await createEventLogAppender(crashed.storage);
      // oxlint-disable-next-line no-await-in-loop -- each offset is its own reopen.
      const read = await reopened.read();
      expect(read).toEqual(intended.slice(0, read.length));
      expect(read.length).toBeGreaterThanOrEqual(1);
      /* The torn tail is repaired by the next guarded append: the next intended row lands after the prefix. */
      if (read.length < intended.length) {
        // oxlint-disable-next-line no-await-in-loop -- each offset is its own reopen.
        await expect(reopened.appendMany!([intended[read.length]!])).resolves.toMatchObject({ known: true });
        // oxlint-disable-next-line no-await-in-loop -- each offset is its own reopen.
        await expect(reopened.read()).resolves.toEqual(intended.slice(0, read.length + 1));
      }
    }
  });
});
