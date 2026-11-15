import { metrics } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeMetricsService, runtimeCounterZeroHold } from '#api/telemetry/runtime-metrics.service.js';

const attributes = {
  'tau.runtime.operation': 'describe',
  'tau.runtime.outcome': 'superseded',
  'tau.runtime.population': 'signed-out',
  'tau.runtime.route': 'daemon',
  'kernel.id': 'none',
} as const;

describe('RuntimeMetricsService counters (R07 restart visibility)', () => {
  const add = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    add.mockClear();
    vi.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({ add }),
      createHistogram: () => ({ record: vi.fn() }),
      createObservableGauge: () => ({ addCallback: vi.fn() }),
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exports a new series at 0 and adds its increments only after the hold', () => {
    const service = new RuntimeMetricsService();
    service.count('runtimeOperations', 7, attributes as never);
    service.count('runtimeOperations', 7, attributes as never);
    expect(add.mock.calls).toEqual([[0, attributes]]);

    vi.advanceTimersByTime(runtimeCounterZeroHold);
    expect(add.mock.calls).toEqual([
      [0, attributes],
      [14, attributes],
    ]);

    service.count('runtimeOperations', 7, attributes as never);
    expect(add.mock.calls.at(-1)).toEqual([7, attributes]);
  });

  it('holds each attribute set on its own, whatever the attribute order', () => {
    const service = new RuntimeMetricsService();
    service.count('runtimeOperations', 1, attributes as never);
    vi.advanceTimersByTime(runtimeCounterZeroHold);
    const reordered = Object.fromEntries(Object.entries(attributes).reverse());
    service.count('runtimeOperations', 1, reordered as never);
    expect(add.mock.calls.at(-1)).toEqual([1, reordered]);

    const other = { ...attributes, 'tau.runtime.outcome': 'succeeded' };
    service.count('runtimeOperations', 1, other as never);
    expect(add.mock.calls.at(-1)).toEqual([0, other]);
  });

  it('adds every held increment before shutdown and counts directly after it', () => {
    const service = new RuntimeMetricsService();
    service.count('runtimeOperations', 7, attributes as never);
    service.beforeApplicationShutdown();
    expect(add.mock.calls).toEqual([
      [0, attributes],
      [7, attributes],
    ]);
    const late = { ...attributes, 'tau.runtime.outcome': 'failed' };
    service.count('runtimeOperations', 1, late as never);
    expect(add.mock.calls.at(-1)).toEqual([1, late]);
    vi.advanceTimersByTime(runtimeCounterZeroHold);
    expect(add).toHaveBeenCalledTimes(3);
  });
});
