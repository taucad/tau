/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-imports -- Installed-corpus records cross an intentionally untyped, hash-bound JSON boundary. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createGeoSpecAssertionClient, GeoSpecAssertionError } from 'geospec/assertion-client';
import { createGeoSpecVitestAdapter } from 'geospec/vitest';
import { loadM3CorpusProfileV3 } from './profile-v3.mjs';
import { loadCurrentM3CampaignProfileV4 } from './profile-v4.mjs';
import { requireEvaluationEnvelope } from './corpus.mjs';
import { fixturePath, readFixture } from '../fixtures/read-fixture.mjs';

const backend = process.env.GEOSPEC_INSTALLED_BACKEND ?? 'native';
assert.ok(backend === 'native' || backend === 'mixed');
const backendSpecifier =
  backend === 'mixed' ? '@taucad/geospec-engine-native/wasm' : '@taucad/geospec-engine-native/node';
const nativeModule = await import(backendSpecifier);
if (backend === 'mixed') {
  await nativeModule.initialize();
}
const { canonicalize, Engine, ProtocolError } = nativeModule;

const PROFILE = 'geospec-st-prototypes-v4';
const CANONICAL_PROFILE = 'geospec-jcs-v1';
const CONTINUOUS_INPUT_SHA256 = '6ccb5bd597728f65748244334c16a663c6469d18887545b7c173060e657187a6';
const CONTINUOUS_BUDGET_SHA256 = '4709e8dda424943db7f202f2e40bbdb8e394b4ee86ef4998efdf00a955ee98c4';

const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const byteRecord = (bytes) => {
  const value = Buffer.from(bytes);
  return {
    byteLength: value.byteLength,
    sha256: sha256(value),
    utf8: value.toString('utf8'),
  };
};

const binaryRecord = (bytes) => {
  const value = Buffer.from(bytes);
  return { byteLength: value.byteLength, sha256: sha256(value) };
};

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const errorRecord = (error) => {
  const actual = error && typeof error === 'object' ? Reflect.get(error, 'actual') : undefined;
  const structured =
    actual && typeof actual === 'object'
      ? {
          claimId: Reflect.get(actual, 'claimId') ?? null,
          diagnostics: Reflect.get(actual, 'diagnostics') ?? null,
          status: Reflect.get(actual, 'status') ?? null,
        }
      : null;
  return {
    name: error instanceof Error ? error.name : typeof error,
    constructorName: error?.constructor?.name ?? null,
    code: typeof error?.code === 'string' ? error.code : null,
    message: error instanceof Error ? error.message : String(error),
    assertionError: error instanceof GeoSpecAssertionError,
    protocolError: error instanceof ProtocolError,
    structuredGeoSpec: structured,
  };
};

const restoreJavascriptValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => restoreJavascriptValue(entry));
  }
  if (value && typeof value === 'object') {
    if (value.type === 'regexp' && typeof value.pattern === 'string' && typeof value.flags === 'string') {
      return new RegExp(value.pattern, value.flags);
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, restoreJavascriptValue(entry)]));
  }
  return value;
};

const argumentContract = (sourceRow, authoredRequestUtf8) => {
  const authoredClaim = JSON.parse(authoredRequestUtf8).plan.claims[0];
  if (Array.isArray(authoredClaim.payload?.arguments)) {
    return {
      argumentsProtocolJson: authoredClaim.payload.arguments,
      derivation: 'exact-authored-arguments',
      queryPayload: authoredClaim.payload,
    };
  }
  if (
    sourceRow.capability === 'toBeWatertight' ||
    sourceRow.capability === 'toSatisfyRationalPlate' ||
    sourceRow.capability === 'toSatisfyParallelPlaneDistance'
  ) {
    return {
      argumentsProtocolJson: [],
      derivation: 'exact-nullary-contract',
      queryPayload: authoredClaim.payload,
    };
  }
  if (!sourceRow.capability.startsWith('to')) {
    return {
      argumentsProtocolJson: [],
      derivation: 'exact-authored-query-payload',
      queryPayload: authoredClaim.payload,
    };
  }
  assert.notEqual(
    authoredClaim.payload?.expected,
    undefined,
    `${sourceRow.id}: source descriptor has no reversible expected value`,
  );
  return {
    argumentsProtocolJson: [authoredClaim.payload.expected],
    derivation: 'source-declared-descriptor-reversal',
    queryPayload: authoredClaim.payload,
  };
};

const campaignRow = (sourceRow, binding) => {
  const canonicalPlanUtf8 =
    binding.canonicalPlan.status === 'success'
      ? binding.canonicalPlan.canonicalUtf8
      : binding.canonicalPlan.derivationUtf8;
  const { plan } = JSON.parse(canonicalPlanUtf8);
  const claim = plan.claims[0];
  const subject = plan.subjects[0];
  const identityField = Object.hasOwn(subject, 'subjectHash') ? 'subjectHash' : 'contentHash';
  const authoring = argumentContract(sourceRow, binding.authoredRequestUtf8);
  return {
    id: sourceRow.id,
    cohort: sourceRow.cohort,
    capability: sourceRow.capability,
    polarity: claim.polarity,
    matcher: sourceRow.capability.startsWith('to'),
    claimId: claim.claimId,
    subjectSlot: claim.subjectSlots[0],
    workUnitBudget: claim.workUnitBudget,
    identityField,
    expectedIdentity: subject[identityField],
    authoredRequestUtf8: binding.authoredRequestUtf8,
    authoring,
    sourceRow,
    expected: {
      canonicalPlan: binding.canonicalPlan,
      canonicalResultUtf8: binding.expected.evaluatePlanResultUtf8,
      status: binding.expected.status,
      protocolError: sourceRow.expected.independentCorrectness.protocolError,
      measurement: binding.expected.measurement,
      source: binding.expected.source,
      sourceV2: binding.expected.sourceV2,
      referenceCompatibility: binding.expected.referenceCompatibility,
      empiricalProfileConformance: binding.expected.empiricalProfileConformance,
      withheldV2: binding.expected.withheldV2,
    },
  };
};

