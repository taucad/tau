/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- The inert VM deliberately executes untyped source functions without importing product modules. */
// Executes exact source functions in a host-only context. No product module is imported.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('installed.mjs', import.meta.url), 'utf8');
const declaration = (name) => {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `missing actual source function ${name}`);
  const firstLine = source.slice(start, source.indexOf('\n', start));
  if (firstLine.endsWith(';')) {
    return firstLine;
  }
  const end = source.indexOf('\n};', start);
  assert.notEqual(end, -1);
  return source.slice(start, end + 3);
};
const claim = { claimId: 'ordinary-box-volume' };
const plan = JSON.stringify({ plan: { claims: [claim] } });
const row = {
  id: 'ordinary-box-volume',
  claimId: claim.claimId,
  matcher: true,
  identityField: 'subjectHash',
  expectedIdentity: 'source-bound',
  expected: {
    status: 'passed',
    canonicalPlan: { status: 'success', canonicalUtf8: plan },
    canonicalResultUtf8: null,
    protocolError: null,
  },
};
const outcome = (status = 'passed') => ({
  id: row.id,
  route: 'javascript-standalone',
  routeState: 'evaluated',
  admittedIdentity: { actual: 'source-bound', expected: 'source-bound' },
  report: {
    claimId: claim.claimId,
    status,
    canonicalClaim: { utf8: JSON.stringify(claim) },
    canonicalPlan: { utf8: plan },
    canonicalResult: { utf8: JSON.stringify({ results: [{ claimId: claim.claimId, status }] }) },
  },
  error: status === 'passed' ? null : { assertionError: true, structuredGeoSpec: { claimId: claim.claimId, status } },
  stages: { cleanup: { status: 'released', close: 'closed' } },
});
// Identity bytes suffice for this ASCII fixture: the verdict assertions do not test canonicalization.
const context = vm.createContext({
  assert,
  Buffer,
  canonicalize: (bytes) => bytes,
  byteRecord: (bytes) => ({ utf8: bytes.toString() }),
});
vm.runInContext(`${declaration('compareRecord')}\nglobalThis.compare = compareRecord;`, context);

void test('should reject a captured failed verdict for independently expected passed with no result golden', () => {
  const comparison = context.compare(row, outcome('failed'));
  assert.ok(comparison.hardFailures.includes('expected-status'), JSON.stringify(comparison));
});

void test('should reject missing reports and unexpected errors for passed assertions and queries', () => {
  for (const matcher of [true, false]) {
    const missing = outcome();
    missing.report = null;
    assert.ok(context.compare({ ...row, matcher }, missing).hardFailures.includes('missing-report'));
    const unexpected = outcome();
    unexpected.error = { message: 'ordinary captured host assertion', assertionError: true };
    assert.ok(context.compare({ ...row, matcher }, unexpected).hardFailures.includes('unexpected-error'));
  }
});

void test('should accept independently expected structured failures and unsupported verdicts without fitting a result golden', () => {
  for (const status of ['failed', 'unsupported', 'refused']) {
    const expected = { ...row, expected: { ...row.expected, status } };
    const comparison = context.compare(expected, outcome(status));
    assert.equal(comparison.hardFailures.length, 0);
    assert.equal(comparison.statusEqual, true);
    const unstructured = outcome(status);
    unstructured.error = { message: 'ordinary unrelated assertion' };
    assert.ok(context.compare(expected, unstructured).hardFailures.includes('unstructured-assertion-error'));
    const query = outcome(status);
    query.error = null;
    assert.equal(context.compare({ ...expected, matcher: false }, query).hardFailures.length, 0);
  }
});

void test('should preserve exact intentional protocol failures and withhold undeclared status authority', () => {
  const protocol = { code: 'ordinary-control', message: 'independently declared control' };
  const expected = { ...row, expected: { ...row.expected, status: 'protocol-error', protocolError: protocol } };
  const captured = { ...outcome(), report: null, error: { ...protocol, protocolError: true } };
  assert.equal(context.compare(expected, captured).hardFailures.length, 0);
  captured.error.protocolError = false;
  assert.ok(context.compare(expected, captured).hardFailures.includes('canonical-plan-protocol-error'));
  for (const status of [
    'pending-new-domain-authority',
    'premise-pending',
    'independent-oracle-bound-current-result-pending',
    'full',
    undefined,
  ]) {
    const comparison = context.compare({ ...row, expected: { ...row.expected, status } }, outcome());
    assert.equal(comparison.statusEqual, null);
    assert.equal(comparison.statusAuthority, 'withheld');
    assert.ok(comparison.hardFailures.includes('expected-status-authority'));
  }
});

