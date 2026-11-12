/* eslint-disable @typescript-eslint/naming-convention -- Langfuse usage keys use snake_case. */
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Evidence } from '@taucad/agent-observability/contract';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import type { ProjectedRun, ProjectionContext } from '@taucad/agent-observability/projection';
import { projectRun } from '@taucad/agent-observability/projection';
import { evidenceFixture, privateMarker, toolFact } from '#testing/evidence.fixture.js';
import {
  exportableEvidence,
  langfuseObservation,
  langfuseScores,
  observationGroup,
  observationMapperVersion,
  otlpBody,
  pseudonymKey,
  releaseLabel,
  runRootName,
  runRootSpanId,
} from '#langfuse-observation.js';
import type { LangfuseObservation, OtlpSpan } from '#langfuse-observation.js';
import { providerAttemptEvidence, providerContentEvidence } from '#model-invocation-evidence.js';
import type { ObservedAttempt } from '#model-invocation-evidence.js';
import type { ObservedSettlement } from '@taucad/api-billing';
import { evidenceKeys } from '@taucad/agent-observability/identity';
import { generationSettlementKey, settledGenerationKey, settlementEvidence, settles } from '#settlement-evidence.js';

const pseudonym = pseudonymKey(Uint8Array.from(randomBytes(32)));
const context = { environment: 'staging', protection: 'pro' } as const;
const at = Date.parse('2026-11-10T09:00:00.000Z');

const attribute = (span: OtlpSpan, key: string): unknown => {
  const found = span.attributes.find((item) => item.key === key);
  if (found === undefined) {
    return undefined;
  }
  const { value } = found;
  return 'arrayValue' in value ? value.arrayValue.values.map((item) => item.stringValue) : Object.values(value)[0];
};
const metadata = (span: OtlpSpan, key: string): unknown => attribute(span, `langfuse.observation.metadata.${key}`);
const milliseconds = (nanoseconds: string): number => Number(BigInt(nanoseconds) / 1_000_000n);

const map = (evidence: Evidence): LangfuseObservation => {
  const mapped = langfuseObservation(evidence, context, pseudonym);
  if (mapped === undefined) {
    throw new Error(`${evidence.semantic.kind} maps to no object`);
  }
  return mapped;
};
const only = (evidence: Evidence): OtlpSpan => {
  const { spans } = map(evidence);
  expect(spans).toHaveLength(1);
  return spans[0]!;
};

const attempt = (change: Partial<ObservedAttempt> = {}): ObservedAttempt => ({
  principal: 'user-a',
  project: 'project-a',
  attemptKey: 'run-1:1:0',
  chat: 'chat-1',
  surface: 'gateway',
  wire: 'anthropic',
  activity: 'agent',
  requestedModel: 'anthropic-claude-test',
  supplierModel: 'claude-test-supplier',
  provider: 'anthropic',
  operation: 'op-1',
  startedAt: at,
  duration: 4000,
  stream: {
    stop: 'toolUse',
    usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, reasoning: null, missing: 'none' },
    resolvedModel: 'claude-test',
    response: 'response-1',
    firstChunk: 400,
    firstText: 650,
  },
  ended: 'completed',
  ...change,
});
const authority = { policyEpoch: 'epoch-a', protection: 'pro' } as const;
const generation = async (change: Partial<ObservedAttempt> = {}): Promise<Evidence> =>
  providerAttemptEvidence(attempt(change), authority);

type FinancialFact = Extract<Evidence['payload'], { plane: 'summary' }>['fact'] & { kind: 'financial' };
/** The ledger's settlement of the call {@link attempt} makes, as the recorder admits it. */
const settlement = async (
  receipt: Partial<Pick<ObservedSettlement['receipt'], 'chargedAtoms' | 'supplierCostPicoUsd'>> = {},
): Promise<Evidence> =>
  settlementEvidence(
    {
      operation: {
        id: 'op-1',
        accountId: 'account-1',
        environment: 'staging',
        attemptKey: 'run-1:1:0',
        projectHint: 'project-a',
        chatHint: 'chat-1',
        admittedAt: new Date(at),
        activationId: 'activation-1',
      },
      receipt: {
        terminalRevision: 1n,
        chargedAtoms: 1500n,
        supplierCostPicoUsd: null,
        resolvedAt: new Date(at + 1),
        ...receipt,
      },
      normalization: undefined,
    },
    'user-a',
    { ...authority, project: 'project-a' },
  );
const factOf = (evidence: Evidence): FinancialFact => {
  const { fact } = evidence.payload;
  if (fact.kind !== 'financial') {
    throw new Error(`${fact.kind} is not a settlement`);
  }
  return fact;
};

const row = (sequence: number) => ({ chatId: 'chat-1', leaderEpoch: 'epoch-a', sequence });
const hostRun = (change: Partial<ProjectedRun> = {}): ProjectedRun => ({
  chatId: 'chat-1',
  runId: 'run-1',
  termination: 'completed',
  tools: [],
  intervals: [{ phase: 'admission', start: at - 500, end: at }],
  ending: { source: row(8), at: at + 30_000 },
  ...change,
});
const hostContext: ProjectionContext = {
  principal: 'user-a',
  project: 'project-a',
  policyEpoch: 'epoch-a',
  protection: 'free',
  uploader: 'device-a',
  ownsEpoch: () => true,
  grantedAt: at - 60_000,
  hostBuild: 'f61685bf3496',
};
const projected = async (run: ProjectedRun): Promise<Evidence[]> => {
  const { evidence } = await projectRun(run, hostContext);
  return [...evidence];
};
const outcomeOf = async (run: ProjectedRun): Promise<Evidence> => {
  const evidence = await projected(run);
  return evidence.find((item) => item.semantic.kind === 'outcome')!;
};

