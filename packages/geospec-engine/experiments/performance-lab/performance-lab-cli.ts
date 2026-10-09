#!/usr/bin/env node
/**
 * Private diagnostic n=5 driver for the shared SIMD performance lab; not Q7 qualification.
 * Run with Node's native TypeScript support from any directory. No environment variables required.
 * Usage: node packages/geospec-engine/experiments/performance-lab/performance-lab-cli.ts --native-module=/absolute/installed/node.mjs --output-dir=out/reports/benchmarks/performance-lab
 * Exit: 0 completed diagnostic (unsupported remains visible); 1 execution or expected-status mismatch.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { availableParallelism, freemem, loadavg } from 'node:os';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
/* oxlint-disable no-restricted-imports -- Private lab reads the frozen native catalog and source receipts without publishing them. */
import manifest from '../../../geospec-engine-native/bench/fixtures/performance-lab/manifest.json' with { type: 'json' };
import currentAuthority from '../../../geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v6.json' with { type: 'json' };
import {
  classifyPerformanceLabDifference,
  performanceLabCases,
  performanceLabFixtures,
  performanceLabNativeQueries,
  performanceLabScaleCases,
  performanceLabScaleQueries,
} from '../../../geospec-engine-native/bench/performance-lab.ts';
import type {
  LabFixture,
  PerformanceLabCase,
  PerformanceLabDifference,
  PerformanceLabQuery,
  PerformanceLabScaleQuery,
} from '../../../geospec-engine-native/bench/performance-lab.ts';
import type { Artifact } from '../../../geospec-engine-native/bench/lib.ts';
/* oxlint-enable no-restricted-imports */
import type {
  PerformanceLabEngineModule,
  PerformanceLabModules,
  PerformanceLabRunInput,
  PerformanceLabRunResult,
} from '#experiments/performance-lab/performance-lab-runner.js';

type Engine = PerformanceLabRunInput['engine'];
type SelectedModule = { engine: Engine; path: string };
/** Exact product files a host entry loads instead of its package defaults. @internal */
export type LabProducts = { nativeAddon?: string; mixedGlue?: string; mixedBinary?: string };
type Options = LabProducts & {
  modules: SelectedModule[];
  outputDir: string;
  samples: number;
  includeScale: boolean;
  hashManifest?: string;
  cell?: string;
  condition: 'cold' | 'warm';
  maxLoadPerCpu: number;
  minFreeMemoryMiB: number;
  maxChildRssMiB: number;
  /** Milliseconds. */
  cellTimeout: number;
  /** Record and mark guard violations instead of refusing the cell. */
  contendedHost: boolean;
};
type Selection = {
  fixture: LabFixture;
  cases: ReadonlyArray<PerformanceLabCase | PerformanceLabQuery | PerformanceLabScaleQuery>;
};
type Cell = {
  sequence: number;
  round: number;
  condition: 'cold' | 'warm';
  module: SelectedModule;
  selection: Selection;
};
type ChildReport = {
  result?: PerformanceLabRunResult;
  error?: { message: string; stack?: string };
  memory: {
    method: string;
    scope: string;
    peakBytes: number;
    observed: string;
  };
};
type EvidenceArtifact = Artifact & { bytes: number; encoding: 'utf8' | 'json'; pointer?: string };
type CaseReceipt = Omit<
  PerformanceLabRunResult['perCase'][number],
  'canonicalClaimUtf8' | 'canonicalResultUtf8' | 'result' | 'diagnostics'
> & {
  evidence: {
    canonicalClaim: EvidenceArtifact | WireNull;
    canonicalResult: EvidenceArtifact | WireNull;
    result: EvidenceArtifact;
    diagnostics: EvidenceArtifact;
  };
};
type ChildReceipt = Omit<ChildReport, 'result'> & {
  evidenceTransport: 'artifacts-v1';
  result?: Omit<PerformanceLabRunResult, 'perCase'> & { perCase: CaseReceipt[] };
};
// oxlint-disable-next-line typescript/no-restricted-types -- Node exit receipts preserve explicit null for an absent exit code/signal.
type WireNull = null;

const root = resolvePath(import.meta.dirname, '../../../..');
const script = resolvePath(import.meta.dirname, 'performance-lab-cli.ts');
const moduleFlags = [
  ['mixed-module', 'combined-wasm'],
  ['native-module', 'native-desktop'],
] as const;
/** Product override flag, option key and the module flag whose child loads it. */
const productFlags = [
  ['native-addon', 'nativeAddon', 'native-module'],
  ['mixed-binary', 'mixedBinary', 'mixed-module'],
  ['mixed-glue', 'mixedGlue', 'mixed-module'],
] as const;
const help = `Private performance-lab diagnostic (not Q7 qualification).
  --mixed-module=/absolute/installed/wasm.mjs
  --native-module=/absolute/installed/node.mjs
Supply at least one module; only supplied engines run, with no fallback.
  --native-addon=/absolute/geospec-engine-native.node  Load this add-on (NAPI_RS_NATIVE_LIBRARY_PATH) behind --native-module.
  --mixed-binary=/absolute/geospec_engine_native.wasm  Initialize this ST binary behind --mixed-module.
  --mixed-glue=/absolute/geospec_engine_native.mjs     Resolve #mixed-wasm-binding to this Emscripten glue.
  --output-dir=out/reports/benchmarks/performance-lab  Required NEW directory; relative to workspace root.
  --samples=5                                      Fresh children per fixture/engine/condition; minimum 5.
  --include-scale                                  Full 22-fixture / 31-capability catalog.
  --max-load-per-cpu=1                             Refuse noisy host before each cell.
  --min-free-memory-mib=1024                       Refuse low-memory host before each cell.
  --contended-host                                 Opt-in: record load and mark guard violations as contended, never refuse.
  --max-child-rss-mib=4096                         Mark child above limit as resource failure.
  --cell-timeout-ms=900000                         Kill a cell past its wall limit.
  --hash-manifest=/absolute/artifacts.json           Existing Artifact[]: [{path,sha256}]; required for the full every-engine catalog.
The manifest must include supplied modules and product overrides.
Include their binaries/loaders to pin that closure. Without a manifest only entries
are pinned; no transitive closure is claimed.
Results: run.json, artifacts.json, rows.jsonl, summary.json, cells/*/{result.json,stdout.log,stderr.log}.
Cold: fresh child/module/engine/subject. Warm: fresh child prewarms its module, then times a new engine/subject.
Cold processWall spans spawn through close; warm processWall includes the untimed prewarm and is not a warm latency.
Cold harnessWall is processWall minus the runner total: Node start, TypeScript imports, SHA-256 checks and result writing.
Warm timing.total spans the measured runner's startup/admission/evaluation/cleanup after module prewarm.
maxRSS is process.resourceUsage().maxRSS * 1024 (KiB to bytes), child process only, through cleanup.
Unsupported and unverified cells remain raw; unexpected statuses and worker errors exit 1.
Qualified target differences have their own count, never expected matches.
`;

