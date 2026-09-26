import type { ProductCampaign } from '#bench/campaign';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
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

/** Installed-product consumer kinds represented by the benchmark driver. @internal */
export type ProductConsumer = 'standalone' | 'vitest' | 'python';
/** A product route that can execute now through the bundled worker. @internal */
export type InstalledProductRoute = {
  state: 'ready';
  consumer: ProductConsumer;
  backend: 'legacy' | 'native' | 'mixed';
  profile: string;
  comparison: string;
  parityProfile?: string;
  expectedResults?: Record<string, { outputIdentity: string; statusCounts: Record<string, number> }>;
  supportedWorkloads?: string[];
  /** Explicit event-adapter state support, bound by the frozen executable closure. */
  stateContracts?: Array<'warm-engine-cold-subject' | 'resident-warm' | 'incremental-edit' | 'persisted-warm'>;
  cacheContract?: 'native-authenticated-overlap-a3';
  workloadGaps?: Record<
    string,
    { classification: 'capability-unsupported' | 'adapter-not-implemented'; reason: string }
  >;
  execution:
    | {
        kind: 'installed-js';
        consumerRoot: string;
        harness: Artifact;
        binding: Artifact;
        assertionClient: Artifact;
        campaign?: Artifact;
      }
    | {
        kind: 'installed-legacy-js';
        consumerRoot: string;
        engine: Artifact;
        receipt: Artifact;
      }
    | {
        kind: 'event-command';
        executable: string;
        arguments: string[];
        cwd: string;
        environment?: Record<string, string>;
      };
  artifacts: Artifact[];
};
/** A selected consumer route that cannot yet emit truthful boundary events. @internal */
export type UnavailableProductRoute = {
  state: 'unavailable';
  consumer: ProductConsumer;
  backend: 'legacy' | 'native' | 'mixed';
  profile: string;
  comparison: string;
  reason: string;
  artifacts?: Artifact[];
};
/** Product route declaration. @internal */
export type ProductRoute = InstalledProductRoute | UnavailableProductRoute;
/** Frozen product or generated broad workload. @internal */
export type ProductWorkload =
  | { id: string; kind: 'm3-row'; rowId: string }
  | { id: string; kind: 'broad-fixture'; fixtureId: string }
  | { id: string; kind: 'common-tetrahedron-bounds' }
  | {
      id: string;
      kind: 'independent-subject-batch' | 'selected-suite';
      members: Array<{ id: string; workload: string }>;
    };
/** Provisional installed-product benchmark configuration. @internal */
export type ProductBenchmarkConfig = {
  schemaVersion: 2;
  campaign?: ProductCampaign;
  source: string;
  workspaceRoot: string;
  broadFixtures: Artifact;
  routes: Record<string, ProductRoute>;
  workloads: ProductWorkload[];
  repeats: number;
  campaignGate: {
    provisional: true;
    releaseCampaign: false;
    reason: string;
  };
  toolchain: JsonValue;
};

/**
 * Resolve one public consumer result before exposing its actionable boundary.
 * @internal
 * @returns The same resolved public report after its boundary observer returns.
 */
export const observePublicConsumerResult = async <Report>({
  consume,
  acknowledge,
}: {
  consume: () => Promise<Report>;
  acknowledge: (report: Report) => void | Promise<void>;
}): Promise<Report> => {
  const report = await consume();
  await acknowledge(report);
  return report;
};

