import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line no-restricted-imports -- The standalone authority harness shares the local immutable fixture closure.
import { readFixture } from '../fixtures/read-fixture.mjs';

/** @typedef {import('@taucad/runtime/types').JSONValue} JSONValue */
/** @typedef {import('geospec/assertion-client').GeoSpecCanonicalClaimReport} GeoSpecCanonicalClaimReport */
/** @typedef {import('geospec/assertion-client').GeoSpecNativeEngine} GeoSpecNativeEngine */
/** @typedef {string | Uint8Array<ArrayBuffer>} ByteSource */
/** @typedef {(input: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>} Canonicalize */
/** @typedef {{ byteLength: number, sha256: string, utf8: string }} ByteRecord */
/** @typedef {{ canonicalUtf8: string }} CanonicalBytes */
/** @typedef {{ canonicalUtf8: string, value: { status: string } }} ClaimResultAuthority */
/** @typedef {{ id: string, geometryId: string, canonicalPlanUtf8: string, claimResult: ClaimResultAuthority, neutralResult: CanonicalBytes }} AuthorityRow */
/** @typedef {{ subjectId: string, request: CanonicalBytes, primary: ByteRecord, response: CanonicalBytes }} Admission */
/** @typedef {GeoSpecNativeEngine & { ingestSubject(request: Uint8Array<ArrayBuffer>, primary: Uint8Array<ArrayBuffer>, resources: readonly Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> }} AdmissionEngine */
/** @typedef {{ capability: string, claimId: string, payload: JSONValue, polarity: 'negative' | 'positive', subjectSlots: string[], workUnitBudget: number } & Record<string, JSONValue>} AuthorityClaim */
/** @typedef {{ claimId: string, diagnostics: readonly JSONValue[], evidence?: JSONValue, status: GeoSpecCanonicalClaimReport['status'] } & GeoSpecCanonicalClaimReport['result']} AuthorityResult */
/** @typedef {{ name: string, message: string, constructorName: string | null, assertionError: boolean }} ErrorRecord */
/** @typedef {Omit<GeoSpecCanonicalClaimReport, 'canonicalClaim' | 'canonicalPlan' | 'canonicalResult' | 'evidence'> & { canonicalClaim: ByteRecord, canonicalPlan: ByteRecord, canonicalResult: ByteRecord, canonicalResultClaim: ByteRecord, evidence: JSONValue | null }} ReportRecord */
/** @typedef {{ operation: string, input: ByteRecord, output?: ByteRecord, error?: ErrorRecord }} RecorderCall */
/** @typedef {{ id: string, admission: { comparison: Record<string, boolean> }, comparison: Record<string, boolean>, error: ErrorRecord | null, flushError?: ErrorRecord | null, invocationError?: ErrorRecord | null, recorderCalls: RecorderCall[], report: ReportRecord | null }} HarnessOutputRow */
/** @typedef {{ schemaVersion: number, route: string, rows: HarnessOutputRow[] }} HarnessOutput */

const resultsHash = 'd961d9e25b36fbc2baa8812e114b0fd37ee5c6f92453474dbac1022b86df1aab';
const admissionsHash = 'f4454477a775cb0ade226d6f89a2cff460b0bfdb2f2c2655419da6c450051075';
const authorityRoot =
  'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lanes/matcher-full-f1-fullwire-a1/revisions/metadata-a2';
const priorNumericProfile = '"numericProfile":"geospec-st-logical-requests-v2"';
const currentNumericProfile = '"numericProfile":"geospec-st-logical-requests-v3"';
const priorRegistryVersion = '"registryVersion":4';
const currentRegistryVersion = '"registryVersion":5';
const priorVerifierSourceHash = 'cbf1df63a329f71fdc772938eb3a8a16f42d52983f82ccaf6966ea4182f4542c';
const currentVerifierSourceHash = '38922652cc624d2a6c84377bddc20e76a0361dc95b87f9c3e94463ded6610df9';

/** @type {(name: string) => string} */
const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

/** @type {(bytes: import('node:crypto').BinaryLike) => string} */
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** @type {(value: string, before: string, after: string) => string} */
const replaceExactlyOnce = (value, before, after) => {
  const index = value.indexOf(before);
  assert.notEqual(index, -1, `Authority token is missing: ${before}`);
  assert.equal(value.indexOf(before, index + before.length), -1, `Authority token is repeated: ${before}`);
  return `${value.slice(0, index)}${after}${value.slice(index + before.length)}`;
};

/** @type {(row: AuthorityRow) => AuthorityRow} */
const promoteRowAuthority = (row) => {
  const priorPlanHash = sha256(row.canonicalPlanUtf8);
  const canonicalPlanUtf8 = replaceExactlyOnce(
    replaceExactlyOnce(row.canonicalPlanUtf8, priorNumericProfile, currentNumericProfile),
    priorRegistryVersion,
    currentRegistryVersion,
  );
  const currentPlanHash = sha256(canonicalPlanUtf8);
  /** @type {(value: string) => string} */
  const promoteResult = (value) =>
    replaceExactlyOnce(
      replaceExactlyOnce(value, priorPlanHash, currentPlanHash),
      priorVerifierSourceHash,
      currentVerifierSourceHash,
    );
  return {
    ...row,
    canonicalPlanUtf8,
    claimResult: { ...row.claimResult, canonicalUtf8: promoteResult(row.claimResult.canonicalUtf8) },
    neutralResult: {
      ...row.neutralResult,
      canonicalUtf8: replaceExactlyOnce(
        promoteResult(row.neutralResult.canonicalUtf8),
        priorNumericProfile,
        currentNumericProfile,
      ),
    },
  };
};

