import { z } from 'zod';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { EventLogError } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { modelProviderKinds, storageDurabilityClasses } from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { AgentLogEvent, JsonValue } from '#log/event-types.js';

const nonEmptyString = z.string().min(1);
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
  input: z.number().finite().nonnegative(),
  output: z.number().finite().nonnegative(),
  cacheRead: z.number().finite().nonnegative(),
  cacheWrite: z.number().finite().nonnegative(),
  total: z.number().finite().nonnegative(),
});
const usageSchema = z
  .object({
    input: z.number().finite().nonnegative(),
    output: z.number().finite().nonnegative(),
    cacheRead: z.number().finite().nonnegative(),
    cacheWrite: z.number().finite().nonnegative(),
    cacheWrite1h: z.number().finite().nonnegative().optional(),
    reasoning: z.number().finite().nonnegative().optional(),
    totalTokens: z.number().finite().nonnegative(),
    cost: usageCostSchema,
  })
  .catchall(jsonValueSchema);
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
    timestamp: z.number().finite().optional(),
    substituted: z.boolean().optional(),
    tauInternal: z.object({ kind: z.string() }).catchall(jsonValueSchema).optional(),
  })
  .catchall(jsonValueSchema);
const messageBase = { id: nonEmptyString };
const messageContent = { content: jsonValueSchema, metadata: metadataSchema.optional() };
export const userProviderMessageSchema = z.strictObject({
  ...messageBase,
  role: z.literal('user'),
  ...messageContent,
});
export const providerMessageSchema = z.discriminatedUnion('role', [
  userProviderMessageSchema,
  z.strictObject({ ...messageBase, role: z.literal('assistant'), ...messageContent }),
  z.strictObject({
    ...messageBase,
    role: z.literal('tool-input'),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
    ...messageContent,
  }),
  z.strictObject({
    ...messageBase,
    role: z.literal('tool-output'),
    toolCallId: nonEmptyString,
    toolName: nonEmptyString,
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

export const agentLogEventSchema = z.union([
  z.strictObject({ ...eventBase, type: z.literal('message.appended'), message: providerMessageSchema }),
  z.strictObject({
    ...eventBase,
    type: z.literal('message.envelope-replaced'),
    messageId: nonEmptyString,
    replacement: providerMessageSchema,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('history.compacted'),
    evictedMessageIds: z.array(nonEmptyString).min(1),
    summary: providerMessageSchema,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('history.rewound'),
    trigger: z.enum(['retry', 'edit', 'regenerate']),
    retainedMessageIds: z.array(nonEmptyString),
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('snapshot-context.refreshed'),
    messageId: nonEmptyString,
    content: jsonValueSchema,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('safeguard.recorded'),
    safeguardId: nonEmptyString,
    action: z.literal('nudge'),
    reason: nonEmptyString,
    message: userProviderMessageSchema,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('safeguard.recorded'),
    safeguardId: nonEmptyString,
    action: z.literal('terminate'),
    reason: nonEmptyString,
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('interrupt.recorded'),
    interruptId: nonEmptyString,
    phase: z.enum(['requested', 'resolved']),
    reason: nonEmptyString,
    payload: jsonValueSchema.optional(),
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('run.lifecycle'),
    state: z.enum(['admitted', 'running', 'paused', 'completed', 'failed', 'cancelled']),
    storageDurability: z.enum(storageDurabilityClasses).optional(),
    detail: runFailureDetailSchema.optional(),
  }),
  z.strictObject({
    ...eventBase,
    type: z.literal('turn.history-projection-committed'),
    retainedMessageIds: z.array(nonEmptyString),
    message: userProviderMessageSchema,
    context: turnContextSchema,
  }),
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