/** One claim generated from independent broad-fixture facts. @internal */
export type BroadClaim = {
  claimId: string;
  capability: string;
  payload: JsonValue;
  polarity: 'positive';
  subjectSlots: ['subject'];
  workUnitBudget: number;
};
/** Executable broad subject and claim batch. @internal */
export type BroadWorkloadPlan = {
  fixture: BroadFixtureDescriptor;
  subject: BroadFixtureDescriptor;
  claims: BroadClaim[];
  authoredClaims: number;
  unsupportedClaims: string[];
  independentFacts: Record<string, unknown>;
  overlapOracle?: { claimIds: string[]; leftLabel: string; rightLabel: string; volume: number };
};
/** Public A3 Node cache options; private storage remains explicitly selected. @internal */
export type ProductCacheOptions = { root: string; projectRoot: string };

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
      source: ReturnType<typeof decodeMesh> | string | Uint8Array<ArrayBuffer>;
      format: 'mesh-buffer' | 'gltf' | 'glb';
      sourceUnit?: 'mm';
      unit?: 'mm';
    }) => Promise<
      | { success: true; subject: { subjectId: string }; stats: { boundingBox: LegacyBoundingBox } }
      | { success: false; diagnostics: JsonValue }
    >;
  };
  protocol: {
    initialize: (request: { protocolVersion: 2; client: { name: string; version: string } }) => {
      protocolVersion: number;
      capabilities: Array<{ name: string; registryVersion: number }>;
    };
    ingestSubject: (
      request: {
        requestId: string;
        contentHash: string;
        format: 'step' | 'stp';
        frame: { coordinateSystem: 'z-up'; sourceUnit: string; targetUnit: 'mm' };
        provenance: JsonValue;
        options: JsonValue;
      },
      bytes: Uint8Array<ArrayBuffer>,
    ) => Promise<{ requestId: string; subject: { subjectId: string; contentHash: string } }>;
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
  claims: Array<{ claimId: string; subject: string; query: { kind: string; left?: string; right?: string } }>;
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
  const claims = recipe.claims as PendingBroadRecipe['claims'];
  for (const claim of claims) {
    assert.ok(
      isRecord(claim) &&
        typeof claim.claimId === 'string' &&
        claim.subject === recipe.subject &&
        isRecord(claim.query) &&
        typeof claim.query.kind === 'string',
      'Recipe claim shape mismatch.',
    );
  }
  const { id, subject, claimCount, profileRequirements, metadataObligations } = recipe;
  return { id, subject, claimCount, profileRequirements, metadataObligations, claims };
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

const factNumber = (value: unknown, label: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    value[1] !== 0
  ) {
    return value[0] / value[1];
  }
  throw new Error(`Broad fixture ${label} must be a finite number or rational pair.`);
};

const factVector = (value: unknown, label: string): Vector3 => {
  assert.ok(Array.isArray(value) && value.length === 3, `Broad fixture ${label} must be a three-vector.`);
  return value.map((entry, index) => factNumber(entry, `${label}[${index}]`)) as Vector3;
};

const broadBoundingBox = (facts: Record<string, unknown>): JsonValue => {
  const source = isRecord(facts['aabb'])
    ? facts['aabb']
    : Array.isArray(facts['outerDimensions'])
      ? { min: [0, 0, 0], max: facts['outerDimensions'] }
      : undefined;
  assert.ok(source !== undefined, 'Broad fixture requires independent AABB facts.');
  const min = factVector(source['min'], 'aabb.min');
  const max = factVector(source['max'], 'aabb.max');
  return {
    min,
    max,
    center: min.map((value, axis) => (value + max[axis]!) / 2),
    size: min.map((value, axis) => max[axis]! - value),
    tolerance: 0,
  };
};

const broadClaim = ({
  claimId,
  capability,
  kind,
  expected,
}: {
  claimId: string;
  capability: string;
  kind: string;
  expected: JsonValue;
}): BroadClaim => ({
  claimId,
  capability,
  payload: { expected, kind },
  polarity: 'positive',
  subjectSlots: ['subject'],
  workUnitBudget: 8_000_000,
});

const broadScalarClaim = ({
  fixtureId,
  suffix,
  capability,
  kind,
  value,
}: {
  fixtureId: string;
  suffix: string;
  capability: string;
  kind: string;
  value: number;
}): BroadClaim =>
  broadClaim({
    claimId: `broad.${fixtureId}.${suffix}`,
    capability,
    kind,
    expected: { tolerance: 0, value },
  });

/**
 * Map the generated broad manifest to the already-supported product profile.
 * @internal
 * @param fixtures - Hash-verified broad fixture receipt.
 * @param fixtureId - Selected generated fixture or request recipe.
 * @returns Exact subject plus claims derived from independent generator facts.
 */
