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

/** One OTLP span: the complete, immutable observation for one receipt, or the run root it hangs under. */
export type OtlpSpan = Readonly<{
  traceId: string;
  spanId: string;
  /** The run root's span id on a fact span; absent on the root itself. */
  parentSpanId?: string;
  name: string;
  kind: 1;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: readonly OtlpAttribute[];
  status: Readonly<{ code: 1 | 2; message?: string }>;
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

/**
 * Bumped whenever the closed metadata written for the same evidence changes. The run root, a fact span's parent and
 * time range, its level and status message are structure the scorecard does not read, and the failure fields are
 * additive keys, so the 180-day history stays scorable under one version.
 */
export const observationMapperVersion = 'langfuse-v4.3';

/** The name of a run's synthetic root span; it has no `tau.` prefix, so a scorecard read never counts it as a fact. */
export const runRootName = 'Tau agent run';

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
 * The span id of a run's synthetic root: one per (environment, principal, run), so every fact span of the run names
 * the same parent, and every resend of the root upserts that one observation.
 *
 * @param environment - The deployment.
 * @param principal - The Tau user id the evidence is scoped to.
 * @param run - The evidence's run id.
 * @returns 16 hex digits.
 */
export const runRootSpanId = (environment: string, principal: string, run: string): string =>
  sha256('tau-run-root', environment, principal, run).slice(0, 16);

/**
 * The keyed group a contract id reaches the vendor as: the same id under the same principal always joins, and no
 * other principal's id collides with it.
 *
 * @param environment - The deployment.
 * @param principal - The Tau user id the evidence is scoped to.
 * @param value - The contract id.
 * @returns 32 hex digits.
 */
export const observationGroup = (environment: string, principal: string, value: string): string =>
  sha256('tau-group', environment, principal, value).slice(0, 32);

/**
 * Derives the key that pseudonymises account ids for the vendor, so Langfuse
 * groups by user without holding Tau's user id or anything reversible to it.
 *
 * @param payloadKey - The backlog sealing key the pseudonym key is derived from.
 * @returns A 32-byte HMAC key, distinct from the sealing key.
 */
export const pseudonymKey = (payloadKey: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  new Uint8Array(hkdfSync('sha256', payloadKey, new Uint8Array(0), 'tau-langfuse-pseudonym', 32));

/**
 * The account's id in one Langfuse environment: a keyed digest, so the vendor groups by account without holding Tau's
 * user id, and only the API can name the account behind it.
 *
 * @param environment - The deployment.
 * @param principal - The Tau user id.
 * @param pseudonym - The key from {@link pseudonymKey}.
 * @returns 32 hex digits.
 */
export const accountPseudonym = (environment: string, principal: string, pseudonym: Uint8Array<ArrayBuffer>): string =>
  createHmac('sha256', pseudonym)
    .update(JSON.stringify([environment, principal]))
    .digest('hex')
    .slice(0, 32);

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

/**
 * Why a summary fact failed, in closed vocabulary only, or `undefined` when it did not. An outcome names its ending
 * code and that code's owner and retry class; one from a host without them says it is unclassified.
 */
const failure = (evidence: Evidence): string | undefined => {
  if (evidence.payload.plane !== 'summary') {
    return undefined;
  }
  const { fact } = evidence.payload;
  if (fact.kind === 'provider' && fact.stop === 'error') {
    return 'provider stop: error';
  }
  if (fact.kind === 'tool' && fact.outcome === 'failed') {
    return 'tool outcome: failed';
  }
  if (fact.kind === 'outcome' && fact.termination === 'failed') {
    const { failureClass, code } = fact;
    return failureClass === undefined
      ? 'run failed: unclassified'
      : `run failed: ${code ?? 'unrecognized code'} (owner ${failureClass.owner}, retry ${failureClass.retry})`;
  }
  return undefined;
};

/* The phases whose closed time is a provider or tool fact's own span; any other fact is a point at `occurredAt`. */
const timedPhases: Readonly<Partial<Record<Evidence['semantic']['kind'], ReadonlySet<string>>>> = {
  provider: new Set(['provider-wait', 'provider-stream']),
  tool: new Set(['tool']),
};

/**
 * How long a provider or tool fact's own work took: the sum of its closed phase times, each the union of its intervals
 * in one clock domain, exactly as the `phase.<name>@<domain>` metadata reports them. The fact's `occurredAt` is when
 * that work began (the relay's start, the tool call's start), so the span runs from it for this long.
 */
const spanMilliseconds = (evidence: Evidence): number => {
  const phases = timedPhases[evidence.semantic.kind];
  if (phases === undefined) {
    return 0;
  }
  const { durations } = phaseDurations(evidence.clocks.intervals);
  return Object.entries(durations)
    .filter(([key]) => phases.has(key.slice(0, key.indexOf('@'))))
    .reduce((total, [, milliseconds]) => total + Math.round(milliseconds), 0);
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
 * When a provider attempt's first output arrived, for Langfuse's time to first token: the start of its relay-timed
 * stream phase, whose offsets count from the attempt's start. The generation then reads as its wait, then its stream.
 */
const completionStartOf = (evidence: Evidence): number | undefined => {
  const { occurredAt, intervals } = evidence.clocks;
  const stream = intervals.find((item) => item.phase === 'provider-stream' && item.domain === 'api-relay');
  return evidence.semantic.kind !== 'provider' || occurredAt === null || stream === undefined
    ? undefined
    : occurredAt + Math.round(stream.start);
};

/* The label an older web host reported for a build it could not read; it names no build. */
const unreadBuild = '0000000';

/**
 * The release an observation reports: the host's build for a host fact, else the API's, else `unknown` (I7). The label
 * a worker reported before it was given the page's release names no build, so it reads as `unknown` too.
 */
const releaseOf = ({ versions }: Evidence): string => {
  const host = versions.hostBuild === unreadBuild ? null : versions.hostBuild;
  return host ?? versions.apiBuild ?? 'unknown';
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
  const end = at + BigInt(spanMilliseconds(evidence)) * 1_000_000n;
  const failed = failure(evidence);
  const completionStart = completionStartOf(evidence);
  const user = accountPseudonym(context.environment, evidence.scope.principal, pseudonym);
  const group = (value: string): string => observationGroup(context.environment, evidence.scope.principal, value);
  const { coverage } = evidence;
  /* A reader counts a fact once: by source, then by semantic identity, as the scorecard reconciles evidence. */
  const keys = evidenceKeys(evidence);
  const attributes: OtlpAttribute[] = [
    stringAttribute('langfuse.trace.name', 'Tau agent run'),
    stringAttribute('langfuse.user.id', user),
    stringAttribute('langfuse.session.id', group(evidence.task?.id ?? evidence.run)),
    stringAttribute('langfuse.environment', context.environment),
    stringAttribute('langfuse.release', releaseOf(evidence)),
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
    ...(failed === undefined
      ? []
      : [
          stringAttribute('langfuse.observation.level', 'ERROR'),
          stringAttribute('langfuse.observation.status_message', failed),
        ]),
    ...(completionStart === undefined
      ? []
      : [stringAttribute('langfuse.observation.completion_start_time', new Date(completionStart).toISOString())]),
    ...factAttributes(evidence, group),
    ...phaseAttributes(evidence),
    ...contentAttributes(evidence),
  ];
  return {
    identity,
    span: {
      ...identity,
      parentSpanId: runRootSpanId(context.environment, evidence.scope.principal, evidence.run),
      name: `tau.${evidence.semantic.kind}`,
      kind: 1,
      startTimeUnixNano: at.toString(),
      endTimeUnixNano: end.toString(),
      attributes,
      status: failed === undefined ? { code: 1 } : { code: 2, message: failed },
    },
  };
};

/* The fact attributes a run's root repeats: what groups the trace, never a fact's own field or the release. */
const rootAttributeKeys: ReadonlySet<string> = new Set([
  'langfuse.trace.name',
  'langfuse.user.id',
  'langfuse.session.id',
  'langfuse.environment',
  'langfuse.observation.metadata.run',
  'langfuse.observation.metadata.mapper',
  'langfuse.observation.metadata.policy',
]);

/**
 * The synthetic root span of the run a fact span belongs to. Every fact names it as parent, so Langfuse shows one root
 * per run with its facts as timed children. It is sent with each fact because no single fact is guaranteed to arrive
 * (a run may end without an outcome, and receipts deliver independently); its id is a digest of the run, so each send
 * upserts the same observation rather than adding one. It carries only grouping attributes, identical on every send,
 * and is a point at its fact's start: the run's span is read from its children, not from the root.
 *
 * @param span - A fact span from {@link langfuseObservation}.
 * @returns The run's root span, or `undefined` for a span with no parent.
 */
export const runRootSpan = (span: OtlpSpan): OtlpSpan | undefined =>
  span.parentSpanId === undefined
    ? undefined
    : {
        traceId: span.traceId,
        spanId: span.parentSpanId,
        name: runRootName,
        kind: 1,
        startTimeUnixNano: span.startTimeUnixNano,
        endTimeUnixNano: span.startTimeUnixNano,
        attributes: [
          ...span.attributes.filter((attribute) => rootAttributeKeys.has(attribute.key)),
          stringAttribute('langfuse.observation.type', 'span'),
          { key: 'langfuse.observation.metadata.root', value: { boolValue: true } },
        ],
        status: { code: 1 },
      };

/**
 * The OTLP/HTTP JSON request body for one observation, then its run's root. One
 * fact per request keeps the vendor's answer about that one item exact: a batch
 * can drop a malformed span silently while acknowledging the rest (T02 attempt
 * 2). The root rides along because a child whose parent was never sent renders
 * as another root; it is fixed, grouping-only and upserted by its id. The fact
 * stays the first span, as a reader of the body that takes one span expects.
 *
 * @param span - The observation.
 * @returns The request body.
 */
export const otlpBody = (span: OtlpSpan): string => {
  const root = runRootSpan(span);
  return JSON.stringify({
    resourceSpans: [
      {
        resource: { attributes: [stringAttribute('service.name', 'tau-api')] },
        scopeSpans: [
          {
            scope: { name: 'tau-agent-evidence', version: observationMapperVersion },
            spans: root === undefined ? [span] : [span, root],
          },
        ],
      },
    ],
  });
};
