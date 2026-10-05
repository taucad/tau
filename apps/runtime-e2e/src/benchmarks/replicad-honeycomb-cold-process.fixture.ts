import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBenchmarks } from '#benchmarks/benchmark-runner.js';

type ColdProcessInput = {
  cpuDiagnostic: boolean;
  source: string;
  sourceDigest: string;
  wasmUrl: string;
  wasmBindingsUrl: string;
  wasmDigest: string;
  bindingsDigest: string;
  gitHead: string;
  implementationSources: ReadonlyArray<{ path: string; digest: string }>;
};

const [inputPath, resultPath] = process.argv.slice(2);
if (!inputPath || !resultPath) {
  throw new Error('Cold-process Honeycomb input and result paths are required.');
}

const bootToken = randomUUID();
const startupToEntry = process.uptime() * 1000;
const entryAt = performance.now();
const input = JSON.parse(await readFile(inputPath, 'utf8')) as ColdProcessInput;
const workspace = resolve(import.meta.dirname, '../../../..');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim() !== input.gitHead) {
  throw new Error('Cold-process Honeycomb Git HEAD changed.');
}
await Promise.all(
  input.implementationSources.map(async ({ path, digest }) => {
    if (
      createHash('sha256')
        .update(await readFile(resolve(workspace, path)))
        .digest('hex') !== digest
    ) {
      throw new Error('Cold-process Honeycomb implementation source changed.');
    }
  }),
);
if (
  Buffer.byteLength(input.source) !== 347 ||
  createHash('sha256').update(input.source).digest('hex') !== input.sourceDigest
) {
  throw new Error('Cold-process Honeycomb source identity changed.');
}
await Promise.all(
  (
    [
      [input.wasmUrl, input.wasmDigest],
      [input.wasmBindingsUrl, input.bindingsDigest],
    ] as const
  ).map(async ([url, expected]) => {
    const actual = createHash('sha256')
      .update(await readFile(fileURLToPath(url)))
      .digest('hex');
    if (actual !== expected) {
      throw new Error('Cold-process Honeycomb implementation asset changed.');
    }
  }),
);

const beforeCad = performance.now();
const cpuBeforeCad = input.cpuDiagnostic ? process.cpuUsage() : undefined;
let cpuBeforeIteration: ReturnType<typeof process.cpuUsage> | undefined;
const iterationProcessWindows: Array<{
  iteration: number;
  warmup: boolean;
  /** Milliseconds. */
  renderWall: number;
  processUserMicros: number;
  processSystemMicros: number;
}> = [];
const run = await runBenchmarks(
  [
    {
      name: 'app-custom-honeycomb-cohort-v1',
      category: 'app-small-model',
      files: { 'public/models/honeycomb.js': input.source },
      mainFile: 'public/models/honeycomb.js',
      mode: 'first-call',
      operation: 'render',
    },
  ],
  {
    iterations: 1,
    operation: 'render',
    includeEdges: true,
    wasm: { wasmUrl: input.wasmUrl, wasmBindingsUrl: input.wasmBindingsUrl },
    onIterationStart: input.cpuDiagnostic
      ? () => {
          cpuBeforeIteration = process.cpuUsage();
        }
      : undefined,
    onIterationProgress: input.cpuDiagnostic
      ? ({ iteration, warmupRuns, elapsed }) => {
          if (!cpuBeforeIteration) {
            throw new Error('Cold-process CPU start boundary is absent.');
          }
          const cpu = process.cpuUsage(cpuBeforeIteration);
          iterationProcessWindows.push({
            iteration,
            warmup: iteration <= warmupRuns,
            renderWall: elapsed,
            processUserMicros: cpu.user,
            processSystemMicros: cpu.system,
          });
          cpuBeforeIteration = undefined;
        }
      : undefined,
  },
);
const cadCpu = cpuBeforeCad ? process.cpuUsage(cpuBeforeCad) : undefined;
const runProcessWindow = cadCpu
  ? {
      runCallWall: performance.now() - beforeCad,
      processUserMicros: cadCpu.user,
      processSystemMicros: cadCpu.system,
    }
  : undefined;
await writeFile(
  resultPath,
  JSON.stringify({
    processId: process.pid,
    bootToken,
    startupToEntry,
    setupBeforeCad: beforeCad - entryAt,
    moduleResolutionPathHash: createHash('sha256')
      .update(import.meta.resolve('@taucad/replicad'))
      .digest('hex'),
    gitHead: input.gitHead,
    implementationSources: input.implementationSources,
    sourceDigest: input.sourceDigest,
    assetDigests: [input.wasmDigest, input.bindingsDigest],
    run,
    ...(input.cpuDiagnostic ? { runProcessWindow, iterationProcessWindows } : {}),
  }),
);