describe('langfuseObservation v5: one trace per run, one root, ids from the fact', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should map a provider attempt to one generation under its run root, named by its fact and never its receipt', async () => {
    const evidence = await generation();
    const first = map(evidence);
    const span = only(evidence);

    expect(map(evidence)).toEqual(first);
    expect(span.spanId).toBe(first.identity.spanId);
    expect(span.traceId).toBe(first.identity.traceId);
    expect(span.spanId).toMatch(/^[a-f\d]{16}$/u);
    expect(span.traceId).toMatch(/^[a-f\d]{32}$/u);
    expect(span.parentSpanId).toBe(runRootSpanId('staging', 'user-a', 'run-1'));
    expect(span.name).toBe('call-model');
    expect(attribute(span, 'langfuse.observation.type')).toBe('generation');
    expect(attribute(span, 'langfuse.trace.name')).toBe(runRootName);
    expect(attribute(span, 'langfuse.observation.model.name')).toBe('claude-test');
    expect(metadata(span, 'mapper')).toBe(observationMapperVersion);
    expect(observationMapperVersion).toBe('langfuse-v5');
    expect(metadata(span, 'receipt')).toBeUndefined();
    expect(span.attributes.some((item) => item.key.startsWith('gen_ai.'))).toBe(false);
    expect(span.attributes.some((item) => item.key.endsWith('.source') || item.key.endsWith('.semantic'))).toBe(false);
    expect(otlpBody([span])).not.toContain('user-a');
    expect(otlpBody([span])).not.toContain('chat-1');
  });

  it("should send usage as usage_details with a total, and reasoning tokens as metadata, from the export's first generation", async () => {
    const span = only(
      await generation({
        stream: {
          ...attempt().stream!,
          usage: { input: 4, output: 241, cacheRead: 0, cacheWrite: 28_066, reasoning: 50, missing: 'none' },
        },
      }),
    );

    expect(JSON.parse(String(attribute(span, 'langfuse.observation.usage_details')))).toEqual({
      input: 4,
      output: 241,
      input_cached_tokens: 0,
      input_cache_creation: 28_066,
      total: 28_311,
    });
    expect(metadata(span, 'reasoning_tokens')).toBe('50');
    expect(attribute(span, 'langfuse.observation.cost_details')).toBeUndefined();
  });

  it('should leave out usage it was not told and total only what it was', async () => {
    const partial = only(
      await generation({
        stream: {
          ...attempt().stream!,
          usage: { input: 7, output: null, cacheRead: 3, cacheWrite: null, reasoning: null, missing: 'partial' },
        },
      }),
    );
    const none = only(await generation({ stream: undefined, ended: 'failed' }));

    expect(JSON.parse(String(attribute(partial, 'langfuse.observation.usage_details')))).toEqual({
      input: 7,
      input_cached_tokens: 3,
      total: 10,
    });
    expect(attribute(none, 'langfuse.observation.usage_details')).toBeUndefined();
    expect(attribute(none, 'langfuse.observation.level')).toBe('ERROR');
    /* A failed attempt names the supplier's model for the route, never Tau's catalogue id (LF-27). */
    expect(attribute(none, 'langfuse.observation.model.name')).toBe('claude-test-supplier');
    expect(metadata(none, 'requested_model')).toBe('anthropic-claude-test');
  });

  it('should map a three-turn chat to three traces in one session with one root each', async () => {
    const runs = ['run-1', 'run-2', 'run-3'];
    const roots = await Promise.all(
      runs.map(async (runId, index) =>
        only(await outcomeOf(hostRun({ runId, ending: { source: row(10 + index), at: at + 30_000 * (index + 1) } }))),
      ),
    );
    const generations = await Promise.all(
      runs.map(async (runId) => only(await generation({ attemptKey: `${runId}:1:0` }))),
    );

    expect(new Set(roots.map((span) => span.traceId)).size).toBe(3);
    expect(new Set([...roots, ...generations].map((span) => attribute(span, 'langfuse.session.id'))).size).toBe(1);
    expect(attribute(roots[0]!, 'langfuse.session.id')).toBe(observationGroup('staging', 'user-a', 'chat-1'));
    for (const [index, root] of roots.entries()) {
      expect(root.parentSpanId).toBeUndefined();
      expect(root.name).toBe(runRootName);
      expect(attribute(root, 'langfuse.observation.type')).toBe('agent');
      expect(root.spanId).toBe(runRootSpanId('staging', 'user-a', runs[index]!));
      expect(generations[index]!.traceId).toBe(root.traceId);
      expect(generations[index]!.parentSpanId).toBe(root.spanId);
      expect(metadata(generations[index]!, 'run')).toBe(metadata(root, 'run'));
    }
  });

  it('should keep a run paused for approval in one trace with one root and its wait between the attempts', async () => {
    const before = await generation({ attemptKey: 'run-1:1:0', startedAt: at, duration: 4000 });
    const after = await generation({ attemptKey: 'run-1:2:0', startedAt: at + 20_000, duration: 4000 });
    const outcome = await outcomeOf(
      hostRun({
        intervals: [
          { phase: 'admission', start: at - 500, end: at },
          { phase: 'approval', start: at + 5000, end: at + 15_000 },
        ],
      }),
    );
    const mapped = map(outcome);
    const [root, wait] = mapped.spans;
    const spans = [only(before), only(after)];

    expect(mapped.spans).toHaveLength(2);
    expect(mapped.identity.spanId).toBe(root!.spanId);
    expect(new Set([root, wait, ...spans].map((span) => span!.traceId)).size).toBe(1);
    expect(spans.map((span) => span.parentSpanId)).toEqual([root!.spanId, root!.spanId]);
    expect(wait!.name).toBe('wait-for-approval');
    expect(wait!.parentSpanId).toBe(root!.spanId);
    expect(milliseconds(wait!.startTimeUnixNano)).toBeGreaterThanOrEqual(milliseconds(spans[0]!.endTimeUnixNano));
    expect(milliseconds(wait!.endTimeUnixNano)).toBeLessThanOrEqual(milliseconds(spans[1]!.startTimeUnixNano));
    expect(metadata(root!, 'approval_ms')).toBe('10000');
    expect(metadata(root!, 'admission_ms')).toBe('500');
  });

  it('should write the root from the first terminal row and name the same object for a resumed run', async () => {
    const failed = await outcomeOf(
      hostRun({
        termination: 'failed',
        ending: { source: row(8), at: at + 30_000, failure: { code: 'MODEL_ATTEMPT_PENDING', wrapped: undefined } },
      }),
    );
    const resumed = await outcomeOf(hostRun({ ending: { source: row(14), at: at + 90_000 } }));
    const root = only(failed);
    const message = 'run failed: MODEL_ATTEMPT_PENDING (owner host, retry wait)';

    expect(map(resumed).identity).toEqual(map(failed).identity);
    expect(milliseconds(root.startTimeUnixNano)).toBe(at - 500);
    expect(milliseconds(root.endTimeUnixNano)).toBe(at + 30_000);
    expect(attribute(root, 'langfuse.observation.level')).toBe('ERROR');
    expect(attribute(root, 'langfuse.observation.status_message')).toBe(message);
    expect(root.status).toEqual({ code: 2, message });
    expect(metadata(root, 'termination')).toBe('failed');
    expect(metadata(root, 'failure_code')).toBe('MODEL_ATTEMPT_PENDING');
    expect(metadata(root, 'failure_owner')).toBe('host');
    expect(metadata(root, 'failure_retry')).toBe('wait');
    expect(metadata(root, 'chat')).toBe(observationGroup('staging', 'user-a', 'chat-1'));
  });

  it('should mark an abandoned run WARNING and a completed one DEFAULT', async () => {
    const abandoned = only(await outcomeOf(hostRun({ termination: 'abandoned' })));
    const completed = only(await outcomeOf(hostRun()));

    expect(attribute(abandoned, 'langfuse.observation.level')).toBe('WARNING');
    expect(attribute(completed, 'langfuse.observation.level')).toBeUndefined();
    expect(completed.status).toEqual({ code: 1 });
  });

  it('should give a helper call its own trace with no parent and no session, and its chat as metadata', async () => {
    const helper = only(await generation({ surface: 'project_name', attemptKey: 'name-1', activity: 'title' }));
    const direct = only(await generation({ attemptKey: 'attempt-1', chat: undefined }));
    const run = only(await generation());

    expect(helper.parentSpanId).toBeUndefined();
    expect(helper.name).toBe('call-helper-model');
    expect(attribute(helper, 'langfuse.trace.name')).toBe('call-helper-model');
    expect(attribute(helper, 'langfuse.session.id')).toBeUndefined();
    expect(metadata(helper, 'chat')).toBe(observationGroup('staging', 'user-a', 'chat-1'));
    expect(helper.traceId).not.toBe(run.traceId);
    expect(direct.parentSpanId).toBeUndefined();
    expect(direct.name).toBe('call-model');
    expect(attribute(direct, 'langfuse.session.id')).toBeUndefined();
    expect(metadata(direct, 'chat')).toBeUndefined();
  });

  it('should name a compaction call compact-context from its activity', async () => {
    const span = only(await generation({ activity: 'compaction' }));

    expect(span.name).toBe('compact-context');
    expect(span.parentSpanId).toBe(runRootSpanId('staging', 'user-a', 'run-1'));
  });

  it('should time a generation by its relay phases and its first output', async () => {
    const span = only(await generation());
    const start = milliseconds(span.startTimeUnixNano);
    const completionStart = Date.parse(String(attribute(span, 'langfuse.observation.completion_start_time')));

    expect(start).toBe(at);
    expect(milliseconds(span.endTimeUnixNano) - start).toBe(4000);
    expect(completionStart - start).toBe(400);
    expect(metadata(span, 'wait_ms')).toBe('400');
    expect(metadata(span, 'stream_ms')).toBe('3600');
    expect(metadata(span, 'first_text_ms')).toBe('650');
    expect(metadata(span, 'stop')).toBe('toolUse');
  });

  it('should map a tool under its run root by its call, and a failed one ERROR', async () => {
    const tool = (outcome: 'completed' | 'failed'): ProjectedRun['tools'][number] => ({
      call: 'call-1',
      toolName: 'SYNTHETIC_TOOL',
      outcome,
      input: row(3),
      output: row(4),
      startedAt: at + 1000,
      settledAt: at + 3000,
      modelCall: 'run-1:1:0',
    });
    const [completed] = await projected(hostRun({ tools: [tool('completed')], ending: undefined }));
    const [failed] = await projected(hostRun({ tools: [tool('failed')], ending: undefined }));
    const span = only(completed!);

    /* A tool outside the first-party vocabulary is named only as external-tool (LQ5). */
    expect(span.name).toBe('external-tool');
    expect(JSON.stringify(completed)).not.toContain('SYNTHETIC_TOOL');
    expect(attribute(span, 'langfuse.observation.type')).toBe('tool');
    expect(span.parentSpanId).toBe(runRootSpanId('staging', 'user-a', 'run-1'));
    expect(milliseconds(span.endTimeUnixNano) - milliseconds(span.startTimeUnixNano)).toBe(2000);
    expect(metadata(span, 'tool_class')).toBe('other');
    expect(metadata(span, 'outcome')).toBe('completed');
    expect(metadata(span, 'model_call')).toMatch(/^[a-f\d]{32}$/u);
    expect(metadata(span, 'tool_call')).toMatch(/^[a-f\d]{32}$/u);
    expect(attribute(only(failed!), 'langfuse.observation.level')).toBe('ERROR');
    expect(only(failed!).spanId).toBe(span.spanId);
  });

  it('should name a first-party tool and its class, and any other name, or none, as external-tool (LW5)', async () => {
    const [evidence] = await projected(
      hostRun({
        tools: [
          {
            call: 'call-1',
            toolName: 'edit_file',
            outcome: 'completed',
            input: row(3),
            output: row(4),
            startedAt: at + 1000,
            settledAt: at + 3000,
          },
        ],
        ending: undefined,
      }),
    );
    const span = only(evidence!);
    expect(span.name).toBe('edit_file');
    expect(metadata(span, 'tool_class')).toBe('write');

    const renamed = async (name: string | undefined): Promise<string> => {
      const fact = { ...toolFact(), ...(name === undefined ? {} : { name }) };
      return only(await evidenceFixture({ semantic: 'call-1', fact })).name;
    };
    /* A host that sent a name outside the vocabulary, or an older host that sent none, still names no private tool. */
    expect(await renamed('synthetic_private_tool')).toBe('external-tool');
    expect(await renamed(undefined)).toBe('external-tool');
    expect(await renamed('test_model')).toBe('test_model');
  });

  it('should map a check, a presentation and an instruction to no object', async () => {
    const evidence = await projected(
      hostRun({
        presentedAt: at + 2000,
        tools: [
          {
            call: 'call-1',
            toolName: 'test_model',
            outcome: 'completed',
            input: row(3),
            output: row(4),
            startedAt: at + 1000,
            settledAt: at + 3000,
            check: { result: 'passed', revision: ['file-a'], requirements: ['requirement-a'] },
          },
        ],
      }),
    );
    const byKind = (kind: Evidence['semantic']['kind']) => evidence.find((item) => item.semantic.kind === kind)!;

    expect(langfuseObservation(byKind('cad'), context, pseudonym)).toBeUndefined();
    expect(langfuseObservation(byKind('response'), context, pseudonym)).toBeUndefined();
    expect(langfuseObservation(await evidenceFixture(), context, pseudonym)).toBeUndefined();
  });

  it('should tag every span with the plan, as an array attribute, and the protection as trace metadata', async () => {
    const span = only(await generation());

    expect(attribute(span, 'langfuse.trace.tags')).toEqual(['plan:pro']);
    expect(attribute(span, 'langfuse.trace.metadata.protection')).toBe('pro');
    expect(attribute(span, 'langfuse.environment')).toBe('staging');
    expect(attribute(span, 'langfuse.user.id')).toMatch(/^[a-f\d]{32}$/u);
    expect(metadata(span, 'authority')).toBe('api-reported');
    expect(metadata(span, 'plane')).toBe('summary');
    expect(metadata(span, 'coverage_input')).toBe('omitted');
    expect(metadata(span, 'coverage_output')).toBe('omitted');
  });

  it('should report the release as the build short SHA in one format on both planes', async () => {
    vi.stubEnv('FLY_IMAGE_REF', 'registry.fly.io/tau-api-staging:f61685bf3496c0ffee0123456789abcdef012345');
    const root = only(await outcomeOf(hostRun()));
    const span = only(await generation());

    expect(attribute(root, 'langfuse.release')).toBe('f61685bf3496');
    expect(attribute(span, 'langfuse.release')).toBe('f61685bf3496');
    expect(releaseLabel('0000000')).toBe('unknown');
    expect(releaseLabel(null)).toBe('unknown');
    expect(releaseLabel('abc1234')).toBe('abc1234');
    expect(releaseLabel('1.4.0')).toBe('1.4.0');
    expect(releaseLabel('tau-api-staging:deployment-01KSYNTHETIC')).toBe('tau-api-staging:deployment-01KSYNTHETIC');
  });

  it('should map a settlement to no object and carry its four values on the generation it settled (LW4)', async () => {
    const charged = await settlement({ chargedAtoms: 1_500_000n, supplierCostPicoUsd: 750_000_000_000n });
    const call = await generation();
    const fact = factOf(charged);
    const span = only(call);
    const settled = langfuseObservation(call, { ...context, settlement: fact }, pseudonym)!;

    expect(evidenceSchema.safeParse(charged).success).toBe(true);
    expect(langfuseObservation(charged, context, pseudonym)).toBeUndefined();
    expect(settled.identity).toEqual(map(call).identity);
    expect(settled.spans).toHaveLength(1);
    const [carried] = settled.spans;
    expect(carried!.name).toBe('call-model');
    expect(metadata(carried!, 'supplier_cost_usd')).toBe(0.75);
    expect(metadata(carried!, 'credits')).toBe(1.5);
    expect(metadata(carried!, 'tariff')).toBe(observationGroup('staging', 'user-a', fact.tariff));
    expect(metadata(carried!, 'ledger')).toBe(observationGroup('staging', 'user-a', fact.ledger));
    /* Langfuse's own cost stays derived from usage, with its breakdown: no cost total is sent (LD6). */
    expect(attribute(carried!, 'langfuse.observation.cost_details')).toBeUndefined();
    expect(attribute(carried!, 'langfuse.observation.usage_details')).toBe(
      attribute(span, 'langfuse.observation.usage_details'),
    );
    expect(carried!.attributes.some((item) => item.key.includes('.fact.'))).toBe(false);
    for (const key of ['supplier_cost_usd', 'credits', 'tariff', 'ledger']) {
      expect(metadata(span, key)).toBeUndefined();
    }
  });

  it('should leave an unpriced supplier cost out of a settled generation, never as zero', async () => {
    const fact = factOf(await settlement({ chargedAtoms: 2_000_000n, supplierCostPicoUsd: null }));
    const [carried] = langfuseObservation(await generation(), { ...context, settlement: fact }, pseudonym)!.spans;

    expect(metadata(carried!, 'credits')).toBe(2);
    expect(metadata(carried!, 'supplier_cost_usd')).toBeUndefined();
  });

  it('should name the call it settled, so delivery can join a generation and its settlement either way', async () => {
    const call = await generation();
    const charged = await settlement();

    expect(settledGenerationKey(charged)).toBe(evidenceKeys(call).semantic);
    expect(generationSettlementKey(call)).toBe(evidenceKeys(charged).semantic);
    expect(settles(charged, call)).toBe(true);
    expect(settles(charged, await generation({ operation: 'op-2' }))).toBe(false);
    expect(settles(charged, await generation({ attemptKey: 'run-1:1:1' }))).toBe(false);
  });

  it('should keep content out of the body of a summary observation', async () => {
    expect(otlpBody(map(await generation()).spans)).not.toContain(privateMarker);
  });
});

