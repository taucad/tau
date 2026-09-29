import { describe, expect, it } from 'vitest';
import { createEventLogAppender } from '#log/event-log-appender.js';
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