/**
 * Parse scalar CLI options without importing an engine.
 * @internal
 * @param args - CLI tokens excluding Node and the script path.
 * @returns Explicit selected modules and diagnostic options.
 */
// oxlint-disable-next-line complexity -- Validate all bench gates together before any artifact or engine is opened.
export const parseCliArguments = (args: string[]): Options => {
  const { values } = parseArgs({
    args,
    options: {
      'mixed-module': { type: 'string' },
      'native-module': { type: 'string' },
      'native-addon': { type: 'string' },
      'mixed-binary': { type: 'string' },
      'mixed-glue': { type: 'string' },
      'contended-host': { type: 'boolean', default: false },
      'output-dir': { type: 'string' },
      samples: { type: 'string', default: '5' },
      'include-scale': { type: 'boolean', default: false },
      'hash-manifest': { type: 'string' },
      cell: { type: 'string' },
      condition: { type: 'string', default: 'cold' },
      'max-load-per-cpu': { type: 'string', default: '1' },
      'min-free-memory-mib': { type: 'string', default: '1024' },
      'max-child-rss-mib': { type: 'string', default: '4096' },
      'cell-timeout-ms': { type: 'string', default: '900000' },
    },
    strict: true,
    allowPositionals: false,
  });
  const modules = moduleFlags.flatMap(([flag, engine]) => {
    const path = values[flag];
    if (path === undefined) {
      return [];
    }
    if (!isAbsolute(path)) {
      throw new Error(`--${flag} must name an absolute installed module path.`);
    }
    return [{ engine, path: resolvePath(path) }];
  });
  const samples = Number(values.samples);
  if (modules.length === 0 || !values['output-dir'] || !Number.isSafeInteger(samples) || samples < 5) {
    throw new Error('Supply an installed module, --output-dir, and at least five --samples. See --help.');
  }
  if (values.cell !== undefined && modules.length !== 1) {
    throw new Error('An internal child cell requires exactly one supplied module.');
  }
  const products: LabProducts = {};
  for (const [flag, key, owner] of productFlags) {
    const path = values[flag];
    if (path !== undefined) {
      if (!isAbsolute(path) || values[owner] === undefined) {
        throw new Error(`--${flag} must name an absolute product file loaded by --${owner}.`);
      }
      products[key] = resolvePath(path);
    }
  }
  if (
    values['include-scale'] &&
    modules.length === moduleFlags.length &&
    values['hash-manifest'] === undefined &&
    values.cell === undefined
  ) {
    throw new Error('The full every-engine catalog requires an explicit installed-product hash manifest.');
  }
  const maxLoadPerCpu = Number(values['max-load-per-cpu']);
  const minFreeMemoryMiB = Number(values['min-free-memory-mib']);
  const maxChildRssMiB = Number(values['max-child-rss-mib']);
  const cellTimeout = Number(values['cell-timeout-ms']);
  if (
    !['cold', 'warm'].includes(values.condition) ||
    !Number.isFinite(maxLoadPerCpu) ||
    maxLoadPerCpu <= 0 ||
    !Number.isSafeInteger(minFreeMemoryMiB) ||
    minFreeMemoryMiB < 0 ||
    !Number.isSafeInteger(maxChildRssMiB) ||
    maxChildRssMiB < 1 ||
    !Number.isSafeInteger(cellTimeout) ||
    cellTimeout < 1
  ) {
    throw new Error('Invalid benchmark condition or host/resource guard. See --help.');
  }
  return {
    modules,
    ...products,
    outputDir: resolvePath(root, values['output-dir']),
    samples,
    includeScale: values['include-scale'],
    condition: values.condition === 'warm' ? 'warm' : 'cold',
    maxLoadPerCpu,
    minFreeMemoryMiB,
    maxChildRssMiB,
    cellTimeout,
    contendedHost: values['contended-host'],
    ...(values['hash-manifest'] === undefined ? {} : { hashManifest: resolvePath(root, values['hash-manifest']) }),
    ...(values.cell === undefined ? {} : { cell: values.cell }),
  };
};

/**
 * Select the same authored claims and queries consumed by the UI.
 * @internal
 * @param includeScale - Whether to include the explicit scale selection.
 * @returns Subject fixtures with their applicable authored cases.
 */
