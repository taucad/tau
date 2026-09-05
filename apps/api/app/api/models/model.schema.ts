import { z } from 'zod';
import { modelFamilySchema, providerIdSchema } from '#api/providers/provider.schema.js';

export const modelSupportSchema = z.object({
  tools: z.boolean().describe('Whether the model supports tools').optional(),
  toolChoice: z.boolean().describe('Whether the model supports tool choice').optional(),
  modalities: z
    .object({
      input: z
        .array(z.enum(['text', 'image']))
        .min(1)
        .describe('Input modalities the model can receive'),
      output: z
        .array(z.enum(['text']))
        .min(1)
        .describe('Output modalities the model can produce'),
    })
    .describe('Model input and output modality support')
    .optional(),
});

export const modelConfigurationSchema = z.object({
  streaming: z.boolean().describe('Whether the model is streaming'),
  temperature: z.number().describe('The temperature of the model').optional(),
  maxTokens: z.number().describe('The maximum number of tokens to generate').optional(),
  maxOutputTokens: z.number().describe('The maximum number of output tokens to generate').optional(),
  topP: z.number().describe('The top P of the model').optional(),
  thinking: z
    .union([
      z.object({
        type: z.literal('enabled').describe('Enable thinking with an explicit token budget'),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
        budget_tokens: z.number().describe('The maximum budget of tokens for thinking'),
      }),
      z.object({
        type: z.literal('adaptive').describe('Adaptive thinking lets the model decide when to reason'),
        display: z
          .enum(['summarized', 'omitted'])
          .describe('Whether thinking content is included in the response stream (Opus 4.7+)')
          .optional(),
      }),
    ])
    .optional(),
  outputConfig: z
    .object({
      effort: z
        .enum(['low', 'medium', 'high', 'xhigh', 'max'])
        .describe('The effort level for adaptive thinking')
        .optional(),
    })
    .optional(),
  thinkingLevel: z
    .enum(['LOW', 'MEDIUM', 'HIGH', 'THINKING_LEVEL_UNSPECIFIED'])
    .describe('Gemini thinking level (Google-specific)')
    .optional(),
  reasoning: z
    .object({
      effort: z.enum(['low', 'medium', 'high']).describe('Reasoning effort level').optional(),
      summary: z.enum(['auto', 'concise', 'detailed']).describe('Reasoning summary output').optional(),
    })
    .describe('OpenAI reasoning model configuration')
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
  knowledgeCutoff: z.string().describe('Knowledge cutoff date in YYYY-MM format').optional(),
  cost: z.object({
    inputTokens: z.number().describe('The cost of the input tokens of the model'),
    outputTokens: z.number().describe('The cost of the output tokens of the model'),
    cacheReadTokens: z.number().describe('The cost of the cached input tokens of the model'),
    cacheWriteTokens: z.number().describe('The cost of the cached output tokens of the model'),
  }),
});

const modelProviderSchema = z.object({
  id: providerIdSchema,
  name: z.string().describe('The name of the provider'),
});

export const modelProviderKindSchema = z.enum(['tau-hosted', 'local', 'in-browser']);

export const modelSchema = z.object({
  id: z.string().describe('The unique identifier of the model'),
  providerKind: modelProviderKindSchema.describe('Where the model provider runs and whether Tau meters it'),
  name: z.string().describe('The human readable name of the model'),
  slug: z.string().describe('The slug of the model'),
  description: z.string().describe('A human-readable description of the model').optional(),
  recommended: z
    .boolean()
    .describe('Whether the model is shown in the compact Models list by default (vs hidden behind "View All Models")')
    .optional(),
  model: z.string().describe('The identifier of the model for the provider'),
  modifiedAt: z.string().describe('The modified at of the model').optional(),
  size: z.number().describe('The size of the model in bytes').optional(),
  digest: z.string().describe('The digest hash of the model').optional(),
  provider: modelProviderSchema,
  details: modelDetailsSchema,
  configuration: modelConfigurationSchema,
  support: modelSupportSchema.optional(),
});

export type Model = z.infer<typeof modelSchema>;
export type ModelProviderKind = z.infer<typeof modelProviderKindSchema>;
export type ModelDetails = z.infer<typeof modelDetailsSchema>;
export type ModelSupport = z.infer<typeof modelSupportSchema>;
export type ModelModalities = NonNullable<ModelSupport['modalities']>;
export type ModelInputModality = NonNullable<ModelSupport['modalities']>['input'][number];
