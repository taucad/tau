import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Type-only self-owned benchmark module; no generator execution.
import type { BroadFixtureManifest, BroadFixtureDescriptor, SizedArtifact } from '#bench/broad-fixtures';

/** Hashed runtime input retained in the dispatch receipt. @internal */
export type Artifact = { path: string; sha256: string };
/** Node readFile bytes retain the Node buffer backing type. */
// oxlint-disable-next-line enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- Node readFile types expose ArrayBufferLike; this keeps the existing bytes without a timed copy.
type FileBytes = Uint8Array;
/** Explicit null at the frozen JSON and subprocess boundaries. */
// oxlint-disable-next-line typescript/no-restricted-types -- The retained wire/report contracts require explicit null, not omitted fields.
type WireNull = null;
/** JSON values retained by the frozen corpus. @internal */
export type JsonValue = WireNull | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
/** The three coordinates of a retained bounding-box vector. @internal */
export type Vector3 = [number, number, number];
/** The frozen reference's bounding-box fields used by this harness. @internal */
export type LegacyBoundingBox = {
  center: Vector3;
  size: Vector3;
  primitives?: Array<{ aabb: { min: Vector3; max: Vector3 } }>;
};
/** Independently expected and observed matcher projection. @internal */
export type Projection = { status: string; measured: JsonValue };
/** Retained claim output from the byte facade. @internal */
export type ClaimResult = { status: string; evidence: { measured: JsonValue } };
/** Successful response used by the selected four workloads. @internal */
export type ExpectedResponse = { result: { results: [ClaimResult, ...ClaimResult[]] } };
/** Frozen corpus request fields used by the reference adapter. @internal */
export type ClaimRequest = {
  plan: { claims: [{ claimId: string; capability: string; payload: JsonValue; workUnitBudget: number }] };
};
/** Selected records are admitted mesh claims, never generated expectations. @internal */
export type CorpusRecord = { id: string; expectedUtf8: string; inputUtf8: string; ingest: string[] };
/** Frozen binary mesh fixture and admission request. @internal */
export type MeshRecord = { id: string; meshHex: string; requestUtf8: string };
/** Retained corpus fields read by the harness. @internal */
export type Corpus = { records: CorpusRecord[]; meshes: MeshRecord[] };
/** Public entry routes bound by the receipt. @internal */
export type RouteName = 'reference' | 'wasm' | 'native';
/** Hashed route inputs; reference uses its frozen registry version. @internal */
export type Route = {
  kind: RouteName;
  module: Artifact;
  binary?: Artifact;
  loader?: Artifact;
  artifacts: Artifact[];
  registryVersion?: number;
};
/** Fixed-pair control parameters; duration is stored in milliseconds. @internal */
export type ControlSampling = {
  seed: number;
  samples: number;
  bootstrapResamples: number;
  alpha: number;
  noiseBand: [number, number];
};
/** Frozen benchmark dispatch configuration. @internal */
export type BenchmarkConfig = {
  schemaVersion: number;
  source: string;
  corpus: Artifact;
  broadFixtures?: Artifact;
  routes: Partial<Record<RouteName, Route>>;
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Exact frozen config field; milliseconds, retained without schema mutation.
  sampling: ControlSampling & { warmups: number; timerSamples: number; order: string; plantedDelayMs: number };
  timingGate?: { timingEligible: boolean; artifactHandoff?: string; quietWindowObservedAt?: string };
  toolchain: JsonValue;
};
/** Native/WASM byte methods exercised by the retained workloads. @internal */
export type NewBinding = {
  Engine: new () => {
    ingestMesh: (request: Uint8Array<ArrayBuffer>, mesh: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    canonicalPlan: (request: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    evaluatePlan: (plan: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    processRequest: (request: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  };
  initialize?: (binary: FileBytes) => Promise<void>;
  default?: (options: { module_or_path: FileBytes }) => Promise<WebAssembly.Exports>;
};
/** Frozen legacy source host/protocol operations used here. @internal */
export type LegacyImplementation = {
  host: {
    analyzeMesh: (request: {
      source: ReturnType<typeof decodeMesh>;
      format: 'mesh-buffer';
    }) => Promise<
      | { success: true; subject: { subjectId: string }; stats: { boundingBox: LegacyBoundingBox } }
      | { success: false; diagnostics: JsonValue }
    >;
  };
  protocol: {
    submitClaims: (request: {
      requestId: string;
      registryVersion: number | undefined;
      execution: { forensic: boolean; matcherWallBackstop: number };
      claims: Array<Uint8Array<ArrayBuffer>>;
    }) => Promise<{ results: [ClaimResult, ...ClaimResult[]] }>;
    releaseSubject: (request: { requestId: string; subjectId: string }) => void;
  };
};
/** Successful worker data before process metadata is attached. @internal */
export type RouteResult = {
  phases: {
    loadNs: number;
    admissionNs: number;
    canonicalPlanNs: number | WireNull;
    evaluationNs: number;
    endToEndRawNs: number;
  };
  projection: Projection;
  routeMeasured?: LegacyBoundingBox;
  outputSha256: string;
  outputBytes: number;
  planSha256: string | WireNull;
  evaluatedSha256: string;
  exactExpectedBytes: boolean;
};
/** Parsed successful subprocess output. @internal */
export type WorkerSuccess = RouteResult & {
  workload: string;
  route: RouteName;
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Exact retained worker report field; milliseconds.
  plantedDelayMs: number;
  semanticMatch: boolean;
  expectedProjection: Projection;
  rssBefore: number;
  rssAfter: number;
  maxRssBytes: number;
  workerWallNs: number;
};
/** Failed subprocess output is retained without fabricated result fields. @internal */
export type WorkerFailure = {
  workload: string;
  route: RouteName;
  workerFailure: true;
  status: number | WireNull;
  signal: NodeJS.Signals | WireNull;
  stdout: string;
  stderr: string;
  semanticMatch?: never;
  exactExpectedBytes?: never;
  phases?: never;
  outputSha256?: never;
};
/** Parent process observation, including raw failures. @internal */
export type WorkerRow = (WorkerSuccess | WorkerFailure) & { processWallNs: number };
/** Fields needed for synthetic and measured paired controls. @internal */
export type ControlObservation = {
  workload: string;
  measured: boolean;
  sample: number;
  arm: string;
  phases?: { endToEndRawNs: number };
  outputSha256?: string;
  semanticMatch?: boolean;
  exactExpectedBytes?: boolean;
};
/** Paired control decision retained in campaign evidence. @internal */
export type Decision = {
  workload: string;
  axis: string;
  classification: string;
  pairCount: number;
  outputsEqual?: boolean;
  ratio?: number;
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- Persisted statistical confidence interval, not a time duration.
  interval?: [number, number];
};

/**
 * Hash exact retained bytes.
 * @internal
 * @param bytes - Exact input bytes.
 * @returns The exact SHA-256 digest.
 */
export const sha256 = (bytes: string | FileBytes): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Read a receipt-bound artifact and reject changed bytes.
 * @internal
 * @returns Verified artifact bytes.
 */
export const readHashed = async ({ path, sha256: expected }: Artifact): Promise<FileBytes> => {
  const bytes = await readFile(path);
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`SHA-256 mismatch for ${path}: expected ${expected}, received ${actual}`);
  }
  return bytes;
};

/** Compact recipe metadata; claims remain unmapped and are never ingested. @internal */
export type PendingBroadRecipe = {
  id: string;
  subject: string;
  claimCount: number;
  profileRequirements: Record<string, unknown>;
  metadataObligations: Record<string, unknown>;
};
/** Verified input metadata only; no geometry or performance qualification. @internal */
export type VerifiedBroadFixtures = {
  schemaVersion: 1;
  manifest: SizedArtifact;
  producerSource: string;
  generator: SizedArtifact;
  closure: {
    declared: { artifacts: number; bytes: number };
    observed: { artifacts: number; bytes: number };
    uniqueFileReads: number;
  };
  artifacts: SizedArtifact[];
  fixtures: Array<
    BroadFixtureDescriptor & {
      disposition: 'artifact-awaiting-engine-correctness-and-delivery-routes' | 'recipe-pending-mapping-not-ingestible';
      recipe?: PendingBroadRecipe;
    }
  >;
  qualification: 'input-integrity-only';
  engineCorrectness: 'pending';
  deliveryRoutes: 'pending';
  performanceQualification: 'pending';
  analyticFactsStatus: 'supplied-independent-metadata-not-engine-observations';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const verifyArtifactShape = (artifact: Artifact): void => {
  assert.ok(isRecord(artifact), 'Artifact must be an object.');
  assert.ok(typeof artifact.path === 'string' && artifact.path.trim().length > 0, 'Artifact path is required.');
  assert.ok(
    typeof artifact.sha256 === 'string' && /^[a-f\d]{64}$/u.test(artifact.sha256),
    'Artifact SHA-256 is required.',
  );
};

const verifySizedArtifactShape = (artifact: SizedArtifact): void => {
  verifyArtifactShape(artifact);
  assert.ok(
    Number.isSafeInteger(artifact.bytes) && artifact.bytes >= 0,
    'Artifact byte length must be a nonnegative integer.',
  );
};

const parseBroadManifest = (bytes: FileBytes): BroadFixtureManifest => {
  const manifest = JSON.parse(bytes.toString()) as BroadFixtureManifest;
  assert.ok(isRecord(manifest), 'Broad manifest must be an object.');
  assert.equal(manifest.schemaVersion, 1, 'Broad manifest schema must be version 1.');
  assert.ok(
    typeof manifest.source === 'string' && /^[a-f\d]{40}$/u.test(manifest.source),
    'Producer source revision is required.',
  );
  assert.equal(manifest.candidateEngineExecuted, false, 'Broad manifest must contain inputs only.');
  assert.equal(manifest.timingRun, false, 'Broad manifest must contain inputs only.');
  verifySizedArtifactShape(manifest.generator);
  assert.ok(
    Number.isSafeInteger(manifest.totalGeneratedBytes) && manifest.totalGeneratedBytes >= 0,
    'Invalid generated byte total.',
  );
  assert.ok(Array.isArray(manifest.fixtures), 'Broad descriptors must be an array.');
  const ids = new Set<string>();
  for (const fixture of manifest.fixtures) {
    assert.ok(
      isRecord(fixture) && typeof fixture.id === 'string' && fixture.id.length > 0,
      'Descriptor ID is required.',
    );
    assert.ok(!ids.has(fixture.id), `Duplicate broad descriptor ${fixture.id}.`);
    ids.add(fixture.id);
    assert.ok(
      ['large-mesh', 'many-occurrences', 'boolean-void-heavy', 'many-claims'].includes(fixture.family),
      'Unknown broad family.',
    );
    assert.ok(['gltf', 'step', 'request-construction-json'].includes(fixture.format), 'Unknown broad format.');
    assert.ok(
      fixture.format !== 'request-construction-json' || fixture.family === 'many-claims',
      'Recipes require the many-claims family.',
    );
    assert.ok(isRecord(fixture.analyticFacts), 'Independent analytic metadata is required.');
    assert.ok(typeof fixture.qualification === 'string', 'Input qualification is required.');
    verifySizedArtifactShape(fixture.primary);
    assert.ok(Array.isArray(fixture.resources), 'Descriptor resources must be an array.');
    for (const resource of fixture.resources) {
      verifySizedArtifactShape(resource);
    }
  }
  return manifest;
};

const parseBroadRecipe = (bytes: FileBytes): PendingBroadRecipe => {
  const recipe = JSON.parse(bytes.toString()) as PendingBroadRecipe & { schemaVersion: number; claims: unknown[] };
  assert.ok(isRecord(recipe) && recipe.schemaVersion === 1, 'Recipe schema must be version 1.');
  assert.ok(
    typeof recipe.id === 'string' && typeof recipe.subject === 'string',
    'Recipe identity and subject are required.',
  );
  assert.ok(Number.isSafeInteger(recipe.claimCount) && recipe.claimCount > 0, 'Recipe claim count must be positive.');
  assert.ok(Array.isArray(recipe.claims) && recipe.claims.length === recipe.claimCount, 'Recipe claim count mismatch.');
  assert.ok(
    isRecord(recipe.profileRequirements) && isRecord(recipe.metadataObligations),
    'Recipe mapping metadata is required.',
  );
  const { id, subject, claimCount, profileRequirements, metadataObligations } = recipe;
  return { id, subject, claimCount, profileRequirements, metadataObligations };
};

/**
 * Verify optional broad inputs once per physical file, retaining metadata only.
 * @internal
 * @param artifact - Optional source-bound broad manifest.
 * @returns Owned integrity receipt, or undefined for the unchanged early harness.
 */
export const verifyBroadFixtures = async (artifact?: Artifact): Promise<VerifiedBroadFixtures | undefined> => {
  if (artifact === undefined) {
    return undefined;
  }
  verifyArtifactShape(artifact);
  const manifestPath = await realpath(artifact.path);
  // Keep the manifest buffer scoped to parsing, just like every later artifact buffer.
  const readManifest = async () => {
    const bytes = await readHashed(artifact);
    return { manifest: parseBroadManifest(bytes), bytes: bytes.byteLength };
  };
  const { manifest, bytes: manifestBytes } = await readManifest();
  const reads = new Map<string, { artifact: SizedArtifact; recipe?: PendingBroadRecipe }>([
    [manifestPath, { artifact: { ...artifact, bytes: manifestBytes } }],
  ]);
  const verifyFile = async (input: SizedArtifact, recipe = false) => {
    const path = await realpath(input.path);
    let checked = reads.get(path);
    if (checked === undefined) {
      const bytes = await readHashed(input);
      assert.equal(bytes.byteLength, input.bytes, `Byte length mismatch for ${input.path}.`);
      checked = {
        artifact: { ...input, bytes: bytes.byteLength },
        ...(recipe ? { recipe: parseBroadRecipe(bytes) } : {}),
      };
      reads.set(path, checked);
    }
    assert.equal(checked.artifact.sha256, input.sha256, `Conflicting hash for ${input.path}.`);
    assert.equal(checked.artifact.bytes, input.bytes, `Conflicting byte length for ${input.path}.`);
    return { path, checked };
  };
  const fixtures: VerifiedBroadFixtures['fixtures'] = [];
  // Recipe primaries come first so a shared resource is never reread to parse a recipe.
  for (const fixture of manifest.fixtures.filter(({ format }) => format === 'request-construction-json')) {
    // oxlint-disable-next-line no-await-in-loop -- Sequential verification bounds retained bytes and prevents duplicate reads of shared paths.
    const { checked } = await verifyFile(fixture.primary, true);
    assert.ok(checked.recipe !== undefined && checked.recipe.id === fixture.id, 'Recipe descriptor identity mismatch.');
    fixtures.push({ ...fixture, disposition: 'recipe-pending-mapping-not-ingestible', recipe: checked.recipe });
  }
  await verifyFile(manifest.generator);
  const closure = new Map<string, SizedArtifact>();
  for (const fixture of manifest.fixtures) {
    for (const input of [fixture.primary, ...fixture.resources]) {
      // oxlint-disable-next-line no-await-in-loop -- Sequential verification releases each bulk buffer before reading the next unique artifact.
      const { path, checked } = await verifyFile(input);
      closure.set(path, checked.artifact);
    }
    if (fixture.format !== 'request-construction-json') {
      fixtures.push({ ...fixture, disposition: 'artifact-awaiting-engine-correctness-and-delivery-routes' });
    }
  }
  const observedBytes = [...closure.values()].reduce((total, input) => total + input.bytes, 0);
  assert.equal(observedBytes, manifest.totalGeneratedBytes, 'Broad closure byte total mismatch.');
  return {
    schemaVersion: 1,
    manifest: { ...artifact, bytes: manifestBytes },
    producerSource: manifest.source,
    generator: manifest.generator,
    closure: {
      declared: { artifacts: closure.size, bytes: manifest.totalGeneratedBytes },
      observed: { artifacts: closure.size, bytes: observedBytes },
      uniqueFileReads: reads.size,
    },
    artifacts: [...closure.values()],
    fixtures: manifest.fixtures.map(({ id }) => fixtures.find((fixture) => fixture.id === id)!),
    qualification: 'input-integrity-only',
    engineCorrectness: 'pending',
    deliveryRoutes: 'pending',
    performanceQualification: 'pending',
    analyticFactsStatus: 'supplied-independent-metadata-not-engine-observations',
  };
};

/**
 * Preserve recursively sorted canonical claim JSON.
 * @internal
 * @param value - Frozen claim JSON.
 * @returns Recursively ordered JSON.
 */
export const canonicalJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalJson(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    );
  }
  return value;
};

/**
 * Encode the frozen canonical claim representation.
 * @internal
 * @param value - Frozen claim JSON.
 * @returns Canonical JSON bytes.
 */
export const canonicalBytes = (value: JsonValue): Uint8Array<ArrayBuffer> =>
  Buffer.from(JSON.stringify(canonicalJson(value)));

/**
 * Decode the frozen GSM1 layout into the legacy Float32 mesh source.
 * @internal
 * @param meshHex - Exact GSM1 payload.
 * @returns Legacy mesh source.
 */
export const decodeMesh = (
  meshHex: string,
): { format: 'mesh-buffer'; positions: Float32Array<ArrayBuffer>; indices: Uint32Array<ArrayBuffer> } => {
  const bytes = Buffer.from(meshHex, 'hex');
  if (bytes.length < 12 || bytes.subarray(0, 4).toString() !== 'GSM1') {
    throw new Error('Invalid GSM1 mesh.');
  }
  const vertexCount = bytes.readUInt32LE(4);
  const triangleCount = bytes.readUInt32LE(8);
  const indexStart = 12 + vertexCount * 24;
  if (bytes.length !== indexStart + triangleCount * 12) {
    throw new Error('Invalid GSM1 mesh length.');
  }
  const positions = new Float32Array(vertexCount * 3);
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = bytes.readDoubleLE(12 + index * 8);
  }
  const indices = new Uint32Array(triangleCount * 3);
  for (let index = 0; index < indices.length; index += 1) {
    indices[index] = bytes.readUInt32LE(indexStart + index * 4);
  }
  return { format: 'mesh-buffer', positions, indices };
};

