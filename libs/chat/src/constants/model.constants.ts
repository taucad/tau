/**
 * AI model providers.
 * @public
 */
export const modelProviders = [
  //
  'openai',
  'anthropic',
  'ollama',
  'vertexai',
  'cerebras',
  'together',
  'morph',
] as const;

/**
 * AI model families.
 * @public
 */
export const modelFamilies = [
  //
  'gpt',
  'claude',
  'gemini',
  'deepseek',
  'glm',
  'qwen',
  'llama',
  'minimax',
] as const;
