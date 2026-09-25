import { describe, expect, it } from 'vitest';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import type { AgentLogEvent } from '#log/event-types.js';

const memoryStorage = (): EventLogStorage => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  return {
    read: async () => bytes,
    append: async (next) => {
      const combined = new Uint8Array(bytes.byteLength + next.byteLength);
      combined.set(bytes);
      combined.set(next, bytes.byteLength);
      bytes = combined;
    },
    truncate: async (size) => {
      bytes = bytes.slice(0, size);
    },
    close: async () => undefined,
  };
};

const admitted: AgentLogEvent = {
  version: 1,
  leaderEpoch: 'epoch-a',
  sequence: 0,
  recordedAt: '2026-09-25T00:00:00.000Z',
  runId: 'run-a',
  type: 'run.lifecycle',
  state: 'admitted',
  storageDurability: undefined,
};

describe('event sequence', () => {
  // S5 D1 (W0.1): the bytes on disk drop an undefined-valued key, so the fingerprint must too.
  it('should treat an identical re-append carrying an undefined-valued key as a no-op after reload', async () => {
    const storage = memoryStorage();
    const first = await createEventLogAppender(storage);
    await expect(first.append(admitted)).resolves.toEqual({ appended: true });
    await first.close();

    const reopened = await createEventLogAppender(storage);

    await expect(reopened.append(admitted)).resolves.toEqual({ appended: false });
    await reopened.close();
  });
});
