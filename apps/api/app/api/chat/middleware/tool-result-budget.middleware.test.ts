/* eslint-disable @typescript-eslint/naming-convention -- LangChain message + OTEL attribute naming */
/* oxlint-disable @typescript-eslint/no-unsafe-return -- LangGraph handler signatures use loose `any`-typed Mock impls; runtime shape verified by assertions */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { toolName } from '@taucad/chat/constants';
import { createToolResultBudgetMiddleware } from '#api/chat/middleware/tool-result-budget.middleware.js';
import type { TauRpcBackendFactory, TauRpcBackend } from '#api/chat/tau-rpc-backend.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { invokeWrapModelCall } from '#testing/middleware-testing.utils.js';

describe('createToolResultBudgetMiddleware', () => {
  let rpcBackendFactory: ReturnType<typeof mock<TauRpcBackendFactory>>;
  let mockBackend: ReturnType<typeof mock<TauRpcBackend>>;
  let metricsService: ReturnType<typeof mock<MetricsService>>;
  let chatToolResultOffloadedAdd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    rpcBackendFactory = mock<TauRpcBackendFactory>();
    mockBackend = mock<TauRpcBackend>();
    rpcBackendFactory.create.mockReturnValue(mockBackend);
    mockBackend.write.mockResolvedValue({ path: 'test', filesUpdate: null });
    chatToolResultOffloadedAdd = vi.fn();
    metricsService = mock<MetricsService>();
    (
      metricsService as unknown as { chatToolResultOffloaded: { add: typeof chatToolResultOffloadedAdd } }
    ).chatToolResultOffloaded = {
      add: chatToolResultOffloadedAdd,
    };
  });

  const buildToolMessage = (id: string, name: string, contentBytes: number): ToolMessage =>
    new ToolMessage({ content: 'X'.repeat(contentBytes), tool_call_id: id, name });

  it('should pass through a turn that stays under the aggregate budget', async () => {
    const middleware = createToolResultBudgetMiddleware(rpcBackendFactory, metricsService, {
      maxChars: 200_000,
    });

    const messages = [
      new HumanMessage('hi'),
      new AIMessage('working'),
      buildToolMessage('grep-1', toolName.grep, 100_000),
      buildToolMessage('read-1', toolName.readFile, 50_000),
    ];

    const handler = vi.fn().mockImplementation(async (request) => request);
    await invokeWrapModelCall(
      middleware,
      { messages, state: undefined, runtime: { context: { chatId: 'chat-1' } } } as unknown as Parameters<
        typeof invokeWrapModelCall
      >[1],
      handler,
    );

    const passedRequest = handler.mock.calls[0]![0] as { messages: ToolMessage[] };
    const passedToolMessages = passedRequest.messages.filter((message) => message instanceof ToolMessage);
    expect(passedToolMessages.every((message) => (message.content as string).length < 200_000)).toBe(true);
    expect(mockBackend.write).not.toHaveBeenCalled();
    expect(chatToolResultOffloadedAdd).not.toHaveBeenCalled();
  });

  it('should persist the largest fresh result first when the aggregate budget is exceeded', async () => {
    const middleware = createToolResultBudgetMiddleware(rpcBackendFactory, metricsService, {
      maxChars: 150_000,
    });

    const messages = [
      new HumanMessage('hi'),
      new AIMessage('working'),
      buildToolMessage('a', toolName.readFile, 60_000),
      buildToolMessage('b', toolName.readFile, 60_000),
      buildToolMessage('c', toolName.readFile, 60_000),
      buildToolMessage('d', toolName.readFile, 60_000),
    ];

    const handler = vi.fn().mockImplementation(async (request) => request);
    await invokeWrapModelCall(
      middleware,
      { messages, state: undefined, runtime: { context: { chatId: 'chat-1' } } } as unknown as Parameters<
        typeof invokeWrapModelCall
      >[1],
      handler,
    );

    const passedRequest = handler.mock.calls[0]![0] as { messages: ToolMessage[] };
    const passedToolMessages = passedRequest.messages.filter((message) => message instanceof ToolMessage);
    const persistedCount = passedToolMessages.filter((message) =>
      (message.content as string).startsWith('<persisted-output>'),
    ).length;
    expect(persistedCount).toBeGreaterThanOrEqual(2);
    expect(mockBackend.write).toHaveBeenCalled();
    expect(chatToolResultOffloadedAdd).toHaveBeenCalledTimes(persistedCount);
  });

  it('should re-apply cached envelopes byte-identically across turns (prompt-cache stable)', async () => {
    const middleware = createToolResultBudgetMiddleware(rpcBackendFactory, metricsService, {
      maxChars: 150_000,
    });

    const turn1 = [
      new HumanMessage('hi'),
      new AIMessage('working'),
      buildToolMessage('a', toolName.readFile, 80_000),
      buildToolMessage('b', toolName.readFile, 80_000),
      buildToolMessage('c', toolName.readFile, 80_000),
    ];
    const handler = vi.fn().mockImplementation(async (request) => request);

    await invokeWrapModelCall(
      middleware,
      { messages: turn1, state: undefined, runtime: { context: { chatId: 'chat-1' } } } as unknown as Parameters<
        typeof invokeWrapModelCall
      >[1],
      handler,
    );
    const turn1Output = handler.mock.calls[0]![0] as { messages: ToolMessage[] };

    const persistedFromTurn1 = turn1Output.messages
      .filter((message) => message instanceof ToolMessage)
      .map((message) => ({ id: message.tool_call_id, content: message.content as string }));

    const writeCallsBeforeTurn2 = mockBackend.write.mock.calls.length;

    const turn2 = [
      ...turn1.slice(0, 2),
      ...persistedFromTurn1.map(
        (entry) => new ToolMessage({ content: entry.content, tool_call_id: entry.id, name: toolName.readFile }),
      ),
      new AIMessage('follow up'),
    ];

    await invokeWrapModelCall(
      middleware,
      { messages: turn2, state: undefined, runtime: { context: { chatId: 'chat-1' } } } as unknown as Parameters<
        typeof invokeWrapModelCall
      >[1],
      handler,
    );

    expect(mockBackend.write.mock.calls.length).toBe(writeCallsBeforeTurn2);
  });

  it('should never persist tool messages that already carry a `<persisted-output>` envelope', async () => {
    const middleware = createToolResultBudgetMiddleware(rpcBackendFactory, metricsService, {
      maxChars: 100_000,
    });

    const envelope =
      '<persisted-output>\nTool read_file output persisted (200000 chars) to .tau/tool-results/chat-1/a.txt. Full content shown below.\n\nbody\n</persisted-output>';

    const messages = [
      new HumanMessage('hi'),
      new AIMessage('working'),
      new ToolMessage({ content: envelope, tool_call_id: 'a', name: toolName.readFile }),
      buildToolMessage('b', toolName.readFile, 50_000),
    ];

    const handler = vi.fn().mockImplementation(async (request) => request);
    await invokeWrapModelCall(
      middleware,
      { messages, state: undefined, runtime: { context: { chatId: 'chat-1' } } } as unknown as Parameters<
        typeof invokeWrapModelCall
      >[1],
      handler,
    );

    const writeCalls = mockBackend.write.mock.calls;
    expect(writeCalls.find((call) => call[0] === '.tau/tool-results/chat-1/a.txt')).toBeUndefined();
  });

  it('should be idempotent: a second pass over the post-budget messages persists nothing new', async () => {
    const middleware = createToolResultBudgetMiddleware(rpcBackendFactory, metricsService, {
      maxChars: 150_000,
    });

    const messages = [
      new HumanMessage('hi'),
      new AIMessage('working'),
      buildToolMessage('a', toolName.readFile, 80_000),
      buildToolMessage('b', toolName.readFile, 80_000),
      buildToolMessage('c', toolName.readFile, 80_000),
    ];
    const handler = vi.fn().mockImplementation(async (request) => request);

    await invokeWrapModelCall(
      middleware,
      { messages, state: undefined, runtime: { context: { chatId: 'chat-1' } } } as unknown as Parameters<
        typeof invokeWrapModelCall
      >[1],
      handler,
    );
    const firstPassOutput = handler.mock.calls[0]![0] as { messages: ToolMessage[] };
    const writeCallsAfterFirst = mockBackend.write.mock.calls.length;

    await invokeWrapModelCall(
      middleware,
      {
        messages: firstPassOutput.messages,
        state: undefined,
        runtime: { context: { chatId: 'chat-1' } },
      } as unknown as Parameters<typeof invokeWrapModelCall>[1],
      handler,
    );

    expect(mockBackend.write.mock.calls.length).toBe(writeCallsAfterFirst);
  });
});
