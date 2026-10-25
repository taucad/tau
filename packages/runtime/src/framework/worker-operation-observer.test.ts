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

/**
 * An observer whose kernel samples a native child tree, in a realm that owns its process.
 *
 * @param childResident - The kernel's child sample.
 * @returns The observer and the notifies it posted.
 */
const nativeObserver = (childResident: () => Promise<number | undefined>) => {
  const collector = new WorkerTelemetryCollector(() => undefined);
  const observer = new WorkerOperationObserver(
    () => collector,
    () => ({ childResident }),
  );
  observer.setRealm('utility');
  const posted: OperationFactsNotify[] = [];
  return { observer, posted, post: (notify: OperationFactsNotify) => posted.push(notify) };
};

/** Let every pending promise chain settle without advancing the fake clock. */
const settledMicrotasks = async (): Promise<void> => {
  for (let tick = 0; tick < 20; tick++) {
    // oxlint-disable-next-line no-await-in-loop -- each tick lets the next link of a chain run.
    await Promise.resolve();
  }
};

/**
 * Run one observed operation to its reply on `observer`.
 *
 * @param observer - The observer.
 * @param post - Posts its facts.
 * @param operationId - The operation.
 */
const runObserved = (
  observer: WorkerOperationObserver,
  post: (notify: OperationFactsNotify) => void,
  operationId: string,
): void => {
  const observed = observer.begin({ ...evaluate, operationId, observed: true })!;
  observer.settle(observed);
  observer.afterTerminalReply(operationId, post);
  observer.idle();
};

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

  describe('native child resident sample', () => {
    it('should report child memory at settle on every request, the first included, replacing the resident set', async () => {
      resident = 900;
      const sample = vi.fn(async () => 96 * 1024 * 1024);
      const { observer, posted, post } = nativeObserver(sample);
      observer.setMode('facts');
      runObserved(observer, post, 'op-1');
      runObserved(observer, post, 'op-2');
      await settledMicrotasks();
      expect(posted).toHaveLength(2);
      expect(sample).toHaveBeenCalledTimes(2);
      expect(posted).toMatchObject([
        { operationId: 'op-1', facts: { heapSource: 'child', heapBytes: 96 * 1024 * 1024, realm: 'utility' } },
        { operationId: 'op-2', facts: { heapSource: 'child', heapBytes: 96 * 1024 * 1024, realm: 'utility' } },
      ]);
    });

    it('should post none after 50 ms without a sample, and never hold the next operation for it', async () => {
      const slow = Promise.withResolvers<number | undefined>();
      const sample = vi.fn(async () => slow.promise);
      const { observer, posted, post } = nativeObserver(sample);
      observer.setMode('facts');
      runObserved(observer, post, 'op-1');
      // The lane is free: the next operation starts and settles while the first sample is still out.
      const next = observer.begin({ ...evaluate, operationId: 'op-2', observed: true });
      expect(next).toBeDefined();
      expect(posted).toEqual([]);
      await vi.advanceTimersByTimeAsync(49);
      expect(posted).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(posted).toMatchObject([{ operationId: 'op-1', facts: { heapSource: 'none' } }]);
      expect(posted[0]!.facts.heapBytes).toBeUndefined();
      slow.resolve(1);
    });

    it('should post none for a sample that met a recycle, failed or is not a byte count', async () => {
      const answers: Array<() => Promise<number | undefined>> = [
        async () => undefined,
        async () => {
          throw new Error('EACCES');
        },
        async () => -1,
        async () => Number.NaN,
      ];
      const { observer, posted, post } = nativeObserver(async () => answers.shift()!());
      observer.setMode('facts');
      for (const operationId of ['op-1', 'op-2', 'op-3', 'op-4']) {
        runObserved(observer, post, operationId);
      }
      await settledMicrotasks();
      expect(posted).toHaveLength(4);
      expect(posted.map(({ facts }) => [facts.heapSource, facts.heapBytes])).toEqual([
        ['none', undefined],
        ['none', undefined],
        ['none', undefined],
        ['none', undefined],
      ]);
    });

    it('should read no sample and start no timer with observation off', () => {
      const sample = vi.fn(async () => 1);
      const { observer, posted, post } = nativeObserver(sample);
      const unobserved = observer.begin({ ...evaluate, observed: false });
      expect(unobserved).toBeUndefined();
      observer.afterTerminalReply('op-1', post);
      observer.idle();
      expect(sample).not.toHaveBeenCalled();
      expect(posted).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