export const selectLabFixtures = (includeScale: boolean): Selection[] => {
  const cases = [
    ...performanceLabCases,
    ...(includeScale ? [...performanceLabScaleCases, ...performanceLabScaleQueries] : []),
    ...performanceLabNativeQueries,
  ];
  return performanceLabFixtures.flatMap((fixture) => {
    const selected = cases.filter((entry) => entry.fixtureId === fixture.id);
    return fixture.role === 'subject' && selected.length > 0 && (includeScale || !fixture.scale)
      ? [
          {
            fixture,
            cases: selected.map((entry) =>
              currentAuthority.affectedCaseIds.includes(entry.id) && 'matcher' in entry
                ? { ...entry, expectedStatus: 'unverified' }
                : entry,
            ),
          },
        ]
      : [];
  });
};

/**
 * Preserve exact public authoring arguments and query payloads.
 * @internal
 * @param entry - One unchanged catalog matcher or query.
 * @returns Its shared-runner input, matching the UI adapter.
 */
export const toRunCase = (entry: Selection['cases'][number]): PerformanceLabRunInput['cases'][number] => ({
  id: entry.id,
  kind: 'matcher' in entry ? 'matcher' : 'query',
  matcher: 'matcher' in entry ? entry.matcher : entry.capability,
  arguments: 'arguments' in entry ? entry.arguments : [],
  payload: entry.claim.payload,
  claimId: entry.claim.claimId,
  subjectSlot: entry.claim.subjectSlots[0],
  workUnitBudget: entry.claim.workUnitBudget,
  polarity: entry.claim.polarity,
  expectedStatus: entry.expectedStatus,
});

/**
 * Rotate fixture and engine order deterministically, with one child per tuple.
 * @internal
 * @param options - Selected modules, sample count, and scale opt-in.
 * @returns Serial dispatch order with one cell per fixture, engine, and round.
 */
export const planLabCells = (options: Pick<Options, 'samples' | 'modules' | 'includeScale'>): Cell[] => {
  const selections = selectLabFixtures(options.includeScale);
  const cells: Cell[] = [];
  for (let round = 0; round < options.samples; round += 1) {
    for (let index = 0; index < selections.length; index += 1) {
      const fixtureIndex = (index + round) % selections.length;
      const selection = selections[fixtureIndex]!;
      for (let position = 0; position < options.modules.length; position += 1) {
        const module = options.modules[(position + fixtureIndex + round) % options.modules.length]!;
        for (const condition of ['cold', 'warm'] as const) {
          cells.push({
            sequence: cells.length,
            round: round + 1,
            condition,
            module,
            selection,
          });
        }
      }
    }
  }
  return cells;
};

/**
 * Verify existing Artifact descriptors, retaining exact file byte counts.
 * @internal
 * @param artifacts - Existing benchmark path/SHA-256 descriptors.
 * @returns Verified descriptors with observed byte counts.
 */
export const verifyLabArtifacts = async (
  artifacts: readonly Artifact[],
): Promise<Array<Artifact & { bytes: number }>> => {
  const verified = [];
  for (const artifact of artifacts) {
    if (!isAbsolute(artifact.path) || !/^[\da-f]{64}$/.test(artifact.sha256)) {
      throw new Error('Hash manifests use existing Artifact descriptors with absolute path and SHA-256.');
    }
    // oxlint-disable-next-line no-await-in-loop -- Verify one binary at a time to avoid retaining every installed product in memory together.
    const bytes = await readFile(artifact.path);
    if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
      throw new Error(`SHA-256 mismatch: ${artifact.path}`);
    }
    verified.push({ ...artifact, bytes: bytes.byteLength });
  }
  return verified;
};

