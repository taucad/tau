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
  overBudget: z.boolean().optional(),
  discardedOverflowError: z.string().optional(),
  anchor: z.object({ messageId: z.string(), tokens: z.number().nonnegative() }).optional(),
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
const position = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const counter = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const envelopeFields = {
  leaderEpoch: nonEmptyString,
  sequence: position,
  recordedAt: nonEmptyString,
  runId: nonEmptyString,
  epoch: counter.optional(),
  commandId: nonEmptyString.optional(),
  attempt: counter.optional(),
};
const eventBase = { version: z.literal(1), ...envelopeFields };
/*
 * What every row must carry to be kept at all (CL-R1): a row with this envelope and anything else is opaque; a line
 * without it is quarantined. `version` is any integer, so a newer schema version is carried, not refused (D16).
 */
const rowEnvelopeSchema = z.looseObject({
  ...envelopeFields,
  version: z.number().int().positive(),
  type: nonEmptyString,
});
const turnPlacementSchema = z.looseObject({
  checkoutId: nonEmptyString,
  branch: nonEmptyString.optional(),
  baseRevisionId: nonEmptyString.optional(),
  mode: z.enum(['direct', 'candidate']),
});
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
const lifecycleEventSchema = z.looseObject({
  ...eventBase,
  type: z.literal('run.lifecycle'),
  state: z.enum(['admitted', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  placement: turnPlacementSchema.optional(),
  storageDurability: z.enum(storageDurabilityClasses).optional(),
  detail: runFailureDetailSchema.optional(),
});
const committedHistoryEventSchema = z.looseObject({
  ...eventBase,
  type: z.literal('turn.history-projection-committed'),
  retainedMessageIds: z.array(nonEmptyString),
  message: userProviderMessageSchema,
  context: turnContextSchema,
});
const sharedEventShapes = {
  messageAppended: { type: z.literal('message.appended'), message: providerMessageSchema },
  messageEnvelopeReplaced: {
    type: z.literal('message.envelope-replaced'),
    messageId: nonEmptyString,
    replacement: providerMessageSchema,
    details: compactionTraceSchema.optional(),
  },
  historyCompacted: {
    type: z.literal('history.compacted'),
    evictedMessageIds: z.array(nonEmptyString).min(1),
    summary: providerMessageSchema,
    details: compactionTraceSchema.optional(),
  },
  historyRewound: {
    type: z.literal('history.rewound'),
    trigger: z.enum(['retry', 'edit', 'regenerate']),
    retainedMessageIds: z.array(nonEmptyString),
  },
  snapshotContextRefreshed: {
    type: z.literal('snapshot-context.refreshed'),
    messageId: nonEmptyString,
    content: jsonValueSchema,
  },
  safeguardRecordedNudge: {
    type: z.literal('safeguard.recorded'),
    safeguardId: nonEmptyString,
    action: z.literal('nudge'),
    reason: nonEmptyString,
    message: userProviderMessageSchema,
  },
  safeguardRecordedTerminate: {
    type: z.literal('safeguard.recorded'),
    safeguardId: nonEmptyString,
    action: z.literal('terminate'),
    reason: nonEmptyString,
  },
  interruptRecorded: {
    type: z.literal('interrupt.recorded'),
    interruptId: nonEmptyString,
    phase: z.enum(['requested', 'resolved']),
    reason: nonEmptyString,
    payload: jsonValueSchema.optional(),
  },
  turnChanged: {
    type: z.literal('turn.changed'),
    turnId: nonEmptyString,
    chatId: nonEmptyString,
    attempt: z.number().int().positive(),
    checkoutId: nonEmptyString,
  },
  turnFinalized: {
    type: z.literal('turn.finalized'),
    turnId: nonEmptyString,
    chatId: nonEmptyString,
    projectId: nonEmptyString,
    checkoutId: nonEmptyString.optional(),
    revisionId: nonEmptyString.optional(),
    branch: nonEmptyString.optional(),
    changedPaths: z.array(z.string()),
    treeId: nonEmptyString.optional(),
    trigger: z.literal('turn'),
    runIds: z.array(nonEmptyString),
  },
  turnConflicted: {
    type: z.literal('turn.conflicted'),
    turnId: nonEmptyString,
    chatId: nonEmptyString,
    checkoutId: nonEmptyString.optional(),
  },
  turnFailed: {
    type: z.literal('turn.failed'),
    turnId: nonEmptyString,
    chatId: nonEmptyString,
    checkoutId: nonEmptyString.optional(),
    reason: z.string(),
    code: nonEmptyString.optional(),
  },
  modelInvocationPrepared: {
    type: z.literal('model.invocation-prepared'),
    attemptId: opaqueInvocationId,
    purpose: z.enum(['generation', 'compaction']),
    modelId: z.string().min(1).max(256),
    principal: z.string().min(1).max(256).optional(),
  },
  modelInvocationBound: {
    type: z.literal('model.invocation-bound'),
    attemptId: opaqueInvocationId,
    operationId: opaqueInvocationId,
    status: z.enum(['pending', 'terminal', 'unavailable']),
  },
  modelInvocationSettledCharged: {
    type: z.literal('model.invocation-settled'),
    attemptId: opaqueInvocationId,
    outcome: z.enum(['settled', 'released', 'absorbed']),
    operationId: opaqueInvocationId,
    chargedCreditAtoms: z.string().regex(/^\d+$/u),
  },
  modelInvocationSettledVoided: {
    type: z.literal('model.invocation-settled'),
    attemptId: opaqueInvocationId,
    outcome: z.literal('voided'),
  },
} as const;
const sharedEventSchemas = [
  z.looseObject({ ...eventBase, ...sharedEventShapes.messageAppended }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.messageEnvelopeReplaced }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.historyCompacted }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.historyRewound }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.snapshotContextRefreshed }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.safeguardRecordedNudge }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.safeguardRecordedTerminate }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.interruptRecorded }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.turnChanged }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.turnFinalized }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.turnConflicted }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.turnFailed }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.modelInvocationPrepared }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.modelInvocationBound }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.modelInvocationSettledCharged }),
  z.looseObject({ ...eventBase, ...sharedEventShapes.modelInvocationSettledVoided }),
] as const;
const knownLogEventSchema = z.union([...sharedEventSchemas, lifecycleEventSchema, committedHistoryEventSchema]);

