/* oxlint-disable typescript/no-confusing-void-expression, typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-return -- This installed JavaScript harness verifies the runtime package boundary. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Engine } from '@taucad/geospec-engine-native/node';
import { createGeoSpecAssertionClient } from 'geospec/assertion-client';
import { expect } from 'vitest';

export const GREEN_VOLUME = Object.freeze({
  value: Object.freeze({ greaterThanOrEqual: 1, lessThanOrEqual: 3 }),
});
export const RED_VOLUME = Object.freeze({
  value: Object.freeze({ greaterThanOrEqual: 3, lessThanOrEqual: 4 }),
});
export const MISSING_FILLET = Object.freeze({ radius: 1, tolerance: 0.02 });
export const COAXIAL_RELATIONSHIP = Object.freeze({
  relationships: Object.freeze([
    Object.freeze({
      angularToleranceDegrees: 0.5,
      kind: 'coaxial',
      subject: 'bolt.shank',
      target: 'plate.hole',
      tolerance: 0.02,
    }),
  ]),
});

const HALF_CUBE = Object.freeze({
  path: 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m1-installed-product-a1/reference-route/half-cube.materialized.glb',
  bytes: 1032,
  sha256: 'c6977b6f4074d6bf4875d6e9eeacda042a364979fa6c8f6870fdcae29122b272',
  subjectHash: '05a3e87a62715cae1f995bb4d20faa0161b72a02867dc7a310c949761ce65a35',
  request: {
    method: 'ingestSubject',
    requestId: 'admit-half-cube',
    protocolVersion: 3,
    registryVersion: 4,
    canonicalProfile: 'geospec-jcs-v1',
    format: 'glb',
    frame: { coordinateSystem: 'z-up', sourceUnit: 'mm', outputUnit: 'mm' },
    ingestOptions: {},
    primaryByteLength: 1032,
    resources: [],
  },
});

const STEP = Object.freeze({
  path: 'packages/geospec-engine/fixtures/clearance/bolt-clearance-hole-positive/model.step',
  bytes: 33_203,
  sha256: 'cb7e827571bb7ca65e5aa48f8467b850bc4ea66ef07eb5b389ebd20005339de4',
  subjectHash: '27c1aed9b8d0c3dec13faf7f65c337d0e794e7e99cb16f71fe89e3d0b61df80b',
  request: {
    canonicalProfile: 'geospec-jcs-v1',
    format: 'step',
    frame: { coordinateSystem: 'z-up', outputUnit: 'mm', sourceUnit: 'auto' },
    ingestOptions: { name: 'clearance.bolt-clearance-hole-positive' },
    method: 'ingestSubject',
    primaryByteLength: 33_203,
    protocolVersion: 3,
    registryVersion: 4,
    requestId: 'ingest-clearance-positive',
    resources: [],
  },
});

const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new TypeError(`${name} is required.`);
  }
  return value;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const byteRecord = (bytes) => {
  const value = Buffer.from(bytes);
  return {
    base64: value.toString('base64'),
    byteLength: value.byteLength,
    sha256: sha256(value),
    utf8: value.toString('utf8'),
  };
};
const frameworkResult = (error) => {
  if (!(error instanceof Error)) {
    return null;
  }
  try {
    return JSON.parse(error.message);
  } catch {
    return null;
  }
};
const errorRecord = (error) => ({
  constructorName: error?.constructor?.name ?? null,
  frameworkResult: frameworkResult(error),
  message: error instanceof Error ? error.message : String(error),
  name: error instanceof Error ? error.name : typeof error,
});

export const assertMissingBrepRefusal = (error) => {
  const result = frameworkResult(error);
  assert.equal(result.status, 'refused');
  assert.equal(result.diagnostics[0].code, 'GEOSPEC_EVIDENCE_UNSUPPORTED');
  assert.equal(result.diagnostics[0].details.matcher, 'toHaveFilletFeature');
  assert.equal(result.diagnostics[0].details.missing, 'exact BRep fillet-feature evidence');
};

export const createNativeFixture = (engineId) => {
  const workspaceRoot = requiredEnvironment('GEOSPEC_S7_WORKSPACE');
  const outputDirectory = requiredEnvironment('GEOSPEC_S7_OUTPUT');
  mkdirSync(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, `${engineId}.observations.json`);
  const engine = new Engine();
  const events = [];
  const admittedSubjects = [];
  let volumeSubject;
  let relationshipSubject;

  const identity = () => ({
    engineId,
    pid: process.pid,
    poolId: process.env.VITEST_POOL_ID ?? null,
    task: expect.getState().currentTestName ?? null,
  });
  const save = () => {
    writeFileSync(
      outputPath,
      `${JSON.stringify(
        {
          attempt: process.env.GEOSPEC_S7_ATTEMPT ?? null,
          engineCloseAvailable: typeof engine.close === 'function',
          events,
          identity: identity(),
        },
        null,
        2,
      )}\n`,
    );
  };
  const record = (stage, value) => {
    events.push({ identity: identity(), stage, ...value });
    save();
  };
  // oxlint-disable-next-line max-params -- The fourth value is optional evidence beside the byte call.
  const invokeBytes = (stage, input, invoke, extra = {}) => {
    try {
      const output = invoke();
      record(stage, { ...extra, input: byteRecord(input), output: byteRecord(output) });
      return output;
    } catch (error) {
      record(stage, { ...extra, error: errorRecord(error), input: byteRecord(input) });
      throw error;
    }
  };
  const transport = {
    evaluateClaim: (request) => {
      try {
        const evaluation = engine.evaluateClaim(Buffer.from(request));
        record('evaluate-claim', {
          claim: byteRecord(evaluation.canonicalClaim),
          input: byteRecord(request),
          output: byteRecord(evaluation.canonicalResult),
          plan: byteRecord(evaluation.canonicalPlan),
        });
        return evaluation;
      } catch (error) {
        record('evaluate-claim', { error: errorRecord(error), input: byteRecord(request) });
        throw error;
      }
    },
    processRequest: (request) =>
      invokeBytes('process-request', request, () => engine.processRequest(Buffer.from(request))),
  };
  const client = createGeoSpecAssertionClient({ engine: transport });

  const admit = (fixture, name) => {
    const primary = readFileSync(resolve(workspaceRoot, fixture.path));
    assert.equal(primary.byteLength, fixture.bytes);
    assert.equal(sha256(primary), fixture.sha256);
    const request = Buffer.from(JSON.stringify(fixture.request));
    const receiptBytes = invokeBytes(`admit-${name}`, request, () => engine.ingestSubject(request, primary, []), {
      primary: { byteLength: primary.byteLength, sha256: sha256(primary) },
      resources: [],
    });
    const receipt = JSON.parse(Buffer.from(receiptBytes).toString('utf8'));
    assert.equal(receipt.result.subject.subjectHash, fixture.subjectHash);
    admittedSubjects.push({ name, subjectHash: fixture.subjectHash });
    return { subjectHash: fixture.subjectHash };
  };

  return {
    client,
    delayedVolumeSubject: async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      assert.ok(volumeSubject);
      return volumeSubject;
    },
    relationshipSubject: () => {
      assert.ok(relationshipSubject);
      return relationshipSubject;
    },
    volumeSubject: () => {
      assert.ok(volumeSubject);
      return volumeSubject;
    },
    recordError: (stage, error) => {
      record(stage, { error: errorRecord(error) });
    },
    open: () => {
      record('session-open', {});
      volumeSubject = admit(HALF_CUBE, 'half-cube');
      relationshipSubject = admit(STEP, 'step');
    },
    close: () => {
      for (const subject of admittedSubjects.reverse()) {
        const handleRequest = Buffer.from(
          JSON.stringify({
            method: 'subjectHandle',
            requestId: `handle-${subject.name}`,
            protocolVersion: 3,
            registryVersion: 4,
            canonicalProfile: 'geospec-jcs-v1',
            subjectHash: subject.subjectHash,
          }),
        );
        const handleBytes = invokeBytes(`handle-${subject.name}`, handleRequest, () =>
          engine.subjectHandle(handleRequest),
        );
        const handle = JSON.parse(Buffer.from(handleBytes).toString('utf8')).result.subjectHandle;
        const request = Buffer.from(
          JSON.stringify({
            method: 'releaseSubject',
            requestId: `release-${subject.name}`,
            protocolVersion: 3,
            registryVersion: 4,
            canonicalProfile: 'geospec-jcs-v1',
            subjectHandle: handle,
          }),
        );
        const released = invokeBytes(`release-${subject.name}`, request, () => engine.releaseSubject(request));
        assert.equal(JSON.parse(Buffer.from(released).toString('utf8')).result.released, true);
      }
      record('session-close', { engineCloseAvailable: typeof engine.close === 'function' });
    },
  };
};
