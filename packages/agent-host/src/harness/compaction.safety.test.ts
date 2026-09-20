import { describe, expect, it, vi } from 'vitest';
import { estimateContextTokens, estimateTokens } from '@earendil-works/pi-agent-core';
import type { Api, Context, Model, Usage } from '@earendil-works/pi-ai';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import type { CompactionOutcome, CompactionSummarizer } from '#harness/compaction.js';
import { createAgentSession } from '#harness/session.js';
import type { EventLogAppender } from '#log/event-log-appender.js';
import type { AgentLogEvent, JsonValue, ProviderMessage } from '#log/event-types.js';
import { reduceEventLog } from '#log/reducer.js';
import { serializeLogEvent } from '#log/serialization.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';

const contextWindow = 8192;
const compactionBudget = Math.floor(contextWindow * 0.8);

const usage = (totalTokens: number): Usage => ({
  input: totalTokens,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

class ScriptedTransport implements ModelTransport {
  public readonly requests: ModelStreamRequest[] = [];
  // oxlint-disable-next-line typescript/parameter-properties -- TypeScript's erasableSyntaxOnly forbids parameter properties.
  private readonly eventsFor: (call: number, request: ModelStreamRequest) => readonly ModelStreamEvent[];

  public constructor(eventsFor: (call: number, request: ModelStreamRequest) => readonly ModelStreamEvent[]) {
    this.eventsFor = eventsFor;
  }

  public async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    this.requests.push(request);
    for (const event of this.eventsFor(this.requests.length, request)) {
      yield event;
    }
  }
}

const toolRegistry = (name: string, result: (call: number) => JsonValue = (call) => ({ call })): ToolRegistry => {
  let calls = 0;
  return {
    list: () => [
      {
        name,
        description: `Run ${name}.`,
        inputSchema: { type: 'object' },
      },
    ],
    invoke: vi.fn(async () => ({ content: result(++calls), isError: false })),
  };
};

const seedMessages = async (
  file: ReturnType<typeof createMemoryEventLogFile>,
  messages: readonly ProviderMessage[],
): Promise<void> => {
  const log = await file.open();
  for (const [sequence, message] of messages.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- The fixture seeds one physical JSONL sequence.
    await log.append({
      version: 1,
      leaderEpoch: 'seed-epoch',
      sequence,
      recordedAt: '2026-09-20T00:00:00.000Z',
      runId: 'seed-run',
      type: 'message.appended',
      message,
    });
  }
  await log.close();
};

const serializedEvents = (events: readonly AgentLogEvent[]): string =>
  events.map((event) => serializeLogEvent(event)).join('');

const createSession = async (options: {
  readonly file: ReturnType<typeof createMemoryEventLogFile>;
  readonly transport: ModelTransport;
  readonly tools?: ToolRegistry | undefined;
  readonly summarize?: CompactionSummarizer | undefined;
  readonly onCompaction?: ((outcome: CompactionOutcome) => void) | undefined;
  readonly eventLog?: EventLogAppender | undefined;
}) => {
  let id = 0;
  let tick = 0;
  return createAgentSession({
    chatId: 'compaction-safety',
    runId: 'safety-run',
    leaderEpoch: 'safety-epoch',
    systemPrompt: 'system',
    model: { id: 'stub', contextWindow },
    modelTransport: options.transport,
    toolRegistry: options.tools ?? { list: () => [], invoke: vi.fn() },
    eventLog: options.eventLog ?? (await options.file.open()),
    ...(options.summarize === undefined ? {} : { summarize: options.summarize }),
    ...(options.onCompaction === undefined
      ? {}
      : {
          onCompaction: (outcome) => {
            if (outcome.tier) {
              options.onCompaction?.(outcome);
            }
          },
        }),
    createId: () => `generated-${id++}`,
    now: () => new Date(Date.UTC(2026, 8, 20, 0, 0, tick++)),
  });
};

const toolCall = (call: number, text = ''): readonly ModelStreamEvent[] => [
  ...(text === '' ? [] : ([{ type: 'text-delta', text }] satisfies ModelStreamEvent[])),
  {
    type: 'tool-input',
    toolCallId: `call-${call}`,
    toolName: 'inspect',
    input: { call },
  },
  { type: 'usage', usage: usage(call === 1 ? 3000 : 7000) },
  { type: 'completed', stopReason: 'toolUse' },
];

const assistant = (id: string, content: ProviderMessage['content'], totalTokens?: number): ProviderMessage => ({
  id,
  role: 'assistant',
  content,
  metadata: {
    api: 'openai-completions',
    provider: 'stub',
    model: 'stub',
    stopReason: Array.isArray(content) && content.some((block) => block.type === 'toolCall') ? 'toolUse' : 'stop',
    ...(totalTokens === undefined ? {} : { usage: usage(totalTokens) }),
  },
});

const tierOneAndTwoHistory = (): ProviderMessage[] => {
  const messages: ProviderMessage[] = [{ id: 'old-user', role: 'user', content: 'Earlier work.' }];
  for (let index = 0; index < 7; index++) {
    const callId = `old-call-${index}`;
    messages.push(
      assistant(
        `old-assistant-${index}`,
        [{ type: 'toolCall', id: callId, name: 'read_file', arguments: { targetFile: `${index}.ts` } }],
        index === 6 ? 9000 : undefined,
      ),
      {
        id: `old-input-${index}`,
        role: 'tool-input',
        toolCallId: callId,
        toolName: 'read_file',
        content: { targetFile: `${index}.ts` },
      },
      {
        id: `old-output-${index}`,
        role: 'tool-output',
        toolCallId: callId,
        toolName: 'read_file',
        content: 'x'.repeat(3000),
        isError: false,
      },
    );
  }
  return messages;
};

const oversizedTailHistory = (): ProviderMessage[] => {
  const messages: ProviderMessage[] = [
    { id: 'tail-user-0', role: 'user', content: 'Start.' },
    assistant('tail-assistant-0', [{ type: 'text', text: 'First answer.'.repeat(320) }]),
    { id: 'tail-user-1', role: 'user', content: 'Continue.' },
  ];
  for (let index = 0; index < 4; index++) {
    const callId = `tail-call-${index}`;
    messages.push(
      assistant(`tail-assistant-${index + 1}`, [
        { type: 'toolCall', id: callId, name: 'inspect', arguments: { index } },
      ]),
      {
        id: `tail-output-${index}`,
        role: 'tool-output',
        toolCallId: callId,
        toolName: 'inspect',
        content: 'r'.repeat(6000),
        isError: false,
      },
    );
  }
  return messages;
};

const expectToolPairs = (messages: readonly ProviderMessage[]): void => {
  const callIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }
    for (const block of message.content) {
      if (
        typeof block === 'object' &&
        block !== null &&
        !Array.isArray(block) &&
        block['type'] === 'toolCall' &&
        typeof block['id'] === 'string'
      ) {
        callIds.add(block['id']);
      }
    }
  }
  for (const message of messages) {
    if (message.role === 'tool-output') {
      expect(callIds).toContain(message.toolCallId);
    }
  }
};

