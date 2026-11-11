import type { Evidence } from '@taucad/agent-observability/contract';
import { canonicalEvidence, contractId, evidenceDigest, sha256Hex } from '@taucad/agent-observability/identity';
import type { SourceProtection } from '#evidence-admission.js';
import { evidenceRetentionMilliseconds } from '#evidence-admission.js';
import type { ProviderFact, ProviderStreamSummary } from '#provider-stream-facts.js';
import type {
  HostLabels,
  ModelInvocationIntent,
  ModelInvocationSurface,
  ModelProviderWire,
} from '@taucad/api-llm-gateway';

/** Bumped whenever the facts written for the same attempt change. */
export const apiProviderMapper = 'api-provider-v3';

/* An evidence id admits word characters, `:`, `.` and `-`; anything else in an image reference is replaced. */
const releaseUnsafe = /[^\w:.-]/gu;

/**
 * This API build's release label for the facts it reports: the last path segment of the Fly image reference
 * (`FLY_IMAGE_REF`), the same label `otel.ts` reports as `service.version` and Sentry as its release, made a valid
 * evidence id. Outside Fly there is no build identity, and the observation reports release `unknown`.
 *
 * @param imageReference - The deployed image reference; the process's `FLY_IMAGE_REF` by default.
 * @returns The label, or `undefined` when no image reference is set.
 */
export const apiBuildRelease = (
  imageReference: string | undefined = process.env['FLY_IMAGE_REF'],
): string | undefined => {
  const label = imageReference?.split('/').at(-1)?.replaceAll(releaseUnsafe, '_').slice(0, 128);
  return label === '' ? undefined : label;
};

/**
 * The versions an API-reported fact carries: this API's build, under the summary purposes policy.
 *
 * @param mapper - The fact's mapper version.
 * @returns The envelope's versions.
 */
export const apiVersions = (mapper: string): Evidence['versions'] => ({
  hostBuild: null,
  apiBuild: apiBuildRelease() ?? null,
  harness: null,
  compaction: null,
  prompts: [],
  skills: [],
  tools: [],
  kernels: [],
  mapper,
  policy: 'purposes-v1',
});

/* The host names each gateway attempt `<run>:<attempt>:<position>` when it prepares it (agent-host's session). */
const hostAttemptKey = /^(.+):\d+:\d+$/u;

/**
 * The execution an attempt key belongs to: the host run it names, under the id the host's own facts use, so an attempt
 * and its settlement join that run; any other key is its own execution.
 *
 * @param attemptKey - The caller's attempt key.
 * @returns The contract id of the run, else of the attempt.
 */
export const executionOfAttempt = async (attemptKey: string): Promise<string> => {
  const run = hostAttemptKey.exec(attemptKey)?.[1];
  return run === undefined ? contractId('inv', attemptKey) : contractId('run', run);
};

/* A model id the contract can carry as it is; any other is not a model name a reader could use. */
const modelIdShape = /^[\w:.-]{1,128}$/u;

/** One supplier attempt as the API saw it relay. */
export type ObservedAttempt = Readonly<{
  principal: string;
  project: string;
  /** The caller's attempt key: one logical request, which the host names too. */
  attemptKey: string;
  /** The chat the attempt belongs to, when the caller named one; otherwise the attempt is its own run. */
  chat: string | undefined;
  surface: ModelInvocationSurface;
  wire: ModelProviderWire;
  /** The activity the caller asserted (`compaction`) or the surface implies; absent from an older recorder. */
  activity?: ModelInvocationIntent['activity'] | undefined;
  requestedModel: string | undefined;
  /** The supplier's model id for the requested route, which names the model when the stream did not. */
  supplierModel?: string | undefined;
  /** The host labels the caller asserted (LW17), when it sent any. */
  labels?: HostLabels | undefined;
  /** The supplier the route resolved to, when the API knows it. */
  provider: string | undefined;
  /** The funded operation, when Tau Cloud billed the attempt. */
  operation: string | undefined;
  startedAt: number;
  /** Milliseconds from start to the end of the relay. */
  duration: number;
  stream: ProviderStreamSummary | undefined;
  /** How the relay ended when the stream did not say. */
  ended: 'completed' | 'aborted' | 'failed';
}>;

/** What current authority stamps on the attempt. */
export type AttemptAuthority = Readonly<{ policyEpoch: string; protection: SourceProtection }>;

const stopOf = (attempt: ObservedAttempt): ProviderFact['stop'] => {
  if (attempt.ended === 'aborted') {
    return 'aborted';
  }
  if (attempt.ended === 'failed') {
    return 'error';
  }
  return attempt.stream?.stop ?? 'error';
};

/**
 * What kind of model call an attempt was (LF-13): a host run's call when its gateway attempt key names a run, a helper
 * endpoint's call, or any other direct gateway call. A chat hint does not decide it, because a helper sends one too.
 */
const callKindOf = (attempt: ObservedAttempt): NonNullable<ProviderFact['callKind']> => {
  if (attempt.surface !== 'gateway') {
    return 'helper';
  }
  return hostAttemptKey.test(attempt.attemptKey) ? 'run' : 'direct';
};

