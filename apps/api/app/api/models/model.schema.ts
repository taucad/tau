import { z } from 'zod/v4';
import { modelFamilySchema, providerIdSchema } from '#api/providers/provider.schema.js';

export const modelSupportSchema = z.object({
  tools: z.boolean().describe('Whether the model supports tools').optional(),
  toolChoice: z.boolean().describe('Whether the model supports tool choice').optional(),
});

export const modelConfigurationSchema = z.object({
  streaming: z.boolean().describe('Whether the model is streaming'),
  temperature: z.number().describe('The temperature of the model').optional(),
  maxTokens: z.number().describe('The maximum number of tokens to generate').optional(),
  thinking: z
    .object({
      type: z.enum(['enabled']).describe('A toggle to enable thinking'),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- some models use snake_case
      budget_tokens: z.number().describe('The maximum budget of tokens for thinking'),
    })
    .optional(),
});

export const modelDetailsSchema = z.object({
  parentModel: z.string().describe('The parent model of the current model').optional(),
  format: z.string().describe('The format of the model').optional(),
  family: modelFamilySchema,
  families: z.array(z.string()).describe('The families of the model'),
  parameterSize: z.string().describe('The parameter size of the model').optional(),
  quantizationLevel: z.string().describe('The quantization level of the model').optional(),
  contextWindow: z.number().describe('The context window of the model'),
  maxTokens: z.number().describe('The max tokens the model is capable of generating'),
  cost: z.object({
    inputTokens: z.number().describe('The cost of the input tokens of the model'),
    outputTokens: z.number().describe('The cost of the output tokens of the model'),
    cachedReadTokens: z.number().describe('The cost of the cached input tokens of the model'),
    cachedWriteTokens: z.number().describe('The cost of the cached output tokens of the model'),
  }),
});

export const modelSchema = z.object({
  id: z.string().describe('The unique identifier of the model'),
  name: z.string().describe('The human readable name of the model'),
  slug: z.string().describe('The slug of the model'),
  model: z.string().describe('The identifier of the model for the provider'),
  modifiedAt: z.string().describe('The modified at of the model').optional(),
  size: z.number().describe('The size of the model in bytes').optional(),
  digest: z.string().describe('The digest hash of the model').optional(),
  provider: providerIdSchema,
  details: modelDetailsSchema,
  configuration: modelConfigurationSchema,
  support: modelSupportSchema.optional(),
});

export type Model = z.infer<typeof modelSchema>;
export type ModelDetails = z.infer<typeof modelDetailsSchema>;
export type ModelSupport = z.infer<typeof modelSupportSchema>;