const hashPath = async (path: string): Promise<Artifact> => ({
  path,
  sha256: createHash('sha256')
    .update(await readFile(path))
    .digest('hex'),
});
const approvedPublicContract = {
  id: 'public-contract',
  path: 'packages/geospec/src/runner/types.ts',
  frozenSha256: '20303ca36a5ae9531cdd035c10e108e92b70aec76bba1aca849306dbe3eed82d',
  currentSha256: '2fbb333f95044d45bf63b6fbab86e94018eb2455fba05fffda73459edc6e7e15',
} as const;
export const verifySourceAuthority = async (observe: typeof hashPath = hashPath): Promise<void> => {
  const overlayPath = resolvePath(
    root,
    'packages/geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v6.json',
  );
  const predecessorPath = resolvePath(
    root,
    'packages/geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v5.json',
  );
  const overlay = await observe(overlayPath);
  const predecessor = await observe(predecessorPath);
  if (
    overlay.sha256 !== 'bc258a7989947e1abce12b62dd1a79919c06a104c52312e41b7797a99fdffa8a' ||
    predecessor.sha256 !== currentAuthority.predecessorSha256 ||
    currentAuthority.predecessorSha256 !== 'd44d66f6f921727ac2c91645ec9c04d18c13cc14ac806d9aad50903b96b8fbcd'
  ) {
    throw new Error('Performance-lab successor authority differs from its immutable predecessor.');
  }
  const manifestPath = resolvePath(root, 'packages/geospec-engine-native/bench/fixtures/performance-lab/manifest.json');
  const manifestHash = await observe(manifestPath);
  const native = manifest.analyticAuthority.sources.filter(({ id }) => id === 'native-contract');
  const publicContract = manifest.analyticAuthority.sources.filter(
    ({ id, path }) => id === approvedPublicContract.id || path === approvedPublicContract.path,
  );
  if (
    publicContract.length !== 1 ||
    publicContract[0]!.id !== approvedPublicContract.id ||
    publicContract[0]!.path !== approvedPublicContract.path ||
    publicContract[0]!.sha256 !== approvedPublicContract.frozenSha256
  ) {
    throw new Error('Performance-lab public-contract transition differs from its frozen authority.');
  }
  const affected = performanceLabCases
    .filter(({ matcher }) =>
      ['toHaveStepUnits', 'toHaveProductStructure', 'toHaveAssemblyOccurrences'].includes(matcher),
    )
    .map(({ id }) => id)
    .sort();
  if (
    currentAuthority.schemaVersion !== 1 ||
    currentAuthority.id !== 'n8-current-source-v6-a1' ||
    currentAuthority.nativeContract.currentSha256 !==
      '5c0cc1737815c2295e2801d991d20891db53a1caa213630ea2671da6523c696b' ||
    currentAuthority.frozenManifestSha256 !== manifestHash.sha256 ||
    currentAuthority.nativeContract.sourceId !== 'native-contract' ||
    native.length !== 1 ||
    native[0]!.path !== currentAuthority.nativeContract.path ||
    native[0]!.sha256 !== currentAuthority.nativeContract.frozenSha256 ||
    currentAuthority.affectedExpectedStatus !== 'unverified' ||
    affected.length !== 6 ||
    JSON.stringify([...currentAuthority.affectedCaseIds].sort()) !== JSON.stringify(affected)
  ) {
    throw new Error('Performance-lab current-source overlay does not match its frozen authority.');
  }
  const numericProfilePath =
    'packages/geospec-engine-native/rust/tests/fixtures/current-profile-v6/numeric-profile.txt';
  const numericProfile = await readFile(resolvePath(root, numericProfilePath));
  if (
    currentAuthority.approvedNumericProfile !== 'geospec-demand-v6' ||
    currentAuthority.numericProfileSource.path !== numericProfilePath ||
    currentAuthority.numericProfileSource.sha256 !==
      'c36f2296878e3daa57cc0cdfe8c86dac3b77ed80d6ddbd60de68b31a64bba5f7' ||
    createHash('sha256').update(numericProfile).digest('hex') !== currentAuthority.numericProfileSource.sha256 ||
    numericProfile.toString('utf8') !== `${currentAuthority.approvedNumericProfile}\n`
  ) {
    throw new Error('Performance-lab current-source numeric profile changed.');
  }
  const sources = [
    {
      path: 'packages/geospec-engine-native/bench/fixtures/performance-lab/authority-cases.json',
      sha256: manifest.analyticAuthority.m3CasesUnchangedSha256,
    },
    {
      path: 'packages/geospec-engine-native/bench/fixtures/performance-lab/authority-queries.json',
      sha256: manifest.analyticAuthority.m3QueriesUnchangedSha256,
    },
    ...manifest.analyticAuthority.sources,
  ];
  for (const source of sources) {
    // oxlint-disable-next-line no-await-in-loop -- Bounded preflight verifies each authority byte sequence before any child runs.
    const observed = await observe(resolvePath(root, source.path));
    const expected =
      source.path === currentAuthority.nativeContract.path
        ? currentAuthority.nativeContract.currentSha256
        : source.path === approvedPublicContract.path
          ? approvedPublicContract.currentSha256
          : source.sha256;
    if (observed.sha256 !== expected) {
      throw new Error(`Performance-lab source authority changed: ${source.path}`);
    }
  }
};
const writeJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, JSON.stringify(value, undefined, 2) + '\n', {
    flag: 'wx',
  });
};
// Bound individual output chunks, not geometry, evidence size or work budgets.
const evidenceChunkSize = 64 * 1024;
const textChunks = function* (text: string): Generator<string> {
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + evidenceChunkSize, text.length);
    if (end < text.length && (text.codePointAt(end - 1) ?? 0) > 65_535) {
      end += 1;
    }
    yield text.slice(start, end);
    start = end;
  }
};
// Only private decoded evidence uses JSON sidecars; canonical UTF8 never passes through this writer.
const evidenceJsonChunks = function* (value: unknown): Generator<string> {
  if (typeof value === 'string') {
    yield '"';
    for (const chunk of textChunks(value)) {
      yield JSON.stringify(chunk).slice(1, -1);
    }
    yield '"';
    return;
  }
  if (Array.isArray(value)) {
    yield '[';
    let separator = '';
    for (const entry of value) {
      yield separator;
      yield* evidenceJsonChunks(entry);
      separator = ',';
    }
    yield ']';
    return;
  }
  if (value !== null && typeof value === 'object') {
    yield '{';
    let separator = '';
    for (const [key, entry] of Object.entries(value)) {
      yield separator;
      yield* evidenceJsonChunks(key);
      yield ':';
      yield* evidenceJsonChunks(entry);
      separator = ',';
    }
    yield '}';
    return;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    yield JSON.stringify(value);
    return;
  }
  throw new TypeError('Performance evidence must be a JSON value.');
};
const writeEvidence = async (
  path: string,
  chunks: Iterable<string>,
  encoding: EvidenceArtifact['encoding'],
): Promise<EvidenceArtifact> => {
  const file = await open(path, 'wx');
  const hash = createHash('sha256');
  let bytes = 0;
  let pending = '';
  const flush = async (): Promise<void> => {
    const buffer = Buffer.from(pending, 'utf8');
    hash.update(buffer);
    bytes += buffer.byteLength;
    await file.writeFile(buffer);
    pending = '';
  };
  try {
    for (const chunk of chunks) {
      pending += chunk;
      if (pending.length >= evidenceChunkSize) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential chunks preserve exact evidence byte order.
        await flush();
      }
    }
    await flush();
  } finally {
    await file.close();
  }
  return { path, bytes, sha256: hash.digest('hex'), encoding };
};
/**
 * Persist full evidence once, retaining compact private child accounting.
 * @internal
 * @param path - Create-once child receipt path.
 * @param report - Complete child result and accounting.
 * @returns Completion after artifacts and receipt are persisted.
 */
