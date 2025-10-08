import type { Model } from "#api/models/model.schema.js";
import type { CloudProviderId } from "#api/models/model.service.js";

export const modelList = {
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
        contextWindow: 1048576,
        maxTokens: 65536,
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
    'claude-sonnet-4.5': {
      id: 'anthropic-claude-sonnet-4.5',
      name: 'Claude Sonnet 4.5',
      slug: 'claude-sonnet-4.5',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-4-5-20250929',
      details: {
        family: 'claude',
        families: ['Claude'],
        contextWindow: 200000,
        // Sonnet 4.5 supports standard output up to 8192 tokens
        maxTokens: 8192,
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cachedReadTokens: 0.3,
          cachedWriteTokens: 3.75,
        },
      },
      configuration: {
        streaming: true,
        temperature: 0,
      },
    },
    'claude-sonnet-4.5-thinking': {
      id: 'anthropic-claude-sonnet-4.5-thinking',
      name: 'Claude Sonnet 4.5 (Extended Thinking)',
      slug: 'claude-sonnet-4.5-thinking',
      provider: {
        id: 'anthropic',
        name: 'Anthropic',
      },
      model: 'claude-sonnet-4-5-20250929',
      support: {
        toolChoice: false,
      },
      details: {
        family: 'claude',
        families: ['Claude'],
        contextWindow: 200000,
        // Extended thinking mode supports up to 64000 tokens
        maxTokens: 64000,
        cost: {
          inputTokens: 3,
          outputTokens: 15,
          cachedReadTokens: 0.3,
          cachedWriteTokens: 3.75,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 20000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 20000,
        thinking: {
          type: 'enabled',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
          budget_tokens: 10000,
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
        contextWindow: 200000,
        // Extended thinking mode supports up to 64000 tokens
        maxTokens: 64000,
        cost: {
          inputTokens: 15,
          outputTokens: 75,
          cachedReadTokens: 1.5,
          cachedWriteTokens: 18.75,
        },
      },
      configuration: {
        streaming: true,
        maxTokens: 20000,
        // @ts-expect-error: FIXME - some models use camelCase
        // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
        max_tokens: 20000,
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
        contextWindow: 200000,
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
        contextWindow: 1047576,
        maxTokens: 32768,
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
        contextWindow: 200000,
        maxTokens: 100000,
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
        contextWindow: 128000,
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
        contextWindow: 64000,
        maxTokens: 64000,
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
} as const satisfies Record<CloudProviderId, Record<string, Model>>;
