import { createHash, createHmac, hkdfSync } from 'node:crypto';
import type { Evidence } from '@taucad/agent-observability/contract';
import { evidenceKeys } from '@taucad/agent-observability/identity';
import { phaseDurations } from '@taucad/agent-observability/scorecard';
import type { SourceProtection } from '#api/agent-observability/evidence-admission.js';

/** One OTLP attribute in the JSON encoding Langfuse's v4 endpoint accepts. */
export type OtlpAttribute = Readonly<{
  key: string;
  value: Readonly<{ stringValue: string } | { intValue: string } | { doubleValue: number } | { boolValue: boolean }>;
}>;

/** One OTLP span: the complete, immutable observation for one receipt. */
export type OtlpSpan = Readonly<{
  traceId: string;
  spanId: string;
  name: string;
  kind: 1;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: readonly OtlpAttribute[];
  status: Readonly<{ code: 1 | 2 }>;
}>;

/** What the server, not the envelope, knows about the receipt being delivered. */
export type ObservationContext = Readonly<{
  environment: string;
  receipt: string;
  /** The strictest server-recorded protection across the receipt's lineage. */
  protection: SourceProtection;
}>;

/** The Langfuse identity of one delivered receipt; stable across every attempt. */
export type ObservationIdentity = Readonly<{ traceId: string; spanId: string }>;

/** Bumped whenever the attributes written for the same evidence change. */
export const observationMapperVersion = 'langfuse-v4.3';

/**
 * Fact fields that name a Tau record (a run, message, call, attempt or ledger
 * entry) rather than a vocabulary value. They reach the vendor only as the
 * trace's keyed digest, which still joins one field to another.
 */
const referenceFields: ReadonlySet<string> = new Set([
  'assessment',
  'attempt',
  'billing',
  'call',
  'dispatch',
  'evidence',
  'invocation',
  'ledger',
  'logicalCall',
  'message',
  'modelAttempt',
  'modelCall',
  'response',
]);

const sha256 = (...parts: readonly string[]): string =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/**
 * The span id of a receipt's observation, which a reconciliation read needs
 * without the payload.
 *
 * @param environment - The deployment the receipt was accepted in.
 * @param receipt - The durable receipt id.
 * @returns 16 hex digits.
 */
export const observationSpanId = (environment: string, receipt: string): string =>
  sha256('tau-span', environment, receipt).slice(0, 16);

/**
 * The trace and span ids for a receipt. The span id derives from the receipt
 * alone, so a resend after a known non-application, or a reconciliation read,
 * names the same observation; the trace groups one principal's run.
 *
 * @param environment - The deployment the receipt was accepted in.
 * @param evidence - The admitted evidence.
 * @param receipt - Its durable receipt id.
 * @returns The 32- and 16-hex-digit OTLP ids.
 */
export const observationIdentity = (environment: string, evidence: Evidence, receipt: string): ObservationIdentity => ({
  traceId: sha256('tau-trace', environment, evidence.scope.principal, evidence.run).slice(0, 32),
  spanId: observationSpanId(environment, receipt),
});

/**
 * Derives the key that pseudonymises account ids for the vendor, so Langfuse
 * groups by user without holding Tau's user id or anything reversible to it.
 *
 * @param payloadKey - The backlog sealing key the pseudonym key is derived from.
 * @returns A 32-byte HMAC key, distinct from the sealing key.
 */
