import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ProviderService } from '#api/providers/provider.service.js';
import { TauChatXaiResponses } from '#api/providers/xai-responses.adapter.js';
import { createProviderDiagnosticsContext } from '#api/chat/utils/provider-diagnostics.js';
import type { Environment } from '#config/environment.config.js';

describe('ProviderService xai', () => {
  it('should construct TauChatXaiResponses with reasoning and conversation affinity', () => {
    const configService: Pick<ConfigService, 'get'> = {
      get: (key: string) => {
        if (key === 'XAI_API_KEY') {
          return 'xai-test-key';
        }
        return undefined;
      },
    };

    const providerService = new ProviderService(configService as unknown as ConfigService<Environment, true>);
    const diagnosticsContext = createProviderDiagnosticsContext({
      chatId: 'chat_xai_1',
      modelId: 'xai-grok-4.6',
      providerId: 'xai',
      verbose: false,
      logger: { error: () => undefined },
    });

    const model = providerService.createModelClass(
      'xai',
      {
        model: 'grok-4.6',
        streaming: true,
        maxOutputTokens: 64_000,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
      { diagnosticsContext },
    ) as TauChatXaiResponses;

    expect(model).toBeInstanceOf(TauChatXaiResponses);
    expect(model.model).toBe('grok-4.6');
    expect(model.maxOutputTokens).toBe(64_000);
    expect(model.reasoning).toEqual({ effort: 'high', summary: 'auto' });
    expect(model.conversationId).toBe('chat_xai_1');
  });
});
