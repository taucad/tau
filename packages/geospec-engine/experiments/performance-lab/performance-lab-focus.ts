#!/usr/bin/env node
/**
 * Private focus diagnostic over selected performance-lab catalog cases; not Q7 qualification.
 * Each round runs every selected case once per product, in a fresh child and rotating product order. A child
 * admits the case fixture once, then evaluates the unchanged authored claim `--repeats` times on that retained
 * subject: repeat 0 is the cold first claim and later repeats are warm repeat claims.
 * Run with Node's native TypeScript support from any directory. No environment variables required.
 * Usage: node packages/geospec-engine/experiments/performance-lab/performance-lab-focus.ts --output-dir=out/reports/benchmarks/focus
 * Exit: 0 recorded; 1 worker error, unexpected status, product drift or unequal same-family bytes.
 */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  isHostContended,
  readHost,
  selectLabFixtures,
  selectLabProducts,
  summarizeLabCaseResults,
  toRunCase,
  verifyLabArtifacts,
} from '#experiments/performance-lab/performance-lab-cli.js';
import type { HostReading } from '#experiments/performance-lab/performance-lab-cli.js';
// oxlint-disable-next-line no-restricted-imports -- Private lab uses the native benchmark artifact type without a public export.
import type { Artifact } from '../../../geospec-engine-native/bench/lib.ts';
import { withTwoCallClaims } from '#experiments/performance-lab/performance-lab-runner.js';
import type {
  PerformanceLabCaseResult,
  PerformanceLabModules,
  PerformanceLabRunInput,
  PerformanceLabRunResult,
  PerformanceLabWasmExecution,
} from '#experiments/performance-lab/performance-lab-runner.js';

// oxlint-disable-next-line typescript/no-restricted-types -- Raw JSON evidence distinguishes explicit null from omission.
type WireNull = null;
type Family = 'native' | 'wasm';
/** One selected product; `files` pins the exact bytes its child verifies and loads. @internal */
export type FocusProduct = {
  label: string;
  family: Family;
  engine: PerformanceLabRunInput['engine'];
  /** Native Node add-on, selected through NAPI_RS_NATIVE_LIBRARY_PATH. */
  addon?: string;
  /** ST WASM binary and Emscripten glue. */
  binary?: string;
  glue?: string;
  /** MT WASM asset receipt; the loader verifies its glue, binary and build receipt. */
  receipt?: string;
  /** Caller-inclusive native executionPermits, or an MT grant no larger than the receipt's permits. */
  permits?: number;
  files: Array<Artifact & { bytes: number }>;
};
type ProductRequest = Omit<FocusProduct, 'label' | 'files'> & { label?: string };
type Options = {
  products: ProductRequest[];
  caseIds: string[];
  outputDir: string;
  samples: number;
  repeats: number;
  maxLoadPerCpu: number;
  minFreeMemoryMiB: number;
  contendedHost: boolean;
  /** Milliseconds between thread polls; 0 disables polling. */
  threadInterval: number;
  /** Milliseconds. */
  cellTimeout: number;
};
/** One fresh child: a round, a catalog case and a product. @internal */
export type FocusCell<Product> = { sequence: number; round: number; caseId: string; product: Product };
/** `at` is performance.now() milliseconds; `cpu` is cumulative process.cpuUsage(). */
type Sample = { at: number; cpu: NodeJS.CpuUsage };
/** One traced engine call; `end` is absent when the call threw. @internal */
export type FocusCall = { method: string; start: Sample; end?: Sample };
/** One phase: wall milliseconds and process CPU microseconds. */
type Window = { wall: number; userMicros: number; systemMicros: number };
/** Phase windows at the runner's boundaries; evaluation also splits evenly per repeat. @internal */
export type FocusPhases = Record<'startup' | 'admission' | 'evaluation' | 'cleanup' | 'runner', Window | WireNull> & {
  evaluationByRepeat: Array<Window | WireNull> | WireNull;
};
type Capture = { bytes: number; sha256: string; base64: string };
type CaseEvidence = Pick<
  PerformanceLabCaseResult,
  'caseId' | 'repeat' | 'status' | 'expectedStatus' | 'numericProfile'
