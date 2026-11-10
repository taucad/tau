import { describe, expect, it, vi } from 'vitest';
import { createWorkerTimings, workerTimingSpans } from '@taucad/filesystem';
import { workerTimingSpanNames } from '@taucad/telemetry';
import { logWorkerTimings, summarizeLast, withPendingGauge, workerSpanTotals } from '#lib/worker-timing-report.js';

describe('worker timing report', () => {
  it('should name exactly the spans the telemetry ingest accepts', () => {
    expect([...workerTimingSpans]).toEqual([...workerTimingSpanNames]);
  });

  it('should send each span total over the last window, and leave out spans that never ran', async () => {
    let now = 10_000;
    const timings = createWorkerTimings({ now: () => now, measure: false });
    await timings.span('apply.hold', async () => {
      now += 2500;
    });
    await timings.span('records.project', async () => {
      now += 700;
    });

    expect(workerSpanTotals(summarizeLast(3200, timings))).toEqual({ 'apply.hold': 2500, 'records.project': 700 });
  });

  it('should log one info line per window', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      logWorkerTimings('apply of 3 paths', { durationMilliseconds: 1000, spans: {}, counters: {}, gauges: {} });
      expect(info.mock.calls).toEqual([['[worker-timings] apply of 3 paths took 1.0s: nothing recorded']]);
    } finally {
      info.mockRestore();
    }
  });

  it('should count a pending bridge call until it settles, and pass synchronous answers through', async () => {
    const gauge = vi.fn();
    const pending = Promise.withResolvers<string>();
    const handlers = withPendingGauge(
      {
        prefix: 'p:',
        async read(path: string): Promise<string> {
          return `${this.prefix}${path}${await pending.promise}`;
        },
        watch: (): (() => void) => () => undefined,
      },
      { gauge },
    );

    const answer = handlers.read('a');
    expect(gauge.mock.calls).toEqual([['bridge.pending', 1]]);
    pending.resolve('!');
    await expect(answer).resolves.toBe('p:a!');
    await Promise.resolve();
    expect(gauge.mock.calls).toEqual([
      ['bridge.pending', 1],
      ['bridge.pending', -1],
    ]);
    expect(typeof handlers.watch()).toBe('function');
    expect(handlers.prefix).toBe('p:');
    expect(gauge).toHaveBeenCalledTimes(2);
  });
});
