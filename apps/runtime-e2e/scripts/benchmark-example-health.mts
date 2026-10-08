/**
 * Benchmark the manifest-complete Tau example GeoSpec suite on the native serial runner.
 *
 * ponytail: serial only. The native Node pool builds its own default Runtime and cannot host the
 * example Runtime (`@taucad/tau-examples/runtime`) the corpus needs; add a pool mode when it can.
 *
 * Implements docs/research/tau-examples-geospec-health-blueprint.md. Reports are written
 * outside source-controlled model roots and contain raw runner results plus environment provenance.
 *
 * Optional env vars:
 *   TAU_GEOSPEC_SAMPLES  Measured repetitions (default: 3)
 *   TAU_GEOSPEC_WARMUPS  Unmeasured repetitions (default: 1)
 *   TAU_GEOSPEC_OUTPUT   Report path, absolute or repository-relative
 *   TAU_EXAMPLE_PATTERN  Regular expression selecting `<kernel>.<name>` example rows (default: all)
 *   TAU_PICOGK_RESOURCE_ROOT                           Native example host configuration
 *
 * Usage:
 *   pnpm nx run runtime-e2e:benchmark-example-health
 *
 * Exit codes:
 *   0  Every sample produced the same clean current-manifest verdict
 *   1  Invalid configuration, failed verdict, or report failure
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, freemem, hostname, platform, release, totalmem } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createNodeVmFileSystem } from '@taucad/geospec-engine/node-filesystem';
import { Engine } from '@taucad/geospec-engine-native/node';
import { createExampleGeoSpecRuntimeClient } from '@taucad/tau-examples/runtime';
import { createGeoSpecNativeModelLoader, createNativeGeoSpecRunner } from 'geospec/runner/native';
import type { GeoSpecNativeLoadModelOptions, ManagedGeoSpecNativeModelLoader } from 'geospec/runner/native';
import type { GeoSpecRunner, GeoSpecRunnerEvent, GeoSpecRunnerResult } from 'geospec/runner/worker';

type ModelObservation = {
  file: string;
  unavailable: readonly ['vertexCount', 'primitiveCount', 'triangleCount', 'diagnostics'];
  reason: string;
};
type Sample = {
  iteration: number;
  wallDurationMs: number;
  result: GeoSpecRunnerResult;
  forensic: Array<Extract<GeoSpecRunnerEvent, { type: 'forensic' }>>;
  shards: Array<Extract<GeoSpecRunnerEvent, { type: 'file-complete' }>>;
  observations: ModelObservation[];
};
const repoRoot = resolve(import.meta.dirname, '../../..');
const examplesRoot = resolve(repoRoot, 'libs/tau-examples');
const examplesSource = resolve(examplesRoot, 'src');
const specFile = 'example-health.geospec.ts';
const examplePattern = process.env['TAU_EXAMPLE_PATTERN'];

const positiveInteger = (name: string, fallback: number, minimum = 1): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}.`);
  }
  return value;
};

const command = (file: string, args: string[]): string => {
  try {
    return execFileSync(file, args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unavailable';
  }
};

const digest = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('Expected binary file data while hashing.');
    }
    hash.update(chunk);
  }
  return hash.digest('hex');
};

const corpusFingerprint = async (paths: readonly string[]): Promise<string> => {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) {
    // oxlint-disable-next-line no-await-in-loop -- Hash large model assets sequentially to bound benchmark preparation memory.
    hash.update(`${path}\0${await digest(resolve(examplesSource, path))}\0`);
  }
  return hash.digest('hex');
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};

const createRunner = (observations: Map<string, ModelObservation>): GeoSpecRunner => {
  const engine = new Engine();
  const baseLoader = createGeoSpecNativeModelLoader({
    engine,
    projectPath: examplesSource,
    runtime: async () => createExampleGeoSpecRuntimeClient(examplesRoot),
  });
  const nativeModelLoader: ManagedGeoSpecNativeModelLoader = Object.assign(
    async (options: GeoSpecNativeLoadModelOptions) => {
      const subject = await baseLoader(options);
      if ('file' in options) {
        observations.set(options.file, {
          file: options.file,
          unavailable: ['vertexCount', 'primitiveCount', 'triangleCount', 'diagnostics'],
          reason:
            'The public model-loader subject is opaque; obtaining mesh counts would require a second load and distort benchmark timing.',
        });
      }
      return subject;
    },
    { releaseAll: async () => baseLoader.releaseAll() },
  );
  const runner = createNativeGeoSpecRunner({
    filesystem: createNodeVmFileSystem(examplesRoot),
    nativeAssertions: { engine },
    nativeModelLoader,
  });
  return {
    ...runner,
    async close() {
      try {
        await runner.close();
      } finally {
        engine.close();
      }
    },
  };
};

const runSample = async (options: { iteration: number; expectedModels: number }): Promise<Sample> => {
  const started = performance.now();
  const observations = new Map<string, ModelObservation>();
  const runner = createRunner(observations);
  const forensic: Sample['forensic'] = [];
  const shards: Sample['shards'] = [];
  runner.on('forensic', (event) => forensic.push(event));
  runner.on('file-complete', (event) => shards.push(event));
  let sample: Sample | undefined;
  try {
    const result = await runner.run({
      files: [specFile],
      forensic: true,
      testTimeout: 300_000,
      ...(examplePattern ? { testNamePattern: examplePattern } : {}),
    });
    const wallDurationMs = performance.now() - started;
    if (!result.success || result.failed !== 0 || result.passed !== options.expectedModels) {
      const failures = result.files.map(({ file, result: fileResult }) => ({
        file,
        ...(fileResult.success
          ? {
              tests: fileResult.tests
                .filter(({ status }) => status === 'failed')
                .slice(0, 3)
                .map(({ name, diagnostics }) => ({ name, diagnostics })),
            }
          : { issues: fileResult.issues }),
      }));
      throw new Error(
        `serial sample ${options.iteration} failed: ${JSON.stringify({
          success: result.success,
          passed: result.passed,
          failed: result.failed,
          selectedTests: result.selectedTests,
          issues: result.issues,
          failures,
        })}`,
      );
    }
    sample = {
      iteration: options.iteration,
      wallDurationMs,
      result,
      forensic,
      shards,
      observations: [...observations.values()],
    };
  } finally {
    await runner.close();
    if (sample) {
      sample.wallDurationMs = performance.now() - started;
    }
  }
  return sample;
};

const summarize = (samples: readonly Sample[]): Record<string, unknown> => {
  if (samples.length === 0) {
    return {};
  }
  const forensicTotals = new Map<string, number>();
  for (const event of samples.flatMap(({ forensic }) => forensic)) {
    forensicTotals.set(event.name, (forensicTotals.get(event.name) ?? 0) + event.value);
  }
  const tests = samples.flatMap(({ result }) =>
    result.files.flatMap(({ result: fileResult }) =>
      fileResult.success
        ? fileResult.tests.map((test) => ({
            name: [...test.suite, test.name].join(' > '),
            durationMs: test.durationMs ?? 0,
          }))
        : [],
    ),
  );
  const durations = samples.map(({ wallDurationMs }) => wallDurationMs);
  return {
    serial: {
      samples: samples.length,
      durations,
      medianDurationMs: median(durations),
      spread: Math.max(...durations) - Math.min(...durations),
      slowestTests: tests.sort((left, right) => right.durationMs - left.durationMs).slice(0, 10),
      forensicTotals: Object.fromEntries([...forensicTotals].sort(([left], [right]) => left.localeCompare(right))),
      shardDurations: samples.flatMap(({ shards }) => shards.map(({ durationMs }) => durationMs ?? 0)),
    },
  };
};

const auditLedger = (
  samples: readonly Sample[],
  models: ReadonlyArray<{ kernel: string; name: string; mainFile?: string; geometry: string }>,
) =>
  models.map((model) => {
    const locator = `${model.kernel}.${model.name}`;
    const file = `kernels/${model.kernel}/${model.name}/${model.mainFile ?? ''}`;
    const observation = samples.flatMap(({ observations }) => observations).find((entry) => entry.file === file);
    const values = samples.flatMap((sample) =>
      sample.result.files.flatMap(({ result }) =>
        result.success
          ? result.tests.filter(({ name }) => name === locator).map(({ durationMs }) => durationMs ?? 0)
          : [],
      ),
    );
    const timings = { serial: values.length === 0 ? undefined : { samples: values, medianMs: median(values) } };
    return {
      locator,
      kernel: model.kernel,
      entryPath: file,
      geometry: model.geometry,
      executionRoute: 'tau-runtime',
      ...observation,
      assertions: {
        diagnostics: 'clean',
        finitePositions: true,
        degenerateTriangles: 0,
        duplicateFaces: 0,
        watertight: model.geometry === '3d',
      },
      timings,
      status: 'remediated',
    };
  });

const main = async (): Promise<void> => {
  // Nx sets FORCE_COLOR while some shells set NO_COLOR; child runtime workers
  // otherwise emit one Node warning per model and contaminate timing output.
  delete process.env['NO_COLOR'];
  const samplesPerMode = positiveInteger('TAU_GEOSPEC_SAMPLES', 3);
  const warmups = positiveInteger('TAU_GEOSPEC_WARMUPS', 1, 0);
  const manifest = JSON.parse(await readFile(resolve(examplesSource, 'manifest.json'), 'utf8')) as Array<{
    kind: string;
    geometry: string;
    kernel: string;
    name: string;
    mainFile?: string;
    files: string[];
  }>;
  const models = manifest.filter(
    ({ kind, kernel, name }) =>
      kind === 'model' && (!examplePattern || new RegExp(examplePattern).test(`${kernel}.${name}`)),
  );
  const expectedModels = models.length;
  // Include shared imports outside individual model directories as well.
  const corpusEntries = await readdir(examplesSource, { recursive: true, withFileTypes: true });
  const corpusPaths = corpusEntries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(examplesSource, resolve(entry.parentPath, entry.name)));
  const fingerprintBefore = await corpusFingerprint(corpusPaths);
  const samples: Sample[] = [];

  /* oxlint-disable no-await-in-loop -- Benchmark samples must not overlap or share CPU/memory contention. */
  for (let iteration = -warmups; iteration < samplesPerMode; iteration++) {
    const measured = iteration >= 0;
    console.log(`→ serial ${measured ? `sample ${iteration + 1}/${samplesPerMode}` : 'warm-up'}`);
    const sample = await runSample({ iteration, expectedModels });
    if (measured) {
      samples.push(sample);
    }
  }
  /* oxlint-enable no-await-in-loop -- Resume normal async-loop checks after the sequential samples. */

  const configuredOutput = process.env['TAU_GEOSPEC_OUTPUT'] ?? 'out/reports/tau-example-geospec-health.json';
  const output = isAbsolute(configuredOutput) ? configuredOutput : resolve(repoRoot, configuredOutput);
  const report = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    environment: {
      commit: command('git', ['rev-parse', 'HEAD']),
      dirty: command('git', ['status', '--porcelain']) !== '',
      os: { platform: platform(), release: release(), architecture: process.arch, hostname: hostname() },
      cpu: {
        model: cpus()[0]?.model ?? 'unknown',
        logicalCores: cpus().length,
        availableParallelism: availableParallelism(),
      },
      memory: { totalBytes: totalmem(), freeBytesAtReport: freemem() },
      node: process.version,
      pnpm: command('pnpm', ['--version']),
      processElapsedAtReport: process.uptime() * 1000,
      lockfileHash: await digest(resolve(repoRoot, 'pnpm-lock.yaml')),
      corpusFingerprint: fingerprintBefore,
      corpusUnchanged: fingerprintBefore === (await corpusFingerprint(corpusPaths)),
      packageHashes: {
        geospec: await digest(resolve(repoRoot, 'packages/geospec/package.json')),
        geospecEngine: await digest(resolve(repoRoot, 'packages/geospec-engine/package.json')),
        geospecEngineNative: await digest(resolve(repoRoot, 'packages/geospec-engine-native/package.json')),
        runtime: await digest(resolve(repoRoot, 'packages/runtime/package.json')),
      },
    },
    configuration: {
      timingUnit: 'milliseconds',
      modes: ['serial'],
      samplesPerMode,
      warmups,
      expectedModels,
      examplePattern: examplePattern ?? null,
      wallBoundary: 'runner construction through close; excludes process startup/reporting',
      sampleMeaning: 'each sample constructs a fresh runner, engine and runtime; no evidence is cached',
      ordering: 'samples sequential',
    },
    summary: summarize(samples),
    auditLedger: samples.length === 0 ? [] : auditLedger(samples, models),
    samples,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`✓ wrote ${output}`);
};

try {
  await main();
} catch (error) {
  console.error('example-health benchmark failed:', error);
  process.exit(1);
}