// Canonical reading normalizes anchor extras; compact transport must never reshape accepted input.
const projectionCompactionTraceSchema = compactionTraceSchema.extend({
  anchor: compactionTraceSchema.shape.anchor.unwrap().strict().optional(),
});

/** The compact vocabulary shares the canonical field validators while omitting execution-only data. @internal */
export const projectionEffectSchemas = [
  z.object(sharedEventShapes.messageAppended),
  z.object({ ...sharedEventShapes.messageEnvelopeReplaced, details: projectionCompactionTraceSchema.optional() }),
  z.object({ ...sharedEventShapes.historyCompacted, details: projectionCompactionTraceSchema.optional() }),
  z.object(sharedEventShapes.historyRewound),
  z.object(sharedEventShapes.snapshotContextRefreshed).pick({ type: true }),
  z.object(sharedEventShapes.safeguardRecordedNudge),
  z.object(sharedEventShapes.safeguardRecordedTerminate),
  z.object(sharedEventShapes.interruptRecorded),
  z.object(sharedEventShapes.turnChanged),
  z.object(sharedEventShapes.turnFinalized),
  z.object(sharedEventShapes.turnConflicted),
  z.object(sharedEventShapes.turnFailed),
  z.object(sharedEventShapes.modelInvocationPrepared),
  z.object(sharedEventShapes.modelInvocationBound),
  z.object(sharedEventShapes.modelInvocationSettledCharged),
  z.object(sharedEventShapes.modelInvocationSettledVoided),
  lifecycleEventSchema
    .omit({
      version: true,
      leaderEpoch: true,
      sequence: true,
      recordedAt: true,
      runId: true,
      epoch: true,
      commandId: true,
      attempt: true,
    })
    .strip()
    .extend({
      stopReason: z.string().optional(),
      admission: z
        .strictObject({
          kind: z.enum(['tau', 'external']),
          turnId: nonEmptyString,
          message: userProviderMessageSchema,
        })
        .refine((admission) => admission.turnId === admission.message.id)
        .optional(),
      rewind: z.strictObject({ retainedMessageIds: z.array(z.string()) }).optional(),
    }),
  committedHistoryEventSchema.pick({ type: true, message: true }).strip(),
] as const;

