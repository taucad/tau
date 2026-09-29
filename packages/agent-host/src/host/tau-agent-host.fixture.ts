/**
 * Shared fixtures for the Tau host's tests: an in-memory log file, scripted seeds, and host options.
 */

import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';
import type { AgentLogEvent, JsonObject, ProviderMessage } from '#log/event-types.js';
import type { CreateTauAgentHostOptions } from '#host/tau-agent-host.js';
import type {
  ModelTransport,
  ToolRegistry,
  TurnAttemptKey,
  TurnPlacementFact,
  TurnPlacementPort,
} from '#waist/ports.js';

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

/** One call the fake placement port answered, with the log's length when it was made (0 without a `rows` read). */
export type PlacementCall = Readonly<{
  verb: string;
  key: TurnAttemptKey;
  checkoutId?: string | undefined;
  /** What `complete` asked of the cut (W8.r1 M-A). */
  cut?: boolean | undefined;
  rows: number;
}>;

/**
 * W8's placement port as a fake: `admit` places on `checkout-live` with the given registry as the attempt's tools,
 * `complete` publishes a `turn.finalized` settlement for the key, and every call is recorded. Every CAD run needs a
 * placement (D13), so {@link hostOptions} gives each host one.
 *
 * @param input - The attempt's tools, and a read of the log's length to record at each call.
 * @returns The port, its calls, and a gate that holds `acknowledge` until released.
 */
export const fakePlacement = (
  input: Readonly<{ registry: ToolRegistry; rows?: () => Promise<number> }>,
): Readonly<{ port: TurnPlacementPort; calls: PlacementCall[]; holdAcknowledge: () => () => void }> => {
  const calls: PlacementCall[] = [];
  const facts: TurnPlacementFact[] = [];
  let wake: () => void = () => undefined;
  let acknowledgeGate: Promise<void> = Promise.resolve();
  const rows = async (): Promise<number> => (input.rows === undefined ? 0 : input.rows());
  const port: TurnPlacementPort = {
    admit: async ({ requestId, key, checkoutId }) => {
      calls.push({ verb: 'admit', key, checkoutId, rows: await rows() });
      return {
        requestId,
        status: 'applied',
        placement: { checkoutId: checkoutId ?? 'checkout-live', mode: 'direct', root: '/work', tools: input.registry },
      };
    },
    complete: async ({ requestId, key, cut }) => {
      calls.push({ verb: 'complete', key, cut, rows: await rows() });
      facts.push({
        kind: 'settled',
        key,
        row: {
          type: 'turn.finalized',
          runId: key.runId,
          attempt: key.attempt,
          turnId: key.turnId,
          chatId: key.chatId,
          projectId: 'project-1',
          changedPaths: [],
          trigger: 'turn',
          runIds: [key.runId],
        },
      });
      wake();
      return { requestId, status: 'applied' };
    },
    abandon: async ({ requestId, key }) => {
      calls.push({ verb: 'abandon', key, rows: await rows() });
      return { requestId, status: 'applied' };
    },
    reconcile: async ({ requestId }) => ({ requestId, status: 'applied', held: [] }),
    async *settlements({ signal }) {
      let next = 0;
      const nextFact = async (): Promise<void> =>
        new Promise<void>((resolve) => {
          wake = resolve;
          signal.addEventListener('abort', () => {
            resolve();
          });
        });
      while (!signal.aborted) {
        while (next < facts.length) {
          const fact = facts[next++];
          if (fact !== undefined) {
            yield fact;
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- a listen waits for the next fact.
        await nextFact();
      }
    },
    acknowledge: async ({ requestId, key }) => {
      await acknowledgeGate;
      calls.push({ verb: 'acknowledge', key, rows: await rows() });
      return { requestId, status: 'applied' };
    },
  };
  return {
    port,
    calls,
    holdAcknowledge: () => {
      let release: () => void = () => undefined;
      acknowledgeGate = new Promise((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
};

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
    placement: fakePlacement({ registry: input.toolRegistry }).port,
  };
};