const f1CampaignRow = (sourceRow, binding) => {
  const { plan } = JSON.parse(binding.canonicalPlanUtf8);
  const claim = plan.claims[0];
  const subject = plan.subjects[0];
  const identityField = Object.hasOwn(subject, 'subjectHash') ? 'subjectHash' : 'contentHash';
  return {
    id: sourceRow.id,
    cohort: sourceRow.cohort,
    capability: sourceRow.capability,
    polarity: claim.polarity,
    matcher: true,
    claimId: claim.claimId,
    subjectSlot: claim.subjectSlots[0],
    workUnitBudget: claim.workUnitBudget,
    identityField,
    expectedIdentity: subject[identityField],
    authoredRequestUtf8: binding.submitRequestUtf8,
    authoring: {
      argumentsProtocolJson: [],
      derivation: 'exact-nullary-contract',
      queryPayload: claim.payload,
    },
    sourceRow,
    expected: {
      canonicalPlan: {
        status: 'success',
        canonicalUtf8: binding.canonicalPlanUtf8,
      },
      canonicalResultUtf8: binding.neutralResult.canonicalUtf8,
      status: 'full',
      protocolError: null,
      measurement: sourceRow.expected.independentCorrectness.measurement,
      source: 'packages/geospec/host-tests/m3-corpus/profile-v3.mjs',
      sourceV2: sourceRow.expected.independentCorrectness.source,
      referenceCompatibility: sourceRow.expected.referenceCompatibility,
      empiricalProfileConformance: sourceRow.expected.empiricalProfileConformance,
      withheldV2: null,
    },
  };
};

// Retained prospective adapter for the immutable legacy profile; current CI uses the independent overlay below.
export const loadProspectiveInstalledCampaign = () => {
  const profile = loadM3CorpusProfileV3(requiredEnvironment('GEOSPEC_WORKSPACE_ROOT'));
  const rows = profile.rows.map((binding) => campaignRow(binding.sourceRow, binding));
  const f1Bindings = new Map(profile.f1.rows.map((row) => [row.id, row]));
  for (const sourceRow of profile.sourceCorpus.rows.filter((row) => row.cohort === 'F1')) {
    const binding = f1Bindings.get(sourceRow.id);
    assert.ok(binding, `${sourceRow.id}: missing prospective F1 binding`);
    rows.push(f1CampaignRow(sourceRow, binding));
  }
  assert.equal(rows.length, 334);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  return {
    schemaVersion: 1,
    taskId: 'M3-INSTALLED-CORPUS-A1',
    numericProfile: 'geospec-st-logical-requests-v3',
    sourceCorpusFingerprint: profile.sourceCorpus.fingerprint,
    rows,
  };
};

const materializeCampaignBytes = (campaignPath, record, label) => {
  assert.equal(typeof record?.path, 'string', `${label}: path is required`);
  assert.equal(typeof record?.byteLength, 'number', `${label}: byteLength is required`);
  assert.equal(typeof record?.sha256, 'string', `${label}: sha256 is required`);
  const bytes = readFileSync(resolve(dirname(campaignPath), record.path));
  assert.equal(bytes.byteLength, record.byteLength, `${label}: byteLength`);
  assert.equal(sha256(bytes), record.sha256, `${label}: sha256`);
  return bytes;
};

const materializeCampaignRow = (campaignPath, row) => {
  if (row.expected.canonicalResultUtf8 !== null) {
    const evaluation = requireEvaluationEnvelope(row.expected.canonicalResultUtf8, row.id);
    const planUtf8 = row.expected.canonicalPlan.canonicalUtf8 ?? row.expected.canonicalPlan.derivationUtf8;
    assert.equal(evaluation.numericProfile, JSON.parse(planUtf8).numericProfile, `${row.id}: expected profile join`);
  }
  const { transport } = row.sourceRow;
  assert.ok(Array.isArray(transport.resourceBuffers));
  return {
    ...row,
    sourceRow: {
      ...row.sourceRow,
      transport: {
        ...transport,
        primaryBuffer: materializeCampaignBytes(campaignPath, transport.primaryBuffer, `${row.id}: primaryBuffer`),
        resourceBuffers: transport.resourceBuffers.map((record, index) =>
          materializeCampaignBytes(campaignPath, record, `${row.id}: resourceBuffers[${index}]`),
        ),
      },
    },
    ...(row.warmup ? { warmup: materializeCampaignRow(campaignPath, row.warmup) } : {}),
  };
};

