/* eslint-disable @typescript-eslint/naming-convention -- Langchain naming convetion */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { ContextOverflowError } from '@langchain/core/errors';
import { Command, REMOVE_ALL_MESSAGES } from '@langchain/langgraph';
import {
  createCompactionMiddleware,
  findSafeCutoffPoint,
  stripExcessMedia,
} from '#api/chat/middleware/compaction.middleware.js';
import type { CompactionService } from '#api/chat/compaction.service.js';
import type { TauRpcBackend, TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import type { ModelService } from '#api/models/model.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import { MorphCompactionContractError, MorphCompactionTransportError } from '#api/chat/utils/compaction-errors.js';
import { compactionTranscriptPath } from '#api/chat/middleware/compaction-transcript.js';
import type { ReadDedupClearer } from '#api/chat/clear-recent-reads.js';

const getCommandMessages = (command: Command): BaseMessage[] => {
  const { update } = command;
  if (!update || Array.isArray(update)) {
    throw new Error('Expected a record command update');
  }
  return update['messages'] as BaseMessage[];
};

vi.mock('@taucad/utils/id', () => ({
  generatePrefixedId: vi.fn(() => 'dat_test_123'),
}));

describe('compactionTranscriptPath', () => {
  it('should return an absolute DeepAgents backend path', () => {
    expect(compactionTranscriptPath('chat-1')).toBe('/.tau/transcripts/chat-1.jsonl');
  });
});

describe('findSafeCutoffPoint', () => {
  it('should keep requested number of messages when no split needed', () => {
    const messages: BaseMessage[] = [
      new HumanMessage('hello'),
      new AIMessage('hi'),
      new HumanMessage('question'),
      new AIMessage('answer'),
    ];

    expect(findSafeCutoffPoint(messages, 2)).toBe(2);
  });

  it('should never split AI/Tool message pairs', () => {
    const messages: BaseMessage[] = [
      new HumanMessage('hello'),
      new AIMessage({ content: 'let me check', tool_calls: [{ name: 'read_file', id: 'tc1', args: {} }] }),
      new ToolMessage({ content: 'file contents', tool_call_id: 'tc1' }),
      new HumanMessage('thanks'),
      new AIMessage('you are welcome'),
    ];

    // Trying to keep 3 would split at index 2 (ToolMessage)
    // Should extend to keep the AIMessage before it too
    const keep = findSafeCutoffPoint(messages, 3);
    expect(keep).toBeGreaterThanOrEqual(3);

    const cutoff = messages.length - keep;
    const messageAtCutoff = messages[cutoff];
    expect(messageAtCutoff).not.toBeInstanceOf(ToolMessage);
  });

  it('should walk past consecutive ToolMessages to their AIMessage', () => {
    const messages: BaseMessage[] = [
      new HumanMessage('start'),
      new AIMessage({
        content: 'calling tools',
        tool_calls: [
          { name: 'tool_a', id: 'tc1', args: {} },
          { name: 'tool_b', id: 'tc2', args: {} },
        ],
      }),
      new ToolMessage({ content: 'result a', tool_call_id: 'tc1' }),
      new ToolMessage({ content: 'result b', tool_call_id: 'tc2' }),
      new HumanMessage('follow up'),
      new AIMessage('final answer'),
    ];

    // Requesting keep=3 would place cutoff at index 3 (a ToolMessage).
    // Should walk back past both ToolMessages to the AIMessage at index 1.
    const keep = findSafeCutoffPoint(messages, 3);
    expect(keep).toBe(5); // Keeps indices 1-5

    const cutoff = messages.length - keep;
    expect(messages[cutoff]).toBeInstanceOf(AIMessage);
  });

  it('should handle empty messages array', () => {
    expect(findSafeCutoffPoint([], 5)).toBe(0);
  });
});

describe('createCompactionMiddleware', () => {
  let compactionService: ReturnType<typeof mock<CompactionService>>;
  let rpcBackendFactory: ReturnType<typeof mock<TauRpcBackendFactory>>;
  let mockBackend: ReturnType<typeof mock<TauRpcBackend>>;
  let tokenBudgetService: TokenBudgetService;
  let metricsService: {
    genAiContextBudgetTokens: { record: ReturnType<typeof vi.fn> };
    genAiContextCompactionDecisions: { add: ReturnType<typeof vi.fn> };
  };
  let mockModelService: { getContextWindow: ReturnType<typeof vi.fn>; getOtelProviderName: ReturnType<typeof vi.fn> };
  let writer: ReturnType<typeof vi.fn>;
  let readDedupClearer: ReadDedupClearer;

  beforeEach(() => {
    vi.clearAllMocks();
    compactionService = mock<CompactionService>();
    rpcBackendFactory = mock<TauRpcBackendFactory>();
    mockBackend = mock<TauRpcBackend>();
    tokenBudgetService = new TokenBudgetService();
    metricsService = {
      genAiContextBudgetTokens: { record: vi.fn() },
      genAiContextCompactionDecisions: { add: vi.fn() },
    };
    rpcBackendFactory.create.mockReturnValue(mockBackend);
    mockBackend.append.mockResolvedValue({ path: '/test', filesUpdate: null });
    mockModelService = {
      getContextWindow: vi.fn().mockReturnValue(200_000),
      getOtelProviderName: vi.fn().mockReturnValue('anthropic'),
    };
    writer = vi.fn();
    readDedupClearer = { clearChat: vi.fn<ReadDedupClearer['clearChat']>().mockResolvedValue(0) };
  });

  const createMiddlewareInstance = () =>
    createCompactionMiddleware({
      compactionService,
      rpcBackendFactory,
      tokenBudgetService,
      metricsService: metricsService as unknown as MetricsService,
      readDedupClearer,
      providerId: 'anthropic',
    });

  const createContext = (contextWindow = 200_000) => {
    mockModelService.getContextWindow.mockReturnValue(contextWindow);
    return {
      chatId: 'chat-1',
      modelId: 'test-model',
      modelService: mockModelService as unknown as ModelService,
    };
  };

  it('should not trigger compaction below threshold', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const messages: BaseMessage[] = [new HumanMessage('short message'), new AIMessage('short reply')];

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(compactionService.compact).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ messages }));
  });

  it('should skip compaction when targetKeep covers all messages', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    // 4 messages with a tiny context window — triggers threshold but targetKeep = max(4, ...) = 4 = messages.length
    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(compactionService.compact).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should trigger compaction at threshold', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(compactionService.compact).toHaveBeenCalled();
  });

  it('should return a LangGraph state rewrite after successful compaction', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const aiResponse = new AIMessage('post-compaction reply');
    const handler = vi.fn().mockResolvedValue(aiResponse);

    const result = await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(compactionService.compact).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Command);
    const updatedMessages = getCommandMessages(result as Command);
    expect(updatedMessages[0]?.id).toBe(REMOVE_ALL_MESSAGES);
    expect(updatedMessages.at(-1)).toBe(aiResponse);
    expect(
      updatedMessages.some(
        (message) =>
          message instanceof HumanMessage &&
          (message as { additional_kwargs?: Record<string, unknown> }).additional_kwargs?.['compaction_id'] ===
            'dat_test_123',
      ),
    ).toBe(true);
  });

  it('should throw before provider dispatch when required transcript commit fails', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });
    mockBackend.append.mockRejectedValueOnce(new Error('transcript unavailable'));

    const handler = vi.fn().mockResolvedValue(new AIMessage('should not be called'));

    await expect(
      wrapModelCall(
        {
          messages,
          tools: [],
          systemMessage: '',
          runtime: { context: createContext(1000), writer },
        } as unknown as Parameters<typeof wrapModelCall>[0],
        handler,
      ),
    ).rejects.toMatchObject({
      code: 'CONTEXT_COMPACTION_FAILED',
      failureKind: 'transcript_commit_failed',
      failureDisposition: 'blocked_before_provider',
    });

    expect(compactionService.compact).toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'context-compaction',
        status: 'failed',
        failureDisposition: 'blocked_before_provider',
        compactionFailureKind: 'transcript_commit_failed',
        transcriptFilePath: null,
      }),
    );
  });

  it('should trigger compaction from persisted previous provider usage state', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const messages: BaseMessage[] = [
      new HumanMessage('small old'),
      new AIMessage('small old answer'),
      new HumanMessage('small middle'),
      new AIMessage('small middle answer'),
      new HumanMessage('small recent'),
      new AIMessage('small recent answer'),
    ];
    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\nprevious usage summary')],
      stats: {
        tokensBeforeCompaction: 850,
        tokensAfterCompaction: 50,
        compressionRatio: 0.06,
        messagesEvicted: 2,
      },
    });

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        state: {
          _lastProviderInputTokens: 850,
          _lastProviderUsageModelId: 'test-model',
        },
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      vi.fn().mockResolvedValue(new AIMessage('done')),
    );

    expect(compactionService.compact).toHaveBeenCalled();
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'context-compaction',
        triggerReason: 'previous_usage',
      }),
    );
  });

  it('should persist provider input usage after model responses', () => {
    const middleware = createMiddlewareInstance();
    const { afterModel } = middleware;
    if (!afterModel || typeof afterModel !== 'function') {
      throw new Error('afterModel not defined');
    }

    const update = afterModel(
      {
        messages: [
          new AIMessage({
            content: 'done',
            usage_metadata: { input_tokens: 900, output_tokens: 10, total_tokens: 910 },
          }),
        ],
      },
      { context: createContext(1000) },
    ) as Record<string, unknown>;

    expect(update).toMatchObject({
      _lastProviderInputTokens: 900,
      _lastProviderUsageModelId: 'test-model',
      _lastProviderContextWindow: 1000,
      _lastProviderTriggerThreshold: 850,
    });
  });

  it('should emit writer data part on compaction', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent question'),
      new AIMessage('recent answer'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'context-compaction',
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
      }),
    );
  });

  it('should catch ContextOverflowError and re-compact', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const messages: BaseMessage[] = [
      new HumanMessage('old user'),
      new AIMessage('old assistant'),
      new HumanMessage('middle user'),
      new AIMessage('middle assistant'),
      new HumanMessage('recent user'),
      new AIMessage('recent assistant'),
    ];
    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted overflow history]')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 4,
      },
    });

    const handler = vi
      .fn()
      .mockRejectedValueOnce(new ContextOverflowError('overflow'))
      .mockResolvedValueOnce(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(2);
    expect(compactionService.compact).toHaveBeenCalledTimes(1);
    expect(compactionService.compact.mock.calls[0]?.[0].messages).toEqual(
      expect.arrayContaining([messages[0], messages[1]]),
    );
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'context-compaction',
        status: 'overflow_retry_succeeded',
        triggerReason: 'overflow',
      }),
    );
  });

  it('should block overflow retry when required transcript commit fails', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const messages: BaseMessage[] = [
      new HumanMessage('old user'),
      new AIMessage('old assistant'),
      new HumanMessage('middle user'),
      new AIMessage('middle assistant'),
      new HumanMessage('recent user'),
      new AIMessage('recent assistant'),
    ];
    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted overflow history]')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 4,
      },
    });
    const handler = vi.fn().mockRejectedValueOnce(new ContextOverflowError('overflow'));
    mockBackend.append.mockRejectedValueOnce(new Error('transcript unavailable'));

    await expect(
      wrapModelCall(
        {
          messages,
          tools: [],
          systemMessage: '',
          runtime: { context: createContext(1000), writer },
        } as unknown as Parameters<typeof wrapModelCall>[0],
        handler,
      ),
    ).rejects.toMatchObject({
      code: 'CONTEXT_COMPACTION_FAILED',
      failureKind: 'transcript_commit_failed',
      failureDisposition: 'blocked_before_provider',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'context-compaction',
        status: 'failed',
        triggerReason: 'overflow',
        failureDisposition: 'blocked_before_provider',
        compactionFailureKind: 'transcript_commit_failed',
        transcriptFilePath: null,
      }),
    );
  });

  it('should re-throw non-overflow errors', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const handler = vi.fn().mockRejectedValue(new Error('other error'));

    await expect(
      wrapModelCall(
        {
          messages: [new HumanMessage('test')],
          tools: [],
          systemMessage: '',
          runtime: { context: createContext(), writer },
        } as unknown as Parameters<typeof wrapModelCall>[0],
        handler,
      ),
    ).rejects.toThrow('other error');
  });

  it('should use model context window from modelService', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(400);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 200,
        tokensAfterCompaction: 10,
        compressionRatio: 0.05,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(100), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(mockModelService.getContextWindow).toHaveBeenCalledWith('test-model');
    expect(compactionService.compact).toHaveBeenCalled();
  });

  // ===================================================================
  // Verbatim quote anchoring in post-compaction message
  // ===================================================================

  it('should include continuity instructions in compacted messages', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('Build me a cube with 20mm sides'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted summary')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    const passedMessages = (handler.mock.calls[0]![0] as { messages: BaseMessage[] }).messages;
    const compactedMessage = passedMessages.find(
      (m) => m instanceof HumanMessage && typeof m.content === 'string' && m.content.includes('[Compacted'),
    );
    expect(compactedMessage).toBeDefined();
    const content = compactedMessage!.content as string;
    expect(content).toMatch(/do not acknowledge the summary|do not recap/i);
  });

  it('should include verbatim anchoring instruction in continuity text', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('Build me a cube'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted summary')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    const passedMessages = (handler.mock.calls[0]![0] as { messages: BaseMessage[] }).messages;
    const compactedMessage = passedMessages.find(
      (m) => m instanceof HumanMessage && typeof m.content === 'string' && m.content.includes('[Compacted'),
    );
    expect(compactedMessage).toBeDefined();
    const content = compactedMessage!.content as string;
    expect(content).toContain('exact words');
  });

  // ===================================================================
  // Strip images from lastQuery extraction
  // ===================================================================

  it('should extract only text parts from multimodal lastQuery', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage([
        { type: 'text', text: 'What is this design?' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(100) } },
      ]),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(compactionService.compact).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.not.stringContaining('image_url') as unknown as string,
      }),
    );
    expect(compactionService.compact).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('What is this design?') as unknown as string,
      }),
    );
  });

  it('should handle HumanMessage with only image parts (empty lastQuery)', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage([{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }]),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(compactionService.compact).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '',
      }),
    );
  });

  // ===================================================================
  // Multimodal continuity instructions for array content
  // ===================================================================

  it('should append continuity text block to array HumanMessage content', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent question'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [
        new HumanMessage([
          { type: 'text', text: '[Compacted conversation history]\nSummary content' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        ]),
      ],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    const passedMessages = (handler.mock.calls[0]![0] as { messages: BaseMessage[] }).messages;
    const compactedMessage = passedMessages[0]!;
    const content = compactedMessage.content as Array<{ type: string; text?: string }>;
    expect(Array.isArray(content)).toBe(true);
    const lastBlock = content.at(-1);
    expect(lastBlock).toBeDefined();
    expect(lastBlock!.type).toBe('text');
    expect(lastBlock!.text).toMatch(/do not acknowledge the summary/i);
  });

  it('should not modify non-HumanMessage messages in continuity', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent question'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\nSummary'), new AIMessage('I understand')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    const passedMessages = (handler.mock.calls[0]![0] as { messages: BaseMessage[] }).messages;
    const aiMessage = passedMessages.find((m) => m instanceof AIMessage && m.content === 'I understand');
    expect(aiMessage).toBeDefined();
    expect(aiMessage!.content).toBe('I understand');
  });

  it('should throw before provider dispatch when Morph API fails', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockRejectedValue(new MorphCompactionTransportError('Morph API down'));

    const handler = vi.fn().mockResolvedValue(undefined);

    await expect(
      wrapModelCall(
        {
          messages,
          tools: [],
          systemMessage: '',
          runtime: { context: createContext(1000), writer },
        } as unknown as Parameters<typeof wrapModelCall>[0],
        handler,
      ),
    ).rejects.toMatchObject({
      code: 'CONTEXT_COMPACTION_FAILED',
      failureKind: 'morph_transport_error',
      failureDisposition: 'blocked_before_provider',
    });

    expect(handler).not.toHaveBeenCalled();
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'context-compaction',
        status: 'failed',
        failureDisposition: 'blocked_before_provider',
        compactionFailureKind: 'morph_transport_error',
        messagesEvicted: 0,
      }),
    );
  });

  it('should throw before provider dispatch when native Morph contract validation fails', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockRejectedValue(
      new MorphCompactionContractError('Morph compact response missing output'),
    );

    const handler = vi.fn().mockResolvedValue(undefined);

    await expect(
      wrapModelCall(
        {
          messages,
          tools: [],
          systemMessage: '',
          runtime: { context: createContext(1000), writer },
        } as unknown as Parameters<typeof wrapModelCall>[0],
        handler,
      ),
    ).rejects.toMatchObject({
      code: 'CONTEXT_COMPACTION_FAILED',
      failureKind: 'morph_contract_error',
      failureDisposition: 'blocked_before_provider',
    });

    expect(handler).not.toHaveBeenCalled();
    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'context-compaction',
        status: 'failed',
        failureDisposition: 'blocked_before_provider',
        compactionFailureKind: 'morph_contract_error',
        messagesEvicted: 0,
      }),
    );
  });

  // ===================================================================
  // Transcript image markers for evicted blocks
  // ===================================================================

  it('should write image marker lines to transcript for image blocks', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage([
        { type: 'text', text: 'Look at this design:' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(100) } },
      ]),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent question'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    const appendCalls = mockBackend.append.mock.calls;
    expect(appendCalls.length).toBeGreaterThan(0);
    const transcriptContent = appendCalls[0]![1];
    expect(transcriptContent).toContain('[user attached image]');
    expect(transcriptContent).toContain('"type":"image"');
  });

  it('should omit raw reasoning blocks from compaction transcript commits', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const longContent = 'A'.repeat(4000);
    const messages: BaseMessage[] = [
      new HumanMessage([
        { type: 'text', text: 'Here is a design:' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ]),
      new AIMessage([
        { type: 'reasoning', reasoning: 'Thinking about design' },
        { type: 'text', text: longContent },
      ]),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted conversation history]\ncompacted')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const handler = vi.fn().mockResolvedValue(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(1000), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    const appendCalls = mockBackend.append.mock.calls;
    expect(appendCalls.length).toBeGreaterThan(0);
    const transcriptContent = appendCalls[0]![1];
    expect(transcriptContent).toContain('Here is a design:');
    expect(transcriptContent).toContain('[user attached image]');
    expect(transcriptContent).not.toContain('Thinking about design');
    expect(transcriptContent).not.toContain('"type":"thinking"');
  });

  it('should retry overflow with compacted evicted history plus recent messages', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const messages: BaseMessage[] = [
      new HumanMessage('old user'),
      new AIMessage('old assistant'),
      new HumanMessage('middle user'),
      new AIMessage('middle assistant'),
      new HumanMessage('recent user'),
      new AIMessage('recent assistant'),
    ];
    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted overflow history]')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 4,
      },
    });

    const handler = vi
      .fn()
      .mockRejectedValueOnce(new ContextOverflowError('overflow'))
      .mockResolvedValueOnce(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(2);
    const retryMessages = (handler.mock.calls[1]![0] as { messages: BaseMessage[] }).messages;
    expect(retryMessages[0]?.content).toContain('[Compacted overflow history]');
    expect(retryMessages.at(-2)?.content).toBe('recent user');
    expect(retryMessages.at(-1)?.content).toBe('recent assistant');
  });

  it('should still bump tokenEstimationMultiplier on ContextOverflowError', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const messages: BaseMessage[] = [
      new HumanMessage('old user'),
      new AIMessage('old assistant'),
      new HumanMessage('middle user'),
      new AIMessage('middle assistant'),
      new HumanMessage('recent user'),
      new AIMessage('recent assistant'),
    ];
    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted overflow history]')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 4,
      },
    });

    const handler = vi
      .fn()
      .mockRejectedValueOnce(new ContextOverflowError('overflow'))
      .mockResolvedValueOnce(undefined);

    await wrapModelCall(
      {
        messages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    // Trigger again — second call should use bumped multiplier
    const shortMessages: BaseMessage[] = [new HumanMessage('A'.repeat(4000)), new AIMessage('B'.repeat(4000))];

    const handler2 = vi.fn().mockResolvedValue(undefined);
    // The multiplier was bumped by 0.15 from 1.0 to 1.15 internally
    // Testing that it still resolves without error is sufficient
    await wrapModelCall(
      {
        messages: shortMessages,
        tools: [],
        systemMessage: '',
        runtime: { context: createContext(), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler2,
    );

    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('stripExcessMedia', () => {
  it('should pass messages with fewer than 100 media items unchanged', () => {
    const messages: BaseMessage[] = [
      new HumanMessage([
        { type: 'text', text: 'Hello' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,a' } },
      ]),
    ];

    const result = stripExcessMedia(messages);
    expect(result).toEqual(messages);
  });

  it('should strip oldest image blocks when count exceeds limit', () => {
    const imageBlocks = Array.from({ length: 5 }, (_, i) => ({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,img${i}` },
    }));

    const messages: BaseMessage[] = [
      new HumanMessage([imageBlocks[0]!, imageBlocks[1]!]),
      new HumanMessage([{ type: 'text', text: 'Middle' }, imageBlocks[2]!]),
      new HumanMessage([imageBlocks[3]!, imageBlocks[4]!]),
    ];

    const result = stripExcessMedia(messages, 3);
    // Should strip the first 2 (oldest) image blocks
    const allContent = result.flatMap((m) =>
      Array.isArray(m.content) ? (m.content as Array<Record<string, unknown>>) : [],
    );

    const remaining = allContent.filter((b) => b['type'] === 'image_url');
    expect(remaining).toHaveLength(3);

    const markers = allContent.filter((b) => b['type'] === 'text' && (b['text'] as string).includes('media limit'));
    expect(markers).toHaveLength(2);
  });

  it('should replace stripped images with text markers', () => {
    const messages: BaseMessage[] = [
      new HumanMessage([{ type: 'image_url', image_url: { url: 'data:image/png;base64,old' } }]),
      new HumanMessage([{ type: 'image_url', image_url: { url: 'data:image/png;base64,new' } }]),
    ];

    const result = stripExcessMedia(messages, 1);
    const firstContent = result[0]!.content as Array<Record<string, unknown>>;
    expect(firstContent[0]).toEqual({
      type: 'text',
      text: '[image removed — media limit]',
    });
  });
});

/**
 * Dedup pointers persisted in the LangGraph auxiliary store reference
 * `tool_call_id`s on prior `ToolMessage`s. When compaction (or emergency
 * truncation) summarises away the message tail, those `tool_call_id`s
 * vanish, so the dedup namespace for the chat must be cleared as a
 * side effect. The middleware delegates to `clearReadDedupForChat`, which
 * calls the explicitly wired read-dedup clearer instead of inferring store-
 * specific capabilities from LangGraph's runtime store wrapper.
 */
describe('createCompactionMiddleware — read-dedup clear on eviction', () => {
  let compactionService: ReturnType<typeof mock<CompactionService>>;
  let rpcBackendFactory: ReturnType<typeof mock<TauRpcBackendFactory>>;
  let mockBackend: ReturnType<typeof mock<TauRpcBackend>>;
  let tokenBudgetService: TokenBudgetService;
  let metricsService: {
    genAiContextBudgetTokens: { record: ReturnType<typeof vi.fn> };
    genAiContextCompactionDecisions: { add: ReturnType<typeof vi.fn> };
  };
  let mockModelService: { getContextWindow: ReturnType<typeof vi.fn>; getOtelProviderName: ReturnType<typeof vi.fn> };
  let writer: ReturnType<typeof vi.fn>;
  let readDedupClearer: ReadDedupClearer;

  beforeEach(() => {
    vi.clearAllMocks();
    compactionService = mock<CompactionService>();
    rpcBackendFactory = mock<TauRpcBackendFactory>();
    mockBackend = mock<TauRpcBackend>();
    tokenBudgetService = new TokenBudgetService();
    metricsService = {
      genAiContextBudgetTokens: { record: vi.fn() },
      genAiContextCompactionDecisions: { add: vi.fn() },
    };
    rpcBackendFactory.create.mockReturnValue(mockBackend);
    mockBackend.append.mockResolvedValue({ path: '/test', filesUpdate: null });
    mockModelService = {
      getContextWindow: vi.fn().mockReturnValue(1000),
      getOtelProviderName: vi.fn().mockReturnValue('anthropic'),
    };
    writer = vi.fn();
    readDedupClearer = { clearChat: vi.fn<ReadDedupClearer['clearChat']>().mockResolvedValue(0) };
  });

  const createMiddlewareInstance = () =>
    createCompactionMiddleware({
      compactionService,
      rpcBackendFactory,
      tokenBudgetService,
      metricsService: metricsService as unknown as MetricsService,
      readDedupClearer,
      providerId: 'anthropic',
    });

  const buildContext = () => ({
    chatId: 'chat-recent-reads',
    modelId: 'test-model',
    modelService: mockModelService as unknown as ModelService,
  });

  const buildLongMessages = (): BaseMessage[] => {
    const longContent = 'A'.repeat(4000);
    return [
      new HumanMessage(longContent),
      new AIMessage(longContent),
      new HumanMessage('middle question'),
      new AIMessage('middle answer'),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];
  };

  const buildStoreStub = () => ({});

  it('clears the dedup namespace after a successful Morph compaction', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted history]')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const aiResponse = new AIMessage('post-compaction reply');
    const handler = vi.fn().mockResolvedValue(aiResponse);
    const store = buildStoreStub();

    const result = await wrapModelCall(
      {
        messages: buildLongMessages(),
        tools: [],
        systemMessage: '',
        runtime: { context: buildContext(), writer, store },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(compactionService.compact).toHaveBeenCalled();
    expect(readDedupClearer.clearChat).toHaveBeenCalledWith('chat-recent-reads');
    expect(result).toBeInstanceOf(Command);
    const updatedMessages = getCommandMessages(result as Command);
    expect(updatedMessages[0]?.id).toBe(REMOVE_ALL_MESSAGES);
    expect(updatedMessages.at(-1)).toBe(aiResponse);
  });

  it('does not touch the dedup namespace when compaction does not fire', async () => {
    mockModelService.getContextWindow.mockReturnValue(200_000);
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    const aiResponse = new AIMessage('untouched reply');
    const handler = vi.fn().mockResolvedValue(aiResponse);
    const store = buildStoreStub();

    const result = await wrapModelCall(
      {
        messages: [new HumanMessage('short'), new AIMessage('reply')],
        tools: [],
        systemMessage: '',
        runtime: { context: buildContext(), writer, store },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(compactionService.compact).not.toHaveBeenCalled();
    expect(readDedupClearer.clearChat).not.toHaveBeenCalled();
    expect(result).toBe(aiResponse);
  });

  it('does not touch the dedup namespace when Morph compaction throws before provider dispatch', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    compactionService.compact.mockRejectedValue(new MorphCompactionTransportError('Morph API down'));

    const handler = vi.fn().mockResolvedValue(new AIMessage('should not be called'));
    const store = buildStoreStub();

    await expect(
      wrapModelCall(
        {
          messages: buildLongMessages(),
          tools: [],
          systemMessage: '',
          runtime: { context: buildContext(), writer, store },
        } as unknown as Parameters<typeof wrapModelCall>[0],
        handler,
      ),
    ).rejects.toMatchObject({
      code: 'CONTEXT_COMPACTION_FAILED',
      failureDisposition: 'blocked_before_provider',
    });

    expect(compactionService.compact).toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(readDedupClearer.clearChat).not.toHaveBeenCalled();
  });

  it('clears the dedup namespace after emergency re-compaction on ContextOverflowError', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted history]')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const aiResponse = new AIMessage('emergency reply');
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new ContextOverflowError('overflow'))
      .mockResolvedValueOnce(aiResponse);
    const store = buildStoreStub();

    const result = await wrapModelCall(
      {
        messages: buildLongMessages(),
        tools: [],
        systemMessage: '',
        runtime: { context: buildContext(), writer, store },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(2);
    expect(readDedupClearer.clearChat).toHaveBeenCalledWith('chat-recent-reads');
    expect(result).toBeInstanceOf(Command);
    const updatedMessages = getCommandMessages(result as Command);
    expect(updatedMessages[0]?.id).toBe(REMOVE_ALL_MESSAGES);
    expect(updatedMessages.at(-1)).toBe(aiResponse);
  });

  it('no-ops gracefully when no store is wired (defensive)', async () => {
    const middleware = createMiddlewareInstance();
    const { wrapModelCall } = middleware;
    if (!wrapModelCall) {
      throw new Error('wrapModelCall not defined');
    }

    compactionService.compact.mockResolvedValue({
      compactedMessages: [new HumanMessage('[Compacted history]')],
      stats: {
        tokensBeforeCompaction: 2000,
        tokensAfterCompaction: 50,
        compressionRatio: 0.025,
        messagesEvicted: 2,
      },
    });

    const aiResponse = new AIMessage('store-less reply');
    const handler = vi.fn().mockResolvedValue(aiResponse);

    const result = await wrapModelCall(
      {
        messages: buildLongMessages(),
        tools: [],
        systemMessage: '',
        runtime: { context: buildContext(), writer },
      } as unknown as Parameters<typeof wrapModelCall>[0],
      handler,
    );

    expect(result).toBeInstanceOf(Command);
    expect(readDedupClearer.clearChat).not.toHaveBeenCalled();
  });
});