> & {
  /** Milliseconds, as timed by the shared runner. */
  evaluation: number;
  diagnosticCodes: string[];
  result: Capture | WireNull;
};
type ChildReport = {
  node: string;
  pid: number;
  maxRssBytes: number;
  fixture?: { id: string; sha256: string; bytes: number };
  caseSha256?: string;
  loadedAddons?: string[];
  timing?: PerformanceLabRunResult['timing'];
  phases?: FocusPhases;
  processCpu?: { userMicros: number; systemMicros: number };
  admission?: Capture | WireNull;
  profile?: string | WireNull;
  perCase?: CaseEvidence[];
  observations?: unknown;
  buildIdentity?: unknown;
  /** `at` is milliseconds after the runner started. */
  calls?: Array<{ method: string; at: number } & Partial<Window>>;
  error?: { message: string; stack?: string };
};
/** `pollInterval` is milliseconds. */
type ThreadHighWater = { max: number; samples: number; pollInterval: number };
/** One raw JSONL row. @internal */
export type FocusRow = {
  sequence: number;
  round: number;
  product: string;
  family: Family;
  engine: PerformanceLabRunInput['engine'];
  caseId: string;
  hostBefore: HostReading;
  hostAfter: HostReading;
  contended: boolean;
  /** Milliseconds from parent spawn through child close. */
  processWall: number;
  exit: { code: number | WireNull; signal: string | WireNull; error?: string };
  threads: ThreadHighWater | WireNull;
  report: ChildReport | WireNull;
  stdoutTail: string;
  stderrTail: string;
};
type Stats = { n: number; median: number; min: number; max: number };
/** CPU medians in microseconds. */
type CpuMedians = { userMicros: number; systemMicros: number; totalMicros: number } | WireNull;
/** Raw-row digest: counts, per case/product timing groups and per case/family parity. @internal */
export type FocusSummary = {
  counts: Record<
    | 'cells'
    | 'failures'
    | 'contended'
    | 'expectedMatches'
    | 'unexpectedStatuses'
    | 'unverifiedExpectations'
    | 'unsupported'
    | 'knownDifferences'
    | 'sameFamilyMismatches',
    number
  >;
  groups: Array<{
    caseId: string;
    product: string;
    family: Family;
    cells: number;
    failures: number;
    contended: number;
    statuses: string[];
    expectedStatus: string | WireNull;
    /** Millisecond statistics. */
    wall: Record<
      'process' | 'harness' | 'startup' | 'admission' | 'firstClaim' | 'repeatClaim' | 'runner',
      Stats | WireNull
    >;
    cpu: Record<
      'startup' | 'admission' | 'evaluation' | 'firstClaim' | 'repeatClaim' | 'runner' | 'process',
      CpuMedians
    >;
    maxRssMiB: Stats | WireNull;
    threadsMax: number | WireNull;
    loadPerCpuBefore: Stats | WireNull;
  }>;
  parity: Array<{
    caseId: string;
    families: Array<{
      family: Family;
      products: string[];
      observations: number;
      statuses: string[];
      resultSha256: string[];
      admissionSha256: string[];
      exact: boolean;
    }>;
    crossFamilyStatusAgreement: boolean;
  }>;
};

const root = resolvePath(import.meta.dirname, '../../../..');
const packageRoot = resolvePath(root, 'packages/geospec-engine-native');
const script = resolvePath(import.meta.dirname, 'performance-lab-focus.ts');
const defaults = {
  addon: resolvePath(packageRoot, 'bindings/node/generated/geospec-engine-native.darwin-arm64.node'),
  binary: resolvePath(packageRoot, 'bindings/emscripten/generated/geospec_engine_native.wasm'),
  glue: resolvePath(packageRoot, 'bindings/emscripten/generated/geospec_engine_native.mjs'),
};
/** Two required scale cases plus one catalog case per workload class; each keeps its authored claim unchanged. */
const focusCaseIds = [
  'exploratory-many-occurrences-4096-step', // Scale: 4,096 placed occurrences; admission-dominated.
  'exploratory-planetary-gearbox-step', // Scale: mechanical vise assembly STEP.
  'm3-toHaveVolume-positive', // BRep scalar mass-property facts on the two-part M3 control.
  'analytic-through-positive', // Face-feature recognition with independent analytic authority.
  'm3-toHaveNoComponentInterference-positive', // Component interference/overlap proof.
  'm3-toHaveProductStructure-positive', // Product-structure metadata on the v5 source-occurrence route.
  'exploratory-large-mesh-48-glb', // Large mesh: 1.33M-triangle GLB.
  'm3-toHaveVoidContinuity-positive', // Void proof on the nominal guide bore.
  'm3-query-analyzeBrep', // Broad analyzeBrep query.
];
const engines = { native: 'native-desktop', wasm: 'combined-wasm' } as const;
const productKeys: Record<Family, readonly string[]> = {
  native: ['addon', 'permits'],
  wasm: ['binary', 'glue', 'receipt', 'permits'],
};
const admissionMethods = new Set(['ingestSubject', 'ingestMesh', 'subjectHandle']);
const evaluationMethods = new Set(['canonicalPlan', 'evaluateClaim', 'evaluatePlan', 'processRequest']);
const cleanupMethods = new Set(['releaseSubject', 'close']);
const help = `Private performance-lab focus diagnostic (not Q7 qualification).
  --product=engine=native[,addon=/abs/geospec-engine-native.node][,permits=N][,label=name]
  --product=engine=wasm[,binary=/abs/geospec_engine_native.wasm][,glue=/abs/geospec_engine_native.mjs][,label=name]
  --product=engine=wasm,receipt=/abs/geospec_engine_native.mt.json,permits=N[,label=name]
Repeat --product to compare products; the default is installed native and ST WASM. Native permits are
caller-inclusive executionPermits; an MT grant may be smaller than, never larger than, the receipt's permits.
Products of one engine family must return identical admission and result bytes for a case; different families are
compared by status only.
  --case=<catalog case id>                   Repeatable; default is the nine-case focus selection.
  --output-dir=out/reports/benchmarks/focus  Required NEW directory; relative to workspace root.
  --samples=5                                Rounds; each round runs every case/product once in a fresh child.
  --repeats=2                                Claims per retained subject: cold first claim, then warm repeats.
  --max-load-per-cpu=1                       Refuse a noisy host before each cell (the catalog CLI's guard).
  --min-free-memory-mib=1024                 Refuse a low free-page host before each cell.
  --contended-host                           Opt-in: record and mark guard violations as contended, never refuse.
  --thread-sample-ms=250                     Parent polls child OS threads with ps -M; 0 disables.
  --cell-timeout-ms=900000                   Kill a child past its wall limit.
Results: run.json, rows.jsonl (raw base64 bytes, phase wall/CPU, RSS, threads, load), summary.json, summary.md.
`;

const sha256Hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const hashFile = async (path: string): Promise<Artifact & { bytes: number }> => {
  const bytes = await readFile(path);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
};
const capture = (bytes: Uint8Array<ArrayBuffer>): Capture => ({
  bytes: bytes.byteLength,
  sha256: sha256Hex(bytes),
  base64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'),
});
const catalogCases = () =>
  new Map(
    selectLabFixtures(true).flatMap(({ fixture, cases }) =>
      cases.map((entry) => [entry.id, { fixture, entry }] as const),
    ),
  );

