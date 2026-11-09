import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Evidence } from '@taucad/agent-observability/contract';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import { evidenceFixture, privateMarker } from '#testing/evidence.fixture.js';
import {
  langfuseObservation,
  observationIdentity,
  observationSpanId,
  otlpBody,
  pseudonymKey,
  runRootName,
  runRootSpan,
  runRootSpanId,
} from '#langfuse-observation.js';
import type { OtlpSpan } from '#langfuse-observation.js';
import { providerAttemptEvidence } from '#model-invocation-evidence.js';
import type { ObservedAttempt } from '#model-invocation-evidence.js';
import { settlementEvidence } from '#settlement-evidence.js';

const pseudonym = pseudonymKey(Uint8Array.from(randomBytes(32)));
const context = { environment: 'staging', receipt: 'evr_1', protection: 'pro' } as const;

const attribute = (span: OtlpSpan, key: string): unknown => {
  const found = span.attributes.find((item) => item.key === key);
  return found === undefined ? undefined : Object.values(found.value)[0];
};

describe('langfuseObservation', () => {
  it('should name the same observation for every attempt and a read without the payload', async () => {
    const evidence = await evidenceFixture();
    const first = langfuseObservation(evidence, context, pseudonym);
    const again = langfuseObservation(evidence, context, pseudonym);

    expect(again.span).toEqual(first.span);
    expect(first.identity).toEqual(observationIdentity('staging', evidence, 'evr_1'));
    expect(first.identity.spanId).toBe(observationSpanId('staging', 'evr_1'));
    expect(first.identity.traceId).toMatch(/^[a-f\d]{32}$/u);
    expect(first.identity.spanId).toMatch(/^[a-f\d]{16}$/u);
    expect(observationSpanId('production', 'evr_1')).not.toBe(first.identity.spanId);
  });

  it('should group one run under one trace and never send the account, project or run ids', async () => {
    const evidence = await evidenceFixture({ principal: 'user-secret-id', project: 'project-secret-id' });
    const other = await evidenceFixture({ principal: 'user-secret-id', project: 'project-secret-id', sequence: 8 });
    const { span } = langfuseObservation(evidence, context, pseudonym);
    const body = otlpBody(span);

    expect(langfuseObservation(other, { ...context, receipt: 'evr_2' }, pseudonym).identity.traceId).toBe(span.traceId);
    expect(body).not.toContain('user-secret-id');
    expect(body).not.toContain('project-secret-id');
    expect(body).not.toContain('run-a');
    expect(attribute(span, 'langfuse.user.id')).toMatch(/^[a-f\d]{32}$/u);
    expect(attribute(span, 'langfuse.observation.metadata.protection')).toBe('pro');
    expect(attribute(span, 'langfuse.environment')).toBe('staging');
  });

  it('should keep content out of a summary observation and put it in the input of a content one', async () => {
    const summary = langfuseObservation(await evidenceFixture(), context, pseudonym);
    const content = langfuseObservation(await evidenceFixture({ plane: 'content' }), context, pseudonym);

    expect(otlpBody(summary.span)).not.toContain(privateMarker);
    expect(attribute(summary.span, 'langfuse.observation.metadata.fact.mode')).toBe('initial');
    expect(String(attribute(content.span, 'langfuse.observation.input'))).toContain(privateMarker);
    expect(attribute(content.span, 'langfuse.observation.output')).toBeUndefined();
  });

  it('should send a rating as its closed fields, with no input or output', async () => {
    const { span } = langfuseObservation(await evidenceFixture({ plane: 'feedback' }), context, pseudonym);

    expect(attribute(span, 'langfuse.observation.metadata.plane')).toBe('feedback');
    expect(attribute(span, 'langfuse.observation.metadata.fact.value')).toBe('negative');
    expect(attribute(span, 'langfuse.observation.metadata.fact.scale')).toBe('thumbs.1');
    expect(attribute(span, 'langfuse.observation.metadata.fact.evidence')).toMatch(/^[a-f\d]{32}$/u);
    expect(otlpBody(span)).not.toContain('presented-1');
    expect(attribute(span, 'langfuse.observation.input')).toBeUndefined();
    expect(otlpBody(span)).not.toContain(privateMarker);
  });

  it('should name the attempt and time each closed phase per clock domain, with no raw ids', async () => {
    const evidence = await evidenceFixture();
    const timed = {
      ...evidence,
      clocks: {
        ...evidence.clocks,
        intervals: [
          { phase: 'tool', domain: 'host-recorded', start: 0, end: 10 },
          { phase: 'tool', domain: 'host-recorded', start: 5, end: 20 },
          { phase: 'provider-wait', domain: 'api-recorded', start: 0, end: 7 },
          { phase: 'tool', domain: 'host-recorded', start: 30, end: null },
        ],
      },
    } satisfies typeof evidence;
    const { span } = langfuseObservation(timed, context, pseudonym);
    const resumed = langfuseObservation(
      { ...timed, execution: { ...timed.execution, attempt: 'attempt-b' } },
      { ...context, receipt: 'evr_2' },
      pseudonym,
    ).span;

    expect(attribute(span, 'langfuse.observation.metadata.mapper')).toBe('langfuse-v4.3');
    expect(attribute(span, 'langfuse.observation.metadata.phase.tool@host-recorded')).toBe('20');
    expect(attribute(span, 'langfuse.observation.metadata.phase.provider-wait@api-recorded')).toBe('7');
    expect(attribute(span, 'langfuse.observation.metadata.openIntervals')).toBe('1');
    expect(JSON.parse(String(attribute(span, 'langfuse.observation.metadata.intervals')))).toEqual([
      ['tool', 'host-recorded', 0, 10],
      ['tool', 'host-recorded', 5, 20],
      ['provider-wait', 'api-recorded', 0, 7],
      ['tool', 'host-recorded', 30, null],
    ]);
    expect(attribute(span, 'langfuse.observation.metadata.attempt')).toMatch(/^[a-f\d]{32}$/u);
    expect(attribute(resumed, 'langfuse.observation.metadata.attempt')).not.toBe(
      attribute(span, 'langfuse.observation.metadata.attempt'),
    );
    expect(attribute(resumed, 'langfuse.observation.metadata.run')).toBe(
      attribute(span, 'langfuse.observation.metadata.run'),
    );
    expect(otlpBody(span)).not.toContain('attempt-a');
    expect(attribute(span, 'langfuse.observation.metadata.source')).toMatch(/^[a-f\d]{32}$/u);
    expect(attribute(resumed, 'langfuse.observation.metadata.semantic')).toBe(
      attribute(span, 'langfuse.observation.metadata.semantic'),
    );

    const apiOnly = langfuseObservation(
      { ...timed, versions: { ...timed.versions, hostBuild: null, apiBuild: 'api-build-1' } },
      context,
      pseudonym,
    ).span;
    expect(attribute(apiOnly, 'langfuse.release')).toBe('api-build-1');
  });

  it('should send one fact per request body, first, then its run root', async () => {
    const { span } = langfuseObservation(await evidenceFixture(), context, pseudonym);
    const body = JSON.parse(otlpBody(span)) as { resourceSpans: Array<{ scopeSpans: Array<{ spans: unknown[] }> }> };

    expect(body.resourceSpans).toHaveLength(1);
    expect(body.resourceSpans[0]!.scopeSpans[0]!.spans).toEqual([span, runRootSpan(span)]);
  });
});

