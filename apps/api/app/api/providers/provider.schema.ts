import { z } from 'zod/v4';

export const providerIdSchema = z
  .enum(['openai', 'anthropic', 'sambanova', 'ollama', 'vertexai', 'cerebras'])
  .describe('The provider of the model');

export const modelFamilySchema = z.enum(['gpt', 'claude', 'gemini']);

export const providerSchema = z.object({
  provider: providerIdSchema,
  inputTokensIncludesCachedReadTokens: z.boolean().describe('Whether the input tokens include cached read tokens'),
  configuration: z
    .object({
      apiKey: z.string().describe('The API key of the provider').optional(),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Langchain uses this format
      baseURL: z.string().describe('The base URL of the provider').optional(),
    })
    .describe('The configuration of the provider'),
});

export type ProviderId = z.infer<typeof providerIdSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type ModelFamily = z.infer<typeof modelFamilySchema>;