const loadDefaultInstalledCampaign = () => {
  const campaign = loadCurrentM3CampaignProfileV4(backend, requiredEnvironment('GEOSPEC_WORKSPACE_ROOT'));
  return {
    ...campaign,
    rows: campaign.rows.map((row) => materializeCampaignRow(campaign.sourcePath, row)),
  };
};

const loadSupplementalCampaign = (inputPath) => {
  const campaignPath = resolve(inputPath);
  const campaign = readBoundJson(campaignPath, requiredEnvironment('GEOSPEC_CAMPAIGN_INPUTS_SHA256'));
  assert.equal(campaign.numericProfile, PROFILE);
  assert.ok(Array.isArray(campaign.rows));
  for (const row of campaign.rows) {
    assert.equal(typeof row.id, 'string');
    assert.notEqual(row.id.length, 0);
  }
  assert.equal(new Set(campaign.rows.map((row) => row.id)).size, campaign.rows.length);
  return {
    ...campaign,
    backend,
    rows: campaign.rows.map((row) => materializeCampaignRow(campaignPath, row)),
  };
};

export const loadInstalledCampaign = () => {
  const inputPath = process.env.GEOSPEC_CAMPAIGN_INPUTS;
  return inputPath ? loadSupplementalCampaign(inputPath) : loadDefaultInstalledCampaign();
};

const continuousPath = (name) =>
  fixturePath(
    `docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m3-geometry-a1/continuous-public-a1/${name}`,
    requiredEnvironment('GEOSPEC_WORKSPACE_ROOT'),
  );

const readBoundJson = (path, expectedSha256) => {
  const bytes = readFileSync(path);
  assert.equal(sha256(bytes), expectedSha256);
  return JSON.parse(bytes);
};

const continuousRow = (source) => {
  const workspaceRoot = requiredEnvironment('GEOSPEC_WORKSPACE_ROOT');
  const primary = readFixture(source.subject.path, workspaceRoot);
  assert.equal(primary.byteLength, source.subject.byteLength);
  assert.equal(sha256(primary), source.subject.sha256);
  return {
    id: source.id,
    cohort: source.cohort,
    capability: source.matcher,
    polarity: source.polarity,
    matcher: true,
    claimId: source.claimId,
    subjectSlot: source.subjectSlot,
    workUnitBudget: source.workUnitBudget,
    identityField: 'subjectHash',
    expectedIdentity: null,
    authoredRequestUtf8: null,
    authoring: {
      argumentsProtocolJson: [source.options],
      derivation: 'exact-independent-continuous-input',
      queryPayload: null,
    },
    sourceRow: {
      transport: {
        ingestRequestUtf8: JSON.stringify(source.ingestRequest),
        primaryBuffer: primary,
        resourceBuffers: [],
      },
    },
    expected: {
      protocolError: null,
      status: source.expectedStatus,
      independentPositiveSatisfied: source.independentPositiveSatisfied,
    },
  };
};

const loadContinuousInputs = () => {
  const source = readBoundJson(continuousPath('inputs.json'), CONTINUOUS_INPUT_SHA256);
  assert.equal(source.numericProfile, 'geospec-st-logical-requests-v3');
  assert.equal(source.rows.length, 18);
  return source.rows.map(continuousRow);
};

const loadContinuousBudgets = () => {
  const rows = new Map(loadContinuousInputs().map((row) => [row.id, row]));
  const source = readBoundJson(continuousPath('budget-controls.json'), CONTINUOUS_BUDGET_SHA256);
  assert.equal(source.sourceInputsSha256, CONTINUOUS_INPUT_SHA256);
  assert.equal(source.controls.length, 6);
  return source.controls.flatMap((control) =>
    control.runs.map((run) => {
      const base = rows.get(control.baseRowId);
      assert.ok(base, `${control.id}: missing base row`);
      return {
        ...base,
        id: `${control.id}/${run}`,
        workUnitBudget: control.budget,
        expected: {
          ...base.expected,
          status: control.expectedStatus,
          diagnosticCode: control.expectedDiagnosticCode,
          unitsUsed: control.expectedUnitsUsed,
        },
        budgetControl: { ...control, run },
        warmup:
          run === 'warm'
            ? {
                ...base,
                id: `${control.id}/warmup`,
                claimId: `${base.claimId}.warmup.${control.id}`,
              }
            : null,
      };
    }),
  );
};

// oxlint-disable-next-line max-params -- A call record keeps its operation, bytes, invocation, and optional transfer metadata together.
const callRecord = (operation, input, invoke, extra = {}) => {
  const record = { operation, input: byteRecord(input), ...extra };
  try {
    const output = invoke();
    record.output = byteRecord(output);
    return { record, output };
  } catch (error) {
    record.error = errorRecord(error);
    return { record, error };
  }
};

const campaignRegistryVersion = (row) => JSON.parse(row.sourceRow.transport.ingestRequestUtf8).registryVersion;

const initializeCase = (nativeEngine, row) => {
  const input = Buffer.from(
    JSON.stringify({
      method: 'initialize',
      requestId: `installed-corpus-init:${row.id}`,
      protocolVersion: 3,
      registryVersion: campaignRegistryVersion(row),
      canonicalProfile: CANONICAL_PROFILE,
    }),
  );
  const call = callRecord('processRequest.initialize', input, () => nativeEngine.processRequest(input));
  if (call.output) {
    const { result } = JSON.parse(Buffer.from(call.output).toString('utf8'));
    assert.equal(result.numericProfile, PROFILE);
    assert.equal(result.canonicalProfile, CANONICAL_PROFILE);
    assert.equal(result.registryVersion, campaignRegistryVersion(row));
  }
  return call;
};

