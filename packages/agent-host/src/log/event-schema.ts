import { z } from 'zod';
import { EventLogError } from '#log/event-log-error.js';
import { modelProviderKinds, storageDurabilityClasses } from '#log/event-types.js';
import type { AgentLogEvent, FileRefContentBlock, JsonValue } from '#log/event-types.js';

const nonEmptyString = z.string().min(1);
const opaqueInvocationId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\u0021-\u007E]+$/u);
/** Recursive schema for any durable JSON value. @public */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
const usageCostSchema = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
  total: z.number().nonnegative(),
});
const usageSchema = z
  .object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
    cacheRead: z.number().nonnegative(),
    cacheWrite: z.number().nonnegative(),
    cacheWrite1h: z.number().nonnegative().optional(),
    reasoning: z.number().nonnegative().optional(),
    totalTokens: z.number().nonnegative(),
    cost: usageCostSchema,
  })
  .catchall(jsonValueSchema);
const compactionTraceSchema = z.looseObject({
  lane: z.enum(['start_of_turn', 'between_turn', 'overflow']),
  tier: z.enum(['tool_result_clearing', 'summarization']),
  tokensBefore: z.number().nonnegative(),
  tokensAfter: z.number().nonnegative(),
  cleared: z.number().int().nonnegative(),
  evicted: z.number().int().nonnegative(),
  summarizerAttempts: z.number().int().nonnegative(),
  summarizerUsage: usageSchema.nullable(),
  summarizerError: z.string().optional(),
  summary: z.enum(['generated', 'placeholder']).optional(),
  discardedOverflowError: z.string().optional(),
});
const metadataSchema = z
  .object({
    api: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    responseModel: z.string().optional(),
    responseId: z.string().optional(),
    diagnostics: z.array(jsonValueSchema).optional(),
    usage: usageSchema.optional(),
    stopReason: z.enum(['pending', 'stop', 'length', 'toolUse', 'error', 'aborted', 'deferred']).optional(),
    errorMessage: z.string().optional(),
    timestamp: z.number().optional(),
    substituted: z.boolean().optional(),
    tauInternal: z.object({ kind: z.string() }).catchall(jsonValueSchema).optional(),
  })
  .catchall(jsonValueSchema);
/*
 * The attachment URL shape, restated here on purpose: `apps/ui/app/utils/attachment.utils.ts`
 * owns it for the composer, and a published package cannot depend on an app.
 * Both spellings must stay in step — a row this rejects is a row the UI wrote
 * and no reader can resolve.
 */
/**
 * A durable `file-ref` path: `attachments/<sha256>.<ext>`.
 *
 * @internal
 */
export const attachmentPathPattern = /^attachments\/[\da-f]{64}\.(?:jpg|png|webp|gif|pdf)$/u;
const attachmentPath = z.string().regex(attachmentPathPattern);
/**
 * Schema for a content-addressed attachment reference in durable message content.
 *
 * Strict, unlike the loose event envelopes around it: this block is Tau's own
 * and a writer that cannot name its bytes or media type has written a row no
 * reader can resolve. `byteLength` is optional (P29) — it has no authoritative
 * source on every write path and no reader requires it — but a present one is
 * still a whole non-negative count, because a row must never lie about its size.
 *
 * @public
 */
export const fileRefBlockSchema: z.ZodType<FileRefContentBlock> = z.strictObject({
  type: z.literal('file-ref'),
  path: attachmentPath,
  mimeType: nonEmptyString,
  byteLength: z.number().int().nonnegative().optional(),
  filename: nonEmptyString.optional(),
});
const messageBase = { id: nonEmptyString };
const messageContent = { content: jsonValueSchema, metadata: metadataSchema.optional() };
/*
 * The emitter's own tool-call facts. `kind` and `status` are open strings on
 * purpose: those vocabularies belong to the protocol that produced them, and an
 * older reader must still read a newer one's value (D14).
 */
