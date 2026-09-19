import { describe, expect, it } from 'vitest';
/* eslint-disable @typescript-eslint/naming-convention -- Tests mirror the benchmark environment contract. */
/* eslint-disable @nx/enforce-module-boundaries -- the measurement contract has one owner, shared by both harnesses. */
/* oxlint-disable no-restricted-imports -- The Node-only unit target does not load the browser config's path aliases. */
/* oxlint-disable import/extensions -- The Node-only unit target resolves this TypeScript helper through its emitted `.js` name. */
import {
  adapterCohort,
  benchmarkArtifactSchema,
  compareMilliseconds,
  measurementTagsSchema,
  percentile,
  readBenchmarkMeasurement,
  readBenchmarkProvenance,
  summarizeSamples,
} from './headless-capture-performance.js';
import { budgetVerdict } from '../../../runtime-e2e/src/benchmarks/measurement-tags.ts';
import type { MeasurementTags } from '../../../runtime-e2e/src/benchmarks/measurement-tags.ts';

/* oxlint-disable tau-lint/no-time-unit-suffix -- Tests exercise the durable benchmark artifact field names. */

const digest = 'a'.repeat(64);
const measurement: MeasurementTags = {
  build: 'production',
  wasmVariant: 'multi',
  adapter: { api: 'webgpu', angle: 'metal', name: 'Apple M2 Pro', implementation: 'hardware' },
  kernelProcess: { kind: 'worker', role: 'cad-kernel', pid: 501 },
  crossOriginIsolated: true,
  contention: { tag: 'quiet', source: 'operator', loadAverage1m: 0.7, cpuCount: 12 },
};
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
      varianceAccepted: false,
    });
    expect(summarizeSamples([sample(100), sample(105)])).toMatchObject({ varianceAccepted: true });
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

  it('records the measurement conditions a budget binds to, and refuses a run without them', () => {
    expect(measurementTagsSchema.parse(measurement)).toEqual(measurement);
    expect(() =>
      measurementTagsSchema.parse({ ...measurement, contention: { ...measurement.contention, tag: 'unknown' } }),
    ).toThrow();

    const summary = summarizeSamples([sample(100), sample(105)]);
    expect(budgetVerdict({ tags: measurement, coefficientOfVariation: summary.coefficientOfVariation })).toEqual({
      eligible: true,
      refusals: [],
    });
    expect(budgetVerdict({ coefficientOfVariation: summary.coefficientOfVariation }).refusals).toEqual([
      'measurement tags are absent',
    ]);
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

describe('readBenchmarkMeasurement', () => {
  const observed = {
    adapter: { api: 'webgpu', angle: 'metal', name: 'Apple M2', implementation: 'hardware' },
    crossOriginIsolated: true,
    cpuCount: 12,
  } as const;

  it('assembles the tags a budget needs from the run that produced them', () => {
    const tags = readBenchmarkMeasurement(
      {
        VITE_TAU_MEASUREMENT_LOAD_1M: '2.5',
        VITE_TAU_MEASUREMENT_BUILD: 'production',
        VITE_TAU_MEASUREMENT_CONTENTION: 'quiet',
      },
      observed,
    );

    expect(measurementTagsSchema.parse(tags)).toMatchObject({
      build: 'production',
      adapter: observed.adapter,
      crossOriginIsolated: true,
      contention: { tag: 'quiet', source: 'operator', loadAverage1m: 2.5, cpuCount: 12 },
    });
  });

  it('records no tags at all when the run did not record its load', () => {
    // I13: an unknown contention is not a quiet one. Absent tags refuse the budget; invented ones bind it.
    expect(readBenchmarkMeasurement({}, observed)).toBeUndefined();
  });
});

/* oxlint-enable tau-lint/no-time-unit-suffix -- Durable artifact field scope ends here. */
/* oxlint-enable no-restricted-imports -- Same-directory helper import scope ends here. */
/* oxlint-enable import/extensions -- Same-directory helper import scope ends here. */
/* eslint-enable @typescript-eslint/naming-convention -- Benchmark environment fixture scope ends here. */
/* eslint-enable @nx/enforce-module-boundaries -- cross-harness measurement owner scope ends here. */
