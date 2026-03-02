/* eslint-disable n/prefer-global/process -- CLI script requires direct process access */
/* eslint-disable unicorn/no-process-exit -- CLI script uses process.exit for error codes */
/**
 * Kernel Benchmarking CLI
 *
 * Run with: pnpm nx benchmark kernels
 *
 * Usage:
 *   pnpm nx benchmark kernels
 *   pnpm nx benchmark kernels -- --iterations 10 --filter "primitives,booleans"
 *   pnpm nx benchmark kernels -- --compare reports/benchmark-before.json reports/benchmark-after.json
 *   pnpm nx benchmark kernels -- --output ./my-reports
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { filterBenchmarks, benchmarkCategories } from '#benchmarks/benchmark-suite.js';
import { runBenchmarks, type BenchmarkRunResult, type BuildProvenance } from '#benchmarks/benchmark-runner.js';
import { generateHtmlReport, serializeRunResult } from '#benchmarks/benchmark-report.js';

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
    'wasm-variant': { type: 'string', default: 'single' },
    ocProfile: { type: 'boolean', default: false },
    noTracing: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`
${c.bold}Kernel Benchmarking CLI${c.reset}

${c.dim}Usage:${c.reset}
  pnpm nx benchmark kernels [-- options]

${c.dim}Options:${c.reset}
  ${c.cyan}-n${c.reset}, ${c.cyan}--iterations${c.reset} <n>    Number of iterations per benchmark (default: 5)
  ${c.cyan}-f${c.reset}, ${c.cyan}--filter${c.reset} <cats>     Comma-separated categories: ${benchmarkCategories.join(', ')}
  ${c.cyan}-c${c.reset}, ${c.cyan}--compare${c.reset} <files>   Compare two JSON report files (provide two paths)
  ${c.cyan}-o${c.reset}, ${c.cyan}--output${c.reset} <dir>      Output directory (default: reports)
  ${c.cyan}-p${c.reset}, ${c.cyan}--provenance${c.reset} <file> Attach build provenance JSON to results
      ${c.cyan}--wasm-dir${c.reset} <path>   Inject custom WASM from directory (contains .wasm + .js files)
      ${c.cyan}--wasm-variant${c.reset} <v>  WASM variant name: single (default) or single-exceptions
      ${c.cyan}--ocProfile${c.reset}         Use per-call OC tracing for deep profiling
      ${c.cyan}--noTracing${c.reset}         Disable OC tracing entirely for pure timing
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

type WasmOptionResult = 'single' | 'single-exceptions' | { wasmUrl: string; wasmBindingsUrl: string };

function resolveWasmOption(): WasmOptionResult {
  const wasmVariant = values['wasm-variant'] as 'single' | 'single-exceptions' | undefined;
  const wasmDir = values['wasm-dir'];

  if (!wasmDir) {
    return wasmVariant ?? 'single';
  }

  const absDir = resolve(wasmDir);
  if (!existsSync(absDir)) {
    console.error(`${c.red}WASM directory not found: ${absDir}${c.reset}`);
    process.exit(1);
  }

  const variant = wasmVariant === 'single-exceptions' ? 'replicad_with_exceptions' : 'replicad_single';
  const wasmPath = join(absDir, `${variant}.wasm`);
  const jsPath = join(absDir, `${variant}.js`);

  if (!existsSync(wasmPath)) {
    console.error(`${c.red}WASM binary not found: ${wasmPath}${c.reset}`);
    process.exit(1);
  }

  if (!existsSync(jsPath)) {
    console.error(`${c.red}JS bindings not found: ${jsPath}${c.reset}`);
    process.exit(1);
  }

  heading('WASM Injection');
  label('Directory', absDir);
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

function writeResults(result: BenchmarkRunResult): void {
  const outputDir = resolve(values.output ?? 'reports');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = result.timestamp.replaceAll(/[:.]/g, '-');
  const htmlPath = join(outputDir, `benchmark-${timestamp}.html`);
  const jsonPath = join(outputDir, `benchmark-${timestamp}.json`);

  writeFileSync(htmlPath, generateHtmlReport(result));
  writeFileSync(jsonPath, serializeRunResult(result));

  heading('Output');
  label('HTML', htmlPath);
  label('JSON', jsonPath);
  label('Duration', `${(result.totalDurationMs / 1000).toFixed(1)}s`);

  if (result.wasmSizes) {
    heading('WASM Sizes');
    const singleSize = formatFileSize(result.wasmSizes.singleWasmBytes);
    const singleJs = formatFileSize(result.wasmSizes.singleJsBytes);
    label('single.wasm', `${singleSize} ${c.dim}(JS: ${singleJs})${c.reset}`);
    if (result.wasmSizes.exceptionsWasmBytes) {
      const excSize = formatFileSize(result.wasmSizes.exceptionsWasmBytes);
      const excJs = formatFileSize(result.wasmSizes.exceptionsJsBytes ?? 0);
      label('exceptions.wasm', `${excSize} ${c.dim}(JS: ${excJs})${c.reset}`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (values.compare?.length === 2) {
    runComparison(values.compare[0]!, values.compare[1]!);
    return;
  }

  await runSuite();
}

async function runSuite(): Promise<void> {
  const iterations = Number.parseInt(values.iterations ?? '5', 10);
  const filterCats = values.filter?.split(',').map((s) => s.trim());
  const cases = filterBenchmarks(filterCats);

  if (cases.length === 0) {
    console.error(`${c.red}No benchmark cases match the filter.${c.reset}`);
    process.exit(1);
  }

  const ocTracing = values.noTracing
    ? ('off' as const)
    : values.ocProfile
      ? ('per-call' as const)
      : ('summary' as const);

  const provenance = loadProvenance();
  const wasmOption = resolveWasmOption();

  if (provenance) {
    printProvenanceBanner(provenance);
  }

  heading('Benchmark Run');
  label('Benchmarks', `${cases.length}`);
  label('Iterations', `${iterations}`);
  label('Tracing', ocTracing);
  label('WASM', typeof wasmOption === 'string' ? wasmOption : 'custom');
  console.log('');

  const result = await runBenchmarks(cases, {
    iterations,
    ocTracing,
    wasm: wasmOption,
    onProgress: onBenchmarkProgress,
  });

  if (provenance) {
    result.provenance = provenance;
    success(`Provenance attached: ${basename(values.provenance!)}`);
  }

  writeResults(result);
  printSummaryTable(result);
}

function runComparison(beforePath: string, afterPath: string): void {
  const before = JSON.parse(readFileSync(resolve(beforePath), 'utf8')) as BenchmarkRunResult;
  const after = JSON.parse(readFileSync(resolve(afterPath), 'utf8')) as BenchmarkRunResult;

  const outputDir = resolve(values.output ?? 'reports');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const htmlPath = join(outputDir, `benchmark-comparison-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.html`);
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
