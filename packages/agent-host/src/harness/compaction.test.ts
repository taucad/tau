import { describe, expect, it, vi } from 'vitest';
import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { AssistantMessage, Context, Models, UserMessage } from '@earendil-works/pi-ai';
import { installCompaction } from '#harness/compaction.js';
import type { CompactionOutcome, CompactionSummarizer } from '#harness/compaction.js';
import { createAgentSession } from '#harness/session.js';
import { createMemoryEventLogFile, stubModel } from '#harness/harness.fixture.js';
import { MessageIdentities, providerMessageToPi } from '#harness/session-record.js';
import type { SessionRecord } from '#harness/session-record.js';
import { reduceEventLog } from '#log/reducer.js';
import type { AgentLogEvent, AssistantProviderMessage, UserProviderMessage } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';

const oversizedToolHistory = (toolName = 'read_file'): AgentMessage[] =>
  Array.from(
    { length: 7 },
    (_, index): AgentMessage => ({
      role: 'toolResult',
      toolCallId: `call-${index}`,
      toolName,
      content: [{ type: 'text', text: index < 2 ? 'x'.repeat(24_000) : `small-${index}` }],
      isError: false,
      timestamp: index,
    }),
  );

const providerUsage = (totalTokens: number): AssistantMessage['usage'] => ({
  input: totalTokens,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

/** An assistant turn the provider already answered, carrying the usage it reported. */
const answeredTurn = (totalTokens: number, timestamp: number): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text: 'Done.' }],
  api: stubModel.api,
  provider: stubModel.provider,
  model: stubModel.id,
  usage: providerUsage(totalTokens),
  stopReason: 'stop',
  timestamp,
});

const dispatchedStream = () => {
  const stream = createAssistantMessageEventStream();
  const message = answeredTurn(0, 100);
  stream.push({ type: 'start', partial: message });
  stream.push({ type: 'done', reason: 'stop', message });
  return stream;
};

const recordFor = (messages: readonly AgentMessage[]): SessionRecord => {
  const identities = new MessageIdentities(() => 'unused');
  for (const [index, message] of messages.entries()) {
    identities.set(message, `message-${index}`);
  }
  return { messages: identities, append: async () => undefined, events: async () => [], history: async () => [] };
};

const evictableHistory = (count: number): UserMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    role: 'user',
    content: `${index}-${'x'.repeat(4000)}`,
    timestamp: index,
  }));

