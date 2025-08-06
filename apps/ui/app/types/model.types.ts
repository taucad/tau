export const modelProviders = ['sambanova', 'openai', 'anthropic', 'ollama', 'google', 'cerebras'] as const;
export type ModelProvider = (typeof modelProviders)[number];

export type Model = {
  id: string;
  name: string;
  model: string;
  description?: string;
  provider: {
    id: ModelProvider;
    name: string;
  };
  contextLength: number;
  details: {
    parameterSize: string;
  };
};
