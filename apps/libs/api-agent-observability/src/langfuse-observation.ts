/* eslint-disable @typescript-eslint/naming-convention -- Langfuse chat messages use the OpenAI wire field names. */
import { createHash, createHmac, hkdfSync } from 'node:crypto';
import type { Evidence } from '@taucad/agent-observability/contract';
import { evidenceKeys } from '@taucad/agent-observability/identity';
import { reportedToolName } from '@taucad/agent-observability/projection';
import { phaseDurations } from '@taucad/agent-observability/scorecard';
import { redactPersonal } from '@taucad/agent-observability/content-redaction';
import type { PersonalIdentity } from '@taucad/agent-observability/content-redaction';
import type { SourceProtection } from '#evidence-admission.js';

/** One OTLP attribute value in the JSON encoding Langfuse's v4 endpoint accepts. */
type OtlpValue = Readonly<
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean }
  | { arrayValue: Readonly<{ values: ReadonlyArray<Readonly<{ stringValue: string }>> }> }
>;

/** One OTLP attribute in the JSON encoding Langfuse's v4 endpoint accepts. */
export type OtlpAttribute = Readonly<{ key: string; value: OtlpValue }>;

/** One OTLP span: one complete, immutable Langfuse observation, exported once. */
export type OtlpSpan = Readonly<{
  traceId: string;
  spanId: string;
  /** The run root's span id on a run's child; absent on a root and on a helper or direct call's generation. */
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
  /** The strictest server-recorded protection across the receipt's lineage. */
  protection: SourceProtection;
  /** The account's registered email and full name, for the export redaction pass over content (LQ13). */
  identity?: PersonalIdentity | undefined;
}>;

/**
 * The Langfuse object one receipt maps to: its trace and its observation id. The id derives from the fact (the run, the
 * invocation, the tool call), never from the receipt, so every projection of one fact names the same object and the
 * outbox can refuse a second send of it.
 */
export type ObservationIdentity = Readonly<{ traceId: string; spanId: string }>;

/** What one receipt is sent as: the object it names, and the spans of its one request (the object first). */
export type LangfuseObservation = Readonly<{ identity: ObservationIdentity; spans: readonly OtlpSpan[] }>;

/**
 * The mapper's published version (LD8). v5 writes one trace per run with one `run-cad-agent` root written once from the
 * run's outcome, ids from each fact's semantic key, usage as `usage_details`, and no phase interval lists.
 */
export const observationMapperVersion = 'langfuse-v5';

/** The name of a run's root observation, and of every span's trace in a run. */
export const runRootName = 'run-cad-agent';

/** A settlement's span name, the same under v4.3 and v5 until LW4 moves its values onto the generation. */
export const settlementObservationName = 'tau.financial';

/** The mapper versions whose settlement spans a reader accepts: the same facts under the same names (LR5). */
export const settlementMappers: ReadonlySet<string> = new Set(['langfuse-v4.3', observationMapperVersion]);

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
 * The span id of a run's root: one per (environment, principal, run), so every child of the run names the same parent
 * and the run's outcome names the same object however often it is projected.
 *
 * @param environment - The deployment.
 * @param principal - The Tau user id the evidence is scoped to.
 * @param run - The run's contract id, as host and API both derive it (`execution.attempt`).
 * @returns 16 hex digits.
 */
export const runRootSpanId = (environment: string, principal: string, run: string): string =>
  sha256('tau-run-root', environment, principal, run).slice(0, 16);

/**
 * The span id an observation sent under `langfuse-v4.3` or earlier had: a digest of its receipt. Only a send still
 * being reconciled across the v5 deploy, whose outbox row has no stored object id, needs it.
 *
 * @param environment - The deployment the receipt was accepted in.
 * @param receipt - The durable receipt id.
 * @returns 16 hex digits.
 */
export const receiptSpanId = (environment: string, receipt: string): string =>
  sha256('tau-span', environment, receipt).slice(0, 16);

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

