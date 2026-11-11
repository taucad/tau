import { z } from 'zod';

/** Wire revision; independent of Pi and destination schema versions. @public */
export const evidenceVersion = 1;
/** Hard admission bounds before any transport or database work. @public */
export const evidenceLimits = Object.freeze({ bytes: 262_144, blocks: 32, sources: 64, text: 65_536 });
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w:.-]+$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z.number().int().nonnegative().max(8_640_000_000_000_000);
const completeness = z.enum(['complete', 'redacted', 'omitted', 'truncated', 'missing', 'unsupported', 'pending']);
const outcome = z.enum(['completed', 'cancelled', 'failed', 'abandoned', 'unknown']);
const toolClass = z.enum(['read', 'write', 'execute', 'geometry', 'verification', 'export', 'other']);
const coverage = z.strictObject({
  events: completeness,
  input: completeness,
  output: completeness,
  usage: completeness,
  artifacts: completeness,
  permission: completeness,
});
const usage = z.strictObject({
  input: count.nullable(),
  output: count.nullable(),
  cacheRead: count.nullable(),
  cacheWrite: count.nullable(),
  reasoning: count.nullable(),
  missing: z.enum(['none', 'unreported', 'partial', 'unsupported']),
});
const source = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('row'), chat: id, leaderEpoch: id, sequence: count, digest }),
  z.strictObject({ kind: z.literal('invocation'), invocation: id, digest }),
  z.strictObject({ kind: z.literal('interaction'), interaction: id, digest }),
]);
const semantic = z.strictObject({
  kind: z.enum([
    'instruction',
    'context',
    'provider',
    'tool',
    'transformation',
    'cad',
    'outcome',
    'response',
    'rating',
    'financial',
    'governance',
  ]),
  id,
});
const lineage = z.strictObject({
  source: id,
  digest,
  protection: z.enum(['pro', 'free', 'unknown']),
  rights: z.enum(['verified', 'denied', 'unknown']),
  expiresAt: instant,
  proof: id.nullable(),
});
const phase = z.enum([
  'admission',
  'context',
  'provider-wait',
  'provider-stream',
  'tool',
  'compaction',
  'approval',
  'post-model',
]);
const phaseInterval = z
  .strictObject({
    phase,
    domain: id,
    start: z.number().nonnegative(),
    end: z.number().nonnegative().nullable(),
  })
  .refine((value) => value.end === null || value.end >= value.start, 'Interval end precedes start');
const summary = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('instruction'),
    mode: z.enum(['initial', 'followup', 'steering', 'queued']),
    message: id,
  }),
  z.strictObject({
    kind: z.literal('context'),
    messageCount: count,
    toolCount: count,
    transformation: id.nullable(),
    invocation: id,
    parameters: digest.nullable(),
    stage: z.enum(['post-transform', 'provider-serialized']),
  }),
  z.strictObject({
    kind: z.literal('provider'),
    logicalCall: id,
    attempt: id.nullable(),
    billing: id.nullable(),
    requestedModel: id.nullable(),
    resolvedModel: id.nullable(),
    provider: id.nullable(),
    response: id.nullable(),
    firstOutput: z
      .strictObject({
        domain: id,
        chunk: z.number().nonnegative().nullable(),
        text: z.number().nonnegative().nullable(),
      })
      .nullable(),
    purpose: z.enum(['generation', 'compaction', 'helper']),
    /*
     * Which kind of model call this was, as the API declared it: a host run's call (nested under the run's root), a
     * helper endpoint's or another direct call (each its own trace). Optional so an older API's fact still admits.
     */
    callKind: z.enum(['run', 'helper', 'direct']).optional(),
    stop: z.enum(['stop', 'length', 'toolUse', 'error', 'aborted', 'pending', 'deferred']),
    usage,
    /**
     * The host labels the caller asserted with the call (LW17), each `unknown` outside its vocabulary. Absent on a call
     * that sent none, such as a helper or direct call, and on every fact written before them.
     */
    labels: z
      .strictObject({ host: id.optional(), build: id.optional(), kernel: id.optional(), model: id.optional() })
      .optional(),
  }),
  z.strictObject({
    kind: z.literal('tool'),
    call: id,
    dispatch: id,
    toolClass,
    toolVersion: digest.nullable(),
    schemaVersion: digest.nullable(),
    modelCall: id.nullable(),
    outcome,
    revisionBefore: digest.nullable(),
    revisionAfter: digest.nullable(),
  }),
  z.strictObject({
    kind: z.literal('transformation'),
    operation: z.enum(['compact', 'trim', 'offload']),
    before: digest,
    after: digest,
    omitted: count,
    modelAttempt: id.nullable(),
  }),
  z.strictObject({
    kind: z.literal('cad'),
    sourceRevision: digest,
    requirement: id,
    result: z.enum(['passed', 'failed', 'inconclusive', 'unsupported', 'not-run']),
    exportRequested: z.boolean(),
    artifact: digest.nullable(),
  }),
  z
    .strictObject({
      kind: z.literal('outcome'),
      termination: outcome,
      success: z.enum(['verified', 'failed', 'unknown']),
      assessment: id.nullable(),
      /*
       * The ending code's owner and retry class from the refusal registry, and the code itself: the wrapped one when a
       * `wait`-class code was recorded as `RUN_ABANDONED`. Optional so an older host's outcome still admits.
       */
      failureClass: z.strictObject({ owner: id, retry: id }).optional(),
      code: id.optional(),
    })
    .refine(
      (value) => value.success === 'unknown' || value.assessment !== null,
      'Decided success requires assessment evidence',
    ),
  z.strictObject({
    kind: z.literal('response'),
    action: z.enum(['presented', 'edited', 'exported', 'returned']),
    evidence: id,
  }),
  z.strictObject({
    kind: z.literal('financial'),
    ledger: id,
    attempt: id,
    credits: z.number(),
    tariff: id,
    supplierCost: z.number().nonnegative().nullable(),
    currency: z.literal('USD'),
    normalization: id,
    adjustment: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('governance'),
    state: z.enum(['captured', 'received', 'uncertain', 'dropped', 'expired', 'revoked']),
    reason: z.enum(['none', 'permission', 'capacity', 'delivery', 'expiry', 'schema']),
  }),
]);
/**
 * The user's own judgement of an output: a rating, or an explicit acceptance, rejection or correction. It is a separate
 * plane because it answers to its own purpose, never the summary grant, and it carries no explanation: free-form text
 * is content.
 */
