import { describe, expect, it, vi } from 'vitest';
import type { Usage } from '@earendil-works/pi-ai';
import type { AgentLogEvent, LogEventBase, ProviderMessage } from '#log/event-types.js';
import { parseEventLog, serializeLogEvent } from '#log/serialization.js';
import { reduceEventLog } from '#log/reducer.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';
import { createMemoryEventLog, createMemoryEventLogFile, stubModel } from '#harness/harness.fixture.js';
import { MessageIdentities, providerMessageToPi } from '#harness/session-record.js';
import { createAgentSession, createTransportStreamFunction } from '#harness/session.js';
import { createCachedSystemPromptBlocks, GatewayModelTransportError } from '#transport/gateway-model-transport.js';

const usage = (input: number, output: number): Usage => ({
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input + output,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

const seedHistory = (): AgentLogEvent[] => {
  const events: AgentLogEvent[] = [];
  const base = (sequence: number): LogEventBase => ({
    version: 1,
    leaderEpoch: 'epoch-1',
    sequence,
    recordedAt: '2026-09-01T00:00:00.000Z',
    runId: 'run-1',
  });
  for (let index = 0; index < 7; index++) {
    const toolCallId = `old-call-${index}`;
    const assistant: ProviderMessage = {
      id: `old-assistant-${index}`,
      role: 'assistant',
      content: [{ type: 'toolCall', id: toolCallId, name: 'read_file', arguments: { targetFile: 'main.ts' } }],
      metadata: {
        api: 'openai-responses',
        provider: 'stub',
        model: 'stub-model',
        stopReason: 'toolUse',
        timestamp: index,
      },
    };
    events.push(
      { ...base(events.length), type: 'message.appended', message: assistant },
      {
        ...base(events.length + 1),
        type: 'message.appended',
        message: {
          id: `old-input-${index}`,
          role: 'tool-input',
          toolCallId,
          toolName: 'read_file',
          content: { targetFile: 'main.ts' },
        },
      },
      {
        ...base(events.length + 2),
        type: 'message.appended',
        message: {
          id: `old-output-${index}`,
          role: 'tool-output',
          toolCallId,
          toolName: 'read_file',
          content: index < 2 ? 'x'.repeat(24_000) : `small-${index}`,
          isError: false,
          metadata: { timestamp: index },
        },
      },
    );
  }
  return events;
};

class DeterministicToolCallingTransport implements ModelTransport {
  public readonly requests: ModelStreamRequest[] = [];
  private primaryCalls = 0;

  public async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    this.requests.push(request);
    if (request.systemPrompt.startsWith('Summarize the conversation')) {
      yield { type: 'text-delta', text: 'Earlier reads all targeted main.ts.' };
      yield { type: 'completed', stopReason: 'stop' };
      return;
    }

    this.primaryCalls++;
    if (this.primaryCalls === 1) {
      yield {
        type: 'tool-input',
        toolCallId: 'new-call-1',
        toolName: 'read_file',
        input: { targetFile: '/cached.ts' },
      };
      yield { type: 'usage', usage: usage(100, 10) };
      yield { type: 'completed', stopReason: 'toolUse' };
      return;
    }

    yield { type: 'text-delta', text: String.raw`Finished \(x\).` };
    yield { type: 'usage', usage: usage(80, 4) };
    yield { type: 'completed', stopReason: 'stop' };
  }
}

describe('pi full-turn parity fixture', () => {
  it('drives middleware, substituted tools, and byte-identical A1 replay through one real pi turn', async () => {
    const log = await createMemoryEventLog(seedHistory());
    const transport = new DeterministicToolCallingTransport();
    const invoke = vi.fn(async () => ({ content: { source: 'real' }, isError: false }));
    const tools: ToolRegistry = {
      list: () => [
        {
          name: 'read_file',
          description: 'Read one workspace file',
          inputSchema: {
            type: 'object',
            properties: { targetFile: { type: 'string' } },
            required: ['targetFile'],
            additionalProperties: false,
          },
        },
      ],
      invoke,
    };
    let id = 0;
    let tick = 0;
    const compactions: string[] = [];
    const session = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
      systemPrompt: 'You are a CAD agent.',
      model: { id: 'stub-model', contextWindow: 8192 },
      modelTransport: transport,
      toolRegistry: tools,
      eventLog: log,
      substituteToolResult: async (invocation) => ({
        content: { source: 'cache', input: invocation.input },
        isError: false,
      }),
      createId: () => `generated-${id++}`,
      now: () => new Date(Date.UTC(2026, 8, 1, 0, 0, tick++)),
      onCompaction: (outcome) => {
        if (outcome.tier) {
          compactions.push(outcome.tier);
        }
      },
    });

    await session.prompt({ id: 'turn-1', role: 'user', content: 'Read the cached file and finish.' });

    const events = await log.read();
    const snapshot = await session.snapshot();
    const replay = reduceEventLog(parseEventLog(events.map((event) => serializeLogEvent(event)).join('')));
    const toolInput = snapshot.messages.find(
      (message) => message.role === 'tool-input' && message.toolCallId === 'new-call-1',
    );
    const toolOutput = snapshot.messages.find(
      (message) => message.role === 'tool-output' && message.toolCallId === 'new-call-1',
    );
    const final = snapshot.messages.findLast((message) => message.role === 'assistant');
    const healedAssistant = snapshot.messages.find(
      (message) => message.role === 'assistant' && JSON.stringify(message.content).includes('new-call-1'),
    );
    const replayedAssistant = transport.requests[1]?.messages.find(
      (message) => message.role === 'assistant' && JSON.stringify(message.content).includes('new-call-1'),
    );

    expect(invoke).not.toHaveBeenCalled();
    expect(toolInput?.content).toEqual({ targetFile: 'cached.ts' });
    expect(JSON.stringify(healedAssistant?.content)).toContain('"targetFile":"cached.ts"');
    expect(JSON.stringify(replayedAssistant?.content)).toContain('"targetFile":"cached.ts"');
    expect(JSON.stringify(replayedAssistant?.content)).not.toContain('"targetFile":"/cached.ts"');
    expect(toolOutput).toMatchObject({ content: { source: 'cache' }, isError: false });
    expect(JSON.stringify(toolOutput?.content)).toContain('cached.ts');
    expect(JSON.stringify(final?.content)).toContain('Finished $x$.');
    const safeguardEvents = events.filter((event) => event.type === 'safeguard.recorded');
    const safeguardMessage = snapshot.messages.find((message) => message.id.startsWith('tau:safeguard:'));
    expect(safeguardEvents).toHaveLength(1);
    expect(safeguardEvents[0]?.type === 'safeguard.recorded' && safeguardEvents[0].action).toBe('nudge');
    expect(
      safeguardEvents[0]?.type === 'safeguard.recorded' && safeguardEvents[0].action === 'nudge'
        ? safeguardEvents[0].message.id
        : '',
    ).toMatch(/^tau:safeguard:/u);
    expect(safeguardMessage?.role).toBe('user');
    expect(JSON.stringify(safeguardMessage?.metadata?.tauInternal)).toContain('"kind":"safeguard"');
    expect(JSON.stringify(safeguardMessage?.metadata?.tauInternal)).toContain('"pruning":"preserve-until-compaction"');
    expect(JSON.stringify(transport.requests[0]?.messages)).toContain('<system-reminder>');
    expect(JSON.stringify(transport.requests[1]?.messages)).not.toContain('<system-reminder>');
    expect(compactions).toContain('tool_result_clearing');
    expect(events.filter((event) => event.type === 'message.envelope-replaced')).toHaveLength(2);
    expect(
      transport.requests[0]?.messages.some(
        (message) => message.role === 'tool-output' && message.content === '[Old tool result content cleared]',
      ),
    ).toBe(true);
    expect(events.filter((event) => event.type === 'run.lifecycle').map((event) => event.state)).toEqual([
      'admitted',
      'running',
      'completed',
    ]);
    expect(snapshot.messages.some((message) => message.role === 'tool-input')).toBe(true);
    expect(snapshot.messages.some((message) => message.role === 'tool-output')).toBe(true);
    expect(JSON.stringify(replay)).toBe(JSON.stringify(snapshot.messages));
    expect(snapshot).toMatchObject({ chatId: 'chat-1', runId: 'run-1', turnId: 'turn-1', state: 'completed' });
    await session.close();
  });

  it('should close and reopen one chat log for two independently admitted runs', async () => {
    const file = createMemoryEventLogFile();
    const requests: ModelStreamRequest[] = [];
    const transport = (text: string): ModelTransport => ({
      async *stream(request): AsyncGenerator<ModelStreamEvent> {
        requests.push(request);
        yield { type: 'text-delta', text };
        yield { type: 'usage', usage: usage(3, 1) };
        yield { type: 'completed', stopReason: 'stop' };
      },
    });
    const noTools: ToolRegistry = { list: () => [], invoke: async () => ({ content: null, isError: false }) };
    const first = await createAgentSession({
      chatId: 'chat-consecutive',
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
      systemPrompt: 'committed system',
      model: { id: 'stub', contextWindow: 200_000 },
      modelTransport: transport('first answer'),
      toolRegistry: noTools,
      eventLog: await file.open(),
      createId: () => 'run-1-message-0',
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });
    await first.prompt({ id: 'turn-1', role: 'user', content: 'first turn' });
    await first.close();

    const second = await createAgentSession({
      chatId: 'chat-consecutive',
      runId: 'run-2',
      leaderEpoch: 'epoch-2',
      systemPrompt: 'committed system',
      model: { id: 'stub', contextWindow: 200_000 },
      modelTransport: transport('second answer'),
      toolRegistry: noTools,
      eventLog: await file.open(),
      createId: () => 'run-2-message-0',
      now: () => new Date('2026-09-01T00:00:01.000Z'),
    });
    await second.prompt({ id: 'turn-2', role: 'user', content: 'second turn' });

    expect(requests[1]?.systemPrompt).toBe('committed system');
    const priorTimestamp = requests[1]?.messages[1]?.metadata?.timestamp;
    expect(typeof priorTimestamp).toBe('number');
    expect(requests[1]?.messages).toEqual([
      { id: 'turn-1', role: 'user', content: 'first turn', metadata: { timestamp: 0 } },
      {
        id: 'run-1-message-0',
        role: 'assistant',
        content: [{ type: 'text', text: 'first answer' }],
        metadata: {
          api: 'openai-completions',
          provider: 'tau-gateway',
          model: 'stub',
          usage: {
            input: 3,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 4,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: priorTimestamp,
        },
      },
      { id: 'turn-2', role: 'user', content: 'second turn', metadata: { timestamp: 0 } },
    ]);
    await second.close();
    const reopened = await file.open();
    const events = await reopened.read();
    expect(
      events.flatMap((event) => (event.runId === 'run-2' && event.type === 'run.lifecycle' ? [event.state] : [])),
    ).toEqual(['admitted', 'running', 'completed']);
    await reopened.close();
  });

  it('should record the typed gateway reason on the failed lifecycle marker', async () => {
    const log = await createMemoryEventLog();
    const failure = new GatewayModelTransportError({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Tau model gateway returned HTTP 503 Service Unavailable.',
      status: 503,
    });
    const session = await createAgentSession({
      chatId: 'chat-failed',
      runId: 'run-failed',
      leaderEpoch: 'epoch-failed',
      systemPrompt: 'You are a CAD agent.',
      model: { id: 'stub', contextWindow: 200_000 },
      modelTransport: {
        // oxlint-disable-next-line require-yield -- The transport rejects before emitting a provider event.
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          throw failure;
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      eventLog: log,
      createId: () => 'run-failed-message-0',
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    await session.prompt({ id: 'turn-failed', role: 'user', content: 'build a drone' });
    const events = await log.read();
    const terminal = events.findLast((event) => event.type === 'run.lifecycle' && event.state === 'failed');

    expect(terminal?.type === 'run.lifecycle' && terminal.detail).toEqual({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Tau model gateway returned HTTP 503 Service Unavailable.',
      status: 503,
    });
    const assistant = events.findLast((event) => event.type === 'message.appended');
    expect(assistant?.type === 'message.appended' && assistant.message.metadata?.stopReason).toBe('error');
    expect(assistant?.type === 'message.appended' && assistant.message.metadata?.errorMessage).toBe(failure.message);
    await session.close();
  });

  it('should record a cancellation reason-free detail so the UI keeps its own abort copy', async () => {
    const log = await createMemoryEventLog();
    const session = await createAgentSession({
      chatId: 'chat-cancelled',
      runId: 'run-cancelled',
      leaderEpoch: 'epoch-cancelled',
      systemPrompt: 'You are a CAD agent.',
      model: { id: 'stub', contextWindow: 200_000 },
      modelTransport: {
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          yield { type: 'text-delta', text: 'partial' };
          await new Promise((resolve) => {
            request.signal.addEventListener('abort', resolve, { once: true });
          });
          yield { type: 'usage', usage: usage(1, 1) };
          yield { type: 'completed', stopReason: 'aborted' };
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      eventLog: log,
      createId: () => 'run-cancelled-message-0',
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });

    const pending = session.prompt({ id: 'turn-cancelled', role: 'user', content: 'build a drone' });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    session.abort();
    await pending;

    const events = await log.read();
    const terminal = events.findLast((event) => event.type === 'run.lifecycle' && event.state === 'cancelled');
    expect(terminal?.type === 'run.lifecycle' && terminal.detail).toBeUndefined();
    await session.close();
  });

  it('should commit the user and exact client context before marking a run running', async () => {
    const log = await createMemoryEventLog();
    const requests: ModelStreamRequest[] = [];
    const session = await createAgentSession({
      chatId: 'chat-context',
      runId: 'run-context',
      leaderEpoch: 'epoch-context',
      systemPrompt: 'static system\n\ndynamic system',
      systemPromptBlocks: createCachedSystemPromptBlocks({
        staticPrompt: 'static system',
        dynamicPrompt: 'dynamic system',
      }),
      model: { id: 'stub', contextWindow: 200_000 },
      modelTransport: {
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          requests.push(request);
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      eventLog: log,
      clientContext: {
        skills: [{ name: 'brep', description: 'Build native BRep geometry', fingerprint: 'skill-v1' }],
        memory: { 'AGENTS.md': 'Use millimetres.' },
      },
      recentSkills: {
        load: async () => [
          {
            skillName: 'brep',
            resourceUri: 'skill://brep',
            fingerprint: 'skill-v1',
            content: 'Exact BRep instructions.',
          },
        ],
      },
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });
    await session.prompt({ id: 'turn-context', role: 'user', content: 'Build it.' });

    const events = await log.read();
    const projectionIndex = events.findIndex((event) => event.type === 'turn.history-projection-committed');
    const runningIndex = events.findIndex((event) => event.type === 'run.lifecycle' && event.state === 'running');
    expect(projectionIndex).toBeGreaterThanOrEqual(0);
    expect(projectionIndex).toBeLessThan(runningIndex);
    const projection = events[projectionIndex];
    if (projection?.type !== 'turn.history-projection-committed') {
      throw new Error('The committed turn projection is missing.');
    }
    expect(projection.message.id).toBe('turn-context');
    expect(projection.message.content).toBe('Build it.');
    expect(projection.context.version).toBe(1);
    expect(projection.context.systemPrompt).toContain('**brep**');
    expect(projection.context.systemPromptBlocks).toEqual([
      {
        type: 'text',
        text: 'static system',
        cacheControl: { type: 'ephemeral' },
      },
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('**brep**') as string,
        cacheControl: { type: 'ephemeral' },
      }),
      { type: 'text', text: 'dynamic system' },
    ]);
    expect(projection.context.initialMessages.find((message) => message.id === 'tau:client-memory')?.content).toContain(
      'Use millimetres.',
    );
    expect(
      projection.context.initialMessages.find((message) => message.id === 'tau:recent-skills:chat-context:summary')
        ?.content,
    ).toContain('skill://brep');
    expect(
      projection.context.postCompactionMessages.find(
        (message) => message.id === 'tau:recent-skills:chat-context:content',
      )?.content,
    ).toContain('Exact BRep instructions.');
    expect(requests[0]?.systemPrompt).toContain('**brep**');
    expect(requests[0]?.systemPromptBlocks).toEqual(projection.context.systemPromptBlocks);
    expect(JSON.stringify(requests[0]?.messages)).toContain('Use millimetres.');
    expect(JSON.stringify(requests[0]?.messages)).toContain('skill://brep');
    await session.close();
  });

  it('should rebuild the first model call from its committed context instead of ambient options', async () => {
    const contextMessage: ProviderMessage = {
      id: 'tau:client-memory',
      role: 'user',
      content: '<system-reminder>committed memory</system-reminder>',
      metadata: {
        tauInternal: { kind: 'client-memory', pruning: 'replace-by-id' },
      },
    };
    const eventBase = {
      version: 1,
      leaderEpoch: 'epoch-1',
      recordedAt: '2026-09-01T00:00:00.000Z',
      runId: 'run-1',
    } as const;
    const seeded = [
      { ...eventBase, type: 'run.lifecycle', sequence: 0, state: 'admitted' },
      {
        ...eventBase,
        type: 'turn.history-projection-committed',
        sequence: 1,
        retainedMessageIds: [],
        message: { id: 'committed-turn', role: 'user', content: 'continue committed turn' },
        context: {
          version: 1,
          systemPrompt: 'committed system',
          initialMessages: [contextMessage],
          postCompactionMessages: [contextMessage],
        },
      },
      { ...eventBase, type: 'run.lifecycle', sequence: 2, state: 'running' },
    ] as AgentLogEvent[];
    const log = await createMemoryEventLog(seeded);
    const requests: ModelStreamRequest[] = [];
    const session = await createAgentSession({
      chatId: 'chat-1',
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
      systemPrompt: 'ambient replacement system',
      clientContext: { memory: { 'AGENTS.md': 'ambient replacement memory' } },
      model: { id: 'stub', contextWindow: 200_000 },
      modelTransport: {
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          requests.push(request);
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      eventLog: log,
    });
    await session.agent.continue();

    expect(requests[0]?.systemPrompt).toBe('committed system');
    expect(requests[0]?.messages).toEqual([
      contextMessage,
      { id: 'committed-turn', role: 'user', content: 'continue committed turn', metadata: { timestamp: 0 } },
    ]);
    expect(JSON.stringify(requests[0])).not.toContain('ambient replacement');
    await session.close();
  });

  it('should resume with every execution knob from the durable model config', async () => {
    const base = {
      version: 1,
      leaderEpoch: 'durable-model-epoch',
      recordedAt: '2026-09-01T00:00:00.000Z',
      runId: 'durable-model-run',
    } as const;
    const history = Array.from(
      { length: 8 },
      (_, sequence): AgentLogEvent => ({
        ...base,
        type: 'message.appended',
        sequence,
        message: { id: `history-${sequence}`, role: 'user', content: String(sequence).repeat(4000) },
      }),
    );
    const durableCost = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };
    const log = await createMemoryEventLog([
      ...history,
      { ...base, type: 'run.lifecycle', sequence: 8, state: 'admitted' },
      {
        ...base,
        type: 'turn.history-projection-committed',
        sequence: 9,
        retainedMessageIds: history.map((event) =>
          event.type === 'message.appended' ? event.message.id : 'unreachable',
        ),
        message: { id: 'durable-turn', role: 'user', content: 'resume this turn' },
        context: {
          version: 1,
          systemPrompt: 'durable system',
          model: {
            id: 'durable-anthropic-model',
            providerKind: 'anthropic',
            contextWindow: 4096,
            maxTokens: 1024,
            cost: durableCost,
          },
          initialMessages: [],
          postCompactionMessages: [],
        },
      },
      { ...base, type: 'run.lifecycle', sequence: 10, state: 'running' },
    ]);
    const requests: ModelStreamRequest[] = [];
    const session = await createAgentSession({
      chatId: 'durable-model-chat',
      runId: 'durable-model-run',
      leaderEpoch: 'durable-model-epoch',
      systemPrompt: 'ambient system',
      model: { id: 'ambient-openai-model', providerKind: 'openai', contextWindow: 200_000, maxTokens: 8192 },
      modelTransport: {
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          requests.push(request);
          if (request.systemPrompt.startsWith('You are a context summarization assistant')) {
            yield { type: 'text-delta', text: 'durable summary' };
          }
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      eventLog: log,
      createId: (() => {
        let next = 0;
        return () => `durable-model-${next++}`;
      })(),
    });

    await session.agent.continue();

    expect(
      requests.some((request) => request.systemPrompt.startsWith('You are a context summarization assistant')),
    ).toBe(true);
    expect(requests).not.toHaveLength(0);
    expect(
      requests.every(
        (request) =>
          request.modelId === 'durable-anthropic-model' &&
          request.providerKind === 'anthropic' &&
          request.modelCost !== undefined &&
          request.modelCost.input === durableCost.input &&
          request.modelCost.output === durableCost.output &&
          request.modelCost.cacheRead === durableCost.cacheRead &&
          request.modelCost.cacheWrite === durableCost.cacheWrite,
      ),
    ).toBe(true);
    expect(requests.at(-1)?.maxTokens).toBe(1024);
    await session.close();
  });

  it('should reject a length-terminated compaction summary before persisting it', async () => {
    const initial: AgentLogEvent[] = Array.from({ length: 8 }, (_, sequence) => ({
      version: 1,
      leaderEpoch: 'history-epoch',
      sequence,
      recordedAt: '2026-09-01T00:00:00.000Z',
      runId: 'history-run',
      type: 'message.appended',
      message: { id: `history-${sequence}`, role: 'user', content: String(sequence).repeat(4000) },
    }));
    const log = await createMemoryEventLog(initial);
    const session = await createAgentSession({
      chatId: 'chat-summary-stop',
      runId: 'run-summary-stop',
      leaderEpoch: 'summary-epoch',
      systemPrompt: 'system',
      model: { id: 'stub', contextWindow: 8192 },
      modelTransport: {
        async *stream(request): AsyncGenerator<ModelStreamEvent> {
          if (request.systemPrompt.startsWith('Summarize the conversation')) {
            yield { type: 'text-delta', text: 'partial summary' };
            yield { type: 'completed', stopReason: 'length' };
            return;
          }
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
      toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
      eventLog: log,
    });

    await expect(
      session.prompt({ id: 'summary-turn', role: 'user', content: 'continue after summary' }),
    ).rejects.toThrow('Compaction summary must complete exactly once with stop');
    const snapshot = await session.snapshot();
    const events = await log.read();
    expect(snapshot.messages.findLast((message) => message.role === 'assistant')).toBeUndefined();
    expect(events.filter((event) => event.type === 'history.compacted')).toHaveLength(0);
    await session.close();
  });
});

describe('transport stream state', () => {
  const streamFor = async (
    events: readonly ModelStreamEvent[],
    onLiveDelta?: Parameters<typeof createTransportStreamFunction>[0]['onLiveDelta'],
  ) =>
    createTransportStreamFunction({
      transport: {
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          yield* events;
        },
      },
      identities: new MessageIdentities(() => 'stream-message'),
      toolInputIds: new Map(),
      createId: () => 'stream-id',
      onLiveDelta,
    })(stubModel, { messages: [] });

  it('should preserve interleaved text, tool, and thinking blocks in arrival order', async () => {
    const stream = await streamFor([
      { type: 'text-delta', text: 'before' },
      { type: 'tool-input', toolCallId: 'call-1', toolName: 'read_file', input: { targetFile: 'main.ts' } },
      { type: 'text-delta', text: 'after' },
      { type: 'thinking-delta', text: 'consider' },
      { type: 'text-delta', text: 'final' },
      { type: 'completed', stopReason: 'stop' },
    ]);
    const eventTypes: string[] = [];
    for await (const event of stream) {
      eventTypes.push(event.type);
    }
    const result = await stream.result();

    expect(result.content).toEqual([
      { type: 'text', text: 'before' },
      { type: 'toolCall', id: 'call-1', name: 'read_file', arguments: { targetFile: 'main.ts' } },
      { type: 'text', text: 'after' },
      { type: 'thinking', thinking: 'consider' },
      { type: 'text', text: 'final' },
    ]);
    expect(eventTypes).toEqual([
      'start',
      'text_start',
      'text_delta',
      'text_end',
      'toolcall_start',
      'toolcall_delta',
      'toolcall_end',
      'text_start',
      'text_delta',
      'text_end',
      'thinking_start',
      'thinking_delta',
      'thinking_end',
      'text_start',
      'text_delta',
      'text_end',
      'done',
    ]);
  });

  it('should reject transport events emitted after completion', async () => {
    const live: string[] = [];
    const stream = await streamFor(
      [
        { type: 'text-delta', text: 'complete' },
        { type: 'completed', stopReason: 'stop' },
        { type: 'text-delta', text: 'too late' },
      ],
      (event) => {
        live.push(event.delta);
      },
    );

    const result = await stream.result();
    expect(result.stopReason).toBe('error');
    expect(result.errorMessage).toContain('after a completed event');
    expect(live).toEqual(['complete']);
  });

  it('rehydrates a persisted deferred stop without coercing it to stop', () => {
    const hydrated = providerMessageToPi(
      {
        id: 'deferred-assistant',
        role: 'assistant',
        content: [],
        metadata: { stopReason: 'deferred' },
      },
      stubModel,
      new MessageIdentities(() => 'unused'),
    );

    expect(hydrated).toMatchObject({ role: 'assistant', stopReason: 'deferred' });
  });
});
