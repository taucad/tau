import { describe, expect, it, vi } from 'vitest';
import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type { AssistantMessage, Context, Models, UserMessage } from '@earendil-works/pi-ai';
import { installCompaction } from '#harness/compaction.js';
import type { CompactionOutcome, CompactionSummarizer } from '#harness/compaction.js';
import { createAgentSession } from '#harness/session.js';
import { createMemoryEventLogFile, stubModel } from '#harness/harness.fixture.js';
import {
  createSessionRecord,
  MessageIdentities,
  piMessageToProvider,
  providerMessageToPi,
} from '#harness/session-record.js';
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

const recordFor = (
  messages: readonly AgentMessage[],
  append: SessionRecord['append'] = async () => undefined,
): SessionRecord => {
  let nextId = 0;
  const identities = new MessageIdentities(() => `generated-${nextId++}`);
  for (const [index, message] of messages.entries()) {
    identities.set(message, `message-${index}`);
  }
  const history = messages.map((message) => piMessageToProvider(message, identities));
  return { messages: identities, append, events: async () => [], history: async () => history };
};

const evictableHistory = (count: number): UserMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    role: 'user',
    content: `${index}-${'x'.repeat(4000)}`,
    timestamp: index,
  }));

describe('Compaction', () => {
  it('uses durable turn preparation to clear old tool results at tier 1', async () => {
    const messages = oversizedToolHistory();
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const outcome = vi.fn();
    const record = recordFor(messages);
    const compaction = installCompaction({
      agent,
      record,
      projectHistory: async () => messages,
      contextWindow: 8192,
      summarize: async () => 'summary should not be needed',
      onCompaction: outcome,
    });

    const compacted = await compaction.prepareTurn();

    expect(compacted.slice(0, 2).map((message) => JSON.stringify(message))).toEqual([
      expect.stringContaining('[Old tool result content cleared]'),
      expect.stringContaining('[Old tool result content cleared]'),
    ]);
    expect(compacted.slice(-5)).toEqual(agent.state.messages.slice(-5));
    expect(agent.state.messages).toEqual(compacted);
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
      record: recordFor(messages),
      projectHistory: async () => messages,
      contextWindow: 8192,
      summarize,
    });

    const compacted = await compaction.prepareTurn();

    expect(JSON.stringify(compacted.slice(0, 2))).toContain('[Old tool result content cleared]');
    expect(compacted.at(-1)).toEqual(messages.at(-1));
    expect(summarize).not.toHaveBeenCalled();
  });

  it('should skip tier-one persistence when clearing does not restore one recent-window of headroom', async () => {
    const messages: AgentMessage[] = [
      ...Array.from(
        { length: 7 },
        (_, index): AgentMessage => ({
          role: 'toolResult',
          toolCallId: `hysteresis-${index}`,
          toolName: 'read_file',
          content: [{ type: 'text', text: 'x'.repeat(index < 2 ? 5000 : 4600) }],
          isError: false,
          timestamp: index,
        }),
      ),
      { role: 'user', content: 'continue', timestamp: 8 },
    ];
    const appended: Array<Parameters<SessionRecord['append']>[0]> = [];
    const append: SessionRecord['append'] = async (event) => {
      appended.push(event);
    };
    const summarize = vi.fn(async () => 'Tier two restored durable headroom.');
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const compaction = installCompaction({
      agent,
      record: recordFor(messages, append),
      projectHistory: async () => messages,
      contextWindow: 8192,
      summarize,
    });

    await compaction.prepareTurn();

    expect(summarize).toHaveBeenCalledOnce();
    const compacted = appended.find((event) => event.type === 'history.compacted');
    expect(compacted?.type).toBe('history.compacted');
    if (compacted?.type !== 'history.compacted') {
      throw new Error('Expected tier-two compaction to be persisted.');
    }
    expect(compacted.details).toMatchObject({
      lane: 'start_of_turn',
      tier: 'summarization',
      summarizerAttempts: 1,
      summarizerUsage: null,
    });
    expect(compacted.details?.tokensBefore).toBeTypeOf('number');
    expect(compacted.details?.tokensAfter).toBeTypeOf('number');
    expect(compacted.details?.evicted).toBeTypeOf('number');
    expect(appended.some((event) => event.type === 'message.envelope-replaced')).toBe(false);
  });

  it('preserves tagged context in durable between-turn compaction', async () => {
    const messages: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: `${index === 0 ? '<system-reminder>keep</system-reminder>' : ''}${String(index).repeat(4000)}`,
      timestamp: index,
    }));
    const append = vi.fn(async () => undefined);
    const record = recordFor(messages, append);
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const summarize = vi.fn(async () => 'Earlier context summary.');
    installCompaction({
      agent,
      record,
      projectHistory: async () => messages,
      contextWindow: 8192,
      summarize,
    });
    const prepare = agent.prepareNextTurn;
    if (!prepare) {
      throw new Error('Compaction did not install the durable pi seam.');
    }
    const prepared = await prepare();

    expect(JSON.stringify(prepared?.context?.messages)).toContain('<summary>');
    expect(JSON.stringify(prepared?.context?.messages)).toContain('<system-reminder>keep</system-reminder>');
    expect(summarize).toHaveBeenCalledWith(expect.objectContaining({ keepContextTags: ['<system-reminder>'] }));
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'history.compacted',
        evictedMessageIds: ['message-1', 'message-2'],
      }),
    );
    expect(agent.state.messages).toEqual(prepared?.context?.messages);
  });

  it('should preserve only the newest safety block verbatim across two compactions', async () => {
    const file = createMemoryEventLogFile();
    const log = await file.open();
    const oldSafety = '<safety>old safety rule</safety>';
    const newestSafety = '<safety>newest safety rule</safety>';
    const seeded: AgentLogEvent[] = Array.from({ length: 10 }, (_, sequence) => ({
      version: 1,
      leaderEpoch: 'seed-epoch',
      sequence,
      recordedAt: '2026-09-20T00:00:00.000Z',
      runId: 'seed-run',
      type: 'message.appended',
      message: {
        id: `safety-${sequence}`,
        role: 'user',
        content: `${sequence === 0 ? oldSafety : sequence === 4 ? newestSafety : ''}${'x'.repeat(4000)}`,
      },
    }));
    for (const event of seeded) {
      // oxlint-disable-next-line no-await-in-loop -- The fixture seeds one ordered log.
      await log.append(event);
    }
    const record = await createSessionRecord({
      log,
      runId: 'safety-run',
      leaderEpoch: 'safety-epoch',
      createId: (() => {
        let id = 0;
        return () => `safety-summary-${id++}`;
      })(),
      now: () => '2026-09-20T00:00:01.000Z',
    });
    const projectHistory = async () => {
      const durable = await record.history();
      return durable
        .map((message) => providerMessageToPi(message, stubModel, record.messages))
        .filter((message): message is AgentMessage => message !== undefined);
    };
    const initial = await projectHistory();
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages: initial },
    });
    const compaction = installCompaction({
      agent,
      record,
      projectHistory,
      contextWindow: 8192,
      summarize: async () => 'Earlier work.',
    });

    await compaction.prepareTurn();
    for (let index = 0; index < 7; index++) {
      // oxlint-disable-next-line no-await-in-loop -- The second cycle is built as ordered durable history.
      await record.append({
        type: 'message.appended',
        message: piMessageToProvider(
          { role: 'user', content: `later-${index}-${'y'.repeat(4000)}`, timestamp: 20 + index },
          record.messages,
        ),
      });
    }
    await compaction.prepareTurn();

    const history = JSON.stringify(await record.history());
    expect(history).toContain(newestSafety);
    expect(history).not.toContain(oldSafety);
    expect(history.match(new RegExp(newestSafety, 'gu'))).toHaveLength(1);
    const events = await record.events();
    expect(events.filter((event) => event.type === 'history.compacted')).toHaveLength(2);
    await log.close();
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
      record: recordFor(messages),
      projectHistory: async () => messages,
      contextWindow: 8192,
      summarize,
    });

    await compaction.prepareTurn();

    expect(summarize.mock.calls[0]?.[0].messages).toHaveLength(4);
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
      record: recordFor(messages),
      projectHistory: async () => messages,
      contextWindow: 8192,
      models,
    });

    const compacted = await compaction.prepareTurn();
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

  it('uses a placeholder when no compaction summarizer is configured', async () => {
    const messages: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: String(index).repeat(4000),
      timestamp: index,
    }));
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const appended: Array<Parameters<SessionRecord['append']>[0]> = [];
    const append: SessionRecord['append'] = async (event) => {
      appended.push(event);
    };
    const compaction = installCompaction({
      agent,
      record: recordFor(messages, append),
      projectHistory: async () => messages,
      contextWindow: 8192,
    });

    const prepared = await compaction.prepareTurn();

    expect(JSON.stringify(prepared)).toContain(
      'Compaction could not summarize 2 messages spanning 2 turns. The project files are the source of truth for the current work.',
    );
    const compacted = appended.find((event) => event.type === 'history.compacted');
    expect(compacted?.type === 'history.compacted' && compacted.details?.summary).toBe('placeholder');
  });

  it('should not open the circuit breaker after repeated non-headroom refusals', async () => {
    const messages = evictableHistory(8);
    const record = recordFor(messages, async (event) => {
      if (event.type === 'history.compacted') {
        throw new Error('durable compaction append rejected');
      }
    });
    const agent = new Agent({
      streamFn: dispatchedStream,
      initialState: { model: stubModel, messages },
    });
    const compaction = installCompaction({
      agent,
      record,
      projectHistory: async () => messages,
      contextWindow: 8192,
      summarize: async () => 'Summary that cannot be persisted.',
    });
    const failures: AssistantMessage[] = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- Each refusal must clear before the next attempt.
      await compaction.prepareTurn();
      // oxlint-disable-next-line no-await-in-loop -- The failure marker is the observable result of that attempt.
      const stream = await compaction.wrapStreamFn(dispatchedStream)(stubModel, { messages });
      // oxlint-disable-next-line no-await-in-loop -- The stream result closes one refusal before the next attempt.
      failures.push(await stream.result());
    }

    expect(failures.map((failure) => failure.errorMessage)).toEqual([
      'durable compaction append rejected',
      'durable compaction append rejected',
      'durable compaction append rejected',
    ]);
    const diagnostics = JSON.stringify(failures.map((failure) => failure.diagnostics));
    expect(diagnostics).toContain('SESSION_LOG_INTEGRITY');
    expect(diagnostics).not.toContain('CIRCUIT_BREAKER_OPEN');
    expect(diagnostics).toContain('"lane":"start_of_turn"');
    expect(diagnostics).toContain('"tier":"summarization"');
    expect(diagnostics).toContain('"tokensBefore":');
    expect(diagnostics).toContain('"tokensAfter":');
    expect(diagnostics).toContain('"evicted":');
    expect(diagnostics).toContain('"summarizerUsage":null');
  });

  it('should compact the durable projection when live state has no registered identities', async () => {
    const durable: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: String(index).repeat(4000),
      timestamp: index,
    }));
    const live = durable.map((message) => ({ ...message }));
    const append = vi.fn(async () => undefined);
    const record = recordFor(durable, append);
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages: live },
    });
    const compaction = installCompaction({
      agent,
      record,
      projectHistory: async () => durable,
      contextWindow: 8192,
      summarize: async () => 'durable summary',
    });

    const prepared = await compaction.prepareTurn();

    expect(JSON.stringify(prepared)).toContain('<summary>');
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ type: 'history.compacted' }));
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
    ]);
    expect(compacted.evictedMessageIds).not.toContain('input-5');
    expect(reduceEventLog(compactedEvents).map((message) => message.id)).toEqual([
      'generated-0',
      'assistant-3',
      'input-3',
      'output-3',
      'assistant-4',
      'input-4',
      'output-4',
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
      'assistant-3',
      'input-3',
      'output-3',
      'assistant-4',
      'input-4',
      'output-4',
      'assistant-5',
      'input-5',
      'output-5',
      'turn-tier-2',
      'generated-1',
      'turn-after-tier-2',
    ]);
    expect(requests[0]?.messages.filter((message) => message.role === 'tool-input')).toEqual([
      expect.objectContaining({ id: 'input-3', toolCallId: 'call-3', toolName: 'edit_file' }),
      expect.objectContaining({ id: 'input-4', toolCallId: 'call-4', toolName: 'edit_file' }),
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

    await session.prompt({ id: 'turn-fail-closed', role: 'user', content: 'continue' });
    expect(dispatched).toEqual([]);
    expect(await session.snapshot()).toMatchObject({
      state: 'failed',
      failure: { code: 'SESSION_LOG_INTEGRITY', message: 'injected durable failure' },
    });
    await session.close();
  });

  it('should select compaction from the latest durable projection', async () => {
    const original: UserMessage[] = Array.from({ length: 8 }, (_, index) => ({
      role: 'user',
      content: `A-${index}-${'x'.repeat(4000)}`,
      timestamp: index,
    }));
    const replacement: UserMessage = { role: 'user', content: `B-${'x'.repeat(4000)}`, timestamp: 0 };
    const changed = [replacement, ...original.slice(1)];
    const append = vi.fn(async () => undefined);
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages: original },
    });
    const summarize = vi.fn(async ({ messages }: { readonly messages: readonly AgentMessage[] }) =>
      JSON.stringify(messages[0]).includes('B-') ? 'summary B' : 'summary A',
    );
    installCompaction({
      agent,
      record: recordFor(changed, append),
      projectHistory: async () => changed,
      contextWindow: 8192,
      summarize,
    });
    const prepare = agent.prepareNextTurn;
    if (!prepare) {
      throw new Error('Compaction did not install the durable pi seam.');
    }
    const prepared = await prepare();

    expect(summarize).toHaveBeenCalled();
    expect(summarize.mock.calls.every(([input]) => JSON.stringify(input.messages[0]).includes('B-'))).toBe(true);
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
    const durable = [marker, ...messages];
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
    installCompaction({
      agent,
      record: recordFor(durable, append),
      projectHistory: async () => durable,
      contextWindow: 8192,
      summarize: async () => 'summary after prior hook',
    });
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
    const appended: Array<Parameters<SessionRecord['append']>[0]> = [];
    const append: SessionRecord['append'] = async (event) => {
      appended.push(event);
    };
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const compaction = installCompaction({
      agent,
      record: recordFor(messages, append),
      projectHistory: async () => messages,
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
        ...(calls === 1 ? { errorMessage: 'provider overflow response body' } : {}),
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
    const compacted = appended.find((event) => event.type === 'history.compacted');
    expect(compacted?.type === 'history.compacted' ? compacted.details : undefined).toMatchObject({
      lane: 'overflow',
      tier: 'summarization',
      discardedOverflowError: 'provider overflow response body',
    });
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
    const agent = new Agent({
      streamFn: () => createAssistantMessageEventStream(),
      initialState: { model: stubModel, messages },
    });
    const outcomes: CompactionOutcome[] = [];
    const compaction = installCompaction({
      agent,
      record: recordFor(messages),
      projectHistory: async () => messages,
      contextWindow: 8192,
      summarize: async () => 'Head of the oversized turn.',
      onCompaction: (outcome) => outcomes.push(outcome),
    });

    const prepared = await compaction.prepareTurn();

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
      projectHistory: async () => history,
      contextWindow: 8192,
      summarize,
    });
    const base = vi.fn(dispatchedStream) as unknown as Parameters<typeof compaction.wrapStreamFn>[0];

    const prepared = await compaction.prepareTurn();
    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages: prepared as Context['messages'] });
    const result = await stream.result();

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(prepared)).toContain('<summary>');
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
      projectHistory: async () => history,
      contextWindow: 8192,
      summarize,
      onCompaction: outcome,
    });

    await compaction.prepareTurn();

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
      record: {
        messages: identities,
        append: async () => undefined,
        events: async () => [],
        history: async () => durable,
      },
      projectHistory: async () => reloaded,
      contextWindow: 8192,
      summarize,
    });
    const base = vi.fn(dispatchedStream) as unknown as Parameters<typeof compaction.wrapStreamFn>[0];

    const prepared = await compaction.prepareTurn();
    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages: prepared as Context['messages'] });
    const result = await stream.result();

    expect(summarize).not.toHaveBeenCalled();
    expect(prepared).toEqual(reloaded);
    expect(base).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ stopReason: 'stop' });
  });

  it('should escalate the cut within the same pass without pre-arming the circuit breaker', async () => {
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
      projectHistory: async () => history,
      contextWindow: 8192,
      summarize,
    });
    const base = vi.fn(dispatchedStream) as unknown as Parameters<typeof compaction.wrapStreamFn>[0];

    const prepared = await compaction.prepareTurn();
    const stream = await compaction.wrapStreamFn(base)(stubModel, { messages: prepared as Context['messages'] });
    const result = await stream.result();

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(1);
    expect(result.errorMessage).toBeUndefined();
    expect(result).toMatchObject({ stopReason: 'stop' });
  });
});