const tagsAttribute = (key: string, values: readonly string[]): OtlpAttribute => ({
  key,
  value: { arrayValue: { values: values.map((value) => ({ stringValue: value })) } },
});
const metadataKey = (key: string): string => `langfuse.observation.metadata.${key}`;
const defined = (attributes: ReadonlyArray<OtlpAttribute | undefined>): OtlpAttribute[] =>
  attributes.filter((attribute) => attribute !== undefined);
const nanoseconds = (milliseconds: number): string => (BigInt(Math.round(milliseconds)) * 1_000_000n).toString();

type SummaryFact = Extract<Evidence['payload'], { plane: 'summary' }>['fact'];
type ContentPayload = Extract<Evidence['payload'], { plane: 'content' }>;
type MaybeSection = ContentPayload['input'];
type Section = NonNullable<MaybeSection>;
type Part = Section['messages'][number]['parts'][number];
type ProviderFact = SummaryFact & { kind: 'provider' };
type CallKind = NonNullable<ProviderFact['callKind']>;

/**
 * What kind of model call a fact belongs to. Every fact but a model call is a run's. A provider fact names its kind;
 * one admitted before kinds were declared is a helper by its purpose, a direct call when the API keyed its execution by
 * the call itself, and otherwise a run's call.
 */
const callKindOf = (evidence: Evidence): CallKind => {
  const fact = evidence.payload.plane === 'feedback' ? undefined : evidence.payload.fact;
  if (fact?.kind !== 'provider') {
    return 'run';
  }
  if (fact.callKind !== undefined) {
    return fact.callKind;
  }
  if (fact.purpose === 'helper') {
    return 'helper';
  }
  return evidence.execution.attempt === fact.logicalCall ? 'direct' : 'run';
};

/* The label an older web host reported for a build it could not read; it names no build. */
const unreadBuild = '0000000';
/* A commit SHA, or the start of one, inside a build label such as `tau-api-staging:<40 hex>`. */
const commitDigits = /[\da-f]{12,}/u;

/**
 * The release label for a build (LF-12): the 12-hex short SHA wherever the label holds one, so a host build and the API
 * image of one commit read the same; a shorter SHA or a desktop version as it is; `unknown` when no build is known.
 *
 * @param build - The host build or API image label, if any.
 * @returns The release.
 */
export const releaseLabel = (build: Evidence['versions']['apiBuild']): string => {
  if (build === null || build === '' || build === unreadBuild) {
    return 'unknown';
  }
  return commitDigits.exec(build)?.[0].slice(0, 12) ?? build;
};

const releaseOf = ({ versions }: Evidence): string =>
  releaseLabel((versions.hostBuild === unreadBuild ? null : versions.hostBuild) ?? versions.apiBuild);

/* The phases whose closed time is a provider or tool fact's own span. */
const timedPhases: Readonly<Partial<Record<Evidence['semantic']['kind'], ReadonlySet<string>>>> = {
  provider: new Set(['provider-wait', 'provider-stream']),
  tool: new Set(['tool']),
};

/** Each closed phase's time, by phase name, as the union of its intervals in each clock domain. */
const phaseTotals = (evidence: Evidence): ReadonlyMap<string, number> => {
  const totals = new Map<string, number>();
  for (const [key, milliseconds] of Object.entries(phaseDurations(evidence.clocks.intervals).durations)) {
    const phase = key.slice(0, key.indexOf('@'));
    totals.set(phase, (totals.get(phase) ?? 0) + Math.round(milliseconds));
  }
  return totals;
};

/** How long a provider or tool fact's own work took, from its `occurredAt`. */
const spanMilliseconds = (evidence: Evidence): number => {
  const phases = timedPhases[evidence.semantic.kind];
  if (phases === undefined) {
    return 0;
  }
  let total = 0;
  for (const [phase, value] of phaseTotals(evidence)) {
    total += phases.has(phase) ? value : 0;
  }
  return total;
};

