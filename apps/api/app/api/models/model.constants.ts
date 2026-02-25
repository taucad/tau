import type { Model } from '#api/models/model.schema.js';
import type { CloudProviderId } from '#api/models/model.service.js';

export const modelList: Record<CloudProviderId, Record<string, Model>> = {
  anthropic: {
    'claude-4.6-opus': {
      id: 'anthropic-claude-opus-4.6',
      name: 'Opus 4.6',
      slug: 'claude-opus-4.6',
      description:
        "Anthropic's most powerful model with adaptive reasoning, great for designing complex multi-part assemblies.",
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-4-6',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000,
        maxTokens: 128_000,
        cost: {
          inputTokens: 5,
          outputTokens: 25,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 6.25,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 20_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 20_000,
        thinking: {
          type: 'adaptive',
        },
        outputConfig: {
          effort: 'medium',
        },
      },
    },
    'claude-4.5-opus': {
      id: 'anthropic-claude-opus-4.5',
      name: 'Opus 4.5',
      slug: 'claude-opus-4.5',
      description: 'Previous Anthropic flagship with extended thinking capabilities.',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-opus-4-5-20251101',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'claude',
        families: ['claude'],
        contextWindow: 200_000,
        maxTokens: 32_000,
        cost: {
          inputTokens: 5,
          outputTokens: 25,
          cacheReadTokens: 0.5,
          cacheWriteTokens: 6.25,
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
    'claude-sonnet-4.6': {
      id: 'anthropic-claude-sonnet-4.6',
      name: 'Sonnet 4.6',
      slug: 'claude-sonnet-4.6',
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
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cacheReadTokens: 0.3,
          cacheWriteTokens: 3.75,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 20_000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 20_000,
        thinking: {
          type: 'adaptive',
        },
        outputConfig: {
          effort: 'medium',
        },
      },
    },
    'claude-haiku-4.5': {
      id: 'anthropic-claude-haiku-4.5',
      name: 'Haiku 4.5',
      slug: 'claude-haiku-4.5',
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
    'gpt-5.2': {
      id: 'openai-gpt-5.2',
      name: 'GPT-5.2',
      slug: 'gpt-5.2',
      description:
        "OpenAI's most capable model with advanced reasoning, great for design tasks that require complex reasoning.",
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.2',
      details: {
        family: 'gpt',
        families: ['GPT-5.2'],
        contextWindow: 400_000,
        maxTokens: 128_000,
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
        // @ts-expect-error: OpenAI reasoning params not in typed schema
        reasoningText: {
          effort: 'medium',
        },
      },
    },
    'gpt-5.2-codex': {
      id: 'openai-gpt-5.2-codex',
      name: 'GPT-5.2 Codex',
      slug: 'gpt-5.2-codex',
      description: 'Specialized for code generation and programming tasks.',
      provider: {
        id: 'openai',
        name: 'OpenAI',
      },
      model: 'gpt-5.2-codex',
      details: {
        family: 'gpt',
        families: ['GPT-5.2'],
        contextWindow: 400_000,
        maxTokens: 128_000,
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
        // @ts-expect-error: OpenAI reasoning params not in typed schema
        reasoningText: {
          effort: 'high',
        },
      },
    },
    'gpt-4.1': {
      id: 'openai-gpt-4.1',
      name: 'GPT-4.1',
      slug: 'gpt-4.1',
      description: 'Reliable and cost-effective for general-purpose design tasks.',
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
    'gemini-3-pro': {
      id: 'google-gemini-3-pro',
      name: 'Gemini 3 Pro',
      slug: 'gemini-3-pro',
      description: "Google's most capable model with a large context window, great for complex design tasks.",
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3-pro-preview',
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        cost: {
          inputTokens: 2, // $2 / 1M input tokens (Vertex AI pricing)
          outputTokens: 12, // $12 / 1M output tokens (Vertex AI pricing)
          cacheReadTokens: 0.2, // $0.2 / 1M cached input tokens
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        thinkingLevel: 'HIGH',
      },
    },
    'gemini-3-flash': {
      id: 'google-gemini-3-flash',
      name: 'Gemini 3 Flash',
      slug: 'gemini-3-flash',
      description: 'Fast and efficient, great for quick design tasks or small changes.',
      provider: {
        id: 'vertexai',
        name: 'Google',
      },
      model: 'gemini-3-flash-preview',
      details: {
        family: 'gemini',
        families: ['gemini'],
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        cost: {
          inputTokens: 0.5,
          outputTokens: 3,
          cacheReadTokens: 0.05,
          cacheWriteTokens: 0,
        },
      },
      configuration: {
        streaming: true,
        temperature: 1,
        thinkingLevel: 'HIGH',
      },
    },
  },
} as const;
