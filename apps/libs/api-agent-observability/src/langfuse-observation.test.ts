/* eslint-disable @typescript-eslint/naming-convention -- Langfuse usage keys use snake_case. */
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Evidence } from '@taucad/agent-observability/contract';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import type { ProjectedRun, ProjectionContext } from '@taucad/agent-observability/projection';
import { projectRun } from '@taucad/agent-observability/projection';
import { evidenceFixture, privateMarker } from '#testing/evidence.fixture.js';
import {
  exportableEvidence,
  langfuseObservation,
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
import { settlementEvidence } from '#settlement-evidence.js';

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

    expect(span.name).toBe('call-tool');
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

  it('should keep a settlement a tau.financial span under its run root until it moves onto the generation', async () => {
    const settlement = await settlementEvidence(
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
        receipt: { terminalRevision: 1n, chargedAtoms: 1500n, supplierCostPicoUsd: null, resolvedAt: new Date(at + 1) },
        normalization: undefined,
      },
      'user-a',
      { ...authority, project: 'project-a' },
    );
    const span = only(settlement);

    expect(evidenceSchema.safeParse(settlement).success).toBe(true);
    expect(span.name).toBe('tau.financial');
    expect(span.parentSpanId).toBe(runRootSpanId('staging', 'user-a', 'run-1'));
    expect(metadata(span, 'fact.kind')).toBe('financial');
    expect(metadata(span, 'fact.ledger')).toMatch(/^[a-f\d]{32}$/u);
    expect(metadata(span, 'fact.credits')).toBeDefined();
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