/**
 * Read the independently frozen matcher expectation.
 * @internal
 * @param record - Independent corpus row.
 * @returns Independent expected projection.
 */
export const expectedProjection = (record: CorpusRecord): Projection => {
  const result = (JSON.parse(record.expectedUtf8) as ExpectedResponse).result.results[0];
  return { status: result.status, measured: result.evidence.measured };
};

/**
 * Apply frozen mesh-matchers.ts lines 233–236 (SHA256 4689f1b593dea81a52b01852f02eb5ec6906aad2c3cd3878576572739da0949f; frozen reference-a3/packages/geospec-engine/src/matchers/mesh-matchers.ts).
 * @internal
 * @param boundingBox - Raw frozen host analysis.
 * @returns Matcher center, size and reconstructed extrema.
 */
export const projectLegacyBoundingBox = (
  boundingBox: LegacyBoundingBox,
): { center: Vector3; size: Vector3; min: number[]; max: number[] } => {
  return {
    center: boundingBox.center,
    max: ([0, 1, 2] as const).map((axis) => boundingBox.center[axis] + boundingBox.size[axis] / 2),
    min: ([0, 1, 2] as const).map((axis) => boundingBox.center[axis] - boundingBox.size[axis] / 2),
    size: boundingBox.size,
  };
};

