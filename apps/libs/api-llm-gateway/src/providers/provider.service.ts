import { Injectable } from '@nestjs/common';
import type { ProviderId, Provider } from '@taucad/chat/model-catalog';

/**
 * Per-provider metadata: the OpenTelemetry `gen_ai.provider.name` and how each
 * provider's reported input tokens treat cached input. Requests themselves go
 * through `provider-gateway.ts`; credentials never live here.
 */
const providers = {
  openai: {
    provider: 'openai',
    otelProviderName: 'openai',
    configuration: {},
    inputTokensIncludesCacheReadTokens: true,
    inputTokensIncludesCacheWriteTokens: false,
  },
  ollama: {
    provider: 'ollama',
    otelProviderName: 'ollama',
    configuration: {},
    inputTokensIncludesCacheReadTokens: false,
    inputTokensIncludesCacheWriteTokens: false,
  },
  anthropic: {
    provider: 'anthropic',
    otelProviderName: 'anthropic',
    configuration: {},
    /* Anthropic's raw `input_tokens` excludes cache reads and writes. These flags
     * describe usage already summed to an inclusive input total, the form the
     * helper's Responses usage reports (input + cache read + cache creation). */
    inputTokensIncludesCacheReadTokens: true,
    inputTokensIncludesCacheWriteTokens: true,
  },
  vertexai: {
    provider: 'vertexai',
    otelProviderName: 'gcp.vertex_ai',
    configuration: {},
    inputTokensIncludesCacheReadTokens: true,
    inputTokensIncludesCacheWriteTokens: false,
  },
  cerebras: {
    provider: 'cerebras',
    otelProviderName: 'cerebras',
    configuration: {},
    inputTokensIncludesCacheReadTokens: false,
    inputTokensIncludesCacheWriteTokens: false,
  },
  together: {
    provider: 'together',
    otelProviderName: 'together',
    configuration: {},
    inputTokensIncludesCacheReadTokens: true,
    inputTokensIncludesCacheWriteTokens: false,
  },
  morph: {
    provider: 'morph',
    otelProviderName: 'morph',
    configuration: {},
    inputTokensIncludesCacheReadTokens: false,
    inputTokensIncludesCacheWriteTokens: false,
  },
  xai: {
    provider: 'xai',
    otelProviderName: 'xai',
    configuration: {},
    inputTokensIncludesCacheReadTokens: true,
    inputTokensIncludesCacheWriteTokens: false,
  },
  moonshot: {
    provider: 'moonshot',
    otelProviderName: 'moonshot',
    configuration: {},
    inputTokensIncludesCacheReadTokens: true,
    inputTokensIncludesCacheWriteTokens: false,
  },
} as const satisfies { [K in ProviderId]: Provider & { provider: K } };

// oxlint-disable-next-line new-cap -- NestJS decorators are invoked by decorator syntax.
@Injectable()
export class ProviderService {
  public getProvider(providerId: ProviderId): Provider {
    return providers[providerId];
  }
}
