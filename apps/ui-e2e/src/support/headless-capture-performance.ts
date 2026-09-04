import { z } from 'zod';

/* oxlint-disable tau-lint/no-time-unit-suffix -- The durable benchmark artifact names its millisecond unit explicitly. */

const sampleSchema = z.object({
  clickToVisibleMs: z.number().positive(),
  digest: z.string().regex(/^[\da-f]{64}$/u),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  modelPixels: z.number().int().positive(),
});

const recordedRevisionSchema = z
  .string()
  .min(1)
  .refine((value) => value !== 'unrecorded', 'Revision must be recorded');
const recordedSha256Schema = z
  .string()
  .regex(/^[\da-f]{64}$/u)
  .refine((value) => value !== '0'.repeat(64), 'SHA-256 must be recorded');

const provenanceSchema = z.object({
  tauRevision: recordedRevisionSchema,
  implementationSnapshotSha256: recordedSha256Schema,
  harnessSha256: recordedSha256Schema,
  nanorasterRevision: recordedRevisionSchema,
  nanorasterTarballSha256: recordedSha256Schema,
});

const summarySchema = z.object({
  count: z.number().int().positive(),
  minimum: z.number().nonnegative(),
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  p99: z.number().nonnegative(),
  maximum: z.number().nonnegative(),
  mean: z.number().nonnegative(),
  standardDeviation: z.number().nonnegative(),
  coefficientOfVariation: z.number().nonnegative(),
});

export const benchmarkArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.string().min(1),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  provenance: provenanceSchema.optional(),
  environment: z.object({
    browser: z.string().min(1),
    launchArguments: z.array(z.string()),
    adapter: z.object({
      backend: z.string().min(1),
      name: z.string(),
      deviceType: z.enum(['cpu', 'unknown']),
    }),
    crossOriginIsolated: z.boolean(),
    hardwareConcurrency: z.number().int().positive(),
    viewport: z.tuple([z.number().positive(), z.number().positive()]),
  }),
  scenarios: z.record(
    z.string(),
    z.object({
      warmups: z.number().int().nonnegative(),
      discarded: z.array(z.object({ reason: z.string().min(1) })),
      samples: z.array(sampleSchema).min(1),
      summary: summarySchema,
    }),
  ),
  workers: z.object({ names: z.array(z.string()), terminations: z.number().int().nonnegative() }),
  longTasks: z.record(z.string(), z.array(z.number().nonnegative())),
  debugRecords: z.array(z.unknown()),
});

export type BenchmarkSample = z.infer<typeof sampleSchema>;
export type BenchmarkSummary = z.infer<typeof summarySchema>;
export type BenchmarkArtifact = z.infer<typeof benchmarkArtifactSchema>;

export const readBenchmarkProvenance = (
  environment: Readonly<Record<string, string | undefined>>,
): BenchmarkArtifact['provenance'] => {
  const provenance = {
    tauRevision: environment['VITE_TAU_BENCH_TAU_REVISION'],
    implementationSnapshotSha256: environment['VITE_TAU_BENCH_IMPLEMENTATION_SHA256'],
    harnessSha256: environment['VITE_TAU_BENCH_HARNESS_SHA256'],
    nanorasterRevision: environment['VITE_TAU_BENCH_NANORASTER_REVISION'],
    nanorasterTarballSha256: environment['VITE_TAU_BENCH_NANORASTER_TARBALL_SHA256'],
  };
  const supplied = Object.values(provenance).filter((value) => value !== undefined);
  if (supplied.length === 0) {
    return undefined;
  }
  if (supplied.length !== Object.keys(provenance).length) {
    throw new Error('Benchmark provenance must be supplied in full');
  }
  return provenanceSchema.parse(provenance);
};

/** Linear interpolation over the zero-based `(n - 1) * quantile` rank. */
export const percentile = (values: readonly number[], quantile: number): number => {
  if (values.length === 0 || quantile < 0 || quantile > 1) {
    throw new RangeError('percentile requires samples and a quantile from zero through one');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (sorted.length - 1) * quantile;
  const lower = Math.floor(rank);
  const fraction = rank - lower;
  return sorted[lower]! + (sorted[Math.ceil(rank)]! - sorted[lower]!) * fraction;
};

export const summarizeSamples = (samples: readonly BenchmarkSample[]): BenchmarkSummary => {
  const values = samples.map(({ clickToVisibleMs }) => clickToVisibleMs);
  if (values.length === 0) {
    throw new RangeError('benchmark summary requires at least one sample');
  }
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const standardDeviation = Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
  return {
    count: values.length,
    minimum: Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    maximum: Math.max(...values),
    mean,
    standardDeviation,
    coefficientOfVariation: mean === 0 ? 0 : standardDeviation / mean,
  };
};

export type BenchmarkComparison = Readonly<{
  savedMs: number;
  reductionPercent: number;
  speedup: number;
  result: 'improvement' | 'regression';
}>;

export const compareMilliseconds = (baseline: number, candidate: number): BenchmarkComparison => ({
  savedMs: baseline - candidate,
  reductionPercent: ((baseline - candidate) / baseline) * 100,
  speedup: baseline / candidate,
  result: candidate <= baseline ? 'improvement' : 'regression',
});

export const adapterCohort = (adapter: BenchmarkArtifact['environment']['adapter']): string =>
  `${adapter.backend}:${adapter.deviceType}:${adapter.name}`;

/* oxlint-enable tau-lint/no-time-unit-suffix -- Durable artifact field scope ends here. */
