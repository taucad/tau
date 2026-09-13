// eslint-disable-next-line import-x/no-extraneous-dependencies -- The browser fixture resolves this import from the explicit clean consumer.
import { Engine, canonicalize, initialize } from '@taucad/geospec-engine-native';
import { createGeoSpecAssertionClient, GeoSpecAssertionError } from 'geospec/assertion-client';
import type {
  GeoSpecAssertionClient,
  GeoSpecCanonicalClaimReport,
  GeoSpecNativeEngine,
  GeoSpecQueryCapability,
} from 'geospec/assertion-client';

/* oxlint-disable typescript/no-restricted-types -- These frozen JSON wire record types preserve explicit null separately from missing fields. */
type ByteArray = Uint8Array<ArrayBuffer>;

type Asset = {
  byteLength: number;
  sha256: string;
  source: string;
  url: string;
};

type ExpectedBytes = {
  canonicalClaimUtf8: string;
  canonicalPlanUtf8: string;
  canonicalResultUtf8: string;
};

type IndependentBytes = { canonicalPlanUtf8: string; canonicalResultUtf8?: string };

type IndependentComparison = Record<keyof IndependentBytes, boolean | null>;

type Invocation = {
  arguments: unknown[];
  capability: string;
  claimId: string;
  payload: unknown;
  polarity: 'negative' | 'positive';
  subjectSlot: string;
  workUnitBudget: number;
};

type BrowserRow = {
  authoredRequestUtf8: string;
  cohort: string;
  expected: {
    admissionUtf8: string;
    bytes: ExpectedBytes;
    error: null | { message: string; name: string };
    independent: null | IndependentBytes;
    status: string;
  };
  id: string;
  ingest: { primary: Asset; requestUtf8: string; resources: Asset[] };
  invocation: Invocation;
  subjectHash: string;
  warmup?: { expectedStatus: 'failed' | 'passed'; invocation: Invocation };
};

type Metadata = {
  authorities: Array<{ path: string; sha256: string }>;
  expectedRowCount?: number;
  rows: BrowserRow[];
  schemaVersion: number;
};

type ByteRecord = {
  byteLength: number;
  sha256: string;
  utf8: string;
};

type ByteComparison = {
  actual: ByteRecord;
  equal: boolean;
  expected: ByteRecord;
};

type ErrorRecord = {
  assertionError: boolean;
  constructorName: string | null;
  message: string;
  name: string;
  stack: string | null;
};

type RecorderCall = {
  error?: ErrorRecord;
  inputUtf8: string;
  operation: 'canonicalPlan' | 'evaluatePlan' | 'processRequest';
  outputUtf8?: string;
};

type CellResult = {
  admission?: ByteComparison;
  cleanup?: {
    closeCalled: boolean;
    handleResponse?: ByteRecord;
    releaseResponse?: ByteRecord;
    released: boolean;
  };
  cohort: string;
  comparison?: {
    directFrozen: Record<keyof ExpectedBytes, boolean>;
    errorClass: boolean;
    independent: null | IndependentComparison;
    publicDirect: Record<keyof ExpectedBytes, boolean>;
    publicFrozen: Record<keyof ExpectedBytes, boolean>;
    status: boolean;
  };
  direct?: ExpectedBytes & { diagnostics: unknown[]; status: string };
  id: string;
  passed: boolean;
  public?: ExpectedBytes & { calls: RecorderCall[]; diagnostics: unknown[]; error: ErrorRecord | null; status: string };
  runtimeFailure?: ErrorRecord & { phase: string };
  warmup?: { direct?: WarmupResult; public?: WarmupResult };
};

type WarmupResult = {
  calls: RecorderCall[];
  error: ErrorRecord | null;
  invocation: Invocation;
  report?: ExpectedBytes & { diagnostics: unknown[]; status: string };
  succeeded: boolean;
};

type Completion = { report: unknown } | { error: string };

/* oxlint-enable typescript/no-restricted-types */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const byteKeys = ['canonicalClaimUtf8', 'canonicalPlanUtf8', 'canonicalResultUtf8'] as const;
const queryCapabilities = new Set<GeoSpecQueryCapability>([
  'analyzeMesh',
  'analyzeBrep',
  'inspectGeometry',
  'analyzeMeshOverlap',
]);

const sha256 = async (bytes: ByteArray): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const byteRecord = async (bytes: ByteArray): Promise<ByteRecord> => ({
  byteLength: bytes.byteLength,
  sha256: await sha256(bytes),
  utf8: decoder.decode(bytes),
});

