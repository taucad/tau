/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Inert VM executes the actual browser source with host-only records, without product imports. */
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('app.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
// Only declarations; exclude imports and the top-level browser entry point.
const declarations = tree.statements
  .filter(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.every(
        (item) => !['status', 'completionTarget', 'run'].includes(item.name.getText(tree)),
      ),
  )
  .map((node) => node.getText(tree))
  .join('\n');
const code = ts.transpileModule(`${declarations}\nglobalThis.runCell = runCell;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encode = (value) => new TextEncoder().encode(value);
const claim = '{"claimId":"ordinary-box-volume"}';
const plan = `{"plan":{"claims":[${claim}]}}`;
const subjectHash = 'a'.repeat(64);
const admission = JSON.stringify({ result: { subject: { subjectHash } } });
const result = (status) => JSON.stringify({ results: [{ claimId: 'ordinary-box-volume', diagnostics: [], status }] });
const expected = {
  admissionUtf8: null,
  bytes: { canonicalClaimUtf8: claim, canonicalPlanUtf8: plan, canonicalResultUtf8: null },
  error: null,
  independent: { canonicalPlanUtf8: plan, canonicalResultUtf8: null },
  status: 'passed',
};
const row = {
  id: 'ordinary-box-volume',
  cohort: 'inert-host-only',
  authoredRequestUtf8: plan,
  expected,
  subjectHash,
  ingest: { requestUtf8: '{"registryVersion":"inert"}', primary: {}, resources: [] },
  invocation: {
    capability: 'toHaveVolume',
    arguments: [1],
    claimId: 'ordinary-box-volume',
    payload: 1,
    polarity: 'positive',
    subjectSlot: 'subject',
    workUnitBudget: 1,
  },
};
const run = async (input, supplemental, observation = 'passed') => {
  const { status, publicFailure } =
    typeof observation === 'string' ? { status: observation, publicFailure: 'none' } : observation;
  const canonicalResult = result(status);
  class InertGeoSpecAssertionError extends Error {
    constructor(report) {
      super('Ordinary captured assertion diagnostic; no independent message golden.');
      this.name = 'GeoSpecAssertionError';
      this.report = report;
    }
  }
  class InertEngine {
    ingestSubject() {
      return encode(admission);
    }
    subjectHandle() {
      return encode('{"result":{"subjectHandle":"inert"}}');
    }
    canonicalPlan() {
      return encode(plan);
    }
    evaluatePlan() {
      return encode(canonicalResult);
    }
    releaseSubject() {
      return encode('{"result":{"released":true}}');
    }
    close() {
      /* Ordinary inert cleanup. */
    }
  }
  const context = vm.createContext({
    Engine: InertEngine,
    GeoSpecAssertionError: InertGeoSpecAssertionError,
    Error,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    crypto: webcrypto,
    canonicalize: (bytes) => bytes,
    createGeoSpecAssertionClient: () => {
      const report = () => {
        const captured = {
          canonicalClaim: encode(claim),
          canonicalPlan: encode(plan),
          canonicalResult: encode(canonicalResult),
          status,
          diagnostics: [],
        };
        if (publicFailure === 'structured') {
          throw new InertGeoSpecAssertionError(captured);
        }
        if (publicFailure === 'unexpected') {
          throw new Error('Ordinary unrelated host error.');
        }
        return captured;
      };
      return { expectGeo: () => ({ toHaveVolume: report }), query: report };
    },
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
  });
  vm.runInContext(code, context);
  const inputRow = structuredClone(input);
  inputRow.ingest.primary = { byteLength: 0, sha256: hash(new Uint8Array()), url: '/inert' };
  return structuredClone(await context.runCell(inputRow, supplemental));
};

void test('should capture complete reports and separate unavailable authority from same-byte parity', async () => {
  const captured = await run(row, true);
  assert.equal(captured.passed, true);
  assert.equal(captured.admission.equal, null);
  assert.equal(captured.admission.expected, null);
  assert.equal(captured.admission.actual.utf8, admission);
  assert.deepEqual(captured.comparison.unavailableFields, [
    'admissionUtf8',
    'canonicalResultUtf8',
    'independent.canonicalResultUtf8',
  ]);
  assert.deepEqual(captured.comparison.publicDirect, {
    canonicalClaimUtf8: true,
    canonicalPlanUtf8: true,
    canonicalResultUtf8: true,
  });
  assert.equal(captured.comparison.directFrozen.canonicalResultUtf8, null);
  assert.equal(captured.comparison.directFrozen.canonicalClaimUtf8, true);
  assert.equal(captured.comparison.independent.canonicalPlanUtf8, true);
  assert.equal(captured.direct.canonicalResultUtf8, result('passed'));
  assert.equal(captured.public.canonicalResultUtf8, result('passed'));
  assert.equal(captured.comparison.status, true);
  assert.equal(captured.cleanup.released, true);
  assert.equal(captured.cleanup.closeCalled, true);
});

void test('should require passed verdict even when no result golden is available', async () => {
  const captured = await run(row, true, 'failed');
  assert.equal(captured.passed, false);
  assert.equal(captured.comparison.status, false);
  assert.equal(captured.direct.canonicalResultUtf8, result('failed'));
  assert.equal(captured.cleanup.released, true);
});

void test('should preserve default complete-golden authority and exact supplied result comparisons', async () => {
  const full = structuredClone(row);
  full.expected.admissionUtf8 = admission;
  full.expected.bytes.canonicalResultUtf8 = result('passed');
  full.expected.independent = null;
  const captured = await run(full, false);
  assert.equal(captured.passed, true);
  assert.deepEqual(captured.comparison.unavailableFields, []);
  assert.equal(captured.admission.equal, true);
  assert.equal(captured.comparison.publicFrozen.canonicalResultUtf8, true);
  const nullableDefault = await run(row, false);
  assert.equal(nullableDefault.passed, false);
  assert.equal(nullableDefault.runtimeFailure.phase, 'expected-authority');
});

const failedRow = {
  ...row,
  expected: { ...expected, status: 'failed', error: { name: 'GeoSpecAssertionError', message: null } },
};

void test('should accept independently failed structured reports while retaining unavailable message authority', async () => {
  const captured = await run(failedRow, true, { status: 'failed', publicFailure: 'structured' });
  assert.equal(captured.passed, true);
  assert.equal(captured.comparison.status, true);
  assert.equal(captured.comparison.errorClass, true);
  assert.ok(captured.comparison.unavailableFields.includes('error.message'));
  assert.equal(captured.admission.actual.utf8, admission);
  assert.equal(captured.admission.expected, null);
  for (const route of [captured.direct, captured.public]) {
    assert.equal(route.canonicalClaimUtf8, claim);
    assert.equal(route.canonicalPlanUtf8, plan);
    assert.equal(route.canonicalResultUtf8, result('failed'));
    assert.equal(route.status, 'failed');
  }
  assert.equal(captured.public.error.name, 'GeoSpecAssertionError');
  assert.equal(captured.public.error.assertionError, true);
  assert.equal(captured.public.error.message, 'Ordinary captured assertion diagnostic; no independent message golden.');
  assert.equal(failedRow.expected.error.message, null);
  assert.equal(captured.comparison.directFrozen.canonicalResultUtf8, null);
  assert.equal(captured.comparison.publicDirect.canonicalResultUtf8, true);
  assert.equal(captured.cleanup.released, true);
  assert.equal(captured.cleanup.closeCalled, true);
});

void test('should reject a passed observation for independently failed authority', async () => {
  const captured = await run(failedRow, true, 'passed');
  assert.equal(captured.passed, false);
  assert.equal(captured.comparison.status, false);
  assert.equal(captured.comparison.errorClass, false);
  assert.equal(captured.direct.canonicalResultUtf8, result('passed'));
  assert.equal(captured.public.canonicalResultUtf8, result('passed'));
  assert.equal(captured.cleanup.released, true);
});

void test('should reject an unrelated error class despite independently expected failure', async () => {
  const captured = await run(failedRow, true, { status: 'failed', publicFailure: 'unexpected' });
  assert.equal(captured.passed, false);
  assert.equal(captured.direct.canonicalResultUtf8, result('failed'));
  assert.equal(captured.public, undefined);
  assert.equal(captured.runtimeFailure.phase, 'public');
  assert.equal(captured.runtimeFailure.name, 'Error');
  assert.equal(captured.runtimeFailure.message, `M2 public assertion returned no report for ${failedRow.id}.`);
  assert.equal(captured.cleanup.released, true);
  assert.equal(captured.cleanup.closeCalled, true);
});

const queryRow = {
  ...row,
  invocation: { ...row.invocation, capability: 'analyzeBrep', arguments: [], payload: null },
};

for (const status of ['passed', 'refused']) {
  void test(`should accept an independently ${status} positive query report without an assertion error`, async () => {
    const input = { ...queryRow, expected: { ...expected, status } };
    const captured = await run(input, true, status);
    assert.equal(captured.passed, true);
    assert.equal(captured.comparison.status, true);
    assert.equal(captured.comparison.errorClass, true);
    assert.equal(captured.public.error, null);
    assert.equal(captured.direct.canonicalResultUtf8, result(status));
    assert.equal(captured.public.canonicalResultUtf8, result(status));
    assert.equal(captured.comparison.directFrozen.canonicalResultUtf8, null);
    assert.equal(captured.comparison.publicDirect.canonicalResultUtf8, true);
    assert.equal(captured.cleanup.released, true);
    assert.equal(captured.cleanup.closeCalled, true);
  });
}

// A query asserts nothing: evidence it cannot read or decide refuses (GEOSPEC_UNSUPPORTED_EVIDENCE and kin).
const refusedQuery = { ...queryRow, expected: { ...expected, status: 'refused' } };

void test('should reject the wrong query verdict while preserving both reports', async () => {
  const captured = await run(refusedQuery, true, 'passed');
  assert.equal(captured.passed, false);
  assert.equal(captured.comparison.status, false);
  assert.equal(captured.comparison.errorClass, true);
  assert.equal(captured.direct.canonicalResultUtf8, result('passed'));
  assert.equal(captured.public.canonicalResultUtf8, result('passed'));
  assert.equal(captured.cleanup.released, true);
  assert.equal(captured.cleanup.closeCalled, true);
});

void test('should reject an assertion error for a normally returned refused query report', async () => {
  const captured = await run(refusedQuery, true, { status: 'refused', publicFailure: 'structured' });
  assert.equal(captured.passed, false);
  assert.equal(captured.comparison.status, true);
  assert.equal(captured.comparison.errorClass, false);
  assert.equal(captured.public.error.name, 'GeoSpecAssertionError');
  assert.equal(captured.public.canonicalResultUtf8, result('refused'));
  assert.equal(captured.cleanup.released, true);
  assert.equal(captured.cleanup.closeCalled, true);
});

void test('should keep nullable failed and refused authority restricted to the matching public error contract', async () => {
  const inputs = [
    { ...row, expected: refusedQuery.expected },
    { ...row, expected: { ...expected, status: 'failed' } },
    { ...refusedQuery, invocation: { ...refusedQuery.invocation, polarity: 'negative' } },
    { ...refusedQuery, expected: failedRow.expected },
    // A query never answers failed, so a failed query authority is not admitted.
    { ...queryRow, expected: { ...expected, status: 'failed' } },
  ];
  await Promise.all(
    inputs.map(async (input) => {
      const captured = await run(input, true, input.expected.status);
      assert.equal(captured.passed, false);
      assert.equal(captured.runtimeFailure.phase, 'expected-authority');
      assert.equal(captured.runtimeFailure.name, 'Error');
      assert.equal(
        captured.runtimeFailure.message,
        `M2 unavailable authority requires a supplemental independently known verdict and matching error expectation: ${input.id}.`,
      );
    }),
  );
  const matcher = await run(failedRow, true, 'failed');
  assert.equal(matcher.passed, false);
  assert.equal(matcher.comparison.status, true);
  assert.equal(matcher.comparison.errorClass, false);
  assert.equal(matcher.public.canonicalResultUtf8, result('failed'));
});

void test('should accept refused query warmups on both routes without weakening matcher warmups', async () => {
  const input = { ...refusedQuery, warmup: { expectedStatus: 'refused', invocation: queryRow.invocation } };
  const captured = await run(input, true, 'refused');
  assert.equal(captured.passed, true);
  for (const route of [captured.warmup.direct, captured.warmup.public]) {
    assert.equal(route.succeeded, true);
    assert.equal(route.error, null);
    assert.equal(route.report.canonicalResultUtf8, result('refused'));
  }
  const failedWarmup = await run(
    { ...refusedQuery, warmup: { expectedStatus: 'failed', invocation: queryRow.invocation } },
    true,
    'failed',
  );
  assert.equal(failedWarmup.passed, false);
  assert.equal(failedWarmup.warmup.direct.succeeded, false);
  assert.equal(failedWarmup.runtimeFailure.phase, 'warmup-direct');
  const matcher = await run(
    { ...failedRow, warmup: { expectedStatus: 'failed', invocation: row.invocation } },
    true,
    'failed',
  );
  assert.equal(matcher.passed, false);
  assert.equal(matcher.warmup.direct.succeeded, false);
  assert.equal(matcher.runtimeFailure.phase, 'warmup-direct');
  assert.equal(matcher.cleanup.released, true);
  assert.equal(matcher.cleanup.closeCalled, true);
});
