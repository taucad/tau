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
    stop: z.enum(['stop', 'length', 'toolUse', 'error', 'aborted', 'pending', 'deferred']),
    usage,
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
    })
    .refine(
      (value) => value.success === 'unknown' || value.assessment !== null,
      'Decided success requires assessment evidence',
    ),
  z.strictObject({
    kind: z.literal('response'),
    action: z.enum(['presented', 'accepted', 'rejected', 'corrected', 'edited', 'exported', 'returned']),
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
const block = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
    format: z.enum(['text', 'json']),
    text: z.string().max(evidenceLimits.text),
    source: digest,
    originalBytes: count,
    retainedBytes: count,
    redaction: z.enum(['none', 'redacted', 'truncated']),
  }),
  z.strictObject({
    kind: z.literal('media'),
    artifact: id,
    digest,
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'application/json']),
    bytes: count,
    source: digest,
  }),
]);
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
      z.strictObject({
        plane: z.literal('content'),
        family: semantic.shape.kind,
        stage: z.enum(['admitted', 'post-transform', 'provider-serialized', 'result']),
        blocks: z.array(block).max(evidenceLimits.blocks),
      }),
    ]),
  })
  .superRefine((value, context) => {
    const family = value.payload.plane === 'summary' ? value.payload.fact.kind : value.payload.family;
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
      for (const item of value.payload.blocks) {
        if (!value.lineage.some((source) => source.digest === item.source)) {
          context.addIssue({ code: 'custom', message: 'Unbound content source' });
        }
        if (
          item.kind === 'text' &&
          (new TextEncoder().encode(item.text).byteLength !== item.retainedBytes ||
            item.retainedBytes > evidenceLimits.text ||
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
