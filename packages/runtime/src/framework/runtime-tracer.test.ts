import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { RuntimeTracer } from '#framework/runtime-tracer.js';

describe('RuntimeTracer', () => {
  let measureSpy: MockInstance;

  beforeEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
    measureSpy = vi.spyOn(performance, 'measure');
  });

  afterEach(() => {
    measureSpy.mockRestore();
  });

  describe('normal span lifecycle', () => {
    it('should create a performance mark and measure on start/end', () => {
      const tracer = new RuntimeTracer();
      const span = tracer.startSpan('test.operation');

      const marks = performance.getEntriesByType('mark');
      expect(marks.some((m) => m.name === 'tau:span:0:0')).toBe(true);

      span.end();

      expect(measureSpy).toHaveBeenCalledOnce();
      expect(measureSpy).toHaveBeenCalledWith('test.operation', expect.objectContaining({ start: 'tau:span:0:0' }));
    });

    it('should support nested spans with parent-child detail', () => {
      const tracer = new RuntimeTracer();
      const outer = tracer.startSpan('outer');
      const inner = tracer.startSpan('inner');

      inner.end();
      outer.end();

      expect(measureSpy).toHaveBeenCalledTimes(2);
      expect(measureSpy).toHaveBeenCalledWith(
        'inner',
        expect.objectContaining({
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
          detail: expect.objectContaining({ spanId: '1', parentSpanId: '0' }),
        }),
      );
      expect(measureSpy).toHaveBeenCalledWith(
        'outer',
        expect.objectContaining({
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
          detail: expect.objectContaining({
            spanId: '0',
            parentSpanId: undefined,
          }),
        }),
      );
    });

    it('should include attributes and devtools metadata in measure detail', () => {
      const tracer = new RuntimeTracer();
      const span = tracer.startSpan('op', { file: 'main.ts', count: 42 });
      span.end();

      expect(measureSpy).toHaveBeenCalledWith(
        'op',
        expect.objectContaining({
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
          detail: expect.objectContaining({
            file: 'main.ts',
            count: 42,
            devtools: {
              dataType: 'track-entry',
              track: 'Kernel Pipeline',
              trackGroup: 'Tau',
              properties: [
                ['file', 'main.ts'],
                ['count', '42'],
              ],
            },
          }),
        }),
      );
    });

    it('should merge end-time attributes into measure detail', () => {
      const tracer = new RuntimeTracer();
      const span = tracer.startSpan('op', { file: 'main.ts', count: 42 });
      span.end({ count: 43, result: 'ok' });

      expect(measureSpy).toHaveBeenCalledWith(
        'op',
        expect.objectContaining({
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
          detail: expect.objectContaining({
            file: 'main.ts',
            count: 43,
            result: 'ok',
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
            devtools: expect.objectContaining({
              properties: [
                ['file', 'main.ts'],
                ['count', '43'],
                ['result', 'ok'],
              ],
            }),
          }),
        }),
      );
    });

    it('should work across multiple reset cycles', () => {
      const tracer = new RuntimeTracer();

      const span1 = tracer.startSpan('cycle-1');
      span1.end();
      tracer.reset();

      const span2 = tracer.startSpan('cycle-2');
      span2.end();

      expect(measureSpy).toHaveBeenLastCalledWith('cycle-2', expect.anything());
    });
  });

  describe('epoch scoping', () => {
    it('should not throw when span.end() is called after reset()', () => {
      const tracer = new RuntimeTracer();
      const span = tracer.startSpan('stale.operation');

      tracer.reset();

      expect(() => {
        span.end();
      }).not.toThrow();
    });

    it('should not emit a performance.measure() for a stale span', () => {
      const tracer = new RuntimeTracer();
      const span = tracer.startSpan('stale.operation');

      tracer.reset();
      measureSpy.mockClear();
      span.end();

      expect(measureSpy).not.toHaveBeenCalled();
    });

    it('should not corrupt activeSpanId when a stale span ends', () => {
      const tracer = new RuntimeTracer();
      const staleSpan = tracer.startSpan('stale');

      tracer.reset();

      const freshOuter = tracer.startSpan('fresh.outer');
      const freshInner = tracer.startSpan('fresh.inner');

      staleSpan.end();

      freshInner.end();
      freshOuter.end();

      expect(measureSpy).toHaveBeenCalledWith(
        'fresh.inner',
        expect.objectContaining({
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining returns any
          detail: expect.objectContaining({ parentSpanId: expect.any(String) }),
        }),
      );
    });

    it('should use different mark names across epochs (no collision)', () => {
      const tracer = new RuntimeTracer();

      const span1 = tracer.startSpan('epoch-0-span');
      span1.end();

      tracer.reset();

      const span2 = tracer.startSpan('epoch-1-span');
      span2.end();

      expect(measureSpy).toHaveBeenCalledWith(
        'epoch-0-span',
        expect.objectContaining({
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.stringMatching returns any
          start: expect.stringMatching(/^tau:span:0:/),
        }),
      );
      expect(measureSpy).toHaveBeenCalledWith(
        'epoch-1-span',
        expect.objectContaining({
          // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.stringMatching returns any
          start: expect.stringMatching(/^tau:span:1:/),
        }),
      );
    });

    it('should handle multiple resets with stale spans from different epochs', () => {
      const tracer = new RuntimeTracer();

      const spanEpoch0 = tracer.startSpan('epoch-0');
      tracer.reset();
      const spanEpoch1 = tracer.startSpan('epoch-1');
      tracer.reset();

      const spanEpoch2 = tracer.startSpan('epoch-2');
      spanEpoch2.end();

      expect(() => {
        spanEpoch0.end();
        spanEpoch1.end();
      }).not.toThrow();

      expect(measureSpy).toHaveBeenCalledOnce();
      expect(measureSpy).toHaveBeenCalledWith('epoch-2', expect.anything());
    });
  });
});
