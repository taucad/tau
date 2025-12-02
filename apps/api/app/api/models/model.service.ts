import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import ollama from 'ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatUsageCost, ChatUsageTokens } from '#api/chat/chat.schema.js';
import type { ModelFamily, ProviderId } from '#api/providers/provider.schema.js';
import { ProviderService } from '#api/providers/provider.service.js';
import type { Model, ModelSupport } from '#api/models/model.schema.js';
import { modelList } from '#api/models/model.constants.js';

export type CloudProviderId = Exclude<ProviderId, 'ollama'>;

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
              maxOutputTokens: 100_000,
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
