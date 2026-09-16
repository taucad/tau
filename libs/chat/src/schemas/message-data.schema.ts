// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import z from 'zod';

/**
 * Durable identifier minted by the funded-invocation boundary.
 *
 * Bounded exactly as the gateway transport bounds it before it reaches a
 * receipt lookup, so a persisted transcript cannot widen the identity a later
 * authenticated request is built from.
 */
const billingIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\u0021-\u007E]+$/u);

/** Status the funded boundary had bound when the turn was recorded. @public */
export const billingInvocationStatusSchema = z.enum(['pending', 'terminal', 'unavailable']);

/** @public */
export type BillingInvocationStatus = z.infer<typeof billingInvocationStatusSchema>;

/**
 * Schema for per-turn usage data.
 *
 * Tokens are local provider telemetry and explain a turn; they never price it.
 * The charge belongs to the account-scoped operation named by `operationId` and
 * is read from its authoritative receipt, so no credit or currency amount is
 * carried — or computed — here.
 * @public
 */
export const usageDataSchema = z.object({
  type: z.literal('usage'),
  id: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  /** Absent when the provider reported no reasoning count; a measured zero is `0`. */
  reasoningTokens: z.number().optional(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  /**
   * External agent that reported this usage, when Tau did not run the turn.
   *
   * Attribution is durable truth: the transcript has to be able to say *whose*
   * tokens these were, and an external turn carries no Tau operation because
   * Tau neither funded nor priced it. Absent for Tau's own turns.
   */
  agent: z.string().optional(),
  /** Funded Tau operation whose receipt is the only source of this turn's credits. */
  operationId: billingIdentifierSchema.optional(),
  /** The invocation attempt the operation was bound to; a support reference. */
  attemptId: billingIdentifierSchema.optional(),
  /** Dispatch status recorded at bind time; the receipt supersedes it. */
  billingStatus: billingInvocationStatusSchema.optional(),
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
export const contextCompactionTierSchema = z.enum(['tool_result_clearing', 'summarization']);

/** @public */
export type ContextCompactionTier = z.infer<typeof contextCompactionTierSchema>;

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
  'circuit_breaker_open',
  'summarization_failed',
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
  tier: contextCompactionTierSchema.optional(),
  reservedOutputTokens: z.number().optional(),
  reservedBufferTokens: z.number().optional(),
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

/** One ACP plan entry shown in the same plan surface as a native Tau turn. @public */
export const acpPlanEntrySchema = z.object({
  content: z.string(),
  priority: z.string(),
  status: z.string(),
});

/** Current ACP plan content. The agent replaces this value wholesale. @public */
export const acpPlanSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('items'), planId: z.string().optional(), entries: z.array(acpPlanEntrySchema) }),
  z.object({ type: z.literal('file'), planId: z.string(), uri: z.string() }),
  z.object({ type: z.literal('markdown'), planId: z.string(), content: z.string() }),
]);

/** One native command advertised by the active ACP agent. @public */
export const acpCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  input: z.object({ hint: z.string() }).nullish(),
});

const acpConfigValueSchema = z.object({
  value: z.string(),
  name: z.string(),
  description: z.string().nullish(),
});

const acpConfigValueGroupSchema = z.object({
  group: z.string(),
  name: z.string(),
  options: z.array(acpConfigValueSchema),
});

/** One current configuration option offered by the active ACP agent. @public */
export const acpConfigOptionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('select'),
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    category: z.string().nullish(),
    currentValue: z.string(),
    options: z.union([z.array(acpConfigValueSchema), z.array(acpConfigValueGroupSchema)]),
  }),
  z.object({
    type: z.literal('boolean'),
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    category: z.string().nullish(),
    currentValue: z.boolean(),
  }),
]);

/** Durable latest-value presentation state for one ACP session. @public */
export const acpSessionDataSchema = z.object({
  type: z.literal('acp-session'),
  id: z.string(),
  agentId: z.string(),
  sessionId: z.string().optional(),
  title: z.string().optional(),
  plan: acpPlanSchema.optional(),
  commands: z.array(acpCommandSchema),
  configOptions: z.array(acpConfigOptionSchema),
  modeId: z.string().optional(),
  modes: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullish() })).optional(),
});

/** @public */
export type AcpSessionData = z.infer<typeof acpSessionDataSchema>;

/**
 * Schema for custom data parts in UI messages.
 * @public
 */
export const dataPartSchema = z.object({
  usage: usageDataSchema,
  'context-compaction': contextCompactionDataSchema,
  'context-usage': contextUsageDataSchema,
  'acp-session': acpSessionDataSchema,
});
