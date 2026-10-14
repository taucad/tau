import { describe, expect, it, vi } from 'vitest';
import type { AgentLogEvent, ModelReasoningConfig } from '#log/event-types.js';
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport, ToolRegistry } from '#waist/ports.js';
import { createMemoryEventLog, createMemoryEventLogFile, fundedFacet } from '#harness/harness.fixture.js';
import { createAgentSession, requestedMaxTokens } from '#harness/session.js';
import type { CreateAgentSessionOptions } from '#harness/session.js';
import type { SessionLogEvent } from '#harness/session-record.js';

const user = { id: 'user-1', role: 'user', content: 'Build the engine.' } as const;
const toolRegistry: ToolRegistry = {
  list: () => [{ name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } }],
  invoke: async () => ({ content: 'actual file contents', isError: false }),
};

const open = async (options: {
  stream: ModelTransport['stream'];
  log?: Awaited<ReturnType<typeof createMemoryEventLog>>;
  registry?: ToolRegistry;
  funding?: ModelTransport['funding'];
  appendEvent?: CreateAgentSessionOptions['appendEvent'];
}) =>
  createAgentSession({
    chatId: 'chat-1',
    runId: 'run-1',
    leaderEpoch: 'epoch-1',
    systemPrompt: 'Build CAD models.',
    model: { id: 'model-1', contextWindow: 200_000, maxTokens: 65_536, reasoning: { effort: 'high' } },
    modelTransport: { funding: options.funding ?? { type: 'unfunded' }, stream: options.stream },
    toolRegistry: options.registry ?? toolRegistry,
    eventLog: options.log ?? (await createMemoryEventLog()),
    appendEvent: options.appendEvent,
  });

