import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { evidenceFixture, privateMarker } from '#api/agent-observability/evidence.test-fixture.js';
import {
  langfuseObservation,
  observationIdentity,
  observationSpanId,
  otlpBody,
  pseudonymKey,
} from '#api/agent-observability/langfuse-observation.js';
import type { OtlpSpan } from '#api/agent-observability/langfuse-observation.js';

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

    expect(attribute(span, 'langfuse.observation.metadata.mapper')).toBe('langfuse-v4.2');
    expect(attribute(span, 'langfuse.observation.metadata.phase.tool@host-recorded')).toBe('20');
    expect(attribute(span, 'langfuse.observation.metadata.phase.provider-wait@api-recorded')).toBe('7');
    expect(attribute(span, 'langfuse.observation.metadata.openIntervals')).toBe('1');
    expect(attribute(span, 'langfuse.observation.metadata.attempt')).toMatch(/^[a-f\d]{32}$/u);
    expect(attribute(resumed, 'langfuse.observation.metadata.attempt')).not.toBe(
      attribute(span, 'langfuse.observation.metadata.attempt'),
    );
    expect(attribute(resumed, 'langfuse.observation.metadata.run')).toBe(
      attribute(span, 'langfuse.observation.metadata.run'),
    );
    expect(otlpBody(span)).not.toContain('attempt-a');
  });

  it('should send one span per request body', async () => {
    const { span } = langfuseObservation(await evidenceFixture(), context, pseudonym);
    const body = JSON.parse(otlpBody(span)) as { resourceSpans: Array<{ scopeSpans: Array<{ spans: unknown[] }> }> };

    expect(body.resourceSpans).toHaveLength(1);
    expect(body.resourceSpans[0]!.scopeSpans[0]!.spans).toEqual([span]);
  });
});
