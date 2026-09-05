import { z } from 'zod';

/** Canonical provider identifiers accepted by Tau chat. @public */
export const providerIdSchema = z.enum([
  'openai',
  'anthropic',
  'ollama',
  'vertexai',
  'cerebras',
  'together',
  'morph',
  'xai',
  'moonshot',
  'tau',
]);

/** Canonical model-family identifiers accepted by Tau chat. @public */
export const modelFamilySchema = z.enum([
  'gpt',
  'claude',
  'gemini',
  'deepseek',
  'glm',
  'qwen',
  'llama',
  'minimax',
  'grok',
  'kimi',
  'tau',
]);

/** @public */
export type ModelProvider = z.infer<typeof providerIdSchema>;
/** @public */
export type ModelFamily = z.infer<typeof modelFamilySchema>;