/**
 * Parse one `--product` selection and fill the installed defaults.
 * @internal
 * @param text - Comma-separated `key=value` fields; `engine` is required.
 * @returns Product request with absolute paths; hashes are taken later.
 */
// oxlint-disable-next-line complexity -- Validate every product field before any product file is opened.
export const parseProduct = (text: string): ProductRequest => {
  const fields = new Map(
    text.split(',').map((pair) => {
      const at = pair.indexOf('=');
      return at < 1 ? ([pair, ''] as const) : ([pair.slice(0, at), pair.slice(at + 1)] as const);
    }),
  );
  const family = fields.get('engine');
  if (family !== 'native' && family !== 'wasm') {
    throw new Error(`--product needs engine=native|wasm: ${text}`);
  }
  for (const [key, value] of fields) {
    const isPath = !['engine', 'label', 'permits'].includes(key);
    if (!['engine', 'label', ...productKeys[family]].includes(key) || value === '' || (isPath && !isAbsolute(value))) {
      throw new Error(`Invalid ${family} product field '${key}' (paths must be absolute): ${text}`);
    }
  }
  const label = fields.get('label');
  const permits = fields.has('permits') ? Number(fields.get('permits')) : undefined;
  const receipt = fields.get('receipt');
  if (
    (label !== undefined && !/^[\w.-]{1,64}$/u.test(label)) ||
    (permits !== undefined && (!Number.isSafeInteger(permits) || permits < 1)) ||
    (family === 'wasm' &&
      (receipt === undefined
        ? permits !== undefined
        : permits === undefined || fields.has('binary') || fields.has('glue')))
  ) {
    throw new Error(`Invalid label/permits, or WASM mixes ST binary/glue with an MT receipt+permits: ${text}`);
  }
  const pathOf = (key: keyof typeof defaults) => resolvePath(fields.get(key) ?? defaults[key]);
  return {
    family,
    engine: engines[family],
    ...(label === undefined ? {} : { label }),
    ...(permits === undefined ? {} : { permits }),
    ...(family === 'native' ? { addon: pathOf('addon') } : {}),
    ...(family === 'wasm' && receipt !== undefined ? { receipt: resolvePath(receipt) } : {}),
    ...(family === 'wasm' && receipt === undefined ? { binary: pathOf('binary'), glue: pathOf('glue') } : {}),
  };
};

/**
 * Parse focus options without importing an engine.
 * @internal
 * @param args - CLI tokens excluding Node and the script path.
 * @returns Selected products, catalog cases and guards.
 */
// oxlint-disable-next-line complexity -- Validate all bench gates together before any product or engine is opened.
export const parseFocusArguments = (args: string[]): Options => {
  const { values } = parseArgs({
    args,
    options: {
      product: { type: 'string', multiple: true },
      case: { type: 'string', multiple: true },
      'output-dir': { type: 'string' },
      samples: { type: 'string', default: '5' },
      repeats: { type: 'string', default: '2' },
      'max-load-per-cpu': { type: 'string', default: '1' },
      'min-free-memory-mib': { type: 'string', default: '1024' },
      'contended-host': { type: 'boolean', default: false },
      'thread-sample-ms': { type: 'string', default: '250' },
      'cell-timeout-ms': { type: 'string', default: '900000' },
    },
    strict: true,
    allowPositionals: false,
  });
  const [samples, repeats, maxLoadPerCpu, minFreeMemoryMiB, threadInterval, cellTimeout] = [
    values.samples,
    values.repeats,
    values['max-load-per-cpu'],
    values['min-free-memory-mib'],
    values['thread-sample-ms'],
    values['cell-timeout-ms'],
  ].map(Number) as [number, number, number, number, number, number];
  if (
    !values['output-dir'] ||
    !Number.isSafeInteger(samples) ||
    samples < 1 ||
    !Number.isSafeInteger(repeats) ||
    repeats < 1 ||
    repeats > 20 ||
    !Number.isFinite(maxLoadPerCpu) ||
    maxLoadPerCpu <= 0 ||
    !Number.isSafeInteger(minFreeMemoryMiB) ||
    minFreeMemoryMiB < 0 ||
    !Number.isSafeInteger(threadInterval) ||
    threadInterval < 0 ||
    !Number.isSafeInteger(cellTimeout) ||
    cellTimeout < 1
  ) {
    throw new Error('Supply --output-dir, samples >= 1, repeats 1-20 and valid guards. See --help.');
  }
  const caseIds = values.case ?? focusCaseIds;
  const catalog = catalogCases();
  const unknown = caseIds.filter((id) => !catalog.has(id));
  if (unknown.length > 0 || new Set(caseIds).size !== caseIds.length) {
    throw new Error(`Unknown or repeated catalog case: ${unknown.join(', ') || caseIds.join(', ')}`);
  }
  return {
    products: (values.product ?? ['engine=native', 'engine=wasm']).map((text) => parseProduct(text)),
    caseIds,
    outputDir: resolvePath(root, values['output-dir']),
    samples,
    repeats,
    maxLoadPerCpu,
    minFreeMemoryMiB,
    contendedHost: values['contended-host'],
    threadInterval,
    cellTimeout,
  };
};

/**
 * Rotate case and product order deterministically, with one fresh child per round/case/product.
 * @internal
 * @param caseIds - Selected catalog cases.
 * @param products - Selected products.
 * @param samples - Rounds.
 * @returns Serial dispatch order; a case's products run adjacently and their order rotates each round.
 */
