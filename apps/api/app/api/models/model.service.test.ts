import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { modelList } from '#api/models/model.constants.js';
import { ModelService } from '#api/models/model.service.js';
import type { ProviderService } from '#api/providers/provider.service.js';
import type { Environment } from '#config/environment.config.ts';

const MAX_EFFECTIVE_CONTEXT_WINDOW = 200_000;

const cappedModelIds = [
  'anthropic-claude-fable-5',
  'anthropic-claude-opus-4.8',
  'openai-gpt-5.5',
  'openai-gpt-5.3-codex',
  'openai-gpt-4.1',
  'google-gemini-3.1-pro',
  'google-gemini-3.5-flash',
  'together-glm-5.1',
  'together-qwen-3.5-397b',
  'together-llama-4-maverick',
  'morph-qwen-3.5-397b',
  'morph-deepseek-v4-flash',
] as const;

const getCloudCatalogEntries = () => Object.values(modelList).flatMap((modelsBySlug) => Object.values(modelsBySlug));

const createModelService = () => {
  const providerService = {} as ProviderService;
  const configService = {
    get: vi.fn().mockReturnValue(false),
  } as unknown as ConfigService<Environment>;

  return new ModelService(providerService, configService);
};

describe('modelList', () => {
  it('caps every cloud catalog effective context window at 200K tokens', () => {
    for (const model of getCloudCatalogEntries()) {
      expect(model.details.contextWindow, model.id).toBeLessThanOrEqual(MAX_EFFECTIVE_CONTEXT_WINDOW);
    }
  });
});

describe('ModelService', () => {
  it('returns the 200K effective context window for all capped model IDs', async () => {
    const service = createModelService();
    await service.getModels();

    for (const modelId of cappedModelIds) {
      expect(service.getContextWindow(modelId), modelId).toBe(MAX_EFFECTIVE_CONTEXT_WINDOW);
    }
  });
});
