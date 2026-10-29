import type { Evidence } from '@taucad/agent-observability/contract';
import { canonicalEvidence, contractId, evidenceDigest, sha256Hex } from '@taucad/agent-observability/identity';
import type { SourceProtection } from '#api/agent-observability/evidence-admission.js';
import { evidenceRetentionMilliseconds } from '#api/agent-observability/evidence-admission.js';
import type { ProviderFact, ProviderStreamSummary } from '#api/agent-observability/provider-stream-facts.js';
import type { ModelInvocationSurface, ModelProviderWire } from '#api/llm/model-invocation.types.js';

/** Bumped whenever the facts written for the same attempt change. */
export const apiProviderMapper = 'api-provider-v2';

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
  requestedModel: string | undefined;
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
    resolvedModel: stream?.resolvedModel ?? null,
    provider: provider ?? null,
    response: stream?.response ?? null,
    firstOutput:
      stream?.firstChunk === undefined
        ? null
        : { domain: 'api-relay', chunk: stream.firstChunk, text: stream.firstText ?? null },
    purpose: attempt.surface === 'gateway' ? 'generation' : 'helper',
    stop: stopOf(attempt),
    usage,
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
    versions: {
      hostBuild: null,
      apiBuild: null,
      harness: null,
      compaction: null,
      prompts: [],
      skills: [],
      tools: [],
      kernels: [],
      mapper: apiProviderMapper,
      policy: 'purposes-v1',
    },
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
