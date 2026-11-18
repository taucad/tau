import { afterEach, describe, expect, it, vi } from 'vitest';
import { withCrossTabLocks } from '#cross-tab-coordinator.js';
import {
  createWorkerTimings,
  formatMeasureBreakdown,
  formatWorkerTimingSummary,
  forwardWorkerTimings,
  isWorkerTimingsMessage,
  receiveWorkerTimings,
  summarizeMeasures,
  workerTimingCounters,
  workerTimings,
  workerTimingsMessageType,
} from '#worker-timings.js';
import type { WorkerTimingsMessage } from '#worker-timings.js';
import { ResourceQueue } from '#resource-queue.js';

/** A recorder on a clock the test moves. */
const recorder = () => {
  let now = 0;
  const timings = createWorkerTimings({ now: () => now, measure: false });
  return {
    timings,
    advance: (milliseconds: number): void => {
      now += milliseconds;
    },
  };
};

describe('createWorkerTimings', () => {
  it('should sum spans over a window, keeping each span count, total and longest run', async () => {
    const { timings, advance } = recorder();
    const startedAt = timings.now();
    await timings.span('lfs.store', async () => {
      advance(300);
    });
    advance(2000);
    await timings.span('lfs.store', async () => {
      advance(900);
    });
    await expect(
      timings.span('fill.flush', async () => {
        advance(50);
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');

    expect(timings.summarize(startedAt)).toEqual({
      durationMilliseconds: 3250,
      spans: {
        'lfs.store': { count: 2, totalMilliseconds: 1200, maxMilliseconds: 900 },
        'fill.flush': { count: 1, totalMilliseconds: 50, maxMilliseconds: 50 },
      },
      counters: {},
      gauges: {},
    });
  });

  it('should report a counter total and its busiest second, and a gauge at its highest', () => {
    const { timings, advance } = recorder();
    const startedAt = timings.now();
    timings.count('events.change', 3);
    advance(1000);
    timings.count('events.change', 5);
    timings.count('events.change');
    timings.gauge('capture.inflight', 1);
    timings.gauge('capture.inflight', 1);
    timings.gauge('capture.inflight', -2);

    const summary = timings.summarize(startedAt);
    expect(summary.counters).toEqual({ 'events.change': { total: 9, peakPerSecond: 6 } });
    expect(summary.gauges).toEqual({ 'capture.inflight': 2 });
  });

  it('should leave out what ran before the window began', async () => {
    const { timings, advance } = recorder();
    await timings.span('apply.hold', async () => {
      advance(100);
    });
    timings.count('events.change', 40);
    advance(5000);
    const startedAt = timings.now();
    await timings.span('fill.flush', async () => {
      advance(10);
    });

    const summary = timings.summarize(startedAt);
    expect(Object.keys(summary.spans)).toEqual(['fill.flush']);
    expect(summary.counters).toEqual({});
  });

  it('should write one line that names each span, counter and gauge and nothing else', async () => {
    const { timings, advance } = recorder();
    const startedAt = timings.now();
    await timings.span('queue.wait', async () => {
      advance(1500);
    });
    timings.count('index.facts.bytes', 2048);
    timings.gauge('bridge.pending', 4);

    expect(formatWorkerTimingSummary('fill of 2 objects', timings.summarize(startedAt))).toBe(
      '[worker-timings] fill of 2 objects took 1.5s: queue.wait 1× 1.5s max 1.5s; index.facts.bytes 2048 peak 2048/s; bridge.pending peak 4',
    );
  });
});

describe('system skill overlay counters', () => {
  it('should count overlay reads and the fetches among them so the miss rate is their ratio', () => {
    const { timings } = recorder();
    const startedAt = timings.now();
    timings.count('overlay.read', 3);
    timings.count('overlay.fetch');

    expect(workerTimingCounters).toEqual(expect.arrayContaining(['overlay.read', 'overlay.fetch']));
    expect(timings.summarize(startedAt).counters).toEqual({
      'overlay.read': { total: 3, peakPerSecond: 3 },
      'overlay.fetch': { total: 1, peakPerSecond: 1 },
    });
  });
});

describe('ResourceQueue timings', () => {
  it('should record how long an operation waited for its claims and how long it held them', async () => {
    const { timings, advance } = recorder();
    const queue = new ResourceQueue({ timings });
    const startedAt = timings.now();
    const first = Promise.withResolvers<void>();
    const holding = queue.queueFor('project:a', async () => {
      await first.promise;
      advance(400);
    });
    const waiting = queue.queueFor('project:a', async () => {
      advance(100);
    });
    await Promise.resolve();
    first.resolve();
    await Promise.all([holding, waiting]);

    const { spans } = timings.summarize(startedAt);
    expect(spans['queue.held']).toEqual({ count: 2, totalMilliseconds: 500, maxMilliseconds: 400 });
    expect(spans['queue.wait']).toEqual({ count: 2, totalMilliseconds: 400, maxMilliseconds: 400 });
  });
});

describe('cross-tab lock timings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should count one lock set per withCrossTabLocks call and the distinct tokens it names', async () => {
    const request = vi.fn(async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback());
    vi.stubGlobal('navigator', { locks: { request } });
    const startedAt = workerTimings.now();

    await withCrossTabLocks(['project:a', '/projects/a/x', 'project:a'], async () => 'done');
    await withCrossTabLocks(['project:a'], async () => 'done');

    const { counters } = workerTimings.summarize(startedAt);
    expect(counters['locks.set']?.total).toBe(2);
    expect(counters['locks.token']?.total).toBe(3);
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('worker spans readable from the page (tau #2014)', () => {
  afterEach(() => {
    vi.useRealTimers();
    performance.clearMeasures();
  });

  it('should post the spans a worker records, batched, on the worker clock with its origin', async () => {
    vi.useFakeTimers();
    const { timings, advance } = recorder();
    const posted: WorkerTimingsMessage[] = [];
    const stop = forwardWorkerTimings((message) => posted.push(message), timings);
    advance(10);
    await timings.span('apply.hold', async () => {
      advance(40);
    });
    await timings.span('queue.wait', async () => {
      advance(5);
    });
    expect(posted).toEqual([]);

    vi.advanceTimersByTime(250);
    expect(posted).toEqual([
      {
        type: workerTimingsMessageType,
        timeOrigin: performance.timeOrigin,
        spans: [
          ['apply.hold', 10, 50],
          ['queue.wait', 50, 55],
        ],
      },
    ]);

    vi.advanceTimersByTime(1000);
    expect(posted).toHaveLength(1);
    await timings.span('fill.flush', async () => {
      advance(1);
    });
    stop();
    expect(posted.at(-1)?.spans).toEqual([['fill.flush', 55, 56]]);
    await timings.span('fill.flush', async () => {
      advance(1);
    });
    vi.advanceTimersByTime(250);
    expect(posted).toHaveLength(2);
  });

  it('should write forwarded spans as tau.worker measures on the page clock and drop names outside the vocabulary', () => {
    const target = new EventTarget();
    const stop = receiveWorkerTimings(target as unknown as Worker, 'file-manager');
    /* A worker whose clock began 1,000 ms after the page's. */
    const message = {
      type: workerTimingsMessageType,
      timeOrigin: performance.timeOrigin + 1000,
      spans: [
        ['lfs.store', 20, 70],
        ['not.a.span', 0, 1],
      ],
    };
    target.dispatchEvent(new MessageEvent('message', { data: message }));
    target.dispatchEvent(new MessageEvent('message', { data: { type: 'other' } }));
    stop();
    target.dispatchEvent(new MessageEvent('message', { data: message }));

    const measures = performance.getEntriesByType('measure').filter((entry) => entry.name.startsWith('tau.'));
    expect(measures).toHaveLength(1);
    expect(measures[0]).toMatchObject({ name: 'tau.worker.lfs.store', startTime: 1020, duration: 50 });
    expect((measures[0] as PerformanceMeasure).detail).toEqual({
      schemaVersion: 1,
      span: 'lfs.store',
      worker: 'file-manager',
      realm: 'dedicated-worker',
    });
  });

  it('should recognise only a timings message', () => {
    expect(isWorkerTimingsMessage({ type: workerTimingsMessageType, timeOrigin: 1, spans: [] })).toBe(true);
    expect(isWorkerTimingsMessage({ type: workerTimingsMessageType, spans: [] })).toBe(false);
    expect(isWorkerTimingsMessage(undefined)).toBe(false);
  });

  it('should name its own measures tau.worker.<span> in the worker realm too', async () => {
    const timings = createWorkerTimings();
    await timings.span('records.project', async () => undefined);
    expect(performance.getEntriesByName('tau.worker.records.project', 'measure')).toHaveLength(1);
  });

  it('should break measures down by name, the largest total first, for a failed budget', () => {
    const rows = summarizeMeasures([
      { name: 'tau.worker.queue.wait', duration: 10.4 },
      { name: 'tau.load.tree.list', duration: 300 },
      { name: 'tau.worker.queue.wait', duration: 30.2 },
    ]);
    expect(rows).toEqual([
      { name: 'tau.load.tree.list', count: 1, totalMilliseconds: 300, maxMilliseconds: 300 },
      { name: 'tau.worker.queue.wait', count: 2, totalMilliseconds: 41, maxMilliseconds: 30 },
    ]);
    expect(formatMeasureBreakdown(rows)).toBe(
      'tau.load.tree.list 1× 300 ms max 300 ms\ntau.worker.queue.wait 2× 41 ms max 30 ms',
    );
    expect(formatMeasureBreakdown([])).toBe('no tau.* measures recorded');
  });
});
