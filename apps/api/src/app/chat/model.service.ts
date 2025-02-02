import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Model } from './model.schema';
import { ChatOllama, ChatOllamaInput } from '@langchain/ollama';
import { ChatOpenAI, ChatOpenAIFields } from '@langchain/openai';
import ollama from 'ollama';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
const MODELS = {
  samba: {
    'llama3.2': {
      name: 'Llama 3.3',
      provider: 'samba',
      model: 'Meta-Llama-3.3-70B-Instruct',
      details: {
        family: 'Llama 3.3',
        families: ['Llama 3.3'],
        parameterSize: '70B',
        contextWindow: 128_000,
        maxTokens: 16_384,
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
  },
  openai: {
    'gpt-o3-mini': {
      name: 'GPT-O3 Mini',
      provider: 'openai',
      model: 'o3-mini',
      details: {
        family: 'GPT-O3',
        families: ['GPT-O3'],
        parameterSize: '1.5B',
        contextWindow: 200_000,
        maxTokens: 100_000,
      },
      configuration: {
        streaming: true,
      },
    },
    'gpt-4o-mini': {
      name: 'GPT-4o Mini',
      provider: 'openai',
      model: 'gpt-4o-mini',
      details: {
        family: 'GPT-4o',
        families: ['GPT-4o'],
        parameterSize: '1.5B',
        contextWindow: 128_000,
        maxTokens: 16_384,
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
    'gpt-4o': {
      name: 'GPT-4o',
      provider: 'openai',
      model: 'gpt-4o',
      details: {
        family: 'GPT-4o',
        families: ['GPT-4o'],
        parameterSize: '1.5B',
        contextWindow: 128_000,
        maxTokens: 16_384,
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
    createClass: (options: ChatOpenAIFields) => new ChatOpenAI(options),
  },
  ollama: {
    provider: 'ollama',
    configuration: {
      baseURL: 'http://localhost:11434',
    },
    createClass: (options: ChatOllamaInput) => new ChatOllama(options),
  },
  samba: {
    provider: 'samba',
    configuration: {
      apiKey: process.env.SAMBA_API_KEY,
      baseURL: 'https://api.sambanova.ai/v1',
    },
    createClass: (options: ChatOpenAIFields) => new ChatOpenAI(options),
  },
} as const;

type Provider = keyof typeof PROVIDERS;

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

  public buildModel(modelName: string): BaseChatModel {
    const modelConfig = this.models.find((model) => model.model === modelName);

    if (!modelConfig) throw new Error(`Could not find model ${modelName}`);

    const provider = PROVIDERS[modelConfig.provider as Provider];

    const modelClass = provider.createClass({
      model: modelConfig.model,
      ...modelConfig.configuration,
      configuration: provider.configuration,
    });

    return modelClass;
  }

  private async getOllamaModels(): Promise<Model[]> {
    const ollamaModels = await ollama.list();
    const ollamaModelList = ollamaModels.models.map((model) => ({
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
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
      provider: 'ollama',
    }));

    return ollamaModelList;
  }
}
