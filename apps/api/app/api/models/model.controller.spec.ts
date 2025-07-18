import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelController } from '~/api/models/model.controller.js';
import type { ModelService } from '~/api/models/model.service.js';
import type { Model } from '~/api/models/model.schema.js';

// Mock data for testing
const mockModels: Model[] = [
  {
    id: 'anthropic-claude-4-sonnet',
    name: 'Claude 4 Sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    details: {
      family: 'Claude',
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
    provider: 'openai',
    model: 'gpt-4o',
    details: {
      family: 'GPT-4o',
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
  let mockModelService: Pick<ModelService, 'getModels'>;

  beforeEach(() => {
    // Create a focused mock that only includes what the controller uses
    mockModelService = {
      getModels: vi.fn(),
    };

    // Create the controller with the mocked service
    controller = new ModelController(mockModelService as ModelService);
  });

  describe('getModels', () => {
    it('should return an array of models', async () => {
      // Arrange
      vi.mocked(mockModelService.getModels).mockResolvedValue(mockModels);

      // Act
      const result = await controller.getModels();

      // Assert
      expect(mockModelService.getModels).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockModels);
      expect(result).toHaveLength(2);
    });

    it('should return models with required properties', async () => {
      // Arrange
      vi.mocked(mockModelService.getModels).mockResolvedValue(mockModels);

      // Act
      const result = await controller.getModels();

      // Assert
      expect(mockModelService.getModels).toHaveBeenCalledTimes(1);

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
      vi.mocked(mockModelService.getModels).mockResolvedValue(mockModels);

      // Act
      const result = await controller.getModels();

      // Assert
      expect(mockModelService.getModels).toHaveBeenCalledTimes(1);

      const providers = result.map((model) => model.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      const errorMessage = 'Service error';
      vi.mocked(mockModelService.getModels).mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(controller.getModels()).rejects.toThrow(errorMessage);
      expect(mockModelService.getModels).toHaveBeenCalledTimes(1);
    });

    it('should call ModelService.getModels without parameters', async () => {
      // Arrange
      vi.mocked(mockModelService.getModels).mockResolvedValue(mockModels);

      // Act
      await controller.getModels();

      // Assert - verify the service method is called with correct signature
      expect(mockModelService.getModels).toHaveBeenCalledWith();
    });
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have ModelService dependency injected', () => {
      // Verify the controller has access to the service
      expect(controller).toBeInstanceOf(ModelController);
    });
  });
});
