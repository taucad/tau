import { describe, expect, it, vi } from 'vitest';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogStorage } from '#log/event-log-appender.js';
import type {
  InterruptApprovalPort,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';
import {
  createTauAgentHost,
  hostRunStateOfLifecycle,
  isHostLifecycleLegal,
  isResumableRunFailure,
  runLedgerOf,
} from '#host/tau-agent-host.js';
import type { ExternalAgentPort, TauAgentHost } from '#host/tau-agent-host.js';
import { reduceEventLog } from '#log/reducer.js';
import { ScriptedParityModelTransport, scriptedParityResponses } from '#host/scripted-model.fixture.js';
import type { AgentLogEvent, JsonObject, ProviderMessage } from '#log/event-types.js';
import { GatewayModelTransportError, gatewayModelErrorCodes } from '#transport/gateway-model-transport.js';
import type { GatewayModelErrorCode } from '#transport/gateway-model-transport.js';
import type { HostCompactionError } from '#harness/compaction.js';

const tauInternal = (message: ProviderMessage | undefined): JsonObject | undefined => message?.metadata?.tauInternal;

const createMemoryLogFile = () => {
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
      };
      return createEventLogAppender(storage);
    },
  };
};

const createIds = (prefix: string) => {
  let next = 0;
  return () => `${prefix}-${next++}`;
};