/**
 * Compare the full semantic projection without rounding.
 * @internal
 * @param actual - Route projection.
 * @param expected - Frozen expected projection.
 * @returns Whether every projected field agrees.
 */
export const semanticEqual = (actual: Projection, expected: Projection): boolean => isDeepStrictEqual(actual, expected);

/**
 * Apply the retained Fisher–Yates shuffle.
 * @internal
 * @param values - Values in declared input order.
 * @param random - Seeded draw function.
 * @returns The deterministically shuffled copy.
 */
export const shuffled = <Value>(values: Value[], random: () => number): Value[] => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
};

/**
 * Produce the predeclared unsigned 32-bit pseudorandom sequence.
 * @internal
 * @param seed - Predeclared seed.
 * @returns The next unsigned pseudorandom draw.
 */
export const xorshift32 = (seed: number): (() => number) => {
  // oxlint-disable-next-line no-bitwise, unicorn/prefer-math-trunc -- Preserve the predeclared xorshift32 sequence and control seed domains.
  let state = seed >>> 0;
  return () => {
    // oxlint-disable-next-line no-bitwise -- Preserve the predeclared xorshift32 sequence and control seed domains.
    state ^= state << 13;
    // oxlint-disable-next-line no-bitwise -- Preserve the predeclared xorshift32 sequence and control seed domains.
    state ^= state >>> 17;
    // oxlint-disable-next-line no-bitwise -- Preserve the predeclared xorshift32 sequence and control seed domains.
    state ^= state << 5;
    // oxlint-disable-next-line no-bitwise, unicorn/prefer-math-trunc -- Preserve the predeclared xorshift32 sequence and control seed domains.
    return (state >>> 0) / 4_294_967_296;
  };
};

