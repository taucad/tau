export const modelProviders = ['sambanova', 'openai', 'anthropic', 'ollama', 'vertexai', 'cerebras'] as const;
export type ModelProvider = (typeof modelProviders)[number];

export const modelFamilies = ['gpt', 'claude', 'gemini'] as const;
export type ModelFamily = (typeof modelFamilies)[number];

export type Model = {
  id: string;
  model: string;
  name: string;
  slug: string;
  description?: string;
  provider: {
    id: ModelProvider;
    name: string;
  };
  contextLength: number;
  details: {
    family: ModelFamily;
    parameterSize: string;
  };
};