/** The closed fact fields, one level deep, with every record reference as its keyed digest. */
const factAttributes = (fact: Readonly<Record<string, unknown>>, group: (value: string) => string): OtlpAttribute[] =>
  defined(
    Object.entries(fact)
      .flatMap(
        ([key, value]): Array<readonly [string, unknown]> =>
          value !== null && typeof value === 'object' && !Array.isArray(value)
            ? Object.entries(value as Readonly<Record<string, unknown>>).map(
                ([field, nested]) => [`${key}.${field}`, nested] as const,
              )
            : [[key, value]],
      )
      .map(([key, value]) =>
        scalar(
          metadataKey(`fact.${key}`),
          referenceFields.has(key) && typeof value === 'string' ? group(value) : value,
        ),
      ),
  );

/** Everything a mapping needs about one receipt that does not depend on its fact. */
type Mapping = Readonly<{
  evidence: Evidence;
  context: ObservationContext;
  group: (value: string) => string;
  kind: CallKind;
  traceId: string;
  rootId: string;
  /** The chat, as its keyed group, when the fact names one. */
  chat: string | undefined;
  common: (traceName: string) => OtlpAttribute[];
}>;

const mappingOf = (evidence: Evidence, context: ObservationContext, pseudonym: Uint8Array<ArrayBuffer>): Mapping => {
  const { environment } = context;
  const { principal } = evidence.scope;
  const group = (value: string): string => observationGroup(environment, principal, value);
  const kind = callKindOf(evidence);
  const fact = evidence.payload.plane === 'feedback' ? undefined : evidence.payload.fact;
  /* A run's facts share the run's trace; a helper or direct call is the only observation of its own. */
  const traceKey = kind === 'run' || fact?.kind !== 'provider' ? evidence.execution.attempt : fact.logicalCall;
  /* An API fact without a chat hint names its own call as its chat; it has none. */
  const chat = fact?.kind === 'provider' && evidence.run === fact.logicalCall ? undefined : group(evidence.run);
  const user = accountPseudonym(environment, principal, pseudonym);
  return {
    evidence,
    context,
    group,
    kind,
    traceId: sha256('tau-trace', environment, principal, traceKey).slice(0, 32),
    rootId: runRootSpanId(environment, principal, evidence.execution.attempt),
    chat,
    common: (traceName) =>
      defined([
        stringAttribute('langfuse.trace.name', traceName),
        stringAttribute('langfuse.user.id', user),
        kind === 'run' && chat !== undefined ? stringAttribute('langfuse.session.id', chat) : undefined,
        stringAttribute('langfuse.environment', environment),
        stringAttribute('langfuse.release', releaseOf(evidence)),
        tagsAttribute('langfuse.trace.tags', [`plan:${context.protection}`]),
        stringAttribute('langfuse.trace.metadata.protection', context.protection),
        stringAttribute(metadataKey('plane'), evidence.payload.plane),
        stringAttribute(metadataKey('coverage_input'), evidence.coverage.input),
        stringAttribute(metadataKey('coverage_output'), evidence.coverage.output),
        stringAttribute(metadataKey('policy'), evidence.versions.policy),
        stringAttribute(metadataKey('mapper'), observationMapperVersion),
        stringAttribute(metadataKey('authority'), evidence.authority),
        stringAttribute(metadataKey('run'), group(traceKey)),
      ]),
  };
};

/** A child observation's id: a digest of the fact's semantic key, the same for every projection of the fact. */
const objectId = ({ evidence, context }: Mapping): string =>
  sha256('tau-object', context.environment, evidence.scope.principal, evidenceKeys(evidence).semantic).slice(0, 16);

const startOf = (evidence: Evidence): number => evidence.clocks.occurredAt ?? evidence.retention.originalAt;

const level = (value: 'ERROR' | 'WARNING', message: string): OtlpAttribute[] => [
  stringAttribute('langfuse.observation.level', value),
  stringAttribute('langfuse.observation.status_message', message),
];

