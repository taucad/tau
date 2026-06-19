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
import type { ProviderDiagnosticsContext } from '#api/chat/utils/provider-diagnostics.js';
import { createGoogleProviderDiagnosticsFetch } from '#api/chat/utils/provider-diagnostics.js';

// Type for mapping provider IDs to their option types
type ProviderOptionsMap = {
  openai: ChatOpenAIFields;
  ollama: ChatOllamaInput;
  anthropic: ChatAnthropicCallOptions;
  vertexai: ChatVertexAIInput & { model: string };
  cerebras: ChatCerebrasInput;
  together: ChatOpenAIFields;
  morph: ChatOpenAIFields & {
    model: string;
    configuration?: Provider['configuration'];
    streaming?: boolean;
    reasoning?: {
      effort?: 'low' | 'medium' | 'high';
      summary?: 'auto' | 'concise' | 'detailed';
    };
  };
};

type ProviderRuntimeOptions = {
  diagnosticsContext?: ProviderDiagnosticsContext;
};

// Enhanced type that includes the createClass method
type ProviderType<T extends ProviderId> = Provider & {
  createClass: (options: ProviderOptionsMap[T], runtimeOptions?: ProviderRuntimeOptions) => BaseChatModel;
};

@Injectable()
export class ProviderService {
  public constructor(private readonly configService: ConfigService<Environment, true>) {}

  public getProvider(providerId: ProviderId): Provider {
    const providers = this.getProviders();
    return providers[providerId];
  }

  public createModelClass<T extends ProviderId>(
    providerId: T,
    options: ProviderOptionsMap[T],
    runtimeOptions?: ProviderRuntimeOptions,
  ): BaseChatModel {
    const providers = this.getProviders();
    const provider = providers[providerId];
    return provider.createClass(options, runtimeOptions);
  }

  private getProviders(): {
    [K in ProviderId]: ProviderType<K>;
  } {
    const { configService } = this;
    return {
      openai: {
        provider: 'openai',
        otelProviderName: 'openai',
        configuration: {
          apiKey: configService.get('OPENAI_API_KEY', { infer: true }),
        },
        inputTokensIncludesCacheReadTokens: true,
        inputTokensIncludesCacheWriteTokens: false,
        createClass: (options) =>
          new ChatOpenAI({
            useResponsesApi: true,
            outputVersion: 'v1',
            ...options,
          }),
      },
      ollama: {
        provider: 'ollama',
        otelProviderName: 'ollama',
        configuration: {
          baseURL: 'http://localhost:11434',
        },
        inputTokensIncludesCacheReadTokens: false,
        inputTokensIncludesCacheWriteTokens: false,
        createClass: (options) => new ChatOllama(options),
      },
      anthropic: {
        provider: 'anthropic',
        otelProviderName: 'anthropic',
        configuration: {
          apiKey: configService.get('ANTHROPIC_API_KEY', { infer: true }),
        },
        // LangChain's buildUsageMetadata sums API input_tokens + cache_read + cache_creation into usage_metadata.input_tokens
        inputTokensIncludesCacheReadTokens: true,
        inputTokensIncludesCacheWriteTokens: true,
        createClass: (options) =>
          new ChatAnthropic({
            ...options,
            outputVersion: 'v1',
            betas: [
              // Stream tool use parameters without buffering / JSON validation, reducing the latency to begin receiving large parameters.
              // @see https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming
              'fine-grained-tool-streaming-2025-05-14',
              // Improve model performance by allowing it to think between tool calls
              // @see https://platform.claude.com/docs/en/build-with-claude/extended-thinking#interleaved-thinking
              'interleaved-thinking-2025-05-14',
              // Global cache scope (`prompt-caching-scope-2026-01-05`) is intentionally not enabled here:
              // it requires beta access on the API key, and falls back to per-request caching when omitted.
            ],
            maxRetries: 2,
          }),
      },

      vertexai: {
        provider: 'vertexai',
        otelProviderName: 'gcp.vertex_ai',
        configuration: {
          apiKey: undefined,
        },
        inputTokensIncludesCacheReadTokens: true,
        inputTokensIncludesCacheWriteTokens: false,
        createClass(options, runtimeOptions) {
          const credentials = configService.get('GOOGLE_VERTEX_AI_CREDENTIALS', { infer: true });
          const diagnosticsFetch = runtimeOptions?.diagnosticsContext
            ? createGoogleProviderDiagnosticsFetch({
                baseFetch: globalThis.fetch,
                context: runtimeOptions.diagnosticsContext,
              })
            : globalThis.fetch;

          return new ChatVertexAI({
            ...options,
            outputVersion: 'v1',
            location: 'global',
            streaming: true,
            streamUsage: true,
            streamFunctionCallArguments: true,
            authOptions: {
              credentials,
              projectId: credentials.project_id,
              clientOptions: {
                transporterOptions: {
                  // Gaxios defaults to node-fetch in Node; node-fetch emits an unhandled
                  // request-body Readable error when aborted before/during a POST.
                  fetchImplementation: diagnosticsFetch,
                },
              },
            },
          });
        },
      },
      cerebras: {
        provider: 'cerebras',
        otelProviderName: 'cerebras',
        configuration: {
          apiKey: configService.get('CEREBRAS_API_KEY', { infer: true }),
        },
        inputTokensIncludesCacheReadTokens: false,
        inputTokensIncludesCacheWriteTokens: false,
        createClass: (options) => new ChatCerebras(options),
      },
      together: {
        provider: 'together',
        otelProviderName: 'together',
        configuration: {
          apiKey: configService.get('TOGETHER_API_KEY', { infer: true }),
          baseURL: 'https://api.together.xyz/v1',
        },
        inputTokensIncludesCacheReadTokens: false,
        inputTokensIncludesCacheWriteTokens: false,
        createClass: (options) =>
          new ChatOpenAI({
            outputVersion: 'v1',
            ...options,
          }),
      },
      morph: {
        provider: 'morph',
        otelProviderName: 'morph',
        configuration: {
          apiKey: configService.get('MORPH_API_KEY', { infer: true }),
          baseURL: 'https://api.morphllm.com/v1',
        },
        inputTokensIncludesCacheReadTokens: false,
        inputTokensIncludesCacheWriteTokens: false,
        createClass: (options) =>
          new ChatOpenAI({
            outputVersion: 'v1',
            ...options,
          }),
      },
    };
  }
}