const compareBytes = async (actual: ByteArray, expectedUtf8: string): Promise<ByteComparison> => {
  const expected = encoder.encode(expectedUtf8);
  return {
    actual: await byteRecord(actual),
    equal: actual.byteLength === expected.byteLength && actual.every((byte, index) => byte === expected[index]),
    expected: await byteRecord(expected),
  };
};

const errorRecord = (error: unknown): ErrorRecord => ({
  assertionError: error instanceof GeoSpecAssertionError,
  constructorName:
    typeof error === 'object' && error !== null && typeof error.constructor.name === 'string'
      ? error.constructor.name
      : null,
  message: error instanceof Error ? error.message : String(error),
  name: error instanceof Error ? error.name : typeof error,
  stack: error instanceof Error ? (error.stack ?? null) : null,
});

const jsonRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`M2 ${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const firstResult = (canonicalResultUtf8: string): { diagnostics: unknown[]; status: string } => {
  const envelope = jsonRecord(JSON.parse(canonicalResultUtf8) as unknown, 'result envelope');
  const { results } = envelope;
  if (!Array.isArray(results) || results.length !== 1) {
    throw new TypeError('M2 result envelope must contain exactly one result.');
  }
  const result = jsonRecord(results[0], 'claim result');
  // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
  if (typeof result['status'] !== 'string' || !Array.isArray(result['diagnostics'])) {
    throw new TypeError('M2 claim result is missing status or diagnostics.');
  }
  // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
  return { diagnostics: result['diagnostics'], status: result['status'] };
};

const canonicalClaim = (canonicalPlanUtf8: string): ByteArray => {
  const envelope = jsonRecord(JSON.parse(canonicalPlanUtf8) as unknown, 'plan envelope');
  // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
  const plan = jsonRecord(envelope['plan'], 'plan');
  // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
  if (!Array.isArray(plan['claims']) || plan['claims'].length !== 1) {
    throw new TypeError('M2 canonical plan must contain exactly one claim.');
  }
  // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
  return Uint8Array.from(canonicalize(encoder.encode(JSON.stringify(plan['claims'][0]))));
};

const readAsset = async (asset: Asset): Promise<ByteArray> => {
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Unable to read M2 binary asset ${asset.url}: ${response.status}.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== asset.byteLength || (await sha256(bytes)) !== asset.sha256) {
    throw new Error(`M2 binary asset changed: ${asset.url}.`);
  }
  return bytes;
};

const recorder = (engine: Engine): { calls: RecorderCall[]; engine: GeoSpecNativeEngine } => {
  const calls: RecorderCall[] = [];
  const forward = (operation: RecorderCall['operation'], input: ByteArray, invoke: () => ByteArray): ByteArray => {
    const call: RecorderCall = { inputUtf8: decoder.decode(input), operation };
    calls.push(call);
    try {
      const output = invoke();
      call.outputUtf8 = decoder.decode(output);
      return output;
    } catch (error) {
      call.error = errorRecord(error);
      throw error;
    }
  };
  return {
    calls,
    engine: {
      canonicalPlan: (input: ByteArray) => forward('canonicalPlan', input, () => engine.canonicalPlan(input)),
      evaluatePlan: (input: ByteArray) => forward('evaluatePlan', input, () => engine.evaluatePlan(input)),
      processRequest: (input: ByteArray) => forward('processRequest', input, () => engine.processRequest(input)),
    },
  };
};

const invokePublic = async (
  client: GeoSpecAssertionClient,
  subject: { subjectHash: string },
  invocation: Invocation,
): Promise<GeoSpecCanonicalClaimReport> => {
  if (queryCapabilities.has(invocation.capability as GeoSpecQueryCapability)) {
    return client.query({
      capability: invocation.capability as GeoSpecQueryCapability,
      claimId: invocation.claimId,
      payload: invocation.payload,
      subject,
    });
  }
  const chain = invocation.polarity === 'negative' ? client.expectGeo(subject).not : client.expectGeo(subject);
  const method: unknown = Reflect.get(chain, invocation.capability);
  if (typeof method !== 'function') {
    throw new TypeError(`Installed GeoSpec assertion client has no ${invocation.capability} matcher.`);
  }
  return (await Reflect.apply(method, chain, invocation.arguments)) as GeoSpecCanonicalClaimReport;
};

const exactMap = (actual: ExpectedBytes, expected: ExpectedBytes): Record<keyof ExpectedBytes, boolean> => ({
  canonicalClaimUtf8: actual.canonicalClaimUtf8 === expected.canonicalClaimUtf8,
  canonicalPlanUtf8: actual.canonicalPlanUtf8 === expected.canonicalPlanUtf8,
  canonicalResultUtf8: actual.canonicalResultUtf8 === expected.canonicalResultUtf8,
});

const allExact = (comparison: Record<keyof ExpectedBytes, boolean>): boolean =>
  byteKeys.every((key) => comparison[key]);

const independentMap = (actual: ExpectedBytes, expected: IndependentBytes): IndependentComparison => ({
  canonicalPlanUtf8: actual.canonicalPlanUtf8 === expected.canonicalPlanUtf8,
  canonicalResultUtf8:
    expected.canonicalResultUtf8 === undefined ? null : actual.canonicalResultUtf8 === expected.canonicalResultUtf8,
});

const allIndependent = (comparison: IndependentComparison): boolean =>
  comparison.canonicalPlanUtf8 === true && comparison.canonicalResultUtf8 !== false;

const runWarmup = async (
  engine: Engine,
  subject: { subjectHash: string },
  setup: NonNullable<BrowserRow['warmup']>,
): Promise<WarmupResult> => {
  const forwarding = recorder(engine);
  const result: WarmupResult = {
    calls: forwarding.calls,
    error: null,
    invocation: setup.invocation,
    succeeded: false,
  };
  try {
    const client = createGeoSpecAssertionClient({
      canonicalize,
      claimId: () => setup.invocation.claimId,
      engine: forwarding.engine,
      subjectSlot: setup.invocation.subjectSlot,
      workUnitLimit: setup.invocation.workUnitBudget,
    });
    let report: GeoSpecCanonicalClaimReport;
    try {
      report = await invokePublic(client, subject, setup.invocation);
    } catch (error) {
      result.error = errorRecord(error);
      if (!(error instanceof GeoSpecAssertionError)) {
        return result;
      }
      report = error.report;
    }
    result.report = {
      canonicalClaimUtf8: decoder.decode(report.canonicalClaim),
      canonicalPlanUtf8: decoder.decode(report.canonicalPlan),
      canonicalResultUtf8: decoder.decode(report.canonicalResult),
      diagnostics: [...report.diagnostics],
      status: report.status,
    };
    // A conclusive negative assertion can fail while its setup computation succeeds.
    result.succeeded =
      report.status === setup.expectedStatus &&
      firstResult(result.report.canonicalResultUtf8).status === setup.expectedStatus &&
      ((setup.expectedStatus === 'passed' && result.error === null) ||
        (setup.expectedStatus === 'failed' && result.error?.assertionError === true));
  } catch (error) {
    result.error = errorRecord(error);
  }
  return result;
};

const runCell = async (row: BrowserRow): Promise<CellResult> => {
  const { registryVersion } = jsonRecord(JSON.parse(row.ingest.requestUtf8) as unknown, 'ingest request');
  const cell: CellResult = { cohort: row.cohort, id: row.id, passed: false };
  let engine: Engine | undefined;
  let handle: unknown;
  let phase = 'engine-construction';
  try {
    engine = new Engine();
    phase = 'binary-fetch';
    const [primary, ...resources] = await Promise.all([
      readAsset(row.ingest.primary),
      ...row.ingest.resources.map(readAsset),
    ]);
    phase = 'admission';
    const admissionBytes = Uint8Array.from(
      engine.ingestSubject(encoder.encode(row.ingest.requestUtf8), primary, resources),
    );
    cell.admission = await compareBytes(admissionBytes, row.expected.admissionUtf8);
    const admission = jsonRecord(JSON.parse(decoder.decode(admissionBytes)) as unknown, 'admission response');
    // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
    const admissionResult = jsonRecord(admission['result'], 'admission result');
    // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
    const admittedSubject = jsonRecord(admissionResult['subject'], 'admitted subject');
    // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
    if (admittedSubject['subjectHash'] !== row['subjectHash']) {
      throw new Error(`M2 admission returned the wrong subject hash for ${row.id}.`);
    }
    phase = 'subject-handle';
    const handleResponse = Uint8Array.from(
      engine.subjectHandle(
        encoder.encode(
          JSON.stringify({
            canonicalProfile: 'geospec-jcs-v1',
            method: 'subjectHandle',
            protocolVersion: 3,
            registryVersion,
            requestId: `handle:${row.id}`,
            subjectHash: row.subjectHash,
          }),
        ),
      ),
    );
    const handleEnvelope = jsonRecord(JSON.parse(decoder.decode(handleResponse)) as unknown, 'handle response');
    // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
    handle = jsonRecord(handleEnvelope['result'], 'handle result')['subjectHandle'];
    cell.cleanup = { closeCalled: false, handleResponse: await byteRecord(handleResponse), released: false };

    if (row.warmup !== undefined) {
      phase = 'warmup-direct';
      cell.warmup = { direct: await runWarmup(engine, { subjectHash: row.subjectHash }, row.warmup) };
      if (!cell.warmup.direct?.succeeded) {
        throw new Error(`M2 direct warmup did not succeed for ${row.id}.`);
      }
    }
    phase = 'direct';
    const canonicalPlanBytes = Uint8Array.from(engine.canonicalPlan(encoder.encode(row.authoredRequestUtf8)));
    const directBytes: ExpectedBytes = {
      canonicalClaimUtf8: decoder.decode(canonicalClaim(decoder.decode(canonicalPlanBytes))),
      canonicalPlanUtf8: decoder.decode(canonicalPlanBytes),
      canonicalResultUtf8: decoder.decode(engine.evaluatePlan(canonicalPlanBytes)),
    };
    const directResult = firstResult(directBytes.canonicalResultUtf8);
    cell.direct = { ...directBytes, ...directResult };

    if (row.warmup !== undefined) {
      phase = 'warmup-public';
      const warmup = await runWarmup(engine, { subjectHash: row.subjectHash }, row.warmup);
      cell.warmup = { ...cell.warmup, public: warmup };
      if (!warmup.succeeded) {
        throw new Error(`M2 public warmup did not succeed for ${row.id}.`);
      }
    }
    phase = 'public';
    const forwarding = recorder(engine);
    const client = createGeoSpecAssertionClient({
      canonicalize,
      claimId: () => row.invocation.claimId,
      engine: forwarding.engine,
      subjectSlot: row.invocation.subjectSlot,
      workUnitLimit: row.invocation.workUnitBudget,
    });
    let publicReport: GeoSpecCanonicalClaimReport | undefined;
    // oxlint-disable-next-line typescript/no-restricted-types -- Frozen report JSON distinguishes no error with explicit null.
    let publicError: ErrorRecord | null = null;
    try {
      publicReport = await invokePublic(client, { subjectHash: row.subjectHash }, row.invocation);
    } catch (error) {
      publicError = errorRecord(error);
      if (error instanceof GeoSpecAssertionError) {
        publicReport = error.report;
      }
    }
    if (publicReport === undefined) {
      throw new Error(`M2 public assertion returned no report for ${row.id}.`);
    }
    const publicBytes: ExpectedBytes = {
      canonicalClaimUtf8: decoder.decode(publicReport.canonicalClaim),
      canonicalPlanUtf8: decoder.decode(publicReport.canonicalPlan),
      canonicalResultUtf8: decoder.decode(publicReport.canonicalResult),
    };
    cell.public = {
      ...publicBytes,
      calls: forwarding.calls,
      diagnostics: [...publicReport.diagnostics],
      error: publicError,
      status: publicReport.status,
    };
    const directFrozen = exactMap(directBytes, row.expected.bytes);
    const publicFrozen = exactMap(publicBytes, row.expected.bytes);
    const publicDirect = exactMap(publicBytes, directBytes);
    const independent =
      row.expected.independent === null ? null : independentMap(directBytes, row.expected.independent);
    const errorClass =
      row.expected.error === null
        ? publicError === null
        : publicError?.name === row.expected.error.name && publicError.assertionError;
    cell.comparison = {
      directFrozen,
      errorClass,
      independent,
      publicDirect,
      publicFrozen,
      status: directResult.status === row.expected.status && publicReport.status === row.expected.status,
    };
    cell.passed =
      cell.admission.equal &&
      allExact(directFrozen) &&
      allExact(publicFrozen) &&
      allExact(publicDirect) &&
      (independent === null || allIndependent(independent)) &&
      cell.comparison.status &&
      errorClass;
  } catch (error) {
    cell.runtimeFailure = { ...errorRecord(error), phase };
  } finally {
    const cleanup = cell.cleanup ?? { closeCalled: false, released: false };
    if (handle !== undefined && engine !== undefined) {
      try {
        const releaseResponse = Uint8Array.from(
          engine.releaseSubject(
            encoder.encode(
              JSON.stringify({
                canonicalProfile: 'geospec-jcs-v1',
                method: 'releaseSubject',
                protocolVersion: 3,
                registryVersion,
                requestId: `release:${row.id}`,
                subjectHandle: handle,
              }),
            ),
          ),
        );
        cleanup.releaseResponse = await byteRecord(releaseResponse);
        const release = jsonRecord(JSON.parse(decoder.decode(releaseResponse)) as unknown, 'release response');
        // oxlint-disable-next-line dot-notation -- TypeScript requires bracket access to unknown JSON index-signature fields.
        cleanup['released'] = jsonRecord(release['result'], 'release result')['released'] === true;
      } catch (error) {
        cell.runtimeFailure ??= { ...errorRecord(error), phase: 'release' };
        cell.passed = false;
      }
    }
    if (engine !== undefined) {
      try {
        engine.close();
        cleanup.closeCalled = true;
      } catch (error) {
        cell.runtimeFailure ??= { ...errorRecord(error), phase: 'close' };
        cell.passed = false;
      }
    }
    cell.cleanup = cleanup;
    cell.passed &&= cleanup.released;
  }
  return cell;
};

const readMetadata = async (): Promise<Metadata> => {
  const response = await fetch('/m2-inputs.json');
  if (!response.ok) {
    throw new Error(`Unable to read M2 metadata: ${response.status}.`);
  }
  const metadata = (await response.json()) as Metadata;
  const expectedRowCount = metadata.expectedRowCount ?? 30;
  if (
    metadata.schemaVersion !== 1 ||
    !Number.isSafeInteger(expectedRowCount) ||
    expectedRowCount <= 0 ||
    metadata.rows.length !== expectedRowCount
  ) {
    throw new Error('Browser metadata must contain its declared positive version-1 row count.');
  }
  return metadata;
};

const failedCells = (metadata: Metadata, phase: string, error: unknown): CellResult[] =>
  metadata.rows.map((row) => ({
    cohort: row.cohort,
    id: row.id,
    passed: false,
    runtimeFailure: { ...errorRecord(error), phase },
  }));

const run = async () => {
  const metadata = await readMetadata();
  try {
    await initialize();
  } catch (error) {
    const rows = failedCells(metadata, 'initialize', error);
    return {
      authorities: metadata.authorities,
      failed: rows.length,
      host: 'browser-packed-mixed-wasm-m2',
      passed: 0,
      rows,
      schemaVersion: 1,
      total: rows.length,
      userAgent: navigator.userAgent,
      wasmAsset: { error: errorRecord(error).message, sha256: null, url: null },
    };
  }
  const rows: CellResult[] = [];
  for (const row of metadata.rows) {
    // oxlint-disable-next-line no-await-in-loop -- The ST engine corpus is evaluated and cleaned up one cell at a time.
    rows.push(await runCell(row));
  }
  const wasmUrl = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .find((url) => url.includes('geospec_engine_native.wasm'));
  // oxlint-disable-next-line typescript/no-restricted-types -- Captured artifact JSON retains explicit null for unavailable identity.
  let wasmAsset: { error?: string; sha256: string | null; url: string | null };
  try {
    if (wasmUrl === undefined) {
      throw new Error('The packed public root did not load its mixed-WASM asset.');
    }
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Unable to re-read loaded mixed-WASM asset: ${response.status}.`);
    }
    wasmAsset = { sha256: await sha256(new Uint8Array(await response.arrayBuffer())), url: wasmUrl };
  } catch (error) {
    wasmAsset = { error: errorRecord(error).message, sha256: null, url: wasmUrl ?? null };
  }
  const failures = rows.filter((row) => !row.passed);
  return {
    authorities: metadata.authorities,
    failed: failures.length,
    host: 'browser-packed-mixed-wasm-m2',
    passed: rows.length - failures.length,
    rows,
    schemaVersion: 1,
    total: rows.length,
    userAgent: navigator.userAgent,
    wasmAsset,
  };
};

const status = document.querySelector<HTMLOutputElement>('#status');
if (status === null) {
  throw new Error('Fixture status element is missing.');
}
const completionTarget = globalThis as typeof globalThis & { __geospecConformance?: Completion };
try {
  completionTarget.__geospecConformance = { report: await run() };
  status.textContent = 'complete';
} catch (error) {
  completionTarget.__geospecConformance = {
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
  };
  status.textContent = 'failed';
}
