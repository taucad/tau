import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ProviderService } from '#api/providers/provider.service.js';
import { TauChatKimiCompletions } from '#api/providers/kimi-completions.adapter.js';

describe('ProviderService Together Kimi', () => {
  const configService: Pick<ConfigService, 'get'> = {
    get: (key: string) => (key === 'TOGETHER_API_KEY' ? 'sk-test-together' : undefined),
  };

  it('should construct the Kimi adapter with Together credentials and no Moonshot controls', () => {
    const providerService = new ProviderService(configService as ConfigService);
    const model = providerService.createModelClass('together', {
      model: 'moonshotai/Kimi-K3',
      streaming: true,
      configuration: {
        apiKey: 'sk-test-together',
        baseURL: 'https://api.together.xyz/v1',
      },
    });

    expect(model).toBeInstanceOf(TauChatKimiCompletions);
    expect((model as TauChatKimiCompletions).modelProvider).toBe('together');
    expect(model.model).toBe('moonshotai/Kimi-K3');
    expect(model.reasoning).toBeUndefined();
    expect(model.promptCacheKey).toBeUndefined();
    expect(model.clientConfig.baseURL).toBe('https://api.together.xyz/v1');
    expect(model.clientConfig.apiKey).toBe('sk-test-together');
  });

  it('should keep non-Kimi Together models on the generic ChatOpenAI path', () => {
    const providerService = new ProviderService(configService as ConfigService);
    const model = providerService.createModelClass('together', {
      model: 'zai-org/GLM-5.2',
      streaming: true,
      configuration: {
        apiKey: 'sk-test-together',
        baseURL: 'https://api.together.xyz/v1',
      },
    });

    expect(model).toBeInstanceOf(ChatOpenAI);
    expect(model).not.toBeInstanceOf(TauChatKimiCompletions);
  });

  it('should expose Together inclusive-cache accounting semantics', () => {
    const provider = new ProviderService(configService as ConfigService).getProvider('together');

    expect(provider).toMatchObject({
      provider: 'together',
      otelProviderName: 'together',
      configuration: {
        apiKey: 'sk-test-together',
        baseURL: 'https://api.together.xyz/v1',
      },
      inputTokensIncludesCacheReadTokens: true,
      inputTokensIncludesCacheWriteTokens: false,
    });
  });
});
