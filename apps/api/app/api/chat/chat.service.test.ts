import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ChatService } from '#api/chat/chat.service.js';
import { ModelService } from '#api/models/model.service.js';
import { ToolService } from '#api/tools/tool.service.js';
import { CheckpointerService } from '#api/chat/checkpointer.service.js';

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
  getCadSystemPrompt: vi.fn().mockResolvedValue('system prompt'),
}));

vi.mock('#api/chat/utils/create-cached-system-message.js', () => ({
  createCachedSystemMessage: vi.fn((text: unknown) => text),
}));

describe('ChatService', () => {
  let service: ChatService;
  let module: TestingModule;

  const mockCheckpointer = { id: 'mock-checkpointer' };

  const mockCheckpointerService = {
    getCheckpointer: vi.fn(() => mockCheckpointer),
  };

  const mockModelService = {
    buildModel: vi.fn(() => ({ model: 'mock-model' })),
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: CheckpointerService, useValue: mockCheckpointerService },
        { provide: ModelService, useValue: mockModelService },
        { provide: ToolService, useValue: mockToolService },
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
      await service.createAgent({ modelId: 'model-1', kernel: 'openscad', tools: { choice: 'auto' } });

      // Assert
      expect(mockCheckpointerService.getCheckpointer).toHaveBeenCalledTimes(1);
    });

    it('should reuse the same checkpointer across multiple agent creations', async () => {
      // Act - create multiple agents (simulating multiple chat requests)
      await service.createAgent({ modelId: 'model-1', kernel: 'openscad', tools: { choice: 'auto' } });
      await service.createAgent({ modelId: 'model-2', kernel: 'replicad', tools: { choice: 'auto' } });
      await service.createAgent({ modelId: 'model-3', kernel: 'jscad', tools: { choice: 'auto' } });

      // Assert - checkpointer retrieved each time (but same instance from service)
      expect(mockCheckpointerService.getCheckpointer).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent agent creation', async () => {
      // Act - simulate multiple concurrent chat requests
      await Promise.all([
        service.createAgent({ modelId: 'model-1', kernel: 'openscad', tools: { choice: 'auto' } }),
        service.createAgent({ modelId: 'model-2', kernel: 'replicad', tools: { choice: 'auto' } }),
        service.createAgent({ modelId: 'model-3', kernel: 'jscad', tools: { choice: 'auto' } }),
        service.createAgent({ modelId: 'model-4', kernel: 'openscad', tools: { choice: 'auto' } }),
        service.createAgent({ modelId: 'model-5', kernel: 'replicad', tools: { choice: 'auto' } }),
      ]);

      // Assert
      expect(mockCheckpointerService.getCheckpointer).toHaveBeenCalledTimes(5);
    });

    it('should build model with provided modelId', async () => {
      // Act
      await service.createAgent({ modelId: 'claude-3-opus', kernel: 'openscad', tools: { choice: 'auto' } });

      // Assert
      expect(mockModelService.buildModel).toHaveBeenCalledWith('claude-3-opus');
    });

    it('should get tools with provided tool selection', async () => {
      // Act
      await service.createAgent({ modelId: 'model-1', kernel: 'openscad', tools: { choice: 'auto' } });

      // Assert
      expect(mockToolService.getTools).toHaveBeenCalledWith('auto');
    });
  });
});
