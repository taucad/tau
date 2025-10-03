export type Model = {
  id: string;
  name: string;
  description?: string;
  provider: ModelProvider;
  family: ModelFamily;
  contextLength: number;
  parameters?: Record<string, unknown>;
};

export const modelProviders = ['sambanova', 'openai', 'anthropic', 'ollama'] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const modelFamilies = ['gpt', 'claude', 'gemini'] as const;
export type ModelFamily = (typeof modelFamilies)[number];