const admitCase = (nativeEngine, row) => {
  const input = Buffer.from(row.sourceRow.transport.ingestRequestUtf8);
  const primary = row.sourceRow.transport.primaryBuffer;
  const resources = row.sourceRow.transport.resourceBuffers;
  const call = callRecord('ingestSubject', input, () => nativeEngine.ingestSubject(input, primary, resources), {
    primary: binaryRecord(primary),
    resources: resources.map((value) => binaryRecord(value)),
  });
  if (!call.output) {
    return call;
  }
  const receipt = JSON.parse(Buffer.from(call.output).toString('utf8'));
  const actualIdentity = receipt.result.subject[row.identityField];
  if (row.expectedIdentity !== null) {
    assert.equal(actualIdentity, row.expectedIdentity);
  }
  const subject = { [row.identityField]: actualIdentity };
  const handleInput = Buffer.from(
    JSON.stringify({
      method: 'subjectHandle',
      requestId: `installed-corpus-handle:${row.id}`,
      protocolVersion: 3,
      registryVersion: campaignRegistryVersion(row),
      canonicalProfile: CANONICAL_PROFILE,
      [row.identityField]: actualIdentity,
    }),
  );
  const handleCall = callRecord('subjectHandle', handleInput, () => nativeEngine.subjectHandle(handleInput));
  if (!handleCall.output) {
    return { ...call, subject, handleCall, error: handleCall.error };
  }
  const handle = JSON.parse(Buffer.from(handleCall.output).toString('utf8')).result.subjectHandle;
  return { ...call, subject, handle, handleCall };
};

const releaseCase = (nativeEngine, row, handle) => {
  if (!handle) {
    return {
      status: 'not-acquired',
    };
  }
  const input = Buffer.from(
    JSON.stringify({
      method: 'releaseSubject',
      requestId: `installed-corpus-release:${row.id}`,
      protocolVersion: 3,
      registryVersion: campaignRegistryVersion(row),
      canonicalProfile: CANONICAL_PROFILE,
      subjectHandle: handle,
    }),
  );
  const call = callRecord('releaseSubject', input, () => nativeEngine.releaseSubject(input));
  return {
    status: call.output ? 'released' : 'release-error',
    call: call.record,
  };
};

const recordingEngine = (nativeEngine) => {
  const calls = [];
  const forward = (operation, input, invoke) => {
    const call = callRecord(operation, input, invoke);
    calls.push(call.record);
    if (call.error) {
      // oxlint-disable-next-line typescript/only-throw-error -- Preserve the exact native thrown value after recording it.
      throw call.error;
    }
    return call.output;
  };
  return {
    calls,
    engine: {
      processRequest: (input) => forward('processRequest', input, () => nativeEngine.processRequest(input)),
      canonicalPlan: (input) => forward('canonicalPlan', input, () => nativeEngine.canonicalPlan(input)),
      evaluatePlan: (input) => forward('evaluatePlan', input, () => nativeEngine.evaluatePlan(input)),
    },
  };
};

const reportRecord = (report) => ({
  canonicalClaim: byteRecord(report.canonicalClaim),
  canonicalPlan: byteRecord(report.canonicalPlan),
  canonicalResult: byteRecord(report.canonicalResult),
  claim: report.claim,
  claimId: report.claimId,
  diagnostics: report.diagnostics,
  evidence: report.evidence ?? null,
  polarity: report.polarity,
  result: report.result,
  status: report.status,
});

const reportFromCalls = (calls) => {
  const planCall = calls.find((call) => call.operation === 'canonicalPlan');
  const resultCall = calls.find((call) => call.operation === 'evaluatePlan');
  if (!planCall?.output || !resultCall?.output) {
    return null;
  }
  const plan = JSON.parse(planCall.output.utf8);
  const resultEnvelope = JSON.parse(resultCall.output.utf8);
  const claim = plan.plan.claims[0];
  const result = resultEnvelope.results[0];
  return reportRecord({
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
  });
};

const directProtocolOutcome = (nativeEngine, row) => {
  const input = Buffer.from(row.authoredRequestUtf8);
  const call = callRecord('canonicalPlan.direct-negative-ancillary', input, () => nativeEngine.canonicalPlan(input));
  return {
    calls: [call.record],
    error: call.error ? call.record.error : null,
    report: null,
    publicSurfaceLimitation:
      'Ancillary queries are positive-only in the public assertion-client surface; this frozen negative control remains a direct canonical-plan probe.',
  };
};

const standaloneEvaluation = async (nativeEngine, row, subject) => {
  if (row.expected.protocolError) {
    return directProtocolOutcome(nativeEngine, row);
  }
  const recorder = recordingEngine(nativeEngine);
  const client = createGeoSpecAssertionClient({
    engine: recorder.engine,
    canonicalize,
    claimId: () => row.claimId,
    subjectSlot: row.subjectSlot,
    workUnitLimit: row.workUnitBudget,
  });
  let report;
  let failure;
  try {
    if (row.matcher) {
      const chain = client.expectGeo(subject);
      const methods = row.polarity === 'negative' ? chain.not : chain;
      report = await Reflect.apply(
        methods[row.capability],
        methods,
        restoreJavascriptValue(row.authoring.argumentsProtocolJson),
      );
    } else {
      report = await client.query({
        capability: row.capability,
        claimId: row.claimId,
        payload: restoreJavascriptValue(row.authoring.queryPayload),
        subject,
      });
    }
  } catch (error) {
    failure = errorRecord(error);
    if (error instanceof GeoSpecAssertionError) {
      report = error.report;
    }
  }
  return {
    calls: recorder.calls,
    error: failure ?? null,
    report: report ? reportRecord(report) : null,
    publicSurfaceLimitation: null,
  };
};