describe('langfuseObservation v5: generation content (LW3)', () => {
  const identity = { email: 'Jane.Fontaine@Example.com', name: 'Jane Fontaine' } as const;
  const withIdentity = { ...context, identity };
  const content = async (): Promise<Evidence> => {
    const evidence = await providerContentEvidence(
      attempt({
        content: {
          input: {
            messages: [
              {
                role: 'tool',
                parts: [
                  { kind: 'tool-result', call: 'toolu_1', error: false, text: 'const author = "Jane Fontaine";' },
                  { kind: 'media', mime: 'image/png', bytes: 3000, digest: 'd'.repeat(64) },
                ],
              },
              {
                role: 'user',
                parts: [{ kind: 'text', text: 'I am Jane Fontaine, mail jane.fontaine@example.com or bob@corp.io' }],
              },
            ],
            context: { historyMessages: 6, history: 'b'.repeat(64), system: 'c'.repeat(64), tools: 'e'.repeat(64) },
            parameters: { max_tokens: 8192, 'thinking.type': 'enabled' },
          },
          output: [
            {
              role: 'assistant',
              parts: [
                { kind: 'thinking', text: 'Fontaine wants it taller.' },
                { kind: 'text', text: 'Raising it, Jane.' },
                { kind: 'tool-call', call: 'toolu_2', name: 'edit_file', text: '{"author":"Jane Fontaine"}' },
              ],
            },
          ],
          truncated: false,
        },
      }),
      authority,
    );
    return evidence!;
  };
  const json = (span: OtlpSpan, key: string): unknown => JSON.parse(String(attribute(span, key)));

  it('should write the new messages as input and the assistant message as output, in the shapes Langfuse parses', async () => {
    const [span] = langfuseObservation(await content(), withIdentity, pseudonym)!.spans;

    expect(span!.name).toBe('call-model');
    expect(json(span!, 'langfuse.observation.input')).toEqual({
      messages: [
        {
          role: 'tool',
          tool_call_id: 'toolu_1',
          content: [
            { type: 'text', text: 'const author = "Jane Fontaine";' },
            { type: 'media', mime_type: 'image/png', bytes: 3000 },
          ],
        },
        { role: 'user', content: 'I am [name], mail [email] or [email]' },
      ],
    });
    expect(json(span!, 'langfuse.observation.output')).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '[name] wants it taller.' },
        { type: 'text', text: 'Raising it, Jane.' },
      ],
      tool_calls: [
        { id: 'toolu_2', type: 'function', function: { name: 'edit_file', arguments: '{"author":"Jane Fontaine"}' } },
      ],
    });
  });

  it('should write the parameters and the digests and count of what the call was given', async () => {
    const evidence = await content();
    const span = only(evidence);

    expect(json(span, 'langfuse.observation.model.parameters')).toEqual({
      max_tokens: 8192,
      'thinking.type': 'enabled',
    });
    expect(metadata(span, 'history_messages')).toBe('6');
    for (const [key, value] of [
      ['history_digest', 'b'],
      ['system_digest', 'c'],
      ['tools_digest', 'e'],
    ] as const) {
      expect(metadata(span, key)).toBe(observationGroup('staging', 'user-a', value.repeat(64)));
    }
    expect(metadata(span, 'coverage_input')).toBe('redacted');
    expect(metadata(span, 'plane')).toBe('content');
  });

  it('should name the same object as the summary of the same call', async () => {
    const summary = only(await generation());
    const span = only(await content());

    expect(span.spanId).toBe(summary.spanId);
    expect(span.traceId).toBe(summary.traceId);
  });

  it('should export a content receipt without its sections when only the summary is effective', async () => {
    const evidence = await content();
    const summaryOnly = exportableEvidence(evidence, { summary: true, content: false });
    const span = only(summaryOnly!);

    expect(attribute(span, 'langfuse.observation.input')).toBeUndefined();
    expect(attribute(span, 'langfuse.observation.output')).toBeUndefined();
    expect(attribute(span, 'langfuse.observation.model.parameters')).toBeUndefined();
    expect(metadata(span, 'coverage_input')).toBe('omitted');
    expect(otlpBody([span])).not.toMatch(/Fontaine|taller/u);
    expect(exportableEvidence(evidence, { summary: false, content: true })).toBeUndefined();
    expect(exportableEvidence(evidence, { summary: true, content: true })).toBe(evidence);
    const plain = await generation();
    expect(exportableEvidence(plain, { summary: true, content: false })).toBe(plain);
    expect(exportableEvidence(plain, { summary: false, content: true })).toBeUndefined();
  });

  it('should keep a truncated or digest-only part visible as such', async () => {
    const evidence = await content();
    if (evidence.payload.plane !== 'content') {
      throw new Error('fixture');
    }
    const [result] = evidence.payload.input!.messages[0]!.parts;
    const big: Evidence = {
      ...evidence,
      payload: {
        ...evidence.payload,
        input: {
          messages: [
            {
              role: 'tool',
              parts: [
                {
                  ...(result as Extract<typeof result, { kind: 'tool-result' }>),
                  text: '',
                  originalBytes: 90_000,
                  retainedBytes: 0,
                  redaction: 'truncated',
                  digest: 'f'.repeat(64),
                },
              ],
            },
          ],
          omitted: 2,
        },
      },
    };

    const input = json(langfuseObservation(big, withIdentity, pseudonym)!.spans[0]!, 'langfuse.observation.input');
    expect(JSON.stringify(input)).toContain('not kept: 90000 bytes');
    expect(JSON.stringify(input)).not.toContain('f'.repeat(64));
    expect(metadata(langfuseObservation(big, withIdentity, pseudonym)!.spans[0]!, 'input_omitted_parts')).toBe('2');
  });
});

