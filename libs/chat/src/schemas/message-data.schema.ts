// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';

/**
 * Schema for per-turn usage data.
 * @public
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

/** @public */
export type UsageData = z.infer<typeof usageDataSchema>;

/** @public */
export const contextCompactionStatusSchema = z.enum(['skipped', 'compacted', 'failed', 'overflow_retry_succeeded']);

/** @public */
export type ContextCompactionStatus = z.infer<typeof contextCompactionStatusSchema>;

/** @public */
export const contextBudgetKindSchema = z.enum(['estimated']);

/** @public */
export type ContextBudgetKind = z.infer<typeof contextBudgetKindSchema>;

/** @public */
export const contextCompactionTriggerReasonSchema = z.enum(['none', 'estimate', 'previous_usage', 'overflow']);

/** @public */
export type ContextCompactionTriggerReason = z.infer<typeof contextCompactionTriggerReasonSchema>;

/** @public */
export const contextCompactionScheduleStatusSchema = z.enum(['none', 'scheduled_next_turn']);

/** @public */
export type ContextCompactionScheduleStatus = z.infer<typeof contextCompactionScheduleStatusSchema>;

/** @public */
export const contextCompactionFailureKindSchema = z.enum([
  'morph_transport_error',
  'morph_http_error',
  'morph_contract_error',
  'transcript_commit_failed',
  'context_overflow_retry_failed',
  'unexpected_error',
]);

/** @public */
export type ContextCompactionFailureKind = z.infer<typeof contextCompactionFailureKindSchema>;

/** @public */
export const contextCompactionFailureDispositionSchema = z.enum(['blocked_before_provider']);

/** @public */
export type ContextCompactionFailureDisposition = z.infer<typeof contextCompactionFailureDispositionSchema>;

/**
 * Schema for context compaction event data.
 * Emitted when the compaction middleware compresses conversation history.
 * @public
 */
export const contextCompactionDataSchema = z.object({
  type: z.literal('context-compaction'),
  id: z.string(),
  status: contextCompactionStatusSchema.optional(),
  triggerReason: contextCompactionTriggerReasonSchema.optional(),
  budgetKind: contextBudgetKindSchema.optional(),
  estimatedInputTokens: z.number().optional(),
  contextWindow: z.number().optional(),
  triggerThreshold: z.number().optional(),
  compactionId: z.string().optional(),
  tokensBeforeCompaction: z.number(),
  tokensAfterCompaction: z.number(),
  compressionRatio: z.number(),
  messagesEvicted: z.number(),
  transcriptFilePath: z.string().nullable(),
  compactionFailureKind: contextCompactionFailureKindSchema.optional(),
  failureDisposition: contextCompactionFailureDispositionSchema.optional(),
  debugId: z.string().optional(),
  providerNativeReplayMetadataPresent: z.boolean().optional(),
  missingFunctionCallSignatureCount: z.number().optional(),
});

/** @public */
export type ContextCompactionData = z.infer<typeof contextCompactionDataSchema>;

/**
 * Schema for context usage data.
 * Emitted as a transient data part to surface live context window utilization.
 * @public
 */
export const contextUsageDataSchema = z.object({
  type: z.literal('context-usage'),
  id: z.string(),
  totalInputTokens: z.number(),
  contextWindow: z.number(),
  percentUsed: z.number(),
  modelId: z.string(),
  budgetKind: contextBudgetKindSchema.optional(),
  triggerReason: contextCompactionTriggerReasonSchema.optional(),
  triggerThreshold: z.number().optional(),
  lastCompactionId: z.string().optional(),
  lastCompactionStatus: contextCompactionStatusSchema.optional(),
  compactionScheduleStatus: contextCompactionScheduleStatusSchema.optional(),
  scheduledTriggerReason: contextCompactionTriggerReasonSchema.optional(),
  scheduledInputTokens: z.number().optional(),
});

/** @public */
export type ContextUsageData = z.infer<typeof contextUsageDataSchema>;

/**
 * Schema for custom data parts in UI messages.
 * @public
 */
export const dataPartSchema = z.object({
  usage: usageDataSchema,
  'context-compaction': contextCompactionDataSchema,
  'context-usage': contextUsageDataSchema,
});