export const pseudonymKey = (payloadKey: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  new Uint8Array(hkdfSync('sha256', payloadKey, new Uint8Array(0), 'tau-langfuse-pseudonym', 32));

const stringAttribute = (key: string, value: string): OtlpAttribute => ({ key, value: { stringValue: value } });
const intAttribute = (key: string, value: number): OtlpAttribute => ({ key, value: { intValue: String(value) } });
const scalar = (key: string, value: unknown): OtlpAttribute | undefined => {
  if (typeof value === 'string') {
    return stringAttribute(key, value);
  }
  if (typeof value === 'boolean') {
    return { key, value: { boolValue: value } };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? intAttribute(key, value) : { key, value: { doubleValue: value } };
  }
  return undefined;
};

const observationType = (kind: Evidence['semantic']['kind']): string =>
  kind === 'provider' ? 'generation' : kind === 'tool' ? 'tool' : 'span';

const failed = (evidence: Evidence): boolean => {
  if (evidence.payload.plane !== 'summary') {
    return false;
  }
  const { fact } = evidence.payload;
  return (fact.kind === 'provider' && fact.stop === 'error') || (fact.kind === 'tool' && fact.outcome === 'failed');
};

const factAttributes = (evidence: Evidence, group: (value: string) => string): OtlpAttribute[] => {
  if (evidence.payload.plane === 'content') {
    return [];
  }
  const { fact } = evidence.payload;
  /* A nested field (a provider's first output and usage) is written one level deep, so a reader can score it. */
  const fields = Object.entries(fact).flatMap(
    ([key, value]): Array<readonly [string, unknown]> =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.entries(value as Readonly<Record<string, unknown>>).map(
            ([field, nested]) => [`${key}.${field}`, nested] as const,
          )
        : [[key, value]],
  );
  const attributes = fields
    .map(([key, value]) =>
      scalar(
        `langfuse.observation.metadata.fact.${key}`,
        referenceFields.has(key) && typeof value === 'string' ? group(value) : value,
      ),
    )
    .filter((attribute) => attribute !== undefined);
  if (fact.kind === 'provider') {
    const { usage } = fact;
    const model = [
      fact.requestedModel === null ? undefined : stringAttribute('gen_ai.request.model', fact.requestedModel),
      fact.resolvedModel === null ? undefined : stringAttribute('gen_ai.response.model', fact.resolvedModel),
      usage.input === null ? undefined : intAttribute('gen_ai.usage.input_tokens', usage.input),
      usage.output === null ? undefined : intAttribute('gen_ai.usage.output_tokens', usage.output),
      usage.cacheRead === null ? undefined : intAttribute('gen_ai.usage.cache_read_input_tokens', usage.cacheRead),
      usage.cacheWrite === null
        ? undefined
        : intAttribute('gen_ai.usage.cache_creation_input_tokens', usage.cacheWrite),
      usage.reasoning === null ? undefined : intAttribute('gen_ai.usage.reasoning_tokens', usage.reasoning),
    ];
    attributes.push(...model.filter((attribute) => attribute !== undefined));
  }
  return attributes;
};

/*
 * Each phase's closed time in one clock domain, as the scorecard times it; an open interval is only counted. The
 * intervals themselves are kept too, because one run's phase time is the union across its facts, which per-fact
 * durations cannot give when two facts overlap.
 */
const phaseAttributes = (evidence: Evidence): OtlpAttribute[] => {
  const { intervals } = evidence.clocks;
  const { durations, open } = phaseDurations(intervals);
  return [
    ...(intervals.length === 0
      ? []
      : [
          stringAttribute(
            'langfuse.observation.metadata.intervals',
            JSON.stringify(intervals.map(({ phase, domain, start, end }) => [phase, domain, start, end])),
          ),
        ]),
    ...Object.entries(durations).map(([key, milliseconds]) =>
      intAttribute(`langfuse.observation.metadata.phase.${key}`, Math.round(milliseconds)),
    ),
    intAttribute('langfuse.observation.metadata.openIntervals', open),
  ];
};

const contentAttributes = (evidence: Evidence): OtlpAttribute[] => {
  if (evidence.payload.plane !== 'content') {
    return [];
  }
  const { blocks, stage } = evidence.payload;
  const body = JSON.stringify(
    blocks.map((block) =>
      block.kind === 'text'
        ? { role: block.role, format: block.format, content: block.text, redaction: block.redaction }
        : { artifact: block.artifact, digest: block.digest, mime: block.mime, bytes: block.bytes },
    ),
  );
  return [
    stringAttribute(stage === 'result' ? 'langfuse.observation.output' : 'langfuse.observation.input', body),
    stringAttribute('langfuse.observation.metadata.stage', stage),
  ];
};

/**
 * Map admitted evidence to the one complete observation Langfuse v4 stores for
 * its receipt. Every grouping attribute is copied onto the observation itself,
 * because v4 observations are immutable and there is no separate trace entity.
 * Account, run, attempt, task and record ids reach the vendor only as keyed or
 * one-way digests.
 *
 * @param evidence - The opened, previously validated evidence.
 * @param context - Server facts about the receipt.
 * @param pseudonym - The key from {@link pseudonymKey}.
 * @returns The span to send and its identity.
 */
export const langfuseObservation = (
  evidence: Evidence,
  context: ObservationContext,
  pseudonym: Uint8Array<ArrayBuffer>,
): Readonly<{ identity: ObservationIdentity; span: OtlpSpan }> => {
  const identity = observationIdentity(context.environment, evidence, context.receipt);
  const at = BigInt(evidence.clocks.occurredAt ?? evidence.retention.originalAt) * 1_000_000n;
  const user = createHmac('sha256', pseudonym)
    .update(JSON.stringify([context.environment, evidence.scope.principal]))
    .digest('hex')
    .slice(0, 32);
  const group = (value: string): string =>
    sha256('tau-group', context.environment, evidence.scope.principal, value).slice(0, 32);
  const { coverage } = evidence;
  /* A reader counts a fact once: by source, then by semantic identity, as the scorecard reconciles evidence. */
  const keys = evidenceKeys(evidence);
  const attributes: OtlpAttribute[] = [
    stringAttribute('langfuse.trace.name', 'Tau agent run'),
    stringAttribute('langfuse.user.id', user),
    stringAttribute('langfuse.session.id', group(evidence.task?.id ?? evidence.run)),
    stringAttribute('langfuse.environment', context.environment),
    stringAttribute('langfuse.release', evidence.versions.hostBuild ?? evidence.versions.apiBuild ?? 'unknown'),
    stringAttribute('langfuse.observation.type', observationType(evidence.semantic.kind)),
    stringAttribute('langfuse.observation.metadata.receipt', context.receipt),
    stringAttribute('langfuse.observation.metadata.run', group(evidence.run)),
    stringAttribute('langfuse.observation.metadata.attempt', group(evidence.execution.attempt)),
    stringAttribute('langfuse.observation.metadata.source', group(keys.source)),
    stringAttribute('langfuse.observation.metadata.semantic', group(keys.semantic)),
    stringAttribute('langfuse.observation.metadata.plane', evidence.payload.plane),
    stringAttribute('langfuse.observation.metadata.family', evidence.semantic.kind),
    stringAttribute('langfuse.observation.metadata.authority', evidence.authority),
    stringAttribute('langfuse.observation.metadata.protection', context.protection),
    stringAttribute('langfuse.observation.metadata.mapper', observationMapperVersion),
    stringAttribute('langfuse.observation.metadata.hostMapper', evidence.versions.mapper),
    stringAttribute('langfuse.observation.metadata.policy', evidence.versions.policy),
    stringAttribute('langfuse.observation.metadata.coverage.events', coverage.events),
    stringAttribute('langfuse.observation.metadata.coverage.input', coverage.input),
    stringAttribute('langfuse.observation.metadata.coverage.output', coverage.output),
    stringAttribute('langfuse.observation.metadata.coverage.usage', coverage.usage),
    ...(evidence.task === null
      ? []
      : [stringAttribute('langfuse.observation.metadata.taskBasis', evidence.task.basis)]),
    ...factAttributes(evidence, group),
    ...phaseAttributes(evidence),
    ...contentAttributes(evidence),
  ];
  return {
    identity,
    span: {
      ...identity,
      name: `tau.${evidence.semantic.kind}`,
      kind: 1,
      startTimeUnixNano: at.toString(),
      endTimeUnixNano: at.toString(),
      attributes,
      status: { code: failed(evidence) ? 2 : 1 },
    },
  };
};

/**
 * The OTLP/HTTP JSON request body for one observation. One span per request
 * keeps the vendor's answer about that one item exact: a batch can drop a
 * malformed span silently while acknowledging the rest (T02 attempt 2).
 *
 * @param span - The observation.
 * @returns The request body.
 */
export const otlpBody = (span: OtlpSpan): string =>
  JSON.stringify({
    resourceSpans: [
      {
        resource: { attributes: [stringAttribute('service.name', 'tau-api')] },
        scopeSpans: [{ scope: { name: 'tau-agent-evidence', version: observationMapperVersion }, spans: [span] }],
      },
    ],
  });
