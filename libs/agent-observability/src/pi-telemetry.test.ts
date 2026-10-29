import { describe, it, expect, vi } from 'vitest';
import { BasicTracerProvider, InMemorySpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { Tracer, Meter } from '@opentelemetry/api';
import { telemetryFixture } from '#telemetry.test-fixture.js';
import { createPiTelemetry } from '#pi-telemetry.js';
import { piTelemetryPolicy, telemetryLimits } from '#telemetry-policy.js';

describe('production policy and isolation', () => {
  it('should remain off by default without invoking a backend', async () => {
    const start = vi.fn(() => {
      throw new Error('backend must not be touched');
    });
    const tracer: Tracer = { startSpan: start, startActiveSpan: start };
    const adapter = createPiTelemetry({ tracer });
    const value = {};
    expect(await adapter.context.startSpan({ name: 'pi.ai.request' }, () => value)).toBe(value);
    expect(start).not.toHaveBeenCalled();
    adapter.stop();
  });
  it('should suppress proprietary metadata, errors, arbitrary signals and snapshot policy changes', async () => {
    const policy = structuredClone(piTelemetryPolicy);
    await using fixture = await telemetryFixture(policy);
    Object.assign(policy.spans, Object.fromEntries([['PRIVATE_SPAN', {}]]));
    await fixture.context.startSpan(
      {
        name: 'pi.ai.request',
        attributes: {
          provider: 'PRIVATE_PROVIDER',
          model: 'PRIVATE_MODEL',
          'usage.input': 7,
          'usage.output': Number.NaN,
        },
      },
      (span) => {
        span.setStatus({ status: 'error', error: { name: 'PRIVATE_NAME', message: 'PRIVATE_MESSAGE' } });
        span.addEvent('pi.ai.block', { type: 'tool_call', tool: 'PRIVATE_TOOL', chars: 4, index: 0 });
        span.addEvent('PRIVATE_EVENT');
        fixture.metrics.counter('pi.ai.tokens').add(7, { kind: 'input', provider: 'PRIVATE_PROVIDER' });
      },
    );
    await fixture.context.startSpan({ name: 'PRIVATE_SPAN' }, () => 1);
    const spans = await fixture.getSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes).toEqual({ 'usage.input': 7 });
    expect(spans[0]?.status).toEqual({ status: 'error' });
    expect(JSON.stringify([spans, await fixture.getMetrics!()])).not.toContain('PRIVATE');
  });
  it('should preserve one synchronous callback and rejection identity when recording throws', async () => {
    const backend = new BasicTracerProvider();
    const tracer = backend.getTracer('fault');
    vi.spyOn(tracer, 'startSpan').mockImplementation(() => {
      throw new Error('PRIVATE');
    });
    const adapter = createPiTelemetry({ tracer, enabled: true });
    let calls = 0;
    const error = new Error('application failure');
    const result = adapter.context.startSpan({ name: 'pi.ai.request' }, () => {
      calls++;
      throw error;
    });
    expect(calls).toBe(1);
    await expect(result).rejects.toBe(error);
    expect(adapter.stats().failures).toBe(1);
    adapter.stop();
    await backend.shutdown();
  });
  it('should keep last explicit status even when OTel would otherwise lock OK', async () => {
    await using fixture = await telemetryFixture();
    await fixture.context.startSpan({ name: 'success' }, (span) => {
      span.setStatus({ status: 'ok' });
      span.setStatus({ status: 'error' });
    });
    const spans = await fixture.getSpans();
    expect(spans[0]?.status).toEqual({ status: 'error' });
  });
  it('should bound active spans, release admission after settlement and stop without waiting for callbacks', async () => {
    await using fixture = await telemetryFixture();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const pending = Array.from({ length: telemetryLimits.active + 1 }, async () =>
      fixture.context.startSpan({ name: 'success' }, async () => {
        calls++;
        await gate;
      }),
    );
    expect(calls).toBe(telemetryLimits.active + 1);
    expect(fixture.adapter.stats()).toMatchObject({ active: telemetryLimits.active, dropped: 1 });
    fixture.adapter.stop();
    expect(fixture.adapter.stats().active).toBe(0);
    expect(fixture.exporter.getFinishedSpans()).toHaveLength(telemetryLimits.active);
    expect(
      fixture.exporter
        .getFinishedSpans()
        .every((span) => span.attributes['tau.telemetry.completeness'] === 'truncated'),
    ).toBe(true);
    release!();
    await Promise.all(pending);
    expect(fixture.exporter.getFinishedSpans()).toHaveLength(telemetryLimits.active);
  });
  it('should expire telemetry while leaving a never-settling application independent', async () => {
    vi.useFakeTimers();
    try {
      await using fixture = await telemetryFixture();
      let release: (() => void) | undefined;
      const result = fixture.context.startSpan(
        { name: 'success' },
        async () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      await vi.advanceTimersByTimeAsync(telemetryLimits.lifetime);
      expect(fixture.adapter.stats()).toMatchObject({ active: 0, expired: 1 });
      expect(fixture.exporter.getFinishedSpans()[0]?.attributes['tau.telemetry.completeness']).toBe('truncated');
      release!();
      await result;
    } finally {
      vi.useRealTimers();
    }
  });
  it('should cap event/link work and reject malformed propagation without baggage', async () => {
    await using fixture = await telemetryFixture();
    await fixture.context.startSpan({ name: 'success' }, (span) => {
      for (let index = 0; index < telemetryLimits.events + 1; index++) {
        span.addEvent('first', { index });
      }
      for (let index = 0; index < telemetryLimits.links + 1; index++) {
        span.addLink({ context: span });
      }
    });
    const initialSpans = await fixture.getSpans();
    const span = initialSpans[0]!;
    expect(span.events).toHaveLength(telemetryLimits.events);
    expect(span.links).toHaveLength(telemetryLimits.links);
    await Promise.all(
      ['00-' + '0'.repeat(32) + '-' + '1'.repeat(16) + '-01', 'bad', 'f'.repeat(1000)].map(async (traceparent) =>
        fixture.propagation.extract({ traceparent, baggage: 'PRIVATE' }).startSpan({ name: 'success' }, () => 0),
      ),
    );
    const spans = await fixture.getSpans();
    expect(spans.slice(1).every((item) => item.parentContext === null)).toBe(true);
    expect(JSON.stringify(await fixture.getSpans())).not.toContain('PRIVATE');
  });
  it('should complete application work while an exporter never acknowledges', async () => {
    const exporter = new InMemorySpanExporter();
    const exportCall = vi.spyOn(exporter, 'export').mockImplementation(() => undefined);
    const provider = new BasicTracerProvider({
      spanProcessors: [
        new BatchSpanProcessor(exporter, {
          maxQueueSize: 2,
          maxExportBatchSize: 1,
          scheduledDelayMillis: 1,
          exportTimeoutMillis: 10,
        }),
      ],
    });
    const adapter = createPiTelemetry({ tracer: provider.getTracer('stalled'), enabled: true });
    const results = await Promise.all(
      Array.from({ length: 8 }, async (_, index) => adapter.context.startSpan({ name: 'pi.ai.request' }, () => index)),
    );
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    adapter.stop();
    await expect(provider.shutdown()).rejects.toThrow('Timeout');
    expect(exportCall).toHaveBeenCalled();
  });
});

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])('should separate trace=%s from operational metric=%s permission', async (enabled, metricsEnabled) => {
  await using fixture = await telemetryFixture();
  const meter = { createCounter: vi.fn(() => ({ add: vi.fn() })) };
  const adapter = createPiTelemetry({
    tracer: fixture.provider.getTracer('permissions'),
    meter: meter as unknown as Meter,
    enabled,
    metricsEnabled,
  });
  await adapter.context.startSpan({ name: 'pi.ai.request' }, () => {
    adapter.context.metrics!.counter('pi.ai.tokens').add(1, { kind: 'input' });
  });
  expect(fixture.exporter.getFinishedSpans()).toHaveLength(enabled ? 1 : 0);
  expect(meter.createCounter).toHaveBeenCalledTimes(metricsEnabled ? 1 : 0);
  adapter.stop();
});

