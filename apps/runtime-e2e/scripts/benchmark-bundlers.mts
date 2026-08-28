import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

type Arm = 'esbuild-native' | 'rolldown-native';
type Fixture = 'birdhouse' | 'feature-matrix';
type Mode = 'cold' | 'warm';
type Row = {
  readonly detect: number;
  readonly bundle: number;
  readonly execute: number;
  readonly codeBytes: number;
  readonly sourceMapBytes: number;
};
type WorkerSample = {
  readonly import: number;
  readonly initialize: number;
  readonly externalWall: number;
  readonly maxRss: number;
  readonly rows: Row[];
};

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const worker = join(import.meta.dirname, 'benchmark-bundler-worker.mts');
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
  readonly mode: Mode;
  readonly count: number;
  readonly skippedWarmups: number;
}): WorkerSample => {
  const result = spawnSync(
    process.execPath,
    [worker, input.arm, input.fixture, input.mode, String(input.count), String(input.skippedWarmups)],
    { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`${input.arm}/${input.fixture}/${input.mode}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '') as WorkerSample;
};

const raw: Record<Fixture, { cold: Record<Arm, WorkerSample[]>; warm: Partial<Record<Arm, WorkerSample>> }> = {
  birdhouse: { cold: { 'esbuild-native': [], 'rolldown-native': [] }, warm: {} },
  'feature-matrix': { cold: { 'esbuild-native': [], 'rolldown-native': [] }, warm: {} },
};

for (const fixture of fixtures) {
  for (let round = 0; round < warmups; round++) {
    const offset = round % arms.length;
    for (const arm of [...arms.slice(offset), ...arms.slice(0, offset)]) {
      invoke({ arm, fixture, mode: 'cold', count: 1, skippedWarmups: 0 });
    }
  }
  for (let round = 0; round < iterations; round++) {
    const offset = round % arms.length;
    for (const arm of [...arms.slice(offset), ...arms.slice(0, offset)]) {
      raw[fixture].cold[arm].push(invoke({ arm, fixture, mode: 'cold', count: 1, skippedWarmups: 0 }));
    }
  }
  for (const arm of arms) {
    raw[fixture].warm[arm] = invoke({ arm, fixture, mode: 'warm', count: iterations, skippedWarmups: warmups });
  }
}

const summarizeRows = (rows: readonly Row[]) => ({
  detect: stats(rows.map(({ detect }) => detect)),
  bundle: stats(rows.map(({ bundle }) => bundle)),
  execute: stats(rows.map(({ execute }) => execute)),
  lifecycle: stats(rows.map(({ detect, bundle, execute }) => detect + bundle + execute)),
  codeBytes: [...new Set(rows.map(({ codeBytes }) => codeBytes))],
  sourceMapBytes: [...new Set(rows.map(({ sourceMapBytes }) => sourceMapBytes))],
});
const summary: Record<
  Fixture,
  { cold: Partial<Record<Arm, Record<string, unknown>>>; warm: Partial<Record<Arm, Record<string, unknown>>> }
> = {
  birdhouse: { cold: {}, warm: {} },
  'feature-matrix': { cold: {}, warm: {} },
};
for (const fixture of fixtures) {
  for (const arm of arms) {
    const cold = raw[fixture].cold[arm];
    summary[fixture].cold[arm] = {
      import: stats(cold.map((sample) => sample.import)),
      initialize: stats(cold.map((sample) => sample.initialize)),
      externalWall: stats(cold.map((sample) => sample.externalWall)),
      maxRss: stats(cold.map((sample) => sample.maxRss)),
      ...summarizeRows(cold.map((sample) => sample.rows[0]).filter((row): row is Row => row !== undefined)),
    };
    const warm = raw[fixture].warm[arm];
    if (warm === undefined) {
      throw new Error(`Missing warm ${fixture}/${arm} samples.`);
    }
    summary[fixture].warm[arm] = summarizeRows(warm.rows);
  }
}

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
  protocol: { iterations, warmups, design: 'paired round-robin fresh processes; one initialized-process warm cohort' },
  summary,
  raw,
};
mkdirSync(values.output, { recursive: true });
const output = join(values.output, `native-${Date.now()}.json`);
writeFileSync(output, `${JSON.stringify(report, undefined, 2)}\n`);
console.log(JSON.stringify({ output, environment: report.environment, summary }, undefined, 2));