describe('langfuseScores (LW7): ratings and outcomes as scores on the run root', () => {
  const rated = async (value: 'positive' | 'negative'): Promise<Evidence> => {
    const { evidence } = await projectRun(hostRun({ rating: { value, at: at + 45_000 } }), {
      ...hostContext,
      plane: 'feedback',
    });
    return evidence[0]!;
  };
  const checked = (result: 'passed' | 'failed'): ProjectedRun['tools'] => [
    {
      call: 'call-1',
      toolName: 'test_model',
      outcome: 'completed',
      input: row(3),
      output: row(4),
      startedAt: at + 1000,
      settledAt: at + 3000,
      check: { result, revision: ['file-a'], requirements: ['requirement-a'] },
    },
  ];

  it('should map a rating to no observation and one user-rating score on the run root', async () => {
    const negative = await rated('negative');
    const positive = await rated('positive');
    const root = map(await outcomeOf(hostRun()));

    expect(negative.payload.plane).toBe('feedback');
    expect(langfuseObservation(negative, context, pseudonym)).toBeUndefined();
    const scores = langfuseScores(negative, context);
    expect(scores).toEqual([
      {
        id: expect.stringMatching(/^[a-f\d]{32}$/u) as unknown,
        traceId: root.identity.traceId,
        observationId: root.identity.spanId,
        name: 'user-rating',
        value: 0,
        dataType: 'BOOLEAN',
        timestamp: new Date(at + 45_000).toISOString(),
        environment: 'staging',
      },
    ]);
    expect(langfuseScores(positive, context)).toMatchObject([{ name: 'user-rating', value: 1 }]);
    /* The id is the source fact's and the name's: the same rating always names the same score. */
    expect(langfuseScores(negative, context)).toEqual(scores);
    expect(JSON.stringify(scores)).not.toContain('user-a');
  });

  it('should write run-termination and task-success from an outcome, beside its root, ids from the fact', async () => {
    const outcome = await outcomeOf(hostRun({ tools: checked('passed') }));
    const root = map(outcome);
    const scores = langfuseScores(outcome, context);
    const on = { traceId: root.identity.traceId, observationId: root.identity.spanId, environment: 'staging' };
    const timestamp = new Date(at + 30_000).toISOString();

    expect(scores).toEqual([
      {
        ...on,
        id: expect.any(String) as unknown,
        name: 'run-termination',
        value: 'completed',
        dataType: 'CATEGORICAL',
        timestamp,
      },
      { ...on, id: expect.any(String) as unknown, name: 'task-success', value: 1, dataType: 'BOOLEAN', timestamp },
    ]);
    expect(new Set(scores.map((score) => score.id)).size).toBe(2);
    expect(langfuseScores(outcome, context)).toEqual(scores);
    expect(langfuseScores(await outcomeOf(hostRun({ tools: checked('failed') })), context)).toMatchObject([
      { name: 'run-termination', value: 'completed' },
      { name: 'task-success', value: 0 },
    ]);
  });

  it('should leave task-success out when the rule cannot decide, and run-termination out for an unknown ending', async () => {
    expect(langfuseScores(await outcomeOf(hostRun({ termination: 'cancelled' })), context)).toMatchObject([
      { name: 'run-termination', value: 'cancelled' },
    ]);
    expect(langfuseScores(await outcomeOf(hostRun({ termination: 'unknown' })), context)).toEqual([]);
  });

  it("should write a resumed run's second outcome as a second run-termination on the same root", async () => {
    const failed = await outcomeOf(
      hostRun({
        termination: 'failed',
        ending: { source: row(8), at: at + 30_000, failure: { code: 'MODEL_ATTEMPT_PENDING', wrapped: undefined } },
      }),
    );
    const resumed = await outcomeOf(hostRun({ ending: { source: row(14), at: at + 90_000 } }));
    const [first] = langfuseScores(failed, context);
    const [second] = langfuseScores(resumed, context);

    expect(first).toMatchObject({ name: 'run-termination', value: 'failed' });
    expect(second).toMatchObject({ name: 'run-termination', value: 'completed' });
    expect(second?.id).not.toBe(first?.id);
    expect(second?.observationId).toBe(first?.observationId);
  });

  it('should write no score for a generation, a tool, a check or a settlement', async () => {
    const evidence = await projected(hostRun({ tools: checked('passed') }));

    expect(langfuseScores(await generation(), context)).toEqual([]);
    for (const kind of ['tool', 'cad'] as const) {
      expect(langfuseScores(evidence.find((item) => item.semantic.kind === kind)!, context)).toEqual([]);
    }
    expect(langfuseScores(await evidenceFixture(), context)).toEqual([]);
  });
});