const quantile = (values: number[], probability: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(probability * sorted.length))]!;
};

type PairStatistics = {
  ratio: number;
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- Persisted statistical confidence interval, not a time duration.
  interval: [number, number];
};

/**
 * Bootstrap the retained paired log-ratio statistic.
 * @internal
 * @returns Paired ratio and bootstrap confidence bounds.
 */
export const pairedInterval = ({
  pairs,
  resamples,
  alpha,
  random,
}: {
  pairs: Array<{ baseline: number; candidate: number }>;
  resamples: number;
  alpha: number;
  random: () => number;
}): PairStatistics => {
  const logs = pairs.map(({ baseline, candidate }) => Math.log(candidate / baseline));
  const bootstrapped = [];
  for (let sample = 0; sample < resamples; sample += 1) {
    let sum = 0;
    for (const _log of logs) {
      sum += logs[Math.floor(random() * logs.length)]!;
    }
    bootstrapped.push(Math.exp(sum / logs.length));
  }
  return {
    ratio: Math.exp(logs.reduce((sum, value) => sum + value, 0) / logs.length),
    interval: [quantile(bootstrapped, alpha / 2), quantile(bootstrapped, 1 - alpha / 2)],
  };
};

/**
 * Classify retained A/A and planted-delay pairs.
 * @internal
 * @returns Control classifications.
 */