const generationName = (fact: ProviderFact, kind: CallKind): string => {
  if (fact.purpose === 'compaction') {
    return 'compact-context';
  }
  return fact.purpose === 'helper' || kind === 'helper' ? 'call-helper-model' : 'call-model';
};

/**
 * Langfuse's usage for a generation (LD6): uncached input, output, cache reads and cache writes under the keys its price
 * definitions read, with an explicit `total` of exactly those. Reasoning tokens are part of output and stay metadata,
 * because a usage key of their own is unpriced and counted twice (LF-22).
 */
const usageDetails = (usage: ProviderFact['usage']): string | undefined => {
  const entries = (
    [
      ['input', usage.input],
      ['output', usage.output],
      ['input_cached_tokens', usage.cacheRead],
      ['input_cache_creation', usage.cacheWrite],
    ] as const
  ).flatMap(([key, value]): Array<readonly [string, number]> => (value === null ? [] : [[key, value]]));
  if (entries.length === 0) {
    return undefined;
  }
  let total = 0;
  for (const [, value] of entries) {
    total += value;
  }
  return JSON.stringify({ ...Object.fromEntries(entries), total });
};

/** A part's text as a reader sees it: what was kept, and a note where the caps cut it. */
const partText = (part: Extract<Part, { text: string }>): string => {
  if (part.kind === 'tool-result' && part.digest !== null && part.retainedBytes === 0) {
    return `[tool result not kept: ${part.originalBytes} bytes]`;
  }
  return part.redaction === 'truncated'
    ? `${part.text} [truncated: kept ${part.retainedBytes} of ${part.originalBytes} bytes]`
    : part.text;
};

type ChatPart = Readonly<Record<string, string | number>>;
/** A message's content: a plain string when it is one text part, else labelled parts (thinking, media). */
const chatContent = (parts: readonly Part[]): string | ChatPart[] | undefined => {
  const rendered = parts.flatMap((part): ChatPart[] => {
    switch (part.kind) {
      case 'text':
      case 'tool-result': {
        return [{ type: 'text', text: partText(part) }];
      }
      case 'thinking': {
        return [{ type: 'thinking', thinking: partText(part) }];
      }
      case 'media': {
        return [{ type: 'media', mime_type: part.mime, bytes: part.bytes }];
      }
      default: {
        return [];
      }
    }
  });
  if (rendered.length === 0) {
    return undefined;
  }
  const [first] = rendered;
  return rendered.length === 1 && first?.['type'] === 'text' ? String(first['text']) : rendered;
};

/**
 * Langfuse's chat shapes (its `extractToolsBackend` reads them): a tool result is a `tool` message with its call id,
 * other messages carry their content and, for the assistant, `tool_calls` with JSON-string arguments.
 */
const chatMessages = (section: Section): Array<Readonly<Record<string, unknown>>> =>
  section.messages.flatMap((message): Array<Readonly<Record<string, unknown>>> => {
    if (message.role === 'tool') {
      const results: Array<{ id: string; parts: Part[] }> = [];
      for (const part of message.parts) {
        if (part.kind === 'tool-result') {
          results.push({ id: part.call, parts: [part] });
        } else {
          results.at(-1)?.parts.push(part);
        }
      }
      return results.map((result) => ({ role: 'tool', tool_call_id: result.id, content: chatContent(result.parts) }));
    }
    const calls = message.parts.flatMap((part) =>
      part.kind === 'tool-call'
        ? [{ id: part.call, type: 'function', function: { name: part.name, arguments: partText(part) } }]
        : [],
    );
    const content = chatContent(message.parts);
    return [
      {
        role: message.role,
        ...(content === undefined ? {} : { content }),
        ...(calls.length === 0 ? {} : { tool_calls: calls }),
      },
    ];
  });