const milliseconds = (nanoseconds: string): number => Number(BigInt(nanoseconds) / 1_000_000n);
const imageReference = 'registry.fly.io/tau-api-staging:deployment-01KSYNTHETIC';
const attempt: ObservedAttempt = {
  principal: 'user-a',
  project: 'project-a',
  attemptKey: 'run-1:1:0',
  chat: 'chat-1',
  surface: 'gateway',
  wire: 'anthropic',
  requestedModel: 'anthropic-claude-test',
  provider: 'anthropic',
  operation: 'op-1',
  startedAt: 1_800_000_000_000,
  duration: 107_481,
  stream: {
    stop: 'toolUse',
    usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, reasoning: null, missing: 'none' },
    resolvedModel: 'anthropic-claude-test',
    response: 'response-1',
    firstChunk: 400,
    firstText: 650,
  },
  ended: 'completed',
};
const authority = { policyEpoch: 'epoch-a', protection: 'pro' } as const;

const outcome = async (
  fact: Partial<Extract<Evidence['payload'], { plane: 'summary' }>['fact']>,
): Promise<Evidence> => {
  const base = await evidenceFixture();
  return evidenceSchema.parse({
    ...base,
    semantic: { kind: 'outcome', id: 'run-1' },
    payload: {
      plane: 'summary',
      fact: { kind: 'outcome', termination: 'failed', success: 'unknown', assessment: null, ...fact },
    },
  });
};