void test('should derive legacy full status only from frozen expected bytes and preserve exact result checks', () => {
  const captured = outcome('failed');
  const expected = {
    ...row,
    cohort: 'F1',
    expected: { ...row.expected, status: 'full', canonicalResultUtf8: captured.report.canonicalResult.utf8 },
  };
  assert.equal(context.compare(expected, captured).hardFailures.length, 0);
  assert.ok(context.compare(expected, outcome()).hardFailures.includes('expected-status'));
  captured.report.canonicalResult.utf8 = JSON.stringify({
    results: [{ claimId: claim.claimId, status: 'failed', extra: 1 }],
  });
  assert.ok(context.compare(expected, captured).hardFailures.includes('authoritative-canonical-result'));
});

const campaignContext = (status, continuous = false, expectedStatus = 'passed') => {
  const captured = [];
  const rows = [row, { ...row, id: 'second-ordinary-row' }].map((value) =>
    continuous
      ? { ...value, expected: { status: expectedStatus, protocolError: null } }
      : { ...value, expected: { ...value.expected, status: expectedStatus } },
  );
  const scope = vm.createContext({
    assert,
    Buffer,
    canonicalize: (bytes) => bytes,
    byteRecord: (bytes) => ({ utf8: bytes.toString() }),
    loadInstalledCampaign: () => ({ taskId: 'inert-only', rows }),
    loadContinuousInputs: () => rows,
    loadContinuousBudgets: () => rows,
    PROFILE: 'inert-profile',
    CONTINUOUS_INPUT_SHA256: 'inert-input',
    CONTINUOUS_BUDGET_SHA256: 'inert-budget',
    provenance: () => ({ route: 'inert-host-only' }),
    requiredEnvironment: (name) => name,
    runInstalledRow: async (value, route) => ({
      ...outcome(status),
      id: value.id,
      route,
      admittedIdentity: { actual: 'source-bound', expected: continuous ? null : 'source-bound' },
    }),
    writeJson: (path, value) => captured.push({ path, value: structuredClone(value) }),
  });
  vm.runInContext(
    ['compareRecord', 'runCampaign', 'runContinuousCampaign', 'runVitestCampaign', 'runVitestContinuousCampaign']
      .map((name) => declaration(name))
      .join('\n') +
      '\nglobalThis.routes = { runCampaign, runContinuousCampaign, runVitestCampaign, runVitestContinuousCampaign };',
    scope,
  );
  return { scope, captured };
};

for (const mode of ['standalone', 'vitest', 'continuous']) {
  void test(`should fail the actual ${mode} campaign boundary and persist every raw report in finally`, async () => {
    const { scope, captured } = campaignContext('failed', mode === 'continuous');
    const invoke =
      mode === 'standalone'
        ? () => scope.routes.runCampaign('javascript-standalone', 'inert-output')
        : mode === 'vitest'
          ? () => scope.routes.runVitestCampaign(() => undefined)
          : () => scope.routes.runContinuousCampaign('nominal');
    await assert.rejects(invoke, { name: 'AssertionError', message: /Installed campaign did not satisfy/ });
    assert.equal(captured.length, 1);
    assert.equal(captured[0].value.rows.length, 2);
    for (const value of captured[0].value.rows) {
      assert.deepEqual(value.report, outcome('failed').report);
      assert.deepEqual(value.error, outcome('failed').error);
      assert.ok(value.comparison.hardFailures.includes('expected-status'));
    }
  });
}

void test('should propagate the gate through the actual installed Vitest test callback', async () => {
  const { scope, captured } = campaignContext('failed');
  const callbacks = [];
  scope.process = { env: {} };
  scope.expect = (value) => ({
    toHaveLength: (count) => {
      assert.equal(value.length, count);
    },
  });
  scope.test = (_name, callback) => callbacks.push(callback);
  const vitestSource = readFileSync(new URL('installed.vitest.test.mjs', import.meta.url), 'utf8').replaceAll(
    /^import .*;\n/gm,
    '',
  );
  vm.runInContext(vitestSource, scope);
  assert.equal(callbacks.length, 1);
  await assert.rejects(callbacks[0], { name: 'AssertionError', message: /Installed campaign did not satisfy/ });
  assert.equal(captured[0].value.rows.length, 2);
});

