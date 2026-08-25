import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import type { TelemetryEntry } from '#types/runtime-protocol.types.js';

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
    tracer.setEntrySink((entry) => entries.push(entry));

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
    tracer.setEntrySink((entry) => entries.push(entry));
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
        devtools: {
          properties: [
            ['file', 'main.ts'],
            ['count', '43'],
            ['result', 'ok'],
          ],
        },
      },
    });
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
    expect(options.detail).toMatchObject({ spanId: '0' });
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
});
