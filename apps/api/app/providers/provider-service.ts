import process from 'node:process';
import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import type { ChatOpenAIFields } from '@langchain/openai';
import { ChatVertexAI } from '@langchain/google-vertexai';
import type { ChatVertexAIInput } from '@langchain/google-vertexai';
import { ChatOllama } from '@langchain/ollama';
import type { ChatOllamaInput } from '@langchain/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import type { ChatAnthropicCallOptions } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { getEnvironment } from '~/config/environment.config.js';
import type { ProviderId, Provider } from '~/providers/provider-schema.js';

// Type for mapping provider IDs to their option types
type ProviderOptionsMap = {
  openai: ChatOpenAIFields;
  ollama: ChatOllamaInput;
  anthropic: ChatAnthropicCallOptions;
  sambanova: ChatOpenAIFields;
  google: ChatVertexAIInput & { model: string };
};

// Enhanced type that includes the createClass method
type ProviderType<T extends ProviderId> = Provider & {
  createClass: (options: ProviderOptionsMap[T]) => BaseChatModel;
};

// Define providers with specific types to avoid type assertions
export const providers: {
  [K in ProviderId]: ProviderType<K>;
} = {
  openai: {
    provider: 'openai',
    configuration: {
      apiKey: process.env.OPENAI_API_KEY,
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
      apiKey: process.env.SAMBA_API_KEY,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses this format
      baseURL: 'https://api.sambanova.ai/v1',
    },
    inputTokensIncludesCachedReadTokens: false,
    createClass: (options) => new ChatOpenAI(options),
  },
  anthropic: {
    provider: 'anthropic',
    configuration: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    inputTokensIncludesCachedReadTokens: false,
    createClass: (options) =>
      new ChatAnthropic({
        ...options,
        maxRetries: 2,
      }),
  },

  google: {
    provider: 'google',
    configuration: {
      apiKey: process.env.GOOGLE_API_KEY,
    },
    inputTokensIncludesCachedReadTokens: false,
    createClass(options) {
      const credentials = getEnvironment().GOOGLE_VERTEX_AI_CREDENTIALS;
      return new ChatVertexAI({
        ...options,
        authOptions: {
          credentials,
          projectId: credentials.project_id,
        },
      });
    },
  },
};

@Injectable()
export class ProviderService {
  public getProvider(providerId: ProviderId): Provider {
    return providers[providerId];
  }

  public createModelClass<T extends ProviderId>(providerId: T, options: ProviderOptionsMap[T]): BaseChatModel {
    const provider = providers[providerId];
    return provider.createClass(options);
  }
}
