import { z } from 'zod';

export const providerIdSchema = z
  // 'tau' is the TAU_TEST_MODE replay provider (dev/test only); it is never in
  // the static catalog and is appended at runtime like Ollama.
  .enum(['openai', 'anthropic', 'ollama', 'vertexai', 'cerebras', 'together', 'morph', 'xai', 'moonshot', 'tau'])
  .describe('The provider of the model');

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

export const providerSchema = z.object({
  provider: providerIdSchema,
  otelProviderName: z.string().describe('OTEL semantic convention well-known provider name (gen_ai.provider.name)'),
  inputTokensIncludesCacheReadTokens: z.boolean().describe('Whether the input tokens include cached read tokens'),
  inputTokensIncludesCacheWriteTokens: z
    .boolean()
    .describe('Whether the input tokens include cached write (creation) tokens'),
  configuration: z
    .object({
      apiKey: z.string().describe('The API key of the provider').optional(),
      baseURL: z.string().describe('The base URL of the provider').optional(),
    })
    .describe('The configuration of the provider'),
});

export type ProviderId = z.infer<typeof providerIdSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type ModelFamily = z.infer<typeof modelFamilySchema>;