describe('compaction safety regressions', () => {
  it('should compact between agent turns after live assistant messages', async () => {
    const file = createMemoryEventLogFile();
    const transport = new ScriptedTransport((call) =>
      call < 3
        ? toolCall(call, call === 1 ? 'large-live-assistant-'.repeat(220) : 'second-live-assistant-'.repeat(250))
        : [
            { type: 'text-delta', text: 'finished' },
            { type: 'usage', usage: usage(200) },
            { type: 'completed', stopReason: 'stop' },
          ],
    );
    const session = await createSession({
      file,
      transport,
      tools: toolRegistry('inspect'),
      summarize: async () => 'Earlier live work.',
    });

    await session.prompt({ id: 'live-user', role: 'user', content: 'inspect twice' });

    const snapshot = await session.snapshot();
    expect(snapshot.failure).toBeUndefined();
    const log = await file.open();
    const events = await log.read();
    const compactedIndex = events.findIndex((event) => event.type === 'history.compacted');
    const compacted = events[compactedIndex];
    const terminal = events.findLast((event) => event.type === 'run.lifecycle');
    expect(compacted?.type).toBe('history.compacted');
    if (compacted?.type === 'history.compacted') {
      const before = reduceEventLog(events.slice(0, compactedIndex));
      const after = reduceEventLog(events.slice(0, compactedIndex + 1));
      const afterIds = new Set(after.map((message) => message.id));
      expect(compacted.evictedMessageIds).toEqual(
        before.filter((message) => !afterIds.has(message.id)).map((message) => message.id),
      );
    }
    expect(terminal).toMatchObject({ type: 'run.lifecycle', state: 'completed' });
    await log.close();
    await session.close();
  });

  it('should keep every live message durable-addressable after a full turn', async () => {
    const file = createMemoryEventLogFile();
    const transport = new ScriptedTransport((call) =>
      call === 1
        ? [
            ...toolCall(1, 'parity-assistant-'.repeat(250)).filter(
              (event) => event.type !== 'usage' && event.type !== 'completed',
            ),
            { type: 'usage', usage: usage(3000) },
            { type: 'completed', stopReason: 'toolUse' },
          ]
        : [
            { type: 'text-delta', text: 'final-parity-assistant-'.repeat(250) },
            { type: 'usage', usage: usage(7000) },
            { type: 'completed', stopReason: 'stop' },
          ],
    );
    const session = await createSession({
      file,
      transport,
      tools: toolRegistry('inspect'),
      summarize: async () => 'Earlier complete turn.',
    });
    await session.prompt({ id: 'parity-user', role: 'user', content: 'inspect once' });

    session.agent.state.messages = [
      ...session.agent.state.messages,
      { role: 'user', content: 'next turn', timestamp: Date.UTC(2026, 8, 20, 0, 1) },
    ];
    expect(estimateContextTokens(session.agent.state.messages).tokens).toBeGreaterThan(compactionBudget);
    await session.agent.prepareNextTurn?.();
    const parityStream = await session.agent.streamFunction(session.agent.state.model as Model<Api>, {
      systemPrompt: session.agent.state.systemPrompt,
      messages: session.agent.state.messages as Context['messages'],
      tools: session.agent.state.tools,
    });
    const parityResult = await parityStream.result();
    expect(parityResult.errorMessage).toBeUndefined();
    const log = await file.open();
    const events = await log.read();
    const compacted = events.findLast((event) => event.type === 'history.compacted');
    expect(compacted?.type).toBe('history.compacted');
    if (compacted?.type === 'history.compacted') {
      const durableIds = new Set(
        events.flatMap((event) =>
          event.type === 'message.appended'
            ? [event.message.id]
            : event.type === 'message.envelope-replaced'
              ? [event.messageId]
              : event.type === 'turn.history-projection-committed'
                ? [event.message.id]
                : [],
        ),
      );
      expect(compacted.evictedMessageIds.every((id) => durableIds.has(id))).toBe(true);
    }
    await log.close();
    await session.close();
  });

  it('should compact an overflow retry without retaining trimmer clones in agent state', async () => {
    const file = createMemoryEventLogFile();
    const marker = 'untrimmed-kernel-payload';
    const transport = new ScriptedTransport((call) => {
      if (call === 1) {
        return [
          { type: 'text-delta', text: 'overflow-prefix-'.repeat(350) },
          {
            type: 'tool-input',
            toolCallId: 'kernel-call',
            toolName: 'get_kernel_result',
            input: {},
          },
          { type: 'usage', usage: usage(1000) },
          { type: 'completed', stopReason: 'toolUse' },
        ];
      }
      if (call === 2) {
        return [
          { type: 'text-delta', text: 'second-overflow-prefix-'.repeat(250) },
          {
            type: 'tool-input',
            toolCallId: 'kernel-call-2',
            toolName: 'get_kernel_result',
            input: {},
          },
          { type: 'usage', usage: usage(1500) },
          { type: 'completed', stopReason: 'toolUse' },
        ];
      }
      if (call === 3) {
        return [
          { type: 'usage', usage: usage(contextWindow) },
          { type: 'completed', stopReason: 'length' },
        ];
      }
      return [
        { type: 'text-delta', text: 'recovered' },
        { type: 'completed', stopReason: 'stop' },
      ];
    });
    const session = await createSession({
      file,
      transport,
      tools: toolRegistry('get_kernel_result', () => ({
        status: 'ok',
        payload: `${marker}-${'x'.repeat(3000)}`,
      })),
      summarize: async () => 'Overflow prefix.',
    });

    await session.prompt({ id: 'overflow-user', role: 'user', content: 'u'.repeat(5000) });

    const snapshot = await session.snapshot();
    expect(snapshot.failure).toBeUndefined();
    expect(JSON.stringify(session.agent.state.messages)).toContain(marker);
    expect(transport.requests).toHaveLength(4);
    await session.close();
  });

  it('should leave the event log byte-identical when the compaction append fails', async () => {
    const file = createMemoryEventLogFile();
    await seedMessages(file, tierOneAndTwoHistory());
    const eventLog = await file.open();
    let rejectedCompaction = false;
    const session = await createSession({
      file,
      transport: new ScriptedTransport(() => [{ type: 'completed', stopReason: 'stop' }]),
      summarize: async () => 'Successful summary.',
      eventLog: {
        ...eventLog,
        append: async (event) => {
          if (event.type === 'history.compacted') {
            rejectedCompaction = true;
            throw new Error('compaction append rejected');
          }
          return eventLog.append(event);
        },
      },
    });
    const beforeLog = await file.open();
    const before = serializedEvents(await beforeLog.read());
    await beforeLog.close();

    const prepared = await session.agent.prepareNextTurn?.();
    expect(rejectedCompaction).toBe(true);
    const failureStream = await session.agent.streamFunction(session.agent.state.model as Model<Api>, {
      systemPrompt: session.agent.state.systemPrompt,
      messages: (prepared?.context?.messages ?? []) as Context['messages'],
      tools: session.agent.state.tools,
    });
    expect(await failureStream.result()).toMatchObject({
      stopReason: 'error',
      errorMessage: 'compaction append rejected',
    });

    const afterLog = await file.open();
    expect(serializedEvents(await afterLog.read())).toBe(before);
    await afterLog.close();
    await session.close();
  });

  it('should not write a clearing for a tool result evicted by the same compaction', async () => {
    const file = createMemoryEventLogFile();
    await seedMessages(file, tierOneAndTwoHistory());
    const session = await createSession({
      file,
      transport: new ScriptedTransport(() => [{ type: 'completed', stopReason: 'stop' }]),
      summarize: async () => 'Older reads.',
    });
    await session.prompt({ id: 'clearing-user', role: 'user', content: 'continue' });

    const log = await file.open();
    const events = await log.read();
    const compacted = events.find((event) => event.type === 'history.compacted');
    if (compacted?.type !== 'history.compacted') {
      throw new Error('Expected tier-two compaction.');
    }
    const evicted = new Set(compacted.evictedMessageIds);
    const clearedAndEvicted = events.flatMap((event) =>
      event.type === 'message.envelope-replaced' && evicted.has(event.messageId) ? [event.messageId] : [],
    );
    expect(clearedAndEvicted).toEqual([]);
    await log.close();
    await session.close();
  });

  it('should evict earlier turns when the newest tool result exceeds the recent-token budget', async () => {
    const file = createMemoryEventLogFile();
    await seedMessages(file, oversizedTailHistory());
    const session = await createSession({
      file,
      transport: new ScriptedTransport(() => [{ type: 'completed', stopReason: 'stop' }]),
      summarize: async () => 'Earlier tool loop.',
    });
    await session.prompt({ id: 'tail-user-next', role: 'user', content: 'continue' });

    const snapshot = await session.snapshot();
    expectToolPairs(snapshot.messages);
    expect(snapshot.failure).toBeUndefined();
    expect(snapshot.messages.some((message) => message.id === 'tail-user-0')).toBe(false);
    const log = await file.open();
    const events = await log.read();
    expect(events.some((event) => event.type === 'history.compacted')).toBe(true);
    await log.close();
    await session.close();
  });

  it('should evict and restore budget when fixed overhead exceeds the recent-token budget', async () => {
    const file = createMemoryEventLogFile();
    let compacted: CompactionOutcome | undefined;
    const transport = new ScriptedTransport((call) =>
      call === 1
        ? [
            {
              type: 'tool-input',
              toolCallId: 'overhead-call',
              toolName: 'inspect',
              input: {},
            },
            { type: 'usage', usage: usage(7000) },
            { type: 'completed', stopReason: 'toolUse' },
          ]
        : [
            { type: 'text-delta', text: 'continued' },
            { type: 'completed', stopReason: 'stop' },
          ],
    );
    const session = await createSession({
      file,
      transport,
      tools: toolRegistry('inspect', () => 'small result'),
      summarize: async () => 'Earlier fixed-overhead turn.',
      onCompaction: (outcome) => {
        compacted = outcome;
      },
    });
    await session.prompt({ id: 'overhead-user', role: 'user', content: 'x'.repeat(1900) });

    const snapshot = await session.snapshot();
    expect(snapshot.failure).toBeUndefined();
    expect(compacted?.messages.reduce((total, message) => total + estimateTokens(message), 0)).toBeLessThan(
      compactionBudget,
    );
    const log = await file.open();
    const events = await log.read();
    expect(events.some((event) => event.type === 'history.compacted')).toBe(true);
    await log.close();
    await session.close();
  });

  it('should compact at most once before retrying one overflowing model call', async () => {
    const file = createMemoryEventLogFile();
    await seedMessages(
      file,
      Array.from(
        { length: 5 },
        (_, index): ProviderMessage => ({
          id: `double-user-${index}`,
          role: 'user',
          content: `${index}-${'x'.repeat(3000)}`,
        }),
      ),
    );
    const tiers: string[] = [];
    const transport = new ScriptedTransport((call) =>
      call === 1
        ? [
            { type: 'usage', usage: usage(contextWindow) },
            { type: 'completed', stopReason: 'length' },
          ]
        : [
            { type: 'text-delta', text: 'recovered once' },
            { type: 'completed', stopReason: 'stop' },
          ],
    );
    const session = await createSession({
      file,
      transport,
      summarize: async () => 'One compacted prefix.',
      onCompaction: (outcome) => {
        if (outcome.tier) {
          tiers.push(outcome.tier);
        }
      },
    });
    await session.prompt({ id: 'double-user-new', role: 'user', content: 'n'.repeat(12_000) });

    const snapshot = await session.snapshot();
    expect(snapshot.failure).toBeUndefined();
    expect(tiers).toEqual(['summarization']);
    expect(transport.requests).toHaveLength(2);
    await session.close();
  });

  it.each([
    {
      failure: 'rejects',
      summarize: async () => {
        throw new Error('summary provider rejected');
      },
    },
    { failure: 'returns empty', summarize: async () => '' },
    {
      failure: 'aborts',
      summarize: async () => {
        throw new DOMException('summary aborted', 'AbortError');
      },
    },
    {
      failure: 'cannot fit its input',
      summarize: async () => {
        throw Object.assign(new Error('summary input exceeds the model context window'), {
          code: 'INVALID_REQUEST',
        });
      },
    },
  ])('should use a placeholder eviction when the summarizer $failure', async ({ failure, summarize }) => {
    const file = createMemoryEventLogFile();
    await seedMessages(
      file,
      Array.from(
        { length: 8 },
        (_, index): ProviderMessage => ({
          id: `summary-user-${index}`,
          role: 'user',
          content: `${index}-${'s'.repeat(4000)}`,
        }),
      ),
    );
    const session = await createSession({
      file,
      transport: new ScriptedTransport(() => [{ type: 'completed', stopReason: 'stop' }]),
      summarize,
    });
    let rejection: unknown;
    try {
      await session.prompt({ id: 'summary-user-next', role: 'user', content: 'continue' });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeUndefined();
    const log = await file.open();
    const events = await log.read();
    const compacted = events.find((event) => event.type === 'history.compacted');
    if (compacted?.type !== 'history.compacted') {
      throw new Error('Expected placeholder compaction.');
    }
    const placeholder = JSON.stringify(compacted.summary.content);
    expect(placeholder).toContain(`${compacted.evictedMessageIds.length} message`);
    expect(placeholder).toMatch(/turn/iu);
    expect(placeholder).toMatch(/project files/iu);
    if (placeholder.includes('summary provider rejected')) {
      throw new Error('The placeholder must not expose the provider failure in model-visible history.');
    }
    if (failure === 'rejects') {
      expect(compacted.details?.summarizerError).toBe('summary provider rejected');
    }
    expect(events.findLast((event) => event.type === 'run.lifecycle')).toMatchObject({ state: 'completed' });
    await log.close();
    await session.close();
  });

  it('should use a placeholder eviction when the summarizer emits a tool call', async () => {
    const file = createMemoryEventLogFile();
    await seedMessages(
      file,
      Array.from(
        { length: 8 },
        (_, index): ProviderMessage => ({
          id: `tool-summary-user-${index}`,
          role: 'user',
          content: `${index}-${'t'.repeat(4000)}`,
        }),
      ),
    );
    const transport = new ScriptedTransport((_call, request) =>
      request.systemPrompt.startsWith('You are a context summarization assistant')
        ? [
            {
              type: 'tool-input',
              toolCallId: 'summary-tool-call',
              toolName: 'read_file',
              input: { targetFile: 'main.ts' },
            },
            { type: 'completed', stopReason: 'toolUse' },
          ]
        : [{ type: 'completed', stopReason: 'stop' }],
    );
    const session = await createSession({ file, transport });

    await session.prompt({ id: 'tool-summary-next', role: 'user', content: 'continue' });

    const log = await file.open();
    const events = await log.read();
    const compacted = events.find((event) => event.type === 'history.compacted');
    expect(compacted).toMatchObject({ type: 'history.compacted' });
    expect(compacted?.details?.summarizerError).toBe('Summarization failed: Compaction summary emitted a tool call.');
    expect(JSON.stringify(compacted)).toMatch(/project files/iu);
    expect(events.findLast((event) => event.type === 'run.lifecycle')).toMatchObject({ state: 'completed' });
    await log.close();
    await session.close();
  });

  it('should propagate the run abort signal instead of replacing it with a placeholder', async () => {
    const file = createMemoryEventLogFile();
    await seedMessages(
      file,
      Array.from(
        { length: 8 },
        (_, index): ProviderMessage => ({
          id: `abort-user-${index}`,
          role: 'user',
          content: `${index}-${'a'.repeat(4000)}`,
        }),
      ),
    );
    const controller = new AbortController();
    const session = await createSession({
      file,
      transport: new ScriptedTransport(() => [{ type: 'completed', stopReason: 'stop' }]),
      summarize: async () => {
        controller.abort();
        throw new DOMException('run aborted', 'AbortError');
      },
    });

    await expect(session.agent.prepareNextTurn?.(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });

    const log = await file.open();
    const events = await log.read();
    expect(events.some((event) => event.type === 'history.compacted')).toBe(false);
    await log.close();
    await session.close();
  });

  it('should propagate a run abort returned by the transport summarizer', async () => {
    const file = createMemoryEventLogFile();
    await seedMessages(
      file,
      Array.from(
        { length: 8 },
        (_, index): ProviderMessage => ({
          id: `transport-abort-user-${index}`,
          role: 'user',
          content: `${index}-${'a'.repeat(4000)}`,
        }),
      ),
    );
    const controller = new AbortController();
    const transport = new ScriptedTransport((_call, request) => {
      if (request.systemPrompt.startsWith('You are a context summarization assistant')) {
        controller.abort();
        return [{ type: 'completed', stopReason: 'aborted' }];
      }
      return [{ type: 'completed', stopReason: 'stop' }];
    });
    const session = await createSession({ file, transport });

    await expect(session.agent.prepareNextTurn?.(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });

    const log = await file.open();
    const events = await log.read();
    expect(events.some((event) => event.type === 'history.compacted')).toBe(false);
    await log.close();
    await session.close();
  });

  it('should complete a funded overflow retry and settle its prestarted tool pair', async () => {
    const file = createMemoryEventLogFile();
    await seedMessages(
      file,
      Array.from(
        { length: 4 },
        (_, index): ProviderMessage => ({
          id: `funded-overflow-user-${index}`,
          role: 'user',
          content: `${index}-${'f'.repeat(1000)}`,
        }),
      ),
    );
    const requests: ModelStreamRequest[] = [];
    let generationCalls = 0;
    const transport: ModelTransport = {
      usesBillingAttempt: () => true,
      lookupAttempt: async () => undefined,
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        await request.onInvocationBound?.({
          operationId: `operation-${request.attemptId}`,
          status: 'pending',
        });
        if (request.invocationPurpose === 'compaction') {
          yield { type: 'text-delta', text: 'Earlier funded work.' };
          yield { type: 'completed', stopReason: 'stop' };
          return;
        }
        generationCalls++;
        if (generationCalls === 1) {
          yield {
            type: 'tool-input',
            toolCallId: 'overflow-tool-call',
            toolName: 'inspect',
            input: { targetFile: 'overflow.ts' },
          };
          yield { type: 'usage', usage: usage(contextWindow) };
          yield { type: 'completed', stopReason: 'length' };
          return;
        }
        yield { type: 'text-delta', text: 'Recovered after compaction.' };
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    const session = await createSession({
      file,
      transport,
      tools: toolRegistry('inspect', () => ({ inspected: true })),
    });

    await session.prompt({ id: 'funded-overflow-next', role: 'user', content: 'continue' });

    const snapshot = await session.snapshot();
    expect(snapshot.failure).toBeUndefined();
    expect(requests.map((request) => request.invocationPurpose)).toEqual(['generation', 'compaction', 'generation']);
    const toolInputs = snapshot.messages.filter(
      (message) => message.role === 'tool-input' && message.toolCallId === 'overflow-tool-call',
    );
    const toolOutputs = snapshot.messages.filter(
      (message) => message.role === 'tool-output' && message.toolCallId === 'overflow-tool-call',
    );
    expect(toolInputs).toHaveLength(1);
    expect(toolOutputs).toHaveLength(1);
    const log = await file.open();
    const events = await log.read();
    expect(events.findLast((event) => event.type === 'run.lifecycle')).toMatchObject({ state: 'completed' });
    expect(events.some((event) => event.type === 'history.compacted')).toBe(true);
    await log.close();
    await session.close();
  });

  it('should not duplicate live messages when the between-turn projection rejects once', async () => {
    const file = createMemoryEventLogFile();
    const stored = await file.open();
    let readsBeforeFailure: number | undefined;
    const eventLog: EventLogAppender = {
      ...stored,
      read: async () => {
        if (readsBeforeFailure === 0) {
          readsBeforeFailure = undefined;
          throw new Error('projection read rejected once');
        }
        if (readsBeforeFailure !== undefined) {
          readsBeforeFailure--;
        }
        return stored.read();
      },
    };
    const transport = new ScriptedTransport((call) =>
      call === 1
        ? [
            {
              type: 'tool-input',
              toolCallId: 'projection-call',
              toolName: 'inspect',
              input: {},
            },
            { type: 'completed', stopReason: 'toolUse' },
          ]
        : [{ type: 'completed', stopReason: 'stop' }],
    );
    const baseTools = toolRegistry('inspect');
    const tools: ToolRegistry = {
      list: baseTools.list,
      invoke: vi.fn(async (invocation: Parameters<ToolRegistry['invoke']>[0]) => {
        const result = await baseTools.invoke(invocation);
        readsBeforeFailure = 1;
        return result;
      }),
    };
    const session = await createSession({ file, transport, tools, eventLog });

    await session.prompt({ id: 'projection-user', role: 'user', content: 'inspect once' });

    const liveFailureMessages = session.agent.state.messages.filter(
      (message) => message.role === 'assistant' && message.errorMessage === 'projection read rejected once',
    );
    expect(liveFailureMessages).toHaveLength(1);
    expect(await session.snapshot()).toMatchObject({
      state: 'failed',
      failure: { code: 'SESSION_LOG_INTEGRITY', message: 'projection read rejected once' },
    });
    await session.close();
  });
});