describe('Compaction', () => {
  it('uses the ephemeral first-call lane to clear old tool results at tier 1', async () => {
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages: oversizedToolHistory() },
    });
    const outcome = vi.fn();
    const record: SessionRecord = {
      messages: new MessageIdentities(() => 'unused'),
      append: async () => undefined,
      events: async () => [],
      history: async () => [],
    };
    const compaction = installCompaction({
      agent,
      record,
      contextWindow: 8192,
      summarize: async () => 'summary should not be needed',
      onCompaction: outcome,
    });

    const compacted = await compaction.transformContext(agent.state.messages);

    expect(compacted.slice(0, 2).map((message) => JSON.stringify(message))).toEqual([
      expect.stringContaining('[Old tool result content cleared]'),
      expect.stringContaining('[Old tool result content cleared]'),
    ]);
    expect(compacted.slice(-5)).toEqual(agent.state.messages.slice(-5));
    expect(agent.state.messages[0]).toHaveProperty('content.0.text', 'x'.repeat(24_000));
    expect(outcome).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'tool_result_clearing', cleared: 2, evicted: 0 }),
    );
  });

  it('matches the transitional compactable-tool set', async () => {
    const messages: AgentMessage[] = [
      ...oversizedToolHistory('get_kernel_result'),
      {
        role: 'toolResult',
        toolCallId: 'edit-call',
        toolName: 'edit_file',
        content: [{ type: 'text', text: 'edit result stays' }],
        isError: false,
        timestamp: 8,
      },
    ];
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const summarize = vi.fn(async () => 'summary should not be needed');
    const compaction = installCompaction({
      agent,
      record: {
        messages: new MessageIdentities(() => 'unused'),
        append: async () => undefined,
        events: async () => [],
        history: async () => [],
      },
      contextWindow: 8192,
      summarize,
    });

    const compacted = await compaction.transformContext(messages);

    expect(JSON.stringify(compacted.slice(0, 2))).toContain('[Old tool result content cleared]');
    expect(compacted.at(-1)).toEqual(messages.at(-1));
    expect(summarize).not.toHaveBeenCalled();
  });

  it('carries a first-call tier-2 plan into the durable between-turn seam', async () => {
    const messages: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: `${index === 0 ? '<system-reminder>keep</system-reminder>' : ''}${String(index).repeat(4000)}`,
      timestamp: index,
    }));
    const identities = new MessageIdentities(() => 'summary-id');
    for (const [index, message] of messages.entries()) {
      identities.set(message, `message-${index}`);
    }
    const append = vi.fn(async () => undefined);
    const record: SessionRecord = {
      messages: identities,
      append,
      events: async () => [],
      history: async () => [],
    };
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const summarize = vi.fn(async () => 'Earlier context summary.');
    const compaction = installCompaction({ agent, record, contextWindow: 8192, summarize });

    const ephemeral = await compaction.transformContext(messages);
    const assistant: AssistantMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Continue.' }],
      api: stubModel.api,
      provider: stubModel.provider,
      model: stubModel.id,
      usage: {
        input: 100,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 101,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: 9,
    };
    const prepare = agent.prepareNextTurn;
    if (!prepare) {
      throw new Error('Compaction did not install the durable pi seam.');
    }
    agent.state.messages = [...messages, assistant];
    const prepared = await prepare();

    expect(JSON.stringify(ephemeral)).toContain('<summary>');
    expect(JSON.stringify(ephemeral)).toContain('<system-reminder>keep</system-reminder>');
    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({ keepContextTags: ['<system-reminder>'] }));
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'history.compacted',
        evictedMessageIds: ['message-1', 'message-2', 'message-3', 'message-4', 'message-5', 'message-6'],
      }),
    );
    expect(prepared?.context?.messages.at(-1)).toBe(assistant);
    expect(agent.state.messages).toEqual(prepared?.context?.messages);
  });

  it('uses pi token-budgeted turn cut points instead of retaining a fixed message count', async () => {
    const messages: UserMessage[] = Array.from({ length: 10 }, (_, index) => ({
      role: 'user',
      content: `${index}-${'x'.repeat(4000)}`,
      timestamp: index,
    }));
    const summarize = vi.fn(async (_input: Parameters<CompactionSummarizer>[0]) => 'Token-budgeted summary.');
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const compaction = installCompaction({
      agent,
      record: {
        messages: new MessageIdentities(() => 'unused'),
        append: async () => undefined,
        events: async () => [],
        history: async () => [],
      },
      contextWindow: 8192,
      summarize,
    });

    await compaction.transformContext(messages);

    expect(summarize.mock.calls[0]?.[0].messages).toHaveLength(9);
  });

  it('uses pi summary prompts, update context, serialization clamp, and Tau file-operation mappings', async () => {
    const previousSummary = 'Previous durable work.\n<system-reminder>keep</system-reminder>';
    const messages: AgentMessage[] = [
      { role: 'user', content: `<summary>\n${previousSummary}\n</summary>`, timestamp: 0 },
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'edit-call',
            name: 'edit_file',
            arguments: { targetFile: 'edited.ts', oldString: 'x'.repeat(8000), newString: 'done' },
          },
          { type: 'toolCall', id: 'read-call', name: 'read_file', arguments: { targetFile: 'read-only.ts' } },
        ],
        api: stubModel.api,
        provider: stubModel.provider,
        model: stubModel.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'toolUse',
        timestamp: 1,
      },
      {
        role: 'toolResult',
        toolCallId: 'edit-call',
        toolName: 'edit_file',
        content: [{ type: 'text', text: 'result-'.repeat(1000) }],
        isError: false,
        timestamp: 2,
      },
      ...Array.from(
        { length: 8 },
        (_, index): UserMessage => ({
          role: 'user',
          content: `${index}-${'z'.repeat(4000)}`,
          timestamp: index + 3,
        }),
      ),
    ];
    let summaryContext: Context | undefined;
    const models = {
      completeSimple: vi.fn(async (_model, context: Context): Promise<AssistantMessage> => {
        summaryContext = context;
        return {
          role: 'assistant',
          content: [{ type: 'text', text: 'Updated durable summary.' }],
          api: stubModel.api,
          provider: stubModel.provider,
          model: stubModel.id,
          usage: {
            input: 10,
            output: 4,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 14,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: 12,
        };
      }),
    } as unknown as Models;
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const compaction = installCompaction({
      agent,
      record: {
        messages: new MessageIdentities(() => 'unused'),
        append: async () => undefined,
        events: async () => [],
        history: async () => [],
      },
      contextWindow: 8192,
      models,
    });

    const compacted = await compaction.transformContext(messages);
    const prompt = JSON.stringify(summaryContext?.messages ?? []);

    expect(summaryContext?.systemPrompt).toBe(
      'You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.\n\nDo NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.',
    );
    expect(prompt).toContain(
      String.raw`<previous-summary>\nPrevious durable work.\n<system-reminder>keep</system-reminder>\n</previous-summary>`,
    );
    expect(prompt).toContain('NEW conversation messages');
    expect(prompt).toContain('more characters truncated');
    expect(JSON.stringify(compacted)).toContain(String.raw`<read-files>\nread-only.ts\n</read-files>`);
    expect(JSON.stringify(compacted)).toContain(String.raw`<modified-files>\nedited.ts\n</modified-files>`);
  });

  it("encodes known compaction failures in pi's error stream", async () => {
    const messages: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: String(index).repeat(4000),
      timestamp: index,
    }));
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const compaction = installCompaction({
      agent,
      record: {
        messages: new MessageIdentities(() => 'unused'),
        append: async () => undefined,
        events: async () => [],
        history: async () => [],
      },
      contextWindow: 8192,
    });
    const base = vi.fn() as unknown as Parameters<typeof compaction.wrapStreamFn>[0];

    expect(await compaction.transformContext(messages)).toBe(messages);
    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages });
    const result = await stream.result();

    expect(base).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      stopReason: 'error',
      errorMessage: 'Tier-two compaction requires the session model summarizer.',
    });
  });

  /*
   * `NO_EVICTABLE_HISTORY` is the token-budget refusal, and the chat surfaces
   * it as "this chat's first message is too large to continue — start a new
   * chat and attach less". A session-log integrity refusal cannot be answered
   * that way, so it must not borrow that code.
   */
  it('should not code a session-log integrity refusal as an oversized turn', async () => {
    const messages: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: String(index).repeat(4000),
      timestamp: index,
    }));
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const compaction = installCompaction({
      agent,
      record: {
        // Nothing was ever recorded, so the durable eviction cannot name a
        // single message it is about to evict.
        messages: new MessageIdentities(() => 'unused'),
        append: async () => undefined,
        events: async () => [],
        history: async () => [],
      },
      contextWindow: 8192,
      summarize: async () => 'durable summary',
    });
    const base = vi.fn() as unknown as Parameters<typeof compaction.wrapStreamFn>[0];

    expect(await compaction.prepareTurn(messages)).toBe(messages);
    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages });
    const result = await stream.result();

    expect(base).not.toHaveBeenCalled();
    expect(result.errorMessage).toBe('Durable compacted history has missing session-log ids.');
    expect(result.diagnostics?.[0]).toMatchObject({ error: { code: 'SESSION_LOG_INTEGRITY' } });
  });

  it('should evict durable assistant, tool-input, and tool-output rows as one tier-2 group', async () => {
    const file = createMemoryEventLogFile();
    const seedLog = await file.open();
    const base = (sequence: number) =>
      ({
        version: 1,
        leaderEpoch: 'seed-epoch',
        sequence,
        recordedAt: '2026-09-01T00:00:00.000Z',
        runId: 'seed-run',
      }) as const;
    const seedEvents: AgentLogEvent[] = [];
    for (let index = 0; index < 6; index++) {
      const callId = `call-${index}`;
      seedEvents.push(
        {
          ...base(seedEvents.length),
          type: 'message.appended',
          message: {
            id: `assistant-${index}`,
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: callId,
                name: 'edit_file',
                arguments: { targetFile: 'main.ts', oldString: 'x'.repeat(8000), newString: `${index}` },
              },
            ],
            metadata: { api: 'openai-responses', provider: 'stub', model: 'stub', stopReason: 'toolUse' },
          },
        },
        {
          ...base(seedEvents.length + 1),
          type: 'message.appended',
          message: {
            id: `input-${index}`,
            role: 'tool-input',
            toolCallId: callId,
            toolName: 'edit_file',
            content: { targetFile: 'main.ts', oldString: 'x'.repeat(8000), newString: `${index}` },
          },
        },
        {
          ...base(seedEvents.length + 2),
          type: 'message.appended',
          message: {
            id: `output-${index}`,
            role: 'tool-output',
            toolCallId: callId,
            toolName: 'edit_file',
            content: { changed: true },
            isError: false,
          },
        },
      );
    }
    for (const event of seedEvents) {
      // oxlint-disable-next-line no-await-in-loop -- The fixture seeds one physical JSONL sequence.
      await seedLog.append(event);
    }
    await seedLog.close();

    const noTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: null, isError: false }) };
    let firstId = 0;
    const first = await createAgentSession({
      chatId: 'chat-tier-2',
      runId: 'run-tier-2',
      leaderEpoch: 'tier-2-epoch',
      systemPrompt: 'system',
      model: { id: 'stub', contextWindow: 8192 },
      modelTransport: {
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          yield { type: 'text-delta', text: 'after compaction' };
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
      toolRegistry: noTools,
      eventLog: await file.open(),
      summarize: async () => 'durable summary',
      createId: () => `generated-${firstId++}`,
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });
    await first.prompt({ id: 'turn-tier-2', role: 'user', content: 'continue' });
    await first.close();

    const inspect = await file.open();
    const compactedEvents = await inspect.read();
    const compacted = compactedEvents.find((event) => event.type === 'history.compacted');
    if (compacted?.type !== 'history.compacted') {
      throw new Error('Tier-two compaction did not persist its durable projection.');
    }
    expect(compacted.evictedMessageIds).toEqual([
      'assistant-0',
      'input-0',
      'output-0',
      'assistant-1',
      'input-1',
      'output-1',
      'assistant-2',
      'input-2',
      'output-2',
      'assistant-3',
      'input-3',
      'output-3',
      'assistant-4',
      'input-4',
      'output-4',
    ]);
    expect(compacted.evictedMessageIds).not.toContain('input-5');
    expect(reduceEventLog(compactedEvents).map((message) => message.id)).toEqual([
      'generated-0',
      'assistant-5',
      'input-5',
      'output-5',
      'turn-tier-2',
      'generated-1',
    ]);
    await inspect.close();

    const requests: ModelStreamRequest[] = [];
    const secondTransport: ModelTransport = {
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        yield { type: 'completed', stopReason: 'stop' };
      },
    };
    const second = await createAgentSession({
      chatId: 'chat-tier-2',
      runId: 'run-after-tier-2',
      leaderEpoch: 'after-tier-2-epoch',
      systemPrompt: 'system',
      model: { id: 'stub', contextWindow: 200_000 },
      modelTransport: secondTransport,
      toolRegistry: noTools,
      eventLog: await file.open(),
      createId: () => 'after-tier-2-assistant',
      now: () => new Date('2026-09-01T00:00:01.000Z'),
    });
    await second.prompt({ id: 'turn-after-tier-2', role: 'user', content: 'use compacted history' });

    expect(requests[0]?.messages.map((message) => message.id)).toEqual([
      'generated-0',
      'assistant-5',
      'input-5',
      'output-5',
      'turn-tier-2',
      'generated-1',
      'turn-after-tier-2',
    ]);
    expect(requests[0]?.messages.filter((message) => message.role === 'tool-input')).toEqual([
      expect.objectContaining({ id: 'input-5', toolCallId: 'call-5', toolName: 'edit_file' }),
    ]);
    await second.close();
  });

  /*
   * Required compaction fails closed on its *commit* leg too. A tier-two
   * projection that cannot be recorded must stop the turn, not run it: the
   * model would otherwise be prompted with a compacted history the durable log
   * never learned about, and the next reader would replay a different turn.
   */
  it('should reach no provider dispatch when a tier-two persist cannot be recorded', async () => {
    const file = createMemoryEventLogFile();
    const seedLog = await file.open();
    const base = (sequence: number) =>
      ({
        version: 1,
        leaderEpoch: 'fail-closed-epoch',
        sequence,
        recordedAt: '2026-09-01T00:00:00.000Z',
        runId: 'run-fail-closed',
      }) as const;
    const seedEvents: AgentLogEvent[] = [];
    for (let index = 0; index < 6; index++) {
      const callId = `call-${index}`;
      seedEvents.push(
        {
          ...base(seedEvents.length),
          type: 'message.appended',
          message: {
            id: `assistant-${index}`,
            role: 'assistant',
            content: [
              {
                type: 'toolCall',
                id: callId,
                name: 'edit_file',
                arguments: { targetFile: 'main.ts', oldString: 'x'.repeat(8000), newString: `${index}` },
              },
            ],
            metadata: { api: 'openai-responses', provider: 'stub', model: 'stub', stopReason: 'toolUse' },
          },
        },
        {
          ...base(seedEvents.length + 1),
          type: 'message.appended',
          message: {
            id: `input-${index}`,
            role: 'tool-input',
            toolCallId: callId,
            toolName: 'edit_file',
            content: { targetFile: 'main.ts', oldString: 'x'.repeat(8000), newString: `${index}` },
          },
        },
        {
          ...base(seedEvents.length + 2),
          type: 'message.appended',
          message: {
            id: `output-${index}`,
            role: 'tool-output',
            toolCallId: callId,
            toolName: 'edit_file',
            content: { changed: true },
            isError: false,
          },
        },
      );
    }
    for (const event of seedEvents) {
      // oxlint-disable-next-line no-await-in-loop -- The fixture seeds one physical JSONL sequence.
      await seedLog.append(event);
    }
    await seedLog.close();

    const dispatched: ModelStreamRequest[] = [];
    const opened = await file.open();
    const session = await createAgentSession({
      chatId: 'chat-fail-closed',
      runId: 'run-fail-closed',
      leaderEpoch: 'fail-closed-run-epoch',
      systemPrompt: 'system',
      model: { id: 'stub', contextWindow: 8192 },
      modelTransport: {
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          dispatched.push(request);
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      eventLog: {
        ...opened,
        append: async (event) => {
          if (event.type === 'history.compacted') {
            throw new Error('injected durable failure');
          }
          return opened.append(event);
        },
      },
      summarize: async () => 'durable summary',
      createId: () => 'fail-closed-id',
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    await expect(session.prompt({ id: 'turn-fail-closed', role: 'user', content: 'continue' })).rejects.toThrow(
      'injected durable failure',
    );
    expect(dispatched).toEqual([]);
    await session.close();
  });

  it('should invalidate a pending compaction when a same-length prefix has different stable ids', async () => {
    const original: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: `A-${index}-${'x'.repeat(4000)}`,
      timestamp: index,
    }));
    const replacement: UserMessage = { role: 'user', content: `B-${'x'.repeat(4000)}`, timestamp: 0 };
    const changed = [replacement, ...original.slice(1)];
    const identities = new MessageIdentities(() => 'summary-id');
    for (const [index, message] of original.entries()) {
      identities.set(message, `original-${index}`);
    }
    identities.set(replacement, 'replacement-0');
    const append = vi.fn(async () => undefined);
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages: original },
    });
    const summarize = vi.fn(async ({ messages }: { readonly messages: readonly AgentMessage[] }) =>
      JSON.stringify(messages[0]).includes('B-') ? 'summary B' : 'summary A',
    );
    const compaction = installCompaction({
      agent,
      record: { messages: identities, append, events: async () => [], history: async () => [] },
      contextWindow: 8192,
      summarize,
    });
    await compaction.transformContext(original);
    const prepare = agent.prepareNextTurn;
    if (!prepare) {
      throw new Error('Compaction did not install the durable pi seam.');
    }
    agent.state.messages = changed;
    const prepared = await prepare();

    expect(summarize).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(prepared?.context?.messages)).toContain('summary B');
    expect(JSON.stringify(prepared?.context?.messages)).not.toContain('summary A');
  });

  it('should compose the prior turn-preparation hook before selecting and persisting compaction', async () => {
    const messages: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: `${index}-${'x'.repeat(4000)}`,
      timestamp: index,
    }));
    const marker: UserMessage = {
      role: 'user',
      content: '<system-reminder>prior hook marker</system-reminder>',
      timestamp: 99,
    };
    const identities = new MessageIdentities(() => 'summary-id');
    for (const [index, message] of messages.entries()) {
      identities.set(message, `message-${index}`);
    }
    identities.set(marker, 'prior-marker');
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    agent.prepareNextTurn = async () => ({
      context: {
        systemPrompt: agent.state.systemPrompt,
        messages: [marker, ...agent.state.messages],
        tools: agent.state.tools,
      },
    });
    const append = vi.fn(async () => undefined);
    const compaction = installCompaction({
      agent,
      record: { messages: identities, append, events: async () => [], history: async () => [] },
      contextWindow: 8192,
      summarize: async () => 'summary after prior hook',
    });
    await compaction.transformContext(messages);
    const prepared = await agent.prepareNextTurn();
    if (!prepared?.context) {
      throw new Error('Compaction did not return the final prepared context.');
    }

    expect(JSON.stringify(prepared.context.messages)).toContain('prior hook marker');
    expect(agent.state.messages).toEqual(prepared.context.messages);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'history.compacted' }));
  });

  it('should persist an emergency overflow projection before retrying the model', async () => {
    const messages: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: `${index}-${'x'.repeat(4000)}`,
      timestamp: index,
    }));
    const identities = new MessageIdentities(() => 'emergency-summary');
    for (const [index, message] of messages.entries()) {
      identities.set(message, `emergency-${index}`);
    }
    const append = vi.fn(async () => undefined);
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const compaction = installCompaction({
      agent,
      record: { messages: identities, append, events: async () => [], history: async () => [] },
      contextWindow: 8192,
      summarize: async () => 'emergency summary',
    });
    let calls = 0;
    const base = vi.fn(() => {
      calls++;
      const stream = createAssistantMessageEventStream();
      const stopReason: 'length' | 'stop' = calls === 1 ? 'length' : 'stop';
      const message: AssistantMessage = {
        role: 'assistant',
        content: [],
        api: stubModel.api,
        provider: stubModel.provider,
        model: stubModel.id,
        usage: {
          input: calls === 1 ? 8192 : 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: calls === 1 ? 8192 : 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason,
        timestamp: 0,
      };
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: stopReason, message });
      return stream;
    });

    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages });
    const result = await stream.result();

    expect(result.stopReason).toBe('stop');
    expect(base).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'history.compacted' }));
  });

  /*
   * A chat whose whole history is one oversized turn has no earlier turn to
   * evict, so rolling pi's cut back to the turn start leaves an empty prefix
   * and the turn was refused. Summarise the turn's head instead — pi's
   * `prepareCompaction` splits a turn the same way — and keep every retained
   * tool result paired with the call that produced it.
   */
  it('should evict the head of a single oversized turn instead of refusing', async () => {
    const messages: AgentMessage[] = [{ role: 'user', content: 'model the bracket', timestamp: 0 }];
    for (let index = 0; index < 6; index++) {
      messages.push(
        {
          role: 'assistant',
          content: [
            {
              type: 'toolCall',
              id: `call-${index}`,
              name: 'edit_file',
              arguments: { targetFile: 'main.ts', oldString: 'x'.repeat(4000), newString: String(index) },
            },
          ],
          api: stubModel.api,
          provider: stubModel.provider,
          model: stubModel.id,
          usage: {
            input: 1400 * (index + 1),
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 1400 * (index + 1),
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'toolUse',
          timestamp: index * 2 + 1,
        },
        {
          role: 'toolResult',
          toolCallId: `call-${index}`,
          toolName: 'edit_file',
          content: [{ type: 'text', text: 'y'.repeat(2000) }],
          isError: false,
          timestamp: index * 2 + 2,
        },
      );
    }
    const identities = new MessageIdentities(() => 'single-turn-summary');
    for (const [index, message] of messages.entries()) {
      identities.set(message, `single-turn-${index}`);
    }
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const outcomes: CompactionOutcome[] = [];
    const compaction = installCompaction({
      agent,
      record: { messages: identities, append: async () => undefined, events: async () => [], history: async () => [] },
      contextWindow: 8192,
      summarize: async () => 'Head of the oversized turn.',
      onCompaction: (outcome) => outcomes.push(outcome),
    });

    const prepared = await compaction.prepareTurn(messages);

    expect(outcomes[0]?.tier).toBe('summarization');
    expect(outcomes[0]?.evicted).toBeGreaterThan(0);
    expect(JSON.stringify(prepared[0])).toContain('<summary>');
    const keptCallIds = new Set(
      prepared.flatMap((message) =>
        message.role === 'assistant'
          ? message.content.flatMap((block) => (block.type === 'toolCall' ? [block.id] : []))
          : [],
      ),
    );
    expect(
      prepared.filter((message) => message.role === 'toolResult').map((message) => message.toolCallId),
    ).not.toEqual([]);
    for (const message of prepared) {
      if (message.role === 'toolResult') {
        expect(keptCallIds).toContain(message.toolCallId);
      }
    }
  });

  /*
   * Provider usage measures the request that produced it, so a retained
   * assistant keeps reporting the context the provider saw *before* the
   * eviction. Reusing that number verbatim made every post-summary check see a
   * context that no longer exists: the strike counter landed on 2 after one
   * successful summarization and the same turn's ephemeral lane opened the
   * circuit breaker. All three live compaction rows of the provider-switch
   * suite died this way.
   */
  it('should summarize once and reach the provider when the retained tail carries provider usage', async () => {
    const history: AgentMessage[] = [
      ...evictableHistory(6),
      answeredTurn(7000, 6),
      { role: 'user', content: 'now mirror the bracket', timestamp: 7 },
    ];
    const agent = new Agent({
      streamFn: dispatchedStream,
      initialState: { model: stubModel, messages: history },
    });
    const summarize = vi.fn(async () => 'Earlier work.');
    const compaction = installCompaction({
      agent,
      record: recordFor(history),
      contextWindow: 8192,
      summarize,
    });
    const base = vi.fn(dispatchedStream) as unknown as Parameters<typeof compaction.wrapStreamFn>[0];

    const prepared = await compaction.prepareTurn(history);
    const transformed = await compaction.transformContext(prepared);
    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages: transformed as Context['messages'] });
    const result = await stream.result();

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(transformed)).toContain('<summary>');
    expect(result.errorMessage).toBeUndefined();
    expect(base).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ stopReason: 'stop' });
  });

  it('should clear tool results at tier one when the retained tail carries provider usage', async () => {
    const history: AgentMessage[] = [
      ...Array.from(
        { length: 7 },
        (_, index): AgentMessage => ({
          role: 'toolResult',
          toolCallId: `call-${index}`,
          toolName: 'read_file',
          content: [{ type: 'text', text: index < 2 ? 'x'.repeat(8000) : `small-${index}` }],
          isError: false,
          timestamp: index,
        }),
      ),
      answeredTurn(7000, 7),
    ];
    const agent = new Agent({
      streamFn: dispatchedStream,
      initialState: { model: stubModel, messages: history },
    });
    const summarize = vi.fn(async () => 'summary should not be needed');
    const outcome = vi.fn();
    const compaction = installCompaction({
      agent,
      record: recordFor(history),
      contextWindow: 8192,
      summarize,
      onCompaction: outcome,
    });

    await compaction.prepareTurn(history);

    expect(outcome).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'tool_result_clearing', cleared: 2, evicted: 0 }),
    );
    expect(summarize).not.toHaveBeenCalled();
  });

  it('should take a turn on a session reloaded from a log that already holds its summary', async () => {
    const identities = new MessageIdentities(() => 'unused');
    const durable: Array<UserProviderMessage | AssistantProviderMessage> = [
      {
        id: 'summary-1',
        role: 'user',
        content: '<summary>\nEarlier work.\n</summary>',
        metadata: { timestamp: 20 },
      },
      {
        id: 'assistant-9',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        metadata: {
          api: stubModel.api,
          provider: stubModel.provider,
          model: stubModel.id,
          stopReason: 'stop',
          usage: providerUsage(7000),
          timestamp: 10,
        },
      },
      { id: 'user-10', role: 'user', content: 'keep going', metadata: { timestamp: 21 } },
    ];
    const reloaded = durable.map((message) => providerMessageToPi(message, stubModel, identities));
    const agent = new Agent({
      streamFn: dispatchedStream,
      initialState: { model: stubModel, messages: reloaded },
    });
    const summarize = vi.fn(async () => 'summary should not be needed');
    const compaction = installCompaction({
      agent,
      record: { messages: identities, append: async () => undefined, events: async () => [], history: async () => [] },
      contextWindow: 8192,
      summarize,
    });
    const base = vi.fn(dispatchedStream) as unknown as Parameters<typeof compaction.wrapStreamFn>[0];

    const prepared = await compaction.prepareTurn(reloaded);
    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages: prepared as Context['messages'] });
    const result = await stream.result();

    expect(summarize).not.toHaveBeenCalled();
    expect(prepared).toEqual(reloaded);
    expect(base).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ stopReason: 'stop' });
  });

  /*
   * The breaker is a real invariant: a context whose irreducible per-call
   * overhead already fills the window cannot be summarized back into headroom,
   * and Tau stops rather than burning provider calls on it.
   */
  it('should still open the circuit breaker when compaction cannot restore headroom', async () => {
    const history: AgentMessage[] = [
      ...evictableHistory(2),
      answeredTurn(9000, 2),
      { role: 'user', content: 'keep going', timestamp: 3 },
    ];
    const agent = new Agent({
      streamFn: dispatchedStream,
      initialState: { model: stubModel, messages: history },
    });
    const summarize = vi.fn(async () => 'Earlier work.');
    const compaction = installCompaction({
      agent,
      record: recordFor(history),
      contextWindow: 8192,
      summarize,
    });
    const base = vi.fn(dispatchedStream) as unknown as Parameters<typeof compaction.wrapStreamFn>[0];

    const prepared = await compaction.prepareTurn(history);
    const transformed = await compaction.transformContext(prepared);
    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages: transformed as Context['messages'] });
    const result = await stream.result();

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(base).not.toHaveBeenCalled();
    expect(result.errorMessage).toBe('Repeated compaction could not restore provider headroom; start a new thread.');
    expect(result.diagnostics?.[0]).toMatchObject({ error: { code: 'CIRCUIT_BREAKER_OPEN' } });
  });
});
