import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeTracer } from '#framework/runtime-tracer.js';
import { WorkerOperationObserver } from '#framework/worker-operation-observer.js';
import type { OperationFactsNotify } from '#framework/worker-operation-observer.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import type { WorkerTelemetryFlush } from '#framework/worker-telemetry.js';
import type { SpanHandle } from '#types/runtime-tracer.types.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';

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

/**
 * A worker's span path as `kernel-worker.ts` wires it: the real tracer into the real collector, observing, with every
 * flushed batch and every posted facts notify kept.
 *
 * @param limit - The collector's bound.
 * @returns The path and the steps `enqueueOperation` and `KernelWorker.afterTerminalReply` take.
 */
const spanPath = (limit?: number) => {
  const batches: WorkerTelemetryFlush[] = [];
  const posted: OperationFactsNotify[] = [];
  const collector = new WorkerTelemetryCollector((batch) => batches.push(batch), limit);
  const tracer = new RuntimeTracer();
  tracer.setEntrySink(
    (entry) => {
      collector.collect(entry);
    },
    () => {
      collector.noteDropped();
    },
  );
  const observer = new WorkerOperationObserver(
    () => collector,
    () => undefined,
  );
  observer.setMode('facts');
  type Started = Readonly<{ observed: NonNullable<ReturnType<WorkerOperationObserver['begin']>>; root: SpanHandle }>;
  return {
    batches,
    posted,
    tracer,
    /** Dequeue: begin the facts, then open the root that carries the operation id. */
    start: (operationId: string, operation: 'evaluate' | 'render' = 'evaluate'): Started => ({
      observed: observer.begin({ operation, operationId, admitted: 0, observed: true })!,
      root: tracer.startSpan(`kernel.${operation}`, { 'operation.id': operationId }),
    }),
    /** Settle: end the root, then stamp the facts. */
    settle: ({ observed, root }: Started): void => {
      root.end();
      observer.settle(observed);
    },
    /** After the terminal reply: post the facts, then flush up to where the operation settled. */
    afterReply: (operationId: string): void => {
      collector.flush(observer.afterTerminalReply(operationId, (notify) => posted.push(notify)));
    },
    /** A span the operation starts and ends inside its root. */
    span: (name: string): void => {
      tracer.startSpan(name).end();
    },
  };
};

const parentOf = (entry: TelemetryEntry): unknown => entry.detail?.['parentSpanId'];

/**
 * The operation ids of a batch's roots: the spans with no parent.
 *
 * @param entries - The batch.
 * @returns One id per root, `undefined` for an accidental root that carries none.
 */
const rootIds = (entries: readonly TelemetryEntry[]): unknown[] =>
  entries.filter((entry) => parentOf(entry) === undefined).map((entry) => entry.detail?.['operation.id']);

describe('T03: one root and one facts notify per operation on the real span path', () => {
  it('should send each operation in its own batch when the next one starts before the after-reply step', () => {
    const path = spanPath();
    const first = path.start('op-a');
    path.span('kernel.resolve-deps');
    path.span('kernel.compute');
    path.settle(first);
    // The reply is posted and the lane is free: the next operation collects spans before op-a's after-reply step.
    const second = path.start('op-b', 'render');
    path.span('kernel.mesh');
    path.afterReply('op-a');
    path.span('kernel.mesh-compute');
    path.settle(second);
    path.afterReply('op-b');

    expect(path.batches.map(({ entries }) => rootIds(entries))).toEqual([['op-a'], ['op-b']]);
    expect(path.batches.map(({ entries }) => entries.map(({ name }) => name))).toEqual([
      ['kernel.resolve-deps', 'kernel.compute', 'kernel.evaluate'],
      ['kernel.mesh', 'kernel.mesh-compute', 'kernel.render'],
    ]);
    for (const { entries } of path.batches) {
      const root = entries.find((entry) => parentOf(entry) === undefined)!;
      for (const entry of entries.filter((candidate) => candidate !== root)) {
        expect(parentOf(entry)).toBe(root.detail?.['spanId']);
      }
    }
    expect(path.posted.map(({ operationId, facts }) => [operationId, Object.keys(facts.phases ?? {}).sort()])).toEqual([
      ['op-a', ['compute', 'prepare']],
      ['op-b', ['mesh']],
    ]);
  });

  it('should give every operation on a reused worker one root, one notify and one batch, across a recycle', () => {
    const path = spanPath();
    for (const operationId of ['op-1', 'op-2']) {
      const operation = path.start(operationId);
      path.span('kernel.compute');
      path.settle(operation);
      path.afterReply(operationId);
    }
    // A background span outlives the recycled epoch; it must neither parent the next root nor reach a batch.
    const stale = path.tracer.startSpan('kernel.compute.publication');
    path.tracer.reset();
    const third = path.start('op-3');
    stale.end();
    path.span('kernel.compute');
    path.settle(third);
    path.afterReply('op-3');

    expect(path.posted.map(({ operationId, facts }) => [operationId, facts.cold])).toEqual([
      ['op-1', true],
      ['op-2', false],
      ['op-3', false],
    ]);
    expect(path.batches.map(({ entries }) => rootIds(entries))).toEqual([['op-1'], ['op-2'], ['op-3']]);
    expect(path.batches.map(({ dropped }) => dropped)).toEqual([0, 0, 1]);
    expect(path.batches[2]!.entries.map(({ name }) => name)).toEqual(['kernel.compute', 'kernel.evaluate']);
  });

  it('should post one facts notify when the after-reply step runs twice for an operation', () => {
    const path = spanPath();
    const operation = path.start('op-1');
    path.span('kernel.compute');
    path.settle(operation);
    path.afterReply('op-1');
    path.afterReply('op-1');

    expect(path.posted.map(({ operationId }) => operationId)).toEqual(['op-1']);
    expect(path.batches).toHaveLength(1);
  });

  it.each([
    { label: 'exactly at', limit: 3, dropped: 0, walked: true },
    { label: 'one over', limit: 2, dropped: 1, walked: false },
  ])(
    'should walk the slice only when the operation fits the collector bound ($label)',
    ({ limit, dropped, walked }) => {
      const path = spanPath(limit);
      const operation = path.start('op-1');
      path.span('kernel.resolve-deps');
      path.span('kernel.compute');
      path.settle(operation);
      path.afterReply('op-1');

      expect(path.posted).toHaveLength(1);
      // A refused span means the slice is not the whole operation, so no partial walk is posted as a whole one.
      expect(path.posted[0]!.facts.phases !== undefined).toBe(walked);
      expect(path.batches).toHaveLength(1);
      expect(path.batches[0]!.dropped).toBe(dropped);
      if (dropped > 0) {
        // The refused span is the root; its children keep their operation through the named dropped root.
        expect(Object.values(path.batches[0]!.droppedRoots ?? {})).toEqual(['op-1']);
      }
    },
  );
});
