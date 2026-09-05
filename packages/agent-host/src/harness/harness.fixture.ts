import type { Model } from '@earendil-works/pi-ai';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createEventLogAppender } from '#log/event-log-appender.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent } from '#log/event-types.js';

/** Deterministic pi model descriptor used by harness unit fixtures. @public */
export const stubModel: Model<'openai-responses'> = {
  id: 'stub',
  name: 'stub',
  api: 'openai-responses',
  provider: 'stub',
  baseUrl: '',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8192,
  maxTokens: 1024,
};

/** In-memory W1 appender used by deterministic harness parity fixtures. */
export const createMemoryEventLog = async (initial: readonly AgentLogEvent[] = []): Promise<EventLogAppender> => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  const storage: EventLogStorage = {
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
  const log = await createEventLogAppender(storage);
  for (const event of initial) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Initial log records must be appended in cursor order.
    await log.append(event);
  }
  return log;
};

/** Reopenable in-memory file used by close/reload durability fixtures. */
export const createMemoryEventLogFile = (): { open(): Promise<EventLogAppender> } => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  return {
    open: async () =>
      createEventLogAppender({
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
      }),
  };
};
