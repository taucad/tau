/* eslint-disable @typescript-eslint/naming-convention -- GeoSpec file paths are object keys here. */
import { describe, expect, it } from 'vitest';
import { openShardTimings } from '#cache/timings.js';
import type { PlannedShard } from '#runner/pool/shard-planner.js';
import {
  autoWorkerCount,
  defaultHeavyRssBytes,
  exactTestPattern,
  filesToSplit,
  planShards,
  selectShard,
  shardTimingKey,
} from '#runner/pool/shard-planner.js';

const timingsWith = (rows: Readonly<Record<string, { durationMs: number; peakRssBytes: number }>>) => {
  const timings = openShardTimings(undefined);
  for (const [shard, timing] of Object.entries(rows)) {
    timings.record(shard, timing);
  }
  return timings;
};

describe('shardTimingKey', () => {
  it('should key a split shard on the exact test it runs', () => {
    expect(shardTimingKey('a.geospec.ts')).toBe('a.geospec.ts');
    expect(shardTimingKey('a.geospec.ts', '^s > t$')).toBe('a.geospec.ts::^s > t$');
  });
});

describe('exactTestPattern', () => {
  it('should anchor and escape so a split shard runs exactly one test', () => {
    const pattern = new RegExp(exactTestPattern('suite (v2) > costs $3.50 [approx]'), 'u');

    expect(pattern.test('suite (v2) > costs $3.50 [approx]')).toBe(true);
    expect(pattern.test('prefix suite (v2) > costs $3.50 [approx]')).toBe(false);
    expect(pattern.test('suite XvX2X > costs 3X50 XapproxX')).toBe(false);
  });
});

describe('filesToSplit', () => {
  it('should split nothing without telemetry', () => {
    expect(filesToSplit(['a.geospec.ts'], undefined)).toStrictEqual([]);
  });

  it('should split only the files over the threshold', () => {
    const timings = timingsWith({
      'slow.geospec.ts': { durationMs: 120_000, peakRssBytes: 0 },
      'fast.geospec.ts': { durationMs: 500, peakRssBytes: 0 },
    });

    expect(filesToSplit(['slow.geospec.ts', 'fast.geospec.ts', 'unknown.geospec.ts'], timings)).toStrictEqual([
      'slow.geospec.ts',
    ]);
  });

  it('should honour an explicit threshold', () => {
    const timings = timingsWith({ 'a.geospec.ts': { durationMs: 1000, peakRssBytes: 0 } });

    expect(filesToSplit(['a.geospec.ts'], timings, 100)).toStrictEqual(['a.geospec.ts']);
  });
});

describe('planShards', () => {
  it('should keep declared order and one shard per file without telemetry', () => {
    const shards = planShards({ files: ['b.geospec.ts', 'a.geospec.ts'] });

    expect(shards.map((shard) => [shard.id, shard.file, shard.estimated, shard.memoryClass])).toStrictEqual([
      [0, 'b.geospec.ts', 0, 'normal'],
      [1, 'a.geospec.ts', 0, 'normal'],
    ]);
  });

  it('should order longest-first and put unknown shards last', () => {
    const timings = timingsWith({
      'short.geospec.ts': { durationMs: 10, peakRssBytes: 0 },
      'long.geospec.ts': { durationMs: 900, peakRssBytes: 0 },
    });

    const shards = planShards({
      files: ['short.geospec.ts', 'unknown.geospec.ts', 'long.geospec.ts'],
      timings,
    });

    expect(shards.map((shard) => shard.file)).toStrictEqual([
      'long.geospec.ts',
      'short.geospec.ts',
      'unknown.geospec.ts',
    ]);
  });

  it('should mark a shard heavy from its recorded peak RSS', () => {
    const timings = timingsWith({ 'big.geospec.ts': { durationMs: 1, peakRssBytes: defaultHeavyRssBytes } });

    expect(planShards({ files: ['big.geospec.ts'], timings })[0]?.memoryClass).toBe('heavy');
  });

  it('should emit one shard per collected test for a split file', () => {
    const shards = planShards({
      files: ['split.geospec.ts'],
      splitTests: new Map([['split.geospec.ts', ['s > one', 's > two']]]),
    });

    expect(shards.map((shard) => shard.testNamePattern)).toStrictEqual(['^s > one$', '^s > two$']);
    expect(shards.map((shard) => shard.timingKey)).toStrictEqual([
      'split.geospec.ts::^s > one$',
      'split.geospec.ts::^s > two$',
    ]);
  });

  it('should not split a file whose collection pass returned nothing', () => {
    const shards = planShards({ files: ['a.geospec.ts'], splitTests: new Map([['a.geospec.ts', []]]) });

    expect(shards).toHaveLength(1);
    expect(shards[0]?.testNamePattern).toBeUndefined();
  });

  it('should carry the affinity key onto every shard of a file', () => {
    const shards = planShards({
      files: ['a.geospec.ts', 'b.geospec.ts'],
      splitTests: new Map([['a.geospec.ts', ['s > one']]]),
      affinity: new Map([['a.geospec.ts', 'key-1']]),
    });

    expect(shards.map((shard) => shard.affinityKey)).toStrictEqual(['key-1', undefined]);
  });
});

