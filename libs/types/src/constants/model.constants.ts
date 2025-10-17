/**
 * AI model providers.
 */
export const modelProviders = [
  //
  'sambanova',
  'openai',
  'anthropic',
  'ollama',
  'vertexai',
  'cerebras',
] as const;

/**
 * AI model families.
 */
export const modelFamilies = [
  //
  'gpt',
  'claude',
  'gemini',
] as const;
