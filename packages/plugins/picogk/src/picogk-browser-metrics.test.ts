import { describe, expect, it } from 'vitest';

import { picogkWorkerMetricsSchema } from '#picogk.protocol.js';

describe('browser worker memory observations', () => {
  it('should distinguish unavailable process memory from measured zero', () => {
    const metrics = { managedHeapBytes: 32, picoGkNativeBytes: 64, processWorkingSetBytes: null };
    expect(picogkWorkerMetricsSchema.parse(metrics)).toEqual(metrics);
    expect(picogkWorkerMetricsSchema.parse({ ...metrics, processWorkingSetBytes: 0 }).processWorkingSetBytes).toBe(0);
    expect(picogkWorkerMetricsSchema.safeParse({ ...metrics, processWorkingSetBytes: -1 }).success).toBe(false);
  });
});
