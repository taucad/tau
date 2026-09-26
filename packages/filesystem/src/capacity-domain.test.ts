import { describe, expect, it, vi } from 'vitest';

import {
  admitCapacityWrite,
  defaultRevisionReserveBytes,
  measureCapacityDomain,
  revisionReserveFloorBytes,
} from '#capacity-domain.js';
import type { CapacityMeasurement } from '#capacity-domain.js';

const mebibyte = 1024 * 1024;

/** A measured domain with `freeBytes` free out of a 100 GiB pool. */
const measured = (freeBytes: number): CapacityMeasurement => ({
  outcome: 'measured',
  freeBytes,
  totalBytes: 100 * 1024 * mebibyte,
});

describe('measureCapacityDomain', () => {
  it('should return byte counts for the volume holding this repository', async () => {
    const measurement = await measureCapacityDomain({ kind: 'volume', path: process.cwd() });

    if (measurement.outcome !== 'measured') {
      expect.fail(`statfs must measure the volume this test runs on: ${measurement.reason}`);
    }
    expect(measurement.freeBytes).toBeGreaterThan(0);
    expect(measurement.totalBytes).toBeGreaterThanOrEqual(measurement.freeBytes);
    expect(Number.isSafeInteger(measurement.freeBytes)).toBe(true);
    expect(Number.isSafeInteger(measurement.totalBytes)).toBe(true);
  });

  it('should report unsupported rather than zero when the volume cannot be stated', async () => {
    const measurement = await measureCapacityDomain({
      kind: 'volume',
      path: '/tau-capacity-domain-does-not-exist',
    });

    expect(measurement.outcome).toBe('unsupported');
    if (measurement.outcome !== 'unsupported') {
      expect.fail('a missing path cannot be measured');
    }
    expect(measurement.reason).toContain('statfs failed');
  });

  it('should report unsupported when the origin exposes no storage estimate', async () => {
    // Node's `navigator` has no `storage`, which is also Safari's private-mode shape.
    const measurement = await measureCapacityDomain({ kind: 'origin' });

    expect(measurement).toEqual({
      outcome: 'unsupported',
      reason: 'navigator.storage.estimate is unavailable',
    });
  });

  it('should derive free bytes from the origin quota estimate', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ quota: 6 * 1024 * mebibyte, usage: 1024 * mebibyte }) },
    });

    try {
      expect(await measureCapacityDomain({ kind: 'origin' })).toEqual({
        outcome: 'measured',
        freeBytes: 5 * 1024 * mebibyte,
        totalBytes: 6 * 1024 * mebibyte,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('should report unsupported when the estimate omits quota or usage', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({}) } });

    try {
      expect(await measureCapacityDomain({ kind: 'origin' })).toEqual({
        outcome: 'unsupported',
        reason: 'navigator.storage.estimate returned no quota or usage',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('admitCapacityWrite', () => {
  it('derives the reserve from a small domain instead of applying the 1 GiB cap', () => {
    const measurement = { outcome: 'measured', freeBytes: 300 * 2 ** 20, totalBytes: 500 * 2 ** 20 } as const;
    expect(admitCapacityWrite({ measurement, request: { bytes: 1, kind: 'cache' } })).toEqual({ decision: 'admit' });
    // A quarter of a 500 MiB pool is 125 MiB; a cache write that would leave less is refused.
    expect(admitCapacityWrite({ measurement, request: { bytes: 200 * 2 ** 20, kind: 'cache' } })).toMatchObject({
      decision: 'refuse',
      code: 'capacity-reserve-exceeded',
    });
  });

  it('should refuse a cache write that would enter the revision reserve', () => {
    const decision = admitCapacityWrite({
      measurement: measured(defaultRevisionReserveBytes + 100 * mebibyte),
      request: { bytes: 150 * mebibyte, kind: 'cache' },
    });

    expect(decision).toEqual({
      decision: 'refuse',
      code: 'capacity-reserve-exceeded',
      shortfallBytes: 50 * mebibyte,
    });
  });

  it('should admit a cache write that leaves the whole reserve free', () => {
    expect(
      admitCapacityWrite({
        measurement: measured(defaultRevisionReserveBytes + 100 * mebibyte),
        request: { bytes: 100 * mebibyte, kind: 'cache' },
      }),
    ).toEqual({ decision: 'admit' });
  });

  it('should admit a revision write that draws on the reserve', () => {
    expect(
      admitCapacityWrite({
        measurement: measured(revisionReserveFloorBytes + 100 * mebibyte),
        request: { bytes: 100 * mebibyte, kind: 'revision' },
      }),
    ).toEqual({ decision: 'admit' });
  });

  it('should refuse a revision write that would cross the hard floor', () => {
    expect(
      admitCapacityWrite({
        measurement: measured(revisionReserveFloorBytes + 100 * mebibyte),
        request: { bytes: 150 * mebibyte, kind: 'revision' },
      }),
    ).toEqual({
      decision: 'refuse',
      code: 'capacity-floor-exceeded',
      shortfallBytes: 50 * mebibyte,
    });
  });

  it('should raise the reserve to the hard floor when a caller declares less', () => {
    expect(
      admitCapacityWrite({
        measurement: measured(revisionReserveFloorBytes),
        request: { bytes: 1, kind: 'cache' },
        reserveBytes: 0,
      }),
    ).toEqual({ decision: 'refuse', code: 'capacity-reserve-exceeded', shortfallBytes: 1 });
  });

  it('should refuse cache writes but preserve revision writes on an unmeasured domain', () => {
    const measurement: CapacityMeasurement = { outcome: 'unsupported', reason: 'no estimate' };

    expect(admitCapacityWrite({ measurement, request: { bytes: mebibyte, kind: 'cache' } })).toEqual({
      decision: 'refuse',
      code: 'capacity-unmeasured',
      reason: 'no estimate',
    });
    expect(admitCapacityWrite({ measurement, request: { bytes: mebibyte, kind: 'revision' } })).toEqual({
      decision: 'admit',
    });
  });

  it('should reject a request whose byte count is not a finite non-negative number', () => {
    try {
      admitCapacityWrite({
        measurement: measured(defaultRevisionReserveBytes),
        request: { bytes: Number.NaN, kind: 'cache' },
      });
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).name).toBe('TypeError');
      expect((error as Error).message).toBe('Capacity request bytes must be a finite, non-negative number.');
    }
  });
});

// === S5 hard gate 11: cache growth cannot consume the revision-store reserve ===

/** The shared physical pool the cache and the revision store both draw on. */
type Pool = { freeBytes: number };

/** A cache entry a reader may be holding; leased entries cannot be evicted. */
type Entry = { readonly bytes: number; readonly leased: boolean };

/** A cache client bounded only by entry count — the shape the gate forbids. */
const countOnlyCache = (pool: Pool, maxEntries: number) => {
  const entries: Entry[] = [];
  return {
    put(entry: Entry): 'stored' | 'skipped' {
      if (entries.length >= maxEntries) {
        return 'skipped';
      }
      entries.push(entry);
      pool.freeBytes -= entry.bytes;
      return 'stored';
    },
  };
};

/** A cache client that asks the capacity domain first and evicts unleased entries on refusal. */
const reserveAwareCache = (pool: Pool, maxEntries: number) => {
  let entries: Entry[] = [];
  const admit = (bytes: number) =>
    admitCapacityWrite({ measurement: measured(pool.freeBytes), request: { bytes, kind: 'cache' } });
  return {
    put(entry: Entry): 'stored' | 'skipped' {
      let decision = admit(entry.bytes);
      if (decision.decision === 'refuse' && decision.code === 'capacity-reserve-exceeded') {
        const { shortfallBytes } = decision;
        let reclaimed = 0;
        entries = entries.filter((candidate) => {
          if (candidate.leased || reclaimed >= shortfallBytes) {
            return true;
          }
          reclaimed += candidate.bytes;
          pool.freeBytes += candidate.bytes;
          return false;
        });
        decision = admit(entry.bytes);
      }
      if (decision.decision !== 'admit' || entries.length >= maxEntries) {
        return 'skipped';
      }
      entries.push(entry);
      pool.freeBytes -= entry.bytes;
      return 'stored';
    },
  };
};

describe('capacity gate for a cache client sharing a domain with the revision store', () => {
  const primaryRevisionWrite = (pool: Pool) =>
    admitCapacityWrite({
      measurement: measured(pool.freeBytes),
      request: { bytes: 200 * mebibyte, kind: 'revision' },
    });

  it('should refuse the primary revision write after a count-only cache fills the domain', () => {
    const pool: Pool = { freeBytes: defaultRevisionReserveBytes + 400 * mebibyte };
    const cache = countOnlyCache(pool, 100);

    for (let index = 0; index < 8; index += 1) {
      expect(cache.put({ bytes: 200 * mebibyte, leased: false })).toBe('stored');
    }

    expect(pool.freeBytes).toBeLessThan(revisionReserveFloorBytes);
    expect(primaryRevisionWrite(pool)).toEqual({
      decision: 'refuse',
      code: 'capacity-floor-exceeded',
      shortfallBytes: revisionReserveFloorBytes - (pool.freeBytes - 200 * mebibyte),
    });
  });

  it('should evict unleased entries and keep the primary revision write admitted', () => {
    const pool: Pool = { freeBytes: defaultRevisionReserveBytes + 400 * mebibyte };
    const cache = reserveAwareCache(pool, 100);

    expect(cache.put({ bytes: 200 * mebibyte, leased: true })).toBe('stored');
    expect(cache.put({ bytes: 200 * mebibyte, leased: false })).toBe('stored');
    for (let index = 0; index < 6; index += 1) {
      cache.put({ bytes: 200 * mebibyte, leased: false });
    }

    expect(pool.freeBytes).toBeGreaterThanOrEqual(defaultRevisionReserveBytes);
    expect(primaryRevisionWrite(pool)).toEqual({ decision: 'admit' });
  });

  it('should skip caching rather than evict a fully leased cache', () => {
    const pool: Pool = { freeBytes: defaultRevisionReserveBytes + 200 * mebibyte };
    const cache = reserveAwareCache(pool, 100);

    expect(cache.put({ bytes: 200 * mebibyte, leased: true })).toBe('stored');
    expect(cache.put({ bytes: 200 * mebibyte, leased: true })).toBe('skipped');

    expect(pool.freeBytes).toBe(defaultRevisionReserveBytes);
    expect(primaryRevisionWrite(pool)).toEqual({ decision: 'admit' });
  });
});
