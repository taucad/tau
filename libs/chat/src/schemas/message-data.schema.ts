import z from 'zod';

/**
 * Schema for per-turn usage data.
 */
export const usageDataSchema = z.object({
  type: z.literal('usage'),
  id: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  reasoningTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  inputTokensCost: z.number(),
  outputTokensCost: z.number(),
  cacheReadTokensCost: z.number(),
  cacheWriteTokensCost: z.number(),
  totalCost: z.number(),
});

export type UsageData = z.infer<typeof usageDataSchema>;

/**
 * Schema for custom data parts in UI messages.
 */
export const dataPartSchema = z.object({
  usage: usageDataSchema,
});
