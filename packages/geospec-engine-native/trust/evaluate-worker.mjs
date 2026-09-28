/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/use-unknown-in-catch-callback-variable -- Approved JSON and native byte responses cross an intentionally untyped process boundary. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes) => JSON.parse(Buffer.from(bytes).toString('utf8'));

const exactKeys = (value, keys, label) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).toSorted(), keys.toSorted(), `${label} fields`);
};

const main = async () => {
  const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  exactKeys(config, ['planPath', 'productRoot', 'subjects'], 'worker config');
  const planBytes = readFileSync(config.planPath);
  const plan = JSON.parse(planBytes);
  const modulePath = join(config.productRoot, 'node_modules/@taucad/geospec-engine-native/dist/node.mjs');
  const { canonicalize, Engine } = await import(pathToFileURL(modulePath).href);
  assert.deepEqual(Buffer.from(canonicalize(planBytes)), planBytes, 'approved plan must use geospec-jcs-v1');

  const engine = new Engine();
  const canonical = (value) => Buffer.from(canonicalize(Buffer.from(JSON.stringify(value))));
  const initializationRequest = canonical({
    canonicalProfile: plan.authority.canonicalProfile,
    method: 'initialize',
    protocolVersion: plan.authority.protocolVersion,
    registryVersion: plan.authority.registryVersion,
    requestId: 'trusted-evaluator-initialize',
  });
  const initializationBytes = Buffer.from(engine.processRequest(initializationRequest));
  const initialization = decode(initializationBytes);
  const admitted = [];

  try {
    for (const subject of plan.subjects) {
      const supplied = config.subjects.find((value) => value.slot === subject.slot);
      assert.ok(supplied, `missing subject ${subject.slot}`);
      const primary = readFileSync(supplied.primaryPath);
      assert.equal(primary.byteLength, subject.primary.byteLength, `${subject.slot} primary length`);
      assert.equal(sha256(primary), subject.primary.sha256, `${subject.slot} primary digest`);
      const resources = subject.resources.map((resource) => {
        const path = supplied.resourcePaths.find((value) => value.name === resource.name)?.path;
        assert.ok(path, `missing resource ${subject.slot}/${resource.name}`);
        const bytes = readFileSync(path);
        assert.equal(bytes.byteLength, resource.byteLength, `${subject.slot}/${resource.name} length`);
        assert.equal(sha256(bytes), resource.sha256, `${subject.slot}/${resource.name} digest`);
        return bytes;
      });
      const ingestRequest = canonical(subject.ingestRequest);
      assert.equal(sha256(ingestRequest), subject.ingestRequestSha256, `${subject.slot} ingest request`);
      const admissionBytes = Buffer.from(engine.ingestSubject(ingestRequest, primary, resources));
      const admission = decode(admissionBytes);
      const actualIdentity = admission.result.subject[subject.identityField];
      assert.equal(actualIdentity, subject.expectedIdentity, `${subject.slot} admitted identity`);
      const handleRequest = canonical({
        canonicalProfile: plan.authority.canonicalProfile,
        method: 'subjectHandle',
        protocolVersion: plan.authority.protocolVersion,
        registryVersion: plan.authority.registryVersion,
        requestId: `trusted-evaluator-handle:${subject.slot}`,
        [subject.identityField]: actualIdentity,
      });
      const handleBytes = Buffer.from(engine.subjectHandle(handleRequest));
      admitted.push({
        admission: { base64: admissionBytes.toString('base64'), sha256: sha256(admissionBytes) },
        actualIdentity,
        handle: decode(handleBytes).result.subjectHandle,
        identityField: subject.identityField,
        ingestRequest: { base64: ingestRequest.toString('base64'), sha256: sha256(ingestRequest) },
        slot: subject.slot,
      });
    }

    const claims = plan.claims.map(({ claim }) => claim);
    const protocolSubjects = plan.subjects.map((subject) => ({
      slot: subject.slot,
      [subject.identityField]: subject.expectedIdentity,
    }));
    const request = canonical({
      canonicalProfile: plan.authority.canonicalProfile,
      method: 'submitClaims',
      plan: { claims, subjects: protocolSubjects },
      protocolVersion: plan.authority.protocolVersion,
      registryVersion: plan.authority.registryVersion,
      requestId: 'trusted-evaluator-submit',
    });
    const canonicalPlan = Buffer.from(engine.canonicalPlan(request));
    const canonicalResult = Buffer.from(engine.evaluatePlan(canonicalPlan));
    const planEnvelope = decode(canonicalPlan);
    const resultEnvelope = decode(canonicalResult);
    const expectedIds = claims.map((claim) => claim.claimId);
    assert.deepEqual(
      planEnvelope.plan.claims.map((claim) => claim.claimId),
      expectedIds,
      'canonical claim order',
    );
    assert.deepEqual(
      resultEnvelope.results.map((result) => result.claimId),
      expectedIds,
      'result claim order',
    );
    assert.equal(resultEnvelope.results.length, claims.length, 'complete result count');
    const rows = resultEnvelope.results.map((result, ordinal) => {
      assert.ok(['passed', 'failed', 'refused'].includes(result.status));
      const claimBytes = canonical(planEnvelope.plan.claims[ordinal]);
      const resultBytes = canonical(result);
      assert.equal(sha256(claimBytes), plan.claims[ordinal].canonicalClaimSha256);
      return {
        canonicalClaim: claimBytes.toString('base64'),
        canonicalClaimSha256: sha256(claimBytes),
        canonicalResult: resultBytes.toString('base64'),
        canonicalResultSha256: sha256(resultBytes),
        claimId: result.claimId,
        ordinal,
        polarity: planEnvelope.plan.claims[ordinal].polarity,
        status: result.status,
      };
    });
    const record = {
      cache: { mode: 'disabled', persistent: false },
      canonicalPlan: { base64: canonicalPlan.toString('base64'), sha256: sha256(canonicalPlan) },
      canonicalResult: { base64: canonicalResult.toString('base64'), sha256: sha256(canonicalResult) },
      complete: true,
      initialization: {
        base64: initializationBytes.toString('base64'),
        canonicalProfile: initialization.result.canonicalProfile,
        numericProfile: initialization.result.numericProfile,
        protocolVersion: initialization.result.protocolVersion,
        registryVersion: initialization.result.registryVersion,
        sha256: sha256(initializationBytes),
      },
      rows,
      schema: 'geospec-trusted-native-evaluation-v2',
      subjects: admitted.map(({ handle: _handle, ...entry }) => entry),
    };
    writeFileSync(1, canonical(record));
  } finally {
    for (const subject of admitted.toReversed()) {
      const releaseRequest = canonical({
        canonicalProfile: plan.authority.canonicalProfile,
        method: 'releaseSubject',
        protocolVersion: plan.authority.protocolVersion,
        registryVersion: plan.authority.registryVersion,
        requestId: `trusted-evaluator-release:${subject.slot}`,
        subjectHandle: subject.handle,
      });
      engine.releaseSubject(releaseRequest);
    }
  }
};

try {
  await main();
} catch (error) {
  writeFileSync(
    2,
    `${JSON.stringify({ code: 'EVALUATION_INFRASTRUCTURE', message: error.message, name: error.name })}\n`,
  );
  process.exitCode = 2;
}