/** A generation's input, output, parameters and context digests (LW3). */
const contentAttributes = (content: ContentPayload, group: (value: string) => string): OtlpAttribute[] => {
  const [output] = content.output === null ? [] : chatMessages(content.output);
  const { context } = content;
  return defined([
    content.input === null
      ? undefined
      : stringAttribute('langfuse.observation.input', JSON.stringify({ messages: chatMessages(content.input) })),
    output === undefined ? undefined : stringAttribute('langfuse.observation.output', JSON.stringify(output)),
    Object.keys(content.parameters).length === 0
      ? undefined
      : stringAttribute('langfuse.observation.model.parameters', JSON.stringify(content.parameters)),
    ...(context === null
      ? []
      : [
          intAttribute(metadataKey('history_messages'), context.historyMessages),
          context.history === null ? undefined : stringAttribute(metadataKey('history_digest'), group(context.history)),
          context.system === null ? undefined : stringAttribute(metadataKey('system_digest'), group(context.system)),
          context.tools === null ? undefined : stringAttribute(metadataKey('tools_digest'), group(context.tools)),
        ]),
    content.input === null || content.input.omitted === 0
      ? undefined
      : intAttribute(metadataKey('input_omitted_parts'), content.input.omitted),
    content.output === null || content.output.omitted === 0
      ? undefined
      : intAttribute(metadataKey('output_omitted_parts'), content.output.omitted),
  ]);
};

const generationSpan = (mapping: Mapping, fact: ProviderFact, content?: ContentPayload): OtlpSpan => {
  const { evidence, group, kind } = mapping;
  const name = generationName(fact, kind);
  const start = startOf(evidence);
  const phases = phaseTotals(evidence);
  const stream = evidence.clocks.intervals.find(
    (item) => item.phase === 'provider-stream' && item.domain === 'api-relay',
  );
  const usage = usageDetails(fact.usage);
  const failed = fact.stop === 'error' ? 'provider stop: error' : undefined;
  return {
    traceId: mapping.traceId,
    spanId: objectId(mapping),
    ...(kind === 'run' ? { parentSpanId: mapping.rootId } : {}),
    name,
    kind: 1,
    startTimeUnixNano: nanoseconds(start),
    endTimeUnixNano: nanoseconds(start + spanMilliseconds(evidence)),
    attributes: defined([
      ...mapping.common(kind === 'run' ? runRootName : name),
      stringAttribute('langfuse.observation.type', 'generation'),
      fact.resolvedModel === null ? undefined : stringAttribute('langfuse.observation.model.name', fact.resolvedModel),
      usage === undefined ? undefined : stringAttribute('langfuse.observation.usage_details', usage),
      stream === undefined
        ? undefined
        : stringAttribute(
            'langfuse.observation.completion_start_time',
            new Date(start + Math.round(stream.start)).toISOString(),
          ),
      fact.requestedModel === null ? undefined : stringAttribute(metadataKey('requested_model'), fact.requestedModel),
      fact.provider === null ? undefined : stringAttribute(metadataKey('provider'), fact.provider),
      stringAttribute(metadataKey('stop'), fact.stop),
      stringAttribute(metadataKey('logical_call'), group(fact.logicalCall)),
      fact.firstOutput?.text === null || fact.firstOutput === null
        ? undefined
        : intAttribute(metadataKey('first_text_ms'), Math.round(fact.firstOutput.text)),
      phases.has('provider-wait') ? intAttribute(metadataKey('wait_ms'), phases.get('provider-wait')!) : undefined,
      phases.has('provider-stream')
        ? intAttribute(metadataKey('stream_ms'), phases.get('provider-stream')!)
        : undefined,
      fact.usage.reasoning === null ? undefined : intAttribute(metadataKey('reasoning_tokens'), fact.usage.reasoning),
      kind !== 'run' && mapping.chat !== undefined ? stringAttribute(metadataKey('chat'), mapping.chat) : undefined,
      ...(content === undefined ? [] : contentAttributes(content, group)),
      ...(failed === undefined ? [] : level('ERROR', failed)),
    ]),
    status: failed === undefined ? { code: 1 } : { code: 2, message: failed },
  };
};