export const planBroadWorkload = (fixtures: VerifiedBroadFixtures, fixtureId: string): BroadWorkloadPlan => {
  const fixture = fixtures.fixtures.find(({ id }) => id === fixtureId);
  assert.ok(fixture !== undefined, `Unknown broad fixture ${fixtureId}.`);
  if (fixture.recipe === undefined) {
    assert.notEqual(fixture.format, 'request-construction-json', `${fixtureId} has no verified recipe.`);
    const claims = [
      broadClaim({
        claimId: `broad.${fixture.id}.bounding-box`,
        capability: 'toHaveBoundingBox',
        kind: 'boundingBox',
        expected: broadBoundingBox(fixture.analyticFacts),
      }),
    ];
    const surfaceArea =
      fixture.analyticFacts['surfaceArea'] ??
      fixture.analyticFacts['nominalSurfaceArea'] ??
      fixture.analyticFacts['nominalMaterialSurfaceArea'];
    const volume =
      fixture.analyticFacts['volume'] ??
      fixture.analyticFacts['nominalVolume'] ??
      fixture.analyticFacts['nominalMaterialVolume'];
    if (surfaceArea !== undefined) {
      claims.push(
        broadScalarClaim({
          fixtureId: fixture.id,
          suffix: 'surface-area',
          capability: 'toHaveSurfaceArea',
          kind: 'surfaceArea',
          value: factNumber(surfaceArea, 'surfaceArea'),
        }),
      );
    }
    if (volume !== undefined) {
      claims.push(
        broadScalarClaim({
          fixtureId: fixture.id,
          suffix: 'volume',
          capability: 'toHaveVolume',
          kind: 'volume',
          value: factNumber(volume, 'volume'),
        }),
      );
    }
    if (fixture.format === 'step') {
      claims.unshift(
        broadClaim({
          claimId: `broad.${fixture.id}.valid-brep`,
          capability: 'toBeValidBrep',
          kind: 'validBrep',
          expected: {},
        }),
      );
    }
    return {
      fixture,
      subject: fixture,
      claims,
      authoredClaims: claims.length,
      unsupportedClaims: [],
      independentFacts: fixture.analyticFacts,
    };
  }
  const subject = fixtures.fixtures.find(({ id }) => id === fixture.recipe!.subject);
  assert.ok(
    subject !== undefined && subject.format !== 'request-construction-json',
    `${fixtureId} subject is missing.`,
  );
  const boundingBox = broadBoundingBox(subject.analyticFacts);
  const componentSurfaceArea = factNumber(subject.analyticFacts['componentSurfaceArea'], 'componentSurfaceArea');
  const componentCount =
    subject.analyticFacts['componentCount'] === undefined
      ? 1
      : factNumber(subject.analyticFacts['componentCount'], 'componentCount');
  const surfaceArea = componentSurfaceArea * componentCount;
  const claims = fixture.recipe.claims.map(({ claimId, query }) => {
    if (query.kind === 'bounds') {
      return broadClaim({ claimId, capability: 'toHaveBoundingBox', kind: 'boundingBox', expected: boundingBox });
    }
    if (query.kind === 'surface-area') {
      return broadClaim({
        claimId,
        capability: 'toHaveSurfaceArea',
        kind: 'surfaceArea',
        expected: { tolerance: 0, value: surfaceArea },
      });
    }
    assert.equal(query.kind, 'selected-overlap-pair', `Unsupported broad query kind ${query.kind}.`);
    assert.equal(query.left, 'claim-subject-a');
    assert.equal(query.right, 'claim-subject-b');
    assert.equal(componentCount, 2, 'The supported overlap workload has exactly the authored pair.');
    return {
      claimId,
      capability: 'analyzeMeshOverlap',
      payload: { tolerance: 0.001 },
      polarity: 'positive',
      subjectSlots: ['subject'],
      workUnitBudget: 8_000_000,
    } satisfies BroadClaim;
  });
  return {
    fixture,
    subject,
    claims,
    authoredClaims: fixture.recipe.claimCount,
    unsupportedClaims: [],
    independentFacts: { ...fixture.analyticFacts, subject: subject.analyticFacts },
    ...(fixture.recipe.claims.some(({ query }) => query.kind === 'selected-overlap-pair')
      ? {
          overlapOracle: {
            claimIds: fixture.recipe.claims
              .filter(({ query }) => query.kind === 'selected-overlap-pair')
              .map(({ claimId }) => claimId),
            leftLabel: 'claim-subject-a#0',
            rightLabel: 'claim-subject-b#0',
            volume: factNumber(subject.analyticFacts['overlapVolume'], 'overlapVolume'),
          },
        }
      : {}),
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

/** Completed evaluation is independent of the geometric verdict. @internal
 * @param results - Complete public results.
 * @param count - Authored claim count.
 * @returns Whether each authored claim completed with a geometric verdict.
 */
export const evaluationCompleted = (results: ReadonlyArray<{ status?: unknown }>, count: number): boolean =>
  results.length === count && count > 0 && results.every(({ status }) => status === 'passed' || status === 'failed');

/** Check independent two-box intersection facts. @internal
 * @param workload - Frozen claim intent and analytic oracle.
 * @param results - Settled public results.
 * @returns Whether every selected pair agrees with the independent oracle.
 */
export const overlapMatches = (
  workload: BroadWorkloadPlan,
  results: ReadonlyArray<Record<string, unknown>>,
): boolean => {
  if (workload.overlapOracle === undefined) {
    return true;
  }
  const oracle = workload.overlapOracle;
  return oracle.claimIds.every((claimId) => {
    const result = results.find((row) => row['claimId'] === claimId);
    const observation = result?.['evidence'];
    if (!isRecord(observation) || observation['success'] !== true || result?.['status'] !== 'passed') {
      return false;
    }
    const { evidence } = observation;
    if (!isRecord(evidence) || evidence['componentCount'] !== 2 || evidence['checkedPairs'] !== 1) {
      return false;
    }
    const { overlaps } = evidence;
    if (!Array.isArray(overlaps) || overlaps.length !== 1 || !isRecord(overlaps[0])) {
      return false;
    }
    const pair = overlaps[0];
    return (
      pair['leftLabel'] === oracle.leftLabel &&
      pair['rightLabel'] === oracle.rightLabel &&
      pair['intersectionVolume'] === oracle.volume
    );
  });
};

/** Compare complete ordered same-profile reports, retaining false verdicts. @internal
 * @param left - First complete public suite.
 * @param right - Second complete public suite.
 * @returns Exact equality of every report and canonical byte record.
 */
export const compareProductReports = (left: unknown, right: unknown): boolean =>
  Array.isArray(left) && left.length > 0 && isDeepStrictEqual(left, right);

/** Complete installed public assertion report. @internal */
export type PublicConsumerReport = {
  status: string;
  claimId: string;
  canonicalClaim: Uint8Array<ArrayBuffer>;
  canonicalPlan: Uint8Array<ArrayBuffer>;
  canonicalResult: Uint8Array<ArrayBuffer>;
  result: { status: string; evidence?: unknown; diagnostics?: unknown };
};

/** Retain exact public bytes. @internal
 * @param bytes - Installed public canonical bytes.
 * @returns Length, digest and unmodified UTF-8.
 */
export const byteRecord = (bytes: Uint8Array<ArrayBuffer>): { byteLength: number; sha256: string; utf8: string } => {
  const value = Buffer.from(bytes);
  return { byteLength: value.byteLength, sha256: sha256(value), utf8: value.toString() };
};

/** Retain the complete canonical claim, plan and result. @internal
 * @param report - Settled public report.
 * @returns Complete report receipt.
 */
export const consumerReportRecord = (report: PublicConsumerReport): Record<string, unknown> => ({
  claimId: report.claimId,
  status: report.status,
  resultStatus: report.result.status,
  canonicalClaim: byteRecord(report.canonicalClaim),
  canonicalPlan: byteRecord(report.canonicalPlan),
  canonicalResult: byteRecord(report.canonicalResult),
  result: report.result,
});

/** Independent dimensions of benchmark qualification. @internal */
export type ProductQualification = {
  evaluationCompleted: boolean;
  geometricVerdicts: Record<string, number>;
  expectedMatches: boolean | WireNull;
  outputIdentity: string;
  overlapVerified: boolean;
};

/** Qualify a complete public suite against retained expectations and independent facts. @internal
 * @param options - Route profile, ordered reports and preflighted claim intent.
 * @returns Separate evaluation, expected-output and analytic-oracle decisions.
 */
export const qualifyProductReports = ({
  route,
  workload,
  suiteReports,
  prepared,
}: {
  route: InstalledProductRoute;
  workload: string;
  suiteReports: Array<Record<string, unknown>> | WireNull;
  prepared?: BroadWorkloadPlan;
}): ProductQualification => {
  const reports = suiteReports ?? [];
  const results =
    route.backend === 'legacy' ? reports : reports.map((record) => record['result'] as Record<string, unknown>);
  const expected = route.expectedResults?.[workload];
  const outputIdentity =
    route.backend === 'legacy'
      ? sha256(JSON.stringify(results))
      : sha256(reports.map((record) => JSON.stringify(record['canonicalResult'])).join('\n'));
  const statusCounts = Object.fromEntries(
    [...new Set(results.map((row) => String(row['status'])))].map((status) => [
      status,
      results.filter((row) => row['status'] === status).length,
    ]),
  );
  const completed = evaluationCompleted(results, prepared?.authoredClaims ?? 1);
  const expectedMatches =
    expected === undefined
      ? null
      : expected.outputIdentity === outputIdentity && isDeepStrictEqual(expected.statusCounts, statusCounts);
  const overlapVerified = prepared === undefined || overlapMatches(prepared, results);
  return {
    evaluationCompleted: completed,
    geometricVerdicts: statusCounts,
    expectedMatches,
    outputIdentity,
    overlapVerified,
  };
};

/** Installed product binding methods exercised by the benchmark. @internal */
export type ProductEngine = {
  observations?: () => Uint8Array<ArrayBuffer>;
  processRequest: (input: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  ingestMesh: (request: Uint8Array<ArrayBuffer>, mesh: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  ingestSubject: (
    request: Uint8Array<ArrayBuffer>,
    primary: Uint8Array<ArrayBuffer>,
    resources: ReadonlyArray<Uint8Array<ArrayBuffer>>,
  ) => Uint8Array<ArrayBuffer>;
  subjectHandle: (input: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  canonicalPlan: (input: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  evaluatePlan: (input: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  /** One-call claim evaluation; products before it evaluate through canonicalPlan and evaluatePlan. */
  evaluateClaim?: (input: Uint8Array<ArrayBuffer>) => ProductClaimEvaluation;
  releaseSubject: (input: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  close?: () => void;
  flushCache?: () => Uint8Array<ArrayBuffer>;
  cacheProducerIdentity?: () => Uint8Array<ArrayBuffer>;
};

/** Canonical plan, claim and result bytes of one `evaluateClaim` call. @internal */
export type ProductClaimEvaluation = {
  canonicalPlan: Uint8Array<ArrayBuffer>;
  canonicalClaim: Uint8Array<ArrayBuffer>;
  canonicalResult: Uint8Array<ArrayBuffer>;
};

/** Installed binding module surface, without a build-time native import. @internal */
export type ProductBinding = {
  Engine: { prototype: ProductEngine; new (options?: ProductCacheOptions): ProductEngine };
  canonicalize: (input: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  initialize?: () => Promise<void>;
};

/** Installed runner-independent assertion client. @internal */
export type PublicAssertionClient = {
  expectGeo: (subject: Record<string, string>) => Record<string, unknown> & { not: Record<string, unknown> };
  query: (options: {
    capability: string;
    claimId: string;
    payload: unknown;
    subject: Record<string, string>;
  }) => Promise<PublicConsumerReport>;
};

/** Installed assertion factory without importing a native artifact at build time. @internal */
export type AssertionClientModule = {
  createGeoSpecAssertionClient: (options: {
    engine: Pick<ProductEngine, 'processRequest' | 'canonicalPlan' | 'evaluatePlan' | 'evaluateClaim'>;
    canonicalize: ProductBinding['canonicalize'];
    claimId: () => string;
    subjectSlot: string;
    workUnitLimit: number;
  }) => PublicAssertionClient;
};

/** Public Vitest adapter result surface used by the real matcher bridge. @internal */
export type ProductVitestModule = {
  createGeoSpecVitestAdapter: (client: PublicAssertionClient) => {
    matchers: Record<
      string,
      (
        this: unknown,
        received: unknown,
        ...arguments_: unknown[]
      ) => Promise<{ actual: PublicConsumerReport; pass: boolean; message: () => string }>
    >;
    flush: () => Promise<void>;
  };
};

/** Exact bounded diagnostics outside the canonical result envelope. @internal */
export type EngineObservation = {
  schema: string;
  numericProfile: string;
  exact: boolean;
  scope: string;
  logical: Record<string, string>;
  physical: Record<string, string>;
  copies: Record<string, string>;
  unavailable: string[];
};

/** Read an available non-mutating engine snapshot; historical bindings remain unknown.
 * @internal
 * @param engine - Actual selected installed engine.
 * @returns Its observation, or null when unavailable.
 */
export const readEngineObservation = (engine: ProductEngine): EngineObservation | WireNull =>
  engine.observations ? (JSON.parse(new TextDecoder().decode(engine.observations())) as EngineObservation) : null;

/** Compute exact measured deltas after excluding prefill, never from a configured limit.
 * @internal
 * @param before - Warm baseline; null means a new engine's zero state.
 * @param after - Snapshot after the timed report and before cleanup.
 * @returns Complete observation attribution with unknown usage retained as null.
 */
export const observationWork = (
  before: EngineObservation | WireNull,
  after: EngineObservation | WireNull,
): Record<string, unknown> => {
  const unavailable = {
    engineReportedConsumedWorkUnits: null,
    observationStart: before,
    observationEnd: after,
    observations: null,
  };
  if (
    !after ||
    !after.exact ||
    after.schema !== 'geospec-engine-observations-v1' ||
    (before &&
      (!before.exact ||
        before.schema !== after.schema ||
        before.numericProfile !== after.numericProfile ||
        before.scope !== after.scope))
  ) {
    return unavailable;
  }
  const observation: EngineObservation = { ...after, logical: {}, physical: {}, copies: {} };
  for (const section of ['logical', 'physical', 'copies'] as const) {
    if (
      before &&
      JSON.stringify(Object.keys(before[section]).sort()) !== JSON.stringify(Object.keys(after[section]).sort())
    ) {
      return unavailable;
    }
    for (const [key, value] of Object.entries(after[section])) {
      const start = before?.[section][key] ?? '0';
      if (!/^(0|[1-9]\d*)$/.test(value) || !/^(0|[1-9]\d*)$/.test(start)) {
        return unavailable;
      }
      const delta = BigInt(value) - BigInt(start);
      if (delta < 0n) {
        return unavailable;
      }
      observation[section][key] = delta.toString();
    }
  }
  return {
    engineReportedConsumedWorkUnits: observation.logical['chargedUnits'] ?? null,
    observationStart: before,
    observationEnd: after,
    observations: observation,
  };
};

/** Sum compatible measured member observations, preserving every original member.
 * @internal
 * @param members - Ordered independent member work records.
 * @returns Their exact compatible sum, or unknown when any observation is missing.
 */
export const aggregateObservationWork = (
  members: Array<Record<string, unknown> | undefined>,
): Record<string, unknown> => {
  const unavailable = { members, engineReportedConsumedWorkUnits: null, observations: null };
  if (members.length === 0) {
    return unavailable;
  }
  const observations = members.map((member) => member?.['observations'] as EngineObservation | WireNull | undefined);
  const first = observations[0];
  if (first?.schema !== 'geospec-engine-observations-v1') {
    return unavailable;
  }
  const total: EngineObservation = { ...first, logical: {}, physical: {}, copies: {}, unavailable: [] };
  for (const observation of observations) {
    if (
      !observation ||
      !observation.exact ||
      observation.schema !== first.schema ||
      observation.numericProfile !== first.numericProfile ||
      observation.scope !== first.scope
    ) {
      return unavailable;
    }
    for (const section of ['logical', 'physical', 'copies'] as const) {
      if (
        JSON.stringify(Object.keys(first[section]).sort()) !== JSON.stringify(Object.keys(observation[section]).sort())
      ) {
        return unavailable;
      }
      for (const [key, value] of Object.entries(observation[section])) {
        if (!/^(0|[1-9]\d*)$/.test(value)) {
          return unavailable;
        }
        total[section][key] = (BigInt(total[section][key] ?? '0') + BigInt(value)).toString();
      }
    }
    total.unavailable = [...new Set([...total.unavailable, ...observation.unavailable])];
  }
  return { members, engineReportedConsumedWorkUnits: total.logical['chargedUnits'] ?? null, observations: total };
};
