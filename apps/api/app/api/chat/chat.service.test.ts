import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { createAgent } from 'langchain';
import { ChatService } from '#api/chat/chat.service.js';
import { ModelService } from '#api/models/model.service.js';
import { ToolService } from '#api/tools/tool.service.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';
import { StoreService } from '#api/chat/store.service.js';
import { CompactionService } from '#api/chat/compaction.service.js';
import { TauRpcBackendFactory } from '#api/chat/tau-rpc-backend.js';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { newlineTrimmerMiddleware } from '#api/chat/middleware/newline-trimmer.middleware.js';
import { latexDelimiterMiddleware } from '#api/chat/middleware/latex-delimiter.middleware.js';

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
  const mockStoreService = {
    getStore: vi.fn(() => mockStore),
  };

  const mockModelService = {
    buildModel: vi.fn(() => ({ model: 'mock-model' })),
    getContextWindow: vi.fn(() => 200_000),
    getProviderId: vi.fn(() => 'openai'),
    getKnowledgeCutoff: vi.fn(() => '2025-08'),
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
      expect(mockModelService.buildModel).toHaveBeenCalledWith('claude-3-opus');
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

    it('orders CrossProviderContentNormalizer before MessageContentSanitizer', async () => {
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
      const sanitizerIndex = indexByName('MessageContentSanitizer');

      expect(normalizerIndex).toBeGreaterThanOrEqual(0);
      expect(sanitizerIndex).toBeGreaterThan(normalizerIndex);
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

    // The token-usage-context middleware must run AFTER compaction (so the
    // reported counts reflect the post-compaction message set) and BEFORE
    // agent-safeguards (so its <system-reminder> joins the cacheable prefix
    // together with the safeguard nudges, per the cache-safety contract).
    it('should run TokenUsageContext after Compaction and before AgentSafeguards', async () => {
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

      expect(compactionIndex).toBeGreaterThanOrEqual(0);
      expect(tokenUsageIndex).toBeGreaterThan(compactionIndex);
      expect(safeguardsIndex).toBeGreaterThan(tokenUsageIndex);
    });

    // T1.10: InterruptRecovery is wired into the canonical pipeline immediately
    // after AgentSafeguards (so doom-loop detection runs first) and before
    // CrossProviderContentNormalizer / MessageContentSanitizer (so the
    // injected `<system-reminder>` HumanMessage joins the cacheable prefix).
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