export const writeLabChildReport = async (path: string, report: ChildReport): Promise<void> => {
  const { result: runResult, ...childMetadata } = report;
  const perCase: CaseReceipt[] = [];
  for (const [index, entry] of (report.result?.perCase ?? []).entries()) {
    const { canonicalClaimUtf8, canonicalResultUtf8, result, diagnostics, ...metadata } = entry;
    const prefix = resolvePath(dirname(path), `case-${index}`);
    /* oxlint-disable no-await-in-loop -- Sequential create-once artifacts precede this case's compact receipt. */
    const canonicalClaim =
      canonicalClaimUtf8 === null
        ? null
        : await writeEvidence(`${prefix}-claim.utf8`, textChunks(canonicalClaimUtf8), 'utf8');
    const canonicalResult =
      canonicalResultUtf8 === null
        ? null
        : await writeEvidence(`${prefix}-result.utf8`, textChunks(canonicalResultUtf8), 'utf8');
    if (canonicalResult !== null && canonicalResult.sha256 !== entry.canonicalResultSha256) {
      throw new Error('Performance canonical result hash differs from its recorded bytes.');
    }
    const decoded: unknown = canonicalResultUtf8 === null ? undefined : JSON.parse(canonicalResultUtf8);
    const candidate: unknown =
      decoded !== null &&
      typeof decoded === 'object' &&
      'results' in decoded &&
      Array.isArray(decoded.results) &&
      decoded.results.length === 1
        ? decoded.results[0]
        : decoded;
    const recoverable = canonicalResult !== null && isDeepStrictEqual(candidate, result);
    const resultArtifact = recoverable
      ? { ...canonicalResult, pointer: candidate === decoded ? '' : '/results/0' }
      : await writeEvidence(`${prefix}-decoded.json`, evidenceJsonChunks(result), 'json');
    const canonicalDiagnostics: unknown =
      candidate !== null && typeof candidate === 'object' && 'diagnostics' in candidate
        ? candidate.diagnostics
        : undefined;
    const diagnosticsArtifact =
      recoverable && isDeepStrictEqual(canonicalDiagnostics, diagnostics)
        ? { ...resultArtifact, pointer: `${resultArtifact.pointer}/diagnostics` }
        : await writeEvidence(`${prefix}-diagnostics.json`, evidenceJsonChunks(diagnostics), 'json');
    perCase.push({
      ...metadata,
      evidence: { canonicalClaim, canonicalResult, result: resultArtifact, diagnostics: diagnosticsArtifact },
    });
    /* oxlint-enable no-await-in-loop */
  }
  await writeJson(path, {
    ...childMetadata,
    evidenceTransport: 'artifacts-v1',
    ...(runResult === undefined ? {} : { result: { ...runResult, perCase } }),
  } satisfies ChildReceipt);
};
/**
 * Verify full artifacts incrementally without reassembling large evidence in parent rows.
 * @internal
 * @param path - Compact child receipt path.
 * @returns Verified compact accounting and artifact references.
 */
export const readLabChildReport = async (path: string): Promise<ChildReceipt> => {
  const decoded: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (
    decoded === null ||
    typeof decoded !== 'object' ||
    !('evidenceTransport' in decoded) ||
    decoded.evidenceTransport !== 'artifacts-v1'
  ) {
    throw new Error('Performance child receipt requires artifact evidence transport.');
  }
  const receipt = decoded as ChildReceipt;
  const seen = new Map<string, EvidenceArtifact>();
  for (const entry of receipt.result?.perCase ?? []) {
    for (const artifact of Object.values(entry.evidence)) {
      if (artifact === null) {
        continue;
      }
      if (
        dirname(artifact.path) !== dirname(path) ||
        !Number.isSafeInteger(artifact.bytes) ||
        artifact.bytes < 0 ||
        !/^[0-9a-f]{64}$/u.test(artifact.sha256)
      ) {
        throw new Error('Performance evidence artifact descriptor is invalid.');
      }
      const prior = seen.get(artifact.path);
      if (prior !== undefined) {
        if (prior.sha256 !== artifact.sha256 || prior.bytes !== artifact.bytes) {
          throw new Error('Performance evidence references disagree.');
        }
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Each full artifact is verified once before any receipt is accepted.
      const file = await open(artifact.path, 'r');
      const buffer = Buffer.alloc(evidenceChunkSize);
      const hash = createHash('sha256');
      let bytes = 0;
      try {
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop -- Incremental reads avoid the whole-evidence JavaScript string ceiling.
          const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null);
          if (bytesRead === 0) {
            break;
          }
          bytes += bytesRead;
          hash.update(buffer.subarray(0, bytesRead));
        }
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- Close the exact verified artifact even when reading fails.
        await file.close();
      }
      if (bytes !== artifact.bytes || hash.digest('hex') !== artifact.sha256) {
        throw new Error(`Performance evidence artifact changed: ${artifact.path}`);
      }
      seen.set(artifact.path, artifact);
    }
  }
  return receipt;
};
const errorRecord = (error: unknown): NonNullable<ChildReport['error']> =>
  error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };

/**
 * Select exact product files once per process, before a host entry imports them.
 * @internal
 * @param products - Absolute add-on, glue and ST binary paths; omitted paths keep the package files.
 * @returns Host-entry loader that initializes a selected ST binary once, inside the caller's startup timing.
 */
export const selectLabProducts = (products: LabProducts): ((path: string) => Promise<PerformanceLabEngineModule>) => {
  if (products.nativeAddon !== undefined) {
    // The generated NAPI-RS loader requires exactly this path and has no fallback when it is set.
    process.env['NAPI_RS_NATIVE_LIBRARY_PATH'] = products.nativeAddon;
  }
  const { mixedGlue } = products;
  if (mixedGlue !== undefined) {
    const url = pathToFileURL(mixedGlue).href;
    registerHooks({
      resolve: (specifier, context, nextResolve) =>
        specifier === '#mixed-wasm-binding' ? { url, shortCircuit: true } : nextResolve(specifier, context),
    });
  }
  let initialized: Promise<void> | undefined;
  return async (path) => {
    const module = (await import(pathToFileURL(path).href)) as PerformanceLabEngineModule;
    const { mixedBinary } = products;
    if (mixedBinary !== undefined) {
      // The loader keeps the first initialization, so the runner's later initialize() reuses these bytes.
      const initialize = module.initialize as unknown as (
        bytes: Uint8Array<ArrayBuffer>,
        execution: { variant: 'st' },
      ) => Promise<void>;
      initialized ??= (async () => {
        await initialize(new Uint8Array(await readFile(mixedBinary)), { variant: 'st' });
      })();
      await initialized;
    }
    return module;
  };
};

/** One host reading taken beside a benchmark cell. @internal */
export type HostReading = { loadAverage: number; loadPerCpu: number; freeMemoryMiB: number };

/**
 * Read one-minute load and free memory for a cell receipt.
 * @internal
 * @returns Current host reading; free memory is the OS free-page count, excluding reclaimable caches.
 */
export const readHost = (): HostReading => {
  const loadAverage = loadavg()[0]!;
  return { loadAverage, loadPerCpu: loadAverage / availableParallelism(), freeMemoryMiB: freemem() / 1024 / 1024 };
};

/**
 * Apply the unchanged noise/resource guard to one reading.
 * @internal
 * @param host - Reading before the cell.
 * @param guards - Configured load and free-memory limits.
 * @returns Whether the reading violates a guard.
 */
export const isHostContended = (
  host: HostReading,
  guards: Pick<Options, 'maxLoadPerCpu' | 'minFreeMemoryMiB'>,
): boolean => host.loadPerCpu > guards.maxLoadPerCpu || host.freeMemoryMiB < guards.minFreeMemoryMiB;

const readArtifacts = async (options: Options): Promise<Artifact[]> => {
  const required = [
    ...options.modules.map(({ path }) => path),
    ...productFlags.flatMap(([, key]) => options[key] ?? []),
  ];
  if (options.hashManifest === undefined) {
    return Promise.all(required.map(async (path) => hashPath(path)));
  }
  const artifacts = JSON.parse(await readFile(options.hashManifest, 'utf8')) as Artifact[];
  if (!Array.isArray(artifacts) || required.some((path) => !artifacts.some((entry) => entry.path === path))) {
    throw new Error('The hash manifest must include each supplied module and product override.');
  }
  return artifacts;
};

const runChild = async (options: Options): Promise<void> => {
  let result: PerformanceLabRunResult | undefined;
  let failure: ChildReport['error'];
  try {
    await verifyLabArtifacts(await readArtifacts(options));
    const selected = selectLabFixtures(options.includeScale).find(({ fixture }) => fixture.id === options.cell);
    if (!selected) {
      throw new Error(`No selected catalog cases for fixture ${options.cell}.`);
    }
    const bytes = new Uint8Array(await readFile(resolvePath(root, selected.fixture.path)));
    if (
      createHash('sha256').update(bytes).digest('hex') !== selected.fixture.sha256 ||
      bytes.byteLength !== selected.fixture.bytes
    ) {
      throw new Error(`Pinned fixture bytes changed: ${selected.fixture.id}`);
    }
    const input: PerformanceLabRunInput = {
      engine: options.modules[0]!.engine,
      fixture: {
        id: selected.fixture.id,
        format: selected.fixture.format,
        sourceUnit: selected.fixture.sourceUnit,
        bytes,
        sha256: selected.fixture.sha256,
      },
      cases: selected.cases.map((entry) => toRunCase(entry)),
      repeats: 1,
      cache: options.condition,
    };
    const { path } = options.modules[0]!;
    const load = selectLabProducts(options);
    const modules: PerformanceLabModules = {
      ...(input.engine === 'combined-wasm' ? { combined: async () => load(path) } : {}),
      ...(input.engine === 'native-desktop' ? { native: async () => load(path) } : {}),
    };
    const { runPerformanceLabCell } = await import('#experiments/performance-lab/performance-lab-runner.js');
    if (options.condition === 'warm') {
      await runPerformanceLabCell({ ...input, cache: 'cold' }, modules, 'discard');
    }
    result = await runPerformanceLabCell(input, modules);
  } catch (error) {
    failure = errorRecord(error);
    process.exitCode = 1;
  }
  const report: ChildReport = {
    ...(result === undefined ? {} : { result }),
    ...(failure === undefined ? {} : { error: failure }),
    memory: {
      method: 'process.resourceUsage().maxRSS (KiB) * 1024',
      scope: 'child-process-only; descendants not observed',
      peakBytes: process.resourceUsage().maxRSS * 1024,
      observed: 'after runner cleanup or thrown error, before result serialization; includes hashing and host setup',
    },
  };
  await writeLabChildReport(resolvePath(options.outputDir, 'result.json'), report);
};

