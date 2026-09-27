import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createGeoSpecAssertionClient, GeoSpecAssertionError } from '@taucad/geospec/assertion-client';
import { Engine, ProtocolError, canonicalize } from '@taucad/geospec-engine-native/node';

/**
 * Persisted input shapes consumed by this harness. The dispatcher verifies the
 * frozen JSON hashes before invocation; these types describe that boundary,
 * including inline buffers and deliberately malformed claim payloads. They do
 * not validate geometry or change the retained JSON.
 * @typedef {import('../../../geospec/src/engine/client.js').GeoSpecCanonicalClaimReport} NativeReport
 * @typedef {NativeReport['result'][string]} JsonValue
 * @typedef {import('../../../geospec/src/engine/matchers.js').GeoSpecMatcherName} MatcherName
 * @typedef {Uint8Array<ArrayBuffer>} HostBytes
 * @typedef {{byteLength: number, sha256: string, utf8: string}} ByteRecord
 * @typedef {{path?: string, name?: string, byteLength?: number, bytes?: number, sha256: string, utf8?: string, hex?: string}} Fixture
 * @typedef {{primaryBuffer: Fixture, resourceBuffers: Fixture[]}} BinaryCall
 * @typedef {{subjectContentHash: string, semanticDescriptorUtf8?: string, descriptorUtf8?: string, ingestTransport: BinaryCall & {requestUtf8: string}}} SourceSubject
 * @typedef {{id: string, family?: string, subjectId?: string, subject?: SourceSubject, a3?: {binaryAdmission: {primary: Fixture, resources: Fixture[]}}, ingestRequestJson?: string, canonicalPlanUtf8: string, authoredRequestJson?: string, authoredRequestUtf8?: string, evaluatePlanResultUtf8?: string | null, expectedAdmission?: string, expectedOperationDisposition?: string, protocolError?: {code: string, message: string}}} SourceRow
 * @typedef {{id: string, subjectContentHash: string, ingestRequestUtf8: string, binaryCall: BinaryCall, semanticDescriptorUtf8: string}} WallSubject
 * @typedef {{rows: SourceRow[], subjects: WallSubject[]}} JoinedInput
 * @typedef {Record<string, JsonValue> & {capability: string, claimId: string, payload: {arguments?: JsonValue[], expected: JsonValue, kind: string}, polarity: NativeReport['polarity'], subjectSlots: [string], workUnitBudget: number}} FrozenClaim
 * @typedef {{plan: {claims: [FrozenClaim], subjects: [import('../../../geospec/src/engine/client.js').GeoSpecNativeSubject]}}} PlanEnvelope
 * @typedef {{id: string, error?: {name: string, code: string, message: string}, canonicalPlanUtf8?: string, evaluatePlanResultUtf8?: string}} DirectActual
 * @typedef {{id: string, block: string, family: string, capability: string, polarity: NativeReport['polarity'], matcher: boolean, expectedShape: string, workUnitBudget: number, claimId: string, subjectSlot: string, admittedSubjectIdentity: {field: 'contentHash' | 'subjectHash', value: string}, subject: ReturnType<typeof subjectTransport> & {expectedIdentity: {field: 'contentHash' | 'subjectHash', value: string}}, authoring: {argumentDerivation: string, argumentsProtocolJson: JsonValue[], regexes: ReturnType<typeof regexLocations>, javascript: {import: string, chain: string, matcher: string}, python: {import: string, chain: string, matcher: string}}, expected: {admission: string | null, operationDisposition: string | null, canonicalClaim: ByteRecord, canonicalPlan: ByteRecord, canonicalResult: ByteRecord | null, protocolError: SourceRow['protocolError'] | null}, frozenDirectB19: DirectActual | null, limitations: string[], frozenSourceRow: SourceRow}} AuthoredRow
 * @typedef {ReturnType<typeof buildAuthoringMap>} AuthoringMap
 * @typedef {ReturnType<typeof errorRecord>} ErrorRecord
 * @typedef {ReturnType<typeof reportRecord>} RecordedReport
 * @typedef {ReturnType<typeof compareOutcome>} Comparison
 * @typedef {{id: string, route: string, routeState?: string, admission: ReturnType<typeof admitSubject> | null, authoring: AuthoredRow['authoring']['javascript'], argumentsProtocolJson: JsonValue[], error?: ErrorRecord | null, report: RecordedReport | null, comparison?: Comparison}} Outcome
 * @typedef {{operation: string, input: ByteRecord, output?: ByteRecord, plan?: ByteRecord, error?: ErrorRecord}} RecordedCall
 */