export const analyzeControls = ({
  observations,
  sampling,
}: {
  observations: ControlObservation[];
  sampling: ControlSampling;
}): Decision[] => {
  // oxlint-disable-next-line no-bitwise -- Preserve the predeclared xorshift32 sequence and control seed domains.
  const random = xorshift32(sampling.seed ^ 0x00_0a_11_ce);
  const decisions: Decision[] = [];
  const workloads = [...new Set(observations.map(({ workload }) => workload))];
  for (const workload of workloads) {
    const rows = observations.filter((row) => row.workload === workload && row.measured && row.phases !== undefined);
    const bySample = new Map<number, Partial<Record<string, ControlObservation>>>();
    for (const row of rows) {
      const group = bySample.get(row.sample) ?? {};
      group[row.arm] = row;
      bySample.set(row.sample, group);
    }
    for (const [axis, arm] of [
      ['native-aa', 'native-b'],
      ['planted-delay', 'native-delay'],
    ] as const) {
      const pairs = [...bySample.values()]
        .filter((group) => group['native-a'] !== undefined && group[arm] !== undefined)
        .map((group) => ({
          baseline: group['native-a']!.phases!.endToEndRawNs,
          candidate: group[arm]!.phases!.endToEndRawNs,
          outputsEqual: group['native-a']!.outputSha256 === group[arm]!.outputSha256,
        }));
      if (pairs.length === 0) {
        decisions.push({ workload, axis, classification: 'missing', pairCount: 0 });
        continue;
      }
      const statistics = pairedInterval({
        pairs,
        resamples: sampling.bootstrapResamples,
        alpha: sampling.alpha,
        random,
      });
      const [low, high] = statistics.interval;
      const complete = pairs.length === sampling.samples;
      const outputsEqual = pairs.every(({ outputsEqual }) => outputsEqual);
      const classification =
        !complete || !outputsEqual
          ? 'invalid'
          : axis === 'native-aa'
            ? low <= 1 && high >= 1 && low >= sampling.noiseBand[0] && high <= sampling.noiseBand[1]
              ? 'noise-characterized'
              : 'high-noise-unresolved'
            : low > sampling.noiseBand[1]
              ? 'detected'
              : 'inconclusive';
      decisions.push({ workload, axis, pairCount: pairs.length, outputsEqual, ...statistics, classification });
    }
  }
  return decisions;
};

