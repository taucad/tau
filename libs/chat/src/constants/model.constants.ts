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
  'xai',
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
  'grok',
] as const;