export const planFocusCells = <Product>(
  caseIds: readonly string[],
  products: readonly Product[],
  samples: number,
): Array<FocusCell<Product>> => {
  const cells: Array<FocusCell<Product>> = [];
  for (let round = 0; round < samples; round += 1) {
    for (let index = 0; index < caseIds.length; index += 1) {
      const caseIndex = (index + round) % caseIds.length;
      for (let position = 0; position < products.length; position += 1) {
        cells.push({
          sequence: cells.length,
          round: round + 1,
          caseId: caseIds[caseIndex]!,
          product: products[(position + caseIndex + round) % products.length]!,
        });
      }
    }
  }
  return cells;
};

const span = (from?: Sample, to?: Sample): Window | WireNull =>
  from === undefined || to === undefined
    ? null
    : {
        wall: to.at - from.at,
        userMicros: to.cpu.user - from.cpu.user,
        systemMicros: to.cpu.system - from.cpu.system,
      };

/**
 * Derive phase wall/CPU windows from traced engine calls, matching the runner's phase boundaries.
 * @internal
 * @param calls - Traced calls in issue order, including the `new Engine` construction.
 * @param bounds - Samples immediately before and after the runner.
 * @param repeats - Claims per retained subject; evaluation calls split evenly across repeats or not at all.
 * @returns Startup, admission, evaluation (total and per repeat), cleanup and whole-runner windows.
 */
export const phaseWindows = (
  calls: readonly FocusCall[],
  bounds: { start: Sample; end: Sample },
  repeats: number,
): FocusPhases => {
  const admission = calls.filter(({ method }) => admissionMethods.has(method));
  const evaluation = calls.filter(({ method }) => evaluationMethods.has(method));
  const perRepeat = evaluation.length > 0 && evaluation.length % repeats === 0 ? evaluation.length / repeats : 0;
  return {
    startup: span(bounds.start, calls.find(({ method }) => method === 'new Engine')?.end),
    admission: span(admission[0]?.start, admission.at(-1)?.end),
    evaluation: span(evaluation[0]?.start, evaluation.at(-1)?.end),
    evaluationByRepeat:
      perRepeat === 0
        ? null
        : Array.from({ length: repeats }, (_, repeat) =>
            span(evaluation[repeat * perRepeat]?.start, evaluation[(repeat + 1) * perRepeat - 1]?.end),
          ),
    cleanup: span(calls.find(({ method }) => cleanupMethods.has(method))?.start, bounds.end),
    runner: span(bounds.start, bounds.end),
  };
};

const diagnosticCode = (value: unknown): string =>
  typeof value === 'object' && value !== null && 'code' in value ? String(value.code) : String(value);

const caseEvidence = (entry: PerformanceLabCaseResult): CaseEvidence => {
  const result = entry.canonicalResultUtf8 === null ? null : capture(Buffer.from(entry.canonicalResultUtf8, 'utf8'));
  if (result !== null && result.sha256 !== entry.canonicalResultSha256) {
    throw new Error(`Canonical result bytes for ${entry.caseId} did not round-trip exactly.`);
  }
  return {
    caseId: entry.caseId,
    repeat: entry.repeat,
    status: entry.status,
    expectedStatus: entry.expectedStatus,
    numericProfile: entry.numericProfile,
    evaluation: entry.evaluation,
    diagnosticCodes: entry.diagnostics.map((value) => diagnosticCode(value)),
    result,
  };
};

