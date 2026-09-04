import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/naming-convention -- Tests mirror the benchmark environment contract. */
/* oxlint-disable no-restricted-imports -- The Node-only unit target does not load the browser config's path aliases. */
/* oxlint-disable import/extensions -- The Node-only unit target resolves this TypeScript helper through its emitted `.js` name. */
import {
  adapterCohort,
  benchmarkArtifactSchema,
  compareMilliseconds,
  percentile,
  readBenchmarkProvenance,
  summarizeSamples,
} from './headless-capture-performance.js';

/* oxlint-disable tau-lint/no-time-unit-suffix -- Tests exercise the durable benchmark artifact field names. */

const digest = 'a'.repeat(64);
const sample = (clickToVisibleMs: number) => ({
  clickToVisibleMs,
  digest,
  width: 1600,
  height: 1600,
  modelPixels: 100,
});

describe('headless capture benchmark evidence', () => {
  it('uses one linear percentile function and reproducible comparison equations', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(25);
    expect(percentile([10, 20, 30], 0.95)).toBe(29);
    expect(summarizeSamples([sample(10), sample(30)])).toMatchObject({
      count: 2,
      mean: 20,
      p50: 20,
      standardDeviation: 10,
      coefficientOfVariation: 0.5,
    });
    expect(compareMilliseconds(400, 100)).toEqual({
      savedMs: 300,
      reductionPercent: 75,
      speedup: 4,
      result: 'improvement',
    });
    expect(compareMilliseconds(100, 125).result).toBe('regression');
  });

  it('rejects invalid samples and keeps adapter cohorts distinct', () => {
    expect(() =>
      benchmarkArtifactSchema.parse({
        schemaVersion: 1,
        source: 'candidate',
        startedAt: new Date(0).toISOString(),
        finishedAt: new Date(1).toISOString(),
        environment: {
          browser: 'Chromium',
          launchArguments: [],
          adapter: { backend: 'webgpu', name: 'GPU', deviceType: 'unknown' },
          crossOriginIsolated: true,
          hardwareConcurrency: 8,
          viewport: [1440, 960],
        },
        scenarios: {
          exact: {
            warmups: 0,
            discarded: [],
            samples: [{ ...sample(-1), digest: 'invalid' }],
            summary: summarizeSamples([sample(1)]),
          },
        },
        workers: { names: [], terminations: 0 },
        longTasks: {},
        debugRecords: [],
      }),
    ).toThrow();
    expect(adapterCohort({ backend: 'webgpu', name: 'GPU', deviceType: 'unknown' })).not.toBe(
      adapterCohort({ backend: 'webgpu', name: 'SwiftShader', deviceType: 'cpu' }),
    );
  });

  it('accepts absent or complete provenance and rejects partial or placeholder records', () => {
    expect(readBenchmarkProvenance({})).toBeUndefined();
    expect(() => readBenchmarkProvenance({ VITE_TAU_BENCH_TAU_REVISION: 'abc123' })).toThrow(
      'Benchmark provenance must be supplied in full',
    );
    expect(() =>
      readBenchmarkProvenance({
        VITE_TAU_BENCH_TAU_REVISION: 'unrecorded',
        VITE_TAU_BENCH_IMPLEMENTATION_SHA256: '0'.repeat(64),
        VITE_TAU_BENCH_HARNESS_SHA256: '0'.repeat(64),
        VITE_TAU_BENCH_NANORASTER_REVISION: 'unrecorded',
        VITE_TAU_BENCH_NANORASTER_TARBALL_SHA256: '0'.repeat(64),
      }),
    ).toThrow();

    expect(
      readBenchmarkProvenance({
        VITE_TAU_BENCH_TAU_REVISION: 'tau-revision',
        VITE_TAU_BENCH_IMPLEMENTATION_SHA256: 'a'.repeat(64),
        VITE_TAU_BENCH_HARNESS_SHA256: 'b'.repeat(64),
        VITE_TAU_BENCH_NANORASTER_REVISION: 'nanoraster-revision',
        VITE_TAU_BENCH_NANORASTER_TARBALL_SHA256: 'c'.repeat(64),
      }),
    ).toMatchObject({ tauRevision: 'tau-revision', nanorasterRevision: 'nanoraster-revision' });
  });
});

/* oxlint-enable tau-lint/no-time-unit-suffix -- Durable artifact field scope ends here. */
/* oxlint-enable no-restricted-imports -- Same-directory helper import scope ends here. */
/* oxlint-enable import/extensions -- Same-directory helper import scope ends here. */
/* eslint-enable @typescript-eslint/naming-convention -- Benchmark environment fixture scope ends here. */