/** One scripted durable record, with the log's own base fields left to {@link seedLog}. */
type SeededLogEvent = AgentLogEvent extends infer Event
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
const seedLog = async (file: ReturnType<typeof createMemoryLogFile>, events: readonly SeededLogEvent[]) => {
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
const readLog = async (file: ReturnType<typeof createMemoryLogFile>) => {
  const appender = await file.open();
  return appender.read();
};

/** A completed first turn, as a chat's log holds it. */
const completedFirstTurn: readonly SeededLogEvent[] = [
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
const settlementOnlySecondRun: SeededLogEvent = {
  type: 'turn.failed',
  runId: 'run-2',
  chatId: 'chat-settlement-only',
  turnId: 'turn-2',
  reason: 'The turn ended before it recorded a revision.',
};

const resolvedInterruptPort = () =>
  ({
    pause: async (request) => ({ interruptId: request.interruptId, outcome: 'approved' }),
    pending: async () => [],
    resume: async () => undefined,
  }) satisfies InterruptApprovalPort;

const toolDefinition = {
  name: 'read_file',
  description: 'Read one workspace file.',
  inputSchema: {
    type: 'object',
    properties: { targetFile: { type: 'string' } },
    required: ['targetFile'],
    additionalProperties: false,
  },
} as const;

const tools = (invoke: ToolRegistry['invoke']): ToolRegistry => ({
  list: () => [toolDefinition],
  invoke,
});

const hostOptions = (input: {
  readonly openEventLog: () => ReturnType<ReturnType<typeof createMemoryLogFile>['open']>;
  readonly transport: ModelTransport;
  readonly toolRegistry: ToolRegistry;
  readonly interruptPort?: InterruptApprovalPort | undefined;
  readonly idPrefix?: string | undefined;
}) => {
  const ids = createIds(input.idPrefix ?? 'message');
  const epochs = createIds(`epoch-${input.idPrefix ?? 'host'}`);
  let tick = 0;
  return {
    systemPrompt: 'You are the deterministic G2 host fixture.',
    model: { id: 'scripted-g2-model', contextWindow: 200_000 },
    modelTransport: input.transport,
    toolRegistry: input.toolRegistry,
    openEventLog: async () => input.openEventLog(),
    interruptPort: input.interruptPort ?? resolvedInterruptPort(),
    createId: ids,
    createLeaderEpoch: epochs,
    now: () => new Date(Date.UTC(2026, 8, 1, 0, 0, tick++)),
  };
};

describe('createTauAgentHost', () => {
  it('publishes live deltas before their durable assistant completion', async () => {
    const order: string[] = [];
    const file = createMemoryLogFile();
    const opened = await file.open();
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: async () => ({
          append: async (event) => {
            if (event.type === 'message.appended' && event.message.role === 'assistant') {
              order.push(`durable:${event.message.id}`);
            }
            return opened.append(event);
          },
          read: opened.read,
          readBatch: opened.readBatch,
          close: opened.close,
        }),
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'text-delta', text: 'hello' };
            yield { type: 'thinking-delta', text: 'because' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'live',
      }),
      onLiveEvent: (event) => {
        order.push(`${event.type}:${event.messageId}`);
      },
    });

    await host.admit({
      chatId: 'chat-live',
      runId: 'run-live',
      trigger: 'submit',
      message: { id: 'turn-live', role: 'user', content: 'Stream.' },
    });

    expect(order).toEqual([
      'text-start:live-0',
      'text-delta:live-0',
      'text-end:live-0',
      'thinking-start:live-0',
      'thinking-delta:live-0',
      'thinking-end:live-0',
      'durable:live-0',
    ]);
    await host.close();
  });

  it('applies the complete admission config and enforces tool selection in the host', async () => {
    const file = createMemoryLogFile();
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(async () => ({ content: null, isError: false }));
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            yield { type: 'text-delta', text: 'configured' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: 'config',
      }),
    );

    await host.admit({
      chatId: 'chat-config',
      runId: 'run-config',
      trigger: 'submit',
      message: { id: 'turn-config', role: 'user', content: 'Configured run.' },
      config: {
        systemPrompt: 'admission prompt',
        systemPromptBlocks: [
          { type: 'text', text: 'static' },
          { type: 'text', text: 'workspace' },
          { type: 'text', text: 'dynamic' },
        ],
        model: { id: 'retry-model', providerKind: 'openai', contextWindow: 64_000 },
        toolChoice: 'none',
        allowedTools: ['read_file'],
        snapshot: { activeFile: { path: 'main.ts', name: 'main.ts' } },
        clientContext: { memory: { 'AGENTS.md': 'workspace memory' } },
        contextMessages: [
          { id: 'snapshot-run-config', role: 'user', content: '<system-reminder>snapshot</system-reminder>' },
        ],
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ modelId: 'retry-model', systemPrompt: 'static\n\nworkspace\n\ndynamic' });
    expect(requests[0]?.tools).toEqual([]);
    expect(requests[0]?.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'tau:client-memory' }),
        expect.objectContaining({ id: 'snapshot-run-config' }),
      ]),
    );
    const log = await file.open();
    const events = await log.read();
    expect(events.find((event) => event.type === 'turn.history-projection-committed')).toMatchObject({
      context: {
        model: { id: 'retry-model', providerKind: 'openai', contextWindow: 64_000 },
        toolChoice: 'none',
        allowedTools: ['read_file'],
        snapshot: { activeFile: { path: 'main.ts', name: 'main.ts' } },
      },
    });
    expect(invoke).not.toHaveBeenCalled();
    await host.close();
  });

  it('records a revision settlement through the chat log writer', async () => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'settlement',
      }),
    );
    await host.admit({
      chatId: 'chat-settlement',
      runId: 'run-settlement',
      trigger: 'submit',
      message: { id: 'turn-settlement', role: 'user', content: 'Settle.' },
    });

    await host.recordSettlement({
      chatId: 'chat-settlement',
      runId: 'run-settlement',
      event: {
        type: 'turn.finalized',
        turnId: 'turn-settlement',
        chatId: 'chat-settlement',
        projectId: 'project-settlement',
        checkoutId: 'live',
        revisionId: 'revision-settlement',
        branch: 'main',
        changedPaths: ['main.ts'],
        treeId: 'tree-settlement',
        trigger: 'turn',
        runIds: ['run-settlement'],
      },
    });

    const recorded = await readLog(file);
    expect(recorded.at(-1)).toMatchObject({
      type: 'turn.finalized',
      runId: 'run-settlement',
      revisionId: 'revision-settlement',
    });
    await host.close();
  });

  it.each([
    ['INSUFFICIENT_CREDIT', 402],
    ['MODEL_NOT_IN_CATALOG', 400],
    ['RATE_LIMITED', 429],
    ['FUNDED_OPERATION_LIMIT', 429],
    ['FUNDED_HELPER_LIMIT', 429],
    ['BILLING_RECOVERY_UNAVAILABLE', 503],
  ] as const)('retains %s as a typed failed-run snapshot', async (code, status) => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          stream: () => ({
            [Symbol.asyncIterator]: () => ({
              next: async (): Promise<IteratorResult<ModelStreamEvent>> => {
                throw new GatewayModelTransportError({ code, status, message: `fixture ${code}` });
              },
            }),
          }),
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: `failure-${code}`,
      }),
    );

    await host.admit({
      chatId: `chat-${code}`,
      runId: `run-${code}`,
      trigger: 'submit',
      message: { id: `turn-${code}`, role: 'user', content: 'Trigger the typed refusal.' },
    });
    const snapshot = await host.snapshot(`chat-${code}`);

    expect(snapshot.state).toBe('failed');
    expect(snapshot.failure).toEqual({ code, status, message: `fixture ${code}` });
    await host.close();
  });

  it('records the credit denial shortfall on the in-process terminal run record', async () => {
    const details = {
      requiredCreditAtoms: '4244000',
      availableCreditAtoms: '300000',
      routeId: 'anthropic-claude-astra-5',
    };
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          stream: () => ({
            [Symbol.asyncIterator]: () => ({
              next: async (): Promise<IteratorResult<ModelStreamEvent>> => {
                throw new GatewayModelTransportError({
                  code: 'INSUFFICIENT_CREDIT',
                  status: 402,
                  message: 'Insufficient Tau credit for this model request.',
                  details,
                });
              },
            }),
          }),
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'denied',
      }),
    );

    await host.admit({
      chatId: 'chat-denied',
      runId: 'run-denied',
      trigger: 'submit',
      message: { id: 'turn-denied', role: 'user', content: 'Spend credit I do not have.' },
    });
    const eventLog = await file.open();
    const events = await eventLog.read();
    const failed = events.flatMap((event) =>
      event.type === 'run.lifecycle' && event.state === 'failed' ? [event.detail] : [],
    );

    expect(failed).toEqual([
      {
        message: 'Insufficient Tau credit for this model request.',
        code: 'INSUFFICIENT_CREDIT',
        status: 402,
        details,
      },
    ]);
    await host.close();
  });

  it.each([
    ['INSUFFICIENT_CREDIT', 402, true],
    /* The in-stream guard wraps a provider failure with the *healthy*
     * response's status, so a mid-call `NETWORK_ERROR` carries a 200. */
    ['NETWORK_ERROR', 200, true],
    ['MODEL_NOT_IN_CATALOG', 400, false],
  ] as const)('resumes a %s failure at the blocked step only when it is retryable', async (code, status, retryable) => {
    const file = createMemoryLogFile();
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(async () => ({ content: 'fixture-main', isError: false }));
    let call = 0;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            call++;
            if (call === 1) {
              yield {
                type: 'tool-input',
                toolCallId: 'refused-call-read',
                toolName: 'read_file',
                input: { targetFile: 'main.ts' },
              };
              yield { type: 'completed', stopReason: 'toolUse' };
              return;
            }
            if (call === 2) {
              throw new GatewayModelTransportError({
                code,
                status,
                message: `fixture ${code}`,
                details: { requiredCreditAtoms: '4244000', availableCreditAtoms: '300000', routeId: 'route' },
              });
            }
            yield { type: 'text-delta', text: 'Finished after the account was funded.' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: `refused-${code}`,
      }),
    );

    await host.admit({
      chatId: `chat-refused-${code}`,
      runId: `run-refused-${code}`,
      trigger: 'submit',
      message: { id: `turn-refused-${code}`, role: 'user', content: 'Read main.ts, then answer.' },
    });
    const refused = await host.snapshot(`chat-refused-${code}`);
    const resumed = await host.resume(`chat-refused-${code}`);
    const eventLog = await file.open();
    const events = await eventLog.read();
    const lifecycle = events.flatMap((event) => (event.type === 'run.lifecycle' ? [event.state] : []));

    expect(refused.state).toBe('failed');
    expect(refused.failure).toMatchObject({ code, status });
    // One tool call, whoever resumed: the settled result is replayed from the
    // log, never paid for twice.
    expect(invoke).toHaveBeenCalledTimes(1);
    if (!retryable) {
      expect(requests).toHaveLength(2);
      expect(lifecycle).toEqual(['admitted', 'running', 'failed']);
      expect(resumed).toEqual(refused.messages);
      await host.close();
      return;
    }
    // A new attempt on the same run, from the same context the refusal was
    // built from: the prior tool result intact, the user turn appearing once,
    // and no rewind of the turn itself.
    expect(lifecycle).toEqual(['admitted', 'running', 'failed', 'running', 'completed']);
    /* The one retraction a resume makes: the trailing failure marker, and
     * nothing before it (R4). A `regenerate` would retain nothing past the
     * user message instead. */
    const rewound = events.filter((event) => event.type === 'history.rewound');
    expect(rewound.map((event) => event.trigger)).toEqual(['retry']);
    expect(rewound[0]?.retainedMessageIds).toEqual(refused.messages.slice(0, -1).map((message) => message.id));
    expect(requests).toHaveLength(3);
    expect(requests[2]?.messages.map((message) => `${message.role}:${message.id}`)).toEqual(
      requests[1]?.messages.map((message) => `${message.role}:${message.id}`),
    );
    expect(requests[2]?.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(requests[2]?.messages.at(-1)).toMatchObject({
      role: 'tool-output',
      toolCallId: 'refused-call-read',
      isError: false,
    });
    expect(resumed.at(-1)).toMatchObject({ role: 'assistant', content: [{ type: 'text' }] });
    expect(await host.snapshot(`chat-refused-${code}`)).toMatchObject({
      runId: `run-refused-${code}`,
      state: 'completed',
    });
    await host.close();
  });

  it('should clear a compaction failure marker and re-enter start-of-turn compaction on resume', async () => {
    const file = createMemoryLogFile();
    const requests: ModelStreamRequest[] = [];
    let rejectCompactionAppend = true;
    let call = 0;
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: async () => {
          const opened = await file.open();
          return {
            ...opened,
            append: async (event) => {
              if (event.type === 'history.compacted' && rejectCompactionAppend) {
                rejectCompactionAppend = false;
                throw new Error('durable compaction append rejected');
              }
              return opened.append(event);
            },
          };
        },
        transport: {
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            call++;
            if (call <= 2) {
              yield {
                type: 'tool-input',
                toolCallId: `compaction-resume-read-${call}`,
                toolName: 'read_file',
                input: { targetFile: `completed-${call}.ts` },
              };
              yield {
                type: 'usage',
                usage: {
                  input: call === 1 ? 1000 : 3000,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: call === 1 ? 1000 : 3000,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
              };
              yield { type: 'completed', stopReason: 'toolUse' };
              return;
            }
            if (call === 3) {
              yield { type: 'text-delta', text: 'completed work' };
              yield {
                type: 'usage',
                usage: {
                  input: 7000,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 7000,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
              };
              yield { type: 'completed', stopReason: 'stop' };
              return;
            }
            yield { type: 'text-delta', text: 'resumed after compaction' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: 'x'.repeat(9000), isError: false })),
        idPrefix: 'compaction-resume',
      }),
      model: { id: 'scripted-g2-model', contextWindow: 8192 },
      summarize: async () => 'Earlier completed work.',
    });
    await host.admit({
      chatId: 'chat-compaction-resume',
      runId: 'run-before-compaction',
      trigger: 'submit',
      message: { id: 'turn-before-compaction', role: 'user', content: 'Create the model.' },
    });
    await host.admit({
      chatId: 'chat-compaction-resume',
      runId: 'run-compaction-failed',
      trigger: 'submit',
      message: { id: 'turn-compaction-failed', role: 'user', content: 'Keep the completed work and continue.' },
    });

    const failed = await host.snapshot('chat-compaction-resume');
    expect(failed).toMatchObject({
      runId: 'run-compaction-failed',
      state: 'failed',
      failure: { code: 'SESSION_LOG_INTEGRITY', message: 'durable compaction append rejected' },
    });
    expect(failed.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'Compaction failed: durable compaction append rejected' }],
    });

    const resumed = await host.resume('chat-compaction-resume');
    const events = await readLog(file);
    const markerId = failed.messages.at(-1)?.id;
    const rewind = events.findLast((event) => event.type === 'history.rewound');
    expect(rewind).toMatchObject({ type: 'history.rewound', trigger: 'retry' });
    expect(rewind?.type === 'history.rewound' && rewind.retainedMessageIds).not.toContain(markerId);
    const compacted = events.find((event) => event.type === 'history.compacted');
    expect(compacted?.type === 'history.compacted' && compacted.details?.lane).toBe('start_of_turn');
    expect(requests).toHaveLength(4);
    expect(requests[3]?.messages.filter((message) => message.id === 'turn-compaction-failed')).toHaveLength(1);
    expect(resumed.at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'resumed after compaction' }],
    });
    expect(await host.snapshot('chat-compaction-resume')).toMatchObject({
      runId: 'run-compaction-failed',
      state: 'completed',
    });
    await host.close();
  });

  it('resumes from the real result of a tool that ran before the stream failed', async () => {
    /* The stream starts a tool the moment its call is complete (`prestartTool`),
     * so a failure one frame later leaves a tool that *ran* with no durable
     * result: pi never executes the call, and the dropped promise used to reach
     * the resumed model as `CLIENT_DISCONNECTED` — an invitation to apply a
     * non-idempotent tool twice (F2). */
    const file = createMemoryLogFile();
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(async () => ({ content: 'fixture-main', isError: false }));
    let call = 0;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            call++;
            if (call === 1) {
              yield {
                type: 'tool-input',
                toolCallId: 'prestart-call-read',
                toolName: 'read_file',
                input: { targetFile: 'main.ts' },
              };
              throw new GatewayModelTransportError({
                code: 'NETWORK_ERROR',
                status: 200,
                message: 'fixture NETWORK_ERROR',
              });
            }
            yield { type: 'text-delta', text: 'Answered from the tool result that survived.' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: 'prestart',
      }),
    );

    await host.admit({
      chatId: 'chat-prestart',
      runId: 'run-prestart',
      trigger: 'submit',
      message: { id: 'turn-prestart', role: 'user', content: 'Read main.ts, then answer.' },
    });
    const refused = await host.snapshot('chat-prestart');
    const resumed = await host.resume('chat-prestart');
    const events = await readLog(file);

    expect(refused.state).toBe('failed');
    expect(refused.failure).toMatchObject({ code: 'NETWORK_ERROR' });
    // The tool ran once, before the failure, and is never dispatched again.
    expect(invoke).toHaveBeenCalledTimes(1);
    // Its real result is durable, and there is exactly one record of it.
    expect(
      resumed.filter((message) => message.role === 'tool-output' && message.toolCallId === 'prestart-call-read'),
    ).toMatchObject([{ content: 'fixture-main', isError: false }]);
    // The re-issued call carries that result, not a fabricated disconnect.
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)).toMatchObject({
      role: 'tool-output',
      toolCallId: 'prestart-call-read',
      isError: false,
      content: 'fixture-main',
    });
    expect(JSON.stringify(requests[1]?.messages)).not.toContain('CLIENT_DISCONNECTED');
    // The assistant row the provider sees is a plain tool-use turn, not a marker.
    const assistant = requests[1]?.messages.filter((message) => message.role === 'assistant') ?? [];
    expect(assistant).toHaveLength(1);
    expect(assistant[0]?.metadata).toMatchObject({ stopReason: 'toolUse' });
    expect(assistant[0]?.metadata?.errorMessage).toBeUndefined();
    // The turn itself is untouched: the one user message, and no rewind of it.
    expect(requests[1]?.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'history.rewound')).toHaveLength(0);
    /* The marker's diagnostic is what `snapshot` reads a chat's failure from,
     * so a marker left in history would report this chat as failed for the rest
     * of its life. */
    const completed = await host.snapshot('chat-prestart');
    expect(completed.state).toBe('completed');
    expect(completed.failure).toBeUndefined();
    await host.close();
  });

  it('rules every failure code a run can end on either resumable or not', () => {
    /* Q5: the *non-resumable* half of the ruling lives here rather than in a
     * second production set nothing would read. Both unions are keyed
     * exhaustively, so a code added to the transport or to compaction fails to
     * compile until this table rules it one way or the other. */
    /* eslint-disable @typescript-eslint/naming-convention -- the keys are wire failure codes, not identifiers. */
    const resumability = {
      // Gateway transport (`gatewayModelErrorCodes`); the seven resumable ones are Q2's list.
      BILLING_RECOVERY_UNAVAILABLE: false,
      FUNDED_HELPER_LIMIT: false,
      FUNDED_OPERATION_LIMIT: false,
      INSUFFICIENT_CREDIT: true,
      MODEL_NOT_IN_CATALOG: false,
      MODEL_PROVIDER_UNSUPPORTED: false,
      ORIGIN_NOT_ALLOWED: false,
      PROVIDER_ACCOUNT_EXHAUSTED: false,
      RATE_LIMITED: true,
      // The resumed run re-sends the same history, which meets the same bound.
      REQUEST_TOO_LARGE: false,
      UNAUTHENTICATED: true,
      INVALID_REQUEST: true,
      PROVIDER_UNAVAILABLE: true,
      UPSTREAM_REJECTED: true,
      MALFORMED_RESPONSE: true,
      NETWORK_ERROR: true,
      UNKNOWN_GATEWAY_ERROR: false,
      // Compaction failures resume through start-of-turn reprojection and the degradation ladder.
      SUMMARY_REQUIRED: true,
      NO_EVICTABLE_HISTORY: true,
      SESSION_LOG_INTEGRITY: true,
      CIRCUIT_BREAKER_OPEN: true,
      LEADERSHIP_LOST: false,
    } as const satisfies Record<GatewayModelErrorCode | HostCompactionError['code'] | 'LEADERSHIP_LOST', boolean>;
    /* eslint-enable @typescript-eslint/naming-convention -- ends the wire-code key exception. */
    const ruled = Object.entries(resumability);

    expect(gatewayModelErrorCodes.filter((code) => !(code in resumability))).toEqual([]);
    expect(
      ruled.filter(([code]) => isResumableRunFailure({ message: `fixture ${code}`, code })).map(([code]) => code),
    ).toEqual(ruled.filter(([, resumable]) => resumable).map(([code]) => code));
  });

  it('executes tool and steady-state turns, then cold-rebuilds the completed transcript', async () => {
    const file = createMemoryLogFile();
    const invoke = vi.fn(async () => ({ content: 'fixture-main', isError: false }));
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 3)),
        toolRegistry: tools(invoke),
      }),
    );

    await host.admit({
      chatId: 'chat-multi-turn',
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Read main.ts.' },
    });
    const final = await host.admit({
      chatId: 'chat-multi-turn',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Continue using that history.' },
    });
    const eventLog = await file.open();
    const events = await eventLog.read();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(final.filter((message) => message.role === 'user').map((message) => message.id)).toEqual([
      'turn-1',
      'turn-2',
    ]);
    expect(events.filter((event) => event.type === 'turn.history-projection-committed')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'run.lifecycle').map((event) => event.state)).toEqual([
      'admitted',
      'running',
      'completed',
      'admitted',
      'running',
      'completed',
    ]);

    const coldHost = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport([]),
        toolRegistry: tools(invoke),
        idPrefix: 'cold',
      }),
    );
    await expect(coldHost.resume('chat-multi-turn')).resolves.toEqual(final);
    await coldHost.close();
    await host.close();
  });

  it('cold-resumes a run killed during a tool by pairing the pending call from W1', async () => {
    const file = createMemoryLogFile();
    const toolStarted = Promise.withResolvers<void>();
    const hangingTools = tools(async () => {
      toolStarted.resolve();
      return new Promise<never>(() => {
        // Simulate a worker terminated while its tool request is outstanding.
      });
    });
    const crashedHost = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 1)),
        toolRegistry: hangingTools,
        idPrefix: 'crashed',
      }),
    );

    void crashedHost.admit({
      chatId: 'chat-recovery',
      runId: 'run-recovery',
      trigger: 'submit',
      message: { id: 'turn-recovery', role: 'user', content: 'Read before the worker is killed.' },
    });
    await toolStarted.promise;

    const resumedInvoke = vi.fn(async () => ({ content: 'must-not-run', isError: false }));
    const resumedHost = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(1, 2)),
        toolRegistry: tools(resumedInvoke),
        idPrefix: 'resumed',
      }),
    );
    await expect(
      resumedHost.admit({
        chatId: 'chat-recovery',
        runId: 'replacement-run',
        trigger: 'submit',
        message: { id: 'replacement-turn', role: 'user', content: 'Do not bypass recovery.' },
      }),
    ).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE', runId: 'run-recovery', state: 'running' });
    const final = await resumedHost.resume('chat-recovery');

    expect(resumedInvoke).not.toHaveBeenCalled();
    expect(final.find((message) => message.role === 'tool-output')).toMatchObject({
      role: 'tool-output',
      toolCallId: 'fixture-call-read',
      isError: true,
      content: { errorCode: 'CLIENT_DISCONNECTED' },
    });
    const recovery = final.find(
      (message) => message.role === 'user' && tauInternal(message)?.['kind'] === 'interrupt-recovery',
    );
    const recoveryInternal = tauInternal(recovery);
    expect(recovery?.id).toMatch(/^tau:interrupt-recovery:[0-9a-f]{16}$/u);
    expect(recovery?.role).toBe('user');
    expect(recovery?.content).toBe(`<system-reminder>
The previous turn was cut short by a network drop. 0 tool call(s)
completed successfully and 1 were cancelled before they
finished. Tools that mutate state (file writes, edits, deletes) may have
partially executed.

Before retrying, verify the current state of any file or resource you were
operating on (read_file / list_directory / get_kernel_result) and only then
decide whether to repeat, adjust, or skip the cancelled work. Do NOT assume
the cancelled tools left the system unchanged.
</system-reminder>`);
    // oxlint-disable-next-line typescript/dot-notation -- JsonObject keys are index-signature properties under noPropertyAccessFromIndexSignature.
    const recoveryKind = recoveryInternal?.['kind'];
    // oxlint-disable-next-line typescript/dot-notation -- JsonObject keys are index-signature properties under noPropertyAccessFromIndexSignature.
    const recoveryAnchorId = recoveryInternal?.['anchorId'];
    // oxlint-disable-next-line typescript/dot-notation -- JsonObject keys are index-signature properties under noPropertyAccessFromIndexSignature.
    const recoveryPruning = recoveryInternal?.['pruning'];
    expect(recoveryKind).toBe('interrupt-recovery');
    expect(recoveryAnchorId).toMatch(/^[0-9a-f]{16}$/u);
    if (typeof recoveryAnchorId !== 'string') {
      throw new TypeError('Interrupt recovery anchor must be a string.');
    }
    expect(recoveryPruning).toBe('preserve-until-compaction');
    expect(typeof recovery?.metadata?.timestamp).toBe('number');
    expect(recovery?.id.endsWith(recoveryAnchorId)).toBe(true);
    expect(final.findLast((message) => message.role === 'assistant')?.content).toEqual([
      { type: 'text', text: 'Read main.ts and completed the first turn.' },
    ]);
    await resumedHost.close();
  });

  it('durably delivers the interrupt-recovery reminder before an in-process retry', async () => {
    const file = createMemoryLogFile();
    const transport = new ScriptedParityModelTransport(scriptedParityResponses.slice(3, 5));
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({
          content: {
            errorCode: 'CLIENT_DISCONNECTED',
            message: 'The scripted execution host disconnected.',
            rpcName: 'read_file',
          },
          isError: true,
        })),
        idPrefix: 'disconnected',
      }),
    );

    const final = await host.admit({
      chatId: 'chat-disconnected',
      runId: 'run-disconnected',
      trigger: 'submit',
      message: { id: 'turn-disconnected', role: 'user', content: 'Resume after an interrupted read.' },
    });
    const eventLog = await file.open();
    const events = await eventLog.read();
    const recovery = final.find(
      (message) => message.role === 'user' && tauInternal(message)?.['kind'] === 'interrupt-recovery',
    );
    const recoveryInternal = tauInternal(recovery);

    expect(recovery?.id).toMatch(/^tau:interrupt-recovery:[0-9a-f]{16}$/u);
    expect(recovery?.content).toContain('The previous turn was cut short by a network drop.');
    expect(recoveryInternal?.['kind']).toBe('interrupt-recovery');
    expect(recoveryInternal?.['anchorId']).toMatch(/^[0-9a-f]{16}$/u);
    expect(recoveryInternal?.['pruning']).toBe('preserve-until-compaction');
    expect(
      events.find((event) => event.type === 'message.appended' && event.message.id === recovery?.id),
    ).toBeDefined();
    expect(transport.requests[1]?.messages).toContainEqual(recovery);
    expect(final.findLast((message) => message.role === 'assistant')?.content).toEqual([
      { type: 'text', text: 'Recovered after the interrupted tool call.' },
    ]);
    await host.close();
  });

  it('routes active interruption and resolution through W5 before resuming', async () => {
    const file = createMemoryLogFile();
    const modelStarted = Promise.withResolvers<void>();
    const releaseResolution = Promise.withResolvers<void>();
    let pauseCalls = 0;
    let pendingInterrupt: Parameters<InterruptApprovalPort['pause']>[0] | undefined;
    const interruptPort: InterruptApprovalPort = {
      pause: async (request) => {
        pauseCalls++;
        pendingInterrupt = request;
        await releaseResolution.promise;
        pendingInterrupt = undefined;
        return { interruptId: request.interruptId, outcome: 'approved' };
      },
      pending: async ({ runId }) => (pendingInterrupt?.runId === runId ? [pendingInterrupt] : []),
      resume: async () => {
        releaseResolution.resolve();
      },
    };
    let calls = 0;
    const transport: ModelTransport = {
      async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
        calls++;
        if (calls === 1) {
          modelStarted.resolve();
          await new Promise<void>((resolve) => {
            request.signal.addEventListener(
              'abort',
              () => {
                resolve();
              },
              { once: true },
            );
          });
          yield { type: 'completed', stopReason: 'aborted' };
          return;
        }
        yield { type: 'text-delta', text: 'Resumed after operator approval.' };
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        interruptPort,
        idPrefix: 'interrupt',
      }),
    );
    const admission = host.admit({
      chatId: 'chat-interrupt',
      runId: 'run-interrupt',
      trigger: 'submit',
      message: { id: 'turn-interrupt', role: 'user', content: 'Wait for operator input.' },
    });
    await modelStarted.promise;
    const interruption = host.interrupt({
      interruptId: 'interrupt-1',
      runId: 'run-interrupt',
      kind: 'operator',
      prompt: 'Continue this run?',
    });
    await admission;
    await vi.waitFor(() => {
      expect(pauseCalls).toBe(1);
    });
    await expect(
      host.resolveInterrupt({ runId: 'wrong-run', interruptId: 'interrupt-1', outcome: 'approved' }),
    ).rejects.toThrow('is not pending on run wrong-run');
    await host.resolveInterrupt({ runId: 'run-interrupt', interruptId: 'interrupt-1', outcome: 'approved' });
    await expect(interruption).resolves.toEqual({ interruptId: 'interrupt-1', outcome: 'approved' });

    const final = await host.resume('chat-interrupt');
    const snapshot = await host.snapshot('chat-interrupt');
    const eventLog = await file.open();
    const events = await eventLog.read();

    expect(final.findLast((message) => message.role === 'assistant')?.content).toEqual([
      { type: 'text', text: 'Resumed after operator approval.' },
    ]);
    expect(snapshot.state).toBe('completed');
    expect(events.filter((event) => event.type === 'interrupt.recorded').map((event) => event.phase)).toEqual([
      'requested',
      'resolved',
    ]);
    await host.close();
  });

  it('reserves a chat synchronously so immediate cancel reaches the admitted run and duplicate starts are rejected', async () => {
    const file = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    const transport: ModelTransport = {
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        calls++;
        if (!request.signal.aborted) {
          await Promise.race([
            release.promise,
            new Promise<void>((resolve) => {
              request.signal.addEventListener(
                'abort',
                () => {
                  resolve();
                },
                { once: true },
              );
            }),
          ]);
        }
        yield { type: 'completed', stopReason: request.signal.aborted ? 'aborted' : 'stop' };
      },
    };
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport,
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'reservation',
      }),
    );
    const first = host.admit({
      chatId: 'chat-reserved',
      runId: 'run-reserved',
      trigger: 'submit',
      message: { id: 'turn-reserved', role: 'user', content: 'Wait.' },
    });
    const duplicate = host.admit({
      chatId: 'chat-reserved',
      runId: 'run-duplicate',
      trigger: 'submit',
      message: { id: 'turn-duplicate', role: 'user', content: 'Duplicate.' },
    });
    const cancellation = host.cancel({ runId: 'run-reserved' });

    await expect(duplicate).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE', state: 'reserved' });
    await cancellation;
    release.resolve();
    await first;
    await expect(host.snapshot('chat-reserved')).resolves.toMatchObject({ state: 'cancelled' });
    expect(calls).toBeLessThanOrEqual(1);
    await host.close();
  });

  it('acknowledges durable admission without waiting for run completion', async () => {
    const file = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            await release.promise;
            yield { type: 'text-delta', text: 'finished after admission' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'admission-ack',
      }),
    );
    const completion = host.admit({
      chatId: 'chat-admission-ack',
      runId: 'run-admission-ack',
      trigger: 'submit',
      message: { id: 'turn-admission-ack', role: 'user', content: 'Wait after admitting.' },
    });

    await expect(host.waitForAdmission('chat-admission-ack')).resolves.toMatchObject({
      runId: 'run-admission-ack',
      state: 'running',
    });
    await expect(
      Promise.race([
        completion.then(() => 'completed'),
        new Promise<'pending'>((resolve) => {
          globalThis.setTimeout(() => {
            resolve('pending');
          }, 20);
        }),
      ]),
    ).resolves.toBe('pending');

    release.resolve();
    await completion;
    await expect(host.snapshot('chat-admission-ack')).resolves.toMatchObject({ state: 'completed' });
    await host.close();
  });

  it('records an explicit usage-unsettled marker when cancellation interrupts an active provider stream', async () => {
    const file = createMemoryLogFile();
    const started = Promise.withResolvers<void>();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            started.resolve();
            yield { type: 'message-metadata', metadata: { providerTrace: { id: 'trace-cancel' } } };
            if (!request.signal.aborted) {
              await new Promise<void>((resolve) => {
                request.signal.addEventListener(
                  'abort',
                  () => {
                    resolve();
                  },
                  { once: true },
                );
              });
            }
            yield { type: 'completed', stopReason: 'aborted' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'usage-cancel',
      }),
    );
    const run = host.admit({
      chatId: 'chat-usage-cancel',
      runId: 'run-usage-cancel',
      trigger: 'submit',
      message: { id: 'turn-usage-cancel', role: 'user', content: 'Wait.' },
    });
    await started.promise;
    await host.cancel({ runId: 'run-usage-cancel' });
    await run;

    const log = await file.open();
    const events = await log.read();
    const assistant = reduceEventLog(events).findLast((message) => message.role === 'assistant');
    expect(assistant?.metadata?.['usageUnsettled']).toEqual({ type: 'tau.usage-unsettled', reason: 'aborted' });
    expect(assistant?.metadata?.['providerTrace']).toEqual({ id: 'trace-cancel' });
    await host.close();
  });

  it('fences stale appends, closes the lost-leader log, and resumes under a new generation', async () => {
    const file = createMemoryLogFile();
    const started = Promise.withResolvers<void>();
    let calls = 0;
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            calls++;
            if (calls === 1) {
              started.resolve();
              if (!request.signal.aborted) {
                await new Promise<void>((resolve) => {
                  request.signal.addEventListener(
                    'abort',
                    () => {
                      resolve();
                    },
                    { once: true },
                  );
                });
              }
              yield { type: 'completed', stopReason: 'aborted' };
              return;
            }
            yield { type: 'text-delta', text: 'Recovered under the new generation.' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'generation',
      }),
    );
    host.assumeLeadership('chat-generation', 'generation-one');
    const first = host.admit({
      chatId: 'chat-generation',
      runId: 'run-generation',
      trigger: 'submit',
      message: { id: 'turn-generation', role: 'user', content: 'Wait.' },
    });
    const firstFailure = expect(first).rejects.toMatchObject({ code: 'LEADERSHIP_LOST' });
    await started.promise;
    await host.relinquish('chat-generation');
    await firstFailure;

    host.assumeLeadership('chat-generation', 'generation-two');
    await host.resume('chat-generation');
    const log = await file.open();
    const events = await log.read();
    expect(events.findLast((event) => event.leaderEpoch === 'generation-one')?.leaderEpoch).toBe('generation-one');
    expect(events.at(-1)?.leaderEpoch).toBe('generation-two');
    await host.close();
  });

  it('applies retry history-prefix semantics through an explicit rewind event and exposes bounded replay', async () => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 3)),
        toolRegistry: tools(async () => ({ content: 'fixture-main', isError: false })),
        idPrefix: 'rewind',
      }),
    );
    await host.admit({
      chatId: 'chat-rewind',
      runId: 'run-original',
      trigger: 'submit',
      message: { id: 'turn-original', role: 'user', content: 'Original.' },
    });
    await host.admit({
      chatId: 'chat-rewind',
      runId: 'run-retry',
      trigger: 'edit',
      retainedMessageIds: [],
      message: { id: 'turn-original', role: 'user', content: 'Edited.' },
    });

    const log = await file.open();
    const events = await log.read();
    expect(events).toContainEqual(expect.objectContaining({ type: 'history.rewound', trigger: 'edit' }));
    expect(
      reduceEventLog(events)
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
    ).toEqual(['turn-original']);
    const batch = await host.readEvents({ chatId: 'chat-rewind', cursor: 1, limit: 2 });
    expect(batch).toMatchObject({ cursor: 1, nextCursor: 3 });
    expect(Array.isArray(batch.events)).toBe(true);
    await host.close();
  });

  /**
   * F2, closeout: a rewind of any turn but the first.
   *
   * The client's transcript and this log do not share assistant message ids —
   * one run is one assistant message on a page and any number of provider
   * messages here — so a client can only ever name the *user* message its turn
   * belongs to. Matching its `retainedMessageIds` against this projection
   * refused every *Try again* and every edit whose retained prefix contained
   * an assistant message, which is every one after the first turn.
   */
  it('rewinds to the turn the client names, not to the prefix it guessed', async () => {
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 3)),
        toolRegistry: tools(async () => ({ content: 'fixture-main', isError: false })),
        idPrefix: 'anchor',
      }),
    );
    await host.admit({
      chatId: 'chat-anchor',
      runId: 'run-one',
      trigger: 'submit',
      message: { id: 'turn-one', role: 'user', content: 'First.' },
    });
    await host.admit({
      chatId: 'chat-anchor',
      runId: 'run-two',
      trigger: 'submit',
      message: { id: 'turn-two', role: 'user', content: 'Second.' },
    });

    /* What the page retains: its own ids, where the assistant message of turn
     * one is named after the run that produced it. */
    await host.admit({
      chatId: 'chat-anchor',
      runId: 'run-three',
      trigger: 'regenerate',
      retainedMessageIds: ['turn-one', 'run-one'],
      message: { id: 'turn-two', role: 'user', content: 'Second.' },
    });

    const log = await file.open();
    const events = await log.read();
    expect(events).toContainEqual(expect.objectContaining({ type: 'history.rewound', trigger: 'regenerate' }));
    expect(
      reduceEventLog(events)
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
    ).toEqual(['turn-one', 'turn-two']);
    await host.close();
  });

  it('resolves every tool call of a turn that fires four of them at once', async () => {
    // The API-coordinated placement deadlocked here (Postgres 40P01): three
    // delivery transactions locked `chat_rpc_exchange` rows and the
    // `chat_workspace_lease` tuple in different orders, the RPC was committed
    // without live delivery, and the tool results stayed at "[Pending...]"
    // forever. The host executes tools in-process against the workspace, so no
    // such lock exists — this pins that every call of a parallel batch lands.
    const file = createMemoryLogFile();
    const entered = new Set<string>();
    const allEntered = Promise.withResolvers<void>();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport([
          {
            id: 'fixture-parallel-tools',
            toolCalls: [
              { id: 'call-skill', name: 'read_file', input: { targetFile: 'SKILL.md' } },
              { id: 'call-read-1', name: 'read_file', input: { targetFile: 'a.ts' } },
              { id: 'call-read-2', name: 'read_file', input: { targetFile: 'b.ts' } },
              { id: 'call-read-3', name: 'read_file', input: { targetFile: 'c.ts' } },
            ],
            usage: { inputTokens: 100, outputTokens: 8 },
          },
          {
            id: 'fixture-parallel-done',
            text: 'All four tool results are in.',
            usage: { inputTokens: 120, outputTokens: 6 },
          },
        ]),
        // No call may complete until every call has started: a serialized
        // executor would deadlock this fixture rather than pass it silently.
        toolRegistry: tools(async (call) => {
          const targetFile = String((call.input as { readonly targetFile: string }).targetFile);
          entered.add(targetFile);
          if (entered.size === 4) {
            allEntered.resolve();
          }
          await allEntered.promise;
          return { content: `contents of ${targetFile}`, isError: false };
        }),
        idPrefix: 'parallel',
      }),
    );

    await host.admit({
      chatId: 'chat-parallel',
      runId: 'run-parallel',
      trigger: 'submit',
      message: { id: 'turn-parallel', role: 'user', content: 'Read all four.' },
    });

    const log = await file.open();
    const events = await log.read();
    const outputs = reduceEventLog(events).filter((message) => message.role === 'tool-output');
    expect(outputs.map((message) => message.toolCallId).sort()).toEqual([
      'call-read-1',
      'call-read-2',
      'call-read-3',
      'call-skill',
    ]);
    // None left pending, none failed.
    expect(outputs.every((message) => !message.isError)).toBe(true);
    await host.close();
  });

  it('runs a rewinding trigger against an empty log as the first turn it is', async () => {
    // A chat whose first turn never reached the host has an empty log, and an
    // empty log has no prefix any retain can match — so the prefix guard
    // refused every later retry and the chat was permanently stuck with no way
    // out. There is nothing to rewind: the turn *is* a submit.
    const file = createMemoryLogFile();
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: new ScriptedParityModelTransport(scriptedParityResponses.slice(0, 1)),
        toolRegistry: tools(async () => ({ content: 'fixture-main', isError: false })),
        idPrefix: 'empty-rewind',
      }),
    );

    await expect(
      host.admit({
        chatId: 'chat-empty-rewind',
        runId: 'run-retry',
        trigger: 'retry',
        retainedMessageIds: [],
        message: { id: 'turn-first', role: 'user', content: 'Retry of a turn that never ran.' },
      }),
    ).resolves.toContainEqual(
      expect.objectContaining({ id: 'turn-first', role: 'user', content: 'Retry of a turn that never ran.' }),
    );

    const log = await file.open();
    const events = await log.read();
    // Nothing was rewound, so nothing claims it was.
    expect(events.some((event) => event.type === 'history.rewound')).toBe(false);
    expect(
      reduceEventLog(events)
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
    ).toEqual(['turn-first']);
    await host.close();
  });

  it('hands the second turn of a chat the session the first one remembered', async () => {
    const file = createMemoryLogFile();
    const seen: Array<{ readonly agentId: string; readonly state: JsonObject | undefined }> = [];
    const closedChats: string[] = [];
    let nextSession = 0;
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent', 'other-agent'],
      run: async (turn) => {
        seen.push({ agentId: turn.agentId, state: turn.state });
        if (typeof turn.state?.['acpSessionId'] !== 'string') {
          nextSession += 1;
          await turn.remember({ acpSessionId: `session-${String(nextSession)}`, model: 'stub-model' });
        }
      },
      closeChat: async (chatId) => {
        closedChats.push(chatId);
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-session',
      }),
      externalRunners: { acp: externalPort },
    });

    const start = async (input: {
      readonly runId: string;
      readonly messageId: string;
      readonly agentId: string;
    }): Promise<void> => {
      await host.admit({
        chatId: 'chat-external-session',
        runId: input.runId,
        trigger: 'submit',
        message: { id: input.messageId, role: 'user', content: 'Run this elsewhere.' },
        config: {
          systemPrompt: 'unused by an external turn',
          toolChoice: 'none',
          agent: { kind: 'acp', id: input.agentId },
        },
      });
      await host.cancel({ runId: input.runId });
    };

    await start({ runId: 'run-1', messageId: 'turn-1', agentId: 'stub-agent' });
    await start({ runId: 'run-2', messageId: 'turn-2', agentId: 'stub-agent' });
    // A different agent in the same chat never inherits another vendor's session.
    await start({ runId: 'run-3', messageId: 'turn-3', agentId: 'other-agent' });

    expect(seen[0]?.state?.['acpSessionId']).toBeUndefined();
    expect(seen[1]?.state).toMatchObject({ acpSessionId: 'session-1', model: 'stub-model', agentId: 'stub-agent' });
    expect(seen[2]?.state?.['acpSessionId']).toBeUndefined();

    /* A rewind retracts a turn the vendor thread still holds, so the runner is
     * told to end that session and the retained selection loses its id. */
    const log = await file.open();
    const retained = reduceEventLog(await log.read())
      .map((message) => message.id)
      .slice(0, 1);
    await host.admit({
      chatId: 'chat-external-session',
      runId: 'run-4',
      trigger: 'retry',
      retainedMessageIds: retained,
      message: { id: 'turn-4', role: 'user', content: 'Run this elsewhere.' },
      config: {
        systemPrompt: 'unused by an external turn',
        toolChoice: 'none',
        agent: { kind: 'acp', id: 'stub-agent' },
      },
    });
    await host.cancel({ runId: 'run-4' });
    expect(closedChats).toEqual(['chat-external-session']);
    expect(seen[3]?.state?.['acpSessionId']).toBeUndefined();
    expect(seen[3]?.state).toMatchObject({ model: 'stub-model' });

    await host.close();
    // Closing the host ends every chat the runner still holds open.
    expect(closedChats).toEqual(['chat-external-session', 'chat-external-session']);
  });

  it('should record the stop details an external runner throws on its failed run', async () => {
    const file = createMemoryLogFile();
    const details = {
      agentId: 'stub-agent',
      failure: { category: 'limit', title: 'You have hit your usage limit.', actions: [] },
    };
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async () => {
        throw Object.assign(new Error('You have hit your usage limit.'), {
          code: 'EXTERNAL_AGENT_LIMIT_REACHED',
          details,
        });
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-stop',
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId: 'chat-external-stop',
      runId: 'run-external-stop',
      trigger: 'submit',
      message: { id: 'turn-external-stop', role: 'user', content: 'Run this elsewhere.' },
      config: {
        systemPrompt: 'unused by an external turn',
        toolChoice: 'none',
        agent: { kind: 'acp', id: 'stub-agent' },
      },
    });

    await vi.waitFor(async () => {
      const log = await file.open();
      const events = await log.read();
      const failed = events.flatMap((event) =>
        event.type === 'run.lifecycle' && event.state === 'failed' ? [event.detail] : [],
      );
      expect(failed).toEqual([
        { message: 'You have hit your usage limit.', code: 'EXTERNAL_AGENT_LIMIT_REACHED', details },
      ]);
    });
    await host.close();
  });

  it.each([
    ['a retry the agent offers', ['retry'], true],
    // A usage limit: nothing helps *now*, and what clears it is time.
    ['a usage limit with no action at all', [], true],
    ['a context limit only a new session clears', ['new_session'], false],
  ] as const)('continues an external stop on the session it remembered for %s', async (_label, actions, resumable) => {
    const file = createMemoryLogFile();
    const seen: Array<JsonObject | undefined> = [];
    const closedChats: string[] = [];
    let attempt = 0;
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        seen.push(turn.state);
        attempt += 1;
        if (attempt > 1) {
          return;
        }
        await turn.remember({ acpSessionId: 'session-1' });
        throw Object.assign(new Error('The agent is rate limited.'), {
          code: 'EXTERNAL_AGENT_LIMIT_REACHED',
          details: {
            agentId: 'stub-agent',
            failure: { category: 'limit', title: 'The agent is rate limited.', actions },
          },
        });
      },
      closeChat: async (chatId) => {
        closedChats.push(chatId);
      },
    };
    const slug = actions.join('-') || 'none';
    const chatId = `chat-external-${slug}`;
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: `external-${slug}`,
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId,
      runId: 'run-external-limit',
      trigger: 'submit',
      message: { id: 'turn-external-limit', role: 'user', content: 'Run this elsewhere.' },
      config: {
        systemPrompt: 'unused by an external turn',
        toolChoice: 'none',
        agent: { kind: 'acp', id: 'stub-agent' },
      },
    });
    await vi.waitFor(async () => {
      const settling = await host.snapshot(chatId);
      expect(settling.state).toBe('failed');
    });
    /* The gesture a person actually makes: a surface reads the run's failure
     * off the snapshot and only calls resume when that record says it can be
     * continued. An external stop writes no assistant diagnostic, so a
     * snapshot that reported no failure at all made every Resume a rewind
     * (F1). */
    const stopped = await host.snapshot(chatId);
    expect(stopped.failure).toMatchObject({
      code: 'EXTERNAL_AGENT_LIMIT_REACHED',
      message: 'The agent is rate limited.',
    });
    expect(isResumableRunFailure(stopped.failure)).toBe(resumable);
    await host.resume(chatId);
    if (!resumable) {
      const settled = await readLog(file);
      expect(seen).toHaveLength(1);
      expect(settled.flatMap((event) => (event.type === 'run.lifecycle' ? [event.state] : []))).toEqual([
        'admitted',
        'running',
        'failed',
      ]);
      await host.close();
      return;
    }
    await vi.waitFor(() => {
      expect(seen).toHaveLength(2);
    });
    const events = await readLog(file);
    /* The agent said retrying can help, so the turn continues in the vendor
     * session it already holds: nothing told the runner to close the chat,
     * the second attempt carries the remembered session id, and the turn is
     * neither rewound nor sent a second time (R9/S11). */
    expect(seen).toHaveLength(2);
    expect(closedChats).toEqual([]);
    expect(seen[1]).toMatchObject({ acpSessionId: 'session-1', agentId: 'stub-agent' });
    expect(events.some((event) => event.type === 'history.rewound')).toBe(false);
    expect(
      reduceEventLog(events)
        .filter((message) => message.role === 'user')
        .map((message) => message.id),
    ).toEqual(['turn-external-limit']);
    await host.close();
  });

  it('holds cancel open until an external run settles as cancelled', async () => {
    const file = createMemoryLogFile();
    const settled = Promise.withResolvers<void>();
    let aborted = false;
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        turn.signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            // A real adapter answers `session/cancel` a beat later, with its
            // own terminal stop reason; settle after the turn, not inside it.
            globalThis.setTimeout(() => {
              settled.resolve();
            }, 20);
          },
          { once: true },
        );
        await settled.promise;
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-cancel',
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId: 'chat-external-cancel',
      runId: 'run-external-cancel',
      trigger: 'submit',
      message: { id: 'turn-external-cancel', role: 'user', content: 'Run this elsewhere.' },
      config: {
        systemPrompt: 'unused by an external turn',
        toolChoice: 'none',
        agent: { kind: 'acp', id: 'stub-agent' },
      },
    });
    await expect(host.snapshot('chat-external-cancel')).resolves.toMatchObject({ state: 'running' });

    await host.cancel({ runId: 'run-external-cancel' });

    expect(aborted).toBe(true);
    await expect(host.snapshot('chat-external-cancel')).resolves.toMatchObject({ state: 'cancelled' });
    await host.close();
  });
  it('admits a run whose only record is a settlement written under its id', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [...completedFirstTurn, settlementOnlySecondRun]);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'settlement-only',
      }),
    );

    await host.admit({
      chatId: 'chat-settlement-only',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });

    const events = await readLog(file);
    expect(
      events.flatMap((event) => (event.runId === 'run-2' && event.type === 'run.lifecycle' ? [event.state] : [])),
    ).toEqual(['admitted', 'running', 'completed']);
    /* The turn the user actually sent is committed under the new run, which is
     * what a replayed `start` reads to tell a real admission from a phantom. */
    expect(
      events.find((event) => event.runId === 'run-2' && event.type === 'turn.history-projection-committed'),
    ).toMatchObject({ message: { id: 'turn-2' } });
    await host.close();
  });

  it('refuses a re-admission of a run that already has a lifecycle record', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'readmit',
      }),
    );

    await expect(
      host.admit({
        chatId: 'chat-readmit',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-1-again', role: 'user', content: 'Again.' },
      }),
    ).rejects.toMatchObject({ code: 'RUN_ID_TAKEN', runId: 'run-1' });
    await host.close();
  });

  it('names the last run with a lifecycle and resumes nothing for a settlement-only tail', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [...completedFirstTurn, settlementOnlySecondRun]);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'settlement-tail',
      }),
    );

    await expect(host.snapshot('chat-settlement-only')).resolves.toMatchObject({
      runId: 'run-1',
      state: 'completed',
    });
    const before = await readLog(file);
    await host.resume('chat-settlement-only');

    const after = await readLog(file);
    expect(after).toHaveLength(before.length);
    await host.close();
  });

  it('refuses a settlement for a run that was never admitted', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'unadmitted-settlement',
      }),
    );

    await expect(
      host.recordSettlement({
        chatId: 'chat-unadmitted',
        runId: 'run-unknown',
        event: {
          type: 'turn.failed',
          turnId: 'turn-1',
          chatId: 'chat-unadmitted',
          reason: 'The turn ended before it recorded a revision.',
        },
      }),
    ).rejects.toMatchObject({ code: 'SETTLEMENT_WITHOUT_RUN' });
    const remaining = await readLog(file);
    expect(remaining).toHaveLength(completedFirstTurn.length);
    await host.close();
  });
});

