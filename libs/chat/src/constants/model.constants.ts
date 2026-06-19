/**
 * AI model providers.
 * @public
 */
export const modelProviders = [
  //
  'sambanova',
  'openai',
  'anthropic',
  'ollama',
  'vertexai',
  'cerebras',
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
  'minimax',
] as const;
