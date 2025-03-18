import { z } from 'zod';

export const ChatUsageTokensSchema = z.object({
  inputTokens: z.number().describe('The number of input tokens consumed'),
  outputTokens: z.number().describe('The number of output tokens consumed'),
  cachedReadTokens: z.number().describe('The number of cached input tokens read'),
  cachedWriteTokens: z.number().describe('The number of cached output tokens written'),
});

export const ChatUsageCostSchema = z.object({
  inputTokensCost: z.number().describe('The cost of the input tokens consumed'),
  outputTokensCost: z.number().describe('The cost of the output tokens consumed'),
  cachedReadTokensCost: z.number().describe('The cost of the cached input tokens read'),
  cachedWriteTokensCost: z.number().describe('The cost of the cached output tokens written'),
  totalCost: z.number().describe('The total cost of the usage'),
});

/**
 * The usage of the chat model
 */
export type ChatUsageTokens = z.infer<typeof ChatUsageTokensSchema>;
export type ChatUsageCost = z.infer<typeof ChatUsageCostSchema>;
