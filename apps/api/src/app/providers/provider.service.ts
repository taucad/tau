import { Injectable } from '@nestjs/common';
import { ChatOpenAI, ChatOpenAIFields } from '@langchain/openai';
import { ChatOllama, ChatOllamaInput } from '@langchain/ollama';
import { ChatAnthropic, type ChatAnthropicCallOptions } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ProviderId, Provider } from './provider.schema';

// Type for mapping provider IDs to their option types
type ProviderOptionsMap = {
  openai: ChatOpenAIFields;
  ollama: ChatOllamaInput;
  anthropic: ChatAnthropicCallOptions;
  sambanova: ChatOpenAIFields;
};

// Enhanced type that includes the createClass method
type ProviderType<T extends ProviderId> = Provider & {
  createClass: (options: ProviderOptionsMap[T]) => BaseChatModel;
};

// Define providers with specific types to avoid type assertions
export const PROVIDERS: {
  [K in ProviderId]: ProviderType<K>;
} = {
  openai: {
    provider: 'openai',
    configuration: {},
    inputTokensIncludesCachedReadTokens: true,
    createClass: (options) => new ChatOpenAI(options),
  },
  ollama: {
    provider: 'ollama',
    configuration: {
      baseURL: 'http://localhost:11434',
    },
    inputTokensIncludesCachedReadTokens: false,
    createClass: (options) => new ChatOllama(options),
  },
  sambanova: {
    provider: 'sambanova',
    configuration: {
      apiKey: process.env.SAMBA_API_KEY,
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
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        maxRetries: 2,
      }),
  },
};

@Injectable()
export class ProviderService {
  public getProvider(providerId: ProviderId): Provider {
    return PROVIDERS[providerId];
  }

  public createModelClass<T extends ProviderId>(providerId: T, options: ProviderOptionsMap[T]): BaseChatModel {
    const provider = PROVIDERS[providerId];
    return provider.createClass(options);
  }
}