/** @type {(name: string) => string} */
const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

/** @type {(path: string) => unknown} */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
/** @type {(path: string) => DirectActual[]} */
const readJsonLines = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => /** @type {DirectActual} */ (JSON.parse(line)));

/** @type {(path: string, value: unknown) => void} @internal */
export const writeJson = (path, value) => {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

/** @type {(bytes: HostBytes) => string} */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The authored healing profile (GeoSpec native close-out ruling 1) admits a frozen report-v2 STEP subject under its
// authored-v5 descriptor: only these two strings change, and the subjectHash is the SHA-256 of the descriptor. The
// fixture closure's authored-v5-identity-amendment.json records every successor and its admission.
const AUTHORED_V5_PROFILES = [
  [
    '"backendProfile":"occt-8.1.0-dev1-3d097a-report-v2"',
    '"backendProfile":"occt-8.1.0-dev1-3d097a-report-authored-v5"',
  ],
  ['"ingestProfile":"geospec-step-xde-report-v2"', '"ingestProfile":"geospec-step-xde-report-authored-v5"'],
];
/** @type {(identity: string, descriptorUtf8: string | undefined) => string} */
const admittedIdentity = (identity, descriptorUtf8) => {
  if (
    descriptorUtf8 === undefined ||
    sha256(Buffer.from(descriptorUtf8)) !== identity ||
    !AUTHORED_V5_PROFILES.every(([from]) => descriptorUtf8.includes(from))
  ) {
    return identity;
  }
  let successor = descriptorUtf8;
  for (const [from, to] of AUTHORED_V5_PROFILES) {
    successor = successor.replace(from, to);
  }
  return sha256(Buffer.from(successor));
};
/** @type {(bytes: HostBytes) => ByteRecord} */
const utf8Record = (bytes) => {
  const value = Buffer.from(bytes);
  return { byteLength: value.byteLength, sha256: sha256(value), utf8: value.toString('utf8') };
};

/** @type {(claim: FrozenClaim) => ByteRecord} */
const canonicalClaimRecord = (claim) => utf8Record(canonicalize(Buffer.from(JSON.stringify(claim))));

/** @type {(capability: string) => string} */
const expectedShape = (capability) => {
  if (capability === 'toHaveBoundingBox') {
    return 'bounds';
  }
  if (capability === 'toBeWatertight') {
    return 'true';
  }
  if (
    capability === 'toHaveNoComponentInterference' ||
    capability === 'toHaveNoDiagnostics' ||
    capability === 'toBeValidBrep'
  ) {
    return 'first-or-empty';
  }
  return capability.startsWith('to') ? 'first' : 'ancillary';
};

/** @type {(value: JsonValue, path?: string, result?: {path: string, pattern: string, flags: string}[]) => {path: string, pattern: string, flags: string}[]} */
const regexLocations = (value, path = '$', result = []) => {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      regexLocations(entry, `${path}[${index}]`, result);
    }
  } else if (value && typeof value === 'object') {
    if (value['type'] === 'regexp' && typeof value['pattern'] === 'string' && typeof value['flags'] === 'string') {
      result.push({ path, pattern: value['pattern'], flags: value['flags'] });
    } else {
      for (const [key, entry] of Object.entries(value)) {
        regexLocations(entry, `${path}.${key}`, result);
      }
    }
  }
  return result;
};

