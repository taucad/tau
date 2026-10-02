import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { FastifyReply } from 'fastify';
import type { StreamTextResult as StreamTextResultType, ToolSet, UIMessage, UIMessageChunk } from 'ai';
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain';
import type { ChatUsageTokens, MyUIMessage, ChatSnapshot, AgentConfig } from '@taucad/chat';
import { ToolMessage } from '@langchain/core/messages';
import { ChatController } from '#api/chat/chat.controller.js';
import { ChatService } from '#api/chat/chat.service.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { ModelService } from '#api/models/model.service.js';
import { FileEditService } from '#api/file-edit/file-edit.service.js';
import { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';
import { AuthGuard } from '#auth/auth.guard.js';
import type { CreateChatDto } from '#api/chat/chat.dto.js';
import { MetricsService } from '#telemetry/metrics.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';
import { EagerToolDispatchHandler } from '#api/chat/eager-dispatch/eager-tool-dispatch.handler.js';

// Mock the @ai-sdk/langchain module
vi.mock('@ai-sdk/langchain', () => ({
  toBaseMessages: vi.fn(async () => [{ content: 'test message' }]),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- AI SDK naming
  toUIMessageStream: vi.fn(
    () =>
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
  ),
}));

// Mock the ai module - use importOriginal to keep other exports
vi.mock('ai', async (importOriginal) => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-imports -- Import original module
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    convertToModelMessages: vi.fn(async () => [{ role: 'user', content: 'test' }]),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- AI SDK naming
    createUIMessageStreamResponse: vi.fn(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200 },
        ),
    ),
  };
});

/**
 * Type for the streamText return value used in name/commit generators.
 * We use the actual return type from the AI SDK to ensure type safety.
 */
type StreamTextResult = StreamTextResultType<ToolSet, never>;

// Helper to create a minimal user message for tests. Per-turn agent config
// now lives on `body.agent` (see `chatTurnRequestSchema`), so the message
// itself stays metadata-free.
function createMockUserMessage(): MyUIMessage {
  return {
    id: 'msg_1',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
  };
}

type CadAgent = Extract<AgentConfig, { profile: 'cad' }>;

const cadAgent = (overrides: Partial<CadAgent> = {}): CadAgent => ({
  profile: 'cad',
  model: 'test-model',
  kernel: 'openscad',
  mode: 'agent',
  toolChoice: 'auto',
  testingEnabled: true,
  snapshot: {},
  contextPayload: {},
  ...overrides,
});

const projectNameAgent: AgentConfig = { profile: 'project_name' };
const commitNameAgent: AgentConfig = { profile: 'commit_name' };

// Helper to create mock agent with graph property
function createMockAgent(): {
  graph: {
    stream: ReturnType<typeof vi.fn>;
  };
} {
  const mockStream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  return {
    graph: {
      stream: vi.fn().mockResolvedValue(mockStream),
    },
  };
}

/**
 * Creates a deep mock of the streamText return type.
 * Uses vitest-mock-extended for proper type safety.
 *
 * The controller uses: result.toUIMessageStream().pipeThrough(new JsonToSseTransformStream())
 * which then returns a stream that has .pipeThrough(new TextEncoderStream())
 */
function createMockStreamResult(): DeepMockProxy<StreamTextResult> {
  const mockResult = mockDeep<StreamTextResult>();

  // Create the mock stream chain that the controller expects
  // The controller calls: toUIMessageStream().pipeThrough(...).pipeThrough(...)
  const mockUiMessageStream = mockDeep<ReturnType<StreamTextResult['toUIMessageStream']>>();
  const mockFinalStream = mockDeep<ReadableStream<Uint8Array<ArrayBuffer>>>();
  const mockIntermediateStream = mockDeep<ReadableStream>();
  mockIntermediateStream.pipeThrough.mockReturnValue(mockFinalStream);
  mockUiMessageStream.pipeThrough.mockReturnValue(mockIntermediateStream);
  mockResult.toUIMessageStream.mockReturnValue(mockUiMessageStream);

  return mockResult;
}