void test('should let an independently passed campaign finish with its reports preserved', async () => {
  const { scope, captured } = campaignContext('passed');
  const output = await scope.routes.runCampaign('javascript-standalone', 'inert-output');
  assert.equal(output.rows.length, 2);
  assert.equal(captured.length, 1);
  for (const value of output.rows) {
    assert.equal(value.comparison.statusEqual, true);
  }
});

void test('should accept continuous declared verdicts without inventing frozen plan or identity expectations', async () => {
  const { scope } = campaignContext('passed', true);
  const output = await scope.routes.runContinuousCampaign('nominal');
  for (const value of output.rows) {
    assert.equal(value.comparison.statusEqual, true);
    assert.equal(value.comparison.admissionIdentityEqual, null);
    assert.equal(value.comparison.canonicalPlanEqual, null);
  }
});

void test('should accept declared failed campaigns but refuse to qualify pending authority', async () => {
  const accepted = campaignContext('failed', false, 'failed');
  const output = await accepted.scope.routes.runCampaign('javascript-standalone', 'inert-output');
  assert.equal(output.rows[0].comparison.statusEqual, true);
  const pending = campaignContext('passed', false, 'pending-new-domain-authority');
  await assert.rejects(() => pending.scope.routes.runCampaign('javascript-standalone', 'inert-output'), {
    name: 'AssertionError',
    message: /expected-status-authority/,
  });
  assert.equal(pending.captured[0].value.rows[0].comparison.statusAuthority, 'withheld');
});

void test('should make the actual offline comparator exit unsuccessfully for all four captured wrong-verdict routes', () => {
  const captured = [];
  const scope = vm.createContext({
    assert,
    Buffer,
    process: { exitCode: 0 },
    canonicalize: (bytes) => bytes,
    byteRecord: (bytes) => ({ utf8: bytes.toString() }),
    loadInstalledCampaign: () => ({ taskId: 'inert-only', rows: [row] }),
    requiredEnvironment: (name) => name,
    readFileSync: () => JSON.stringify({ rows: [outcome('failed')] }),
    writeJson: (path, value) => captured.push(structuredClone(value)),
  });
  vm.runInContext(`${declaration('compareRecord')}\n${declaration('compareCampaigns')}\ncompareCampaigns();`, scope);
  assert.equal(scope.process.exitCode, 1);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].hardFailures.filter((failure) => failure.failure === 'expected-status').length, 4);
});

const installedContext = (backend, state = 'ready') => {
  const calls = [];
  class InertEngine {
    constructor() {
      if (state === 'uncreated') {
        throw new Error('Inert construction failure.');
      }
      calls.push('created');
    }
    releaseSubject(input) {
      assert.equal(JSON.parse(input.toString()).subjectHandle, 'inert-handle');
      calls.push('released');
      return Buffer.from('{"result":{"released":true}}');
    }
    close() {
      calls.push('close');
      if (state === 'close-error') {
        throw new Error('Inert close failure.');
      }
    }
  }
  const scope = vm.createContext({
    Buffer,
    Error,
    Engine: InertEngine,
    GeoSpecAssertionError: class extends Error {},
    ProtocolError: class extends Error {},
    backend,
    CANONICAL_PROFILE: 'inert-profile',
    byteRecord: (bytes) => ({ utf8: bytes.toString() }),
    campaignRegistryVersion: () => 'inert-registry',
    initializeCase: () =>
      state === 'initialization-error'
        ? { error: true, record: { error: { name: 'Error', message: 'Inert initialization failure.' } } }
        : { record: {} },
    admitCase: () => ({
      subject: { subjectHash: 'source-bound' },
      handle: 'inert-handle',
      record: {},
      handleCall: { record: {} },
    }),
    standaloneEvaluation: async () => ({ error: null, report: outcome().report, calls: [] }),
    vitestEvaluation: async () => ({ error: null, report: outcome().report, calls: [] }),
  });
  vm.runInContext(
    ['errorRecord', 'callRecord', 'releaseCase', 'attachCleanup', 'runInstalledRow']
      .map((name) => declaration(name))
      .join('\n') + '\nglobalThis.runRow = runInstalledRow;',
    scope,
  );
  return { scope, calls };
};