/** @type {(canonicalPlanUtf8: string) => {claim: FrozenClaim, subject: PlanEnvelope['plan']['subjects'][0]}} */
const claimFromPlan = (canonicalPlanUtf8) => {
  const envelope = /** @type {PlanEnvelope} */ (JSON.parse(canonicalPlanUtf8));
  assert.equal(envelope.plan.claims.length, 1);
  return { claim: envelope.plan.claims[0], subject: envelope.plan.subjects[0] };
};

/** @type {(row: SourceRow, claim: FrozenClaim, authoredRequestUtf8: string) => {arguments: JsonValue[], derivation: string}} */
const exactArguments = (_row, claim, authoredRequestUtf8) => {
  const authoredClaim = /** @type {PlanEnvelope} */ (JSON.parse(authoredRequestUtf8)).plan.claims[0];
  const authoredArguments = /** @type {{payload?: FrozenClaim['payload']}} */ (authoredClaim).payload?.arguments;
  if (Array.isArray(authoredArguments)) {
    return { arguments: authoredArguments, derivation: 'exact-authored-arguments' };
  }
  if (claim.capability === 'toBeWatertight') {
    return { arguments: [], derivation: 'descriptor-true-nullary' };
  }
  if (!claim.capability.startsWith('to')) {
    return { arguments: [], derivation: 'ancillary-public-operation-required' };
  }
  return {
    arguments: [claim.payload.expected],
    derivation: 'descriptor-reverse-from-frozen-canonical-expected',
  };
};

/** @type {(row: SourceRow, block: string, wallSubjects: Map<string, WallSubject>) => {expectedContentHash: string, ingestRequestUtf8: string, primary: Fixture, resources: Fixture[], subjectDescriptorUtf8?: string}} */
const subjectTransport = (row, block, wallSubjects) => {
  if (block === 'wall-interim') {
    const subject = wallSubjects.get(/** @type {!string} */ (row.subjectId));
    assert.ok(subject, `Missing wall subject '${row.subjectId}'.`);
    return {
      expectedContentHash: subject.subjectContentHash,
      ingestRequestUtf8: subject.ingestRequestUtf8,
      primary: subject.binaryCall.primaryBuffer,
      resources: subject.binaryCall.resourceBuffers,
      subjectDescriptorUtf8: subject.semanticDescriptorUtf8,
    };
  }

  const transport = /** @type {!SourceSubject} */ (row.subject).ingestTransport;
  const preserved = row.a3?.binaryAdmission;
  return {
    expectedContentHash: /** @type {!SourceSubject} */ (row.subject).subjectContentHash,
    ingestRequestUtf8: row.ingestRequestJson ?? transport.requestUtf8,
    primary: preserved?.primary ?? transport.primaryBuffer,
    resources: preserved?.resources ?? transport.resourceBuffers,
    subjectDescriptorUtf8: /** @type {!SourceSubject} */ (row.subject).semanticDescriptorUtf8 ??
    /** @type {!SourceSubject} */ (row.subject).descriptorUtf8,
  };
};

