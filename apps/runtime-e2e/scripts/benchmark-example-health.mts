/**
 * Benchmark the manifest-complete Tau example GeoSpec suite in cold/warm serial/worker modes.
 *
 * Implements docs/research/tau-examples-geospec-health-blueprint.md. Reports are written
 * outside source-controlled model roots and contain raw runner results plus environment provenance.
 *
 * Optional env vars:
 *   TAU_GEOSPEC_SAMPLES  Measured repetitions per mode (default: 3)
 *   TAU_GEOSPEC_WARMUPS  Unmeasured repetitions per mode (default: 1)
 *   TAU_GEOSPEC_WORKERS  Worker count (default: capacity-derived, capped at 4)
 *   TAU_GEOSPEC_MODES    Comma-separated mode subset (default: all four modes)
 *   TAU_GEOSPEC_OUTPUT   Report path, absolute or repository-relative
 *   TAU_GEOSPEC_CLOSEOUT Add focused public-analysis/diagnostic measurements (1)
 *   TAU_GEOSPEC_FOCUS_ONLY Skip the corpus and run only focused measurements (1)
 *   TAU_PICOGK_RESOURCE_ROOT / TAU_NATIVE_CODE_TRUST_FILE Native example host configuration
 *
 * Usage:
 *   pnpm nx run runtime-e2e:benchmark-example-health
 *
 * Exit codes:
 *   0  Every sample produced the same clean current-manifest verdict
 *   1  Invalid configuration, failed verdict, or report failure
 */

import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, freemem, hostname, platform, release, tmpdir, totalmem } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import '@taucad/geospec-engine/register/node';
import { createExampleGeoSpecRuntimeClient } from '@taucad/tau-examples/runtime';
import { createModelLoader } from 'geospec/model';
import { analyzeMesh, loadMesh } from 'geospec/mesh';
import type { GeometryDiagnostic, MeshBufferSource } from 'geospec/mesh';
import { createCollector } from 'geospec/runner';
import { describeGeoSpecEngine, getGeoSpecEngineProtocol } from 'geospec/engine';
import { runnerResultToTestModelOutput } from '@taucad/agent-tools/geospec';
import type { GeoSpecModelLoader } from 'geospec/model';
import { createGeoSpecNodePoolRunner, createGeoSpecNodeRunner, createNodeVmFileSystem } from 'geospec/runner/node';
import type { GeoSpecRunner, GeoSpecRunnerEvent, GeoSpecRunnerResult } from 'geospec/runner/worker';

type Mode = 'serial-cold' | 'serial-warm' | 'workers-cold' | 'workers-warm';
type ModelObservation = {
  file: string;
  vertexCount: number;
  primitiveCount: number;
  triangleCount: number;
  diagnostics: number;
};
type Sample = {
  mode: Mode;
  iteration: number;
  wallDurationMs: number;
  result: GeoSpecRunnerResult;
  forensic: Array<Extract<GeoSpecRunnerEvent, { type: 'forensic' }>>;
  shards: Array<Extract<GeoSpecRunnerEvent, { type: 'file-complete' }>>;
  observations: ModelObservation[];
};
type CreateRunnerOptions = {
  mode: Mode;
  cacheDirectory: string;
  workers: number;
  observations: Map<string, ModelObservation>;
};

const allModes: Mode[] = ['serial-cold', 'serial-warm', 'workers-cold', 'workers-warm'];
const repoRoot = resolve(import.meta.dirname, '../../..');
const examplesRoot = resolve(repoRoot, 'libs/tau-examples');
const examplesSource = resolve(examplesRoot, 'src');
const specFile = 'example-health.geospec.ts';
const runtimeFactoryModule = {
  specifier: pathToFileURL(resolve(examplesRoot, 'scripts/runtime.ts')).href,
  exportName: 'createExampleGeoSpecRuntimeClient',
};