/**
 * Classify only equivalent successor byte-facade work.
 * @internal
 * @returns Successor route classifications.
 */
export const analyzeComparableRoutes = ({
  observations,
  sampling,
  controls,
}: {
  observations: ControlObservation[];
  sampling: ControlSampling;
  controls: Decision[];
}): Decision[] => {
  // oxlint-disable-next-line no-bitwise -- Preserve the predeclared xorshift32 sequence and control seed domains.
  const random = xorshift32(sampling.seed ^ 0x00_c0_ff_ee);
  const decisions: Decision[] = [];
  const workloads = [...new Set(observations.map(({ workload }) => workload))];
  for (const workload of workloads) {
    const rows = observations.filter((row) => row.workload === workload && row.measured && row.phases !== undefined);
    const bySample = new Map<number, Partial<Record<string, ControlObservation>>>();
    for (const row of rows) {
      const group = bySample.get(row.sample) ?? {};
      group[row.arm] = row;
      bySample.set(row.sample, group);
    }
    const pairs = [...bySample.values()]
      .filter((group) => group['wasm'] !== undefined && group['native-a'] !== undefined)
      .map((group) => ({
        baseline: group['wasm']!.phases!.endToEndRawNs,
        candidate: group['native-a']!.phases!.endToEndRawNs,
        outputsEqual: group['wasm']!.outputSha256 === group['native-a']!.outputSha256,
        semanticsValid:
          group['wasm']!.semanticMatch &&
          group['native-a']!.semanticMatch &&
          group['wasm']!.exactExpectedBytes &&
          group['native-a']!.exactExpectedBytes,
      }));
    if (pairs.length === 0) {
      decisions.push({ workload, axis: 'wasm-vs-native', classification: 'missing', pairCount: 0 });
      continue;
    }
    const statistics = pairedInterval({ pairs, resamples: sampling.bootstrapResamples, alpha: sampling.alpha, random });
    const [low, high] = statistics.interval;
    const control = controls.find((decision) => decision.workload === workload && decision.axis === 'native-aa');
    const valid =
      pairs.length === sampling.samples &&
      pairs.every(({ outputsEqual, semanticsValid }) => outputsEqual && semanticsValid);
    const classification = valid
      ? control?.classification === 'noise-characterized'
        ? high < 1
          ? 'native-faster-entry-observation'
          : low > 1
            ? 'native-slower-entry-observation'
            : 'inconclusive'
        : 'inconclusive-noise'
      : 'invalid';
    decisions.push({ workload, axis: 'wasm-vs-native', pairCount: pairs.length, ...statistics, classification });
  }
  return decisions;
};