// oxlint-disable-next-line max-lines-per-function -- One child owns product selection, tracing and its evidence record.
const measureFocusCase = async (spec: { product: FocusProduct; caseId: string; repeats: number }) => {
  const { product, repeats } = spec;
  await verifyLabArtifacts(product.files);
  const selected = catalogCases().get(spec.caseId);
  if (selected === undefined) {
    throw new Error(`Unknown catalog case ${spec.caseId}.`);
  }
  const { fixture, entry } = selected;
  const bytes = new Uint8Array(await readFile(resolvePath(root, fixture.path)));
  if (sha256Hex(bytes) !== fixture.sha256 || bytes.byteLength !== fixture.bytes) {
    throw new Error(`Pinned fixture bytes changed: ${fixture.id}`);
  }
  const runCase = toRunCase(entry);
  const calls: FocusCall[] = [];
  const seen: { admission?: Uint8Array<ArrayBuffer> } = {};
  const sample = (): Sample => ({ at: performance.now(), cpu: process.cpuUsage() });
  // Proxies call through to the real target so private fields stay intact.
  // oxlint-disable-next-line typescript/no-restricted-types -- Proxy targets are arbitrary engine objects.
  const trace = <T extends object>(target: T): T =>
    new Proxy(target, {
      get: (object, key) => {
        const value: unknown = Reflect.get(object, key);
        if (typeof value !== 'function') {
          return value;
        }
        return (...args: unknown[]) => {
          const call: FocusCall = { method: String(key), start: sample() };
          calls.push(call);
          const settle = (output: unknown): unknown => {
            call.end = sample();
            if (call.method === 'ingestSubject' && output instanceof Uint8Array) {
              seen.admission ??= output as Uint8Array<ArrayBuffer>;
            }
            return output;
          };
          const settleLater = async (pending: Promise<unknown>): Promise<unknown> => settle(await pending);
          const output: unknown = Reflect.apply(value, object, args);
          return output instanceof Promise ? settleLater(output) : settle(output);
        };
      },
    });
  const construct = <T extends new (...values: never[]) => unknown>(engineClass: T, args?: readonly unknown[]): T =>
    new Proxy(engineClass, {
      construct: (target, received: unknown[]) => {
        const start = sample();
        const engine = trace(Reflect.construct(target, args ?? received) as Record<string, unknown>);
        calls.push({ method: 'new Engine', start, end: sample() });
        return engine;
      },
    });
  const load = selectLabProducts({ nativeAddon: product.addon, mixedGlue: product.glue, mixedBinary: product.binary });
  const hostEntry = (name: 'node' | 'wasm') => resolvePath(packageRoot, `src/${name}.ts`);
  const modules: PerformanceLabModules = {
    native: async () => {
      const loaded = await load(hostEntry('node'));
      // An add-on from before evaluateClaim (R10) still runs the cell through the calls its client made.
      const binding = (await import(
        pathToFileURL(resolvePath(packageRoot, 'bindings/node/generated/index.js')).href
      )) as {
        Engine: { prototype: Record<string, unknown> };
      };
      const module = 'evaluateClaim' in binding.Engine.prototype ? loaded : withTwoCallClaims(loaded);
      return {
        ...module,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the injected engine module contract.
        Engine: construct(module.Engine, product.permits === undefined ? undefined : [undefined, product.permits]),
      };
    },
    combined: async () => {
      const module = await load(hostEntry('wasm'));
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the injected engine module contract.
      return { ...module, Engine: construct(module.Engine) };
    },
  };
  const execution: PerformanceLabWasmExecution | undefined =
    product.receipt === undefined
      ? undefined
      : { variant: 'mt', permits: product.permits!, receipt: pathToFileURL(product.receipt).href };
  const { runPerformanceLabCell } = await import('#experiments/performance-lab/performance-lab-runner.js');
  const start = sample();
  const result = await runPerformanceLabCell(
    {
      engine: product.engine,
      ...(execution === undefined ? {} : { execution }),
      fixture: {
        id: fixture.id,
        format: fixture.format,
        sourceUnit: fixture.sourceUnit,
        bytes,
        sha256: fixture.sha256,
      },
      cases: [runCase],
      repeats,
      cache: 'cold',
    },
    modules,
  );
  const end = sample();
  const processCpu = process.cpuUsage();
  const loadedAddons = (process.report.getReport() as { sharedObjects: string[] }).sharedObjects.filter((path) =>
    path.endsWith('.node'),
  );
  if (product.addon !== undefined && !loadedAddons.includes(await realpath(product.addon))) {
    throw new Error(`The loaded add-ons do not include the selected ${product.addon}.`);
  }
  return {
    fixture: { id: fixture.id, sha256: fixture.sha256, bytes: fixture.bytes },
    caseSha256: sha256Hex(Buffer.from(JSON.stringify(runCase))),
    loadedAddons,
    timing: result.timing,
    phases: phaseWindows(calls, { start, end }, repeats),
    processCpu: { userMicros: processCpu.user, systemMicros: processCpu.system },
    admission: seen.admission === undefined ? null : capture(seen.admission),
    profile: result.profile,
    perCase: result.perCase.map((value) => caseEvidence(value)),
    observations: result.engineObservations,
    buildIdentity: result.buildIdentity,
    calls: calls.map((call) => ({ method: call.method, at: call.start.at - start.at, ...span(call.start, call.end) })),
  };
};

const runFocusChild = async (spec: {
  product: FocusProduct;
  caseId: string;
  repeats: number;
  output: string;
}): Promise<void> => {
  let report: ChildReport = { node: process.version, pid: process.pid, maxRssBytes: 0 };
  try {
    report = { ...report, ...(await measureFocusCase(spec)) };
  } catch (error) {
    report.error = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
    process.exitCode = 1;
  }
  report.maxRssBytes = process.resourceUsage().maxRSS * 1024;
  await writeFile(spec.output, JSON.stringify(report), { flag: 'wx' });
};

/**
 * Poll a child's OS thread count; macOS `ps -M` prints a header plus one line per thread.
 * @param pid - Child process.
 * @param pollInterval - Milliseconds between polls; one poll is in flight at a time.
 * @returns Stop function giving the sampled high-water, a lower bound, or null without a sample.
 */
const sampleThreads = (pid: number, pollInterval: number): (() => ThreadHighWater | WireNull) => {
  let max = 0;
  let samples = 0;
  let pending = false;
  const timer = setInterval(() => {
    if (pending) {
      return;
    }
    pending = true;
    execFile('ps', ['-M', '-p', String(pid)], (error, stdout) => {
      pending = false;
      const threads = stdout.trim().split('\n').length - 1;
      if (!error && threads > 0) {
        samples += 1;
        max = Math.max(max, threads);
      }
    });
  }, pollInterval);
  return () => {
    clearInterval(timer);
    return samples === 0 ? null : { max, samples, pollInterval };
  };
};

const invokeFocusCell = async (
  cell: FocusCell<FocusProduct>,
  options: Options,
): Promise<Omit<FocusRow, 'hostBefore' | 'hostAfter' | 'contended'>> => {
  const output = resolvePath(options.outputDir, `cell-${String(cell.sequence).padStart(5, '0')}.json`);
  const spec = { product: cell.product, caseId: cell.caseId, repeats: options.repeats, output };
  const started = performance.now();
  const child = spawn(process.execPath, [script, `--child=${JSON.stringify(spec)}`], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.cellTimeout,
    killSignal: 'SIGKILL',
  });
  const stopThreads =
    options.threadInterval > 0 && child.pid !== undefined
      ? sampleThreads(child.pid, options.threadInterval)
      : () => null;
  const tails = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    tails.stdout = (tails.stdout + chunk).slice(-4000);
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    tails.stderr = (tails.stderr + chunk).slice(-4000);
  });
  const exit = await new Promise<FocusRow['exit']>((resolve) => {
    child.once('error', (error) => {
      resolve({ code: null, signal: null, error: String(error) });
    });
    child.once('close', (code, signal) => {
      resolve({ code, signal });
    });
  });
  const processWall = performance.now() - started;
  const threads = stopThreads();
  let report: ChildReport | WireNull = null;
  try {
    report = JSON.parse(await readFile(output, 'utf8')) as ChildReport;
    // The row embeds the whole child report; only an unreadable transport file stays behind as evidence.
    await rm(output);
  } catch {
    // A missing or partial report remains a recorded worker failure.
  }
  return {
    sequence: cell.sequence,
    round: cell.round,
    product: cell.product.label,
    family: cell.product.family,
    engine: cell.product.engine,
    caseId: cell.caseId,
    processWall,
    exit,
    threads,
    report,
    stdoutTail: tails.stdout,
    stderrTail: tails.stderr,
  };
};

