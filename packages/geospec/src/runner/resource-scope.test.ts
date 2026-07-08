import { describe, expect, it } from 'vitest';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';

describe('GeoSpec resource scope disposal', () => {
  it('should run every disposable even when one throws and rethrow the first error', async () => {
    const scope = createGeoSpecResourceScope();
    const calls: string[] = [];
    const failure = new Error('dispose #1 failed');

    // Registered first, so it disposes last under LIFO — the throw above it
    // must not prevent it from running.
    scope.register(() => {
      calls.push('third');
    });
    scope.register(() => {
      calls.push('second');
    });
    // Registered last, so it disposes first and throws — the rest must still run.
    scope.register(() => {
      calls.push('first');
      throw failure;
    });

    await expect(scope.dispose()).rejects.toBe(failure);

    // Every registered disposable ran despite the throw (LIFO order).
    expect(calls).toEqual(['first', 'second', 'third']);

    // A second dispose() is a no-op: nothing re-runs.
    calls.length = 0;
    await expect(scope.dispose()).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });
});
