/**
 * Kernel Benchmarking CLI
 *
 * Run with: pnpm nx benchmark runtime
 *
 * Usage:
 *   pnpm nx benchmark runtime
 *   pnpm nx benchmark runtime -- --iterations 10 --filter "primitives,booleans"
 *   pnpm nx benchmark runtime -- --compare reports/benchmark-before.json reports/benchmark-after.json
 *   pnpm nx benchmark runtime -- --output ./my-reports
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { filterBenchmarks, benchmarkCategories } from '#benchmarks/benchmark-suite.js';
import { runBenchmarks } from '#benchmarks/benchmark-runner.js';
import type { BenchmarkRunResult, BuildProvenance } from '#benchmarks/benchmark-runner.js';
import { generateHtmlReport, serializeRunResult } from '#benchmarks/benchmark-report.js';
import type { ProfiledCaseData } from '#benchmarks/profile-report.js';
import process from 'node:process';

// ── ANSI color helpers ──────────────────────────────────────────────

const useColor = Boolean(process.stdout.isTTY);

const c = {
  reset: useColor ? '\u001B[0m' : '',
  bold: useColor ? '\u001B[1m' : '',
  dim: useColor ? '\u001B[2m' : '',
  cyan: useColor ? '\u001B[36m' : '',
  green: useColor ? '\u001B[32m' : '',
  yellow: useColor ? '\u001B[33m' : '',
  red: useColor ? '\u001B[31m' : '',
  magenta: useColor ? '\u001B[35m' : '',
  blue: useColor ? '\u001B[34m' : '',
  white: useColor ? '\u001B[37m' : '',
  bgBlue: useColor ? '\u001B[44m' : '',
  bgGreen: useColor ? '\u001B[42m' : '',
};

function heading(text: string): void {
  console.log(`\n${c.bold}${c.cyan}═══ ${text} ═══${c.reset}`);
}

function label(key: string, value: string): void {
  console.log(`  ${c.dim}${key}:${c.reset} ${c.bold}${value}${c.reset}`);
}

function success(text: string): void {
  console.log(`${c.green}✓${c.reset} ${text}`);
}

function warn(text: string): void {
  console.log(`${c.yellow}⚠${c.reset} ${text}`);
}

// ── CLI parsing ─────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    iterations: { type: 'string', short: 'n', default: '5' },
    filter: { type: 'string', short: 'f' },
    compare: { type: 'string', short: 'c', multiple: true },
    output: { type: 'string', short: 'o', default: 'reports' },
    provenance: { type: 'string', short: 'p' },
    'wasm-dir': { type: 'string' },
    'wasm-variant': { type: 'string', default: 'auto' },
    ocProfile: { type: 'boolean', default: false },
    noTracing: { type: 'boolean', default: false },
    cpuProfile: { type: 'boolean', default: false },
    profileInterval: { type: 'string', default: '100' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`
${c.bold}Kernel Benchmarking CLI${c.reset}

${c.dim}Usage:${c.reset}
  pnpm nx benchmark runtime [-- options]

${c.dim}Options:${c.reset}
  ${c.cyan}-n${c.reset}, ${c.cyan}--iterations${c.reset} <n>    Number of iterations per benchmark (default: 5)
  ${c.cyan}-f${c.reset}, ${c.cyan}--filter${c.reset} <items>    Comma-separated categories or benchmark names.
                                      Categories: ${benchmarkCategories.join(', ')}
  ${c.cyan}-c${c.reset}, ${c.cyan}--compare${c.reset} <files>   Compare two JSON report files (provide two paths)
  ${c.cyan}-o${c.reset}, ${c.cyan}--output${c.reset} <dir>      Output directory (default: reports)
  ${c.cyan}-p${c.reset}, ${c.cyan}--provenance${c.reset} <file> Attach build provenance JSON to results
      ${c.cyan}--wasm-dir${c.reset} <path>   Inject custom WASM from directory (contains .wasm + .js files)
      ${c.cyan}--wasm-variant${c.reset} <v>  WASM variant: auto (default) | single | multi
      ${c.cyan}--ocProfile${c.reset}         Use per-call OC tracing for deep profiling
      ${c.cyan}--noTracing${c.reset}         Disable OC tracing entirely for pure timing
      ${c.cyan}--cpuProfile${c.reset}        Enable V8 CPU profiling for per-function timing breakdown
      ${c.cyan}--profileInterval${c.reset} <us>  CPU profiler sampling interval in microseconds (default: 100)
  ${c.cyan}-h${c.reset}, ${c.cyan}--help${c.reset}              Show this help message
`);
  process.exit(0);
}

// ── Provenance display ──────────────────────────────────────────────

type ProvenanceCompilation = {
  cacheKey?: string;
  cacheHit?: boolean;
  optimization?: string;
  lto?: boolean;
  exceptions?: string;
  threading?: string;
  wasmOptLevel?: string;
};

function printProvenanceBanner(prov: BuildProvenance): void {
  const comp = prov.compilation as ProvenanceCompilation;

  console.log(`\n${c.bgBlue}${c.white}${c.bold} BUILD PROVENANCE ${c.reset}`);
  console.log(`${c.dim}${'─'.repeat(56)}${c.reset}`);
  label('Build ID', prov.buildId);
  label('Optimization', comp.optimization ?? '—');
  label('LTO', comp.lto ? 'Yes' : 'No');
  label('Exceptions', comp.exceptions ?? 'none');
  label('Threading', comp.threading ?? '—');
  label('wasm-opt', comp.wasmOptLevel ?? '—');
  label('Cache Key', comp.cacheKey ?? '—');
  label('Cache Hit', comp.cacheHit ? `${c.green}Yes${c.reset}` : `${c.yellow}No${c.reset}`);
  label('Emscripten', prov.toolchain['emscripten'] ?? '—');
  label('LLVM', prov.toolchain['llvm'] ?? '—');
  label('Timestamp', prov.timestamp);
  console.log(`${c.dim}${'─'.repeat(56)}${c.reset}`);
}

function formatFileSize(bytes: number): string {
  if (bytes > 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${(bytes / 1024).toFixed(1)} kB`;
}

// ── WASM resolution ─────────────────────────────────────────────────

type WasmOptionResult = 'auto' | 'single' | 'multi' | { wasmUrl: string; wasmBindingsUrl: string };

function resolveWasmOption(): WasmOptionResult {
  const rawVariant = values['wasm-variant'];
  const wasmDirectory = values['wasm-dir'];

  const allowed = new Set(['auto', 'single', 'multi']);
  if (!allowed.has(rawVariant)) {
    console.error(`${c.red}Invalid --wasm-variant: ${rawVariant} (expected: auto | single | multi)${c.reset}`);
    process.exit(1);
  }
  const wasmVariant = rawVariant as 'auto' | 'single' | 'multi';

  if (!wasmDirectory) {
    return wasmVariant;
  }

  const absDirectory = resolve(wasmDirectory);
  if (!existsSync(absDirectory)) {
    console.error(`${c.red}WASM directory not found: ${absDirectory}${c.reset}`);
    process.exit(1);
  }

  if (wasmVariant === 'auto') {
    console.error(`${c.red}--wasm-dir requires an explicit --wasm-variant (single | multi)${c.reset}`);
    process.exit(1);
  }
  const variant = wasmVariant === 'multi' ? 'replicad_multi' : 'replicad_single';
  const wasmPath = join(absDirectory, `${variant}.wasm`);
  const jsPath = join(absDirectory, `${variant}.js`);

  if (!existsSync(wasmPath)) {
    console.error(`${c.red}WASM binary not found: ${wasmPath}${c.reset}`);
    process.exit(1);
  }

  if (!existsSync(jsPath)) {
    console.error(`${c.red}JS bindings not found: ${jsPath}${c.reset}`);
    process.exit(1);
  }

  heading('WASM Injection');
  label('Directory', absDirectory);
  const wasmSize = formatFileSize(statSync(wasmPath).size);
  const jsSize = formatFileSize(statSync(jsPath).size);
  label('Binary', `${variant}.wasm ${c.dim}(${wasmSize})${c.reset}`);
  label('Bindings', `${variant}.js ${c.dim}(${jsSize})${c.reset}`);

  return {
    wasmUrl: pathToFileURL(wasmPath).href,
    wasmBindingsUrl: pathToFileURL(jsPath).href,
  };
}

function loadProvenance(): BuildProvenance | undefined {
  if (!values.provenance) {
    return undefined;
  }

  const provPath = resolve(values.provenance);
  if (existsSync(provPath)) {
    return JSON.parse(readFileSync(provPath, 'utf8')) as BuildProvenance;
  }

  warn(`Provenance file not found: ${provPath}`);
  return undefined;
}

function onBenchmarkProgress(completed: number, total: number, caseName: string): void {
  if (caseName === 'done') {
    const doneMessage = `\n${c.green}${c.bold}✓ All ${total} benchmarks complete${c.reset}`;
    console.log(doneMessage);
    return;
  }

  const pct = Math.round(((completed + 1) / total) * 100);
  const progress = `${c.dim}[${completed + 1}/${total}]${c.reset}`;
  console.log(`  ${progress} ${caseName}${c.dim}... (${pct}%)${c.reset}`);
}

function onBenchmarkIterationProgress(progress: {
  caseName: string;
  iteration: number;
  totalRuns: number;
  warmupRuns: number;
  elapsed: number;
}): void {
  if (progress.elapsed < 1000) {
    return;
  }

  const phase = progress.iteration <= progress.warmupRuns ? 'warmup' : 'sample';
  const sampleIndex =
    progress.iteration <= progress.warmupRuns ? progress.iteration : progress.iteration - progress.warmupRuns;
  const sampleTotal =
    progress.iteration <= progress.warmupRuns ? progress.warmupRuns : progress.totalRuns - progress.warmupRuns;
  console.log(
    `    ${c.dim}↳ ${progress.caseName} ${phase} ${sampleIndex}/${sampleTotal}: ${formatMs(progress.elapsed)}${c.reset}`,
  );
}

function writeResults(result: BenchmarkRunResult): void {
  const outputDirectory = resolve(values.output);
  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  const timestamp = result.timestamp.replaceAll(/[.:]/g, '-');
  const htmlPath = join(outputDirectory, `benchmark-${timestamp}.html`);
  const jsonPath = join(outputDirectory, `benchmark-${timestamp}.json`);

  writeFileSync(jsonPath, serializeRunResult(result));
  writeFileSync(htmlPath, generateHtmlReport(result));

  heading('Output');
  label('HTML', htmlPath);
  label('JSON', jsonPath);
  label('Duration', `${(result.totalDurationMs / 1000).toFixed(1)}s`);

  if (result.wasmSizes) {
    heading('WASM Sizes');
    const singleSize = formatFileSize(result.wasmSizes.singleWasmBytes);
    const singleJs = formatFileSize(result.wasmSizes.singleJsBytes);
    label('single.wasm', `${singleSize} ${c.dim}(JS: ${singleJs})${c.reset}`);
    if (result.wasmSizes.multiWasmBytes) {
      const multiSize = formatFileSize(result.wasmSizes.multiWasmBytes);
      const multiJs = result.wasmSizes.multiJsBytes ? formatFileSize(result.wasmSizes.multiJsBytes) : '—';
      label('multi.wasm', `${multiSize} ${c.dim}(JS: ${multiJs})${c.reset}`);
    }
  }
}

// ── CPU profile output ──────────────────────────────────────────────

async function writeProfileResults(result: BenchmarkRunResult): Promise<void> {
  const outputDirectory = resolve(values.output);
  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  const timestamp = result.timestamp.replaceAll(/[.:]/g, '-');
  const profileDirectory = join(outputDirectory, `profiles-${timestamp}`);
  mkdirSync(profileDirectory, { recursive: true });

  const profiledCases: ProfiledCaseData[] = [];

  for (const r of result.results) {
    if (r.cpuProfile) {
      const profilePath = join(profileDirectory, `${r.name}.cpuprofile`);
      writeFileSync(profilePath, JSON.stringify(r.cpuProfile));
      success(`Profile written: ${profilePath}`);
    }

    if (r.profileAnalysis) {
      profiledCases.push({
        name: r.name,
        analysis: r.profileAnalysis,
        profile: r.cpuProfile,
      });
    }
  }

  if (profiledCases.length > 0) {
    const { generateProfileHtmlReport } = await import('#benchmarks/profile-report.js');
    const profileHtmlPath = join(outputDirectory, `cpu-profile-${timestamp}.html`);
    writeFileSync(profileHtmlPath, generateProfileHtmlReport(profiledCases, result.timestamp));

    heading('CPU Profile Report');
    label('HTML', profileHtmlPath);
    label('Profiles', profileDirectory);
    label('Cases', `${profiledCases.length}`);

    for (const pc of profiledCases) {
      const overhead = pc.analysis.frameworkOverheadPct;
      const overheadColor = overhead > 20 ? c.red : overhead > 10 ? c.yellow : c.green;
      label(pc.name, `${overheadColor}${overhead.toFixed(1)}% framework overhead${c.reset}`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (values.compare?.length === 2) {
    runComparison(values.compare[0]!, values.compare[1]!);
    return;
  }

  if (values.compare) {
    console.error('--compare requires exactly 2 file paths.');
    process.exit(1);
  }

  await runSuite();
}

async function runSuite(): Promise<void> {
  const iterations = Number.parseInt(values.iterations, 10);
  const filterCats = values.filter?.split(',').map((s) => s.trim());
  const cases = filterBenchmarks(filterCats);

  if (cases.length === 0) {
    console.error(`${c.red}No benchmark cases match the filter.${c.reset}`);
    process.exit(1);
  }

  const ocTracing = values.noTracing ? 'off' : values.ocProfile ? 'per-call' : 'summary';

  const provenance = loadProvenance();
  const wasmOption = resolveWasmOption();

  if (provenance) {
    printProvenanceBanner(provenance);
  }

  const enableCpuProfile = values.cpuProfile;
  const cpuProfileInterval = Number.parseInt(values.profileInterval, 10);

  heading('Benchmark Run');
  label('Benchmarks', `${cases.length}`);
  label('Iterations', `${iterations}`);
  label('Tracing', ocTracing);
  label('WASM', typeof wasmOption === 'string' ? wasmOption : 'custom');
  if (typeof wasmOption === 'string' && wasmOption === 'auto') {
    label('Auto', 'kernel will pick multi when SAB available, else single');
  }
  if (enableCpuProfile) {
    label('CPU Profile', `enabled (${cpuProfileInterval}us interval)`);
  }

  console.log('');

  const result = await runBenchmarks(cases, {
    iterations,
    ocTracing,
    wasm: wasmOption,
    onProgress: onBenchmarkProgress,
    onIterationProgress: onBenchmarkIterationProgress,
    cpuProfile: enableCpuProfile,
    cpuProfileInterval,
  });

  if (provenance) {
    result.provenance = provenance;
    success(`Provenance attached: ${basename(values.provenance!)}`);
  }

  writeResults(result);

  if (enableCpuProfile) {
    await writeProfileResults(result);
  }

  printSummaryTable(result);
}

function runComparison(beforePath: string, afterPath: string): void {
  const before = JSON.parse(readFileSync(resolve(beforePath), 'utf8')) as BenchmarkRunResult;
  const after = JSON.parse(readFileSync(resolve(afterPath), 'utf8')) as BenchmarkRunResult;

  const outputDirectory = resolve(values.output);
  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  const htmlPath = join(
    outputDirectory,
    `benchmark-comparison-${new Date().toISOString().replaceAll(/[.:]/g, '-')}.html`,
  );
  writeFileSync(htmlPath, generateHtmlReport(after, before));

  printComparisonTable(before, after);

  success(`Comparison report written to: ${htmlPath}`);
}

function printComparisonTable(before: BenchmarkRunResult, after: BenchmarkRunResult): void {
  const w = 12;
  console.log(`\n${c.bold}${'═'.repeat(90)}${c.reset}`);
  console.log(
    `  ${c.bold}${'Operation'.padEnd(26)}${c.reset} ${'Before'.padStart(w)} ${'After'.padStart(w)} ${'Delta'.padStart(w)} ${'Change'.padStart(w)}`,
  );
  console.log(`${c.dim}${'─'.repeat(90)}${c.reset}`);

  for (const afterResult of after.results) {
    const beforeResult = before.results.find((r) => r.name === afterResult.name);
    const bMedian = beforeResult?.median ?? 0;
    const aMedian = afterResult.median;
    const delta = bMedian > 0 ? ((aMedian - bMedian) / bMedian) * 100 : 0;
    const sign = delta > 0 ? '+' : '';
    const deltaColor = delta < -2 ? c.green : delta > 2 ? c.red : c.dim;
    const indicator = delta < -2 ? ` ${c.green}FASTER${c.reset}` : delta > 2 ? ` ${c.red}SLOWER${c.reset}` : '';

    console.log(
      `  ${afterResult.name.padEnd(26)} ${formatMs(bMedian).padStart(w)} ${formatMs(aMedian).padStart(w)} ${deltaColor}${(sign + delta.toFixed(1) + '%').padStart(w)}${c.reset}${indicator}`,
    );
  }

  console.log(`${c.dim}${'─'.repeat(90)}${c.reset}`);

  if (before.wasmSizes && after.wasmSizes) {
    const bSize = before.wasmSizes.singleWasmBytes;
    const aSize = after.wasmSizes.singleWasmBytes;
    const sizeDelta = bSize > 0 ? ((aSize - bSize) / bSize) * 100 : 0;

    console.log(
      `\n  ${c.bold}WASM Size:${c.reset} ${formatFileSize(bSize)} → ${formatFileSize(aSize)} (${sizeDelta > 0 ? c.red + '+' : c.green}${sizeDelta.toFixed(1)}%${c.reset})`,
    );
  }

  console.log(`${c.bold}${'═'.repeat(90)}${c.reset}\n`);
}

function printSummaryTable(result: BenchmarkRunResult): void {
  heading('Results');
  console.log(
    `  ${c.bold}${'Operation'.padEnd(30)} ${'Mean'.padStart(10)} ${'Median'.padStart(10)} ${'P95'.padStart(10)} ${'Stddev'.padStart(10)}${c.reset}`,
  );
  console.log(`  ${c.dim}${'─'.repeat(74)}${c.reset}`);

  for (const r of result.results) {
    const name = r.name.padEnd(30);
    const mean = formatMs(r.mean).padStart(10);
    const median = `${c.bold}${formatMs(r.median).padStart(10)}${c.reset}`;
    const p95 = formatMs(r.p95).padStart(10);
    const stddev = `${c.dim}${formatMs(r.stddev).padStart(10)}${c.reset}`;
    console.log(`  ${name} ${mean} ${median} ${p95} ${stddev}`);
  }

  console.log(`  ${c.dim}${'─'.repeat(74)}${c.reset}\n`);
}

function formatMs(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`;
}

await main();