const stats = (values: readonly number[]): Stats | WireNull => {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    median: sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2,
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
};
const cpuMedians = (
  windows: ReadonlyArray<{ userMicros: number; systemMicros: number } | WireNull | undefined>,
): CpuMedians => {
  const present = windows.filter((value) => value !== null && value !== undefined);
  const median = (values: number[]) => stats(values)?.median ?? 0;
  return present.length === 0
    ? null
    : {
        userMicros: median(present.map(({ userMicros }) => userMicros)),
        systemMicros: median(present.map(({ systemMicros }) => systemMicros)),
        totalMicros: median(present.map(({ userMicros, systemMicros }) => userMicros + systemMicros)),
      };
};
const succeeded = (row: FocusRow): row is FocusRow & { report: ChildReport & { perCase: CaseEvidence[] } } =>
  row.exit.code === 0 && row.report?.error === undefined && row.report?.perCase !== undefined;

/**
 * Summarize raw rows: medians/min-max walls, CPU medians, counts and the same-family byte parity table.
 * @internal
 * @param rows - Raw rows in dispatch order.
 * @returns Counts, per product/case groups and per case/family parity.
 */
// oxlint-disable-next-line max-lines-per-function -- One summary keeps its counts, groups and parity consistent.
export const summarizeFocusRows = (rows: readonly FocusRow[]): FocusSummary => {
  const keys = [...new Set(rows.map(({ product, caseId }) => `${caseId}\u0000${product}`))];
  const groups = keys.map((key) => {
    const members = rows.filter(({ product, caseId }) => `${caseId}\u0000${product}` === key);
    const ok = members.filter((row) => succeeded(row));
    const cases = ok.flatMap(({ report }) => report.perCase);
    const phases = ok.map(({ report }) => report.phases);
    return {
      caseId: members[0]!.caseId,
      product: members[0]!.product,
      family: members[0]!.family,
      cells: members.length,
      failures: members.length - ok.length,
      contended: members.filter(({ contended }) => contended).length,
      statuses: [...new Set(cases.map(({ status }) => status))],
      expectedStatus: cases[0]?.expectedStatus ?? null,
      wall: {
        process: stats(members.map(({ processWall }) => processWall)),
        harness: stats(ok.map(({ processWall, report }) => processWall - report.timing!.total)),
        startup: stats(ok.map(({ report }) => report.timing!.startup)),
        admission: stats(ok.map(({ report }) => report.timing!.admission)),
        firstClaim: stats(cases.filter(({ repeat }) => repeat === 0).map(({ evaluation }) => evaluation)),
        repeatClaim: stats(cases.filter(({ repeat }) => repeat > 0).map(({ evaluation }) => evaluation)),
        runner: stats(ok.map(({ report }) => report.timing!.total)),
      },
      cpu: {
        startup: cpuMedians(phases.map((value) => value?.startup)),
        admission: cpuMedians(phases.map((value) => value?.admission)),
        evaluation: cpuMedians(phases.map((value) => value?.evaluation)),
        firstClaim: cpuMedians(phases.map((value) => value?.evaluationByRepeat?.[0])),
        repeatClaim: cpuMedians(phases.flatMap((value) => value?.evaluationByRepeat?.slice(1) ?? [])),
        runner: cpuMedians(phases.map((value) => value?.runner)),
        process: cpuMedians(ok.map(({ report }) => report.processCpu)),
      },
      maxRssMiB: stats(ok.map(({ report }) => report.maxRssBytes / 1024 / 1024)),
      threadsMax: Math.max(0, ...members.map(({ threads }) => threads?.max ?? 0)) || null,
      loadPerCpuBefore: stats(members.map(({ hostBefore }) => hostBefore.loadPerCpu)),
    };
  });
  const parity = [...new Set(rows.map(({ caseId }) => caseId))].map((caseId) => {
    const ok = rows.filter((row) => row.caseId === caseId && succeeded(row)) as Array<
      FocusRow & { report: ChildReport & { perCase: CaseEvidence[] } }
    >;
    const families = [...new Set(ok.map(({ family }) => family))].map((family) => {
      const members = ok.filter((row) => row.family === family);
      const cases = members.flatMap(({ report }) => report.perCase);
      const results = new Set(cases.flatMap(({ result }) => (result === null ? [] : [result.sha256])));
      const admissions = new Set(members.flatMap(({ report }) => (report.admission ? [report.admission.sha256] : [])));
      return {
        family,
        products: [...new Set(members.map(({ product }) => product))],
        observations: cases.length,
        statuses: [...new Set(cases.map(({ status }) => status))],
        resultSha256: [...results],
        admissionSha256: [...admissions],
        exact: results.size <= 1 && admissions.size <= 1,
      };
    });
    const supported = families.filter(({ statuses }) => statuses.some((status) => status !== 'unsupported'));
    return {
      caseId,
      families,
      crossFamilyStatusAgreement:
        supported.every(({ statuses }) => statuses.length === 1) &&
        new Set(supported.map(({ statuses }) => statuses[0])).size <= 1,
    };
  });
  const counts = {
    cells: rows.length,
    failures: 0,
    contended: 0,
    expectedMatches: 0,
    unexpectedStatuses: 0,
    unverifiedExpectations: 0,
    unsupported: 0,
    knownDifferences: 0,
    sameFamilyMismatches: parity.flatMap(({ families }) => families).filter(({ exact }) => !exact).length,
  };
  for (const row of rows) {
    counts.contended += Number(row.contended);
    if (succeeded(row)) {
      const summary = summarizeLabCaseResults(row.engine, row.report.perCase).counts;
      counts.expectedMatches += summary.expectedMatches;
      counts.unexpectedStatuses += summary.unexpectedStatuses;
      counts.unverifiedExpectations += summary.unverifiedExpectations;
      counts.unsupported += summary.unsupported;
      counts.knownDifferences += summary.qualifiedTargetDifferences;
    } else {
      counts.failures += 1;
    }
  }
  return { counts, groups, parity };
};

