import { describe, expect, it } from 'vitest';
import { benchmarkGateExitCode, compareBenchmarkRuns } from '#benchmarks/benchmark-comparator.js';
import type { ComparableBenchmarkRun } from '#benchmarks/benchmark-comparator.js';
import { noRendererAdapter } from '#benchmarks/measurement-tags.js';
import type { MeasurementTags } from '#benchmarks/measurement-tags.js';

const tags = (build: MeasurementTags['build'] = 'production'): MeasurementTags => ({
  build,
  wasmVariant: 'single',
  adapter: noRendererAdapter,
  kernelProcess: { kind: 'in-process', role: 'test', pid: 1 },
  crossOriginIsolated: false,
  contention: { tag: 'quiet', source: 'operator', loadAverage1m: 0.5, cpuCount: 12 },
});

const run = (
  median: number,
  overrides: Partial<ComparableBenchmarkRun['results'][number]> = {},
  measurement?: MeasurementTags,
): ComparableBenchmarkRun => ({
  runnerFingerprint: 'runner',
  ...(measurement ? { measurement } : {}),
  results: [
    {
      name: 'box',
      median,
      workloadFingerprint: 'workload',
      outputHash: 'geometry',
      coefficientOfVariation: 0.02,
      ...overrides,
    },
  ],
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
    const comparison = compareBenchmarkRuns(run(100), run(100, { workloadFingerprint: 'different' }));
    expect(comparison).toMatchObject({
      compared: 0,
      issues: [{ kind: 'incompatible' }],
    });
    expect(benchmarkGateExitCode(comparison)).toBe(1);
  });

  it('rejects an over-spread case instead of averaging it (charter D14)', () => {
    const comparison = compareBenchmarkRuns(run(100), run(100, { coefficientOfVariation: 0.11 }));
    expect(comparison).toMatchObject({
      compared: 0,
      issues: [{ kind: 'unstable', message: 'current coefficient of variation 11.0% exceeds 10%' }],
    });
    expect(benchmarkGateExitCode(comparison)).toBe(1);
  });

  it('rejects a case whose spread was never recorded', () => {
    const comparison = compareBenchmarkRuns(run(100), run(100, { coefficientOfVariation: undefined }));
    expect(comparison.issues).toMatchObject([
      { kind: 'unstable', message: 'current coefficient of variation is unrecorded' },
    ]);
  });

  it('refuses to compare a development-build run against a production one', () => {
    const comparison = compareBenchmarkRuns(run(100, {}, tags()), run(100, {}, tags('development')));
    expect(comparison).toMatchObject({
      compared: 0,
      issues: [{ kind: 'incompatible', message: 'measurement conditions differ' }],
    });
  });

  it('compares two runs measured under the same conditions', () => {
    const comparison = compareBenchmarkRuns(run(100, {}, tags()), run(100, {}, tags()));
    expect(comparison).toMatchObject({ compared: 1, issues: [] });
  });
});