describe('autoWorkerCount', () => {
  it('should never exceed the shard count', () => {
    expect(autoWorkerCount({ shards: 2, cpus: 16, totalMemoryBytes: 64 * 1024 ** 3 })).toBe(2);
  });

  it('should leave two cores for the host', () => {
    expect(autoWorkerCount({ shards: 100, cpus: 10, totalMemoryBytes: 64 * 1024 ** 3 })).toBe(8);
  });

  it('should cap on memory', () => {
    expect(autoWorkerCount({ shards: 100, cpus: 64, totalMemoryBytes: 8 * 1024 ** 3 })).toBe(2);
  });

  it('should return at least one worker on a tiny machine', () => {
    expect(autoWorkerCount({ shards: 100, cpus: 1 })).toBe(1);
  });
});

describe('selectShard', () => {
  const shard = (over: Partial<ReturnType<typeof planShards>[number]> = {}) =>
    ({
      id: 0,
      file: 'a',
      timingKey: 'a',
      estimated: 0,
      memoryClass: 'normal',
      ...over,
    }) satisfies PlannedShard;

  it('should take the head of the queue by default', () => {
    expect(selectShard({ pending: [shard(), shard({ id: 1 })], workerLoadKey: undefined, heavyRunning: 0 })).toBe(0);
  });

  it('should prefer a shard this worker already has warm', () => {
    const pending = [shard(), shard({ id: 1, affinityKey: 'warm' })];

    expect(selectShard({ pending, workerLoadKey: 'warm', heavyRunning: 0 })).toBe(1);
  });

  it('should fall back to queue order when nothing matches the affinity key', () => {
    expect(selectShard({ pending: [shard()], workerLoadKey: 'cold', heavyRunning: 0 })).toBe(0);
  });

  it('should hold a heavy shard while another heavy shard runs', () => {
    const pending = [shard({ memoryClass: 'heavy' })];

    expect(selectShard({ pending, workerLoadKey: undefined, heavyRunning: 1 })).toBeUndefined();
    expect(selectShard({ pending, workerLoadKey: undefined, heavyRunning: 0 })).toBe(0);
  });

  it('should skip a blocked heavy shard for a runnable normal one', () => {
    const pending = [shard({ memoryClass: 'heavy' }), shard({ id: 1 })];

    expect(selectShard({ pending, workerLoadKey: undefined, heavyRunning: 1 })).toBe(1);
  });

  it('should not hand out a heavy affine shard while another heavy shard runs', () => {
    const pending = [shard({ memoryClass: 'heavy', affinityKey: 'warm' }), shard({ id: 1 })];

    expect(selectShard({ pending, workerLoadKey: 'warm', heavyRunning: 1 })).toBe(1);
  });

  it('should answer undefined for an empty queue', () => {
    expect(selectShard({ pending: [], workerLoadKey: undefined, heavyRunning: 0 })).toBeUndefined();
  });
});

describe('affinity on an unsplit file', () => {
  it('should carry the key onto a whole-file shard', () => {
    const shards = planShards({ files: ['a.geospec.ts'], affinity: new Map([['a.geospec.ts', 'key-1']]) });

    expect(shards[0]?.affinityKey).toBe('key-1');
  });
});