const seconds = (milliseconds: number): string => (milliseconds / 1000).toFixed(3);
const spread = (value: Stats | WireNull): string =>
  value === null
    ? '—'
    : value.n === 1
      ? seconds(value.median)
      : `${seconds(value.median)} (${seconds(value.min)}–${seconds(value.max)})`;

/**
 * Render the summary tables for a report.
 * @internal
 * @param summary - Output of {@link summarizeFocusRows}.
 * @returns Markdown timing and parity tables.
 */
export const renderFocusSummary = (summary: FocusSummary): string => {
  const cpuSeconds = (value: CpuMedians) => (value === null ? '—' : (value.totalMicros / 1_000_000).toFixed(3));
  const timing = summary.groups.map(
    (group) =>
      `| ${group.caseId} | ${group.product} | ${group.cells}${group.failures > 0 ? ` (${group.failures} failed)` : ''} | ${group.statuses.join('/') || '—'} | ${spread(group.wall.process)} | ${spread(group.wall.harness)} | ${spread(group.wall.startup)} | ${spread(group.wall.admission)} | ${spread(group.wall.firstClaim)} | ${spread(group.wall.repeatClaim)} | ${cpuSeconds(group.cpu.admission)} | ${cpuSeconds(group.cpu.firstClaim)} | ${cpuSeconds(group.cpu.process)} | ${group.maxRssMiB === null ? '—' : group.maxRssMiB.median.toFixed(0)} | ${group.threadsMax ?? '—'} | ${group.loadPerCpuBefore?.median.toFixed(2) ?? '—'} |`,
  );
  const parity = summary.parity.flatMap(({ caseId, families, crossFamilyStatusAgreement }) =>
    families.map(
      (family) =>
        `| ${caseId} | ${family.family} | ${family.products.join(', ')} | ${family.observations} | ${family.statuses.join('/')} | ${family.resultSha256.map((hash) => hash.slice(0, 12)).join(', ') || '—'} | ${family.admissionSha256.map((hash) => hash.slice(0, 12)).join(', ') || '—'} | ${family.exact ? 'yes' : '**NO**'} | ${crossFamilyStatusAgreement ? 'agree' : 'differ'} |`,
    ),
  );
  return [
    `Counts: ${JSON.stringify(summary.counts)}`,
    '',
    'Walls are medians (min–max) in seconds; CPU columns are median user+system seconds; RSS is the child peak.',
    '',
    '| Case | Product | n | Status | Spawn→exit | Harness | Startup | Admission | First claim | Repeat claim | Admission CPU | First-claim CPU | Process CPU | Peak RSS MiB | Threads | Load/CPU |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...timing,
    '',
    '| Case | Family | Products | Obs | Status | Result SHA-256 | Admission SHA-256 | Same-family exact | Cross-family status |',
    '| --- | --- | --- | ---: | --- | --- | --- | --- | --- |',
    ...parity,
    '',
  ].join('\n');
};

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, JSON.stringify(value, undefined, 2) + '\n', { flag: 'wx' });
};
const productFiles = (request: ProductRequest): string[] => [
  request.addon ?? request.receipt ?? request.binary!,
  ...(request.glue === undefined ? [] : [request.glue]),
];
const sourcePaths = [
  '../geospec-engine/experiments/performance-lab/performance-lab-focus.ts',
  '../geospec-engine/experiments/performance-lab/performance-lab-cli.ts',
  '../geospec-engine/experiments/performance-lab/performance-lab-runner.ts',
  'bench/performance-lab.ts',
  'bench/fixtures/performance-lab/manifest.json',
  'bench/fixtures/performance-lab/authority-cases.json',
  'bench/fixtures/performance-lab/authority-queries.json',
  'bench/fixtures/performance-lab/analytic-cases.json',
  'src/node.ts',
  'src/wasm.ts',
  'src/mixed-wasm-loader.ts',
  'src/host-types.ts',
  'bindings/node/generated/index.js',
];

