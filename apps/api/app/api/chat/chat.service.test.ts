import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { createAgent } from 'langchain';
import type { ToolName } from '@taucad/chat';
import { toolName } from '@taucad/chat/constants';
import { ChatService } from '#api/chat/chat.service.js';
import { ModelService } from '#api/models/model.service.js';
import { ToolService } from '#api/tools/tool.service.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';
import { StoreService } from '#api/chat/store.service.js';
import { CompactionService } from '#api/chat/compaction.service.js';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { newlineTrimmerMiddleware } from '#api/chat/middleware/newline-trimmer.middleware.js';
import { latexDelimiterMiddleware } from '#api/chat/middleware/latex-delimiter.middleware.js';
import type { EagerToolDispatchHandler } from '#api/chat/eager-dispatch/eager-tool-dispatch.handler.js';

// Mock other dependencies
vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => 'mocked-model'),
}));

vi.mock('langchain', () => ({
  createAgent: vi.fn(() => ({})),
  createMiddleware: vi.fn((config: unknown) => config),
}));

vi.mock('#api/chat/prompts/cad-agent.prompt.js', () => ({
  getCadSystemPrompt: vi.fn().mockResolvedValue({ static: 'static prompt', dynamic: 'dynamic prompt' }),
}));

vi.mock('#api/chat/utils/create-cached-system-message.js', () => ({
  createCachedSystemMessage: vi.fn((options: unknown) => options),
}));

