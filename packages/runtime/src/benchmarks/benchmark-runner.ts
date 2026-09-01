/* oxlint-disable no-await-in-loop -- sequential benchmark iterations are intentional */
/**
 * Benchmark Runner
 *
 * Runs a set of benchmark cases against a kernel, capturing telemetry
 * and computing performance statistics (mean, median, p95, p99, stddev).
 *
 * Uses the public createRuntimeClient API with inProcessTransport
 * to dogfood the same API path as production consumers.
 */

import type { TelemetryEntry } from '#types/runtime-protocol.types.js';
import { createRuntimeClient } from '#index.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { replicad } from '#plugins/kernel-factories.js';
import { esbuild } from '#plugins/bundler-factories.js';
import type { BenchmarkCase } from '#benchmarks/benchmark-suite.js';
import type { CpuProfile, CpuProfiler } from '#benchmarks/cpu-profiler.js';
import type { ProfileAnalysis } from '#benchmarks/profile-analyzer.js';

// =============================================================================
// Types
// =============================================================================

/** Result of a single benchmark case. */
export type BenchmarkResult = {
  name: string;
  category: string;
  iterations: number;
  timings: number[];
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
  telemetry: TelemetryEntry[][];
  ocSummary?: Record<string, { calls: number; totalMs: number }>;
  cpuProfile?: CpuProfile;
  profileAnalysis?: ProfileAnalysis;
};

/** WASM binary size metadata for tracking size regressions. */
export type WasmSizeInfo = {
  singleWasmBytes: number;
  singleJsBytes: number;
  multiWasmBytes?: number;
  multiJsBytes?: number;
};

/** Build provenance metadata linking benchmark results to build configuration. */
export type BuildProvenance = {
  schema: string;
  buildId: string;
  timestamp: string;
  toolchain: Record<string, string>;
  source: Record<string, string>;
  compilation: Record<string, unknown>;
  linking: Record<string, unknown>;
  postProcessing: Record<string, unknown>;
  output: Record<string, unknown>;
  sections: Record<string, unknown>;
  filtering: Record<string, unknown>;
};

/** Result of a complete benchmark run across all cases. */
export type BenchmarkRunResult = {
  timestamp: string;
  results: BenchmarkResult[];
  totalDurationMs: number;
  wasmSizes?: WasmSizeInfo;
  provenance?: BuildProvenance;
};

/** Options for configuring a benchmark run. */
export type BenchmarkRunnerOptions = {
  iterations: number;
  ocTracing?: 'off' | 'summary' | 'per-call';
  /** WASM variant or custom config. Defaults to `'auto'` (multi when supported, else single). */
  wasm?: 'auto' | 'single' | 'multi' | { wasmUrl: string; wasmBindingsUrl: string };
  onProgress?: (completed: number, total: number, caseName: string) => void;
  onIterationProgress?: (progress: {
    caseName: string;
    iteration: number;
    totalRuns: number;
    warmupRuns: number;
    elapsed: number;
  }) => void;
  /** Enable V8 CPU profiling for per-function timing breakdown. */
  cpuProfile?: boolean;
  /** CPU profiler sampling interval in microseconds (default: 100). */
  cpuProfileInterval?: number;
};

// =============================================================================
// Statistics
// =============================================================================

function computePercentile(sorted: number[], percentile: number): number {
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower]!;
  }

  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function computeStats(timings: number[]): {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
} {
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const median = computePercentile(sorted, 50);
  const p95 = computePercentile(sorted, 95);
  const p99 = computePercentile(sorted, 99);
  const variance = sorted.reduce((accumulator, value) => accumulator + (value - mean) ** 2, 0) / sorted.length;
  const stddev = Math.sqrt(variance);

  return { mean, median, p95, p99, stddev };
}

// =============================================================================
// OC Summary Extraction
// =============================================================================