/**
 * The run ledger, driven through a real host (R9, C5).
 *
 * `admit`, `resume` and the settlement writers each used to decide their own
 * legality from a different reading of the same facts, and the table that was
 * meant to unify them was read by two of the four operations and pinned by a
 * test that re-declared it. These rows drive a host over scripted logs instead,
 * one per cell of the fold.
 */
describe('the host run ledger', () => {
  const ledgerHost = (file: ReturnType<typeof createMemoryLogFile>, idPrefix: string) =>
    createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix,
      }),
    );

  const settlement = {
    type: 'turn.failed',
    turnId: 'turn-1',
    chatId: 'chat-ledger',
    reason: 'The turn ended before it recorded a revision.',
  } as const;

  /** One seeded body under the envelope the fold reads it through. */
  const recorded = (event: SeededLogEvent, sequence: number): AgentLogEvent =>
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- one envelope over a closed union of seeded bodies.
    ({ ...event, version: 1, leaderEpoch: 'epoch-fold', sequence, recordedAt: '' }) as AgentLogEvent;

  it('should fold one log into the chat run and every run append state', () => {
    const seeded: readonly SeededLogEvent[] = [
      ...completedFirstTurn,
      {
        type: 'turn.finalized',
        runId: 'run-1',
        turnId: 'turn-1',
        chatId: 'chat-ledger',
        projectId: 'project-1',
        changedPaths: [],
        trigger: 'turn',
        runIds: ['run-1'],
      },
      { type: 'run.lifecycle', runId: 'run-2', state: 'admitted' },
      settlementOnlySecondRun,
    ];

    const ledger = runLedgerOf(seeded.map((event, index) => recorded(event, index)));

    expect(ledger.chat).toEqual({ runId: 'run-2', state: 'admitted' });
    expect(ledger.runs.get('run-1')?.state).toBe('settled');
    /* `run-2` carries both an admission and, from the seeded tail, a
     * settlement — the shape a fixed host will no longer write. */
    expect(ledger.runs.get('run-2')?.state).toBe('settled');
    expect(runLedgerOf([]).chat).toBeUndefined();
  });

  it('should treat an identical repeat of a settlement as a no-op', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = ledgerHost(file, 'settle-twice');

    await host.recordSettlement({ chatId: 'chat-ledger', runId: 'run-1', event: settlement });
    const once = await readLog(file);
    await host.recordSettlement({ chatId: 'chat-ledger', runId: 'run-1', event: settlement });

    /* At-least-once delivery is what makes "exactly one settlement" reachable
     * at all, so the repeat has to add nothing rather than refuse (V10). */
    expect(await readLog(file)).toHaveLength(once.length);
    await host.close();
  });

  it('should refuse a second settlement that says something else', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = ledgerHost(file, 'settle-conflict');

    await host.recordSettlement({ chatId: 'chat-ledger', runId: 'run-1', event: settlement });

    await expect(
      host.recordSettlement({
        chatId: 'chat-ledger',
        runId: 'run-1',
        event: {
          type: 'turn.finalized',
          turnId: 'turn-1',
          chatId: 'chat-ledger',
          projectId: 'project-1',
          changedPaths: [],
          trigger: 'turn',
          runIds: ['run-1'],
        },
      }),
    ).rejects.toMatchObject({ code: 'SETTLEMENT_CONFLICT' });
    await host.close();
  });

  it('should refuse to describe a chat whose log admitted no run', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [settlementOnlySecondRun]);
    const host = ledgerHost(file, 'no-run');

    /* R2: a run with no lifecycle record is not a run. `snapshot` answered
     * `admitted` for one, which is the same default that made an abandoned
     * lease's settlement look like a live turn. */
    await expect(host.snapshot('chat-no-run')).rejects.toMatchObject({ code: 'NO_RUN_ADMITTED' });
    await host.close();
  });

  it.each([
    [undefined, 'none'],
    ['admitted', 'admitted'],
    ['running', 'running'],
    ['paused', 'paused'],
    ['completed', 'terminal'],
    ['failed', 'terminal'],
    ['cancelled', 'terminal'],
  ] as const)('should read the lifecycle %s as %s', (lifecycle, expected) => {
    expect(hostRunStateOfLifecycle(lifecycle)).toBe(expected);
  });
});

