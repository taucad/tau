import type { Model } from '#api/models/model.schema.js';
import type { ProviderId } from '#api/providers/provider.schema.js';

type CloudCatalogProviderId = Exclude<ProviderId, 'ollama'>;

/** Catalog row; omit {@link ModelListEntry.enabled} or set `true` to expose via GET `/v1/models`. */
export type ModelListEntry = Model & { readonly enabled?: boolean };

export function modelListEntryToModel(entry: ModelListEntry): Model {
  const { enabled: _enabled, ...model } = entry;
  return model;
}

export function isModelListEntryEnabled(entry: ModelListEntry): boolean {
  return entry.enabled !== false;
}

export const modelList: Record<CloudCatalogProviderId, Record<string, ModelListEntry>> = {
  anthropic: {
    'claude-4.8-opus': {
      id: 'anthropic-claude-opus-4.8',
      name: 'Opus 4.8',
      slug: 'claude-opus-4.8',
      recommended: true,
      description:
        "Anthropic's most powerful model with adaptive reasoning and 1M context, great for designing complex multi-part assemblies.",
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-4-8',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 300_000, // Maximum is 1M, but we reduce to 300K to keep costs down
        maxTokens: 128_000,
        knowledgeCutoff: '2026-01',
        cost: {
          inputTokens: 5,
          outputTokens: 25,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 6.25,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
          display: 'summarized',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-sonnet-4.6': {
      id: 'anthropic-claude-sonnet-4.6',
      name: 'Sonnet 4.6',
      slug: 'claude-sonnet-4.6',
      recommended: true,
      description: 'Best combination of speed and intelligence, great for most design tasks.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-4-6',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000,
        maxTokens: 64_000,
        knowledgeCutoff: '2025-08',
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cacheReadTokens: 0.3,
          cacheWriteTokens: 3.75,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 120_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 120_000,
        thinking: {
          type: 'adaptive',
        },
        outputConfig: {
          effort: 'high',
        },
      },
    },
    'claude-haiku-4.5': {
      id: 'anthropic-claude-haiku-4.5',
      name: 'Haiku 4.5',
      slug: 'claude-haiku-4.5',
      recommended: true,
      description: 'Fastest Claude model, ideal for quick design tasks or small changes.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-haiku-4-5-20251001',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000,
        maxTokens: 64_000,
        knowledgeCutoff: '2025-07',
        cost: {
          inputTokens: 1,
          outputTokens: 5,
          cacheReadTokens: 0.1,
          cacheWriteTokens: 1.25,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 16_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 16_000,
        thinking: {
          type: 'enabled',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
          budget_tokens: 4000,
        },
      },
    },
  },
  openai: {
    'gpt-5.5': {
      id: 'openai-gpt-5.5',
      name: 'GPT-5.5',
      slug: 'gpt-5.5',
      recommended: true,
      description:
        "OpenAI's frontier model with agentic reasoning and a 1M+ context window, strong at planning multi-part assemblies and verifying its own work.",
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.5',
      details: {
        family: 'gpt',
        families: ['GPT-5.5'],
        contextWindow: 1_050_000,
        maxTokens: 128_000,
        knowledgeCutoff: '2025-12',
        cost: {
          inputTokens: 5,
          outputTokens: 30,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    'gpt-5.3-codex': {
      id: 'openai-gpt-5.3-codex',
      name: 'GPT-5.3 Codex',
      slug: 'gpt-5.3-codex',
      recommended: true,
      description:
        "OpenAI's state-of-the-art coding model, ideal for generating and refactoring CAD scripts across many files.",
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.3-codex',
      details: {
        family: 'gpt',
        families: ['GPT-5.3'],
        contextWindow: 400_000,
        maxTokens: 128_000,
        knowledgeCutoff: '2025-08',
        cost: {
          inputTokens: 1.75,
          outputTokens: 14,
          cacheReadTokens: 0.175,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
    'gpt-4.1': {
      id: 'openai-gpt-4.1',
      name: 'GPT-4.1',
      slug: 'gpt-4.1',
      recommended: true,
      description: 'Reliable and cost-effective generalist with a 1M context window, good for everyday design tasks.',
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
        knowledgeCutoff: '2024-06',
        cost: {
          inputTokens: 2,
          outputTokens: 8,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
  },
  vertexai: {
    'gemini-3.1-pro': {
      id: 'google-gemini-3.1-pro',
      name: 'Gemini 3.1 Pro',
      slug: 'gemini-3.1-pro',
      recommended: true,
      description:
        "Google's flagship with sharpened 3D spatial reasoning and parallel tool streaming, excellent for complex modelling work.",
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.1-pro-preview',
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        knowledgeCutoff: '2025-01',
        cost: {
          inputTokens: 2,
          outputTokens: 12,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        thinkingLevel: 'HIGH',
      },
    },
    'gemini-3.5-flash': {
      id: 'google-gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      slug: 'gemini-3.5-flash',
      recommended: true,
      description:
        'Frontier intelligence at Flash speed with sharpened agentic coding, ideal for rapid design iterations and small changes.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.5-flash',
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        knowledgeCutoff: '2025-01',
        cost: {
          inputTokens: 1.5,
          outputTokens: 9,
          cacheReadTokens: 0.15,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        thinkingLevel: 'MEDIUM',
      },
    },
  },

  together: {
    'deepseek-v3.1': {
      enabled: false,
      id: 'together-deepseek-v3.1',
      name: 'DeepSeek V3.1',
      slug: 'deepseek-v3.1',
      description: 'Best open-source coder with native thinking-in-tool-use, great for complex CAD code generation.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'deepseek-ai/DeepSeek-V3.1',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'deepseek',
        families: ['deepseek'],
        contextWindow: 128_000,
        maxTokens: 64_000,
        knowledgeCutoff: '2024-07',
        cost: {
          inputTokens: 0.6,
          outputTokens: 1.7,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'deepseek-r1': {
      enabled: false,
      id: 'together-deepseek-r1',
      name: 'DeepSeek R1',
      slug: 'deepseek-r1',
      description: 'Best open-source reasoning model for complex geometry and multi-step assembly design.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'deepseek-ai/DeepSeek-R1',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'deepseek',
        families: ['deepseek'],
        contextWindow: 128_000,
        maxTokens: 64_000,
        knowledgeCutoff: '2024-07',
        cost: {
          inputTokens: 3,
          outputTokens: 7,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'glm-5.1': {
      enabled: false,
      id: 'together-glm-5.1',
      name: 'GLM-5.1',
      slug: 'glm-5.1',
      description: 'Flagship open-source model for long-horizon agentic coding and complex engineering tasks.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'zai-org/GLM-5.1',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'glm',
        families: ['glm'],
        contextWindow: 202_752,
        maxTokens: 128_000,
        cost: {
          inputTokens: 1.4,
          outputTokens: 4.4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'qwen-3.5-397b': {
      enabled: false,
      id: 'together-qwen-3.5-397b',
      name: 'Qwen 3.5 397B',
      slug: 'qwen-3.5-397b',
      description: 'Near-linear attention with 262K context and native multimodal, strong for large CAD projects.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'Qwen/Qwen3.5-397B-A17B',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'qwen',
        families: ['qwen'],
        contextWindow: 262_144,
        maxTokens: 64_000,
        cost: {
          inputTokens: 0.6,
          outputTokens: 3.6,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
    'llama-4-maverick': {
      enabled: false,
      id: 'together-llama-4-maverick',
      name: 'Llama 4 Maverick',
      slug: 'llama-4-maverick',
      description: 'Strong general-purpose and coding model with 1M context window and massive ecosystem support.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'llama',
        families: ['llama'],
        contextWindow: 1_048_576,
        maxTokens: 64_000,
        knowledgeCutoff: '2024-08',
        cost: {
          inputTokens: 0.27,
          outputTokens: 0.85,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
  },

  cerebras: {
    'qwen-3-235b': {
      enabled: false,
      id: 'cerebras-qwen-3-235b',
      name: 'Qwen 3 235B',
      slug: 'cerebras-qwen-3-235b',
      description: 'Strong reasoning model running at ~1,400 tok/s, great for iterative CAD design.',
      provider: {
        id: 'cerebras',
        name: 'Cerebras',
      },
      model: 'qwen-3-235b-a22b-instruct-2507',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'qwen',
        families: ['qwen'],
        contextWindow: 128_000,
        maxTokens: 64_000,
        cost: {
          inputTokens: 0.4,
          outputTokens: 0.8,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
  },
} as const satisfies Record<CloudCatalogProviderId, Record<string, ModelListEntry>>;
