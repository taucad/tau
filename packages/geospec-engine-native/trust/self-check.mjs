/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- The check reads the valid evaluator JSON output as an external record. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const pae = (payloadType, payload) =>
  Buffer.concat([
    Buffer.from(`DSSEv1 ${Buffer.byteLength(payloadType)} ${payloadType} ${payload.byteLength} `),
    payload,
  ]);

assert.equal(
  pae('http://example.com/HelloWorld', Buffer.from('hello world')).toString(),
  'DSSEv1 29 http://example.com/HelloWorld 11 hello world',
);

const output = resolve(process.argv[2]);
const closure = join(output, 'closure');
const record = readJson(join(closure, 'raw-evaluation.json'));
const plan = readJson(join(closure, 'plan.json'));
const canonicalPlan = readJson(join(closure, 'canonical-plan.json'));
const canonicalResult = readJson(join(closure, 'canonical-result.json'));
const statement = readJson(join(output, 'statement.json'));
assert.equal(record.complete, true);
assert.deepEqual(
  record.rows.every(({ status }) => ['passed', 'failed', 'refused'].includes(status)),
  true,
);
assert.deepEqual(record.cache, { mode: 'disabled', persistent: false });
assert.equal(record.schema, 'geospec-trusted-native-evaluation-v2');
assert.deepEqual(
  statement.predicate.subjects,
  plan.subjects.map((subject) => ({
    expectedIdentity: subject.expectedIdentity,
    format: subject.format,
    frame: subject.frame,
    identityField: subject.identityField,
    primarySha256: subject.primary.sha256,
    resourceSha256: subject.resources.map(({ sha256: digest }) => digest),
    slot: subject.slot,
  })),
);
assert.deepEqual(
  canonicalPlan.plan.subjects,
  plan.subjects.map((subject) => ({ slot: subject.slot, [subject.identityField]: subject.expectedIdentity })),
);
for (const [index, approved] of plan.subjects.entries()) {
  const observed = record.subjects[index];
  const ingestBytes = Buffer.from(observed.ingestRequest.base64, 'base64');
  const admissionBytes = Buffer.from(observed.admission.base64, 'base64');
  const admission = JSON.parse(admissionBytes);
  assert.equal(sha256(ingestBytes), approved.ingestRequestSha256);
  assert.deepEqual(JSON.parse(ingestBytes), approved.ingestRequest);
  assert.equal(sha256(admissionBytes), observed.admission.sha256);
  assert.equal(admission.result.subject[approved.identityField], approved.expectedIdentity);
  assert.deepEqual(admission.result.subject.descriptor.primary, {
    byteLength: approved.primary.byteLength,
    sha256: approved.primary.sha256,
  });
  assert.deepEqual(
    admission.result.subject.descriptor.resources,
    approved.resources.map(({ byteLength, name, sha256: digest }) => ({ byteLength, name, sha256: digest })),
  );
}
for (const [index, approved] of plan.claims.entries()) {
  const row = record.rows[index];
  const claimBytes = Buffer.from(row.canonicalClaim, 'base64');
  const resultBytes = Buffer.from(row.canonicalResult, 'base64');
  assert.equal(sha256(claimBytes), approved.canonicalClaimSha256);
  assert.deepEqual(JSON.parse(claimBytes), canonicalPlan.plan.claims[index]);
  assert.equal(sha256(resultBytes), row.canonicalResultSha256);
  assert.deepEqual(JSON.parse(resultBytes), canonicalResult.results[index]);
  assert.equal(row.status, canonicalResult.results[index].status);
}
assert.ok(readFileSync(join(closure, 'runner.json')).byteLength > 0);
const runnerSource = readFileSync(join(closure, 'runner/run.mjs'), 'utf8');
const planLoadSource = runnerSource.slice(
  runnerSource.indexOf('const loadPlan ='),
  runnerSource.indexOf('/** Derive the immutable identities'),
);
const validationSource = runnerSource.slice(
  runnerSource.indexOf('const validateCompleteRecord ='),
  runnerSource.indexOf('/** Evaluate an approved plan'),
);
assert.equal(planLoadSource.match(/canonicalizeJsonBatch\(/g)?.length, 1);
assert.equal(planLoadSource.match(/canonicalizeValue\(/g)?.length ?? 0, 0);
assert.equal(validationSource.match(/canonicalizeJsonBatch\(/g)?.length, 1);
assert.equal(validationSource.match(/canonicalizeValue\(/g)?.length ?? 0, 0);
process.stdout.write(
  `${JSON.stringify({
    canonicalizerChildrenPerCompleteRecord: 1,
    canonicalizerChildrenPerPlanControlValidation: 1,
    claims: record.rows.length,
    code: 'SELF_CHECK_PASSED',
  })}\n`,
);