/** Original physical row identity, shared by compact wire facts. @internal */
export const projectionRowSchema = z.strictObject(eventBase);
/** Future-version row identity, shared by opaque compact wire facts. @internal */
export const opaqueProjectionRowSchema = z.strictObject({ ...eventBase, version: z.number().int().positive() });

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

/**
 * How a reader keeps one line (CL-R1). `known`: it parses under this build's schema and is folded. `opaque`: a valid
 * envelope with an unknown type, a version above 1, or a known type with an unknown enum value or nested field; it is
 * preserved, cursored and returned by reads, but never folded or executed. `quarantined`: no valid envelope; the
 * line is skipped, reported and excluded from the cursor.
 *
 * @internal
 */
export type ClassifiedRow =
  | { readonly class: 'known'; readonly event: AgentLogEvent }
  | { readonly class: 'opaque'; readonly event: AgentLogEvent }
  | { readonly class: 'quarantined' };

/**
 * Class one row as a tolerant reader keeps it (D16: read tolerantly, execute strictly).
 *
 * @internal
 * @param value - One row as read, from a file or a wire batch.
 * @returns The row's class, with the row itself unless it is quarantined.
 */
export const classifyLogRow = (value: unknown): ClassifiedRow => {
  if (!rowEnvelopeSchema.safeParse(value).success) {
    return { class: 'quarantined' };
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- an opaque row is carried, not modelled (see agentLogEventSchema).
  const carried = value as AgentLogEvent;
  const known = knownLogEventSchema.safeParse(value);
  return known.success ? { class: 'known', event: known.data as AgentLogEvent } : { class: 'opaque', event: carried };
};

const knownJsonInputsByType = new Map<string, z.ZodType>();
for (const schema of knownLogEventSchema.options) {
  const type = schema.shape.type.value;
  if (!knownJsonInputsByType.has(type)) {
    const variants = knownLogEventSchema.options.filter((candidate) => candidate.shape.type.value === type);
    knownJsonInputsByType.set(type, variants.length === 1 ? schema : z.union(variants));
  }
}

/**
 * Classify a freshly parsed JSON line using the existing validators for its own type.
 * The value cannot escape before classification; generic callers retain the original union and getter semantics.
 * @param text - Decoded JSON, with no caller-supplied reviver or object references.
 * @returns The same tolerant row class as the generic reader.
 * @internal
 */
export const classifyLogJson = (text: string): ClassifiedRow => {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { class: 'quarantined' };
  }
  const envelope = rowEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    return { class: 'quarantined' };
  }
  const known = knownJsonInputsByType.get(envelope.data.type)?.safeParse(value);
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the validated opaque envelope is carried unchanged.
  return known?.success
    ? { class: 'known', event: known.data as AgentLogEvent }
    : { class: 'opaque', event: value as AgentLogEvent };
};

/** Rows whose loss leaves the provider history wrong; an opaque one breaks the chat's history (CL-R2). @internal */
export const historyRowTypes: ReadonlySet<string> = new Set([
  'message.appended',
  'message.envelope-replaced',
  'history.compacted',
  'history.rewound',
  'snapshot-context.refreshed',
  'safeguard.recorded',
  'turn.history-projection-committed',
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
