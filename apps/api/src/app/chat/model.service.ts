import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Model, ModelProvider, ModelSupport } from './model.schema';
import { ChatOllama, ChatOllamaInput } from '@langchain/ollama';
import { ChatOpenAI, ChatOpenAIFields } from '@langchain/openai';
import { ChatAnthropic, type ChatAnthropicCallOptions } from '@langchain/anthropic';
import ollama from 'ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatUsageCost, ChatUsageTokens } from './chat.schema';

const MODELS = {
  anthropic: {
    'claude-3.7-sonnet-thinking': {
      id: 'anthropic-claude-3.7-sonnet-thinking',
      name: 'Claude 3.7 Sonnet (Thinking)',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-20250219',
      details: {
        family: 'Claude',
        families: ['Claude'],
        contextWindow: 200_000,
        // Extended thinking mode supports up to 64000 tokens
        maxTokens: 64_000,
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cachedReadTokens: 3.75,
          cachedWriteTokens: 0.3,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 20_000,
        // @ts-expect-error - FIXME
        max_tokens: 20_000,
        thinking: {
          type: 'enabled',
          budget_tokens: 5000,
        },
      },
    },
    'claude-3.7-sonnet': {
      id: 'anthropic-claude-3.7-sonnet',
      name: 'Claude 3.7 Sonnet',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-20250219',
      details: {
        family: 'Claude',
        families: ['Claude'],
        contextWindow: 200_000,
        maxTokens: 8192,
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cachedReadTokens: 3.75,
          cachedWriteTokens: 0.3,
        },
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
    'claude-3.5-sonnet': {
      id: 'anthropic-claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      details: {
        family: 'Claude',
        families: ['Claude'],
        contextWindow: 200_000,
        maxTokens: 8192,
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cachedReadTokens: 3.75,
          cachedWriteTokens: 0.3,
        },
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
    'claude-3-5-haiku': {
      id: 'anthropic-claude-3-5-haiku',
      name: 'Claude 3.5 Haiku',
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
      details: {
        family: 'Claude',
        families: ['Claude'],
        contextWindow: 200_000,
        maxTokens: 8192,
        cost: {
          inputTokens: 0.8,
          outputTokens: 4,
          cachedReadTokens: 1,
          cachedWriteTokens: 0.08,
        },
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
  },
  sambanova: {
    'llama3.3': {
      id: 'sambanova-llama3.3',
      name: 'Llama 3.3',
      provider: 'sambanova',
      model: 'Meta-Llama-3.3-70B-Instruct',
      details: {
        family: 'Llama 3.3',
        families: ['Llama 3.3'],
        parameterSize: '70B',
        contextWindow: 128_000,
        maxTokens: 16_384,
        cost: {
          inputTokens: 0,
          outputTokens: 0,
          cachedReadTokens: 0,
          cachedWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
  },
  openai: {
    'gpt-4.5-preview': {
      id: 'openai-gpt-4.5-preview',
      name: 'GPT-4.5 Preview',
      provider: 'openai',
      model: 'gpt-4.5-preview-2025-02-27',
      details: {
        family: 'GPT-4.5',
        families: ['GPT-4.5'],
        contextWindow: 128_000,
        maxTokens: 16_384,
        cost: {
          inputTokens: 75,
          outputTokens: 150,
          cachedReadTokens: 37.5,
          cachedWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'gpt-o1': {
      id: 'openai-gpt-o1',
      name: 'GPT-o1',
      provider: 'openai',
      model: 'o1-2024-12-17',
      details: {
        family: 'GPT-O3',
        families: ['GPT-O3'],
        contextWindow: 200_000,
        maxTokens: 100_000,
        cost: {
          inputTokens: 15,
          outputTokens: 60,
          cachedReadTokens: 7.5,
          cachedWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'gpt-o3-mini': {
      id: 'openai-gpt-o3-mini',
      name: 'GPT-o3 Mini',
      provider: 'openai',
      model: 'o3-mini',
      details: {
        family: 'GPT-O3',
        families: ['GPT-O3'],
        contextWindow: 200_000,
        maxTokens: 100_000,
        cost: {
          inputTokens: 1.1,
          outputTokens: 4.4,
          cachedReadTokens: 0.55,
          cachedWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'gpt-4o-mini': {
      id: 'openai-gpt-4o-mini',
      name: 'GPT-4o Mini',
      provider: 'openai',
      model: 'gpt-4o-mini',
      details: {
        family: 'GPT-4o',
        families: ['GPT-4o'],
        contextWindow: 128_000,
        maxTokens: 16_384,
        cost: {
          inputTokens: 0.15,
          outputTokens: 0.6,
          cachedReadTokens: 0.075,
          cachedWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
    'gpt-4o': {
      id: 'openai-gpt-4o',
      name: 'GPT-4o',
      provider: 'openai',
      model: 'gpt-4o',
      details: {
        family: 'GPT-4o',
        families: ['GPT-4o'],
        contextWindow: 128_000,
        maxTokens: 4096,
        cost: {
          inputTokens: 2.5,
          outputTokens: 10,
          cachedReadTokens: 1.25,
          cachedWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
  },
} as const satisfies Record<string, Record<string, Model>>;

const PROVIDERS = {
  openai: {
    provider: 'openai',
    configuration: {},
    inputTokensIncludesCachedReadTokens: true,
    createClass: (options: ChatOpenAIFields) => new ChatOpenAI(options),
  },
  ollama: {
    provider: 'ollama',
    configuration: {
      baseURL: 'http://localhost:11434',
    },
    inputTokensIncludesCachedReadTokens: false,
    createClass: (options: ChatOllamaInput) => new ChatOllama(options),
  },
  sambanova: {
    provider: 'sambanova',
    configuration: {
      apiKey: process.env.SAMBA_API_KEY as string,
      baseURL: 'https://api.sambanova.ai/v1',
    },
    inputTokensIncludesCachedReadTokens: false,
    createClass: (options: ChatOpenAIFields) => new ChatOpenAI(options),
  },
  anthropic: {
    provider: 'anthropic',
    configuration: {
      apiKey: process.env.ANTHROPIC_API_KEY as string,
    },
    inputTokensIncludesCachedReadTokens: false,
    createClass: (options: ChatAnthropicCallOptions) =>
      new ChatAnthropic({
        ...options,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        maxRetries: 2,
      }),
  },
} as const satisfies Record<string, ModelProvider & { createClass: (options: never) => BaseChatModel }>;

const ollamaToolSupportFamilies = new Set(['llama']);

type ProviderId = keyof typeof PROVIDERS;

@Injectable()
export class ModelService implements OnModuleInit {
  public models: Model[] = [];

  async onModuleInit() {
    await this.getModels();
    Logger.log(`Loaded ${this.models.length} models`);
  }

  public async getModels(): Promise<Model[]> {
    const ollamaModels = await this.getOllamaModels();
    const models = Object.values(MODELS).flatMap((model) => Object.values(model));
    const combinedModels = [...models, ...ollamaModels];
    this.models = combinedModels;
    return combinedModels;
  }

  public buildModel(modelId: string): { model: BaseChatModel; support?: ModelSupport } {
    const modelConfig = this.models.find((model) => model.id === modelId);

    if (!modelConfig) throw new Error(`Could not find model ${modelId}`);

    const provider = PROVIDERS[modelConfig.provider as ProviderId];

    const modelClass = provider.createClass({
      model: modelConfig.model,
      ...modelConfig.configuration,
      configuration: provider.configuration,
    });

    return {
      model: modelClass,
      support: modelConfig.support,
    };
  }

  public normalizeUsageTokens(modelId: string, usage: ChatUsageTokens): ChatUsageTokens {
    const modelConfig = this.models.find((model) => model.id === modelId);
    if (!modelConfig) throw new Error(`Could not find model ${modelId}`);

    const providerConfig = PROVIDERS[modelConfig.provider as ProviderId];

    return {
      // Some providers include cached read tokens in the input tokens,
      // so we need to subtract them if necessary.
      inputTokens:
        usage.inputTokens - (providerConfig.inputTokensIncludesCachedReadTokens ? usage.cachedReadTokens : 0),
      outputTokens: usage.outputTokens,
      cachedReadTokens: usage.cachedReadTokens ?? 0,
      cachedWriteTokens: usage.cachedWriteTokens ?? 0,
    };
  }

  public getModelCost(modelId: string, usage: ChatUsageTokens): ChatUsageCost {
    const modelConfig = this.models.find((model) => model.id === modelId);
    if (!modelConfig) throw new Error(`Could not find model ${modelId}`);

    // Convert cost per million tokens to cost per token
    const inputCostPerToken = modelConfig.details.cost.inputTokens / 1_000_000;
    const outputCostPerToken = modelConfig.details.cost.outputTokens / 1_000_000;
    const cachedReadCostPerToken = modelConfig.details.cost.cachedReadTokens / 1_000_000;
    const cachedWriteCostPerToken = modelConfig.details.cost.cachedWriteTokens / 1_000_000;

    // Calculate individual costs
    const inputTokensCost = usage.inputTokens * inputCostPerToken;
    const outputTokensCost = usage.outputTokens * outputCostPerToken;
    const cachedReadTokensCost = usage.cachedReadTokens * cachedReadCostPerToken;
    const cachedWriteTokensCost = usage.cachedWriteTokens * cachedWriteCostPerToken;

    // Calculate total cost
    const totalCost = inputTokensCost + outputTokensCost + cachedReadTokensCost + cachedWriteTokensCost;

    return {
      inputTokensCost,
      outputTokensCost,
      cachedReadTokensCost,
      cachedWriteTokensCost,
      totalCost,
    };
  }

  private async getOllamaModels(): Promise<Model[]> {
    try {
      const ollamaModels = await ollama.list();
      const ollamaModelList: Model[] = ollamaModels.models.map((model) => ({
        id: model.name,
        name: model.name,
        model: model.name,
        modifiedAt: String(model.modified_at),
        size: model.size,
        digest: model.digest,
        details: {
          parentModel: model.details.parent_model,
          format: model.details.format,
          family: model.details.family,
          families: model.details.families,
          parameterSize: model.details.parameter_size,
          quantizationLevel: model.details.quantization_level,
          contextWindow: 200_000,
          maxTokens: 100_000,
          cost: {
            inputTokens: 0,
            outputTokens: 0,
            cachedReadTokens: 0,
            cachedWriteTokens: 0,
          },
        },
        configuration: {
          streaming: true,
          temperature: 0,
        },
        support: {
          tools: ollamaToolSupportFamilies.has(model.details.family),
          toolChoice: false,
        },
        provider: 'ollama',
      }));

      return ollamaModelList;
    } catch (error) {
      Logger.error('Error getting ollama models', error);
      return [];
    }
  }
}
