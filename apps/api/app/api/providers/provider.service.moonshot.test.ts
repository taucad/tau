import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ProviderService } from '#api/providers/provider.service.js';
import { TauChatKimiCompletions } from '#api/providers/kimi-completions.adapter.js';
import { createProviderDiagnosticsContext } from '#api/chat/utils/provider-diagnostics.js';

describe('ProviderService moonshot', () => {
  it('should construct the Kimi adapter with Moonshot credentials and chat cache affinity', () => {
    const configService: Pick<ConfigService, 'get'> = {
      get: (key: string) => (key === 'MOONSHOT_API_KEY' ? 'sk-test-moonshot' : undefined),
    };
    const providerService = new ProviderService(configService as ConfigService);
    const diagnosticsContext = createProviderDiagnosticsContext({
      chatId: 'chat_kimi_1',
      modelId: 'moonshot-kimi-k3',
      providerId: 'moonshot',
      verbose: false,
      logger: { error: () => undefined },
    });

    const model = providerService.createModelClass(
      'moonshot',
      { model: 'kimi-k3', streaming: true, reasoning: { effort: 'high' } },
      { diagnosticsContext },
    );

    expect(model).toBeInstanceOf(TauChatKimiCompletions);
    expect((model as TauChatKimiCompletions).modelProvider).toBe('moonshot');
    expect(model.model).toBe('kimi-k3');
    expect(model.reasoning).toEqual({ effort: 'high' });
    expect(model.promptCacheKey).toBe('chat_kimi_1');
    expect(model.clientConfig.baseURL).toBe('https://api.moonshot.ai/v1');
    expect(model.clientConfig.apiKey).toBe('sk-test-moonshot');
  });

  it('should expose Moonshot token accounting semantics', () => {
    const configService: Pick<ConfigService, 'get'> = { get: () => 'sk-test-moonshot' };
    const provider = new ProviderService(configService as ConfigService).getProvider('moonshot');

    expect(provider).toMatchObject({
      provider: 'moonshot',
      otelProviderName: 'moonshot',
      configuration: {
        apiKey: 'sk-test-moonshot',
        baseURL: 'https://api.moonshot.ai/v1',
      },
      inputTokensIncludesCacheReadTokens: true,
      inputTokensIncludesCacheWriteTokens: false,
    });
  });
});
