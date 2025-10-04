export const modelProviders = ['sambanova', 'openai', 'anthropic', 'ollama'] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const modelFamilies = ['gpt', 'claude', 'gemini'] as const;
export type ModelFamily = (typeof modelFamilies)[number];

export type Model = {
  id: string;
  model: string;
  name: string;
  slug: string;
  provider: ModelProvider;
  details: {
    family: ModelFamily;
    parameterSize: string;
  };
};