// oxlint-disable-next-line max-params -- Vitest evaluation additionally requires the installed host expect function.
const vitestEvaluation = async (nativeEngine, row, subject, hostExpect) => {
  if (row.expected.protocolError) {
    return directProtocolOutcome(nativeEngine, row);
  }
  const recorder = recordingEngine(nativeEngine);
  const client = createGeoSpecAssertionClient({
    engine: recorder.engine,
    canonicalize,
    claimId: () => row.claimId,
    subjectSlot: row.subjectSlot,
    workUnitLimit: row.workUnitBudget,
  });
  let report;
  let failure;
  try {
    if (row.matcher) {
      hostExpect.extend(createGeoSpecVitestAdapter(client).matchers);
      const expectation = row.polarity === 'negative' ? hostExpect(subject).not : hostExpect(subject);
      await Reflect.apply(
        expectation[row.capability],
        expectation,
        restoreJavascriptValue(row.authoring.argumentsProtocolJson),
      );
    } else {
      report = await client.query({
        capability: row.capability,
        claimId: row.claimId,
        payload: restoreJavascriptValue(row.authoring.queryPayload),
        subject,
      });
    }
  } catch (error) {
    failure = errorRecord(error);
  }
  const capturedReport = report ? reportRecord(report) : reportFromCalls(recorder.calls);
  return {
    calls: recorder.calls,
    error: failure ?? null,
    report: capturedReport,
    publicSurfaceLimitation: null,
  };
};

// oxlint-disable-next-line max-params -- Cleanup attaches the one case's engine/row/handle record to its outcome.
const attachCleanup = (outcome, nativeEngine, row, handle) => {
  if (!nativeEngine) {
    outcome.stages.cleanup = { status: 'not-acquired', close: 'not-created' };
    return outcome;
  }
  outcome.stages.cleanup = releaseCase(nativeEngine, row, handle);
  try {
    nativeEngine.close();
    outcome.stages.cleanup.close = 'closed';
  } catch (error) {
    outcome.stages.cleanup.close = 'close-error';
    outcome.stages.cleanup.closeError = errorRecord(error);
  }
  return outcome;
};

export const runInstalledRow = async (row, route, hostExpect) => {
  let nativeEngine;
  let initialized;
  let admission;
  let outcome;
  try {
    nativeEngine = new Engine();
    initialized = initializeCase(nativeEngine, row);
    if (initialized.error) {
      outcome = {
        id: row.id,
        route,
        routeState: 'initialization-error',
        authoring: row.authoring,
        error: initialized.record.error,
        report: null,
        stages: { initialize: initialized.record },
      };
      return outcome;
    }
    admission = admitCase(nativeEngine, row);
    if (admission.error) {
      const admitted = Boolean(admission.output);
      outcome = {
        id: row.id,
        route,
        routeState: admitted ? 'subject-handle-error' : 'admission-error',
        authoring: row.authoring,
        admittedIdentity: admitted
          ? {
              field: row.identityField,
              expected: row.expectedIdentity,
              actual: admission.subject[row.identityField],
            }
          : null,
        error: admitted ? admission.handleCall.record.error : admission.record.error,
        report: null,
        stages: {
          initialize: initialized.record,
          admission: admission.record,
          subjectHandle: admission.handleCall?.record ?? null,
        },
      };
      return outcome;
    }
    const warmup = row.warmup ? await standaloneEvaluation(nativeEngine, row.warmup, admission.subject) : null;
    const evaluation = hostExpect
      ? await vitestEvaluation(nativeEngine, row, admission.subject, hostExpect)
      : await standaloneEvaluation(nativeEngine, row, admission.subject);
    outcome = {
      id: row.id,
      route,
      routeState: 'evaluated',
      authoring: row.authoring,
      admittedIdentity: {
        field: row.identityField,
        expected: row.expectedIdentity,
        actual: admission.subject[row.identityField],
      },
      error: evaluation.error,
      report: evaluation.report,
      publicSurfaceLimitation: evaluation.publicSurfaceLimitation,
      stages: {
        initialize: initialized.record,
        admission: admission.record,
        subjectHandle: admission.handleCall.record,
        warmup,
        evaluation: evaluation.calls,
      },
    };
    return outcome;
  } catch (error) {
    outcome = {
      id: row.id,
      route,
      routeState: 'harness-error',
      authoring: row.authoring,
      error: errorRecord(error),
      report: null,
      stages: {
        initialize: initialized?.record ?? null,
        admission: admission?.record ?? null,
        subjectHandle: admission?.handleCall?.record ?? null,
        evaluation: [],
      },
    };
    return outcome;
  } finally {
    if (outcome) {
      attachCleanup(outcome, nativeEngine, row, admission?.handle);
    }
  }
};

