import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerOperationObserver } from '#framework/worker-operation-observer.js';
import type { OperationFactsNotify } from '#framework/worker-operation-observer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';

/**
 * An observer in a realm that owns its process, so heap facts come from the resident sampler.
 *
 * @returns The observer and the notifies it posted.
 */
const utilityObserver = () => {
  const collector = new WorkerTelemetryCollector(() => undefined);
  const observer = new WorkerOperationObserver(
    () => collector,
    () => undefined,
  );
  observer.setRealm('utility');
  const posted: OperationFactsNotify[] = [];
  return { observer, posted, post: (notify: OperationFactsNotify) => posted.push(notify) };
};

const evaluate = { operation: 'evaluate', operationId: 'op-1', admitted: 0 } as const;

describe('WorkerOperationObserver', () => {
  let resident = 100;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    resident = 100;
    vi.spyOn(process.memoryUsage, 'rss').mockImplementation(() => resident);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should keep sampling an operation admitted under facts after observation stops mid-flight', () => {
    const { observer, posted, post } = utilityObserver();
    observer.setMode('facts');
    const observed = observer.begin({ ...evaluate, observed: true })!;
    vi.advanceTimersByTime(0);
    observer.setMode('off');
    resident = 200;
    vi.advanceTimersByTime(5000);
    observer.settle(observed);
    observer.afterTerminalReply('op-1', post);
    expect(posted).toMatchObject([{ operationId: 'op-1', facts: { heapSource: 'resident', heapBytes: 200 } }]);
    // Nothing observed is left in flight and observation is off: the sampler stops now, without lingering.
    observer.idle();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should stop the sampler at once when observation stops with nothing observed in flight', () => {
    const { observer } = utilityObserver();
    observer.setMode('facts');
    const observed = observer.begin({ ...evaluate, observed: true })!;
    observer.settle(observed);
    observer.idle();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    observer.setMode('off');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('should start no sampler for an operation admitted under off', () => {
    const { observer } = utilityObserver();
    expect(observer.begin({ ...evaluate, observed: false })).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