type ToolFact = SummaryFact & { kind: 'tool' };

const toolSpan = (mapping: Mapping, fact: ToolFact): OtlpSpan => {
  const { evidence, group } = mapping;
  const start = startOf(evidence);
  const failed = fact.outcome === 'failed';
  const warned = fact.outcome === 'unknown' || fact.outcome === 'cancelled';
  const message = `tool outcome: ${fact.outcome}`;
  return {
    traceId: mapping.traceId,
    spanId: objectId(mapping),
    parentSpanId: mapping.rootId,
    /* The host reports a first-party name or `external-tool`; a name outside the vocabulary is never sent (LQ5). */
    name: reportedToolName(fact.name),
    kind: 1,
    startTimeUnixNano: nanoseconds(start),
    endTimeUnixNano: nanoseconds(start + spanMilliseconds(evidence)),
    attributes: defined([
      ...mapping.common(runRootName),
      stringAttribute('langfuse.observation.type', 'tool'),
      stringAttribute(metadataKey('tool_class'), fact.toolClass),
      stringAttribute(metadataKey('outcome'), fact.outcome),
      fact.modelCall === null ? undefined : stringAttribute(metadataKey('model_call'), group(fact.modelCall)),
      stringAttribute(metadataKey('tool_call'), group(fact.call)),
      fact.revisionBefore === null ? undefined : stringAttribute(metadataKey('revision_before'), fact.revisionBefore),
      fact.revisionAfter === null ? undefined : stringAttribute(metadataKey('revision_after'), fact.revisionAfter),
      ...(failed ? level('ERROR', message) : warned ? level('WARNING', message) : []),
    ]),
    status: failed ? { code: 2, message } : { code: 1 },
  };
};

type OutcomeFact = SummaryFact & { kind: 'outcome' };

/** Why a run ended badly, in closed vocabulary only: its ending code and that code's owner and retry class. */
const runFailure = (fact: OutcomeFact): string => {
  const { failureClass, code } = fact;
  return failureClass === undefined
    ? 'run failed: unclassified'
    : `run failed: ${code ?? 'unrecognized code'} (owner ${failureClass.owner}, retry ${failureClass.retry})`;
};

/**
 * A run's root and the approval waits the host recorded, from the run's first outcome receipt (LD4). The root spans
 * from the earliest phase the outcome recorded to the run's end, and carries how the run ended; a later outcome of the
 * same run names the same root and is never sent.
 */
const rootSpans = (mapping: Mapping, fact: OutcomeFact): OtlpSpan[] => {
  const { evidence } = mapping;
  const end = startOf(evidence);
  const start = Math.min(end, ...evidence.clocks.intervals.map((item) => item.start));
  const phases = phaseTotals(evidence);
  const failed = fact.termination === 'failed' ? runFailure(fact) : undefined;
  const abandoned =
    fact.termination === 'abandoned' ? `run abandoned${fact.code === undefined ? '' : `: ${fact.code}`}` : undefined;
  const root: OtlpSpan = {
    traceId: mapping.traceId,
    spanId: mapping.rootId,
    name: runRootName,
    kind: 1,
    startTimeUnixNano: nanoseconds(start),
    endTimeUnixNano: nanoseconds(end),
    attributes: defined([
      ...mapping.common(runRootName),
      stringAttribute('langfuse.observation.type', 'agent'),
      stringAttribute(metadataKey('termination'), fact.termination),
      fact.code === undefined ? undefined : stringAttribute(metadataKey('failure_code'), fact.code),
      fact.failureClass === undefined
        ? undefined
        : stringAttribute(metadataKey('failure_owner'), fact.failureClass.owner),
      fact.failureClass === undefined
        ? undefined
        : stringAttribute(metadataKey('failure_retry'), fact.failureClass.retry),
      phases.has('admission') ? intAttribute(metadataKey('admission_ms'), phases.get('admission')!) : undefined,
      phases.has('approval') ? intAttribute(metadataKey('approval_ms'), phases.get('approval')!) : undefined,
      mapping.chat === undefined ? undefined : stringAttribute(metadataKey('chat'), mapping.chat),
      ...(failed === undefined ? [] : level('ERROR', failed)),
      ...(abandoned === undefined ? [] : level('WARNING', abandoned)),
    ]),
    status: failed === undefined ? { code: 1 } : { code: 2, message: failed },
  };
  const waits = evidence.clocks.intervals.flatMap((item): OtlpSpan[] =>
    item.phase === 'approval' && item.end !== null
      ? [
          {
            traceId: mapping.traceId,
            spanId: sha256('tau-approval', mapping.rootId, String(item.start)).slice(0, 16),
            parentSpanId: mapping.rootId,
            name: 'wait-for-approval',
            kind: 1,
            startTimeUnixNano: nanoseconds(item.start),
            endTimeUnixNano: nanoseconds(item.end),
            attributes: [...mapping.common(runRootName), stringAttribute('langfuse.observation.type', 'span')],
            status: { code: 1 },
          },
        ]
      : [],
  );
  return [root, ...waits];
};