describe('the attempt ledger and its refusal taxonomy', () => {
  /** A first turn stopped inside the admission window: records, and no projection. */
  const stoppedInAdmission: readonly SeededLogEvent[] = [
    { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
    { type: 'run.lifecycle', runId: 'run-1', state: 'cancelled' },
  ];

  const settlementOf = (
    input: { readonly runId: string; readonly chatId: string } & Partial<{ readonly revisionId: string }>,
  ) =>
    ({
      type: 'turn.finalized',
      turnId: `turn-${input.runId}`,
      chatId: input.chatId,
      projectId: 'project-1',
      changedPaths: ['main.ts'],
      trigger: 'turn',
      runIds: [input.runId],
      ...(input.revisionId === undefined ? {} : { revisionId: input.revisionId }),
    }) as const;

  const silentHost = (file: ReturnType<typeof createMemoryLogFile>, idPrefix: string, stream?: ModelTransport) =>
    createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: stream ?? {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'text-delta', text: 'ok' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix,
      }),
    );

  it('admits a rewinding gesture on a chat whose first run committed no turn', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, stoppedInAdmission);
    const host = silentHost(file, 'wedge');

    /* The log is not empty and the projection is: gating the prefix check on
     * records instead of history refused this forever with
     * `HISTORY_PREFIX_INVALID`. */
    await host.admit({
      chatId: 'chat-wedge',
      runId: 'run-2',
      trigger: 'regenerate',
      retainedMessageIds: [],
      message: { id: 'turn-2', role: 'user', content: 'Try again.' },
    });

    const events = await readLog(file);
    expect(
      events.flatMap((event) => (event.type === 'run.lifecycle' && event.runId === 'run-2' ? [event.state] : [])),
    ).toEqual(['admitted', 'running', 'completed']);
    await host.close();
  });

  it('retains a whole history prefix, as the reducer already allows', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = silentHost(file, 'prefix');
    const retained = reduceEventLog(await readLog(file)).map((message) => message.id);

    /* `>=` was one stricter than `reducer.ts`'s `retained.length <= messages.length`. */
    await host.admit({
      chatId: 'chat-prefix',
      runId: 'run-2',
      trigger: 'edit',
      retainedMessageIds: retained,
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });

    expect(await host.snapshot('chat-prefix')).toMatchObject({ runId: 'run-2', state: 'completed' });
    await host.close();
  });

  it('rules every lifecycle record an attempt may add', () => {
    // `admitted` is a run's first word.
    expect(
      isHostLifecycleLegal({ next: 'admitted', state: 'unadmitted', lifecycle: undefined, reopenable: false }),
    ).toBe(true);
    expect(isHostLifecycleLegal({ next: 'admitted', state: 'open', lifecycle: 'running', reopenable: false })).toBe(
      false,
    );
    expect(isHostLifecycleLegal({ next: 'admitted', state: 'terminal', lifecycle: 'failed', reopenable: true })).toBe(
      false,
    );
    // Everything before the settlement stays legal: teardown re-records, resume reopens.
    expect(
      isHostLifecycleLegal({ next: 'cancelled', state: 'terminal', lifecycle: 'cancelled', reopenable: false }),
    ).toBe(true);
    expect(isHostLifecycleLegal({ next: 'running', state: 'terminal', lifecycle: 'failed', reopenable: false })).toBe(
      true,
    );
    /* A settlement that landed while the run was executing does not stop it
     * recording how it ended — refusing that row would kill a live run. */
    expect(isHostLifecycleLegal({ next: 'completed', state: 'settled', lifecycle: 'running', reopenable: false })).toBe(
      true,
    );
    // Once it has ended and settled, only a reopening `running` may follow.
    expect(isHostLifecycleLegal({ next: 'completed', state: 'settled', lifecycle: 'failed', reopenable: true })).toBe(
      false,
    );
    expect(isHostLifecycleLegal({ next: 'running', state: 'settled', lifecycle: 'failed', reopenable: false })).toBe(
      false,
    );
    expect(isHostLifecycleLegal({ next: 'running', state: 'settled', lifecycle: 'failed', reopenable: true })).toBe(
      true,
    );
  });

  it('refuses a lifecycle record an external runner writes for a settled run', async () => {
    const file = createMemoryLogFile();
    const refusals: unknown[] = [];
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        await turn.append([
          { type: 'turn.failed', chatId: 'chat-external-settled', turnId: 'turn-1', reason: 'Nothing to record.' },
        ]);
        await turn.append([{ type: 'run.lifecycle', state: 'admitted' }]).catch((error: unknown) => {
          refusals.push(error);
        });
        return undefined;
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-settled',
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId: 'chat-external-settled',
      runId: 'run-external-settled',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Run this elsewhere.' },
      config: { systemPrompt: 'unused', toolChoice: 'none', agent: { kind: 'acp', id: 'stub-agent' } },
    });

    await vi.waitFor(() => {
      expect(refusals).toHaveLength(1);
    });
    expect(refusals[0]).toMatchObject({ code: 'RUN_ID_TAKEN', runId: 'run-external-settled' });
    await host.close();
  });

  it('refuses the second of two differing settlements appended in one batch', async () => {
    const file = createMemoryLogFile();
    const refusals: unknown[] = [];
    const externalPort: ExternalAgentPort = {
      list: () => ['stub-agent'],
      run: async (turn) => {
        await turn
          .append([
            { type: 'turn.failed', chatId: 'chat-external-batch', turnId: 'turn-1', reason: 'First.' },
            { type: 'turn.failed', chatId: 'chat-external-batch', turnId: 'turn-1', reason: 'Second.' },
          ])
          .catch((error: unknown) => {
            refusals.push(error);
          });
        return undefined;
      },
    };
    const host = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          stream: () => {
            throw new Error('An external turn must never reach the Tau model.');
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'external-batch',
      }),
      externalRunners: { acp: externalPort },
    });

    await host.admit({
      chatId: 'chat-external-batch',
      runId: 'run-external-batch',
      trigger: 'submit',
      message: { id: 'turn-1', role: 'user', content: 'Run this elsewhere.' },
      config: { systemPrompt: 'unused', toolChoice: 'none', agent: { kind: 'acp', id: 'stub-agent' } },
    });

    await vi.waitFor(() => {
      expect(refusals).toHaveLength(1);
    });
    expect(refusals[0]).toMatchObject({ code: 'SETTLEMENT_CONFLICT' });
    const recorded = await readLog(file);
    expect(recorded.filter((event) => event.type === 'turn.failed')).toHaveLength(1);
    await host.close();
  });

  it('records a settlement for one run while another run of the chat is streaming', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const settled: unknown[] = [];
    const host: TauAgentHost = silentHost(file, 'concurrent', {
      async *stream(): AsyncGenerator<ModelStreamEvent> {
        yield { type: 'text-delta', text: 'still going' };
        /* The collision the two writers made: this lands at the sequence the
         * streaming run's own private counter is about to reuse. */
        await host
          .recordSettlement({
            chatId: 'chat-concurrent',
            runId: 'run-1',
            event: settlementOf({ runId: 'run-1', chatId: 'chat-concurrent', revisionId: 'rev-1' }),
          })
          .then(
            () => settled.push('ok'),
            (error: unknown) => settled.push(error),
          );
        yield { type: 'completed', stopReason: 'stop' };
      },
    });

    await host.admit({
      chatId: 'chat-concurrent',
      runId: 'run-2',
      trigger: 'submit',
      message: { id: 'turn-2', role: 'user', content: 'Second.' },
    });

    expect(settled).toEqual(['ok']);
    const events = await readLog(file);
    expect(
      events.flatMap((event) => (event.type === 'run.lifecycle' && event.runId === 'run-2' ? [event.state] : [])),
    ).toEqual(['admitted', 'running', 'completed']);
    expect(events.filter((event) => event.type === 'turn.finalized')).toHaveLength(1);
    await host.close();
  });

  it('refuses a settlement that drops what the stored one named', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, completedFirstTurn);
    const host = silentHost(file, 'settlement-union');
    const stored = settlementOf({ runId: 'run-1', chatId: 'chat-union', revisionId: 'rev-1' });
    await host.recordSettlement({ chatId: 'chat-union', runId: 'run-1', event: stored });

    /* Comparing only the *new* body's keys made a settlement that named no
     * revision dedupe against one that named a revision: the key was absent,
     * so it was never compared. */
    const { revisionId: _dropped, ...poorer } = stored;
    await expect(host.recordSettlement({ chatId: 'chat-union', runId: 'run-1', event: poorer })).rejects.toMatchObject({
      code: 'SETTLEMENT_CONFLICT',
    });

    // An identical repeat is still the delivery guarantee doing its job.
    await host.recordSettlement({ chatId: 'chat-union', runId: 'run-1', event: { ...stored } });
    const recorded = await readLog(file);
    expect(recorded.filter((event) => event.type === 'turn.finalized')).toHaveLength(1);
    await host.close();
  });

  it('refuses a settlement written while its run is only reserved', async () => {
    const file = createMemoryLogFile();
    const refusals: unknown[] = [];
    const host: TauAgentHost = createTauAgentHost({
      ...hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(): AsyncGenerator<ModelStreamEvent> {
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(async () => ({ content: null, isError: false })),
        idPrefix: 'reserved',
      }),
      /* Awaited inside `sessionFor`: the reservation exists, the session does
       * not, and the run has no lifecycle record — the window an abandoned
       * lease's `turn.failed` used to land in. */
      clientContext: async () => {
        await host
          .recordSettlement({
            chatId: 'chat-reserved',
            runId: 'run-reserved',
            event: {
              type: 'turn.failed',
              chatId: 'chat-reserved',
              turnId: 'turn-reserved',
              reason: 'The turn ended before it recorded a revision.',
            },
          })
          .catch((error: unknown) => {
            refusals.push(error);
          });
        return undefined;
      },
    });

    await host.admit({
      chatId: 'chat-reserved',
      runId: 'run-reserved',
      trigger: 'submit',
      message: { id: 'turn-reserved', role: 'user', content: 'First.' },
    });

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({ code: 'SETTLEMENT_WITHOUT_RUN' });
    await host.close();
  });

  it('refuses a live chat with one code, in memory and durably alike', async () => {
    const durableFile = createMemoryLogFile();
    await seedLog(durableFile, [
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    ]);
    const durableHost = silentHost(durableFile, 'live-durable');

    /* The branch a reload-then-send reaches: a fresh worker's host has no run
     * in memory, so only the ledger knows. It carried no code at all, and the
     * page's recovery could not recognise it. */
    await expect(
      durableHost.admit({
        chatId: 'chat-live-durable',
        runId: 'run-2',
        trigger: 'submit',
        message: { id: 'turn-2', role: 'user', content: 'Second.' },
      }),
    ).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE', runId: 'run-1', state: 'running' });

    // And the same run id, refused as taken rather than as a live run.
    await expect(
      durableHost.admit({
        chatId: 'chat-live-durable',
        runId: 'run-1',
        trigger: 'submit',
        message: { id: 'turn-3', role: 'user', content: 'Third.' },
      }),
    ).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE' });
    await durableHost.close();

    const memoryFile = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    const memoryHost = silentHost(memoryFile, 'live-memory', {
      async *stream(): AsyncGenerator<ModelStreamEvent> {
        await release.promise;
        yield { type: 'completed', stopReason: 'stop' };
      },
    });
    const first = memoryHost.admit({
      chatId: 'chat-live-memory',
      runId: 'run-a',
      trigger: 'submit',
      message: { id: 'turn-a', role: 'user', content: 'First.' },
    });
    await vi.waitFor(async () => {
      const live = await memoryHost.describeRun('chat-live-memory');
      expect(live?.state).toBe('running');
    });
    await expect(
      memoryHost.admit({
        chatId: 'chat-live-memory',
        runId: 'run-b',
        trigger: 'submit',
        message: { id: 'turn-b', role: 'user', content: 'Second.' },
      }),
    ).rejects.toMatchObject({ code: 'CHAT_RUN_LIVE', runId: 'run-a' });
    release.resolve();
    await first;
    await memoryHost.close();
  });

  it('describes a chat with no admitted run instead of refusing it', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [settlementOnlySecondRun]);
    const host = silentHost(file, 'describe');

    /* `attach` and every command epilogue read through here: a thrown
     * `NO_RUN_ADMITTED` made a chat in this shape impossible to open again. */
    await expect(host.describeRun('chat-settlement-only')).resolves.toBeUndefined();
    await expect(host.snapshot('chat-settlement-only')).rejects.toMatchObject({ code: 'NO_RUN_ADMITTED' });
    await expect(host.describeRun('chat-never-written')).resolves.toBeUndefined();
    await host.close();
  });

  it('waits for the admission of the run the caller names', async () => {
    const file = createMemoryLogFile();
    const release = Promise.withResolvers<void>();
    const host = silentHost(file, 'ack', {
      async *stream(): AsyncGenerator<ModelStreamEvent> {
        await release.promise;
        yield { type: 'completed', stopReason: 'stop' };
      },
    });
    const running = host.admit({
      chatId: 'chat-ack',
      runId: 'run-a',
      trigger: 'submit',
      message: { id: 'turn-a', role: 'user', content: 'First.' },
    });

    await expect(host.waitForAdmission('chat-ack', 'run-a')).resolves.toMatchObject({ runId: 'run-a' });
    /* Asking by chat alone answered one command with whatever run the chat was
     * on, which is the run-id mismatch this wait exists to prevent. */
    await expect(host.waitForAdmission('chat-ack', 'run-b')).resolves.toBeUndefined();
    release.resolve();
    await running;
    await host.close();
  });

  it('records an abandoned run as failed rather than resuming it', async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    ]);
    const requests: ModelStreamRequest[] = [];
    const host = silentHost(file, 'abandoned', {
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        yield { type: 'completed', stopReason: 'stop' };
      },
    });

    const marked = await host.markAbandoned('chat-abandoned');

    /* Never a provider call: the turn was asked once and paid for once. */
    expect(requests).toHaveLength(0);
    expect(marked).toMatchObject({ runId: 'run-1', state: 'failed' });
    expect(marked?.failure).toMatchObject({ code: 'RUN_ABANDONED' });
    expect(isResumableRunFailure(marked?.failure)).toBe(true);
    await host.close();
  });

  it('leaves a paused run paused and a live run alone', async () => {
    const pausedFile = createMemoryLogFile();
    await seedLog(pausedFile, [
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'paused' },
    ]);
    const host = silentHost(pausedFile, 'paused-abandon');
    const before = await readLog(pausedFile);

    expect(await host.markAbandoned('chat-paused')).toMatchObject({ runId: 'run-1', state: 'paused' });
    expect(await readLog(pausedFile)).toHaveLength(before.length);
    await host.close();
  });

  /** One assistant message as the stream wrapper leaves it when a call is refused. */
  const refusalMarker = (id: string, code: string): ProviderMessage => ({
    id,
    role: 'assistant',
    content: [],
    metadata: {
      diagnostics: [
        {
          type: 'tau.model-transport-failure',
          timestamp: 1,
          error: { name: 'GatewayModelTransportError', message: 'The stream dropped.', code },
          details: { status: 200, refusal: { routeId: 'route' } },
        },
      ],
    },
  });

  it("names this run's failure after an older run left its marker in the history", async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      { type: 'message.appended', runId: 'run-1', message: refusalMarker('assistant-1', 'NETWORK_ERROR') },
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'failed',
        detail: { code: 'NETWORK_ERROR', message: 'The stream dropped.' },
      },
      /* A plain resend rather than a Resume: nothing rewinds run-1's marker, so
       * it is still the newest diagnostic the chat's history holds. */
      { type: 'message.appended', runId: 'run-2', message: { id: 'turn-2', role: 'user', content: 'Second.' } },
      { type: 'run.lifecycle', runId: 'run-2', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-2', state: 'running' },
    ]);
    const host = silentHost(file, 'stale-marker');

    const marked = await host.markAbandoned('chat-stale-marker');

    /* A snapshot's failure is a fact about the run it names: the page keys the
     * saved-turn card and `isResumableRunFailure` off it, so an older run's
     * refusal leaking in shows the wrong card for this one. */
    expect(marked).toMatchObject({ runId: 'run-2', state: 'failed' });
    expect(marked?.failure).toEqual({
      code: 'RUN_ABANDONED',
      message: 'The host executing this run is gone. Resume the turn to continue it.',
    });
    await host.close();
  });

  it("prefers a run's own transport diagnostic to the codeless detail its terminal row carries", async () => {
    const file = createMemoryLogFile();
    await seedLog(file, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      { type: 'message.appended', runId: 'run-1', message: refusalMarker('assistant-1', 'RATE_LIMITED') },
      /* What the host's own catch records for a throw that carried no code:
       * the transport's status and refusal fields live only on the marker. */
      { type: 'run.lifecycle', runId: 'run-1', state: 'failed', detail: { message: 'The stream dropped.' } },
    ]);
    const host = silentHost(file, 'own-marker');

    const described = await host.snapshot('chat-own-marker');

    expect(described.failure).toEqual({
      code: 'RATE_LIMITED',
      message: 'The stream dropped.',
      status: 200,
      details: { routeId: 'route' },
    });
    await host.close();
  });

  /** A run whose page died mid-turn, as `markAbandoned` leaves it. */
  const abandonedAfter = (tail: ProviderMessage): readonly SeededLogEvent[] => [
    { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
    { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
    { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
    { type: 'message.appended', runId: 'run-1', message: tail },
    {
      type: 'run.lifecycle',
      runId: 'run-1',
      state: 'failed',
      detail: { code: 'RUN_ABANDONED', message: 'The host executing this run is gone.' },
    },
  ];

  it('resumes an abandoned run from the agent work its tail already holds', async () => {
    const file = createMemoryLogFile();
    await seedLog(
      file,
      abandonedAfter({ id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Half an answer.' }] }),
    );
    const requests: ModelStreamRequest[] = [];
    const host = silentHost(file, 'abandoned-tail', {
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        yield { type: 'completed', stopReason: 'stop' };
      },
    });

    /* `RUN_ABANDONED` is resumable, so the terminal branch runs the failure
     * marker's clearance over a tail that is not a marker at all: the agent's
     * own committed text. Rewinding it loses the work and asks — and pays for —
     * the turn a second time. */
    const resumed = await host.resume('chat-abandoned-tail');
    const events = await readLog(file);

    expect(events.filter((event) => event.type === 'history.rewound')).toHaveLength(0);
    expect(resumed.at(-1)).toMatchObject({ id: 'assistant-1', content: [{ type: 'text', text: 'Half an answer.' }] });
    expect(requests).toHaveLength(0);
    await host.close();
  });

  it("answers an abandoned run's unanswered tool call instead of retracting it", async () => {
    const file = createMemoryLogFile();
    await seedLog(
      file,
      abandonedAfter({
        id: 'assistant-1',
        role: 'assistant',
        content: [
          { type: 'text', text: 'Reading main.ts.' },
          { type: 'toolCall', id: 'call-read', name: 'read_file', arguments: { targetFile: 'main.ts' } },
        ],
      }),
    );
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(async () => ({ content: 'must-not-run', isError: false }));
    const host = createTauAgentHost(
      hostOptions({
        openEventLog: file.open,
        transport: {
          async *stream(request): AsyncGenerator<ModelStreamEvent> {
            requests.push(request);
            yield { type: 'text-delta', text: 'Recovered.' };
            yield { type: 'completed', stopReason: 'stop' };
          },
        },
        toolRegistry: tools(invoke),
        idPrefix: 'abandoned-call',
      }),
    );

    const resumed = await host.resume('chat-abandoned-call');
    const events = await readLog(file);

    expect(events.filter((event) => event.type === 'history.rewound')).toHaveLength(0);
    expect(resumed.find((message) => message.id === 'assistant-1')).toMatchObject({
      content: [{ type: 'text' }, { type: 'toolCall', id: 'call-read' }],
    });
    /* The dangling call gets the same synthetic result the tool-input path
     * gets: a provider refuses an unanswered call, and the tool itself is never
     * re-run. */
    expect(resumed.find((message) => message.role === 'tool-output')).toMatchObject({
      toolCallId: 'call-read',
      isError: true,
      content: { errorCode: 'CLIENT_DISCONNECTED' },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    await host.close();
  });

  it('reopens a settled run whose refusal is resumable, and refuses one that is not', async () => {
    const reopenFile = createMemoryLogFile();
    await seedLog(reopenFile, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      {
        type: 'run.lifecycle',
        runId: 'run-1',
        state: 'failed',
        detail: { code: 'INSUFFICIENT_CREDIT', message: 'Top up.' },
      },
      {
        type: 'turn.failed',
        runId: 'run-1',
        chatId: 'chat-reopen',
        turnId: 'turn-1',
        reason: 'The turn ended before it recorded a revision.',
      },
    ]);
    const host = silentHost(reopenFile, 'reopen');

    await host.resume('chat-reopen');

    /* The second attempt settles on its own terms: the reopening row clears the
     * first attempt's settlement slot, so this is no longer the
     * `SETTLEMENT_CONFLICT` that left the turn with no revision. */
    await host.recordSettlement({
      chatId: 'chat-reopen',
      runId: 'run-1',
      event: settlementOf({ runId: 'run-1', chatId: 'chat-reopen', revisionId: 'rev-1' }),
    });
    expect(await host.snapshot('chat-reopen')).toMatchObject({ runId: 'run-1', state: 'completed' });
    await host.close();

    const closedFile = createMemoryLogFile();
    await seedLog(closedFile, [
      { type: 'message.appended', runId: 'run-1', message: { id: 'turn-1', role: 'user', content: 'First.' } },
      { type: 'run.lifecycle', runId: 'run-1', state: 'admitted' },
      { type: 'run.lifecycle', runId: 'run-1', state: 'running' },
      {
        type: 'turn.failed',
        runId: 'run-1',
        chatId: 'chat-closed',
        turnId: 'turn-1',
        reason: 'The turn ended before it recorded a revision.',
      },
    ]);
    const closedHost = silentHost(closedFile, 'closed');
    const before = await readLog(closedFile);

    /* A settled attempt that cannot reopen: `resume` re-ran it and its second,
     * differing settlement was then refused with no way forward. */
    await closedHost.resume('chat-closed');
    expect(await readLog(closedFile)).toHaveLength(before.length);
    await closedHost.close();
  });
});
