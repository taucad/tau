import { z } from 'zod';

export const providerIdSchema = z
  .enum(['openai', 'anthropic', 'sambanova', 'ollama'])
  .describe('The provider of the model');

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