/**
 * A fact that becomes a Langfuse object of its own only until its package moves it: a settlement onto its generation
 * (LW4), a rating into a score (LW7). Until then it is a point-in-time span under the run's root that keeps the closed
 * `fact.*` metadata the ledger reconciliation reads.
 */
const transitionalSpan = (mapping: Mapping, name: string, fact: Readonly<Record<string, unknown>>): OtlpSpan => {
  const at = nanoseconds(startOf(mapping.evidence));
  return {
    traceId: mapping.traceId,
    spanId: objectId(mapping),
    parentSpanId: mapping.rootId,
    name,
    kind: 1,
    startTimeUnixNano: at,
    endTimeUnixNano: at,
    attributes: [
      ...mapping.common(runRootName),
      stringAttribute('langfuse.observation.type', 'span'),
      ...factAttributes(fact, mapping.group),
    ],
    status: { code: 1 },
  };
};

/** Run the export pass over one section: text and readable thinking only, never tool arguments or results (LQ13). */
const redactSection = (section: MaybeSection, identity: PersonalIdentity): MaybeSection =>
  section === null
    ? null
    : {
        ...section,
        messages: section.messages.map((message) => ({
          ...message,
          parts: message.parts.map((part): Part => {
            if (part.kind !== 'text' && part.kind !== 'thinking') {
              return part;
            }
            const { text, redacted } = redactPersonal(part.text, identity);
            return redacted
              ? {
                  ...part,
                  text,
                  retainedBytes: new TextEncoder().encode(text).byteLength,
                  redaction: part.redaction === 'truncated' ? 'truncated' : 'redacted',
                }
              : part;
          }),
        })),
      };

const sectionRedacted = (section: MaybeSection): boolean =>
  section?.messages.some((message) =>
    message.parts.some((part) => 'redaction' in part && part.redaction === 'redacted'),
  ) ?? false;

/** A content receipt after the export redaction pass, with its coverage saying so. */
const exportRedacted = (evidence: Evidence, identity: PersonalIdentity = {}): Evidence => {
  const { payload } = evidence;
  if (payload.plane !== 'content') {
    return evidence;
  }
  const input = redactSection(payload.input, identity);
  const output = redactSection(payload.output, identity);
  const label = (current: Evidence['coverage']['input'], section: MaybeSection): Evidence['coverage']['input'] =>
    current === 'complete' && sectionRedacted(section) ? 'redacted' : current;
  return {
    ...evidence,
    coverage: {
      ...evidence.coverage,
      input: label(evidence.coverage.input, input),
      output: label(evidence.coverage.output, output),
    },
    payload: { ...payload, input, output },
  };
};

