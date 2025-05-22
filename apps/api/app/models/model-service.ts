import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import ollama from 'ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatUsageCost, ChatUsageTokens } from '~/chat/chat-schema.js';
import type { ProviderId } from '~/providers/provider-schema.js';
import { ProviderService } from '~/providers/provider-service.js';
import type { Model, ModelSupport } from '~/models/model-schema.js';

type CloudProviderId = Exclude<ProviderId, 'ollama'>;

const modelList: Record<CloudProviderId, Record<string, Model>> = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- snake case format is preferred here
  google_vertexai: {
    'gemini-2.5-pro': {
      id: 'google-gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      provider: 'google_vertexai',
      model: 'gemini-2.5-pro-preview-05-06',
      details: {
        family: 'Gemini',
        families: ['Gemini'],
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        cost: {
          inputTokens: 1.25,
          outputTokens: 10,
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

  anthropic: {
    'claude-3.7-sonnet-thinking': {
      id: 'anthropic-claude-3.7-sonnet-thinking',
      name: 'Claude 3.7 Sonnet (Thinking)',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet-20250219',
      support: {
        toolChoice: false,
      },
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
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 20_000,
        thinking: {
          type: 'enabled',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
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
    'llama-3.3': {
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
    'gpt-4.1': {
      id: 'openai-gpt-4.1',
      name: 'GPT-4.1',
      provider: 'openai',
      model: 'gpt-4.1',
      details: {
        family: 'GPT-4.1',
        families: ['GPT-4.1'],
        contextWindow: 1_047_576,
        maxTokens: 32_768,
        cost: {
          inputTokens: 2,
          outputTokens: 8,
          cachedReadTokens: 0.5,
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
    'gpt-o4-mini': {
      id: 'openai-gpt-o4-mini',
      name: 'GPT-o4 Mini',
      provider: 'openai',
      model: 'o4-mini',
      details: {
        family: 'GPT-O4',
        families: ['GPT-O4'],
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
} as const;

@Injectable()
export class ModelService implements OnModuleInit {
  public models: Model[] = [];

  public constructor(private readonly providerService: ProviderService) {}

  public async onModuleInit(): Promise<void> {
    await this.getModels();
    Logger.log(`Loaded ${this.models.length} models`);
  }

  public async getModels(): Promise<Model[]> {
    const ollamaModels = await this.getOllamaModels();
    const models = Object.values(modelList).flatMap((model) => Object.values(model));
    const combinedModels = [...models, ...ollamaModels];
    this.models = combinedModels;
    return combinedModels;
  }

  public buildModel(modelId: string): { model: BaseChatModel; support?: ModelSupport } {
    const modelConfig = this.models.find((model) => model.id === modelId);

    if (!modelConfig) throw new Error(`Could not find model ${modelId}`);

    const provider = this.providerService.getProvider(modelConfig.provider);

    const modelClass = this.providerService.createModelClass(modelConfig.provider, {
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

    const provider = this.providerService.getProvider(modelConfig.provider);

    return {
      // Some providers include cached read tokens in the input tokens,
      // so we need to subtract them if necessary.
      inputTokens: usage.inputTokens - (provider.inputTokensIncludesCachedReadTokens ? usage.cachedReadTokens : 0),
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
      const ollamaModelList: Model[] = await Promise.all(
        ollamaModels.models.map(async (model) => {
          const fullModel = await ollama.show({ model: model.model });
          return {
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
              // Rudimentary tool support detection until Ollama exposes a better API
              tools: fullModel.template.includes('.Tools'),
              toolChoice: false,
            },
            provider: 'ollama',
          };
        }),
      );

      const ollamaModelsWithToolSupport = ollamaModelList.filter((model) => model.support?.tools);

      return ollamaModelsWithToolSupport;
    } catch (error) {
      Logger.error('Error getting ollama models', error);
      return [];
    }
  }
}