const purposeOf = (attempt: ObservedAttempt): ProviderFact['purpose'] => {
  if (attempt.surface !== 'gateway') {
    return 'helper';
  }
  return attempt.activity === 'compaction' ? 'compaction' : 'generation';
};

/**
 * The provider fact's host labels, each made a valid evidence id, as a member ready to spread into the fact; empty
 * when the caller sent none, so a fact without labels is the fact written before LW17.
 *
 * @param labels - The labels the header boundary admitted.
 * @returns The fact's `labels` member, or nothing.
 */
const labelsOf = async (
  labels: HostLabels | undefined,
): Promise<{ readonly labels?: NonNullable<ProviderFact['labels']> }> => {
  const entries = await Promise.all(
    Object.entries(labels ?? {}).map(async ([key, value]) => [key, await contractId('label', value)] as const),
  );
  return entries.length === 0 ? {} : { labels: Object.fromEntries(entries) };
};

/**
 * The API-reported summary of one supplier attempt (blueprint T07). It holds
 * ids, timing, model, stop reason and token counts, never request or output
 * text, and its source is the attempt itself, so a replay of the same attempt
 * is the same fact.
 *
 * @param attempt - What the relay observed.
 * @param authority - The policy epoch and protection the attempt is admitted under.
 * @returns Evidence ready for admission.
 */
export const providerAttemptEvidence = async (
  attempt: ObservedAttempt,
  authority: AttemptAuthority,
): Promise<Evidence> => {
  const optionalId = async (prefix: string, value: string | undefined): Promise<string | undefined> =>
    value === undefined ? undefined : contractId(prefix, value);
  const [invocation, execution, chat, operation, requestedModel, provider] = await Promise.all([
    contractId('inv', attempt.attemptKey),
    executionOfAttempt(attempt.attemptKey),
    optionalId('chat', attempt.chat),
    optionalId('op', attempt.operation),
    optionalId('model', attempt.requestedModel),
    optionalId('provider', attempt.provider),
  ]);
  const run = chat ?? invocation;
  const labels = await labelsOf(attempt.labels);
  const { stream } = attempt;
  const usage: ProviderFact['usage'] = stream?.usage ?? {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
    reasoning: null,
    missing: 'unreported',
  };
  const fact: ProviderFact = {
    kind: 'provider',
    logicalCall: invocation,
    attempt: operation ?? null,
    billing: operation ?? null,
    requestedModel: requestedModel ?? null,
    resolvedModel:
      stream?.resolvedModel ??
      (attempt.supplierModel !== undefined && modelIdShape.test(attempt.supplierModel) ? attempt.supplierModel : null),
    provider: provider ?? null,
    response: stream?.response ?? null,
    firstOutput:
      stream?.firstChunk === undefined
        ? null
        : { domain: 'api-relay', chunk: stream.firstChunk, text: stream.firstText ?? null },
    purpose: purposeOf(attempt),
    callKind: callKindOf(attempt),
    stop: stopOf(attempt),
    usage,
    ...labels,
  };
  const sourceDigest = await sha256Hex(
    canonicalEvidence(['api-provider-attempt', attempt.principal, invocation, fact]),
  );
  const expiresAt = attempt.startedAt + evidenceRetentionMilliseconds;
  const firstChunk = stream?.firstChunk;
  const evidence: Evidence = {
    version: 1,
    source: { kind: 'invocation', invocation, digest: sourceDigest },
    semantic: { kind: 'provider', id: invocation },
    projection: { version: apiProviderMapper, redactor: 'summary-only', digest: '0'.repeat(64) },
    delivery: { uploader: 'api', attempt: 'api-1', cursor: { view: 'own', origin: 'api', position: invocation } },
    scope: {
      principal: attempt.principal,
      project: attempt.project,
      policyEpoch: authority.policyEpoch,
      destination: 'langfuse',
    },
    run,
    execution: { attempt: execution, resumedFrom: null, branchedFrom: null },
    versions: apiVersions(apiProviderMapper),
    task: null,
    clocks: {
      occurredAt: attempt.startedAt,
      sourceOrder: invocation,
      intervals:
        firstChunk === undefined
          ? [{ phase: 'provider-wait', domain: 'api-relay', start: 0, end: attempt.duration }]
          : [
              { phase: 'provider-wait', domain: 'api-relay', start: 0, end: firstChunk },
              {
                phase: 'provider-stream',
                domain: 'api-relay',
                start: firstChunk,
                end: Math.max(firstChunk, attempt.duration),
              },
            ],
    },
    authority: 'api-reported',
    retention: { originalAt: attempt.startedAt, expiresAt, proof: 'api-retention-v1' },
    lineage: [
      {
        source: invocation,
        digest: sourceDigest,
        protection: authority.protection,
        rights: 'unknown',
        expiresAt,
        proof: null,
      },
    ],
    coverage: {
      events: 'complete',
      input: 'omitted',
      output: 'omitted',
      usage: usage.missing === 'none' ? 'complete' : usage.missing === 'partial' ? 'truncated' : 'missing',
      artifacts: 'unsupported',
      permission: 'complete',
    },
    payload: { plane: 'summary', fact },
  };
  return { ...evidence, projection: { ...evidence.projection, digest: await evidenceDigest(evidence) } };
};