describe('otlpBody', () => {
  it('should carry exactly the spans of one receipt, with no root riding along', async () => {
    const span = only(await generation());
    const body = JSON.parse(otlpBody([span])) as {
      resourceSpans: Array<{ scopeSpans: Array<{ scope: { version: string }; spans: unknown[] }> }>;
    };

    expect(body.resourceSpans).toHaveLength(1);
    expect(body.resourceSpans[0]!.scopeSpans[0]!.spans).toEqual([span]);
    expect(body.resourceSpans[0]!.scopeSpans[0]!.scope.version).toBe('langfuse-v5');
  });
});

describe('langfuseObservation v5: root and tool content from the host (LW6)', () => {
  const identity = { email: 'Jane.Fontaine@Example.com', name: 'Jane Fontaine' } as const;
  const withIdentity = { ...context, identity };
  const contentContext: ProjectionContext = {
    ...hostContext,
    host: 'browser',
    content: {
      since: at - 60_000,
      design: async () => [
        { path: 'main.ts', text: '// by Jane Fontaine <jane.fontaine@example.com>\ncube(10)', bytes: 55 },
      ],
    },
  };
  const contentRun = (change: Partial<ProjectedRun> = {}): ProjectedRun =>
    hostRun({
      tools: [
        {
          call: 'call-1',
          toolName: 'edit_file',
          outcome: 'completed',
          input: row(3),
          output: row(4),
          startedAt: at + 1000,
          settledAt: at + 3000,
          arguments: { targetFile: 'main.ts', author: 'Jane Fontaine', contact: 'jane.fontaine@example.com' },
          result: 'Wrote main.ts for Jane Fontaine; told bob@corp.io',
        },
        {
          call: 'call-2',
          toolName: 'test_model',
          outcome: 'completed',
          input: row(5),
          output: row(6),
          startedAt: at + 4000,
          settledAt: at + 5000,
          arguments: { targetFile: 'main.ts' },
          result: { tests: [] },
          check: { result: 'failed', revision: ['main.ts\u0000main.ts=sha256:x'], requirements: ['spec.ts#1'] },
        },
      ],
      finalRevision: 'rev-final',
      filesChanged: 1,
      priorTurns: 3,
      invocations: [{ purpose: 'generation', modelId: 'model-1' }],
      content: {
        prompt: 'I am Jane Fontaine: make a cube, mail jane.fontaine@example.com',
        reply: [{ type: 'text', text: 'Done, Jane Fontaine.' }],
        changedPaths: ['main.ts'],
      },
      ...change,
    });
  const projectedContent = async (run: ProjectedRun = contentRun()): Promise<Evidence[]> => {
    const { evidence } = await projectRun(run, contentContext);
    return [...evidence];
  };
  const json = (span: OtlpSpan, key: string): unknown => JSON.parse(String(attribute(span, key)));
  const mapped = (evidence: Evidence): OtlpSpan => {
    const { spans } = langfuseObservation(evidence, withIdentity, pseudonym)!;
    return spans[0]!;
  };

  it('should write a tool’s arguments in and result out, with emails but no name redacted', async () => {
    const [tool] = await projectedContent();
    const span = mapped(tool!);

    expect(span.name).toBe('edit_file');
    expect(json(span, 'langfuse.observation.input')).toEqual({
      targetFile: 'main.ts',
      author: 'Jane Fontaine',
      contact: '[email]',
    });
    expect(attribute(span, 'langfuse.observation.output')).toBe('Wrote main.ts for Jane Fontaine; told [email]');
    expect(metadata(span, 'plane')).toBe('content');
    expect(metadata(span, 'coverage_input')).toBe('redacted');
  });

  it('should keep only the size and digest of a tool result over the cap', async () => {
    const large = 'z'.repeat(70_000);
    const [tool] = await projectedContent(contentRun({ tools: [{ ...contentRun().tools[0]!, result: large }] }));
    const span = mapped(tool!);

    expect(attribute(span, 'langfuse.observation.output')).toBe('[tool result not kept: 70000 bytes]');
    expect(metadata(span, 'result_bytes')).toBe('70000');
    expect(metadata(span, 'result_digest')).toMatch(/^[a-f\d]{32}$/u);
    expect(otlpBody([span])).not.toContain(large);
  });

  it('should write the root’s message in, and its reply, design and checks out, redacting names only in prose', async () => {
    const evidence = await projectedContent();
    const outcome = evidence.find((item) => item.semantic.kind === 'outcome')!;
    const { spans } = langfuseObservation(outcome, withIdentity, pseudonym)!;
    const root = spans[0]!;

    expect(root.name).toBe(runRootName);
    expect(json(root, 'langfuse.observation.input')).toEqual({
      messages: [{ role: 'user', content: 'I am [name]: make a cube, mail [email]' }],
    });
    expect(json(root, 'langfuse.observation.output')).toEqual({
      role: 'assistant',
      content: 'Done, [name].',
      design: [{ path: 'main.ts', source: '// by Jane Fontaine <[email]>\ncube(10)' }],
      checks: ['test_model failed: spec.ts#1'],
    });
  });

  it('should write the root’s turn measures as metadata, with or without content', async () => {
    const summary = await outcomeOf(contentRun());
    const root = only(summary);

    expect(attribute(root, 'langfuse.observation.input')).toBeUndefined();
    expect(metadata(root, 'final_revision')).toMatch(/^[a-f\d]{32}$/u);
    expect(metadata(root, 'start_revision')).toBeUndefined();
    for (const [key, value] of [
      ['files_changed', '1'],
      ['checks_passed', '0'],
      ['checks_failed', '1'],
      ['prior_turns', '3'],
      ['model_calls', '1'],
      ['tool_calls', '2'],
      ['model', 'model-1'],
    ] as const) {
      expect(metadata(root, key)).toBe(value);
    }
    expect(metadata(root, 'host')).toBeUndefined();
    const evidence = await projectedContent();
    const withHost = evidence.find((item) => item.semantic.kind === 'outcome')!;
    expect(metadata(mapped(withHost), 'host')).toBe('browser');
  });

  it('should redact emails in a generation’s tool calls and results, never a name', async () => {
    const evidence = await providerContentEvidence(
      attempt({
        content: {
          input: {
            messages: [
              {
                role: 'tool',
                parts: [
                  {
                    kind: 'tool-result',
                    call: 'toolu_1',
                    error: false,
                    text: 'Jane Fontaine <jane.fontaine@example.com>',
                  },
                ],
              },
            ],
            context: { historyMessages: 0, history: null, system: null, tools: null },
            parameters: {},
          },
          output: [
            {
              role: 'assistant',
              parts: [
                {
                  kind: 'tool-call',
                  call: 'toolu_2',
                  name: 'edit_file',
                  text: '{"to":"bob@corp.io","by":"Jane Fontaine"}',
                },
              ],
            },
          ],
          truncated: false,
        },
      }),
      authority,
    );
    const span = mapped(evidence!);

    expect(json(span, 'langfuse.observation.input')).toMatchObject({
      messages: [{ role: 'tool', content: 'Jane Fontaine <[email]>' }],
    });
    expect(json(span, 'langfuse.observation.output')).toMatchObject({
      tool_calls: [{ function: { arguments: '{"to":"[email]","by":"Jane Fontaine"}' } }],
    });
  });
});
