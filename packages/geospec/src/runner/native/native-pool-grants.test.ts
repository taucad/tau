import { describe, expect, it } from 'vitest';
import { allocateNativePoolGrants } from '#runner/native/native-pool-grants.js';

describe('allocateNativePoolGrants', () => {
  it('should assign one caller-inclusive permit to every worker by default', () => {
    expect(allocateNativePoolGrants({ workers: 3, hostCap: 8 })).toEqual([1, 1, 1]);
  });

  it('should distribute an explicit bounded budget deterministically in worker order', () => {
    const grants = allocateNativePoolGrants({ workers: 3, budget: 8, hostCap: 8 });
    expect(grants).toEqual([3, 3, 2]);
    expect(grants.reduce((sum, grant) => sum + grant, 0)).toBe(8);
  });

  it.each([
    { workers: 0, budget: 1, hostCap: 8 },
    { workers: 3, budget: 2, hostCap: 8 },
    { workers: 3, budget: 9, hostCap: 8 },
    { workers: 1.5, budget: 3, hostCap: 8 },
    { workers: 1, budget: Number.NaN, hostCap: 8 },
  ])('should reject an invalid or overcommitted budget %#', (options) => {
    expect(() => allocateNativePoolGrants(options)).toThrow(RangeError);
    expect(() => allocateNativePoolGrants(options)).toThrow('Native pool requires positive workers');
  });
});
