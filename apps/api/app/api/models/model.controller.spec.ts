import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ModelController } from '#api/models/model.controller.js';
import { ModelService } from '#api/models/model.service.js';
import type { Model } from '#api/models/model.schema.js';

// Mock data for testing
const mockModels: Model[] = [
  {
    id: 'anthropic-claude-4-sonnet',
    name: 'Claude 4 Sonnet',
    provider: {
      id: 'anthropic',
      name: 'Anthropic',
    },
    model: 'claude-sonnet-4',
    details: {
      family: 'claude',
      families: ['Claude'],
      contextWindow: 200_000,
      maxTokens: 64_000,
      cost: {
        inputTokens: 3,
        outputTokens: 15,
        cachedReadTokens: 3.75,
        cachedWriteTokens: 0.3,
      },
    },
    configuration: {
      streaming: true,
      maxTokens: 20_000,
      temperature: 0,
    },
  },
  {
    id: 'openai-gpt-4o',
    name: 'GPT-4o',
    provider: {
      id: 'openai',
      name: 'OpenAI',
    },
    model: 'gpt-4o',
    details: {
      family: 'gpt',
      families: ['GPT-4o'],
      contextWindow: 128_000,
      maxTokens: 4096,
      cost: {
        inputTokens: 2.5,
        outputTokens: 10,
        cachedReadTokens: 1.25,
        cachedWriteTokens: 0,
      },
    },
    configuration: {
      streaming: true,
      temperature: 0,
    },
  },
];

describe('ModelController', () => {
  let controller: ModelController;
  let modelService: ModelService;
  let module: TestingModule;

  beforeEach(async () => {
    // Create a proper mock class that implements the ModelService interface
    const mockModelService = {
      getModels: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ModelController],
      providers: [
        {
          provide: ModelService,
          useValue: mockModelService,
        },
      ],
    }).compile();

    controller = moduleRef.get<ModelController>(ModelController);
    modelService = moduleRef.get<ModelService>(ModelService);
    module = moduleRef;
  });

  afterEach(async () => {
    await module.close();
  });

  describe('getModels', () => {
    it('should return an array of models', async () => {
      // Arrange
      vi.mocked(modelService.getModels).mockResolvedValue(mockModels);

      // Act
      const result = await controller.getModels();

      // Assert
      expect(modelService.getModels).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockModels);
      expect(result).toHaveLength(2);
    });

    it('should return models with required properties', async () => {
      // Arrange
      vi.mocked(modelService.getModels).mockResolvedValue(mockModels);

      // Act
      const result = await controller.getModels();

      // Assert
      expect(modelService.getModels).toHaveBeenCalledTimes(1);

      for (const model of result) {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('model');
        expect(model).toHaveProperty('details');
        expect(model).toHaveProperty('configuration');

        // Check details structure
        expect(model.details).toHaveProperty('family');
        expect(model.details).toHaveProperty('families');
        expect(model.details).toHaveProperty('contextWindow');
        expect(model.details).toHaveProperty('maxTokens');
        expect(model.details).toHaveProperty('cost');

        // Check configuration structure
        expect(model.configuration).toHaveProperty('streaming');
      }
    });

    it('should return models from different providers', async () => {
      // Arrange
      vi.mocked(modelService.getModels).mockResolvedValue(mockModels);

      // Act
      const result = await controller.getModels();

      // Assert
      expect(modelService.getModels).toHaveBeenCalledTimes(1);

      const providers = result.map((model) => model.provider.id);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const errorMessage = 'Service error';
      vi.mocked(modelService.getModels).mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(controller.getModels()).rejects.toThrow(errorMessage);
      expect(modelService.getModels).toHaveBeenCalledTimes(1);
    });

    it('should call ModelService.getModels without parameters', async () => {
      // Arrange
      vi.mocked(modelService.getModels).mockResolvedValue(mockModels);

      // Act
      await controller.getModels();

      // Assert - verify the service method is called with correct signature
      expect(modelService.getModels).toHaveBeenCalledWith();
    });
  });
});
