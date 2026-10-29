import { describe, expect, it } from 'vitest';

/**
 * The statistics of `scripts/benchmark-save-latency.mts` (DV1). The pushes themselves need a live API and a
 * credential; what decides the qualification is the arithmetic, so that is what runs here. The script runs
 * its benchmark only as the entry module, so importing it sends nothing.
 */

/** The parts of the script this test reads. */
type BenchmarkModule = Readonly<{
  nearestRank: (sorted: readonly number[], percentile: number) => number;
  summarize: (
    samples: readonly number[],
  ) => Readonly<Record<'count' | 'p50' | 'p90' | 'p99' | 'min' | 'max' | 'mean', number>>;
  parseSize: (value: string) => number;
  formatSize: (bytes: number) => string;
  formatTable: (
    rows: ReadonlyArray<
      Readonly<{
        phase: 'seed' | 'sequential' | 'concurrent';
        sizeBytes: number;
        summary: Readonly<Record<'count' | 'p50' | 'p90' | 'p99' | 'min' | 'max' | 'mean', number>>;
        failures: number;
      }>
    >,
  ) => string;
}>;

const scriptModule = '../../scripts/benchmark-save-latency.mts';
const { nearestRank, summarize, parseSize, formatSize, formatTable } = (await import(
  /* @vite-ignore */ scriptModule
)) as BenchmarkModule;

describe('save-latency benchmark statistics', () => {
  const hundred = Array.from({ length: 100 }, (_, index) => index + 1);

  it('should take nearest-rank percentiles, so each figure is a push that happened', () => {
    expect(nearestRank(hundred, 50)).toBe(50);
    expect(nearestRank(hundred, 90)).toBe(90);
    expect(nearestRank(hundred, 99)).toBe(99);
    expect(nearestRank(hundred, 100)).toBe(100);
    expect(nearestRank([1200, 3400, 4100], 50)).toBe(3400);
  });

  it('should report the maximum as p99 below a hundred samples', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => (index + 1) * 100);
    expect(nearestRank(twenty, 90)).toBe(1800);
    expect(nearestRank(twenty, 99)).toBe(2000);
  });

  it('should refuse a percentile outside (0, 100]', () => {
    expect(() => nearestRank(hundred, 0)).toThrow(RangeError);
    expect(() => nearestRank(hundred, 101)).toThrow(RangeError);
  });

  it('should summarize an unordered sample', () => {
    expect(summarize([3000, 1000, 5000, 2000, 4000])).toEqual({
      count: 5,
      p50: 3000,
      p90: 5000,
      p99: 5000,
      min: 1000,
      max: 5000,
      mean: 3000,
    });
  });

  it('should summarize an empty sample (every push failed) without throwing', () => {
    const empty = summarize([]);
    expect(empty.count).toBe(0);
    expect(empty.p50).toBeNaN();
    expect(empty.max).toBeNaN();
  });

  it('should parse and print project sizes in binary units', () => {
    expect(parseSize('16k')).toBe(16_384);
    expect(parseSize('4M')).toBe(4 * 1024 ** 2);
    expect(parseSize('1000')).toBe(1000);
    expect(() => parseSize('0')).toThrow(RangeError);
    expect(() => parseSize('65m')).toThrow(RangeError);
    expect(() => parseSize('1.5k')).toThrow(RangeError);
    expect(formatSize(16_384)).toBe('16k');
    expect(formatSize(4 * 1024 ** 2)).toBe('4m');
    expect(formatSize(1000)).toBe('1000b');
  });

  it('should print one row per phase and size, with a dash for a figure an empty row lacks', () => {
    const table = formatTable([
      {
        phase: 'sequential',
        sizeBytes: 16_384,
        summary: summarize([1000, 2000, 3000]),
        failures: 0,
      },
      {
        phase: 'concurrent',
        sizeBytes: 16_384,
        summary: summarize([]),
        failures: 4,
      },
    ]);
    const [header, sequential, concurrent] = table.split('\n');
    expect(header?.trim().split(/\s+/u)).toEqual([
      'phase',
      'size',
      'n',
      'fail',
      'p50',
      'ms',
      'p90',
      'ms',
      'p99',
      'ms',
      'min',
      'ms',
      'max',
      'ms',
      'mean',
      'ms',
    ]);
    expect(sequential?.trim().split(/\s+/u)).toEqual([
      'sequential',
      '16k',
      '3',
      '0',
      '2000',
      '3000',
      '3000',
      '1000',
      '3000',
      '2000',
    ]);
    expect(concurrent?.trim().split(/\s+/u)).toEqual(['concurrent', '16k', '0', '4', '-', '-', '-', '-', '-', '-']);
  });
});