describe('ChatService', () => {
  let service: ChatService;
  let module: TestingModule;

  const mockCheckpointer = { id: 'mock-checkpointer' };

  const mockCheckpointerService = {
    getCheckpointer: vi.fn(() => mockCheckpointer),
  };

  const mockStore = { id: 'mock-store' };
  const mockReadDedupClearer = { clearChat: vi.fn() };
  const mockStoreService = {
    getStore: vi.fn(() => mockStore),
    getReadDedupClearer: vi.fn(() => mockReadDedupClearer),
  };

  const mockModelService = {
    buildModel: vi.fn(() => ({ model: 'mock-model' })),
    createProviderDiagnosticsContext: vi.fn((options: Record<string, unknown>) => ({
      ...options,
      verbose: false,
      nextProviderAttemptId: vi.fn(() => 1),
      setLatestModelCallSummary: vi.fn(),
      getLatestModelCallSummary: vi.fn(),
    })),
    getContextWindow: vi.fn(() => 200_000),
    getProviderId: vi.fn(() => 'openai'),
    getKnowledgeCutoff: vi.fn(() => '2025-08'),
    getOtelProviderName: vi.fn(() => 'openai'),
    filterProviderToolNamesForModel: vi.fn(({ toolNames }: { readonly toolNames: readonly ToolName[] }) => [
      ...toolNames,
    ]),
  };

  const mockToolService = {
    getTools: vi.fn(() => ({
      tools: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Tool name uses snake_case
        test_model: { name: 'test_model' },
      },
    })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const mockChatRpcService = { sendRpcRequest: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: CheckpointerService, useValue: mockCheckpointerService },
        { provide: StoreService, useValue: mockStoreService },
        { provide: ModelService, useValue: mockModelService },
        { provide: ToolService, useValue: mockToolService },
        { provide: MetricsService, useValue: new MetricsService() },
        { provide: CompactionService, useValue: { compact: vi.fn() } },
        { provide: TokenBudgetService, useValue: new TokenBudgetService() },
        { provide: TauRpcBackendFactory, useValue: { create: vi.fn() } },
        { provide: ChatRpcService, useValue: mockChatRpcService },
      ],
    }).compile();

    service = moduleRef.get<ChatService>(ChatService);
    module = moduleRef;
  });

  afterEach(async () => {
    await module.close();
  });

  describe('createAgent', () => {
    it('should get checkpointer from CheckpointerService', async () => {
      // Act
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      // Assert
      expect(mockCheckpointerService.getCheckpointer).toHaveBeenCalledTimes(1);
    });

    it('should get read-dedup clearer from StoreService', async () => {
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      expect(mockStoreService.getReadDedupClearer).toHaveBeenCalledTimes(1);
    });

    it('should reuse the same checkpointer across multiple agent creations', async () => {
      // Act - create multiple agents (simulating multiple chat requests)
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-2',
        kernel: 'replicad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-3',
        kernel: 'jscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      // Assert - checkpointer retrieved each time (but same instance from service)
      expect(mockCheckpointerService.getCheckpointer).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent agent creation', async () => {
      // Act - simulate multiple concurrent chat requests
      await Promise.all([
        service.createAgent({
          chatId: 'test-chat-1',
          modelId: 'model-1',
          kernel: 'openscad',
          mode: 'agent',
          tools: { choice: 'auto', testingEnabled: true },
        }),
        service.createAgent({
          chatId: 'test-chat-1',
          modelId: 'model-2',
          kernel: 'replicad',
          mode: 'agent',
          tools: { choice: 'auto', testingEnabled: true },
        }),
        service.createAgent({
          chatId: 'test-chat-1',
          modelId: 'model-3',
          kernel: 'jscad',
          mode: 'agent',
          tools: { choice: 'auto', testingEnabled: true },
        }),
        service.createAgent({
          chatId: 'test-chat-1',
          modelId: 'model-4',
          kernel: 'openscad',
          mode: 'agent',
          tools: { choice: 'auto', testingEnabled: true },
        }),
        service.createAgent({
          chatId: 'test-chat-1',
          modelId: 'model-5',
          kernel: 'replicad',
          mode: 'agent',
          tools: { choice: 'auto', testingEnabled: true },
        }),
      ]);

      // Assert
      expect(mockCheckpointerService.getCheckpointer).toHaveBeenCalledTimes(5);
    });

    it('should build model with provided modelId', async () => {
      // Act
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'claude-3-opus',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      // Assert
      type BuildModelCall = [
        string,
        {
          providerDiagnosticsContext: {
            chatId: string;
            modelId: string;
            providerId: string;
          };
        },
      ];
      const buildModelCalls = mockModelService.buildModel.mock.calls as unknown as BuildModelCall[];
      const buildModelCall = buildModelCalls.at(-1);

      expect(buildModelCall?.[0]).toBe('claude-3-opus');
      expect(buildModelCall?.[1].providerDiagnosticsContext).toMatchObject({
        chatId: 'test-chat-1',
        modelId: 'claude-3-opus',
        providerId: 'openai',
      });
    });

    it('should get tools with provided tool selection', async () => {
      // Act
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      // Assert
      expect(mockToolService.getTools).toHaveBeenCalledWith('auto', 'openscad');
    });

    it('should filter provider tools through ModelService before creating the agent', async () => {
      const testModelTool = { name: toolName.testModel };
      const kernelTool = { name: toolName.getKernelResult };
      const screenshotTool = { name: toolName.screenshot };
      vi.mocked(mockToolService.getTools).mockReturnValueOnce({
        tools: {
          [toolName.testModel]: testModelTool,
          [toolName.getKernelResult]: kernelTool,
          [toolName.screenshot]: screenshotTool,
        },
      });
      vi.mocked(mockModelService.filterProviderToolNamesForModel).mockReturnValueOnce([
        toolName.testModel,
        toolName.getKernelResult,
      ]);
      const eagerDispatchHandler = {
        entries: new Map(),
        setWriter: vi.fn(),
        bindTools: vi.fn(),
      } as unknown as EagerToolDispatchHandler;

      await service.createAgent({
        chatId: 'test-chat-filtered-tools',
        modelId: 'together-glm-5.2',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
        eagerDispatchHandler,
      });

      expect(mockModelService.filterProviderToolNamesForModel).toHaveBeenCalledWith({
        modelId: 'together-glm-5.2',
        toolNames: expect.arrayContaining([toolName.testModel, toolName.getKernelResult, toolName.screenshot]),
      });
      const createAgentCall = vi.mocked(createAgent).mock.calls.at(-1)?.[0];
      expect(createAgentCall?.tools).toEqual([testModelTool, kernelTool]);
      expect(eagerDispatchHandler.bindTools).toHaveBeenCalledWith([testModelTool, kernelTool]);
    });

    it('should pass the active kernel through to ToolService.getTools so kernel-aware tool factories receive it', async () => {
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-1',
        kernel: 'replicad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });
      expect(mockToolService.getTools).toHaveBeenCalledWith('auto', 'replicad');
    });

    it('calls ModelService.getProviderId for the requested model', async () => {
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      expect(mockModelService.getProviderId).toHaveBeenCalledWith('model-1');
    });

    it('orders provider diagnostics after final payload normalization and before LLM timing', async () => {
      await service.createAgent({
        chatId: 'test-chat-order',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      const createAgentMock = vi.mocked(createAgent);
      const middleware = createAgentMock.mock.calls.at(-1)?.[0]?.middleware ?? [];

      const indexByName = (name: string): number =>
        middleware.findIndex((m) => (m as { name?: string } | undefined)?.name === name);

      const normalizerIndex = indexByName('CrossProviderContentNormalizer');
      const compactionIndex = indexByName('Compaction');
      const providerDiagnosticsIndex = indexByName('ProviderDiagnostics');
      const llmTimingIndex = indexByName('LlmTiming');

      expect(normalizerIndex).toBeGreaterThanOrEqual(0);
      expect(compactionIndex).toBeGreaterThanOrEqual(0);
      expect(providerDiagnosticsIndex).toBeGreaterThanOrEqual(0);
      expect(llmTimingIndex).toBeGreaterThanOrEqual(0);
      expect(normalizerIndex).toBeGreaterThan(compactionIndex);
      expect(providerDiagnosticsIndex).toBeGreaterThan(normalizerIndex);
      expect(llmTimingIndex).toBeGreaterThan(providerDiagnosticsIndex);
    });

    it('should run ToolInputCompatibility after ToolErrorHandler and before eager dispatch/offloading', async () => {
      await service.createAgent({
        chatId: 'test-chat-tool-compatibility',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
        eagerDispatchHandler: {
          entries: new Map(),
          setWriter: vi.fn(),
          bindTools: vi.fn(),
        } as unknown as EagerToolDispatchHandler,
      });

      const createAgentMock = vi.mocked(createAgent);
      const middleware = createAgentMock.mock.calls.at(-1)?.[0]?.middleware ?? [];

      const indexByName = (name: string): number =>
        middleware.findIndex((m) => (m as { name?: string } | undefined)?.name === name);

      const toolErrorIndex = indexByName('ToolErrorHandler');
      const compatibilityIndex = indexByName('ToolInputCompatibility');
      const eagerWriterIndex = indexByName('EagerWriterCapture');
      const toolOffloadingIndex = indexByName('ToolOffloading');

      expect(toolErrorIndex).toBeGreaterThanOrEqual(0);
      expect(compatibilityIndex).toBeGreaterThan(toolErrorIndex);
      expect(eagerWriterIndex).toBeGreaterThan(compatibilityIndex);
      expect(toolOffloadingIndex).toBeGreaterThan(compatibilityIndex);
    });

    it('throws when getProviderId returns undefined', async () => {
      vi.mocked(mockModelService.getProviderId).mockImplementationOnce(() => undefined);

      await expect(
        service.createAgent({
          chatId: 'test-chat-provider',
          modelId: 'orphan-model',
          kernel: 'openscad',
          mode: 'agent',
          tools: { choice: 'auto', testingEnabled: true },
        }),
      ).rejects.toThrow('Could not resolve provider for model orphan-model');
    });

    it('should include latex delimiter normalization middleware for checkpointed state', async () => {
      await service.createAgent({
        chatId: 'test-chat-1',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      const createAgentMock = vi.mocked(createAgent);
      const firstCall = createAgentMock.mock.calls[0]?.[0];
      const middleware = firstCall?.middleware;

      expect(middleware).toBeDefined();
      expect(middleware).toContain(newlineTrimmerMiddleware);
      expect(middleware).toContain(latexDelimiterMiddleware);

      const newlineMiddlewareIndex = middleware?.indexOf(newlineTrimmerMiddleware) ?? -1;
      const latexMiddlewareIndex = middleware?.indexOf(latexDelimiterMiddleware) ?? -1;
      expect(newlineMiddlewareIndex).toBeGreaterThanOrEqual(0);
      expect(latexMiddlewareIndex).toBeGreaterThan(newlineMiddlewareIndex);
    });

    // Most provider-visible request mutators run before Compaction so the
    // budget decision is made against the same effective LangChain ModelRequest
    // that will be dispatched to the provider. CrossProviderContentNormalizer is
    // the exception: it runs after Compaction as the final provider payload
    // sanitizer because compaction may rebuild AIMessages.
    it('should run effective-payload middleware before Compaction', async () => {
      await service.createAgent({
        chatId: 'test-chat-token-usage',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      const createAgentMock = vi.mocked(createAgent);
      const firstCall = createAgentMock.mock.calls.at(-1)?.[0];
      const middleware = firstCall?.middleware ?? [];

      const indexByName = (name: string): number =>
        middleware.findIndex((m) => (m as { name?: string } | undefined)?.name === name);

      const compactionIndex = indexByName('Compaction');
      const tokenUsageIndex = indexByName('TokenUsageContext');
      const safeguardsIndex = indexByName('AgentSafeguards');
      const clientContextIndex = indexByName('ClientContext');
      const recentSkillsIndex = indexByName('RecentSkills');
      const promptCachingIndex = indexByName('PromptCaching');
      const providerDiagnosticsIndex = indexByName('ProviderDiagnostics');

      expect(compactionIndex).toBeGreaterThanOrEqual(0);
      expect(tokenUsageIndex).toBeLessThan(compactionIndex);
      expect(safeguardsIndex).toBeGreaterThan(tokenUsageIndex);
      expect(safeguardsIndex).toBeLessThan(compactionIndex);
      expect(clientContextIndex).toBeLessThan(compactionIndex);
      expect(recentSkillsIndex).toBeLessThan(compactionIndex);
      expect(promptCachingIndex).toBeLessThan(compactionIndex);
      expect(providerDiagnosticsIndex).toBeGreaterThan(compactionIndex);
    });

    // T1.10: InterruptRecovery is wired into the canonical pipeline immediately
    // after AgentSafeguards (so doom-loop detection runs first) and before
    // the final provider normalization pass (so the injected `<system-reminder>`
    // HumanMessage joins the cacheable prefix before payload-specific cleanup).
    it('should run InterruptRecovery after AgentSafeguards and before CrossProviderContentNormalizer', async () => {
      await service.createAgent({
        chatId: 'test-chat-interrupt-recovery',
        modelId: 'model-1',
        kernel: 'openscad',
        mode: 'agent',
        tools: { choice: 'auto', testingEnabled: true },
      });

      const createAgentMock = vi.mocked(createAgent);
      const middleware = createAgentMock.mock.calls.at(-1)?.[0]?.middleware ?? [];

      const indexByName = (name: string): number =>
        middleware.findIndex((m) => (m as { name?: string } | undefined)?.name === name);

      const safeguardsIndex = indexByName('AgentSafeguards');
      const interruptRecoveryIndex = indexByName('InterruptRecovery');
      const normalizerIndex = indexByName('CrossProviderContentNormalizer');

      expect(safeguardsIndex).toBeGreaterThanOrEqual(0);
      expect(interruptRecoveryIndex).toBeGreaterThan(safeguardsIndex);
      expect(normalizerIndex).toBeGreaterThan(interruptRecoveryIndex);
    });
  });
});