describe('output-limit recovery', () => {
  it('credits tool progress saved after the last checkpoint when reconstructing the same attempt', async () => {
    const file = createMemoryEventLogFile();
    let calls = 0;
    const stream: ModelTransport['stream'] = async function* () {
      calls++;
      if (calls === 3) {
        yield { type: 'tool-input', toolCallId: 'saved-call', toolName: 'read_file', input: {} };
        yield { type: 'completed', stopReason: 'error' };
        return;
      }
      yield { type: 'completed', stopReason: calls < 5 ? 'length' : 'stop' };
    };
    const first = await open({ log: await file.open(), stream });
    await expect(first.prompt(user)).resolves.toMatchObject({ outcome: 'failed' });
    await first.close();
    const reconstructed = await open({ log: await file.open(), stream });
    await expect(reconstructed.continue()).resolves.toEqual({ outcome: 'completed' });
    expect(calls).toBe(5);
  });

  it('bounds total continuations even when every truncated response completes a tool', async () => {
    let calls = 0;
    const session = await open({
      async *stream() {
        calls++;
        yield {
          type: 'tool-input',
          toolCallId: `read-${calls}`,
          toolName: 'read_file',
          input: { targetFile: `${calls}.ts` },
        };
        yield { type: 'completed', stopReason: 'length' };
      },
    });
    await expect(session.prompt(user)).resolves.toMatchObject({
      outcome: 'failed',
      failure: { code: 'MODEL_OUTPUT_LIMIT', details: { recoveries: 8, noProgress: 0 } },
    });
    expect(calls).toBe(9);
  });

  it('counts newly completed work even when compaction evicts older successful outputs', async () => {
    const log = await createMemoryEventLog();
    let sequence = 0;
    const appendEvent = async (event: SessionLogEvent): Promise<void> => {
      await log.append({
        ...event,
        version: 1,
        leaderEpoch: 'epoch-1',
        sequence: sequence++,
        runId: 'run-1',
        recordedAt: new Date().toISOString(),
      });
    };
    await appendEvent({
      type: 'message.appended',
      message: { id: 'old-user', role: 'user', content: 'Read the old file.' },
    });
    await appendEvent({
      type: 'message.appended',
      message: {
        id: 'old-assistant',
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'old-call', name: 'read_file', arguments: {} }],
        metadata: { stopReason: 'toolUse' },
      },
    });
    await appendEvent({
      type: 'message.appended',
      message: {
        id: 'old-result',
        role: 'tool-output',
        toolName: 'read_file',
        toolCallId: 'old-call',
        content: 'old contents',
        isError: false,
      },
    });
    let calls = 0;
    const session = await open({
      log,
      appendEvent,
      async *stream() {
        calls++;
        if (calls === 3) {
          await appendEvent({
            type: 'history.compacted',
            evictedMessageIds: ['old-user', 'old-assistant', 'old-result'],
            summary: { id: 'summary', role: 'user', content: 'The old file was read.' },
          });
          yield { type: 'tool-input', toolCallId: 'new-call', toolName: 'read_file', input: { targetFile: 'new.ts' } };
        }
        yield { type: 'completed', stopReason: calls <= 3 ? 'length' : 'stop' };
      },
    });
    await expect(session.prompt(user)).resolves.toEqual({ outcome: 'completed' });
    expect(calls).toBe(4);
    const history = await log.messages();
    expect(history.some((message) => message.id === 'old-result')).toBe(false);
    expect(history).toContainEqual(
      expect.objectContaining({ role: 'tool-output', toolCallId: 'new-call', isError: false }),
    );
  });

  it('continues a truncated promise within the same run using durable context', async () => {
    const requests: ModelStreamRequest[] = [];
    const log = await createMemoryEventLog();
    const session = await open({
      log,
      async *stream(request) {
        requests.push(request);
        yield { type: 'text-delta', text: requests.length === 1 ? 'I will implement' : 'Done.' };
        yield { type: 'completed', stopReason: requests.length === 1 ? 'length' : 'stop' };
      },
    });
    await expect(session.prompt(user)).resolves.toEqual({ outcome: 'completed' });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)?.metadata?.tauInternal?.['kind']).toBe('output-limit-recovery');
    expect(requests.map((request) => request.maxTokens)).toEqual([65_536, 65_536]);
    const events = await log.read();
    expect(events.filter((event) => event.type === 'safeguard.recorded')).toHaveLength(1);
  });

  it('shows an explicit resumable failure after repeated truncations without tool progress', async () => {
    const stream = vi.fn(async function* (): AsyncGenerator<ModelStreamEvent> {
      yield { type: 'text-delta', text: 'I will implement' };
      yield { type: 'completed', stopReason: 'length' };
    });
    const session = await open({ stream });
    await expect(session.prompt(user)).resolves.toMatchObject({
      outcome: 'failed',
      failure: { code: 'MODEL_OUTPUT_LIMIT' },
    });
    expect(stream).toHaveBeenCalledTimes(3);
  });

  it('settles an eager tool before continuation and sends its actual result exactly once', async () => {
    const requests: ModelStreamRequest[] = [];
    const invoke = vi.fn(toolRegistry.invoke);
    const session = await open({
      registry: { ...toolRegistry, invoke },
      async *stream(request) {
        requests.push(request);
        if (requests.length === 1) {
          yield { type: 'tool-input', toolCallId: 'read-1', toolName: 'read_file', input: {} };
          yield { type: 'completed', stopReason: 'length' };
          return;
        }
        yield { type: 'completed', stopReason: 'stop' };
      },
    });
    await expect(session.prompt(user)).resolves.toEqual({ outcome: 'completed' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(requests[1]?.messages.filter((message) => message.role === 'tool-output')).toEqual([
      expect.objectContaining({ toolCallId: 'read-1', content: 'actual file contents', isError: false }),
    ]);
  });

  it('does not continue or report completion when an eager tool result cannot be saved', async () => {
    const stored = await createMemoryEventLog();
    const log = {
      ...stored,
      append: async (event: AgentLogEvent) => {
        if (event.type === 'message.appended' && event.message.role === 'tool-output') {
          throw new Error('disk full');
        }
        return stored.append(event);
      },
    };
    const stream = vi.fn(async function* (): AsyncGenerator<ModelStreamEvent> {
      yield { type: 'tool-input', toolCallId: 'read-1', toolName: 'read_file', input: {} };
      yield { type: 'completed', stopReason: 'length' };
    });
    const session = await open({ log, stream });
    await expect(session.prompt(user)).resolves.toMatchObject({
      outcome: 'failed',
      failure: { code: 'TOOL_RESULT_PERSISTENCE_FAILED' },
    });
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('uses a fresh paid attempt for continuation after a delivered truncated response', async () => {
    const log = await createMemoryEventLog();
    const attempts: string[] = [];
    const resolve = vi.fn(async () => ({ status: 'pending' }) as const);
    const stream = vi.fn(async function* (request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
      attempts.push(request.attemptId);
      await request.onInvocationBound?.({ operationId: `paid-${attempts.length}` });
      yield { type: 'completed', stopReason: attempts.length === 1 ? 'length' : 'stop' };
    });
    const session = await open({ log, stream, funding: fundedFacet(resolve) });
    await expect(session.prompt(user)).resolves.toEqual({ outcome: 'completed' });
    expect(attempts).toEqual(['run-1:1:0', 'run-1:1:1']);
    expect(resolve).not.toHaveBeenCalled();
    const events = await log.read();
    expect(events.filter((event) => event.type === 'model.invocation-prepared')).toHaveLength(2);
  });

  it('never executes partial tool arguments from a truncated response', async () => {
    const invoke = vi.fn(toolRegistry.invoke);
    let calls = 0;
    const session = await open({
      registry: { ...toolRegistry, invoke },
      async *stream() {
        calls++;
        if (calls === 1) {
          yield { type: 'tool-input-start', toolCallId: 'partial-1', toolName: 'read_file', contentIndex: 0 };
          yield {
            type: 'tool-input-delta',
            toolCallId: 'partial-1',
            toolName: 'read_file',
            contentIndex: 0,
            delta: '{"targetFile":',
          };
        }
        yield { type: 'completed', stopReason: calls === 1 ? 'length' : 'stop' };
      },
    });
    await expect(session.prompt(user)).resolves.toEqual({ outcome: 'completed' });
    expect(calls).toBe(2);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('honors Stop while a truncated response waits for an eager tool to settle', async () => {
    const dispatched = Promise.withResolvers<void>();
    const completed = Promise.withResolvers<void>();
    const stream = vi.fn(async function* (): AsyncGenerator<ModelStreamEvent> {
      yield { type: 'tool-input', toolCallId: 'read-1', toolName: 'read_file', input: {} };
      yield { type: 'completed', stopReason: 'length' };
    });
    const session = await open({
      stream,
      registry: {
        ...toolRegistry,
        invoke: async () => {
          dispatched.resolve();
          await completed.promise;
          return { content: 'saved result', isError: false };
        },
      },
    });
    const running = session.prompt(user);
    await dispatched.promise;
    session.abort();
    completed.resolve();
    await expect(running).resolves.toEqual({ outcome: 'aborted' });
    expect(stream).toHaveBeenCalledTimes(1);
    const snapshot = await session.snapshot();
    expect(snapshot.messages).toContainEqual(expect.objectContaining({ role: 'tool-output', content: 'saved result' }));
  });
});

describe('reasoning-aware output defaults', () => {
  it.each<{ reasoning: ModelReasoningConfig | undefined; expected: number }>([
    { reasoning: undefined, expected: 16_384 },
    { reasoning: {}, expected: 32_768 },
    { reasoning: { effort: 'low' }, expected: 32_768 },
    { reasoning: { effort: 'medium' }, expected: 32_768 },
    { reasoning: { effort: 'high' }, expected: 65_536 },
    { reasoning: { effort: 'xhigh' }, expected: 65_536 },
    { reasoning: { effort: 'max' }, expected: 65_536 },
    { reasoning: { budgetTokens: 50_000 }, expected: 66_384 },
  ])('requests $expected for $reasoning', ({ reasoning, expected }) => {
    expect(requestedMaxTokens(128_000, undefined, reasoning)).toBe(expected);
    expect(requestedMaxTokens(8192, undefined, reasoning)).toBe(8192);
    expect(requestedMaxTokens(128_000, 1000, reasoning)).toBe(1000);
  });
});