for (const backend of ['native', 'mixed']) {
  void test(`should release and close the actual ${backend} installed row before qualification`, async () => {
    const { scope, calls } = installedContext(backend);
    const captured = structuredClone(await scope.runRow(row, 'javascript-standalone'));
    assert.deepEqual(calls, ['created', 'released', 'close']);
    assert.deepEqual(captured.report, outcome().report);
    assert.equal(captured.stages.cleanup.status, 'released');
    assert.equal(captured.stages.cleanup.close, 'closed');
    assert.equal(captured.stages.cleanup.call.output.utf8, '{"result":{"released":true}}');
    assert.equal(context.compare(row, captured).hardFailures.length, 0);
  });

  void test(`should capture ${backend} close errors without accepting the ordinary report`, async () => {
    const { scope, calls } = installedContext(backend, 'close-error');
    const captured = structuredClone(await scope.runRow(row, 'javascript-standalone'));
    assert.deepEqual(calls, ['created', 'released', 'close']);
    assert.deepEqual(captured.report, outcome().report);
    assert.equal(captured.stages.cleanup.status, 'released');
    assert.equal(captured.stages.cleanup.close, 'close-error');
    assert.equal(captured.stages.cleanup.closeError.name, 'Error');
    assert.equal(captured.stages.cleanup.closeError.message, 'Inert close failure.');
    assert.ok(context.compare(row, captured).hardFailures.includes('cleanup'));
  });
}

void test('should record an uncreated engine and close an initialized engine without inventing a release', async () => {
  const uncreated = installedContext('native', 'uncreated');
  const failure = structuredClone(await uncreated.scope.runRow(row, 'javascript-standalone'));
  assert.deepEqual(uncreated.calls, []);
  assert.equal(failure.routeState, 'harness-error');
  assert.equal(failure.error.name, 'Error');
  assert.equal(failure.error.message, 'Inert construction failure.');
  assert.deepEqual(failure.stages.cleanup, { status: 'not-acquired', close: 'not-created' });
  assert.ok(context.compare(row, failure).hardFailures.includes('cleanup'));
  const initialized = installedContext('native', 'initialization-error');
  const early = structuredClone(await initialized.scope.runRow(row, 'javascript-standalone'));
  assert.deepEqual(initialized.calls, ['created', 'close']);
  assert.equal(early.routeState, 'initialization-error');
  assert.deepEqual(early.error, { name: 'Error', message: 'Inert initialization failure.' });
  assert.deepEqual(early.stages.cleanup, { status: 'not-acquired', close: 'closed' });
});

void test('should require new JavaScript close evidence while preserving Python cleanup semantics', () => {
  const historical = outcome();
  historical.stages.cleanup.close = 'not-exported-by-node-engine';
  assert.ok(context.compare(row, historical).hardFailures.includes('cleanup'));
  const python = { ...outcome(), route: 'python3.13-standalone' };
  python.stages.cleanup = { status: 'released', close: 'GeoSpecEngine.close', error: null };
  assert.equal(context.compare(row, python).hardFailures.length, 0);
  python.stages.cleanup.status = 'cleanup-error';
  assert.ok(context.compare(row, python).hardFailures.includes('cleanup'));
});

void test('should reject a close error at the actual campaign gate and persist its complete raw report', async () => {
  const { scope, captured } = campaignContext('passed');
  const installed = installedContext('native', 'close-error');
  scope.runInstalledRow = installed.scope.runRow;
  await assert.rejects(() => scope.routes.runCampaign('javascript-standalone', 'inert-output'), {
    name: 'AssertionError',
    message: /Installed campaign did not satisfy/,
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].value.rows.length, 2);
  for (const value of captured[0].value.rows) {
    assert.deepEqual(value.report, outcome().report);
    assert.equal(value.stages.cleanup.closeError.message, 'Inert close failure.');
    assert.ok(value.comparison.hardFailures.includes('cleanup'));
  }
});