it('should isolate throwing span mutations and metric recording from application results', async () => {
  const provider = new BasicTracerProvider();
  const tracer = provider.getTracer('throwing-recording');
  const start = tracer.startSpan.bind(tracer);
  vi.spyOn(tracer, 'startSpan').mockImplementation((...args) => {
    const span = start(...args);
    for (const method of ['setAttributes', 'addEvent', 'setStatus', 'end'] as const) {
      vi.spyOn(span, method).mockImplementation(() => {
        throw new Error('PRIVATE');
      });
    }
    return span;
  });
  const meter = {
    createCounter: vi.fn(() => {
      throw new Error('PRIVATE');
    }),
  };
  const adapter = createPiTelemetry({
    tracer,
    meter: meter as unknown as Meter,
    enabled: true,
    metricsEnabled: true,
  });
  const value = {};
  expect(
    await adapter.context.startSpan({ name: 'pi.ai.request' }, (span) => {
      span.setAttributes({ 'usage.input': 1 });
      span.addEvent('pi.ai.first_chunk');
      span.metrics!.counter('pi.ai.tokens').add(1);
      return value;
    }),
  ).toBe(value);
  expect(adapter.stats()).toMatchObject({ active: 0, failures: 5 });
  adapter.stop();
  await provider.shutdown();
});

it('should freeze permissions and recover bounded admission after normal settlement', async () => {
  await using fixture = await telemetryFixture();
  const options = { tracer: fixture.provider.getTracer('frozen'), enabled: false };
  const adapter = createPiTelemetry(options);
  options.enabled = true;
  await adapter.context.startSpan({ name: 'pi.ai.request' }, () => 1);
  expect(fixture.exporter.getFinishedSpans()).toHaveLength(0);
  adapter.stop();
  await fixture.context.startSpan({ name: 'success' }, async (span) => {
    const descend = async (depth: number, context: typeof span): Promise<void> => {
      if (depth <= telemetryLimits.depth) {
        await context.startSpan({ name: 'success' }, async (child) => descend(depth + 1, child));
      }
    };
    await descend(1, span);
  });
  expect(fixture.adapter.stats()).toMatchObject({ active: 0, dropped: 1 });
  expect(fixture.exporter.getFinishedSpans()).toHaveLength(telemetryLimits.depth);
  await fixture.context.startSpan({ name: 'success' }, () => 1);
  expect(fixture.exporter.getFinishedSpans()).toHaveLength(telemetryLimits.depth + 1);
});

it('should preserve error status while suppressing inherited error-name lookups', async () => {
  await using fixture = await telemetryFixture(piTelemetryPolicy);
  await fixture.context.startSpan({ name: 'pi.ai.request' }, (span) => {
    span.setStatus({ status: 'error', error: { name: 'constructor', message: 'PRIVATE' } });
  });
  const spans = await fixture.getSpans();
  expect(spans[0]?.status).toEqual({ status: 'error' });
  expect(fixture.adapter.stats().failures).toBe(0);
  expect(JSON.stringify(spans)).not.toContain('PRIVATE');
});