/** @type {(row: SourceRow, block: string, directActual: Map<string, DirectActual>, wallSubjects: Map<string, WallSubject>) => AuthoredRow} */
// oxlint-disable-next-line max-params -- Preserve the frozen row and its three existing evidence contexts without changing the call interface.
const normalizeRow = (row, block, directActual, wallSubjects) => {
  const { canonicalPlanUtf8 } = row;
  const authoredRequestUtf8 = /** @type {!string} */ (row.authoredRequestJson ?? row.authoredRequestUtf8);
  const { claim, subject } = claimFromPlan(canonicalPlanUtf8);
  const matcher = claim.capability.startsWith('to');
  const authored = exactArguments(row, claim, authoredRequestUtf8);
  /** @type {'contentHash' | 'subjectHash'} */
  const identityField = subject.subjectHash === undefined ? 'contentHash' : 'subjectHash';
  const transport = subjectTransport(row, block, wallSubjects);
  // Every frozen plan binds exactly one identity; admission verifies its current (authored-v5) successor below.
  const identity = admittedIdentity(/** @type {!string} */ (subject[identityField]), transport.subjectDescriptorUtf8);
  const limitations = [];
  if (authored.derivation.includes('reverse')) {
    limitations.push(
      'The frozen direct row retained canonical expected data but not original call arguments; the owning matcher descriptor supplies the reversible one-argument form.',
    );
  }
  if (!matcher) {
    limitations.push(
      'The installed JavaScript assertion-client and Vitest subpaths expose matcher methods only; ancillary query routing requires a separate public operation.',
    );
  }
  if (block === 'wall-interim') {
    limitations.push(
      'Interim pre-CONTINUOUS02 wall coverage only; refusal is not qualified continuous-wall acceptance.',
    );
  }
  const regexes = regexLocations(authored.arguments);
  if (regexes.length > 0) {
    limitations.push(
      'Tagged selector regex values are restored as ECMAScript RegExp objects in JavaScript and GeoSpecRegex values in Python.',
    );
  }
  return {
    id: row.id,
    block,
    family: row.family ?? 'minimumWallThickness',
    capability: claim.capability,
    polarity: claim.polarity,
    matcher,
    expectedShape: expectedShape(claim.capability),
    workUnitBudget: claim.workUnitBudget,
    claimId: claim.claimId,
    subjectSlot: claim.subjectSlots[0],
    admittedSubjectIdentity: { field: identityField, value: identity },
    subject: { ...transport, expectedIdentity: { field: identityField, value: identity } },
    authoring: {
      argumentDerivation: authored.derivation,
      argumentsProtocolJson: authored.arguments,
      regexes,
      javascript: {
        import: '@taucad/geospec/assertion-client',
        chain: claim.polarity === 'negative' ? 'expectGeo(subject).not' : 'expectGeo(subject)',
        matcher: claim.capability,
      },
      python: {
        import: 'geospec.expect_geo',
        chain:
          claim.polarity === 'negative'
            ? 'expect_geo(subject, claim_id=claim_id).not_'
            : 'expect_geo(subject, claim_id=claim_id)',
        matcher: claim.capability,
      },
    },
    expected: {
      admission: row.expectedAdmission ?? null,
      operationDisposition: row.expectedOperationDisposition ?? null,
      canonicalClaim: canonicalClaimRecord(claim),
      canonicalPlan: utf8Record(Buffer.from(canonicalPlanUtf8)),
      canonicalResult:
        row.evaluatePlanResultUtf8 === undefined || row.evaluatePlanResultUtf8 === null
          ? null
          : utf8Record(Buffer.from(row.evaluatePlanResultUtf8)),
      protocolError: row.protocolError ?? null,
    },
    frozenDirectB19: directActual.get(row.id) ?? null,
    limitations,
    frozenSourceRow: row,
  };
};