const feedback = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('response'),
    action: z.enum(['accepted', 'rejected', 'corrected']),
    evidence: id,
  }),
  z.strictObject({
    kind: z.literal('rating'),
    scale: id,
    value: z.enum(['positive', 'negative']),
    evidence: id,
  }),
]);
/** Bounds of one content section: messages, parts in a message, and model parameters. @public */
export const contentLimits = Object.freeze({ messages: 32, parts: 32, parameters: 16 });
/** Text kept from a part, with its byte accounting and what the redactors did to it. */
const retained = {
  text: z.string().max(evidenceLimits.text),
  originalBytes: count,
  retainedBytes: count,
  redaction: z.enum(['none', 'redacted', 'truncated']),
} as const;
const toolName = z.string().regex(/^[\w.:-]{1,128}$/u);
const mime = z.string().regex(/^[\w.+-]{1,64}\/[\w.+-]{1,64}$/u);
/**
 * One part of a recorded message. Text, readable thinking, a tool call's arguments and a tool result keep redacted,
 * bounded text; an image or a file is only its type and size (and a digest when it is at most 1 MiB). No signature or
 * encrypted reasoning has a part.
 */
const part = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), ...retained }),
  z.strictObject({ kind: z.literal('thinking'), ...retained }),
  z.strictObject({ kind: z.literal('tool-call'), call: id, name: toolName, ...retained }),
  z.strictObject({
    kind: z.literal('tool-result'),
    call: id,
    error: z.boolean(),
    /* The whole result's digest when its text was not kept. */
    digest: digest.nullable(),
    ...retained,
  }),
  z.strictObject({ kind: z.literal('media'), mime, bytes: count, digest: digest.nullable() }),
]);
const message = z.strictObject({
  role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
  parts: z.array(part).max(contentLimits.parts),
});
/** What one call recorded on one side: its messages, and how many parts the bounds left out. */
const section = z.strictObject({ messages: z.array(message).max(contentLimits.messages), omitted: count });
/** The content of one operation: the fact it describes, what was new in it, and what it produced (LQ4(b)). */
const content = z.strictObject({
  plane: z.literal('content'),
  fact: summary,
  input: section.nullable(),
  output: section.nullable(),
  /** What the call was given but did not write: the earlier history, the system prompt and the tool definitions. */
  context: z
    .strictObject({
      historyMessages: count,
      history: digest.nullable(),
      system: digest.nullable(),
      tools: digest.nullable(),
    })
    .nullable(),
  /** Allowlisted request parameters, flattened one level (`thinking.budget_tokens`). */
  parameters: z
    .record(
      z.string().regex(/^[a-z_]{1,32}(?:\.[a-z_]{1,32})?$/u),
      z.union([z.string().max(64), z.number(), z.boolean()]),
    )
    .refine((value) => Object.keys(value).length <= contentLimits.parameters, 'Too many parameters'),
});
type ContentPart = z.infer<typeof part>;
const retainedParts = (sections: ReadonlyArray<z.infer<typeof section> | undefined>): ContentPart[] =>
  sections.flatMap((item) => item?.messages.flatMap((entry) => entry.parts) ?? []);