const invokeCell = async (cell: Cell, options: Options) => {
  const outputDirectory = resolvePath(options.outputDir, 'cells', String(cell.sequence).padStart(5, '0'));
  await mkdir(outputDirectory, { recursive: true });
  const stdout = await open(resolvePath(outputDirectory, 'stdout.log'), 'wx');
  const stderr = await open(resolvePath(outputDirectory, 'stderr.log'), 'wx');
  const flag = moduleFlags.find(([, engine]) => engine === cell.module.engine)![0];
  const args = [
    script,
    `--${flag}=${cell.module.path}`,
    ...productFlags.flatMap(([name, key, owner]) =>
      owner === flag && options[key] !== undefined ? [`--${name}=${options[key]}`] : [],
    ),
    `--cell=${cell.selection.fixture.id}`,
    `--condition=${cell.condition}`,
    `--output-dir=${outputDirectory}`,
    `--hash-manifest=${resolvePath(options.outputDir, 'artifacts.json')}`,
    ...(options.includeScale ? ['--include-scale'] : []),
  ];
  const started = performance.now();
  let childExit: { code: number | WireNull; signal: NodeJS.Signals | WireNull } | undefined;
  let failure: ChildReport['error'];
  try {
    childExit = await new Promise<NonNullable<typeof childExit>>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: root,
        stdio: ['ignore', stdout.fd, stderr.fd],
        timeout: options.cellTimeout,
        killSignal: 'SIGKILL',
      });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        resolve({ code, signal });
      });
    });
  } catch (error) {
    failure = errorRecord(error);
  }
  const processWall = performance.now() - started;
  await Promise.all([stdout.close(), stderr.close()]);
  let report: ChildReceipt | undefined;
  try {
    report = await readLabChildReport(resolvePath(outputDirectory, 'result.json'));
  } catch (error) {
    failure ??= errorRecord(error);
  }
  return {
    sequence: cell.sequence,
    round: cell.round,
    condition: cell.condition,
    engine: cell.module.engine,
    modulePath: cell.module.path,
    fixture: cell.selection.fixture,
    cases: cell.selection.cases.map((entry) => toRunCase(entry)),
    repeats: 1,
    cache: cell.condition === 'cold' ? 'cold-module-cold-subject' : 'warm-module-cold-subject',
    ...report,
    ...(failure === undefined ? {} : { error: failure }),
    processWall,
    measuredWall: cell.condition === 'cold' ? processWall : report?.result?.timing.total,
    measuredWallScope: cell.condition === 'cold' ? 'spawn-through-close' : 'post-prewarm-runner-total',
    harnessWall:
      cell.condition === 'cold' && report?.result !== undefined ? processWall - report.result.timing.total : undefined,
    childExit,
    outputDir: outputDirectory,
  };
};

