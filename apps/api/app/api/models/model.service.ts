import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ollama from 'ollama';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ToolName } from '@taucad/chat';
import { filterProviderFacingToolNamesByModelSupport } from '@taucad/chat/schemas';
import type { ChatUsageCost, ChatUsageTokens } from '#api/chat/chat.schema.js';
import type { Environment } from '#config/environment.config.ts';
import type { ModelFamily, ProviderId } from '#api/providers/provider.schema.js';
import { ProviderService } from '#api/providers/provider.service.js';
import type { Model, ModelProviderKind, ModelSupport } from '#api/models/model.schema.js';
import { isModelListEntryEnabled, modelList, modelListEntryToModel } from '#api/models/model.constants.js';
import { Span } from '#telemetry/tracer.service.js';
import type { ProviderDiagnosticsContext, ProviderDiagnosticsLogger } from '#api/chat/utils/provider-diagnostics.js';
import { createProviderDiagnosticsContext } from '#api/chat/utils/provider-diagnostics.js';

export type CloudProviderId = Exclude<ProviderId, 'ollama'>;

@Injectable()
export class ModelService implements OnModuleInit {
  public models: Model[] = [];
  private readonly logger = new Logger(ModelService.name);

  public constructor(
    private readonly providerService: ProviderService,
    private readonly configService: ConfigService<Environment>,
  ) {}

  @Span()
  public buildModel(
    modelId: string,
    options: { providerDiagnosticsContext?: ProviderDiagnosticsContext } = {},
  ): { model: BaseChatModel; support?: ModelSupport } {
    const modelConfig = this.models.find((model) => model.id === modelId);

    if (!modelConfig) {
      throw new Error(`Could not find model ${modelId}`);
    }

    const provider = this.providerService.getProvider(modelConfig.provider.id);

    const modelClass = this.providerService.createModelClass(
      modelConfig.provider.id,
      {
        model: modelConfig.model,
        ...modelConfig.configuration,
        configuration: provider.configuration,
      },
      {
        diagnosticsContext: options.providerDiagnosticsContext,
      },
    );

    return {
      model: modelClass,
      support: modelConfig.support,
    };
  }

  public createProviderDiagnosticsContext(options: {
    chatId: string;
    modelId: string;
    providerId: ProviderId;
    logger: ProviderDiagnosticsLogger;
  }): ProviderDiagnosticsContext {
    return createProviderDiagnosticsContext({
      ...options,
      verbose: this.configService.get('TAU_PROVIDER_DIAGNOSTICS_VERBOSE', { infer: true }) ?? false,
    });
  }

  public async onModuleInit(): Promise<void> {
    await this.getModels();
    this.logger.log(`Loaded ${this.models.length} models`);
  }

  public async getModels(): Promise<Model[]> {
    const ollamaEnabled = this.configService.get('OLLAMA_ENABLED', { infer: true });
    const ollamaModels = ollamaEnabled ? await this.getOllamaModels() : [];
    const cloudEntries = Object.values(modelList).flatMap((modelsBySlug) => Object.values(modelsBySlug));
    const cloudModels = cloudEntries.map((entry) => modelListEntryToModel(entry));
    this.models = [...cloudModels, ...ollamaModels];
    const listedCloud = cloudEntries
      .filter((entry) => isModelListEntryEnabled(entry))
      .map((entry) => modelListEntryToModel(entry));
    return [...listedCloud, ...ollamaModels];
  }

  public getOtelProviderName(modelId: string): string | undefined {
    const modelConfig = this.models.find((model) => model.id === modelId);
    if (!modelConfig) {
      return undefined;
    }
    return this.providerService.getProvider(modelConfig.provider.id).otelProviderName;
  }

  public normalizeUsageTokens(modelId: string, usage: ChatUsageTokens): ChatUsageTokens {
    const modelConfig = this.models.find((model) => model.id === modelId);
    if (!modelConfig) {
      throw new Error(`Could not find model ${modelId}`);
    }

    const provider = this.providerService.getProvider(modelConfig.provider.id);

    return {
      // Some providers include cached tokens in the input tokens,
      // so we need to subtract them if necessary.
      inputTokens:
        usage.inputTokens -
        (provider.inputTokensIncludesCacheReadTokens ? usage.cacheReadTokens : 0) -
        (provider.inputTokensIncludesCacheWriteTokens ? usage.cacheWriteTokens : 0),
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    };
  }

  public getContextWindow(modelId: string): number | undefined {
    const modelConfig = this.models.find((model) => model.id === modelId);
    return modelConfig?.details.contextWindow;
  }

  public getProviderId(modelId: string): ProviderId | undefined {
    const modelConfig = this.models.find((model) => model.id === modelId);
    return modelConfig?.provider.id;
  }

  public getProviderKind(modelId: string): ModelProviderKind | undefined {
    const modelConfig = this.models.find((model) => model.id === modelId);
    return modelConfig?.providerKind;
  }

  public getKnowledgeCutoff(modelId: string): string | undefined {
    const modelConfig = this.models.find((model) => model.id === modelId);
    return modelConfig?.details.knowledgeCutoff;
  }

  public getModelSupport(modelId: string): ModelSupport | undefined {
    const modelConfig = this.models.find((model) => model.id === modelId);
    return modelConfig?.support;
  }

  public filterProviderToolNamesForModel({
    modelId,
    toolNames,
  }: {
    modelId: string;
    toolNames: readonly ToolName[];
  }): ToolName[] {
    return filterProviderFacingToolNamesByModelSupport({
      toolNames,
      modelSupport: this.getModelSupport(modelId),
    });
  }

  public getModelCost(modelId: string, usage: ChatUsageTokens): ChatUsageCost {
    const modelConfig = this.models.find((model) => model.id === modelId);
    if (!modelConfig) {
      throw new Error(`Could not find model ${modelId}`);
    }

    // Convert cost per million tokens to cost per token
    const inputCostPerToken = modelConfig.details.cost.inputTokens / 1_000_000;
    const outputCostPerToken = modelConfig.details.cost.outputTokens / 1_000_000;
    const cacheReadCostPerToken = modelConfig.details.cost.cacheReadTokens / 1_000_000;
    const cacheWriteCostPerToken = modelConfig.details.cost.cacheWriteTokens / 1_000_000;

    // Calculate individual costs
    const inputTokensCost = usage.inputTokens * inputCostPerToken;
    const outputTokensCost = usage.outputTokens * outputCostPerToken;
    const cacheReadTokensCost = usage.cacheReadTokens * cacheReadCostPerToken;
    const cacheWriteTokensCost = usage.cacheWriteTokens * cacheWriteCostPerToken;

    // Calculate total cost
    const totalCost = inputTokensCost + outputTokensCost + cacheReadTokensCost + cacheWriteTokensCost;

    return {
      inputTokensCost,
      outputTokensCost,
      cacheReadTokensCost,
      cacheWriteTokensCost,
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
            providerKind: 'local',
            name: model.name,
            slug: model.name,
            recommended: true,
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
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
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
              modalities: { input: ['text'], output: ['text'] },
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