/** Strict host/API wire schema. Parsed client claims are still untrusted. @public */
export const evidenceSchema = z
  .strictObject({
    version: z.literal(evidenceVersion),
    source,
    semantic,
    projection: z.strictObject({ version: id, redactor: id, digest }),
    delivery: z.strictObject({
      uploader: id,
      attempt: id,
      cursor: z.strictObject({ view: z.enum(['own', 'merged', 'interaction']), origin: id, position: id }),
    }),
    scope: z.strictObject({ principal: id, project: id, policyEpoch: id, destination: z.literal('langfuse') }),
    run: id,
    execution: z.strictObject({ attempt: id, resumedFrom: id.nullable(), branchedFrom: id.nullable() }),
    versions: z.strictObject({
      hostBuild: id.nullable(),
      apiBuild: id.nullable(),
      harness: digest.nullable(),
      compaction: digest.nullable(),
      prompts: z.array(digest).max(32),
      skills: z.array(digest).max(64),
      tools: z.array(digest).max(128),
      kernels: z.array(z.strictObject({ id, version: id })).max(32),
      mapper: id,
      policy: id,
    }),
    task: z
      .strictObject({ id, basis: z.enum(['explicit', 'inferred']), method: id, confidence: z.number().min(0).max(1) })
      .nullable(),
    clocks: z.strictObject({
      occurredAt: instant.nullable(),
      sourceOrder: z.string().max(128),
      intervals: z.array(phaseInterval).max(32),
    }),
    authority: z.enum(['host-reported', 'api-reported']),
    retention: z.strictObject({ originalAt: instant, expiresAt: instant, proof: id }),
    lineage: z.array(lineage).min(1).max(evidenceLimits.sources),
    coverage,
    payload: z.discriminatedUnion('plane', [
      z.strictObject({ plane: z.literal('summary'), fact: summary }),
      z.strictObject({ plane: z.literal('feedback'), fact: feedback }),
      content,
    ]),
  })
  .superRefine((value, context) => {
    const family = value.payload.fact.kind;
    if (family !== value.semantic.kind) {
      context.addIssue({ code: 'custom', message: 'Semantic family mismatch' });
    }
    if (
      value.retention.expiresAt <= value.retention.originalAt ||
      value.retention.expiresAt - value.retention.originalAt > 180 * 86_400_000
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid retention window' });
    }
    if (new Set(value.lineage.map((item) => item.source)).size !== value.lineage.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate lineage' });
    }
    if (value.payload.plane === 'content') {
      for (const item of retainedParts([value.payload.input ?? undefined, value.payload.output ?? undefined])) {
        if (
          item.kind !== 'media' &&
          (new TextEncoder().encode(item.text).byteLength !== item.retainedBytes ||
            (item.redaction === 'none' && item.originalBytes !== item.retainedBytes))
        ) {
          context.addIssue({ code: 'custom', message: 'Invalid content byte accounting' });
        }
      }
    }
    if (value.lineage.some((item) => item.expiresAt < value.retention.expiresAt)) {
      context.addIssue({ code: 'custom', message: 'Derived evidence outlives its source' });
    }
  });
/** Parsed representation; never grants authority on its own. @public */
export type Evidence = z.infer<typeof evidenceSchema>;
/** Bounded parsing result without payloads or validation text in errors. @public */
export type EvidenceParse =
  | { readonly ok: true; readonly value: Evidence }
  | { readonly ok: false; readonly code: 'EVIDENCE_SIZE' | 'EVIDENCE_INVALID' };
/** Parse a UTF-8 envelope before deeper admission. @public */
export const parseEvidence = (bytes: Uint8Array<ArrayBuffer>): EvidenceParse => {
  if (bytes.byteLength > evidenceLimits.bytes) {
    return { ok: false, code: 'EVIDENCE_SIZE' };
  }
  try {
    const result = evidenceSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    return result.success ? { ok: true, value: result.data } : { ok: false, code: 'EVIDENCE_INVALID' };
  } catch {
    return { ok: false, code: 'EVIDENCE_INVALID' };
  }
};
