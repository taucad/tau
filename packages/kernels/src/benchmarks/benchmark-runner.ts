/* eslint-disable no-await-in-loop -- sequential benchmark iterations are intentional */
/**
 * Benchmark Runner
 *
 * Runs a set of benchmark cases against a kernel, capturing telemetry
 * and computing performance statistics (mean, median, p95, p99, stddev).
 *
 * Uses the public createKernelClient API with createInProcessTransport
 * to dogfood the same API path as production consumers.
 */

import type { PerformanceEntryData } from '#types/kernel-protocol.types.js';
import { createKernelClient, fromMemoryFS } from '#index.js';
import { createInProcessTransport } from '#transport/in-process-transport.js';
import { replicad } from '#plugins/kernel-factories.js';
import { esbuild } from '#plugins/bundler-factories.js';
import type { BenchmarkCase } from '#benchmarks/benchmark-suite.js';

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
  telemetry: PerformanceEntryData[][];
  ocSummary?: Record<string, { calls: number; totalMs: number }>;
};

/** WASM binary size metadata for tracking size regressions. */
export type WasmSizeInfo = {
  singleWasmBytes: number;
  singleJsBytes: number;
  exceptionsWasmBytes?: number;
  exceptionsJsBytes?: number;
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
  /** WASM variant or custom config. Defaults to `'single'`. */
  wasm?: 'single' | 'single-exceptions' | { wasmUrl: string; wasmBindingsUrl: string };
  onProgress?: (completed: number, total: number, caseName: string) => void;
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

function computeStats(timings: number[]): { mean: number; median: number; p95: number; p99: number; stddev: number } {
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const median = computePercentile(sorted, 50);
  const p95 = computePercentile(sorted, 95);
  const p99 = computePercentile(sorted, 99);
  const variance = sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / sorted.length;
  const stddev = Math.sqrt(variance);

  return { mean, median, p95, p99, stddev };
}

// =============================================================================
// OC Summary Extraction
// =============================================================================

function extractOcSummary(
  telemetryBatches: PerformanceEntryData[][],
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

const basePath = '/builds/test';

/**
 * Run a set of benchmark cases, capturing telemetry and computing statistics.
 * Creates a fresh KernelClient per benchmark case (reused across iterations).
 */
export async function runBenchmarks(
  cases: BenchmarkCase[],
  options: BenchmarkRunnerOptions,
): Promise<BenchmarkRunResult> {
  const { iterations, ocTracing = 'summary', wasm = 'single', onProgress } = options;
  const totalWork = cases.length;
  const results: BenchmarkResult[] = [];
  const runStart = performance.now();

  for (const [caseIndex, benchCase] of cases.entries()) {
    onProgress?.(caseIndex, totalWork, benchCase.name);

    const timings: number[] = [];
    const allTelemetry: PerformanceEntryData[][] = [];
    const telemetryBatches: PerformanceEntryData[][] = [];

    const absoluteFiles: Record<string, string> = {};
    for (const [filename, content] of Object.entries(benchCase.files)) {
      absoluteFiles[`${basePath}/${filename}`] = content;
    }

    const kernelOptions = { ocTracing, wasm };

    const fileSystem = fromMemoryFS(absoluteFiles);
    const client = createKernelClient({
      kernels: [replicad(kernelOptions)],
      bundlers: [esbuild()],
      fileSystem,
      transport: createInProcessTransport(),
    });

    client.on('telemetry', (entries) => {
      telemetryBatches.push(entries);
    });

    const totalRuns = iterations + 1; // +1 for warmup run (discarded)
    for (let iter = 0; iter < totalRuns; iter++) {
      performance.clearMeasures();
      performance.clearMarks();
      telemetryBatches.length = 0;

      if (iter > 0) {
        for (const [filePath, content] of Object.entries(absoluteFiles)) {
          await fileSystem.writeFile(filePath, content);
        }

        client.notifyFileChanged(Object.keys(absoluteFiles));
      }

      const start = performance.now();
      const renderResult = await client.render({
        file: { filename: benchCase.mainFile, path: basePath },
        parameters: {},
      });
      const elapsed = performance.now() - start;

      if (!renderResult.success) {
        const messages = renderResult.issues.map((i) => i.message).join('; ');
        throw new Error(`Benchmark "${benchCase.name}" render failed (iteration ${iter}): ${messages}`);
      }

      if (iter === 0) {
        continue; // Discard warmup iteration to avoid cold-start skew
      }

      timings.push(elapsed);
      allTelemetry.push(telemetryBatches.flat());
    }

    client.terminate();

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

    const wasmDir = resolve(dirname(toFilePath(import.meta.url)), 'kernels', 'replicad', 'wasm');
    const stat = (name: string): number | undefined => {
      try {
        return statSync(resolve(wasmDir, name)).size;
      } catch {
        return undefined;
      }
    };

    const singleWasm = stat('replicad_single.wasm');
    if (!singleWasm) {
      return undefined;
    }

    const jsDir = resolve(dirname(toFilePath(import.meta.url)), 'kernels', 'replicad');
    const jsSize = (name: string): number => {
      try {
        return statSync(resolve(jsDir, '..', '..', '..', 'node_modules', 'replicad-opencascadejs', 'src', name)).size;
      } catch {
        return 0;
      }
    };

    return {
      singleWasmBytes: singleWasm,
      singleJsBytes: jsSize('replicad_single.js'),
      exceptionsWasmBytes: stat('replicad_with_exceptions.wasm'),
      exceptionsJsBytes: jsSize('replicad_with_exceptions.js') || undefined,
    };
  } catch {
    return undefined;
  }
}
