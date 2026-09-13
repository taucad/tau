import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const resultsHash = 'd961d9e25b36fbc2baa8812e114b0fd37ee5c6f92453474dbac1022b86df1aab';
const admissionsHash = 'f4454477a775cb0ade226d6f89a2cff460b0bfdb2f2c2655419da6c450051075';

const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const readVerifiedJson = (environmentName, expectedHash) => {
  const bytes = readFileSync(requiredEnvironment(environmentName));
  assert.equal(sha256(bytes), expectedHash);
  return JSON.parse(bytes.toString('utf8'));
};

export const loadAuthority = () => {
  const rows = readVerifiedJson('GEOSPEC_F1_RESULTS', resultsHash);
  const admissions = readVerifiedJson('GEOSPEC_F1_ADMISSIONS', admissionsHash);
  assert.equal(rows.length, 12);
  assert.equal(admissions.length, 6);
  assert.deepEqual(
    [...new Set(rows.map((row) => row.geometryId))].sort(),
    admissions.map((admission) => admission.subjectId).sort(),
  );
  return { admissions: new Map(admissions.map((admission) => [admission.subjectId, admission])), rows };
};

export const byteRecord = (bytes) => {
  const value = Buffer.from(bytes);
  return { byteLength: value.byteLength, sha256: sha256(value), utf8: value.toString('utf8') };
};

export const admitSubject = (engine, admission) => {
  const primary = Buffer.from(admission.primary.utf8, 'utf8');
  assert.equal(primary.byteLength, admission.primary.byteLength);
  assert.equal(sha256(primary), admission.primary.sha256);
  const receiptBytes = engine.ingestSubject(Buffer.from(admission.request.canonicalUtf8), primary, []);
  const receipt = byteRecord(receiptBytes);
  const parsed = JSON.parse(receipt.utf8);
  return {
    comparison: { receipt: receipt.utf8 === admission.response.canonicalUtf8 },
    receipt,
    subject: { subjectHash: parsed.result.subject.subjectHash },
  };
};

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

export const errorRecord = (error, assertionError = false) => ({
  name: error instanceof Error ? error.name : typeof error,
  message: error instanceof Error ? error.message : String(error),
  constructorName: error?.constructor?.name ?? null,
  assertionError,
});

export const createForwardingRecorder = (engine) => {
  const calls = [];
  const forward = (operation, input, invoke) => {
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
  return {
    calls,
    engine: {
      canonicalPlan: (request) => forward('canonicalPlan', request, () => engine.canonicalPlan(request)),
      evaluatePlan: (plan) => forward('evaluatePlan', plan, () => engine.evaluatePlan(plan)),
      processRequest: (request) => forward('processRequest', request, () => engine.processRequest(request)),
    },
  };
};

export const reportFromRecorder = (row, calls, canonicalize) => {
  const planCall = calls.find((call) => call.operation === 'canonicalPlan' && call.output);
  const resultCall = calls.find((call) => call.operation === 'evaluatePlan' && call.output);
  if (!planCall || !resultCall) {
    return null;
  }
  const plan = JSON.parse(planCall.output.utf8);
  const resultEnvelope = JSON.parse(resultCall.output.utf8);
  const claim = plan.plan.claims[0];
  const result = resultEnvelope.results[0];
  return reportRecord(
    {
      canonicalClaim: canonicalize(Buffer.from(JSON.stringify(claim))),
      canonicalPlan: Buffer.from(planCall.output.utf8),
      canonicalResult: Buffer.from(resultCall.output.utf8),
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
  const claim = JSON.parse(row.canonicalPlanUtf8).plan.claims[0];
  const expectedClaim = byteRecord(canonicalize(Buffer.from(JSON.stringify(claim))));
  return {
    canonicalClaim: report.canonicalClaim.utf8 === expectedClaim.utf8,
    canonicalPlan: report.canonicalPlan.utf8 === row.canonicalPlanUtf8,
    canonicalResult: report.canonicalResult.utf8 === row.neutralResult.canonicalUtf8,
    canonicalResultClaim: report.canonicalResultClaim.utf8 === row.claimResult.canonicalUtf8,
    status: report.status === row.claimResult.value.status,
  };
};

export const rowContract = (row) => {
  const claim = JSON.parse(row.canonicalPlanUtf8).plan.claims[0];
  assert.equal(claim.capability, 'toSatisfyRationalPlate');
  assert.deepEqual(claim.payload, { contract: 'geospec.plate-two-windows/v1' });
  assert.equal(claim.subjectSlots[0], 'part');
  assert.equal(claim.workUnitBudget, 10_000);
  return claim;
};

export const writeOutput = (value) => {
  writeFileSync(requiredEnvironment('GEOSPEC_F1_OUTPUT'), `${JSON.stringify(value, null, 2)}\n`);
};

export const assertOutput = (output) => {
  assert.equal(output.rows.length, 12);
  for (const row of output.rows) {
    assert.ok(Object.values(row.admission.comparison).every(Boolean), `${row.id}: admission bytes differ`);
    assert.ok(Object.values(row.comparison).every(Boolean), `${row.id}: report bytes differ`);
    assert.equal(row.error === null, row.report.status === 'passed', `${row.id}: assertion outcome differs`);
    if (row.error) {
      assert.equal(row.error.assertionError, true, `${row.id}: assertion error type differs`);
    }
  }
};