const toolCallProjectionSchema = z
  .object({
    toolCallId: nonEmptyString,
    kind: z.string().optional(),
    title: z.string().optional(),
    status: z.string().optional(),
    locations: z
      .array(
        z.object({ path: nonEmptyString, line: z.number().int().nonnegative().optional() }).catchall(jsonValueSchema),
      )
      .optional(),
    content: jsonValueSchema.optional(),
  })
  .catchall(jsonValueSchema);
/*
 * Loose, like every event variant below and for the same reason (D14): `call`
 * is itself a field a newer writer added to an existing message, and a strict
 * reader would have failed the whole log rather than ignore it.
 */
/** Schema for a provider-normalized user message. @public */
export const userProviderMessageSchema = z.looseObject({
  ...messageBase,
  role: z.literal('user'),
  ...messageContent,
});
/** Schema for any provider-normalized message role. @public */
export const providerMessageSchema = z.discriminatedUnion('role', [
  userProviderMessageSchema,
  z.looseObject({ ...messageBase, role: z.literal('assistant'), ...messageContent }),
  z.looseObject({
    ...messageBase,
    role: z.literal('tool-input'),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    call: toolCallProjectionSchema.optional(),
    ...messageContent,
  }),
  z.looseObject({
    ...messageBase,
    role: z.literal('tool-output'),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    call: toolCallProjectionSchema.optional(),
    content: jsonValueSchema,
    isError: z.boolean(),
    metadata: metadataSchema.optional(),
  }),
]);
const eventBase = {
  version: z.literal(1),
  leaderEpoch: nonEmptyString,
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  recordedAt: nonEmptyString,
  runId: nonEmptyString,
};
const systemPromptBlockSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
  cacheControl: z.strictObject({ type: z.literal('ephemeral'), scope: z.literal('global').optional() }).optional(),
});
/** Provider reasoning controls persisted with an admitted model row. @public */
export const modelReasoningConfigSchema = z.strictObject({
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  summary: z.enum(['auto', 'concise', 'detailed']).optional(),
  display: z.enum(['summarized', 'omitted']).optional(),
  budgetTokens: z.number().int().positive().optional(),
});
const turnContextSchema = z.strictObject({
  version: z.literal(1),
  systemPrompt: z.string(),
  systemPromptBlocks: z.array(systemPromptBlockSchema).optional(),
  model: z
    .strictObject({
      id: nonEmptyString,
      contextWindow: z.number().int().positive(),
      maxTokens: z.number().int().positive().optional(),
      providerKind: z.enum(modelProviderKinds).optional(),
      cost: z
        .strictObject({
          input: z.number().nonnegative(),
          output: z.number().nonnegative(),
          cacheRead: z.number().nonnegative(),
          cacheWrite: z.number().nonnegative(),
        })
        .optional(),
      reasoning: modelReasoningConfigSchema.optional(),
    })
    .optional(),
  toolChoice: z.union([z.enum(['none', 'auto', 'any', 'custom']), z.array(nonEmptyString)]).optional(),
  allowedTools: z.array(nonEmptyString).optional(),
  snapshot: jsonValueSchema.optional(),
  initialMessages: z.array(userProviderMessageSchema),
  postCompactionMessages: z.array(userProviderMessageSchema),
});
// Additive with every historical log: earlier writers emitted no detail at all,
// or a bare `{ message }`. Unknown keys are retained rather than stripped so a
// future field survives an older reader.
const runFailureDetailSchema = z
  .object({
    message: nonEmptyString,
    code: nonEmptyString.optional(),
    status: z.number().int().positive().optional(),
  })
  .catchall(jsonValueSchema);

/* Every variant below is loose for the reason `runFailureDetailSchema` states:
 * a field a newer writer adds is retained rather than rejected, so one
 * unreadable record never costs an older reader the whole chat (D14). */