export const buildAuthoringMap = () => {
  const metadata = /** @type {JoinedInput} */ (readJson(requiredEnvironment('GEOSPEC_METADATA_INPUT')));
  const a3 = /** @type {JoinedInput} */ (readJson(requiredEnvironment('GEOSPEC_A3_INPUT')));
  const wall = /** @type {JoinedInput} */ (readJson(requiredEnvironment('GEOSPEC_WALL_INPUT')));
  const metadataActual = new Map(
    readJsonLines(requiredEnvironment('GEOSPEC_METADATA_ACTUAL')).map((row) => [row.id, row]),
  );
  const a3Actual = new Map(readJsonLines(requiredEnvironment('GEOSPEC_A3_ACTUAL')).map((row) => [row.id, row]));
  const wallSubjects = new Map(wall.subjects.map((subject) => [subject.id, subject]));
  const rows = [
    ...metadata.rows.map((row) => normalizeRow(row, 'metadata', metadataActual, wallSubjects)),
    ...a3.rows.map((row) => normalizeRow(row, 'public49-a3', a3Actual, wallSubjects)),
    ...wall.rows.map((row) => normalizeRow(row, 'wall-interim', new Map(), wallSubjects)),
  ];
  const ids = new Set(rows.map((row) => row.id));
  assert.equal(ids.size, rows.length, 'Every approved row ID must be unique.');
  assert.equal(rows.length, 312);
  const matcherRows = rows.filter((row) => row.matcher);
  const ancillaryRows = rows.filter((row) => !row.matcher);
  const families = new Set(matcherRows.map((row) => row.capability));
  assert.equal(matcherRows.length, 216);
  assert.equal(ancillaryRows.length, 96);
  assert.equal(families.size, 24);
  for (const row of rows) {
    assert.equal(typeof row.claimId, 'string');
    assert.equal(typeof row.subjectSlot, 'string');
    assert.ok(Number.isSafeInteger(row.workUnitBudget) && row.workUnitBudget > 0);
    assert.match(row.admittedSubjectIdentity.value, /^[0-9a-f]{64}$/u);
  }
  const result = {
    schemaVersion: 1,
    taskId: 'W7-W8-AUTHORED-CORPUS-B19-A1',
    scope: {
      totalRows: rows.length,
      matcherRows: matcherRows.length,
      ancillaryRows: ancillaryRows.length,
      matcherFamilies: [...families].sort((left, right) => left.localeCompare(right)),
      wallQualification: 'interim-pre-CONTINUOUS02-only',
    },
    rows,
  };
  writeJson(requiredEnvironment('GEOSPEC_AUTHORING_MAP'), result);
  return result;
};

export const loadAuthoringMap = () =>
  /** @type {AuthoringMap} */ (readJson(requiredEnvironment('GEOSPEC_AUTHORING_MAP')));

export const verifyFixtures = () => {
  const map = loadAuthoringMap();
  const workspaceRoot = requiredEnvironment('GEOSPEC_WORKSPACE_ROOT');
  /** @type {Map<string, {source: {kind: string, path?: string, name?: string | null}, byteLength: number, sha256: string, usedBy: {id: string, position: string | number}[]}>} */
  const fixtures = new Map();
  for (const row of map.rows) {
    for (const [index, fixture] of [row.subject.primary, ...row.subject.resources].entries()) {
      const bytes = readVerified(workspaceRoot, fixture);
      const key = fixture.path ?? `${fixture.name ?? 'inline'}:${fixture.sha256}`;
      const existing = fixtures.get(key);
      const record = {
        source: fixture.path
          ? { kind: 'workspace-path', path: fixture.path }
          : { kind: fixture.utf8 === undefined ? 'inline-hex' : 'inline-utf8', name: fixture.name ?? null },
        byteLength: bytes.byteLength,
        sha256: sha256(bytes),
        usedBy: [...(existing?.usedBy ?? []), { id: row.id, position: index === 0 ? 'primary' : index - 1 }],
      };
      if (existing) {
        assert.equal(record.byteLength, existing.byteLength);
        assert.equal(record.sha256, existing.sha256);
      }
      fixtures.set(key, record);
    }
  }
  const result = {
    schemaVersion: 1,
    taskId: map.taskId,
    fixtureCount: fixtures.size,
    fixtures: [...fixtures.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, record]) => ({ key, ...record })),
  };
  writeJson(requiredEnvironment('GEOSPEC_FIXTURE_MANIFEST'), result);
  return result;
};

/** @type {(value: JsonValue) => unknown} */
const restoreJavascriptValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => restoreJavascriptValue(entry));
  }
  if (value && typeof value === 'object') {
    if (value['type'] === 'regexp' && typeof value['pattern'] === 'string' && typeof value['flags'] === 'string') {
      return new RegExp(value['pattern'], value['flags']);
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, restoreJavascriptValue(entry)]));
  }
  return value;
};