const runContinuousCampaign = async (kind, hostExpect) => {
  const rows = kind === 'nominal' ? loadContinuousInputs() : loadContinuousBudgets();
  const output = {
    schemaVersion: 1,
    taskId: `M3-CONTINUOUS-PUBLIC-A1-${kind}`,
    route: hostExpect ? 'javascript-vitest' : 'javascript-standalone',
    numericProfile: PROFILE,
    sourceInputsSha256: CONTINUOUS_INPUT_SHA256,
    budgetControlsSha256: kind === 'budget' ? CONTINUOUS_BUDGET_SHA256 : null,
    provenance: provenance(`javascript-standalone-continuous-${kind}`),
    rows: [],
  };
  const outputPath = requiredEnvironment(kind === 'nominal' ? 'GEOSPEC_CONTINUOUS_OUTPUT' : 'GEOSPEC_BUDGET_OUTPUT');
  try {
    for (const row of rows) {
      // oxlint-disable-next-line no-await-in-loop -- Each installed native case is intentionally isolated and serial.
      const outcome = await runInstalledRow(row, output.route, hostExpect);
      outcome.expected = row.expected;
      outcome.budgetControl = row.budgetControl ?? null;
      output.rows.push(outcome);
      outcome.comparison = compareRecord(row, outcome);
    }
    assert.deepEqual(
      output.rows.flatMap((outcome) => outcome.comparison.hardFailures.map((failure) => `${outcome.id}: ${failure}`)),
      [],
      'Installed campaign did not satisfy its independent expectations',
    );
  } finally {
    writeJson(outputPath, output);
  }
  return output;
};

export const runVitestContinuousCampaign = async (kind, hostExpect) => runContinuousCampaign(kind, hostExpect);