describe('langfuseObservation run structure (W5)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should hang a provider span under its run root, timed by its relay phases', async () => {
    vi.stubEnv('FLY_IMAGE_REF', imageReference);
    const evidence = await providerAttemptEvidence(attempt, authority);
    const { span } = langfuseObservation(evidence, context, pseudonym);
    const start = milliseconds(span.startTimeUnixNano);
    const end = milliseconds(span.endTimeUnixNano);
    const wait = Number(attribute(span, 'langfuse.observation.metadata.phase.provider-wait@api-relay'));
    const stream = Number(attribute(span, 'langfuse.observation.metadata.phase.provider-stream@api-relay'));
    const completionStart = Date.parse(String(attribute(span, 'langfuse.observation.completion_start_time')));

    expect(evidenceSchema.safeParse(evidence).success).toBe(true);
    expect(span.parentSpanId).toBe(runRootSpanId('staging', 'user-a', evidence.run));
    expect(start).toBe(attempt.startedAt);
    expect(end - completionStart).toBe(stream);
    expect(completionStart - start).toBe(wait);
    expect(end - start).toBe(attempt.duration);
    expect(attribute(span, 'langfuse.observation.level')).toBeUndefined();
    expect(attribute(span, 'langfuse.release')).toBe('tau-api-staging:deployment-01KSYNTHETIC');
  });

  it('should time a tool span by its host-recorded interval and give it the same root', async () => {
    const base = await evidenceFixture();
    const tool = evidenceSchema.parse({
      ...base,
      semantic: { kind: 'tool', id: 'call-1' },
      clocks: {
        ...base.clocks,
        occurredAt: 1_800_000_000_000,
        intervals: [{ phase: 'tool', domain: 'host-recorded', start: 1_800_000_000_000, end: 1_800_000_065_644 }],
      },
      payload: {
        plane: 'summary',
        fact: {
          kind: 'tool',
          call: 'call-1',
          dispatch: 'dispatch-1',
          toolClass: 'other',
          toolVersion: null,
          schemaVersion: null,
          modelCall: null,
          outcome: 'completed',
          revisionBefore: null,
          revisionAfter: null,
        },
      },
    });
    const { span } = langfuseObservation(tool, context, pseudonym);
    const instruction = langfuseObservation(base, { ...context, receipt: 'evr_2' }, pseudonym).span;

    expect(milliseconds(span.endTimeUnixNano) - milliseconds(span.startTimeUnixNano)).toBe(
      Number(attribute(span, 'langfuse.observation.metadata.phase.tool@host-recorded')),
    );
    expect(milliseconds(span.endTimeUnixNano) - milliseconds(span.startTimeUnixNano)).toBe(65_644);
    expect(span.parentSpanId).toBe(instruction.parentSpanId);
    expect(instruction.startTimeUnixNano).toBe(instruction.endTimeUnixNano);
  });

  it('should send one fixed, grouping-only root per run that a scorecard read never counts', async () => {
    const first = langfuseObservation(await evidenceFixture(), context, pseudonym).span;
    const second = langfuseObservation(await outcome({}), { ...context, receipt: 'evr_2' }, pseudonym).span;
    const otherRun = langfuseObservation(
      { ...(await evidenceFixture()), run: 'run-b' },
      { ...context, receipt: 'evr_3' },
      pseudonym,
    ).span;
    const rootOf = (span: OtlpSpan): OtlpSpan => runRootSpan(span)!;

    expect(rootOf(first).spanId).toBe(rootOf(second).spanId);
    expect(rootOf(first).attributes).toEqual(rootOf(second).attributes);
    expect(rootOf(otherRun).spanId).not.toBe(rootOf(first).spanId);
    expect(rootOf(first).parentSpanId).toBeUndefined();
    expect(rootOf(first).traceId).toBe(first.traceId);
    expect(rootOf(first).name).toBe(runRootName);
    expect(rootOf(first).name.startsWith('tau.')).toBe(false);
    expect(attribute(rootOf(first), 'langfuse.release')).toBeUndefined();
    expect(attribute(rootOf(first), 'langfuse.observation.metadata.root')).toBe(true);
    expect(runRootSpan(rootOf(first))).toBeUndefined();
    expect(otlpBody(first)).not.toContain('run-a');
  });

  it('should mark a failed outcome ERROR and name its failure class', async () => {
    const { span } = langfuseObservation(
      await outcome({ failureClass: { owner: 'host', retry: 'wait' }, code: 'MODEL_ATTEMPT_PENDING' }),
      context,
      pseudonym,
    );
    const message = 'run failed: MODEL_ATTEMPT_PENDING (owner host, retry wait)';

    expect(attribute(span, 'langfuse.observation.level')).toBe('ERROR');
    expect(attribute(span, 'langfuse.observation.status_message')).toBe(message);
    expect(span.status).toEqual({ code: 2, message });
    expect(attribute(span, 'langfuse.observation.metadata.fact.failureClass.owner')).toBe('host');
    expect(attribute(span, 'langfuse.observation.metadata.fact.failureClass.retry')).toBe('wait');
    expect(attribute(span, 'langfuse.observation.metadata.fact.code')).toBe('MODEL_ATTEMPT_PENDING');
  });

  it('should mark an older host failed outcome ERROR as unclassified, and leave a completed one DEFAULT', async () => {
    const legacy = langfuseObservation(await outcome({}), context, pseudonym).span;
    const completed = langfuseObservation(await outcome({ termination: 'completed' }), context, pseudonym).span;

    expect(attribute(legacy, 'langfuse.observation.level')).toBe('ERROR');
    expect(attribute(legacy, 'langfuse.observation.status_message')).toBe('run failed: unclassified');
    expect(attribute(completed, 'langfuse.observation.level')).toBeUndefined();
    expect(completed.status).toEqual({ code: 1 });
  });

  it('should report a real release on both planes and never 0000000', async () => {
    vi.stubEnv('FLY_IMAGE_REF', imageReference);
    const host = await evidenceFixture();
    const release = (evidence: Evidence): unknown =>
      attribute(langfuseObservation(evidence, context, pseudonym).span, 'langfuse.release');
    const settlement = await settlementEvidence(
      {
        operation: {
          id: 'op-1',
          accountId: 'account-1',
          environment: 'staging',
          attemptKey: 'run-1:1:0',
          projectHint: 'project-a',
          chatHint: 'chat-1',
          admittedAt: new Date(attempt.startedAt),
          activationId: 'activation-1',
        },
        receipt: {
          terminalRevision: 1n,
          chargedAtoms: 0n,
          supplierCostPicoUsd: null,
          resolvedAt: new Date(attempt.startedAt + 1000),
        },
        normalization: undefined,
      },
      'user-a',
      { ...authority, project: 'project-a' },
    );

    expect(release({ ...host, versions: { ...host.versions, hostBuild: 'abc1234' } })).toBe('abc1234');
    expect(release({ ...host, versions: { ...host.versions, hostBuild: '0000000' } })).toBe('unknown');
    expect(release(await providerAttemptEvidence(attempt, authority))).toBe('tau-api-staging:deployment-01KSYNTHETIC');
    expect(evidenceSchema.safeParse(settlement).success).toBe(true);
    expect(release(settlement)).toBe('tau-api-staging:deployment-01KSYNTHETIC');
  });
});
