/* oxlint-disable eslint/max-depth -- product matrix nesting is intentionally explicit */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

type Arm = 'esbuild-native' | 'rolldown-native';
type Fixture = 'birdhouse' | 'feature-matrix';
type State = 'cold' | 'warm-cache-disabled' | 'full-hot';
type Row = {
  readonly wall: number;
  readonly runtimeRootCoverage: number;
  readonly clientOverhead: number;
  readonly telemetryEntries: number;
  readonly runtimePhases: Readonly<Record<string, number>>;
  readonly bytes: number;
  readonly sha256: string;
};
type WorkerSample = {
  readonly processTimeOrigin: number;
  readonly processDuration: number;
  readonly fixtureLoad: number;
  readonly moduleImport: number;
  readonly clientCreation: number;
  readonly shutdown: number;
  readonly rows: readonly Row[];
  readonly maxRss: number;
  readonly activeHandles: readonly string[];
};
type ExternalSample = WorkerSample & {
  readonly externalWall: number;
  readonly spawnLead: number;
  readonly exitTail: number;
};

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const worker = join(import.meta.dirname, 'benchmark-bundler-product-worker.mts');
const { values } = parseArgs({
  options: {
    iterations: { type: 'string', default: '30' },
    warmups: { type: 'string', default: '5' },
    output: {
      type: 'string',
      default: join(repositoryRoot, 'out/reports/runtime-telemetry/bundler-core-parity'),
    },
  },
});
const iterations = Number(values.iterations);
const warmups = Number(values.warmups);
const arms: readonly Arm[] = ['esbuild-native', 'rolldown-native'];
const fixtures: readonly Fixture[] = ['birdhouse', 'feature-matrix'];
const states: readonly State[] = ['cold', 'warm-cache-disabled', 'full-hot'];

const percentile = (sorted: readonly number[], fraction: number): number =>
  sorted[Math.ceil(sorted.length * fraction) - 1] ?? Number.NaN;
const stats = (samples: readonly number[]) => {
  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  return {
    minimum: sorted[0],
    median: percentile(sorted, 0.5),
    mean,
    p95: percentile(sorted, 0.95),
    maximum: sorted.at(-1),
    standardDeviation: Math.sqrt(variance),
    coefficientOfVariation: mean === 0 ? 0 : Math.sqrt(variance) / mean,
  };
};

const invoke = (input: {
  readonly arm: Arm;
  readonly fixture: Fixture;
  readonly state: State;
  readonly count: number;
  readonly skippedWarmups: number;
}): ExternalSample => {
  const started = performance.now();
  const startEpoch = performance.timeOrigin + started;
  const result = spawnSync(
    process.execPath,
    [worker, input.arm, input.fixture, input.state, String(input.count), String(input.skippedWarmups)],
    { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  const ended = performance.now();
  if (result.status !== 0) {
    throw new Error(`${input.arm}/${input.fixture}/${input.state}: ${result.stderr || result.stdout}`);
  }
  const sample = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '') as WorkerSample;
  const externalWall = ended - started;
  return {
    ...sample,
    externalWall,
    spawnLead: sample.processTimeOrigin - startEpoch,
    exitTail: performance.timeOrigin + ended - (sample.processTimeOrigin + sample.processDuration),
  };
};

const emptyArmSamples = (): Record<Arm, ExternalSample[]> => ({
  'esbuild-native': [],
  'rolldown-native': [],
});
const emptyFixtureSamples = (): Record<State, Record<Arm, ExternalSample[]>> => ({
  cold: emptyArmSamples(),
  'warm-cache-disabled': emptyArmSamples(),
  'full-hot': emptyArmSamples(),
});
const raw: Record<Fixture, Record<State, Record<Arm, ExternalSample[]>>> = {
  birdhouse: emptyFixtureSamples(),
  'feature-matrix': emptyFixtureSamples(),
};

for (const fixture of fixtures) {
  for (const state of states) {
    if (state === 'cold') {
      for (let round = 0; round < warmups + iterations; round += 1) {
        const offset = round % arms.length;
        for (const arm of [...arms.slice(offset), ...arms.slice(0, offset)]) {
          const sample = invoke({ arm, fixture, state, count: 1, skippedWarmups: 0 });
          if (round >= warmups) {
            raw[fixture][state][arm].push(sample);
          }
        }
      }
      continue;
    }
    const offset = fixtures.indexOf(fixture) % arms.length;
    for (const arm of [...arms.slice(offset), ...arms.slice(0, offset)]) {
      raw[fixture][state][arm].push(invoke({ arm, fixture, state, count: iterations, skippedWarmups: warmups }));
    }
  }
}

const flattenRows = (samples: readonly ExternalSample[]): Row[] => samples.flatMap(({ rows }) => rows);
const summarizePhases = (rows: readonly Row[]): Readonly<Record<string, ReturnType<typeof stats>>> =>
  Object.fromEntries(
    [...new Set(rows.flatMap(({ runtimePhases }) => Object.keys(runtimePhases)))].map((name) => [
      name,
      stats(rows.map(({ runtimePhases }) => runtimePhases[name] ?? 0)),
    ]),
  );
const summary = Object.fromEntries(
  fixtures.map((fixture) => [
    fixture,
    Object.fromEntries(
      states.map((state) => [
        state,
        Object.fromEntries(
          arms.map((arm) => {
            const samples = raw[fixture][state][arm];
            const rows = flattenRows(samples);
            return [
              arm,
              {
                wall: stats(rows.map(({ wall }) => wall)),
                runtimeRootCoverage: stats(rows.map(({ runtimeRootCoverage }) => runtimeRootCoverage)),
                clientOverhead: stats(rows.map(({ clientOverhead }) => clientOverhead)),
                runtimePhases: summarizePhases(rows),
                ...(state === 'cold'
                  ? {
                      externalWall: stats(samples.map(({ externalWall }) => externalWall)),
                      spawnLead: stats(samples.map(({ spawnLead }) => spawnLead)),
                      fixtureLoad: stats(samples.map(({ fixtureLoad }) => fixtureLoad)),
                      moduleImport: stats(samples.map(({ moduleImport }) => moduleImport)),
                      clientCreation: stats(samples.map(({ clientCreation }) => clientCreation)),
                      shutdown: stats(samples.map(({ shutdown }) => shutdown)),
                      exitTail: stats(samples.map(({ exitTail }) => exitTail)),
                      maxRss: stats(samples.map(({ maxRss }) => maxRss)),
                    }
                  : {}),
                outputs: [...new Set(rows.map(({ bytes, sha256 }) => `${bytes}:${sha256}`))],
                activeHandles: [...new Set(samples.flatMap(({ activeHandles }) => activeHandles))],
              },
            ];
          }),
        ),
      ]),
    ),
  ]),
);

const git = (...arguments_: string[]): string =>
  spawnSync('git', arguments_, { cwd: repositoryRoot, encoding: 'utf8' }).stdout.trim();
const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    commit: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain').length > 0,
    cpu: cpus()[0]?.model,
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    pnpm: spawnSync('pnpm', ['--version'], { cwd: repositoryRoot, encoding: 'utf8' }).stdout.trim(),
  },
  protocol: {
    iterations,
    warmups,
    design: 'paired round-robin fresh-process cold; one initialized process per warm state and arm',
    replicadWasm: 'multi',
  },
  summary,
  raw,
};
mkdirSync(values.output, { recursive: true });
const output = join(values.output, `native-product-${Date.now()}.json`);
writeFileSync(output, `${JSON.stringify(report, undefined, 2)}\n`);
console.log(JSON.stringify({ output, environment: report.environment, summary }, undefined, 2));
