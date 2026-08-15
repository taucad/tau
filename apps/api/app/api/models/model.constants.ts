import type { Model, ModelModalities } from '#api/models/model.schema.js';
import type { ProviderId } from '#api/providers/provider.schema.js';

// 'ollama' (runtime-discovered) and 'tau' (TAU_TEST_MODE replay, runtime-appended)
// are never part of the static cloud catalog.
type CloudCatalogProviderId = Exclude<ProviderId, 'ollama' | 'tau'>;

const textOnlyModalities = { input: ['text'], output: ['text'] } satisfies ModelModalities;
const imageInputModalities = { input: ['text', 'image'], output: ['text'] } satisfies ModelModalities;

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
    'claude-fable-5': {
      enabled: true,
      id: 'anthropic-claude-fable-5',
      name: 'Fable 5',
      slug: 'claude-fable-5',
      recommended: true,
      description:
        "Anthropic's most capable widely released model for the hardest long-horizon agentic CAD design work.",
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-fable-5',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports larger windows; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-01',
        cost: {
          inputTokens: 10,
          outputTokens: 50,
          cacheReadTokens: 1,
          cacheWriteTokens: 12.5,
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
    'claude-opus-5': {
      id: 'anthropic-claude-opus-5',
      name: 'Opus 5',
      slug: 'claude-opus-5',
      recommended: true,
      description:
        'Strong Opus model for long-horizon agentic CAD design, complex multi-part assemblies, and multi-file work.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-5',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-05',
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
    'claude-4.8-opus': {
      id: 'anthropic-claude-opus-4.8',
      name: 'Opus 4.8',
      slug: 'claude-opus-4.8',
      recommended: false,
      description:
        "Anthropic's most powerful long-context capable model with adaptive reasoning, great for designing complex multi-part assemblies.",
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-4-8',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports larger windows; Tau caps effective chat budget for cost and compaction reliability.
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
    'claude-sonnet-5': {
      id: 'anthropic-claude-sonnet-5',
      name: 'Sonnet 5',
      slug: 'claude-sonnet-5',
      recommended: true,
      description: 'Strong Claude model for complex CAD design iterations and long multi-file edits.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-5',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000, // Provider supports larger windows; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-02',
        cost: {
          inputTokens: 2,
          outputTokens: 10,
          cacheReadTokens: 0.2,
          cacheWriteTokens: 2.5,
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
      recommended: false,
      description: 'Best combination of speed and intelligence, great for most design tasks.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-4-6',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
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
        modalities: imageInputModalities,
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
    'gpt-5.6-sol': {
      enabled: true,
      id: 'openai-gpt-5.6-sol',
      name: 'GPT-5.6 Sol',
      slug: 'gpt-5.6-sol',
      recommended: true,
      description:
        "OpenAI's frontier model for complex CAD design, strong at planning multi-part assemblies and verifying its own work.",
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.6-sol',
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-02',
        cost: {
          inputTokens: 5,
          outputTokens: 30,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 6.25,
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
    'gpt-5.6-terra': {
      enabled: true,
      id: 'openai-gpt-5.6-terra',
      name: 'GPT-5.6 Terra',
      slug: 'gpt-5.6-terra',
      recommended: true,
      description: 'Strong balance of intelligence and cost for everyday CAD design, iteration, and multi-file edits.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.6-terra',
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-02',
        cost: {
          inputTokens: 2.5,
          outputTokens: 15,
          cacheReadTokens: 0.25,
          cacheWriteTokens: 3.125,
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
    'gpt-5.6-luna': {
      enabled: true,
      id: 'openai-gpt-5.6-luna',
      name: 'GPT-5.6 Luna',
      slug: 'gpt-5.6-luna',
      recommended: true,
      description: 'Fast, cost-efficient model for high-volume CAD iterations and small design changes.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.6-luna',
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.6'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 128_000,
        knowledgeCutoff: '2026-02',
        cost: {
          inputTokens: 0.2,
          outputTokens: 1.2,
          cacheReadTokens: 0.02,
          cacheWriteTokens: 0.25,
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
    'gpt-5.5': {
      enabled: true,
      id: 'openai-gpt-5.5',
      name: 'GPT-5.5',
      slug: 'gpt-5.5',
      recommended: false,
      description:
        "OpenAI's previous frontier model for complex CAD planning, multi-part assemblies, and design verification.",
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.5',
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.5'],
        contextWindow: 200_000, // Provider supports 1.05M tokens; Tau caps effective chat budget for cost and compaction reliability.
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
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-5.3'],
        contextWindow: 200_000,
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
      description: 'Reliable and cost-effective long-context capable generalist, good for everyday design tasks.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-4.1',
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gpt',
        families: ['GPT-4.1'],
        contextWindow: 200_000,
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
    // Off-catalog metering row (AD14): the name/commit generators bill their
    // gpt-4o-mini calls through the credit ledger via getModelCost; never listed.
    'gpt-4o-mini': {
      enabled: false,
      id: 'openai-gpt-4o-mini',
      name: 'GPT-4o mini (generator metering)',
      slug: 'openai-gpt-4o-mini',
      description: 'Internal cost-metering entry for the project-name and commit-message generators.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-4o-mini',
      support: {
        toolChoice: false,
        modalities: textOnlyModalities,
      },
      details: {
        family: 'gpt',
        families: ['gpt'],
        contextWindow: 128_000,
        maxTokens: 16_384,
        cost: {
          inputTokens: 0.15,
          outputTokens: 0.6,
          cacheReadTokens: 0.075,
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
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000,
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
    'gemini-3.6-flash': {
      id: 'google-gemini-3.6-flash',
      name: 'Gemini 3.6 Flash',
      slug: 'gemini-3.6-flash',
      recommended: true,
      description: 'Efficient multimodal coding model for complex agentic CAD iterations and spatial reasoning.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.6-flash',
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000,
        maxTokens: 65_536,
        knowledgeCutoff: '2025-01',
        cost: {
          inputTokens: 1.5,
          outputTokens: 7.5,
          cacheReadTokens: 0.15,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        thinkingLevel: 'MEDIUM',
      },
    },
    'gemini-3.5-flash-lite': {
      id: 'google-gemini-3.5-flash-lite',
      name: 'Gemini 3.5 Flash-Lite',
      slug: 'gemini-3.5-flash-lite',
      recommended: false,
      description: 'Fast, low-cost multimodal model for lightweight CAD edits and high-throughput iterations.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.5-flash-lite',
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000,
        maxTokens: 65_536,
        knowledgeCutoff: '2025-01',
        cost: {
          inputTokens: 0.3,
          outputTokens: 2.5,
          cacheReadTokens: 0.03,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        thinkingLevel: 'MEDIUM',
      },
    },
    'gemini-3.5-flash': {
      id: 'google-gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      slug: 'gemini-3.5-flash',
      recommended: false,
      description:
        'Frontier intelligence at Flash speed with sharpened agentic coding, ideal for rapid design iterations and small changes.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3.5-flash',
      support: {
        modalities: imageInputModalities,
      },
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 200_000,
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
    'kimi-k3': {
      enabled: true,
      id: 'together-kimi-k3',
      name: 'Kimi K3',
      slug: 'kimi-k3',
      recommended: true,
      description: 'Long-context multimodal reasoning model for complex agentic CAD design and multi-file work.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'moonshotai/Kimi-K3',
      support: {
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'kimi',
        families: ['kimi'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 200_000,
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cacheReadTokens: 0.3,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
      },
    },
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
        modalities: textOnlyModalities,
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
        modalities: textOnlyModalities,
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
        modalities: textOnlyModalities,
      },
      details: {
        family: 'glm',
        families: ['glm'],
        contextWindow: 200_000,
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
    'glm-5.2': {
      id: 'together-glm-5.2',
      name: 'GLM-5.2',
      slug: 'glm-5.2',
      description:
        'Strong text-only open reasoning model for long-horizon CAD code generation and complex geometry planning.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'zai-org/GLM-5.2',
      support: {
        tools: true,
        toolChoice: false,
        modalities: textOnlyModalities,
      },
      details: {
        family: 'glm',
        families: ['glm'],
        contextWindow: 200_000,
        maxTokens: 131_072,
        cost: {
          inputTokens: 1.4,
          outputTokens: 4.4,
          cacheReadTokens: 0.26,
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
      description: 'Long-context capable native multimodal model, strong for large CAD projects.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'Qwen/Qwen3.5-397B-A17B',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'qwen',
        families: ['qwen'],
        contextWindow: 200_000,
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
      description: 'Strong long-context capable general-purpose and coding model with massive ecosystem support.',
      provider: {
        id: 'together',
        name: 'Together AI',
      },
      model: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'llama',
        families: ['llama'],
        contextWindow: 200_000,
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

  morph: {
    'qwen-3.5-397b': {
      enabled: false,
      id: 'morph-qwen-3.5-397b',
      name: 'Qwen 3.5 397B',
      slug: 'qwen-3.5-397b',
      recommended: true,
      description: 'Strong long-context capable open coder with vision, good for large multi-file CAD projects.',
      provider: {
        id: 'morph',
        name: 'Morph',
      },
      model: 'morph-qwen35-397b',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'qwen',
        families: ['qwen'],
        contextWindow: 200_000,
        maxTokens: 65_536,
        cost: {
          inputTokens: 0.478,
          outputTokens: 3.5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        reasoning: {
          effort: 'medium',
        },
      },
    },
    'minimax-m2.7': {
      id: 'morph-minimax-m2.7',
      name: 'MiniMax M2.7',
      slug: 'minimax-m2.7',
      recommended: false,
      description: 'Cost-efficient open coder for everyday design work and long agentic tool loops.',
      provider: {
        id: 'morph',
        name: 'Morph',
      },
      model: 'morph-minimax27-230b',
      support: {
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'minimax',
        families: ['minimax'],
        contextWindow: 200_000,
        maxTokens: 65_536,
        cost: {
          inputTokens: 0.279,
          outputTokens: 1.2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        reasoning: {
          effort: 'medium',
        },
      },
    },
    'deepseek-v4-flash': {
      enabled: false,
      id: 'morph-deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      slug: 'deepseek-v4-flash',
      description: 'Long-context capable open coder (beta), capped by Tau for cost and compaction reliability.',
      provider: {
        id: 'morph',
        name: 'Morph',
      },
      model: 'morph-dsv4flash',
      support: {
        toolChoice: false,
        modalities: textOnlyModalities,
      },
      details: {
        family: 'deepseek',
        families: ['deepseek'],
        contextWindow: 200_000,
        maxTokens: 65_536,
        cost: {
          inputTokens: 0.3,
          outputTokens: 0.4,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        reasoning: {
          effort: 'medium',
        },
      },
    },
  },

  xai: {
    'grok-4.5': {
      enabled: true,
      id: 'xai-grok-4.5',
      name: 'Grok 4.5',
      slug: 'grok-4.5',
      recommended: false,
      description: 'Strong xAI reasoning model for complex CAD planning and long agentic tool loops.',
      provider: {
        id: 'xai',
        name: 'xAI',
      },
      model: 'grok-4.5',
      support: {
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'grok',
        families: ['grok'],
        contextWindow: 200_000,
        maxTokens: 64_000,
        cost: {
          inputTokens: 2,
          outputTokens: 6,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        maxOutputTokens: 64_000,
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
    },
  },

  moonshot: {
    'kimi-k3': {
      enabled: false,
      id: 'moonshot-kimi-k3',
      name: 'Kimi K3',
      slug: 'kimi-k3',
      recommended: false,
      description: 'Long-context multimodal reasoning model for complex agentic CAD design and multi-file work.',
      provider: {
        id: 'moonshot',
        name: 'Moonshot AI',
      },
      model: 'kimi-k3',
      support: {
        tools: true,
        toolChoice: false,
        modalities: imageInputModalities,
      },
      details: {
        family: 'kimi',
        families: ['kimi'],
        contextWindow: 200_000, // Provider supports 1M tokens; Tau caps effective chat budget for cost and compaction reliability.
        maxTokens: 1_048_576,
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cacheReadTokens: 0.3,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        reasoning: {
          effort: 'high',
        },
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
        modalities: textOnlyModalities,
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
    // Off-catalog metering row (AD14): the code-completion service bills its
    // Cerebras calls through the credit ledger via getModelCost; never listed.
    'llama-3.3-70b': {
      enabled: false,
      id: 'cerebras-llama-3.3-70b',
      name: 'Llama 3.3 70B (completion metering)',
      slug: 'cerebras-llama-3.3-70b',
      description: 'Internal cost-metering entry for the inline code-completion service.',
      provider: {
        id: 'cerebras',
        name: 'Cerebras',
      },
      model: 'llama-3.3-70b',
      support: {
        toolChoice: false,
        modalities: textOnlyModalities,
      },
      details: {
        family: 'llama',
        families: ['llama'],
        contextWindow: 128_000,
        maxTokens: 8192,
        cost: {
          inputTokens: 0.85,
          outputTokens: 1.2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: false,
      },
    },
  },
} as const satisfies Record<CloudCatalogProviderId, Record<string, ModelListEntry>>;