// oxlint-disable-next-line complexity -- One serial measured dispatch owns artifact, host-guard, status and resource receipts.
const runParent = async (options: Options): Promise<void> => {
  await verifySourceAuthority();
  const artifacts = await verifyLabArtifacts(await readArtifacts(options));
  const cells = planLabCells(options);
  const catalog = selectLabFixtures(options.includeScale);
  if (options.includeScale) {
    const capabilities = new Set(
      catalog.flatMap(({ cases }) => cases.map((entry) => ('matcher' in entry ? entry.matcher : entry.capability))),
    );
    if (catalog.length !== 22 || capabilities.size !== 31) {
      throw new Error('The full performance-lab catalog no longer covers 22 fixtures and 31 capabilities.');
    }
  }
  const sourcePaths = [
    'performance-lab-cli.ts',
    'performance-lab-runner.ts',
    '../../../geospec-engine-native/bench/performance-lab.ts',
    '../../../geospec-engine-native/bench/fixtures/performance-lab/manifest.json',
    '../../../geospec-engine-native/bench/fixtures/performance-lab/authority-cases.json',
    '../../../geospec-engine-native/bench/fixtures/performance-lab/authority-queries.json',
    '../../../geospec-engine-native/bench/fixtures/performance-lab/analytic-cases.json',
    '../../../geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v5.json',
    '../../../geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v6.json',
  ];
  const sources = await Promise.all(sourcePaths.map(async (path) => hashPath(resolvePath(import.meta.dirname, path))));
  await mkdir(dirname(options.outputDir), { recursive: true });
  await mkdir(options.outputDir);
  await writeJson(resolvePath(options.outputDir, 'artifacts.json'), artifacts);
  await writeJson(resolvePath(options.outputDir, 'run.json'), {
    purpose: 'diagnostic; not Q7 promotion',
    startedAt: new Date().toISOString(),
    argv: process.argv,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    samples: options.samples,
    includeScale: options.includeScale,
    conditions: ['cold', 'warm'],
    guards: {
      maxLoadPerCpu: options.maxLoadPerCpu,
      minFreeMemoryMiB: options.minFreeMemoryMiB,
      maxChildRssMiB: options.maxChildRssMiB,
      cellTimeout: options.cellTimeout,
    },
    hostPolicy: options.contendedHost
      ? 'contended-host-disclosed: guard violations are recorded per row as contended, never refused'
      : 'refuse the first cell whose pre-cell reading violates a guard',
    timingUnit: 'milliseconds',
    order: 'fixture offset = round; engine offset = round + original fixture index; zero-based, modulo counts',
    processWall: 'spawn through close; warm cells include untimed module prewarm and must not use this as warm latency',
    measuredWall:
      'cold: full child processWall; warm: second runner total after module prewarm, including new engine/subject admission and cleanup',
    harnessWall:
      'cold only: processWall minus the runner total (Node start, TypeScript imports, product and fixture SHA-256, result write); product time is result.timing',
    comparability:
      'per-case engine evaluations and per-fixture wall are descriptive; unsupported work is never equal backend throughput',
    hashCoverage:
      options.hashManifest === undefined
        ? 'module-entries-only; transitive binaries not pinned'
        : 'supplied-manifest-only; no inferred closure',
    artifacts,
    sources,
    catalog,
    schedule: cells.map(({ sequence, round, condition, module, selection }) => ({
      sequence,
      round,
      condition,
      engine: module.engine,
      fixtureId: selection.fixture.id,
    })),
  });
  const summary = {
    cells: 0,
    workerErrors: 0,
    expectedMatches: 0,
    qualifiedTargetDifferences: 0,
    unexpectedStatuses: 0,
    unsupported: 0,
    unverifiedExpectations: 0,
    coldCells: 0,
    warmCells: 0,
    resourceFailures: 0,
    contendedCells: 0,
  };
  for (const cell of cells) {
    const host = readHost();
    const contended = isHostContended(host, options);
    if (contended && !options.contendedHost) {
      // oxlint-disable-next-line no-await-in-loop -- Stop at the first noisy cell and retain its refusal receipt.
      await writeJson(resolvePath(options.outputDir, 'host-guard.json'), {
        cell,
        host,
        guards: options,
      });
      throw new Error(`Host noise/resource guard refused cell ${cell.sequence}; partial run is not comparable.`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Measurements must run serially in fresh children, with no overlapping engines.
    const row = await invokeCell(cell, options);
    const hostAfter = readHost();
    const { counts, knownDifferences } = summarizeLabCaseResults(row.engine, row.result?.perCase ?? []);
    // oxlint-disable-next-line no-await-in-loop -- Retain each raw cell before starting the next one.
    await appendFile(
      resolvePath(options.outputDir, 'rows.jsonl'),
      JSON.stringify({ ...row, host, hostAfter, contended, artifacts, knownDifferences }) + '\n',
    );
    summary.cells += 1;
    summary.contendedCells += Number(contended);
    if (cell.condition === 'cold') {
      summary.coldCells += 1;
    } else {
      summary.warmCells += 1;
    }
    if (row.error !== undefined || row.childExit?.code !== 0 || row.result === undefined) {
      summary.workerErrors += 1;
    }
    if (row.memory && row.memory.peakBytes > options.maxChildRssMiB * 1024 * 1024) {
      summary.resourceFailures += 1;
    }
    summary.expectedMatches += counts.expectedMatches;
    summary.qualifiedTargetDifferences += counts.qualifiedTargetDifferences;
    summary.unexpectedStatuses += counts.unexpectedStatuses;
    summary.unsupported += counts.unsupported;
    summary.unverifiedExpectations += counts.unverifiedExpectations;
    console.log(
      `${summary.cells}/${cells.length} round=${cell.round} ${cell.condition} ${cell.module.engine} ${cell.selection.fixture.id} ${row.error?.message ?? 'recorded'}`,
    );
  }
  await writeJson(resolvePath(options.outputDir, 'summary.json'), summary);
  console.log(JSON.stringify(summary));
  if (summary.workerErrors > 0 || summary.unexpectedStatuses > 0 || summary.resourceFailures > 0) {
    process.exitCode = 1;
  }
};

/**
 * Count source-backed differences separately while preserving every raw status.
 * @internal
 * @param engine - Actual selected engine.
 * @param cases - Unchanged shared-runner case status records.
 * @returns Diagnostic counters and separate reason/source annotations.
 */
export const summarizeLabCaseResults = (
  engine: Engine,
  cases: ReadonlyArray<
    Pick<PerformanceLabRunResult['perCase'][number], 'caseId' | 'repeat' | 'status' | 'expectedStatus'>
  >,
): {
  counts: {
    expectedMatches: number;
    qualifiedTargetDifferences: number;
    unexpectedStatuses: number;
    unsupported: number;
    unverifiedExpectations: number;
  };
  knownDifferences: Array<PerformanceLabDifference & { caseId: string; repeat: number }>;
} => {
  const counts = {
    expectedMatches: 0,
    qualifiedTargetDifferences: 0,
    unexpectedStatuses: 0,
    unsupported: 0,
    unverifiedExpectations: 0,
  };
  const knownDifferences: Array<PerformanceLabDifference & { caseId: string; repeat: number }> = [];
  for (const entry of cases) {
    if (entry.status === 'unsupported') {
      counts.unsupported += 1;
    } else if (entry.expectedStatus === 'unverified') {
      counts.unverifiedExpectations += 1;
    } else if (entry.status === entry.expectedStatus) {
      counts.expectedMatches += 1;
    } else {
      const difference = classifyPerformanceLabDifference({ engine, ...entry });
      if (difference?.kind === 'qualified-target-difference') {
        knownDifferences.push({
          caseId: entry.caseId,
          repeat: entry.repeat,
          ...difference,
        });
        counts.qualifiedTargetDifferences += 1;
      } else {
        counts.unexpectedStatuses += 1;
      }
    }
  }
  return { counts, knownDifferences };
};

const main = async (): Promise<void> => {
  if (process.argv.includes('--help')) {
    console.log(help);
    return;
  }
  const options = parseCliArguments(process.argv.slice(2));
  await (options.cell === undefined ? runParent(options) : runChild(options));
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error('Performance-lab CLI failed:', error);
    process.exitCode = 1;
  }
}