// oxlint-disable-next-line complexity -- One serial measured dispatch owns product, host-guard and parity receipts.
const runFocusParent = async (options: Options): Promise<void> => {
  const products = await Promise.all(
    options.products.map(async (request): Promise<FocusProduct> => {
      const files = await Promise.all(productFiles(request).map(async (path) => hashFile(path)));
      const suffix =
        request.permits === undefined
          ? ''
          : request.family === 'native'
            ? `-p${request.permits}`
            : `-mt${request.permits}`;
      return {
        ...request,
        label: request.label ?? `${request.family}${suffix}-${files[0]!.sha256.slice(0, 8)}`,
        files,
      };
    }),
  );
  if (new Set(products.map(({ label }) => label)).size !== products.length) {
    throw new Error('Product labels must be unique; add label= to distinguish repeated products.');
  }
  const catalog = catalogCases();
  const cells = planFocusCells(options.caseIds, products, options.samples);
  await mkdir(dirname(options.outputDir), { recursive: true });
  await mkdir(options.outputDir);
  await writeJson(resolvePath(options.outputDir, 'run.json'), {
    purpose: 'diagnostic focus benchmark; not Q7 promotion',
    startedAt: new Date().toISOString(),
    argv: process.argv,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    logicalCpus: availableParallelism(),
    initialHost: readHost(),
    samples: options.samples,
    repeats: options.repeats,
    guards: {
      maxLoadPerCpu: options.maxLoadPerCpu,
      minFreeMemoryMiB: options.minFreeMemoryMiB,
      cellTimeout: options.cellTimeout,
      threadInterval: options.threadInterval,
    },
    hostPolicy: options.contendedHost
      ? 'contended-host-disclosed: guard violations are recorded per row as contended, never refused'
      : 'refuse the first cell whose pre-cell reading violates a guard',
    timingUnit: 'milliseconds',
    protocol:
      'Fresh child per round/case/product; case offset = round, product offset = round + case index. The child verifies product and fixture SHA-256, admits once (cold module, engine and subject), then evaluates the authored claim `repeats` times on the retained subject.',
    phases:
      'Walls are the shared runner timings; CPU windows are process.cpuUsage() deltas at traced engine-call boundaries (startup to Engine construction, admission ingest through subject handle, evaluation plan/evaluate, cleanup release/close). processWall spans parent spawn through close, including child hash verification; harness is processWall minus the runner total (Node start, TypeScript imports, SHA-256 checks, result write), reported apart from product time; processCpu is cumulative child CPU. CPU includes background runtime threads and can exceed wall.',
    resources:
      'maxRssBytes is process.resourceUsage().maxRSS * 1024 for the child process, taken after cleanup. threads is the parent-polled ps -M high-water, a lower bound at the sampling interval.',
    parity:
      'Within an engine family every observed admission and canonical result byte sequence for a case must be identical across products, rounds and repeats; families are compared by status only.',
    products,
    cases: options.caseIds.map((id) => {
      const { fixture, entry } = catalog.get(id)!;
      return {
        id,
        fixtureId: fixture.id,
        fixtureSha256: fixture.sha256,
        fixtureBytes: fixture.bytes,
        matcher: 'matcher' in entry ? entry.matcher : entry.capability,
        polarity: entry.claim.polarity,
        expectedStatus: entry.expectedStatus,
        caseSha256: sha256Hex(Buffer.from(JSON.stringify(toRunCase(entry)))),
      };
    }),
    sources: await Promise.all(sourcePaths.map(async (path) => hashFile(resolvePath(packageRoot, path)))),
    schedule: cells.map(({ sequence, round, caseId, product }) => ({
      sequence,
      round,
      caseId,
      product: product.label,
    })),
  });
  const rows: FocusRow[] = [];
  for (const cell of cells) {
    const hostBefore = readHost();
    const contended = isHostContended(hostBefore, options);
    if (contended && !options.contendedHost) {
      // oxlint-disable-next-line no-await-in-loop -- Stop at the first noisy cell and retain its refusal receipt.
      await writeJson(resolvePath(options.outputDir, 'host-guard.json'), { cell: cell.sequence, hostBefore, options });
      throw new Error(
        `Host noise/resource guard refused cell ${cell.sequence}; pass --contended-host to disclose instead.`,
      );
    }
    // oxlint-disable-next-line no-await-in-loop -- Measurements run serially in fresh children, with no overlapping engines.
    const row: FocusRow = { ...(await invokeFocusCell(cell, options)), hostBefore, hostAfter: readHost(), contended };
    rows.push(row);
    // oxlint-disable-next-line no-await-in-loop -- Retain each raw cell before starting the next one.
    await appendFile(resolvePath(options.outputDir, 'rows.jsonl'), JSON.stringify(row) + '\n');
    const statuses =
      row.report?.perCase?.map(({ status }) => status).join('/') ??
      `failed: ${row.report?.error?.message ?? row.exit.code}`;
    console.error(
      `${cell.sequence + 1}/${cells.length} r${cell.round} ${cell.caseId} ${cell.product.label}: ${statuses} ${seconds(row.processWall)}s load/cpu=${hostBefore.loadPerCpu.toFixed(2)}`,
    );
  }
  // Products must still be the bytes every child verified.
  await Promise.all(products.map(async ({ files }) => verifyLabArtifacts(files)));
  const summary = summarizeFocusRows(rows);
  await writeJson(resolvePath(options.outputDir, 'summary.json'), summary);
  const markdown = renderFocusSummary(summary);
  await writeFile(resolvePath(options.outputDir, 'summary.md'), markdown, { flag: 'wx' });
  console.log(markdown);
  if (summary.counts.failures > 0 || summary.counts.unexpectedStatuses > 0 || summary.counts.sameFamilyMismatches > 0) {
    process.exitCode = 1;
  }
};

const main = async (): Promise<void> => {
  const [first] = process.argv.slice(2);
  if (first?.startsWith('--child=')) {
    await runFocusChild(JSON.parse(first.slice('--child='.length)) as Parameters<typeof runFocusChild>[0]);
  } else if (process.argv.includes('--help')) {
    console.log(help);
  } else {
    await runFocusParent(parseFocusArguments(process.argv.slice(2)));
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error('Performance-lab focus failed:', error);
    process.exitCode = 1;
  }
}
