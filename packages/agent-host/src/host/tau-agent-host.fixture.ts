/**
 * Shared fixtures for the Tau host's tests: an in-memory log file, scripted seeds, and host options.
 */

import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';
import type { AgentLogEvent, JsonObject, ProviderMessage } from '#log/event-types.js';
import type { CreateTauAgentHostOptions } from '#host/tau-agent-host.js';
import type { ModelTransport, ToolRegistry } from '#waist/ports.js';

export const tauInternal = (message: ProviderMessage | undefined): JsonObject | undefined =>
  message?.metadata?.tauInternal;

export type MemoryLogFile = Readonly<{ open: () => Promise<EventLogAppender> }>;

/** One log file shared by every appender a test opens: each sees the others' writes, as two hosts on one file do. */
export const createMemoryLogFile = (): MemoryLogFile => {
  let bytes = new Uint8Array(new ArrayBuffer(0));
  return {
    open: async () => {
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
        /* The file's real length, so an appender that read before another writer appended is fenced (D5). */
        size: async () => bytes.byteLength,
        exclusive: async (section) => section(),
      };
      return createEventLogAppender(storage);
    },
  };
};

export const createIds = (prefix: string): (() => string) => {
  let next = 0;
  return () => `${prefix}-${next++}`;
};

/** One scripted durable record, with the log's own base fields left to {@link seedLog}. */
export type SeededLogEvent = AgentLogEvent extends infer Event
  ? Event extends AgentLogEvent
    ? Omit<Event, 'version' | 'leaderEpoch' | 'sequence' | 'recordedAt'>
    : never
  : never;

/**
 * Write a scripted log before any host opens it.
 *
 * Lets a row state the log's exact shape — including shapes a fixed host will
 * no longer write, such as a settlement recorded under a run that was never
 * admitted — instead of driving a sequence of turns to approximate one.
 */
export const seedLog = async (file: MemoryLogFile, events: readonly SeededLogEvent[]): Promise<void> => {
  const appender = await file.open();
  let sequence = 0;
  for (const event of events) {
    // oxlint-disable-next-line no-await-in-loop -- the log's sequence discipline is serial by construction.
    await appender.append({
      ...event,
      version: 1,
      leaderEpoch: 'epoch-seed',
      sequence,
      recordedAt: new Date(Date.UTC(2026, 8, 1)).toISOString(),
    } as AgentLogEvent);
    sequence++;
  }
  await appender.close();
};

/** Every record a log holds, read through a fresh appender. */
export const readLog = async (file: MemoryLogFile): ReturnType<EventLogAppender['read']> => {
  const appender = await file.open();
  return appender.read();
};

/** A completed first turn, as a chat's log holds it. */
export const completedFirstTurn: readonly SeededLogEvent[] = [
  { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
  { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
  { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
  {
    type: 'message.appended',
    runId: 'run-1',
    message: { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
  },
  { type: 'run.lifecycle', runId: 'run-1', state: 'completed' },
];

/** The abandoned second turn's settlement, written under a run nothing admitted. */
export const settlementOnlySecondRun: SeededLogEvent = {
  type: 'turn.failed',
  runId: 'run-2',
  chatId: 'chat-settlement-only',
  turnId: 'turn-2',
  reason: 'The turn ended before it recorded a revision.',
};

export const toolDefinition = {
  name: 'read_file',
  description: 'Read one workspace file.',
  inputSchema: {
    type: 'object',
    properties: { targetFile: { type: 'string' } },
    required: ['targetFile'],
    additionalProperties: false,
  },
} as const;

export const tools = (invoke: ToolRegistry['invoke']): ToolRegistry => ({
  list: () => [toolDefinition],
  invoke,
});

export const hostOptions = (input: {
  readonly openEventLog: MemoryLogFile['open'];
  readonly transport: ModelTransport;
  readonly toolRegistry: ToolRegistry;
  readonly idPrefix?: string | undefined;
}): CreateTauAgentHostOptions => {
  const ids = createIds(input.idPrefix ?? 'message');
  const epochs = createIds(`epoch-${input.idPrefix ?? 'host'}`);
  let tick = 0;
  return {
    systemPrompt: 'You are the deterministic G2 host fixture.',
    model: { id: 'scripted-g2-model', contextWindow: 200_000 },
    modelTransport: input.transport,
    toolRegistry: input.toolRegistry,
    openEventLog: async () => input.openEventLog(),
    createId: ids,
    createLeaderEpoch: epochs,
    now: () => new Date(Date.UTC(2026, 8, 1, 0, 0, tick++)),
  };
};