const knownLogEventSchema = z.union([
  z.looseObject({ ...eventBase, type: z.literal('message.appended'), message: providerMessageSchema }),
  z.looseObject({
    ...eventBase,
    type: z.literal('message.envelope-replaced'),
    messageId: nonEmptyString,
    replacement: providerMessageSchema,
    details: compactionTraceSchema.optional(),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('history.compacted'),
    evictedMessageIds: z.array(nonEmptyString).min(1),
    summary: providerMessageSchema,
    details: compactionTraceSchema.optional(),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('history.rewound'),
    trigger: z.enum(['retry', 'edit', 'regenerate']),
    retainedMessageIds: z.array(nonEmptyString),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('snapshot-context.refreshed'),
    messageId: nonEmptyString,
    content: jsonValueSchema,
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('safeguard.recorded'),
    safeguardId: nonEmptyString,
    action: z.literal('nudge'),
    reason: nonEmptyString,
    message: userProviderMessageSchema,
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('safeguard.recorded'),
    safeguardId: nonEmptyString,
    action: z.literal('terminate'),
    reason: nonEmptyString,
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('interrupt.recorded'),
    interruptId: nonEmptyString,
    phase: z.enum(['requested', 'resolved']),
    reason: nonEmptyString,
    payload: jsonValueSchema.optional(),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('turn.finalized'),
    turnId: nonEmptyString,
    runId: nonEmptyString,
    chatId: nonEmptyString,
    projectId: nonEmptyString,
    checkoutId: nonEmptyString.optional(),
    revisionId: nonEmptyString.optional(),
    branch: nonEmptyString.optional(),
    changedPaths: z.array(z.string()),
    treeId: nonEmptyString.optional(),
    trigger: z.literal('turn'),
    runIds: z.array(nonEmptyString),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('turn.conflicted'),
    turnId: nonEmptyString,
    runId: nonEmptyString,
    chatId: nonEmptyString,
    checkoutId: nonEmptyString.optional(),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('turn.failed'),
    turnId: nonEmptyString,
    runId: nonEmptyString,
    chatId: nonEmptyString,
    checkoutId: nonEmptyString.optional(),
    reason: z.string(),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('run.lifecycle'),
    state: z.enum(['admitted', 'running', 'paused', 'completed', 'failed', 'cancelled']),
    storageDurability: z.enum(storageDurabilityClasses).optional(),
    detail: runFailureDetailSchema.optional(),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('model.invocation-prepared'),
    attemptId: opaqueInvocationId,
    purpose: z.enum(['generation', 'compaction']),
    modelId: z.string().min(1).max(256),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('model.invocation-bound'),
    attemptId: opaqueInvocationId,
    operationId: opaqueInvocationId,
    status: z.enum(['pending', 'terminal', 'unavailable']),
  }),
  z.looseObject({
    ...eventBase,
    type: z.literal('turn.history-projection-committed'),
    retainedMessageIds: z.array(nonEmptyString),
    message: userProviderMessageSchema,
    context: turnContextSchema,
  }),
]);

const knownEventTypes = new Set<string>(knownLogEventSchema.options.map((option) => option.shape.type.value));

/**
 * Schema for one durable or broadcast agent event envelope.
 *
 * The terminal variant is the other half of D14: a record whose `type` this
 * reader does not know parses whole and unexamined, so it is preserved,
 * cursored and replayed rather than failing the log — the reducer has no case
 * for it and never executes it. A record whose type *is* known still fails
 * closed, which is why the passthrough refuses the known ones.
 *
 * The declared vocabulary stays {@link AgentLogEvent}: a passthrough record is
 * carried, not modelled. Naming it in the union would make every `switch` over
 * the log — in this package, in the daemon and in the browser projection —
 * narrow a known type together with an unconstrained one for no reader's gain.
 *
 * @public
 */
export const agentLogEventSchema = z.union([
  knownLogEventSchema,
  z
    .looseObject({
      ...eventBase,
      type: nonEmptyString.refine((type) => !knownEventTypes.has(type), {
        error: 'must not be a known event type',
      }),
    })
    .transform((record) => record as AgentLogEvent),
]);

/** Validate one untrusted durable or broadcast event envelope. @public */
export const parseLogEvent = (value: unknown): AgentLogEvent => {
  const result = agentLogEventSchema.safeParse(value);
  if (!result.success) {
    throw new EventLogError('EVENT_INVALID', `Invalid agent event-log record: ${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data as AgentLogEvent;
};
