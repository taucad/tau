import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import ollama from 'ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatUsageCost, ChatUsageTokens } from '#api/chat/chat.schema.js';
import type { ModelFamily, ProviderId } from '#api/providers/provider.schema.js';
import { ProviderService } from '#api/providers/provider.service.js';
import type { Model, ModelSupport } from '#api/models/model.schema.js';

type CloudProviderId = Exclude<ProviderId, 'ollama'>;

const modelList: Record<CloudProviderId, Record<string, Model>> = {
  vertexai: {
    'gemini-2.5-pro': {
      id: 'google-gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      slug: 'gemini-2.5-pro',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-2.5-pro-preview-05-06',
      details: {
        family: 'gemini',
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
    'claude-4-sonnet-thinking': {
      id: 'anthropic-claude-4-sonnet-thinking',
      name: 'Claude 4 Sonnet (Thinking)',
      slug: 'claude-4-sonnet-thinking',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-4-20250514',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'claude',
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
    'claude-4-opus': {
      id: 'anthropic-claude-4-opus',
      name: 'Claude 4 Opus',
      slug: 'claude-4-opus',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-4-20250514',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'claude',
        families: ['Claude'],
        contextWindow: 200_000,
        // Extended thinking mode supports up to 64000 tokens
        maxTokens: 64_000,
        cost: {
          inputTokens: 15,
          outputTokens: 75,
          cachedReadTokens: 1.5,
          cachedWriteTokens: 18.75,
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
    'claude-4-sonnet': {
      id: 'anthropic-claude-4-sonnet',
      name: 'Claude 4 Sonnet',
      slug: 'claude-4-sonnet',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-4-20250514',
      details: {
        family: 'claude',
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
  },
  openai: {
    'gpt-4.1': {
      id: 'openai-gpt-4.1',
      name: 'GPT-4.1',
      slug: 'gpt-4.1',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-4.1',
      details: {
        family: 'gpt',
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
    'gpt-o3': {
      id: 'openai-gpt-o3',
      name: 'GPT-o3',
      slug: 'gpt-o3',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'o3-2025-04-16',
      details: {
        family: 'gpt',
        families: ['GPT-O3'],
        contextWindow: 200_000,
        maxTokens: 100_000,
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
    'gpt-4o': {
      id: 'openai-gpt-4o',
      name: 'GPT-4o',
      slug: 'gpt-4o',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-4o',
      details: {
        family: 'gpt',
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
  cerebras: {
    'gpt-oss-120b': {
      id: 'cerebras-gpt-oss-120b',
      name: 'GPT-OSS-120B',
      slug: 'gpt-oss-120b',
      provider: {
        id: 'cerebras',
        name: 'Cerebras',
      },
      model: 'gpt-oss-120b',
      details: {
        family: 'gpt',
        families: ['GPT-OSS'],
        contextWindow: 64_000,
        maxTokens: 64_000,
        cost: {
          inputTokens: 0.25,
          outputTokens: 0.69,
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
} as const;

@Injectable()
export class ModelService implements OnModuleInit {
  public models: Model[] = [];
  private readonly logger = new Logger(ModelService.name);

  public constructor(private readonly providerService: ProviderService) {}

  public async onModuleInit(): Promise<void> {
    await this.getModels();
    this.logger.log(`Loaded ${this.models.length} models`);
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

    if (!modelConfig) {
      throw new Error(`Could not find model ${modelId}`);
    }

    const provider = this.providerService.getProvider(modelConfig.provider.id);

    const modelClass = this.providerService.createModelClass(modelConfig.provider.id, {
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
    if (!modelConfig) {
      throw new Error(`Could not find model ${modelId}`);
    }

    const provider = this.providerService.getProvider(modelConfig.provider.id);

    return {
      // Some providers include cached read tokens in the input tokens,
      // so we need to subtract them if necessary.
      inputTokens: usage.inputTokens - (provider.inputTokensIncludesCachedReadTokens ? usage.cachedReadTokens : 0),
      outputTokens: usage.outputTokens,
      cachedReadTokens: usage.cachedReadTokens,
      cachedWriteTokens: usage.cachedWriteTokens,
    };
  }

  public getModelCost(modelId: string, usage: ChatUsageTokens): ChatUsageCost {
    const modelConfig = this.models.find((model) => model.id === modelId);
    if (!modelConfig) {
      throw new Error(`Could not find model ${modelId}`);
    }

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
            slug: model.name,
            model: model.name,
            modifiedAt: String(model.modified_at),
            size: model.size,
            digest: model.digest,
            details: {
              parentModel: model.details.parent_model,
              format: model.details.format,
              family: model.details.family as ModelFamily,
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
            provider: {
              id: 'ollama',
              name: 'Ollama',
            },
          };
        }),
      );

      const ollamaModelsWithToolSupport = ollamaModelList.filter((model) => model.support?.tools);

      return ollamaModelsWithToolSupport;
    } catch {
      return [];
    }
  }
}