/**
 * What one receipt may be exported as under the purposes effective now (rule 5, LI1): a content receipt whole while
 * `content` is effective, its fact alone as a summary while only `summary` is, and nothing otherwise. A summary or
 * feedback receipt is exported as it is while its own purpose is effective.
 *
 * @param evidence - The opened receipt.
 * @param effective - Whether `summary` and `content` are effective for its account and project now.
 * @returns The evidence to map, or `undefined` when nothing may be sent.
 */
export const exportableEvidence = (
  evidence: Evidence,
  effective: Readonly<{ summary: boolean; content: boolean }>,
): Evidence | undefined => {
  const { payload } = evidence;
  if (payload.plane !== 'content') {
    return payload.plane === 'summary' && !effective.summary ? undefined : evidence;
  }
  if (effective.content && effective.summary) {
    return evidence;
  }
  return effective.summary
    ? {
        ...evidence,
        coverage: { ...evidence.coverage, input: 'omitted', output: 'omitted' },
        payload: { plane: 'summary', fact: payload.fact },
      }
    : undefined;
};

/**
 * Map admitted evidence to the one Langfuse object its receipt writes (v5, LD3 to LD6). A run is one trace whose root
 * is written once from the run's outcome; its generations and tools are the root's children, each with an id from its
 * fact; a helper or direct call is a trace of its own. Account, chat, run and record ids reach the vendor only as
 * keyed or one-way digests, and no receipt id is sent.
 *
 * A fact that is not an operation (a check, a presentation, an instruction) maps to no object: the caller settles such
 * a receipt `superseded` and sends nothing. A content receipt maps as its fact does; a generation's also carries its
 * input, output, parameters and context digests, after the export redaction pass (LW3).
 *
 * @param evidence - The opened, previously validated evidence.
 * @param context - Server facts about the receipt.
 * @param pseudonym - The key from {@link pseudonymKey}.
 * @returns The object's identity and the spans of its one request, or `undefined` for no object.
 */
export const langfuseObservation = (
  evidence: Evidence,
  context: ObservationContext,
  pseudonym: Uint8Array<ArrayBuffer>,
): LangfuseObservation | undefined => {
  const mapping = mappingOf(exportRedacted(evidence, context.identity), context, pseudonym);
  const spans = ((): OtlpSpan[] | undefined => {
    const { payload } = mapping.evidence;
    if (payload.plane === 'feedback') {
      return payload.fact.kind === 'rating' ? [transitionalSpan(mapping, 'tau.rating', payload.fact)] : undefined;
    }
    const { fact } = payload;
    switch (fact.kind) {
      case 'provider': {
        return [generationSpan(mapping, fact, payload.plane === 'content' ? payload : undefined)];
      }
      case 'tool': {
        return [toolSpan(mapping, fact)];
      }
      case 'outcome': {
        return rootSpans(mapping, fact);
      }
      case 'financial': {
        return [transitionalSpan(mapping, settlementObservationName, fact)];
      }
      default: {
        return undefined;
      }
    }
  })();
  const [object] = spans ?? [];
  return spans === undefined || object === undefined
    ? undefined
    : { identity: { traceId: object.traceId, spanId: object.spanId }, spans };
};

/**
 * The OTLP/HTTP JSON request body for one receipt's spans. One receipt per request keeps the vendor's answer about that
 * one object exact: a batch can drop a malformed span silently while acknowledging the rest (T02 attempt 2). Nothing
 * rides along: a run's root is its own receipt, written once, and Langfuse attaches children sent before it.
 *
 * @param spans - The spans of one receipt, its object first.
 * @returns The request body.
 */
export const otlpBody = (spans: readonly OtlpSpan[]): string =>
  JSON.stringify({
    resourceSpans: [
      {
        resource: { attributes: [stringAttribute('service.name', 'tau-api')] },
        scopeSpans: [{ scope: { name: 'tau-agent-evidence', version: observationMapperVersion }, spans }],
      },
    ],
  });