function extractOcSummary(
  telemetryBatches: TelemetryEntry[][],
): Record<string, { calls: number; totalMs: number }> | undefined {
  const allEntries = telemetryBatches.flat();
  const summarySpan = allEntries.find((entry) => entry.name === 'oc.summary');
  if (!summarySpan?.detail) {
    return undefined;
  }

  const result: Record<string, { calls: number; totalMs: number }> = {};
  const { detail } = summarySpan;

  const classKeys = Object.keys(detail).filter((key) => key.endsWith('.calls'));
  for (const callsKey of classKeys) {
    const className = callsKey.replace('.calls', '');
    if (className === 'total') {
      continue;
    }

    const msValue = detail[`${className}.ms`];
    result[className] = {
      calls: detail[callsKey] as number,
      totalMs: typeof msValue === 'number' ? msValue : 0,
    };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

// =============================================================================
// Runner
// =============================================================================

const basePath = '/projects/test';

/**
 * Runs a set of benchmark cases against the Replicad kernel, capturing telemetry and computing statistics.
 *
 * @param cases - The benchmark cases to run
 * @param options - Runner configuration (iterations, WASM variant, tracing mode)
 * @returns Aggregated results with per-case statistics and optional OC tracing summaries
 */
// oxlint-disable-next-line complexity -- intentional sequential loop
export async function runBenchmarks(
  cases: BenchmarkCase[],
  options: BenchmarkRunnerOptions,
): Promise<BenchmarkRunResult> {
  const {
    iterations,
    ocTracing = 'summary',
    wasm = 'auto',
    onProgress,
    onIterationProgress,
    cpuProfile: enableCpuProfile = false,
    cpuProfileInterval = 100,
  } = options;
  const totalWork = cases.length;
  const results: BenchmarkResult[] = [];
  const runStart = performance.now();

  for (const [caseIndex, benchCase] of cases.entries()) {
    onProgress?.(caseIndex, totalWork, benchCase.name);

    const timings: number[] = [];
    const allTelemetry: TelemetryEntry[][] = [];
    const telemetryBatches: TelemetryEntry[][] = [];

    const absoluteFiles: Record<string, string> = {};
    for (const [filename, content] of Object.entries(benchCase.files)) {
      absoluteFiles[`${basePath}/${filename}`] = content;
    }

    const kernelOptions = { ocTracing, wasm };

    const fileSystem = fromMemoryFs(absoluteFiles);
    const transport = inProcessTransport({ fileSystem });
    const client = createRuntimeClient({
      kernels: [replicad(kernelOptions)],
      bundlers: [esbuild()],
      transport,
    });

    client.on('telemetry', (entries) => {
      telemetryBatches.push(entries);
    });
    client.on('log', (entry) => {
      // Surface kernel-side info/warn lines (e.g. WASM auto-selection log,
      // OCCT parallel activation summary) to the benchmark CLI. Skip debug/trace
      // (very chatty under per-call OC tracing) and the `info` rubber-band.
      if (entry.level === 'info' || entry.level === 'warn' || entry.level === 'error') {
        const stream = entry.level === 'error' ? console.error : console.log;
        stream(`  [${entry.level.padEnd(5)}] ${entry.message}`);
      }
    });

    const warmupRuns = 3;
    const totalRuns = iterations + warmupRuns;

    let profiler: CpuProfiler | undefined;
    if (enableCpuProfile) {
      const cpuProfilerModule = await import('#benchmarks/cpu-profiler.js');
      profiler = new cpuProfilerModule.CpuProfiler();
    }

    for (let iter = 0; iter < totalRuns; iter++) {
      performance.clearMeasures();
      performance.clearMarks();
      telemetryBatches.length = 0;

      if (iter > 0) {
        /* Re-issue the inline source files via the transport's
         * stage-and-render envelope on the next export call below;
         * benchmarks no longer reach into the FS handle directly. */
      }

      if (profiler && iter === warmupRuns) {
        globalThis.gc?.();
        await profiler.start(cpuProfileInterval);
      }

      const start = performance.now();
      const exportResult = await client.export('glb', {
        file: { filename: benchCase.mainFile, path: basePath },
        parameters: {},
      });
      const elapsed = performance.now() - start;
      onIterationProgress?.({
        caseName: benchCase.name,
        iteration: iter + 1,
        totalRuns,
        warmupRuns,
        elapsed,
      });

      if (!exportResult.success) {
        const messages = exportResult.issues.map((issue) => issue.message).join('; ');
        throw new Error(`Benchmark "${benchCase.name}" export failed (iteration ${iter}): ${messages}`);
      }

      if (iter < warmupRuns) {
        continue;
      }

      timings.push(elapsed);
      allTelemetry.push(telemetryBatches.flat());
    }

    let cpuProfileResult: CpuProfile | undefined;
    let profileAnalysis: ProfileAnalysis | undefined;
    if (profiler) {
      cpuProfileResult = await profiler.stop();
      const { analyzeProfile } = await import('#benchmarks/profile-analyzer.js');
      profileAnalysis = analyzeProfile(cpuProfileResult, allTelemetry);
    }

    client.terminate();
    globalThis.gc?.();

    const stats = computeStats(timings);
    const ocSummary = extractOcSummary(allTelemetry);

    results.push({
      name: benchCase.name,
      category: benchCase.category,
      iterations,
      timings,
      ...stats,
      telemetry: allTelemetry,
      ocSummary,
      cpuProfile: cpuProfileResult,
      profileAnalysis,
    });
  }

  onProgress?.(totalWork, totalWork, 'done');

  const wasmSizes = await collectWasmSizes();

  return {
    timestamp: new Date().toISOString(),
    results,
    totalDurationMs: performance.now() - runStart,
    wasmSizes,
  };
}

async function collectWasmSizes(): Promise<WasmSizeInfo | undefined> {
  try {
    const { statSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath: toFilePath } = await import('node:url');

    const wasmDirectory = resolve(dirname(toFilePath(import.meta.url)), 'kernels', 'replicad', 'wasm');
    const stat = (name: string): number | undefined => {
      try {
        return statSync(resolve(wasmDirectory, name)).size;
      } catch {
        return undefined;
      }
    };

    const singleWasm = stat('replicad_single.wasm');
    if (!singleWasm) {
      return undefined;
    }

    const multiWasm = stat('replicad_multi.wasm');

    const jsDirectory = resolve(dirname(toFilePath(import.meta.url)), 'kernels', 'replicad');
    const jsSize = (name: string): number => {
      try {
        return statSync(resolve(jsDirectory, '..', '..', '..', 'node_modules', 'replicad-opencascadejs', 'dist', name))
          .size;
      } catch {
        return 0;
      }
    };

    return {
      singleWasmBytes: singleWasm,
      singleJsBytes: jsSize('replicad_single.js'),
      multiWasmBytes: multiWasm,
      multiJsBytes: multiWasm ? jsSize('replicad_multi.js') : undefined,
    };
  } catch {
    return undefined;
  }
}
