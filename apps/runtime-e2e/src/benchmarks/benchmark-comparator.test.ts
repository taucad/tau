import { describe, expect, it } from 'vitest';
import { benchmarkGateExitCode, compareBenchmarkRuns } from '#benchmarks/benchmark-comparator.js';
import type { ComparableBenchmarkRun } from '#benchmarks/benchmark-comparator.js';

const run = (median: number, workloadFingerprint = 'workload'): ComparableBenchmarkRun => ({
  runnerFingerprint: 'runner',
  results: [{ name: 'box', median, workloadFingerprint, outputHash: 'geometry' }],
});

describe('compareBenchmarkRuns', () => {
  it('fails a matching-fingerprint 11% median regression', () => {
    const comparison = compareBenchmarkRuns(run(100), run(111));
    expect(comparison.issues).toMatchObject([{ kind: 'regression' }]);
    expect(benchmarkGateExitCode(comparison)).toBe(1);
  });

  it('passes a matching-fingerprint 9% median regression', () => {
    const comparison = compareBenchmarkRuns(run(100), run(109));
    expect(comparison.issues).toEqual([]);
    expect(benchmarkGateExitCode(comparison)).toBe(0);
  });

  it('refuses to compare mismatched workload fingerprints', () => {
    const comparison = compareBenchmarkRuns(run(100), run(100, 'different'));
    expect(comparison).toMatchObject({
      compared: 0,
      issues: [{ kind: 'incompatible' }],
    });
    expect(benchmarkGateExitCode(comparison)).toBe(1);
  });
});