/** @type {(admission: Admission) => Admission} */
const promoteAdmissionAuthority = (admission) => ({
  ...admission,
  request: {
    ...admission.request,
    canonicalUtf8: replaceExactlyOnce(admission.request.canonicalUtf8, priorRegistryVersion, currentRegistryVersion),
  },
});

/** @type {(environmentName: string, expectedHash: string, originalPath: string) => unknown} */
const readVerifiedJson = (environmentName, expectedHash, originalPath) => {
  const selectedPath = process.env[environmentName];
  const bytes = selectedPath ? readFileSync(selectedPath) : readFixture(originalPath);
  assert.equal(sha256(bytes), expectedHash);
  return /** @type {unknown} */ (JSON.parse(bytes.toString('utf8')));
};

/** @type {() => { admissions: Map<string, Admission>, rows: AuthorityRow[] }} */
export const loadAuthority = () => {
  const rowsValue = readVerifiedJson('GEOSPEC_F1_RESULTS', resultsHash, `${authorityRoot}/fullwire-results.json`);
  const admissionsValue = readVerifiedJson(
    'GEOSPEC_F1_ADMISSIONS',
    admissionsHash,
    `${authorityRoot}/binary-admissions.json`,
  );
  assert.ok(Array.isArray(rowsValue));
  assert.ok(Array.isArray(admissionsValue));
  const rows = /** @type {AuthorityRow[]} */ (rowsValue).map((row) => promoteRowAuthority(row));
  const admissions = /** @type {Admission[]} */ (admissionsValue).map((admission) =>
    promoteAdmissionAuthority(admission),
  );
  assert.equal(rows.length, 12);
  assert.equal(admissions.length, 6);
  assert.deepEqual(
    [...new Set(rows.map((row) => row.geometryId))].sort((left, right) => left.localeCompare(right)),
    admissions.map((admission) => admission.subjectId).sort((left, right) => left.localeCompare(right)),
  );
  return { admissions: new Map(admissions.map((admission) => [admission.subjectId, admission])), rows };
};

/** @type {(bytes: ByteSource) => ByteRecord} */
export const byteRecord = (bytes) => {
  const value = Buffer.from(bytes);
  return { byteLength: value.byteLength, sha256: sha256(value), utf8: value.toString('utf8') };
};

/** @type {(engine: AdmissionEngine, admission: Admission | undefined) => { comparison: Record<string, boolean>, receipt: ByteRecord, subject: { subjectHash: string } }} */
export const admitSubject = (engine, admission) => {
  assert.ok(admission, 'Authority admission is missing.');
  const primary = Buffer.from(admission.primary.utf8, 'utf8');
  assert.equal(primary.byteLength, admission.primary.byteLength);
  assert.equal(sha256(primary), admission.primary.sha256);
  const receiptBytes = engine.ingestSubject(Buffer.from(admission.request.canonicalUtf8), primary, []);
  const receipt = byteRecord(receiptBytes);
  const parsed = /** @type {{ result: { subject: { subjectHash: string } } }} */ (
    /** @type {unknown} */ (JSON.parse(receipt.utf8))
  );
  return {
    comparison: { receipt: receipt.utf8 === admission.response.canonicalUtf8 },
    receipt,
    subject: { subjectHash: parsed.result.subject.subjectHash },
  };
};

/** @type {(report: GeoSpecCanonicalClaimReport, canonicalize: Canonicalize) => ReportRecord} */
export const reportRecord = (report, canonicalize) => ({
  canonicalClaim: byteRecord(report.canonicalClaim),
  canonicalPlan: byteRecord(report.canonicalPlan),
  canonicalResult: byteRecord(report.canonicalResult),
  canonicalResultClaim: byteRecord(canonicalize(Buffer.from(JSON.stringify(report.result)))),
  claim: report.claim,
  claimId: report.claimId,
  diagnostics: report.diagnostics,
  evidence: report.evidence ?? null,
  polarity: report.polarity,
  result: report.result,
  status: report.status,
});

/** @type {(error: unknown, assertionError?: boolean) => ErrorRecord} */
export const errorRecord = (error, assertionError = false) => ({
  name: error instanceof Error ? error.name : typeof error,
  message: error instanceof Error ? error.message : String(error),
  constructorName: error?.constructor?.name ?? null,
  assertionError,
});

