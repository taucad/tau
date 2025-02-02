import { z } from 'zod';

export const ModelSupportSchema = z.object({
  tools: z.boolean().describe('Whether the model supports tools'),
});

export const ModelConfigurationSchema = z.object({
  streaming: z.boolean().describe('Whether the model is streaming'),
  temperature: z.number().describe('The temperature of the model').optional(),
});

export const ModelDetailsSchema = z.object({
  parentModel: z.string().describe('The parent model of the current model').optional(),
  format: z.string().describe('The format of the model').optional(),
  family: z.string().describe('The family of the model'),
  families: z.array(z.string()).describe('The families of the model'),
  parameterSize: z.string().describe('The parameter size of the model'),
  quantizationLevel: z.string().describe('The quantization level of the model').optional(),
  contextWindow: z.number().describe('The context window of the model'),
  maxTokens: z.number().describe('The max tokens the model is capable of generating'),
});

export const ModelSchema = z.object({
  name: z.string().describe('The human readable name of the model'),
  model: z.string().describe('The identifier of the model'),
  modifiedAt: z.string().describe('The modified at of the model').optional(),
  size: z.number().describe('The size of the model in bytes').optional(),
  digest: z.string().describe('The digest hash of the model').optional(),
  provider: z.string().describe('The provider of the model'),
  details: ModelDetailsSchema,
  configuration: ModelConfigurationSchema,
  support: ModelSupportSchema.optional(),
});

export const ProviderSchema = z.object({
  provider: z.string().describe('The provider of the model'),
  configuration: z
    .object({
      apiKey: z.string().describe('The API key of the provider'),
      baseURL: z.string().describe('The base URL of the provider'),
    })
    .describe('The configuration of the provider'),
});

export type Model = z.infer<typeof ModelSchema>;
export type ModelDetails = z.infer<typeof ModelDetailsSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type ModelSupport = z.infer<typeof ModelSupportSchema>;