/**
 * Creates a deep mock of FastifyReply with pre-configured chainable methods.
 * Uses vitest-mock-extended for proper type safety.
 */
function createMockResponse(): DeepMockProxy<FastifyReply> {
  const mockReply = mockDeep<FastifyReply>();

  // Configure chainable methods to return the mock itself
  mockReply.header.mockReturnThis();
  mockReply.send.mockReturnThis();

  return mockReply;
}

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;
  let module: TestingModule;
  let mockAgent: ReturnType<typeof createMockAgent>;
  let checkpointGetTupleMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    checkpointGetTupleMock = vi.fn().mockResolvedValue(null);

    mockAgent = createMockAgent();

    const mockChatService = {
      createAgent: vi.fn().mockResolvedValue(mockAgent),
      getBuildNameGenerator: vi.fn(),
      getCommitMessageGenerator: vi.fn(),
    };

    const mockModelService = {
      normalizeUsageTokens: vi.fn().mockImplementation((_modelId, usage) => usage as ChatUsageTokens),
      getModelCost: vi.fn().mockReturnValue({
        inputTokensCost: 0,
        outputTokensCost: 0,
        cacheReadTokensCost: 0,
        cacheWriteTokensCost: 0,
        totalCost: 0,
      }),
    };

    const mockChatRpcService = {
      registerAbortSignal: vi.fn(),
    };

    const mockFileEditService = {};

    const mockGeometryAnalysisService = {};

    const mockCheckpointerService = {
      getCheckpointer: vi.fn(() => ({
        getTuple: checkpointGetTupleMock,
      })),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: ChatRpcService,
          useValue: mockChatRpcService,
        },
        {
          provide: ModelService,
          useValue: mockModelService,
        },
        {
          provide: FileEditService,
          useValue: mockFileEditService,
        },
        {
          provide: GeometryAnalysisService,
          useValue: mockGeometryAnalysisService,
        },
        {
          provide: MetricsService,
          useValue: new MetricsService(),
        },
        {
          provide: CheckpointerService,
          useValue: mockCheckpointerService,
        },
        Reflector,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get<ChatController>(ChatController);
    chatService = moduleRef.get<ChatService>(ChatService);
    module = moduleRef;
  });

  afterEach(async () => {
    await module.close();
  });

  describe('createChat - Agent Execution', () => {
    it('should execute agent with correct parameters', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const body = {
        id: 'chat_123',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert
      expect(chatService.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 'chat_123',
          modelId: 'test-model',
          kernel: 'openscad',
          mode: 'agent',
          tools: { choice: 'auto', testingEnabled: true },
          /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest `expect.any()` is typed as `any` */
          eagerDispatchHandler: expect.any(EagerToolDispatchHandler),
        }),
      );
      expect(mockAgent.graph.stream).toHaveBeenCalledTimes(1);

      // Verify stream was called with messages and correct config
      const [streamArguments, streamConfig] = mockAgent.graph.stream.mock.calls[0] as [
        { messages: unknown[] },
        {
          configurable: { thread_id: string };
          callbacks?: unknown[];
          streamMode?: unknown;
          maxConcurrency?: number;
        },
      ];
      expect(streamArguments).toHaveProperty('messages');
      expect(Array.isArray(streamArguments.messages)).toBe(true);
      expect(streamConfig.callbacks?.length).toBe(2);
      expect(streamConfig.streamMode).toEqual(['values', 'messages', 'custom']);
      expect(streamConfig.configurable.thread_id).toBe('chat_123');
      // Parallel tool calls run unthrottled. `maxConcurrency: 1` triggers an
      // upstream off-by-one in @langchain/langgraph 1.1.5
      // (PregelRunner._executeTasksWithRetry) that drops every task after the
      // first when the cap is below `tasks.length`.
      expect(streamConfig.maxConcurrency).toBeUndefined();

      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('splices Postgres checkpoint ToolMessage values into stale assistant tool parts before toBaseMessages', async () => {
      checkpointGetTupleMock.mockResolvedValueOnce({
        checkpoint: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph wire shape uses snake_case
          channel_values: {
            messages: [
              new ToolMessage({
                content: JSON.stringify({ merged: true }),
                // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain wire shape uses snake_case
                tool_call_id: 'cid_ck_merge_controller',
              }),
            ],
          },
        },
      });

      vi.mocked(toBaseMessages).mockClear();

      const assistantMessage: MyUIMessage = {
        id: 'm_as',
        role: 'assistant',
        parts: [
          {
            type: 'tool-create_file',
            toolCallId: 'cid_ck_merge_controller',
            state: 'input-available',
            input: { targetFile: 'z.scad', content: '//' },
          },
        ],
        metadata: { createdAt: 1 },
      };

      // Order matches the new chat-request contract: the assistant turn whose
      // stale tool part the checkpoint splice repairs sits before the trailing
      // user message that drives the current turn. Per-turn config lives on
      // `body.agent`, not on the user message itself.
      await controller.createChat(
        {
          id: 'chat_ck_merge_integration',
          messages: [createMockUserMessage(), assistantMessage, createMockUserMessage()],
          agent: cadAgent(),
        } satisfies CreateChatDto,
        createMockResponse(),
      );

      expect(checkpointGetTupleMock).toHaveBeenCalledTimes(1);
      expect(checkpointGetTupleMock).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangGraph configurable uses snake_case
        configurable: { thread_id: 'chat_ck_merge_integration' },
      });

      expect(vi.mocked(toBaseMessages)).toHaveBeenCalledTimes(1);
      const passedIntoBase = vi.mocked(toBaseMessages).mock.calls[0]?.[0] as MyUIMessage[];
      const splicedAssistant = passedIntoBase.find((message) => message.id === 'm_as');
      expect(splicedAssistant?.parts[0]).toMatchObject({
        toolCallId: 'cid_ck_merge_controller',
        state: 'output-available',
        output: { merged: true },
      });
    });

    it('should use custom tool choice when provided', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const body = {
        id: 'chat_tool_choice',
        messages: [createMockUserMessage()],
        agent: cadAgent({ toolChoice: 'none' }),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert
      expect(chatService.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 'chat_tool_choice',
          modelId: 'test-model',
          kernel: 'openscad',
          mode: 'agent',
          tools: { choice: 'none', testingEnabled: true },
          /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest `expect.any()` is typed as `any` */
          eagerDispatchHandler: expect.any(EagerToolDispatchHandler),
        }),
      );
    });
  });

  describe('createChat - Name Generator Bypass', () => {
    it('should use name generator when agent.profile is project_name', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const body = {
        id: 'chat_name_gen',
        messages: [createMockUserMessage()],
        agent: projectNameAgent,
      } satisfies CreateChatDto;

      const mockStreamResult = createMockStreamResult();
      vi.mocked(chatService.getBuildNameGenerator).mockReturnValue(mockStreamResult);

      // Act
      await controller.createChat(body, mockResponse);

      // Assert
      expect(chatService.getBuildNameGenerator).toHaveBeenCalled();
      expect(chatService.createAgent).not.toHaveBeenCalled();
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should use commit message generator when agent.profile is commit_name', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const body = {
        id: 'chat_commit_gen',
        messages: [createMockUserMessage()],
        agent: commitNameAgent,
      } satisfies CreateChatDto;

      const mockStreamResult = createMockStreamResult();
      vi.mocked(chatService.getCommitMessageGenerator).mockReturnValue(mockStreamResult);

      // Act
      await controller.createChat(body, mockResponse);

      // Assert
      expect(chatService.getCommitMessageGenerator).toHaveBeenCalled();
      expect(chatService.createAgent).not.toHaveBeenCalled();
      expect(mockResponse.send).toHaveBeenCalled();
    });
  });

  // Validation of the chat request body lives in `chat.dto.ts` as a single
  // Zod schema (`chatTurnRequestSchema`) enforced at the Fastify body-parse
  // boundary by `nestjs-zod`'s validation pipe. Cases like "agent is missing"
  // and "agent.kernel is unknown" are covered by `chat.dto.test.ts`; this
  // spec exercises only post-validation controller behaviour.

  describe('createChat - Response Headers', () => {
    it('should set correct SSE headers for agent execution', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const body = {
        id: 'chat_headers',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert
      expect(mockResponse.header).toHaveBeenCalledWith('content-type', 'text/event-stream');
      expect(mockResponse.header).toHaveBeenCalledWith('x-vercel-ai-ui-message-stream', 'v1');
      expect(mockResponse.header).toHaveBeenCalledWith('x-accel-buffering', 'no');
    });
  });

  describe('createChat - Adapter Integration', () => {
    it('should use toUIMessageStream to convert agent stream', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const body = {
        id: 'chat_adapter',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert
      // The agent.graph.stream should have been called
      expect(mockAgent.graph.stream).toHaveBeenCalled();
      // Response should have been sent
      expect(mockResponse.send).toHaveBeenCalled();
    });
  });

  describe('createChat - Snapshot Context Injection', () => {
    it('should inject snapshot context into messages passed to toBaseMessages', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const snapshot = {
        fileTree: [
          { path: 'src', name: 'src', type: 'dir', size: 0 },
          { path: 'src/main.scad', name: 'main.scad', type: 'file', size: 1024 },
        ],
        activeFile: { path: 'src/main.scad', name: 'main.scad' },
        openFiles: [{ path: 'src/main.scad', name: 'main.scad' }],
      } as const satisfies ChatSnapshot;

      const messageWithSnapshot: MyUIMessage = {
        id: 'msg_snapshot',
        role: 'user',
        parts: [{ type: 'text', text: 'Create a cube' }],
      };

      const body = {
        id: 'chat_snapshot',
        messages: [messageWithSnapshot],
        agent: cadAgent({ snapshot }),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Verify toBaseMessages was called with messages containing injected context
      expect(toBaseMessages).toHaveBeenCalledTimes(1);
      const [messagesArgument] = vi.mocked(toBaseMessages).mock.calls[0] as [UIMessage[]];

      // The message should have 2 parts: injected context + original text
      expect(messagesArgument).toHaveLength(1);
      expect(messagesArgument[0]?.parts).toHaveLength(2);

      // First part should be the injected editor context
      const contextPart = messagesArgument[0]?.parts[0] as { type: 'text'; text: string };
      expect(contextPart.type).toBe('text');
      expect(contextPart.text).toContain('<system-reminder>');
      expect(contextPart.text).toContain('<active_file>');
      expect(contextPart.text).toContain('src/main.scad');
      expect(contextPart.text).toContain('<project_layout>');
      expect(contextPart.text).toContain('main.scad (1KB)');
      expect(contextPart.text).toContain('</system-reminder>');

      // Second part should be the original user message
      const originalPart = messagesArgument[0]?.parts[1] as { type: 'text'; text: string };
      expect(originalPart.type).toBe('text');
      expect(originalPart.text).toBe('Create a cube');
    });

    it('should pass original messages unchanged when no snapshot is provided', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const messageWithoutSnapshot: MyUIMessage = {
        id: 'msg_no_snapshot',
        role: 'user',
        parts: [{ type: 'text', text: 'Create a sphere' }],
      };

      const body = {
        id: 'chat_no_snapshot',
        messages: [messageWithoutSnapshot],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Verify toBaseMessages was called with original messages (no context injection)
      expect(toBaseMessages).toHaveBeenCalledTimes(1);
      const [messagesArgument] = vi.mocked(toBaseMessages).mock.calls[0] as [UIMessage[]];

      // The message should have only 1 part (the original text, no injected context)
      expect(messagesArgument).toHaveLength(1);
      expect(messagesArgument[0]?.parts).toHaveLength(1);

      const originalPart = messagesArgument[0]?.parts[0] as { type: 'text'; text: string };
      expect(originalPart.type).toBe('text');
      expect(originalPart.text).toBe('Create a sphere');
      expect(originalPart.text).not.toContain('<system-reminder>');
    });

    it('should inject only activeFile context when only activeFile is provided', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const partialSnapshot = {
        activeFile: { path: 'main.scad', name: 'main.scad' },
      };

      const messageWithPartialSnapshot: MyUIMessage = {
        id: 'msg_partial_snapshot',
        role: 'user',
        parts: [{ type: 'text', text: 'Help me' }],
      };

      const body = {
        id: 'chat_partial_snapshot',
        messages: [messageWithPartialSnapshot],
        agent: cadAgent({ snapshot: partialSnapshot }),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Verify context contains only activeFile (no fileTree, no openFiles)
      expect(toBaseMessages).toHaveBeenCalledTimes(1);
      const [messagesArgument] = vi.mocked(toBaseMessages).mock.calls[0] as [UIMessage[]];

      expect(messagesArgument[0]?.parts).toHaveLength(2);
      const contextPart = messagesArgument[0]?.parts[0] as { type: 'text'; text: string };

      expect(contextPart.text).toContain('<system-reminder>');
      expect(contextPart.text).toContain('<active_file>');
      expect(contextPart.text).toContain('main.scad');
      expect(contextPart.text).not.toContain('<project_layout>');
      expect(contextPart.text).not.toContain('<open_files>');
    });

    it('should not inject context when snapshot has only empty arrays', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const emptySnapshot = {
        fileTree: [],
        openFiles: [],
      };

      const messageWithEmptySnapshot: MyUIMessage = {
        id: 'msg_empty_snapshot',
        role: 'user',
        parts: [{ type: 'text', text: 'Test' }],
      };

      const body = {
        id: 'chat_empty_snapshot',
        messages: [messageWithEmptySnapshot],
        agent: cadAgent({ snapshot: emptySnapshot }),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Empty arrays mean no context to inject, so messages should be unchanged
      expect(toBaseMessages).toHaveBeenCalledTimes(1);
      const [messagesArgument] = vi.mocked(toBaseMessages).mock.calls[0] as [UIMessage[]];

      // With empty arrays and no activeFile, there's nothing to inject
      expect(messagesArgument[0]?.parts).toHaveLength(1);
      const originalPart = messagesArgument[0]?.parts[0] as { type: 'text'; text: string };
      expect(originalPart.text).toBe('Test');
      expect(originalPart.text).not.toContain('<system-reminder>');
    });
  });

  describe('createChat - Error Transform Pipeline', () => {
    /**
     * Helper to mock toUIMessageStream with given chunks.
     */
    function mockStreamWithChunks(chunks: UIMessageChunk[]): void {
      vi.mocked(toUIMessageStream).mockReturnValueOnce(
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }

            controller.close();
          },
        }),
      );
    }

    /**
     * Helper to capture the transformed stream passed to createUIMessageStreamResponse.
     * Returns a function that retrieves the captured stream after the controller is called.
     */
    async function setupStreamCapture(): Promise<() => ReadableStream<UIMessageChunk>> {
      const { createUIMessageStreamResponse: createUiStream } = await import('ai');
      let capturedStream: ReadableStream<UIMessageChunk> | undefined;

      vi.mocked(createUiStream).mockImplementationOnce(({ stream }) => {
        capturedStream = stream as ReadableStream<UIMessageChunk>;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200 },
        );
      });

      return () => {
        if (!capturedStream) {
          throw new Error('Stream was not captured - ensure controller.createChat was called');
        }

        return capturedStream;
      };
    }

    it('should normalize error chunks through the error transform pipeline', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const rawErrorChunk: UIMessageChunk = { type: 'error', errorText: 'Rate limit exceeded' };
      mockStreamWithChunks([rawErrorChunk]);
      const getStream = await setupStreamCapture();

      const body = {
        id: 'chat_error_transform',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Read the captured stream to verify error was normalized
      const reader = getStream().getReader();
      const { value: transformedChunk } = await reader.read();

      expect(transformedChunk).toBeDefined();
      expect(transformedChunk!.type).toBe('error');

      // The errorText should now be a JSON string with normalized error structure
      const errorChunk = transformedChunk as { type: 'error'; errorText: string };
      const normalizedError = JSON.parse(errorChunk.errorText) as {
        category: string;
        title: string;
        message: string;
        raw: string;
      };

      // Verify the error was normalized with proper category detection
      expect(normalizedError.category).toBe('rate_limit');
      expect(normalizedError.title).toBe('Rate Limit Exceeded');
      expect(normalizedError.message).toContain('Rate limit exceeded');
      expect(normalizedError.raw).toBe('Rate limit exceeded');
    });

    it('should normalize tool_use/tool_result errors with correct category', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const toolErrorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'tool_use block must be followed by a tool_result block',
      };
      mockStreamWithChunks([toolErrorChunk]);
      const getStream = await setupStreamCapture();

      const body = {
        id: 'chat_tool_error',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Verify tool error was normalized with tool_error category
      const reader = getStream().getReader();
      const { value: transformedChunk } = await reader.read();
      const errorChunk = transformedChunk as { type: 'error'; errorText: string };
      const normalizedError = JSON.parse(errorChunk.errorText) as {
        category: string;
        message: string;
      };

      expect(normalizedError.category).toBe('tool_error');
      expect(normalizedError.message).toContain('tool_use');
      expect(normalizedError.message).toContain('tool_result');
    });

    it('should normalize abort errors with cancelled category', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const abortErrorChunk: UIMessageChunk = { type: 'error', errorText: 'Aborted' };
      mockStreamWithChunks([abortErrorChunk]);
      const getStream = await setupStreamCapture();

      const body = {
        id: 'chat_abort_error',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Verify abort error was normalized with cancelled category
      const reader = getStream().getReader();
      const { value: transformedChunk } = await reader.read();
      const errorChunk = transformedChunk as { type: 'error'; errorText: string };
      const normalizedError = JSON.parse(errorChunk.errorText) as {
        category: string;
        title: string;
        message: string;
        raw: string;
      };

      expect(normalizedError.category).toBe('cancelled');
      expect(normalizedError.title).toBe('Request Cancelled');
      expect(normalizedError.message).toContain('Aborted');
      expect(normalizedError.raw).toBe('Aborted');
    });

    it('should pass non-error chunks through unchanged', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const textChunk: UIMessageChunk = { type: 'text-delta', delta: 'Hello world', id: 'msg_1' };
      mockStreamWithChunks([textChunk]);
      const getStream = await setupStreamCapture();

      const body = {
        id: 'chat_text_passthrough',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Text chunk should pass through unchanged
      const reader = getStream().getReader();
      const { value: transformedChunk } = await reader.read();

      expect(transformedChunk).toEqual(textChunk);
    });

    it('should handle multiple chunks including errors in sequence', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const textChunk: UIMessageChunk = { type: 'text-delta', delta: 'Processing...', id: 'msg_1' };
      const errorChunk: UIMessageChunk = { type: 'error', errorText: 'Authentication failed' };
      mockStreamWithChunks([textChunk, errorChunk]);
      const getStream = await setupStreamCapture();

      const body = {
        id: 'chat_multi_chunk',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - Read all chunks and verify each is handled correctly
      const reader = getStream().getReader();

      // First chunk: text should pass through unchanged
      const { value: firstChunk } = await reader.read();
      expect(firstChunk).toEqual(textChunk);

      // Second chunk: error should be normalized
      const { value: secondChunk } = await reader.read();
      const normalizedErrorChunk = secondChunk as { type: 'error'; errorText: string };
      expect(normalizedErrorChunk.type).toBe('error');

      const normalizedError = JSON.parse(normalizedErrorChunk.errorText) as { category: string };
      expect(normalizedError.category).toBe('auth');
    });
  });

  describe('createChat - Static Tool Transform Pipeline', () => {
    /**
     * Type for tool input chunks with dynamic flag for testing.
     */
    type ToolInputChunk = {
      type: 'tool-input-available';
      toolCallId: string;
      toolName: string;
      input: unknown;
      dynamic?: boolean;
    };

    /**
     * Helper to mock toUIMessageStream with given tool input chunks.
     */
    function mockToolStream(chunks: ToolInputChunk[]): void {
      vi.mocked(toUIMessageStream).mockReturnValueOnce(
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk as unknown as UIMessageChunk);
            }

            controller.close();
          },
        }),
      );
    }

    /**
     * Helper to capture the transformed stream passed to createUIMessageStreamResponse.
     * Returns a function that retrieves the captured stream after the controller is called.
     */
    async function setupStreamCapture(): Promise<() => ReadableStream<UIMessageChunk>> {
      const { createUIMessageStreamResponse: createUiStream } = await import('ai');
      let capturedStream: ReadableStream<UIMessageChunk> | undefined;

      vi.mocked(createUiStream).mockImplementationOnce(({ stream }) => {
        capturedStream = stream as ReadableStream<UIMessageChunk>;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200 },
        );
      });

      return () => {
        if (!capturedStream) {
          throw new Error('Stream was not captured - ensure controller.createChat was called');
        }

        return capturedStream;
      };
    }

    it('should strip dynamic flag from read_file tool-input-available chunks', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const readFileToolChunk: ToolInputChunk = {
        type: 'tool-input-available',
        toolCallId: 'call_read_123',
        toolName: 'read_file',
        input: { path: '/src/main.scad' },
        dynamic: true,
      };
      mockToolStream([readFileToolChunk]);
      const getStream = await setupStreamCapture();

      const body = {
        id: 'chat_static_tool',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - read_file should have dynamic flag stripped
      const reader = getStream().getReader();
      const { value: transformedChunk } = await reader.read();

      expect(transformedChunk).toBeDefined();
      const toolChunk = transformedChunk as ToolInputChunk;

      expect(toolChunk.type).toBe('tool-input-available');
      expect(toolChunk.toolName).toBe('read_file');
      expect(toolChunk.input).toEqual({ path: '/src/main.scad' });
      expect(toolChunk.dynamic).toBeUndefined();
    });

    it('should preserve dynamic flag for unknown/dynamic tools', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const unknownToolChunk: ToolInputChunk = {
        type: 'tool-input-available',
        toolCallId: 'call_unknown_456',
        toolName: 'some_dynamic_tool',
        input: { data: 'test' },
        dynamic: true,
      };
      mockToolStream([unknownToolChunk]);
      const getStream = await setupStreamCapture();

      const body = {
        id: 'chat_dynamic_tool',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert - unknown tool should keep dynamic flag
      const reader = getStream().getReader();
      const { value: transformedChunk } = await reader.read();

      const toolChunk = transformedChunk as ToolInputChunk;
      expect(toolChunk.toolName).toBe('some_dynamic_tool');
      expect(toolChunk.dynamic).toBe(true);
    });

    it('should handle mixed static and dynamic tools in sequence', async () => {
      // Arrange
      const mockResponse = createMockResponse();

      const staticToolChunk: ToolInputChunk = {
        type: 'tool-input-available',
        toolCallId: 'call_1',
        toolName: 'read_file',
        input: { path: '/test.scad' },
        dynamic: true,
      };
      const dynamicToolChunk: ToolInputChunk = {
        type: 'tool-input-available',
        toolCallId: 'call_2',
        toolName: 'custom_plugin_tool',
        input: {},
        dynamic: true,
      };
      mockToolStream([staticToolChunk, dynamicToolChunk]);
      const getStream = await setupStreamCapture();

      const body = {
        id: 'chat_mixed_tools',
        messages: [createMockUserMessage()],
        agent: cadAgent(),
      } satisfies CreateChatDto;

      // Act
      await controller.createChat(body, mockResponse);

      // Assert
      const reader = getStream().getReader();

      // First chunk: read_file should have dynamic stripped
      const { value: firstChunk } = await reader.read();
      const staticResult = firstChunk as ToolInputChunk;
      expect(staticResult.toolName).toBe('read_file');
      expect(staticResult.dynamic).toBeUndefined();

      // Second chunk: custom tool should keep dynamic
      const { value: secondChunk } = await reader.read();
      const dynamicResult = secondChunk as ToolInputChunk;
      expect(dynamicResult.toolName).toBe('custom_plugin_tool');
      expect(dynamicResult.dynamic).toBe(true);
    });
  });
});