/** @type {(engine: GeoSpecNativeEngine) => { calls: RecorderCall[], engine: GeoSpecNativeEngine }} */
export const createForwardingRecorder = (engine) => {
  /** @type {RecorderCall[]} */
  const calls = [];
  /** @type {(operation: string, input: Uint8Array<ArrayBuffer>, invoke: () => Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>} */
  const forward = (operation, input, invoke) => {
    /** @type {RecorderCall} */
    const call = { operation, input: byteRecord(input) };
    calls.push(call);
    try {
      const output = invoke();
      call.output = byteRecord(output);
      return output;
    } catch (error) {
      call.error = errorRecord(error);
      throw error;
    }
  };
  /** @type {GeoSpecNativeEngine} */
  const forwardingEngine = {
    canonicalPlan: (request) => forward('canonicalPlan', request, () => engine.canonicalPlan(request)),
    evaluatePlan: (plan) => forward('evaluatePlan', plan, () => engine.evaluatePlan(plan)),
    processRequest: (request) => forward('processRequest', request, () => engine.processRequest(request)),
  };
  return { calls, engine: forwardingEngine };
};

/** @type {(calls: RecorderCall[], canonicalize: Canonicalize) => ReportRecord | null} */
export const reportFromRecorder = (calls, canonicalize) => {
  const planOutput = calls.find((call) => call.operation === 'canonicalPlan' && call.output)?.output;
  const resultOutput = calls.find((call) => call.operation === 'evaluatePlan' && call.output)?.output;
  if (!planOutput || !resultOutput) {
    return null;
  }
  const plan = /** @type {{ plan: { claims: AuthorityClaim[] } }} */ (
    /** @type {unknown} */ (JSON.parse(planOutput.utf8))
  );
  const resultEnvelope = /** @type {{ results: AuthorityResult[] }} */ (
    /** @type {unknown} */ (JSON.parse(resultOutput.utf8))
  );
  const claim = plan.plan.claims[0];
  const result = resultEnvelope.results[0];
  assert.ok(claim);
  assert.ok(result);
  return reportRecord(
    {
      canonicalClaim: canonicalize(Buffer.from(JSON.stringify(claim))),
      canonicalPlan: Buffer.from(planOutput.utf8),
      canonicalResult: Buffer.from(resultOutput.utf8),
      claim,
      claimId: result.claimId,
      diagnostics: result.diagnostics,
      evidence: result.evidence,
      polarity: claim.polarity,
      result,
      status: result.status,
    },
    canonicalize,
  );
};

/** @type {(row: AuthorityRow, report: ReportRecord | null, canonicalize: Canonicalize) => Record<string, boolean>} */
export const compareReport = (row, report, canonicalize) => {
  if (!report) {
    return {
      canonicalClaim: false,
      canonicalPlan: false,
      canonicalResult: false,
      canonicalResultClaim: false,
      status: false,
    };
  }
  const plan = /** @type {{ plan: { claims: AuthorityClaim[] } }} */ (
    /** @type {unknown} */ (JSON.parse(row.canonicalPlanUtf8))
  );
  const claim = plan.plan.claims[0];
  assert.ok(claim);
  const expectedClaim = byteRecord(canonicalize(Buffer.from(JSON.stringify(claim))));
  return {
    canonicalClaim: report.canonicalClaim.utf8 === expectedClaim.utf8,
    canonicalPlan: report.canonicalPlan.utf8 === row.canonicalPlanUtf8,
    canonicalResult: report.canonicalResult.utf8 === row.neutralResult.canonicalUtf8,
    canonicalResultClaim: report.canonicalResultClaim.utf8 === row.claimResult.canonicalUtf8,
    status: report.status === row.claimResult.value.status,
  };
};

/** @type {(row: AuthorityRow) => AuthorityClaim} */
export const rowContract = (row) => {
  const plan = /** @type {{ plan: { claims: AuthorityClaim[] } }} */ (
    /** @type {unknown} */ (JSON.parse(row.canonicalPlanUtf8))
  );
  const claim = plan.plan.claims[0];
  assert.ok(claim);
  assert.equal(claim.capability, 'toSatisfyRationalPlate');
  assert.deepEqual(claim.payload, { contract: 'geospec.plate-two-windows/v1' });
  assert.equal(claim.subjectSlots[0], 'part');
  assert.equal(claim.workUnitBudget, 10_000);
  return claim;
};

/** @type {(route: string) => HarnessOutput} */
export const createOutput = (route) => ({ schemaVersion: 1, route, rows: [] });

/** @type {(value: unknown) => void} */
export const writeOutput = (value) => {
  writeFileSync(requiredEnvironment('GEOSPEC_F1_OUTPUT'), `${JSON.stringify(value, null, 2)}\n`);
};

/** @type {(output: HarnessOutput) => void} */
export const assertOutput = (output) => {
  assert.equal(output.rows.length, 12);
  for (const row of output.rows) {
    assert.ok(Object.values(row.admission.comparison).every(Boolean), `${row.id}: admission bytes differ`);
    assert.ok(Object.values(row.comparison).every(Boolean), `${row.id}: report bytes differ`);
    assert.ok(row.report, `${row.id}: report is missing`);
    assert.equal(row.error === null, row.report.status === 'passed', `${row.id}: assertion outcome differs`);
    if (row.error) {
      assert.equal(row.error.assertionError, true, `${row.id}: assertion error type differs`);
    }
  }
};
