import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import type { ChatOpenAIFields } from '@langchain/openai';
import { ChatVertexAI } from '@langchain/google-vertexai';
import type { ChatVertexAIInput } from '@langchain/google-vertexai';
import { ChatOllama } from '@langchain/ollama';
import type { ChatOllamaInput } from '@langchain/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import type { ChatAnthropicCallOptions } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatCerebras } from '@langchain/cerebras';
import type { ChatCerebrasInput } from '@langchain/cerebras';
import type { Environment } from '#config/environment.config.ts';
import type { ProviderId, Provider } from '#api/providers/provider.schema.js';

// Type for mapping provider IDs to their option types
type ProviderOptionsMap = {
  openai: ChatOpenAIFields;
  ollama: ChatOllamaInput;
  anthropic: ChatAnthropicCallOptions;
  sambanova: ChatOpenAIFields;
  vertexai: ChatVertexAIInput & { model: string };
  cerebras: ChatCerebrasInput;
};

// Enhanced type that includes the createClass method
type ProviderType<T extends ProviderId> = Provider & {
  createClass: (options: ProviderOptionsMap[T]) => BaseChatModel;
};

@Injectable()
export class ProviderService {
  public constructor(private readonly configService: ConfigService<Environment, true>) {}

  public getProvider(providerId: ProviderId): Provider {
    const providers = this.getProviders();
    return providers[providerId];
  }

  public createModelClass<T extends ProviderId>(providerId: T, options: ProviderOptionsMap[T]): BaseChatModel {
    const providers = this.getProviders();
    const provider = providers[providerId];
    return provider.createClass(options);
  }

  private getProviders(): {
    [K in ProviderId]: ProviderType<K>;
  } {
    const { configService } = this;
    return {
      openai: {
        provider: 'openai',
        configuration: {
          apiKey: configService.get('OPENAI_API_KEY', { infer: true }),
        },
        inputTokensIncludesCachedReadTokens: true,
        createClass: (options) => new ChatOpenAI(options),
      },
      ollama: {
        provider: 'ollama',
        configuration: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses this format
          baseURL: 'http://localhost:11434',
        },
        inputTokensIncludesCachedReadTokens: false,
        createClass: (options) => new ChatOllama(options),
      },
      sambanova: {
        provider: 'sambanova',
        configuration: {
          apiKey: configService.get('SAMBA_API_KEY', { infer: true }),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses this format
          baseURL: 'https://api.sambanova.ai/v1',
        },
        inputTokensIncludesCachedReadTokens: false,
        createClass: (options) => new ChatOpenAI(options),
      },
      anthropic: {
        provider: 'anthropic',
        configuration: {
          apiKey: configService.get('ANTHROPIC_API_KEY', { infer: true }),
        },
        inputTokensIncludesCachedReadTokens: false,
        createClass: (options) =>
          new ChatAnthropic({
            ...options,
            maxRetries: 2,
          }),
      },

      vertexai: {
        provider: 'vertexai',
        configuration: {
          apiKey: undefined,
        },
        inputTokensIncludesCachedReadTokens: false,
        createClass(options) {
          const credentials = configService.get('GOOGLE_VERTEX_AI_CREDENTIALS', { infer: true });
          return new ChatVertexAI({
            ...options,
            authOptions: {
              credentials,
              projectId: credentials.project_id,
            },
          });
        },
      },
      cerebras: {
        provider: 'cerebras',
        configuration: {
          apiKey: configService.get('CEREBRAS_API_KEY', { infer: true }),
        },
        inputTokensIncludesCachedReadTokens: false,
        createClass: (options) => new ChatCerebras(options),
      },
    };
  }
}
