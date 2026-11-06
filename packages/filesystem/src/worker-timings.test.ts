import { afterEach, describe, expect, it, vi } from 'vitest';
import { withCrossTabLocks } from '#cross-tab-coordinator.js';
import {
  createWorkerTimings,
  formatWorkerTimingSummary,
  workerTimingCounters,
  workerTimings,
} from '#worker-timings.js';
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
