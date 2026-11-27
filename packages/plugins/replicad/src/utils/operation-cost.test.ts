import { describe, expect, it, vi } from 'vitest';
import type { OperationCache, OperationRequest } from 'replicad';
import { meterOperations, tierBuildReport } from '#utils/operation-cost.js';

/** Any number: elapsed times vary from run to run. */
const anyNumber: unknown = expect.any(Number);

/** A cache that computes every operation except those it was told to answer itself. */
const innerCache = (answered: ReadonlySet<string>): OperationCache => ({
  operation: <T>(request: OperationRequest<T>): T => (answered.has(request.op) ? (undefined as T) : request.compute()),
  step: (request) => request.compute(),
  elements: vi.fn(),
});

const request = (op: string, compute: () => unknown): OperationRequest<unknown> => ({
  op,
  effect: 'pure',
  receiver: undefined,
  args: [],
  compute,
});

describe('meterOperations', () => {
  it('should time only the operations the inner cache computes, costliest kind first', () => {
    const now = vi.spyOn(performance, 'now');
    const clock = [0, 30, 100, 110, 200, 215];
    now.mockImplementation(() => clock.shift() ?? 0);
    const meter = meterOperations(innerCache(new Set(['Shape.reused'])));

    meter.cache.operation(request('Shape.fillet', () => 1));
    meter.cache.operation(request('Shape.cut', () => 2));
    meter.cache.operation(request('Shape.reused', () => 3));
    meter.cache.operation(request('Shape.cut', () => 4));

    expect(meter.costliest(3)).toStrictEqual([
      { operation: 'Shape.fillet', elapsed: 30, calls: 1 },
      { operation: 'Shape.cut', elapsed: 25, calls: 2 },
    ]);
    expect(meter.costliest(1)).toHaveLength(1);
    now.mockRestore();
  });

  it('should count an operation that throws and pass the inner cache its other calls', () => {
    const inner = innerCache(new Set());
    const meter = meterOperations(inner);

    expect(() =>
      meter.cache.operation(
        request('Shape.fillet', () => {
          throw new Error('fillet failed');
        }),
      ),
    ).toThrow('fillet failed');
    meter.cache.elements({}, 'edges', [], () => undefined);

    expect(meter.costliest(3)).toMatchObject([{ operation: 'Shape.fillet', calls: 1 }]);
    expect(inner.elements).toHaveBeenCalledOnce();
  });
});

describe('tierBuildReport', () => {
  it('should report the tier counters of the ended build and the costliest operations', () => {
    const meter = meterOperations(innerCache(new Set()));
    meter.cache.operation(request('Shape.fuse', () => 1));

    expect(tierBuildReport({ stats: () => ({ calls: 9, hits: 4 }) }, meter)).toStrictEqual({
      operations: { reused: 4, computed: 5 },
      costliest: [{ operation: 'Shape.fuse', elapsed: anyNumber, calls: 1 }],
    });
  });
});