const moduleRecord = (specifier) => {
  const path = fileURLToPath(import.meta.resolve(specifier));
  const bytes = readFileSync(path);
  return {
    specifier,
    path,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
};

const provenance = (route) => ({
  route,
  backend,
  execPath: process.execPath,
  node: process.version,
  modules: [
    moduleRecord('geospec/assertion-client'),
    moduleRecord('geospec/vitest'),
    moduleRecord(backendSpecifier),
    moduleRecord('vitest/package.json'),
  ],
});

const runCampaign = async (route, outputPath, hostExpect) => {
  const campaign = loadInstalledCampaign();
  const output = {
    schemaVersion: 1,
    taskId: campaign.taskId,
    route,
    sourceCorpusFingerprint: campaign.sourceCorpusFingerprint,
    provenance: provenance(route),
    rows: [],
  };
  try {
    for (const row of campaign.rows) {
      // oxlint-disable-next-line no-await-in-loop -- The native engine is thread-confined and this acceptance route is explicitly serial.
      const outcome = await runInstalledRow(row, route, hostExpect);
      output.rows.push(outcome);
      outcome.comparison = compareRecord(row, outcome);
    }
    assert.equal(output.rows.length, campaign.rows.length);
    assert.deepEqual(
      output.rows.flatMap((outcome) => outcome.comparison.hardFailures.map((failure) => `${outcome.id}: ${failure}`)),
      [],
      'Installed campaign did not satisfy its independent expectations',
    );
  } finally {
    writeJson(outputPath, output);
  }
  return output;
};

export const runVitestCampaign = async (hostExpect) => {
  const output = await runCampaign('javascript-vitest', requiredEnvironment('GEOSPEC_VITEST_OUTPUT'), hostExpect);
  return output;
};

const fixtureRecord = (cacheRoot, bytes, name = null) => {
  const digest = sha256(bytes);
  const path = resolve(cacheRoot, digest);
  mkdirSync(cacheRoot, { recursive: true });
  try {
    assert.equal(sha256(readFileSync(path)), digest);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
    writeFileSync(path, bytes);
  }
  return { path, byteLength: bytes.byteLength, sha256: digest, name };
};

const pythonRowRecord = (row, fixtureCache) => {
  const ingest = JSON.parse(row.sourceRow.transport.ingestRequestUtf8);
  return {
    id: row.id,
    cohort: row.cohort,
    capability: row.capability,
    polarity: row.polarity,
    matcher: row.matcher,
    claimId: row.claimId,
    subjectSlot: row.subjectSlot,
    workUnitBudget: row.workUnitBudget,
    identityField: row.identityField,
    expectedIdentity: row.expectedIdentity,
    authoredRequestUtf8: row.authoredRequestUtf8,
    authoring: row.authoring,
    admission: {
      format: ingest.format,
      frame: ingest.frame,
      ingestOptions: ingest.ingestOptions,
    },
    subject: {
      descriptor: row.sourceRow.identity?.descriptorUtf8 ? JSON.parse(row.sourceRow.identity.descriptorUtf8) : null,
      primary: fixtureRecord(fixtureCache, row.sourceRow.transport.primaryBuffer),
      resources: row.sourceRow.transport.resourceBuffers.map((bytes, index) =>
        fixtureRecord(fixtureCache, bytes, ingest.resources[index]?.name ?? null),
      ),
    },
    expected: row.expected,
    budgetControl: row.budgetControl ?? null,
    warmup: row.warmup ? pythonRowRecord(row.warmup, fixtureCache) : null,
  };
};

const preparePythonMap = (campaign = loadInstalledCampaign()) => {
  const fixtureCache = requiredEnvironment('GEOSPEC_FIXTURE_CACHE');
  const rows = campaign.rows.map((row) => pythonRowRecord(row, fixtureCache));
  const output = {
    schemaVersion: campaign.schemaVersion,
    taskId: campaign.taskId,
    numericProfile: campaign.numericProfile,
    sourceCorpusFingerprint: campaign.sourceCorpusFingerprint,
    rows,
  };
  writeJson(requiredEnvironment('GEOSPEC_INSTALLED_MAP'), output);
  return output;
};

const continuousPythonCampaign = (kind) => ({
  schemaVersion: 1,
  taskId: `M3-CONTINUOUS-PUBLIC-A1-${kind}`,
  numericProfile: PROFILE,
  sourceCorpusFingerprint: CONTINUOUS_INPUT_SHA256,
  rows: kind === 'nominal' ? loadContinuousInputs() : loadContinuousBudgets(),
});

// oxlint-disable-next-line complexity -- One comparison keeps the three evidence tracks explicit in the persisted row record.
const compareRecord = (row, outcome) => {
  const { report } = outcome;
  const planUtf8 = row.expected.canonicalPlan
    ? row.expected.canonicalPlan.status === 'success'
      ? row.expected.canonicalPlan.canonicalUtf8
      : row.expected.canonicalPlan.derivationUtf8
    : null;
  const claim = planUtf8 === null ? null : JSON.parse(planUtf8).plan.claims[0];
  const canonicalClaimUtf8 = claim === null ? null : byteRecord(canonicalize(Buffer.from(JSON.stringify(claim)))).utf8;
  const protocol = row.expected.protocolError;
  const actualError = outcome.error;
  const planEqual = planUtf8 === null ? null : report?.canonicalPlan?.utf8 === planUtf8;
  const claimEqual = canonicalClaimUtf8 === null ? null : report?.canonicalClaim?.utf8 === canonicalClaimUtf8;
  const resultEqual =
    row.expected.canonicalResultUtf8 === null || row.expected.canonicalResultUtf8 === undefined
      ? null
      : report?.canonicalResult?.utf8 === row.expected.canonicalResultUtf8;
  // "full" is a legacy authority label, not a verdict. Use only its frozen result.
  const expectedStatus =
    row.expected.status === 'full' && row.expected.canonicalResultUtf8
      ? JSON.parse(row.expected.canonicalResultUtf8).results.find((result) => result.claimId === row.claimId)?.status
      : row.expected.status;
  const statusKnown = ['passed', 'failed', 'unsupported', 'refused', 'invalid', 'cancelled', 'engine-error'].includes(
    expectedStatus,
  );
  const statusEqual = statusKnown && !protocol ? report?.status === expectedStatus : null;
  const exactResultAuthority =
    row.cohort === 'F1' ||
    row.expected.measurement?.classification === 'exact-domain-control' ||
    row.expected.measurement?.classification === 'nonmeasurement';
  const accuracyContract = row.expected.measurement?.accuracyContract ?? null;
  const protocolEqual = protocol
    ? actualError?.protocolError === true &&
      actualError.code === protocol.code &&
      actualError.message === protocol.message &&
      !report
    : null;
  const hardFailures = [];
  const admissionIdentityEqual =
    outcome.admittedIdentity?.expected === null
      ? null
      : outcome.admittedIdentity?.actual === outcome.admittedIdentity?.expected;
  if (admissionIdentityEqual === false) {
    hardFailures.push('admission-identity');
  }
  if (protocol) {
    if (!protocolEqual) {
      hardFailures.push('canonical-plan-protocol-error');
    }
  } else {
    if (!statusKnown) {
      hardFailures.push('expected-status-authority');
    } else if (!statusEqual) {
      hardFailures.push('expected-status');
    }
    if (!report?.canonicalClaim?.utf8 || !report?.canonicalPlan?.utf8 || !report?.canonicalResult?.utf8) {
      hardFailures.push('missing-report');
    }
    if (claimEqual === false) {
      hardFailures.push('canonical-claim');
    }
    if (planEqual === false) {
      hardFailures.push('canonical-plan');
    }
    if (exactResultAuthority && resultEqual === false) {
      hardFailures.push('authoritative-canonical-result');
    }
    if (row.cohort === 'F1' && row.expected.verifierSourceHash && row.expected.canonicalResultUtf8 === null) {
      if (report?.result?.evidence?.planHash !== sha256(Buffer.from(planUtf8))) {
        hardFailures.push('f1-plan-hash');
      }
      if (report?.result?.evidence?.verifierSourceHash !== row.expected.verifierSourceHash) {
        hardFailures.push('f1-verifier-source');
      }
    }
    if (actualError && (!row.matcher || report?.status === 'passed')) {
      hardFailures.push('unexpected-error');
    }
    if (row.matcher && report && report.status !== 'passed') {
      const structured =
        actualError?.assertionError === true || actualError?.structuredGeoSpec?.claimId === report.claimId;
      if (!structured) {
        hardFailures.push('unstructured-assertion-error');
      }
    }
  }
  const cleanup = outcome.stages?.cleanup;
  if (cleanup?.status !== 'released' || (outcome.route?.startsWith('javascript-') && cleanup.close !== 'closed')) {
    hardFailures.push('cleanup');
  }
  return {
    expectedStatus: statusKnown ? expectedStatus : null,
    statusEqual,
    statusAuthority: protocol ? 'independent-protocol-error' : statusKnown ? 'independent-verdict' : 'withheld',
    admissionIdentityEqual,
    protocolErrorEqual: protocolEqual,
    canonicalClaimEqual: claimEqual,
    canonicalPlanEqual: planEqual,
    canonicalResultEqual: resultEqual,
    resultAuthority:
      row.expected.status === 'pending-new-domain-authority'
        ? 'withheld-pending-new-domain-authority'
        : exactResultAuthority
          ? 'exact-independent'
          : 'mathematical-accuracy-pending',
    accuracyContract,
    hardFailures,
  };
};

const compareCampaigns = () => {
  const campaign = loadInstalledCampaign();
  const routePaths = {
    standalone: requiredEnvironment('GEOSPEC_STANDALONE_OUTPUT'),
    vitest: requiredEnvironment('GEOSPEC_VITEST_OUTPUT'),
    ...(campaign.backend === 'mixed'
      ? {}
      : {
          python313: requiredEnvironment('GEOSPEC_PYTHON313_OUTPUT'),
          python314: requiredEnvironment('GEOSPEC_PYTHON314_OUTPUT'),
        }),
  };
  const routeOutputs = Object.fromEntries(
    Object.entries(routePaths).map(([route, path]) => [route, JSON.parse(readFileSync(path, 'utf8'))]),
  );
  const routeMaps = Object.fromEntries(
    Object.entries(routeOutputs).map(([route, output]) => [route, new Map(output.rows.map((row) => [row.id, row]))]),
  );
  const rows = campaign.rows.map((row) => {
    const routes = Object.fromEntries(
      Object.entries(routeMaps).map(([route, values]) => {
        const outcome = values.get(row.id);
        assert.ok(outcome, `${route}: missing ${row.id}`);
        return [route, { outcome, comparison: compareRecord(row, outcome) }];
      }),
    );
    const reports = Object.values(routes).map((value) => value.outcome.report);
    const completeReports = reports.every(Boolean);
    const crossHost = completeReports
      ? {
          canonicalClaim: new Set(reports.map((report) => report.canonicalClaim.sha256)).size === 1,
          canonicalPlan: new Set(reports.map((report) => report.canonicalPlan.sha256)).size === 1,
          canonicalResult: new Set(reports.map((report) => report.canonicalResult.sha256)).size === 1,
        }
      : row.expected.protocolError
        ? {
            protocolCode: new Set(Object.values(routes).map((value) => value.outcome.error?.code)).size === 1,
            protocolMessage: new Set(Object.values(routes).map((value) => value.outcome.error?.message)).size === 1,
          }
        : null;
    return { id: row.id, expected: row.expected, routes, crossHost };
  });
  const hardFailures = rows.flatMap((row) =>
    Object.entries(row.routes).flatMap(([route, value]) =>
      value.comparison.hardFailures.map((failure) => ({
        id: row.id,
        route,
        failure,
      })),
    ),
  );
  const crossHostDifferences = rows.filter(
    (row) => row.crossHost && Object.values(row.crossHost).some((value) => !value),
  );
  for (const row of crossHostDifferences) {
    for (const [field, equal] of Object.entries(row.crossHost)) {
      if (!equal) {
        hardFailures.push({ id: row.id, route: 'within-profile', failure: field });
      }
    }
  }
  const openAccuracy = rows.filter((row) =>
    Object.values(row.routes).some((value) => value.comparison.resultAuthority === 'mathematical-accuracy-pending'),
  );
  const output = {
    schemaVersion: 1,
    taskId: campaign.taskId,
    sourceCorpusFingerprint: campaign.sourceCorpusFingerprint,
    routeFiles: routePaths,
    summary: {
      rows: rows.length,
      hardFailures: hardFailures.length,
      crossHostDifferences: crossHostDifferences.length,
      mathematicalAccuracyPending: openAccuracy.length,
      pendingNewDomainAuthority: rows.filter((row) => row.expected.status === 'pending-new-domain-authority').length,
    },
    hardFailures,
    crossHostDifferences: crossHostDifferences.map((row) => row.id),
    mathematicalAccuracyPending: openAccuracy.map((row) => row.id),
    rows,
  };
  writeJson(requiredEnvironment('GEOSPEC_COMPARISON_OUTPUT'), output);
  if (hardFailures.length > 0 || openAccuracy.length > 0) {
    process.exitCode = 1;
  }
  return output;
};

const main = async () => {
  const mode = process.argv[2];
  if (mode === 'prepare') {
    preparePythonMap();
    return;
  }
  if (mode === 'prepare-continuous') {
    preparePythonMap(continuousPythonCampaign('nominal'));
    return;
  }
  if (mode === 'prepare-continuous-budgets') {
    preparePythonMap(continuousPythonCampaign('budget'));
    return;
  }
  if (mode === 'standalone') {
    await runCampaign('javascript-standalone', requiredEnvironment('GEOSPEC_STANDALONE_OUTPUT'));
    return;
  }
  if (mode === 'compare') {
    compareCampaigns();
    return;
  }
  if (mode === 'continuous') {
    await runContinuousCampaign('nominal');
    return;
  }
  if (mode === 'continuous-budgets') {
    await runContinuousCampaign('budget');
    return;
  }
  throw new Error(`Unknown installed corpus mode '${mode}'.`);
};

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