/** @type {(row: AuthoredRow) => unknown[]} @internal */
export const restoreJavascriptArguments = (row) =>
  /** @type {unknown[]} */ (restoreJavascriptValue(row.authoring.argumentsProtocolJson));

/** @type {(workspaceRoot: string, fixture: Fixture) => Buffer<ArrayBuffer>} */
const readVerified = (workspaceRoot, fixture) => {
  const bytes = fixture.path
    ? readFileSync(resolve(workspaceRoot, fixture.path))
    : fixture.utf8 === undefined
      ? Buffer.from(/** @type {!string} */ (fixture.hex), 'hex')
      : Buffer.from(fixture.utf8);
  assert.equal(bytes.byteLength, fixture.byteLength ?? fixture.bytes);
  assert.equal(sha256(bytes), fixture.sha256);
  return bytes;
};

/** @type {(engine: Engine, row: AuthoredRow) => {receipt: ByteRecord, subject: import('../../../geospec/src/engine/client.js').GeoSpecNativeSubject}} @internal */
export const admitSubject = (engine, row) => {
  const workspaceRoot = requiredEnvironment('GEOSPEC_WORKSPACE_ROOT');
  const primary = readVerified(workspaceRoot, row.subject.primary);
  const resources = row.subject.resources.map((resource) => readVerified(workspaceRoot, resource));
  const request = Buffer.from(row.subject.ingestRequestUtf8);
  const receiptBytes = engine.ingestSubject(request, primary, resources);
  // The installed native admission contract returns an identity, checked below.
  const receipt =
    /** @type {{result: {subject: import('../../../geospec/src/engine/client.js').GeoSpecNativeSubject}}} */ (
      JSON.parse(Buffer.from(receiptBytes).toString('utf8'))
    );
  const { result } = receipt;
  const { field, value } = row.subject.expectedIdentity;
  const actual = result.subject[field];
  assert.equal(actual, value);
  const subject = { [field]: actual };
  return { receipt: utf8Record(receiptBytes), subject };
};

/** @type {(report: NativeReport) => Omit<NativeReport, 'canonicalClaim' | 'canonicalPlan' | 'canonicalResult'> & {canonicalClaim: ByteRecord, canonicalPlan: ByteRecord, canonicalResult: ByteRecord}} */
const reportRecord = (report) => ({
  canonicalClaim: utf8Record(report.canonicalClaim),
  canonicalPlan: utf8Record(report.canonicalPlan),
  canonicalResult: utf8Record(report.canonicalResult),
  claim: report.claim,
  claimId: report.claimId,
  diagnostics: report.diagnostics,
  evidence: report.evidence ?? null,
  polarity: report.polarity,
  result: report.result,
  status: report.status,
});

/**
 * Record any thrown value without changing optional-property access semantics.
 * The annotation permits code inspection; it does not assert a thrown type.
 * @type {(error: unknown) => {name: string, code: string | null, message: string, constructorName: string | null, isGeoSpecAssertionError: boolean, isProtocolError: boolean}}
 * @internal
 */
export const errorRecord = (error) => ({
  name: error instanceof Error ? error.name : typeof error,
  code:
    typeof (/** @type {{code?: unknown} | null | undefined} */ (error)?.code) === 'string'
      ? /** @type {{code: string}} */ (error).code
      : null,
  message: error instanceof Error ? error.message : String(error),
  constructorName: error?.constructor?.name ?? null,
  isGeoSpecAssertionError: error instanceof GeoSpecAssertionError,
  isProtocolError: error instanceof ProtocolError,
});

