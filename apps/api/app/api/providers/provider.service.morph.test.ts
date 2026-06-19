import { describe, it, expect } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ProviderService } from '#api/providers/provider.service.js';

describe('ProviderService morph', () => {
  it('should construct ChatOpenAI against Morph API with reasoning config', () => {
    const configService: Pick<ConfigService, 'get'> = {
      get: (key: string) => {
        if (key === 'MORPH_API_KEY') {
          return 'sk-test-morph';
        }
        return undefined;
      },
    };

    const providerService = new ProviderService(configService as ConfigService);
    const model = providerService.createModelClass('morph', {
      model: 'morph-qwen35-397b',
      configuration: {
        apiKey: 'sk-test-morph',
        baseURL: 'https://api.morphllm.com/v1',
      },
      reasoning: {
        effort: 'medium',
      },
    });

    expect(model).toBeInstanceOf(ChatOpenAI);
    expect(model.model).toBe('morph-qwen35-397b');
    expect(model.reasoning).toEqual({ effort: 'medium' });
  });
});
