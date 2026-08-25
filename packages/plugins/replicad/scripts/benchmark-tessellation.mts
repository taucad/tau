/**
 * Replicad tessellation quality benchmark.
 *
 * Usage:
 *   pnpm nx benchmark-tessellation replicad -- \
 *     --fixture /path/to/Flower.zip \
 *     --fixture /path/to/V8.zip \
 *     --variant both \
 *     --repeats 5
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import * as replicad from 'replicad';

type WasmVariant = 'single' | 'multi';

type OcRuntime = {
  BOPAlgo_Options?: unknown;
  BRepMesh_IncrementalMesh?: unknown;
  ReplicadRuntimeInfo?: unknown;
};

type OcFactory = (options: { mainScriptUrlOrBlob?: string; locateFile(file: string): string }) => Promise<OcRuntime>;

type MeshResult = {
  vertices: number[];
  triangles: number[];
  normals: number[];
  faceGroups?: unknown[];
};

type MeshableShape = {
  delete?: () => void;
  mesh(options?: { tolerance?: number; angularTolerance?: number }): MeshResult;
};

type ReplicadOpenCascade = Parameters<typeof replicad.setOC>[0];

type ShapeConfigLike = {
  name?: string;
  shape?: unknown;
};

type ShapeEntry = {
  name: string;
  shape: MeshableShape;
};

type ProjectModule = {
  default?: (parameters?: unknown) => unknown;
  main?: (parameters?: unknown) => unknown;
  defaultParams?: unknown;
  'module.exports'?: ProjectModule;
};

type Samples = {
  median: number;
  mean: number;
  min: number;
  max: number;
};

type MeshBenchmarkResult = {
  fixture: string;
  variant: WasmVariant;
  linearTolerance: number;
  angularToleranceDeg: number;
  medianMs: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  vertices: number;
  triangles: number;
  normals: number;
  faceGroups: number;
  pareto: boolean;
};

type MeshMatrixEntry = {
  linearTolerance: number;
  angularToleranceDeg: number;
};

type FixtureRun = {
  fixture: string;
  fixturePath: string;
  projectDir: string;
  mainFile: string;
  variant: WasmVariant;
  isMultiThreaded: boolean;
  threadCount: number;
  configuredThreadCount: number;
  shapeCount: number;
  shapeBuild: Samples;
  meshResults: MeshBenchmarkResult[];
};

const { values, positionals } = parseArgs({
  options: {
    fixture: { type: 'string', short: 'f', multiple: true },
    variant: { type: 'string', short: 'v', default: 'both' },
    repeats: { type: 'string', short: 'n', default: '5' },
    warmups: { type: 'string', default: '1' },
    'build-repeats': { type: 'string', default: '3' },
    linear: { type: 'string', default: '0.2,0.1,0.05,0.02,0.01,0.005' },
    angular: { type: 'string', default: '30,20,15,10,5' },
    output: { type: 'string', short: 'o', default: '../../../out/reports/benchmarks/replicad-tessellation' },
    'keep-workdir': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
  allowPositionals: true,
});

if (values.help) {
  console.log(`
Replicad tessellation benchmark

Usage:
  pnpm nx benchmark-tessellation replicad -- --fixture <project.zip> [--fixture <project.zip>]

Options:
  -f, --fixture <path>       Replicad project .zip or extracted directory. Can be repeated.
  -v, --variant <variant>    single | multi | both (default: both)
  -n, --repeats <n>          Timed mesh samples per tolerance pair (default: 5)
      --warmups <n>          Untimed mesh warmups per tolerance pair (default: 1)
      --build-repeats <n>    Timed shape-construction samples per fixture/variant (default: 3)
      --linear <csv>         Linear tolerances in mm (default: 0.2,0.1,0.05,0.02,0.01,0.005)
      --angular <csv>        Angular tolerances in degrees (default: 30,20,15,10,5)
  -o, --output <dir>         Output directory for JSON + Markdown reports
                             (default: ../../../out/reports/benchmarks/replicad-tessellation).
      --keep-workdir         Keep extracted zip workdirs for debugging.
`);
  process.exit(0);
}

const packageRoot = process.cwd();
const wasmDirectory = resolve(packageRoot, 'src/wasm');
const fixtureInputs = [...(values.fixture ?? []), ...positionals].map((fixture) => resolve(fixture));
const repeats = parsePositiveInteger(values.repeats, 'repeats');
const warmups = parsePositiveInteger(values.warmups, 'warmups');
const buildRepeats = parsePositiveInteger(values['build-repeats'], 'build-repeats');
const linearTolerances = parseNumberList(values.linear, 'linear');
const angularTolerancesDeg = parseNumberList(values.angular, 'angular');
const variants = parseVariants(values.variant);
const outputDirectory = resolve(packageRoot, values.output);

if (fixtureInputs.length === 0) {
  console.error('At least one --fixture path is required.');
  process.exit(2);
}

for (const fixture of fixtureInputs) {
  if (!existsSync(fixture)) {
    console.error(`Fixture not found: ${fixture}`);
    process.exit(2);
  }
}

const timestamp = new Date().toISOString().replaceAll(/[.:]/g, '-');
const runs: FixtureRun[] = [];
const cleanupDirectories: string[] = [];
const benchmarkTasks: Array<() => Promise<void>> = [];

try {
  for (const fixturePath of fixtureInputs) {
    const prepared = prepareFixture(fixturePath);
    if (prepared.cleanup) {
      cleanupDirectories.push(prepared.projectDir);
    }

    for (const variant of variants) {
      benchmarkTasks.push(async () => {
        const run = await runFixtureVariant({
          fixturePath,
          projectDir: prepared.projectDir,
          fixtureName: fixtureDisplayName(fixturePath),
          variant,
        });
        runs.push(run);
        printRunSummary(run);
      });
    }
  }

  await runSequentially(benchmarkTasks);
} finally {
  if (!values['keep-workdir']) {
    for (const directory of cleanupDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

async function runSequentially(tasks: Array<() => Promise<void>>, index = 0): Promise<void> {
  const task = tasks[index];
  if (!task) {
    return;
  }

  await task();
  await runSequentially(tasks, index + 1);
}

mkdirSync(outputDirectory, { recursive: true });
const jsonPath = join(outputDirectory, `replicad-tessellation-${timestamp}.json`);
const markdownPath = join(outputDirectory, `replicad-tessellation-${timestamp}.md`);
const report = {
  timestamp,
  repeats,
  warmups,
  buildRepeats,
  linearTolerances,
  angularTolerancesDeg,
  runs,
};

writeFileSync(jsonPath, JSON.stringify(report, null, 2));
writeFileSync(markdownPath, renderMarkdownReport(runs));

console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);

function parsePositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`--${label} must be a positive integer.`);
  }

  return parsed;
}

function parseNumberList(value: string | undefined, label: string): number[] {
  const parsed = (value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((number) => Number.isFinite(number) && number > 0);

  if (parsed.length === 0) {
    throw new Error(`--${label} must include at least one positive number.`);
  }

  return parsed;
}

function parseVariants(value: string | undefined): WasmVariant[] {
  if (value === 'single') {
    return ['single'];
  }

  if (value === 'multi') {
    return ['multi'];
  }

  if (value === 'both' || value === undefined) {
    return ['single', 'multi'];
  }

  throw new Error('--variant must be single, multi, or both.');
}

function fixtureDisplayName(fixturePath: string): string {
  return basename(fixturePath, extname(fixturePath));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

function prepareFixture(fixturePath: string): { projectDir: string; cleanup: boolean } {
  if (statSync(fixturePath).isDirectory()) {
    return { projectDir: fixturePath, cleanup: false };
  }

  if (extname(fixturePath).toLowerCase() !== '.zip') {
    throw new Error(`Fixture must be a directory or .zip archive: ${fixturePath}`);
  }

  const cacheRoot = join(packageRoot, 'node_modules/.cache/taulabs-replicad-tessellation');
  mkdirSync(cacheRoot, { recursive: true });
  const projectDirectory = mkdtempSync(join(cacheRoot, `${slugify(fixtureDisplayName(fixturePath))}-`));
  execFileSync('unzip', ['-q', fixturePath, '-d', projectDirectory], { stdio: 'pipe' });
  return { projectDir: projectDirectory, cleanup: true };
}

function findMainFile(projectDirectory: string): string {
  const direct = join(projectDirectory, 'main.ts');
  if (existsSync(direct)) {
    return direct;
  }

  const stack = [projectDirectory];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = execFileSync('find', [current, '-maxdepth', '1', '-mindepth', '1'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);

    for (const entry of entries) {
      const name = basename(entry);
      if (name === 'node_modules' || name === '.tau' || name === '.git') {
        continue;
      }

      if (statSync(entry).isDirectory()) {
        stack.push(entry);
        continue;
      }

      if (name === 'main.ts') {
        return entry;
      }
    }
  }

  throw new Error(`Could not find main.ts under ${projectDirectory}`);
}

async function initializeOc(variant: WasmVariant): Promise<{
  oc: OcRuntime;
  isMultiThreaded: boolean;
  threadCount: number;
  configuredThreadCount: number;
}> {
  const baseName = variant === 'multi' ? 'replicad_multi' : 'replicad_single';
  const jsPath = join(wasmDirectory, `${baseName}.js`);
  const factory = (await import(pathToFileURL(jsPath).href)) as { default: OcFactory };
  const oc = await factory.default({
    locateFile(file) {
      return join(wasmDirectory, file);
    },
    ...(variant === 'multi' ? { mainScriptUrlOrBlob: jsPath } : {}),
  });

  if (variant === 'multi') {
    callOptionalMethod<void>(oc.BOPAlgo_Options, 'SetParallelMode', true);
    callOptionalMethod<void>(oc.BRepMesh_IncrementalMesh, 'SetParallelDefault', true);
  }

  const configuredThreadCount = callOptionalMethod<number>(oc.ReplicadRuntimeInfo, 'ConfigureThreadPool') ?? 1;

  replicad.setOC(oc as unknown as ReplicadOpenCascade);

  return {
    oc,
    isMultiThreaded: callOptionalMethod<boolean>(oc.ReplicadRuntimeInfo, 'IsMultiThreaded') ?? false,
    threadCount: callOptionalMethod<number>(oc.ReplicadRuntimeInfo, 'ThreadCount') ?? 1,
    configuredThreadCount,
  };
}

function callOptionalMethod<T>(target: unknown, methodName: string, ...args: unknown[]): T | undefined {
  if ((typeof target !== 'object' && typeof target !== 'function') || target === null) {
    return undefined;
  }

  const method = (target as Record<string, unknown>)[methodName];
  if (typeof method !== 'function') {
    return undefined;
  }

  return Reflect.apply(method, target, args) as T;
}

async function loadProject(mainFile: string, variant: WasmVariant): Promise<ProjectModule> {
  const url = `${pathToFileURL(mainFile).href}?tauBench=${variant}-${Date.now()}`;
  const module_ = (await import(url)) as ProjectModule;
  const cjsExports = module_['module.exports'];
  if (cjsExports !== undefined && (cjsExports.default ?? cjsExports.main) !== undefined) {
    return cjsExports;
  }

  return module_;
}

async function runFixtureVariant({
  fixturePath,
  projectDir,
  fixtureName,
  variant,
}: {
  fixturePath: string;
  projectDir: string;
  fixtureName: string;
  variant: WasmVariant;
}): Promise<FixtureRun> {
  const mainFile = findMainFile(projectDir);
  const runtime = await initializeOc(variant);
  const project = await loadProject(mainFile, variant);
  const main = project.default ?? project.main;
  if (!main) {
    throw new Error(`Fixture ${fixtureName} does not export a default/main function.`);
  }

  const buildSamples: number[] = [];
  let shapeEntries: ShapeEntry[] = [];
  for (let i = 0; i < buildRepeats + 1; i += 1) {
    const started = performance.now();
    const rawShapes = main(project.defaultParams);
    const entries = normalizeShapeEntries(rawShapes);
    const elapsed = performance.now() - started;

    if (i > 0) {
      buildSamples.push(elapsed);
    }

    if (i === buildRepeats) {
      shapeEntries = entries;
    } else {
      deleteShapeEntries(entries);
    }
  }

  if (shapeEntries.length === 0) {
    throw new Error(`Fixture ${fixtureName} produced no meshable shapes.`);
  }

  const meshResults = await runMeshMatrix({
    fixtureName,
    variant,
    shapeEntries,
  });
  markPareto(meshResults);
  deleteShapeEntries(shapeEntries);

  return {
    fixture: fixtureName,
    fixturePath,
    projectDir,
    mainFile,
    variant,
    isMultiThreaded: runtime.isMultiThreaded,
    threadCount: runtime.threadCount,
    configuredThreadCount: runtime.configuredThreadCount,
    shapeCount: shapeEntries.length,
    shapeBuild: summarizeSamples(buildSamples),
    meshResults,
  };
}

async function runMeshMatrix({
  fixtureName,
  variant,
  shapeEntries,
}: {
  fixtureName: string;
  variant: WasmVariant;
  shapeEntries: ShapeEntry[];
}): Promise<MeshBenchmarkResult[]> {
  const matrix = linearTolerances.flatMap((linearTolerance) =>
    angularTolerancesDeg.map((angularToleranceDeg) => ({
      linearTolerance,
      angularToleranceDeg,
    })),
  );

  return matrix.map((entry) =>
    runMeshMatrixEntry({
      fixtureName,
      variant,
      shapeEntries,
      entry,
    }),
  );
}

function runMeshMatrixEntry({
  fixtureName,
  variant,
  shapeEntries,
  entry,
}: {
  fixtureName: string;
  variant: WasmVariant;
  shapeEntries: ShapeEntry[];
  entry: MeshMatrixEntry;
}): MeshBenchmarkResult {
  const angularTolerance = (entry.angularToleranceDeg * Math.PI) / 180;
  const samples: number[] = [];
  let counts = {
    vertices: 0,
    triangles: 0,
    normals: 0,
    faceGroups: 0,
  };

  for (let i = 0; i < warmups + repeats; i += 1) {
    const started = performance.now();
    counts = meshShapeEntries(shapeEntries, {
      linearTolerance: entry.linearTolerance,
      angularTolerance,
    });
    const elapsed = performance.now() - started;
    if (i >= warmups) {
      samples.push(elapsed);
    }
  }

  const sampleSummary = summarizeSamples(samples);
  return {
    fixture: fixtureName,
    variant,
    ...entry,
    medianMs: sampleSummary.median,
    meanMs: sampleSummary.mean,
    minMs: sampleSummary.min,
    maxMs: sampleSummary.max,
    ...counts,
    pareto: false,
  };
}

function normalizeShapeEntries(value: unknown): ShapeEntry[] {
  const values = Array.isArray(value) ? value : [value];
  const entries: ShapeEntry[] = [];

  for (const [index, item] of values.entries()) {
    if (isShapeConfig(item) && isMeshableShape(item.shape)) {
      entries.push({
        name: item.name ?? `Shape ${index + 1}`,
        shape: item.shape,
      });
      continue;
    }

    if (isMeshableShape(item)) {
      entries.push({
        name: `Shape ${index + 1}`,
        shape: item,
      });
    }
  }

  return entries;
}

function isShapeConfig(value: unknown): value is ShapeConfigLike {
  return typeof value === 'object' && value !== null && 'shape' in value;
}

function isMeshableShape(value: unknown): value is MeshableShape {
  return typeof value === 'object' && value !== null && typeof (value as MeshableShape).mesh === 'function';
}

function meshShapeEntries(
  shapeEntries: ShapeEntry[],
  {
    linearTolerance,
    angularTolerance,
  }: {
    linearTolerance: number;
    angularTolerance: number;
  },
): {
  vertices: number;
  triangles: number;
  normals: number;
  faceGroups: number;
} {
  let vertices = 0;
  let triangles = 0;
  let normals = 0;
  let faceGroups = 0;

  for (const { shape } of shapeEntries) {
    const mesh = shape.mesh({
      tolerance: linearTolerance,
      angularTolerance,
    });
    vertices += mesh.vertices.length / 3;
    triangles += mesh.triangles.length / 3;
    normals += mesh.normals.length / 3;
    faceGroups += mesh.faceGroups?.length ?? 0;
  }

  return {
    vertices,
    triangles,
    normals,
    faceGroups,
  };
}

function deleteShapeEntries(entries: ShapeEntry[]): void {
  for (const { shape } of entries) {
    shape.delete?.();
  }
}

function summarizeSamples(samples: number[]): Samples {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;

  return {
    median: round(median),
    mean: round(mean),
    min: round(sorted[0]!),
    max: round(sorted.at(-1)!),
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function markPareto(results: MeshBenchmarkResult[]): void {
  for (const candidate of results) {
    candidate.pareto = !results.some((other) => {
      if (other === candidate) {
        return false;
      }

      const atLeastAsFast = other.medianMs <= candidate.medianMs;
      const atLeastAsDetailed = other.triangles >= candidate.triangles;
      const strictlyBetter = other.medianMs < candidate.medianMs || other.triangles > candidate.triangles;
      return atLeastAsFast && atLeastAsDetailed && strictlyBetter;
    });
  }
}

function printRunSummary(run: FixtureRun): void {
  console.log(`\n${run.fixture} / ${run.variant}`);
  console.log(
    `Shapes: ${run.shapeCount}, threads: ${run.threadCount}, configured: ${run.configuredThreadCount}, build median: ${run.shapeBuild.median} ms`,
  );
  console.log(
    formatTable(
      ['linear', 'angular', 'median ms', 'triangles', 'vertices', 'pareto'],
      run.meshResults.map((result) => [
        result.linearTolerance.toString(),
        result.angularToleranceDeg.toString(),
        result.medianMs.toFixed(3),
        result.triangles.toString(),
        result.vertices.toString(),
        result.pareto ? 'yes' : '',
      ]),
    ),
  );
}

function renderMarkdownReport(runs: FixtureRun[]): string {
  const lines = [
    '# Replicad Tessellation Benchmark',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Mesh samples per tolerance: ${repeats}; warmups: ${warmups}; shape build samples: ${buildRepeats}.`,
    '',
  ];

  for (const run of runs) {
    lines.push(`## ${run.fixture} / ${run.variant}`, '');
    lines.push(
      `Shapes: ${run.shapeCount}; threads: ${run.threadCount}; configured threads: ${run.configuredThreadCount}; shape build median: ${run.shapeBuild.median} ms.`,
      '',
    );
    lines.push(
      formatMarkdownTable(
        ['Linear mm', 'Angular deg', 'Median ms', 'Mean ms', 'Triangles', 'Vertices', 'Pareto'],
        run.meshResults.map((result) => [
          result.linearTolerance.toString(),
          result.angularToleranceDeg.toString(),
          result.medianMs.toFixed(3),
          result.meanMs.toFixed(3),
          result.triangles.toString(),
          result.vertices.toString(),
          result.pareto ? 'yes' : '',
        ]),
      ),
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  const formatRow = (row: string[]) => row.map((cell, index) => cell.padStart(widths[index] ?? cell.length)).join('  ');

  return [
    formatRow(headers),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map((row) => formatRow(row)),
  ].join('\n');
}

function formatMarkdownTable(headers: string[], rows: string[][]): string {
  const divider = headers.map(() => '---');
  const formatRow = (row: string[]) => `| ${row.join(' | ')} |`;
  return [formatRow(headers), formatRow(divider), ...rows.map((row) => formatRow(row))].join('\n');
}
