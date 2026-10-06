import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import type { SpanHandle } from '#types/runtime-tracer.types.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

describe('RuntimeTracer', () => {
  let measureSpy: MockInstance<typeof performance.measure>;

  beforeEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
    measureSpy = vi.spyOn(performance, 'measure');
  });

  afterEach(() => {
    measureSpy.mockRestore();
  });

  it('emits completed spans directly without touching the Performance Timeline by default', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    tracer.setEntrySink((entry) => {
      entries.push(entry);
    });

    tracer.startSpan('test.operation').end();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'test.operation',
      detail: { spanId: '0', parentSpanId: undefined },
      workerTimeOrigin: performance.timeOrigin,
    });
    expect(entries[0]!.duration).toBeGreaterThanOrEqual(0);
    expect(performance.getEntriesByType('mark')).toHaveLength(0);
    expect(measureSpy).not.toHaveBeenCalled();
  });

  it('preserves parent-child IDs and merged attributes', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    tracer.setEntrySink((entry) => {
      entries.push(entry);
    });
    const outer = tracer.startSpan('outer', { file: 'main.ts', count: 42 });
    const inner = tracer.startSpan('inner');

    inner.end();
    outer.end({ count: 43, result: 'ok' });

    expect(entries[0]).toMatchObject({ name: 'inner', detail: { spanId: '1', parentSpanId: '0' } });
    expect(entries[1]).toMatchObject({
      name: 'outer',
      detail: {
        spanId: '0',
        parentSpanId: undefined,
        file: 'main.ts',
        count: 43,
        result: 'ok',
      },
    });
    // The DevTools track payload is meaningful only as `performance.measure` detail
    // and every entry consumer strips it; building it per span cost 57 % of span CPU
    // and 45 % of the wire bytes, so it must not reach the entry sink.
    expect(entries[1]!.detail).not.toHaveProperty('devtools');
    expect(entries[0]!.detail).not.toHaveProperty('devtools');
  });

  it('mirrors uniquely named measures only when DevTools telemetry is enabled', () => {
    const tracer = new RuntimeTracer();
    tracer.setDevtoolsTimelineEnabled(true);

    tracer.startSpan('kernel.render').end();

    expect(measureSpy).toHaveBeenCalledOnce();
    const [name, options] = measureSpy.mock.calls[0]!;
    expect(name).toBe('tau:kernel.render:0:0');
    if (options === undefined || typeof options === 'string') {
      throw new TypeError('Expected PerformanceMeasureOptions');
    }
    expect(typeof options.start).toBe('number');
    expect(typeof options.duration).toBe('number');
    expect(options.detail).toMatchObject({
      spanId: '0',
      devtools: { dataType: 'track-entry', track: 'Kernel Pipeline', trackGroup: 'Tau' },
    });
  });

  it('keeps a live descendant when its ancestor ends first without reviving that ancestor', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    tracer.setEntrySink((entry) => entries.push(entry));
    const outer = tracer.startSpan('outer');
    const inner = tracer.startSpan('inner');

    outer.end();
    tracer.startSpan('inner-child').end();
    inner.end();
    tracer.startSpan('next-operation').end();

    expect(entries.map(({ name, detail }) => ({ name, detail }))).toEqual([
      { name: 'outer', detail: { spanId: '0', parentSpanId: undefined } },
      { name: 'inner-child', detail: { spanId: '2', parentSpanId: '1' } },
      { name: 'inner', detail: { spanId: '1', parentSpanId: '0' } },
      { name: 'next-operation', detail: { spanId: '3', parentSpanId: undefined } },
    ]);
  });

  it('returns to the nearest still-open ancestor after an intermediate scope ends first', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    tracer.setEntrySink((entry) => entries.push(entry));
    const outer = tracer.startSpan('outer');
    const middle = tracer.startSpan('middle');
    const inner = tracer.startSpan('inner');

    middle.end();
    tracer.startSpan('inner-child').end();
    inner.end();
    tracer.startSpan('outer-child').end();
    outer.end();
    tracer.startSpan('next-operation').end();

    expect(entries.map(({ name, detail }) => ({ name, detail }))).toEqual([
      { name: 'middle', detail: { spanId: '1', parentSpanId: '0' } },
      { name: 'inner-child', detail: { spanId: '3', parentSpanId: '2' } },
      { name: 'inner', detail: { spanId: '2', parentSpanId: '1' } },
      { name: 'outer-child', detail: { spanId: '4', parentSpanId: '0' } },
      { name: 'outer', detail: { spanId: '0', parentSpanId: undefined } },
      { name: 'next-operation', detail: { spanId: '5', parentSpanId: undefined } },
    ]);
  });

  it('keeps fresh ancestry when reset scopes finish during a new operation', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    tracer.setEntrySink((entry) => entries.push(entry));
    const staleOuter = tracer.startSpan('stale-outer');
    const staleInner = tracer.startSpan('stale-inner');

    tracer.reset();
    const fresh = tracer.startSpan('fresh');
    staleOuter.end();
    staleInner.end();
    tracer.startSpan('fresh-child').end();
    fresh.end();
    tracer.startSpan('next-operation').end();

    expect(entries.map(({ name, detail }) => ({ name, detail }))).toEqual([
      { name: 'fresh-child', detail: { spanId: '3', parentSpanId: '2' } },
      { name: 'fresh', detail: { spanId: '2', parentSpanId: undefined } },
      { name: 'next-operation', detail: { spanId: '4', parentSpanId: undefined } },
    ]);
  });

  it('does not parent sink-started work to a completed span or clobber its live scope', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    let sinkSpan: SpanHandle | undefined;
    tracer.setEntrySink((entry) => {
      entries.push(entry);
      if (entry.name === 'completed') {
        sinkSpan = tracer.startSpan('sink');
      }
    });

    tracer.startSpan('completed').end();
    tracer.startSpan('sink-child').end();
    if (sinkSpan === undefined) {
      throw new TypeError('Expected the entry sink to start a span');
    }
    sinkSpan.end();
    tracer.startSpan('next-operation').end();

    expect(entries.map(({ name, detail }) => ({ name, detail }))).toEqual([
      { name: 'completed', detail: { spanId: '0', parentSpanId: undefined } },
      { name: 'sink-child', detail: { spanId: '2', parentSpanId: '1' } },
      { name: 'sink', detail: { spanId: '1', parentSpanId: undefined } },
      { name: 'next-operation', detail: { spanId: '3', parentSpanId: undefined } },
    ]);
  });

  it('drops stale spans after reset without clearing unrelated timeline entries', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    tracer.setEntrySink((entry) => entries.push(entry));
    const stale = tracer.startSpan('stale');
    const clearMarksSpy = vi.spyOn(performance, 'clearMarks');
    const clearMeasuresSpy = vi.spyOn(performance, 'clearMeasures');

    tracer.reset();
    stale.end();
    tracer.startSpan('fresh').end();

    expect(entries.map((entry) => entry.name)).toEqual(['fresh']);
    expect(clearMarksSpy).not.toHaveBeenCalled();
    expect(clearMeasuresSpy).not.toHaveBeenCalled();
    clearMarksSpy.mockRestore();
    clearMeasuresSpy.mockRestore();
  });

  it('ends each span at most once', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    tracer.setEntrySink((entry) => entries.push(entry));
    const span = tracer.startSpan('single-end');

    span.end({ success: true });
    span.end({ success: false });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.detail).toMatchObject({ success: true });
  });

  it('keeps telemetry sink failures out of operation outcomes and span ancestry', () => {
    const entries: TelemetryEntry[] = [];
    const tracer = new RuntimeTracer();
    tracer.setEntrySink(() => {
      throw new Error('telemetry unavailable');
    });

    expect(() => {
      tracer.startSpan('failed-telemetry').end();
    }).not.toThrow();
    tracer.setEntrySink((entry) => {
      entries.push(entry);
    });
    tracer.startSpan('next-operation').end();

    expect(entries[0]).toMatchObject({
      name: 'next-operation',
      detail: { parentSpanId: undefined },
    });
  });
});
