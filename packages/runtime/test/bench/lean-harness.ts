/**
 * The lean T11 harness: settings, statistics, the run environment and the JSON report shared by the span-path and
 * operation-facts benches.
 *
 * The benches run under plain `node` on a compiled build (`runtime:build-observability-bench`), never under Vitest or a
 * TypeScript loader: the live runtime modules are imported from the package's own `dist`, and only this harness and
 * the frozen reference are compiled beside them, with the package build's target and minifier.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, totalmem } from 'node:os';
import { join } from 'node:path';

/**
 * - `quick`: the per-PR smoke settings (20,500 spans per round, 7 rounds, 3 samples).
 * - `full`: the accepted settings (102,500 spans per round, 15 rounds, 5 runs per sample).
 * - `calibrate`: the accepted settings with at least 60 samples per shape, for the pre-enable calibration.
 */
export type BenchMode = 'quick' | 'full' | 'calibrate';

/** What one invocation of the harness runs, and where it writes. */
export type BenchOptions = Readonly<{
  mode: BenchMode;
  /** Samples per shape; only `calibrate` reads it. */
  samples: number;
  suites: ReadonlySet<'span' | 'facts'>;
  /** Directory the JSON reports are written to. */
  out: string;
}>;

/** Samples per shape the pre-enable calibration needs at least. */
export const calibrationMinimum = 60;

/**
 * Read the bench options from the command line and the environment.
 *
 * @param argv - The arguments after the script.
 * @param environment - The process environment.
 * @returns The options.
 */
export const parseOptions = (argv: readonly string[], environment: NodeJS.ProcessEnv): BenchOptions => {
  const flags = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/u.exec(argument);
    if (match === null) {
      throw new Error(`Unknown argument ${argument}; expected --mode=, --samples=, --suite= or --out=.`);
    }
    flags.set(match[1]!, match[2]!);
  }
  const mode = flags.get('mode') ?? (environment['TAU_SPAN_BENCH'] === 'full' ? 'full' : 'quick');
  if (mode !== 'quick' && mode !== 'full' && mode !== 'calibrate') {
    throw new Error(`--mode must be quick, full or calibrate, not ${mode}.`);
  }
  const samples = Number(flags.get('samples') ?? calibrationMinimum);
  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error(`--samples must be a positive integer, not ${String(flags.get('samples'))}.`);
  }
  if (mode === 'calibrate' && samples < calibrationMinimum) {
    throw new Error(`A calibration needs at least ${String(calibrationMinimum)} samples per shape.`);
  }
  const suite = flags.get('suite') ?? 'all';
  if (suite !== 'all' && suite !== 'span' && suite !== 'facts') {
    throw new Error(`--suite must be all, span or facts, not ${suite}.`);
  }
  return {
    mode,
    samples,
    suites: new Set(suite === 'all' ? (['span', 'facts'] as const) : [suite]),
    out: flags.get('out') ?? join('out', 'reports', 'benchmarks', 'runtime-observability'),
  };
};

/**
 * The value at a fraction of the sorted values, as the Vitest benches read it.
 *
 * @param values - The values.
 * @param fraction - 0.5 for the median, 0.95 for p95.
 * @returns The value.
 */
export const percentile = (values: readonly number[], fraction: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
};

/**
 * The upper median, as the Vitest benches read it.
 *
 * @param values - The values.
 * @returns The value.
 */
export const median = (values: readonly number[]): number => percentile(values, 0.5);

/** A summary of samples. */
export type Distribution = Readonly<{
  count: number;
  min: number;
  median: number;
  p95: number;
  p99: number;
  max: number;
}>;

/**
 * Summarise samples.
 *
 * @param values - The samples.
 * @returns Count, extremes, median, p95 and p99.
 */
export const distribution = (values: readonly number[]): Distribution => ({
  count: values.length,
  min: Math.min(...values),
  median: median(values),
  p95: percentile(values, 0.95),
  p99: percentile(values, 0.99),
  max: Math.max(...values),
});

/**
 * Where the bench ran, so a calibration names its runner.
 *
 * @returns The environment.
 */
export const benchEnvironment = (): Record<string, unknown> => {
  const processors = cpus();
  return {
    harness: 'lean: plain node on the compiled build',
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    cpu: processors[0]?.model,
    cpus: processors.length,
    totalMemoryBytes: totalmem(),
    loadAverage: loadavg(),
    runner: process.env['RUNNER_NAME'],
    commit: process.env['GITHUB_SHA'],
    startedAt: new Date().toISOString(),
  };
};

/**
 * Write one bench's JSON report.
 *
 * @param out - The report directory.
 * @param name - The bench's file name, without extension.
 * @param report - The report.
 * @returns The written path.
 */
export const writeReport = (out: string, name: string, report: unknown): string => {
  mkdirSync(out, { recursive: true });
  const path = join(out, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(report, undefined, 2)}\n`);
  return path;
};

/**
 * One line on stderr.
 *
 * @param line - The line.
 */
export const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};