const positiveInteger = (name: string, fallback: number, minimum = 1): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}.`);
  }
  return value;
};

const selectedModes = (): Mode[] => {
  const configured = process.env['TAU_GEOSPEC_MODES'];
  if (!configured) {
    return allModes;
  }
  const modes = configured.split(',') as Mode[];
  const invalid = modes.filter((mode) => !allModes.includes(mode));
  if (invalid.length > 0) {
    throw new Error(`Unknown TAU_GEOSPEC_MODES: ${invalid.join(', ')}`);
  }
  return modes;
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

const createRunner = ({ mode, cacheDirectory, workers, observations }: CreateRunnerOptions): GeoSpecRunner => {
  if (mode.startsWith('workers')) {
    return createGeoSpecNodePoolRunner({
      projectPath: examplesRoot,
      workers,
      cache: true,
      cacheDirectory,
      runtimeFactoryModule,
      shardTimeout: 600_000,
    });
  }
  const baseLoader = createModelLoader({
    projectPath: examplesSource,
    runtime: async () => createExampleGeoSpecRuntimeClient(examplesRoot),
  });
  const modelLoader = Object.assign(
    async (options: Parameters<GeoSpecModelLoader>[0]) => {
      const subject = await baseLoader(options);
      if ('file' in options) {
        observations.set(options.file, {
          file: options.file,
          vertexCount: subject.mesh.stats.vertexCount,
          primitiveCount: subject.mesh.stats.meshCount,
          triangleCount: subject.mesh.stats.triangleCount,
          diagnostics: subject.diagnostics.length,
        });
      }
      return subject;
    },
    { dispose: async () => baseLoader.dispose() },
  ) as GeoSpecModelLoader;
  return createGeoSpecNodeRunner({
    filesystem: createNodeVmFileSystem(examplesRoot),
    projectPath: examplesRoot,
    cache: true,
    cacheDirectory,
    modelLoader,
  });
};

const runSample = async (options: {
  mode: Mode;
  iteration: number;
  cacheDirectory: string;
  workers: number;
  expectedModels: number;
}): Promise<Sample> => {
  const started = performance.now();
  const observations = new Map<string, ModelObservation>();
  const runner = createRunner({
    mode: options.mode,
    cacheDirectory: options.cacheDirectory,
    workers: options.workers,
    observations,
  });
  const forensic: Sample['forensic'] = [];
  const shards: Sample['shards'] = [];
  runner.on('forensic', (event) => forensic.push(event));
  runner.on('file-complete', (event) => shards.push(event));
  let sample: Sample | undefined;
  try {
    const result = await runner.run({ files: [specFile], forensic: true, testTimeout: 300_000 });
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
        `${options.mode} sample ${options.iteration} failed: ${JSON.stringify({
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
      mode: options.mode,
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

const summarize = (samples: readonly Sample[]): Record<string, unknown> =>
  Object.fromEntries(
    allModes
      .map((mode) => {
        const modeSamples = samples.filter((sample) => sample.mode === mode);
        if (modeSamples.length === 0) {
          return undefined;
        }
        const forensicTotals = new Map<string, number>();
        for (const event of modeSamples.flatMap(({ forensic }) => forensic)) {
          forensicTotals.set(event.name, (forensicTotals.get(event.name) ?? 0) + event.value);
        }
        const tests = modeSamples.flatMap(({ result }) =>
          result.files.flatMap(({ result: fileResult }) =>
            fileResult.success
              ? fileResult.tests.map((test) => ({
                  name: [...test.suite, test.name].join(' > '),
                  durationMs: test.durationMs ?? 0,
                }))
              : [],
          ),
        );
        return [
          mode,
          {
            samples: modeSamples.length,
            durations: modeSamples.map(({ wallDurationMs }) => wallDurationMs),
            medianDurationMs: median(modeSamples.map(({ wallDurationMs }) => wallDurationMs)),
            spread:
              Math.max(...modeSamples.map(({ wallDurationMs }) => wallDurationMs)) -
              Math.min(...modeSamples.map(({ wallDurationMs }) => wallDurationMs)),
            peakWorkerMemoryBytes: Math.max(
              0,
              ...modeSamples.flatMap(({ shards }) => shards.map(({ workerMemoryBytes }) => workerMemoryBytes ?? 0)),
            ),
            slowestTests: tests.sort((left, right) => right.durationMs - left.durationMs).slice(0, 10),
            forensicTotals: Object.fromEntries(
              [...forensicTotals].sort(([left], [right]) => left.localeCompare(right)),
            ),
            shardDurations: modeSamples.flatMap(({ shards }) => shards.map(({ durationMs }) => durationMs ?? 0)),
          },
        ];
      })
      .filter((entry) => entry !== undefined),
  ) as Record<string, unknown>;

const auditLedger = (
  samples: readonly Sample[],
  models: ReadonlyArray<{ kernel: string; name: string; mainFile?: string; geometry: string }>,
) =>
  models.map((model) => {
    const locator = `${model.kernel}.${model.name}`;
    const file = `kernels/${model.kernel}/${model.name}/${model.mainFile ?? ''}`;
    const observation = samples.flatMap(({ observations }) => observations).find((entry) => entry.file === file);
    const timings = Object.fromEntries(
      allModes.map((mode) => {
        const values = samples.flatMap((sample) =>
          sample.mode === mode
            ? sample.result.files.flatMap(({ result }) =>
                result.success
                  ? result.tests.filter(({ name }) => name === locator).map(({ durationMs }) => durationMs ?? 0)
                  : [],
              )
            : [],
        );
        return [mode, values.length === 0 ? undefined : { samples: values, medianMs: median(values) }];
      }),
    );
    const workerMemoryBytes = Math.max(
      0,
      ...samples.flatMap(({ shards }) =>
        shards
          .filter(({ result }) => result.success && result.tests.some(({ name }) => name === locator))
          .map(({ workerMemoryBytes: bytes }) => bytes ?? 0),
      ),
    );
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
      workerMemoryBytes,
      status: 'remediated',
    };
  });

const measureCloseout = async (iterations: number) => {
  const source: MeshBufferSource = {
    format: 'mesh-buffer',
    positions: Array.from({ length: 10_000 }, (_, index) => [
      index * 2,
      0,
      0,
      index * 2 + 1,
      0,
      0,
      index * 2,
      1,
      0,
    ]).flat(),
  };
  const samples: Array<Record<string, number>> = [];
  const retainedSupported = describeGeoSpecEngine()?.capabilities.includes('analyzeMesh') ?? false;
  const transportWorker = new Worker(
    "const { parentPort } = require('node:worker_threads'); parentPort.on('message', value => parentPort.postMessage(value));",
    { eval: true },
  );
  try {
    await once(transportWorker, 'online', { signal: AbortSignal.timeout(10_000) });
    for (let iteration = -1; iteration < iterations; iteration++) {
      /* oxlint-disable no-await-in-loop -- Paired workload phases must run sequentially. */
      const started = performance.now();
      const loaded = await loadMesh({ source });
      const loadOnly = performance.now() - started;
      if (!loaded.success) {
        throw new Error('Focused mesh load failed.');
      }
      let fullSubjectId: string | undefined;
      try {
        const collector = createCollector();
        collector.it('counts', () => collector.expectGeo(loaded.subject).toHaveNoDiagnostics());
        const narrowStarted = performance.now();
        await collector.waitForCompletion();
        const narrowMatcher = performance.now() - narrowStarted;
        if (collector.tests[0]?.status !== 'passed') {
          throw new Error('Focused narrow matcher failed.');
        }
        const fullStarted = performance.now();
        const full = retainedSupported ? await analyzeMesh({ subject: loaded.subject }) : await analyzeMesh({ source });
        if (!full.success) {
          throw new Error('Focused full analysis failed.');
        }
        fullSubjectId = full.subject.subjectId;
        // Baseline's full stats were live getters. JSON consumption forces the
        // same public measurement data, while documenting its absent subject API.
        const serialized = JSON.stringify(full.stats);
        const fullAnalysisAndJson = performance.now() - fullStarted;
        const repeatStarted = performance.now();
        const repeated = retainedSupported ? await analyzeMesh({ subject: loaded.subject }) : full;
        if (!repeated.success || JSON.stringify(repeated.stats) !== serialized) {
          throw new Error('Repeated full analysis changed evidence.');
        }
        const repeatedAnalysisAndJson = performance.now() - repeatStarted;
        const diagnostics = Array.from(
          { length: 100 },
          (_, index): GeometryDiagnostic => ({
            code: 'SPATIAL_FAILURE',
            severity: 'error',
            message: `Relationship ${index} failed`,
            spatial: { center: [index, 2, 3] },
            details: { pair: ['gear', `part-${index}`] },
          }),
        );
        const projectionStarted = performance.now();
        const output = runnerResultToTestModelOutput(
          {
            success: false,
            passed: 0,
            failed: 1,
            selectedTests: 1,
            files: [
              {
                file: 'stress.geospec.ts',
                result: {
                  success: true,
                  passed: false,
                  bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
                  tests: [
                    {
                      suite: [],
                      name: 'relationships',
                      status: 'failed',
                      assertions: [
                        { kind: 'watertight', subject: loaded.subject, expected: true, diagnostics, passed: false },
                      ],
                      diagnostics,
                    },
                  ],
                },
              },
            ],
          },
          ['stress.geospec.ts'],
        );
        const projection = performance.now() - projectionStarted;
        const serializationStarted = performance.now();
        const payloadBytes = Buffer.byteLength(JSON.stringify(output));
        const serialization = performance.now() - serializationStarted;
        const transportStarted = performance.now();
        const response = once(transportWorker, 'message', { signal: AbortSignal.timeout(10_000) });
        transportWorker.postMessage(output);
        const message: unknown[] = await response;
        const workerRoundtrip = performance.now() - transportStarted;
        if (JSON.stringify(message[0]) !== JSON.stringify(output)) {
          throw new Error('Worker transport changed diagnostic evidence.');
        }
        if (iteration >= 0) {
          samples.push({
            iteration,
            loadOnly,
            narrowMatcher,
            fullAnalysisAndJson,
            repeatedAnalysisAndJson,
            projection,
            serialization,
            workerRoundtrip,
            subjectBytes: Buffer.byteLength(JSON.stringify(loaded.subject)),
            analysisBytes: Buffer.byteLength(serialized),
            payloadBytes,
            emittedDiagnostics: output.failures[0]?.diagnostics?.length ?? 0,
            rssBytes: process.memoryUsage().rss,
          });
        }
      } finally {
        const ids = new Set([loaded.subject.subjectId, fullSubjectId].filter((id): id is string => id !== undefined));
        for (const subjectId of ids) {
          getGeoSpecEngineProtocol()?.releaseSubject({ requestId: `focus-${iteration}-${subjectId}`, subjectId });
        }
      }
      /* oxlint-enable no-await-in-loop */
    }
    return {
      retainedSupported,
      baselineCaveat: retainedSupported
        ? undefined
        : 'Baseline reloads for the first full read and reuses its live stats for repeat; it has no retained-subject analysis API. Its projection truncates diagnostics. These timings describe correctness costs, not equivalent-contract speedups.',
      triangles: 10_000,
      samples,
      summary: Object.fromEntries(
        [
          'loadOnly',
          'narrowMatcher',
          'fullAnalysisAndJson',
          'repeatedAnalysisAndJson',
          'projection',
          'serialization',
          'workerRoundtrip',
        ].map((key) => {
          const values = samples.map((sample) => Number(Reflect.get(sample, key)));
          return [key, { medianMs: median(values), spread: Math.max(...values) - Math.min(...values) }];
        }),
      ),
    };
  } finally {
    await transportWorker.terminate();
  }
};

const main = async (): Promise<void> => {
  // Nx sets FORCE_COLOR while some shells set NO_COLOR; child runtime workers
  // otherwise emit one Node warning per model and contaminate timing output.
  delete process.env['NO_COLOR'];
  const samplesPerMode = positiveInteger('TAU_GEOSPEC_SAMPLES', 3);
  const warmups = positiveInteger('TAU_GEOSPEC_WARMUPS', 1, 0);
  const capacityWorkers = Math.max(
    1,
    Math.min(4, availableParallelism() - 2, Math.floor(totalmem() / (3.5 * 1024 ** 3))),
  );
  const workers = positiveInteger('TAU_GEOSPEC_WORKERS', capacityWorkers);
  const modes = process.env['TAU_GEOSPEC_FOCUS_ONLY'] === '1' ? [] : selectedModes();
  const manifest = JSON.parse(await readFile(resolve(examplesSource, 'manifest.json'), 'utf8')) as Array<{
    kind: string;
    geometry: string;
    kernel: string;
    name: string;
    mainFile?: string;
    files: string[];
  }>;
  const models = manifest.filter(({ kind }) => kind === 'model');
  const expectedModels = models.length;
  // Include shared imports outside individual model directories as well.
  const corpusEntries = await readdir(examplesSource, { recursive: true, withFileTypes: true });
  const corpusPaths = corpusEntries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(examplesSource, resolve(entry.parentPath, entry.name)));
  const fingerprintBefore = await corpusFingerprint(corpusPaths);
  const temporaryRoots: string[] = [];
  const samples: Sample[] = [];

  try {
    /* oxlint-disable no-await-in-loop -- Benchmark samples must not overlap or share CPU/memory contention. */
    for (const mode of modes) {
      const warmCache = await mkdtemp(join(tmpdir(), `tau-geospec-${mode}-`));
      temporaryRoots.push(warmCache);
      for (let iteration = -warmups; iteration < samplesPerMode; iteration++) {
        const cold = mode.endsWith('cold');
        const cacheDirectory = cold ? await mkdtemp(join(tmpdir(), `tau-geospec-${mode}-`)) : warmCache;
        if (cold) {
          temporaryRoots.push(cacheDirectory);
        }
        const measured = iteration >= 0;
        console.log(`→ ${mode} ${measured ? `sample ${iteration + 1}/${samplesPerMode}` : 'warm-up'}`);
        const sample = await runSample({ mode, iteration, cacheDirectory, workers, expectedModels });
        if (measured) {
          samples.push(sample);
        }
      }
    }
    /* oxlint-enable no-await-in-loop -- Resume normal async-loop checks after the sequential samples. */

    const configuredOutput = process.env['TAU_GEOSPEC_OUTPUT'] ?? 'out/reports/tau-example-geospec-health.json';
    const output = isAbsolute(configuredOutput) ? configuredOutput : resolve(repoRoot, configuredOutput);
    const report = {
      schemaVersion: 2,
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
        workers,
        processElapsedAtReport: process.uptime() * 1000,
        lockfileHash: await digest(resolve(repoRoot, 'pnpm-lock.yaml')),
        corpusFingerprint: fingerprintBefore,
        corpusUnchanged: fingerprintBefore === (await corpusFingerprint(corpusPaths)),
        packageHashes: {
          geospec: await digest(resolve(repoRoot, 'packages/geospec/package.json')),
          geospecEngine: await digest(resolve(repoRoot, 'packages/geospec-engine/package.json')),
          runtime: await digest(resolve(repoRoot, 'packages/runtime/package.json')),
        },
      },
      configuration: {
        timingUnit: 'milliseconds',
        modes,
        samplesPerMode,
        warmups,
        expectedModels,
        wallBoundary: 'runner construction through close; excludes process startup/reporting',
        coldMeaning: 'fresh evidence directory and fresh runner/runtime, not OS page cache',
        warmMeaning: 'reused evidence directory; each sample still constructs fresh runner/runtime',
        ordering: 'modes in configured order, samples sequential',
      },
      closeout:
        process.env['TAU_GEOSPEC_CLOSEOUT'] === '1' || modes.length === 0
          ? await measureCloseout(samplesPerMode)
          : undefined,
      summary: summarize(samples),
      auditLedger: samples.length === 0 ? [] : auditLedger(samples, models),
      samples,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`✓ wrote ${output}`);
  } finally {
    await Promise.all(temporaryRoots.map(async (path) => rm(path, { recursive: true, force: true })));
  }
};

try {
  await main();
} catch (error) {
  console.error('example-health benchmark failed:', error);
  process.exit(1);
}