/** @type {(row: AuthoredRow, outcome: Pick<Outcome, 'report' | 'error'>) => {directRouteEqual: boolean | null, independentOracle: {canonicalClaimEqual: boolean, canonicalPlanEqual: boolean, canonicalResultEqual: boolean | null}}} @internal */
export const compareOutcome = (row, outcome) => {
  const { report } = outcome;
  const { expected } = row;
  const oracle = {
    canonicalClaimEqual: report?.canonicalClaim.utf8 === expected.canonicalClaim.utf8,
    canonicalPlanEqual: report?.canonicalPlan.utf8 === expected.canonicalPlan.utf8,
    canonicalResultEqual:
      expected.canonicalResult === null ? null : report?.canonicalResult.utf8 === expected.canonicalResult.utf8,
  };
  const direct = row.frozenDirectB19;
  /** @type {boolean | null} */
  let directRouteEqual = null;
  if (direct?.error) {
    directRouteEqual =
      outcome.error?.name === direct.error.name &&
      /** @type {Outcome['error']} */ (outcome.error)?.code === direct.error.code &&
      /** @type {Outcome['error']} */ (outcome.error)?.message === direct.error.message;
  } else if (
    direct?.canonicalPlanUtf8 &&
    /** @type {AuthoredRow['frozenDirectB19']} */ (direct)?.evaluatePlanResultUtf8
  ) {
    directRouteEqual =
      report?.canonicalPlan.utf8 === direct.canonicalPlanUtf8 &&
      /** @type {Outcome['report']} */ (report)?.canonicalResult.utf8 === direct.evaluatePlanResultUtf8;
  }
  return { directRouteEqual, independentOracle: oracle };
};

/** @type {(row: AuthoredRow) => Promise<Outcome>} @internal */
export const runStandaloneRow = async (row) => {
  const engine = new Engine();
  let admission;
  let admissionError;
  try {
    admission = admitSubject(engine, row);
  } catch (error) {
    admissionError = errorRecord(error);
  }
  if (!admission) {
    /** @type {Outcome} */
    const outcome = {
      id: row.id,
      route: 'javascript-standalone',
      routeState: 'admission-error',
      admission: null,
      authoring: row.authoring.javascript,
      argumentsProtocolJson: row.authoring.argumentsProtocolJson,
      error: admissionError,
      report: null,
    };
    outcome.comparison = compareOutcome(row, outcome);
    return outcome;
  }
  const client =
    /** @type {typeof import('../../../geospec/src/assertion-client/client.js').createGeoSpecAssertionClient} */ (
      createGeoSpecAssertionClient
    )({
      engine,
      claimId: () => row.claimId,
      subjectSlot: row.subjectSlot,
      workUnitLimit: row.workUnitBudget,
    });
  const chain = client.expectGeo(admission.subject);
  const methods = row.polarity === 'negative' ? chain.not : chain;
  const arguments_ = restoreJavascriptArguments(row);
  /** @type {NativeReport | undefined} */
  let report;
  let failure;
  try {
    // Dispatch only follows the persisted matcher partition. Argument shapes
    // include negative controls and are intentionally checked by the public API.
    report = await Reflect.apply(
      /** @type {(...arguments_: unknown[]) => Promise<NativeReport>} */ (
        methods[/** @type {MatcherName} */ (row.capability)]
      ),
      methods,
      arguments_,
    );
  } catch (error) {
    failure = errorRecord(error);
    if (error instanceof GeoSpecAssertionError) {
      report = /** @type {import('../../../geospec/src/assertion-client/client.js').GeoSpecAssertionError} */ (
        error
      ).report;
    }
  }
  /** @type {Outcome} */
  const outcome = {
    id: row.id,
    route: 'javascript-standalone',
    admission,
    authoring: row.authoring.javascript,
    argumentsProtocolJson: row.authoring.argumentsProtocolJson,
    error: failure ?? null,
    report: report ? reportRecord(report) : null,
  };
  outcome.comparison = compareOutcome(row, outcome);
  return outcome;
};

