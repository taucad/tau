import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ProviderService } from '#api/providers/provider.service.js';
import { TauChatXaiResponses } from '#api/providers/xai-responses.adapter.js';
import { createProviderDiagnosticsContext } from '#api/chat/utils/provider-diagnostics.js';

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

    const providerService = new ProviderService(configService as ConfigService);
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
    );

    expect(model).toBeInstanceOf(TauChatXaiResponses);
    expect(model.model).toBe('grok-4.6');
    expect((model as TauChatXaiResponses).maxOutputTokens).toBe(64_000);
    expect((model as TauChatXaiResponses).reasoning).toEqual({ effort: 'high', summary: 'auto' });
    expect((model as TauChatXaiResponses).conversationId).toBe('chat_xai_1');
  });
});