/** @type {(engine: Engine) => {calls: RecordedCall[], engine: import('../../../geospec/src/engine/client.js').GeoSpecNativeEngine}} @internal */
export const createForwardingRecorder = (engine) => {
  /** @type {RecordedCall[]} */
  const calls = [];
  /** @type {<Output extends HostBytes | import('../../../geospec/src/engine/client.js').GeoSpecNativeClaimEvaluation>(operation: string, input: HostBytes, invoke: () => Output) => Output} */
  const forward = (operation, input, invoke) => {
    /** @type {RecordedCall} */
    const call = { operation, input: utf8Record(input) };
    calls.push(call);
    try {
      const output = invoke();
      if (output instanceof Uint8Array) {
        call.output = utf8Record(output);
      } else {
        // An evaluateClaim call records its canonical result as `output` and its canonical plan beside it.
        call.output = utf8Record(output.canonicalResult);
        call.plan = utf8Record(output.canonicalPlan);
      }
      return output;
    } catch (error) {
      call.error = errorRecord(error);
      throw error;
    }
  };
  return {
    calls,
    engine: /** @satisfies {import('../../../geospec/src/engine/client.js').GeoSpecNativeEngine} */ ({
      processRequest: (request) => forward('processRequest', request, () => engine.processRequest(request)),
      evaluateClaim: (request) => forward('evaluateClaim', request, () => engine.evaluateClaim(request)),
    }),
  };
};

/** @type {(row: AuthoredRow) => {id: string, route: string, admission: ReturnType<typeof admitSubject> | null, canonicalPlan: ByteRecord | null, canonicalResult: ByteRecord | null, error: ErrorRecord | null}} */
const directWallRow = (row) => {
  const engine = new Engine();
  let admission;
  let canonicalPlan;
  let canonicalResult;
  let failure;
  try {
    admission = admitSubject(engine, row);
    canonicalPlan = engine.canonicalPlan(Buffer.from(/** @type {!string} */ (row.frozenSourceRow.authoredRequestUtf8)));
    canonicalResult = engine.evaluatePlan(canonicalPlan);
  } catch (error) {
    failure = errorRecord(error);
  }
  return {
    id: row.id,
    route: 'direct-b19-wall-only',
    admission: admission ?? null,
    canonicalPlan: canonicalPlan ? utf8Record(canonicalPlan) : null,
    canonicalResult: canonicalResult ? utf8Record(canonicalResult) : null,
    error: failure ?? null,
  };
};

export const runStandalone = async () => {
  const map = loadAuthoringMap();
  const output = {
    schemaVersion: 1,
    taskId: map.taskId,
    route: 'javascript-standalone',
    rows: /** @type {Outcome[]} */ ([]),
    ancillaryGaps:
      /** @type {{id: string, capability: string, reason: string, frozenDirectB19: DirectActual | null}[]} */ ([]),
    directWallRows: /** @type {ReturnType<typeof directWallRow>[]} */ ([]),
  };
  try {
    for (const row of map.rows) {
      if (!row.matcher) {
        output.ancillaryGaps.push({
          id: row.id,
          capability: row.capability,
          reason:
            'No native-subject ancillary query/evaluate operation is exported by @taucad/geospec/assertion-client.',
          frozenDirectB19: row.frozenDirectB19,
        });
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Native engines are owner-thread objects and rows execute serially.
      output.rows.push(await runStandaloneRow(row));
    }
    for (const row of map.rows.filter((candidate) => candidate.block === 'wall-interim')) {
      output.directWallRows.push(directWallRow(row));
    }
    assert.equal(output.rows.length, 216);
    assert.equal(output.ancillaryGaps.length, 96);
    assert.equal(output.directWallRows.length, 8);
  } finally {
    writeJson(requiredEnvironment('GEOSPEC_STANDALONE_OUTPUT'), output);
  }
  return output;
};

const main = async () => {
  const mode = process.argv[2];
  if (mode === 'map') {
    buildAuthoringMap();
    return;
  }
  if (mode === 'standalone') {
    await runStandalone();
    return;
  }
  if (mode === 'fixtures') {
    verifyFixtures();
    return;
  }
  throw new Error(`Unknown corpus mode '${mode}'.`);
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
