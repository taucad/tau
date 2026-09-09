/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, no-restricted-imports -- This harness-only check reads existing hash-bound independent authority JSON. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bindIndependentPublicCase, requireEvaluationEnvelope } from './corpus.mjs';

const bytes = readFileSync(
  'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m3-geometry-a1/lanes/f2-independent-wire/revisions/binding-a8/complete-wire.json',
);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '799a1149f42a74b16a502d1ecf814a5fb83502b57f0897d5f16ee4a695d859d5',
);
const authority = JSON.parse(bytes.toString());

void test('should bind all independent F2 cases to complete evaluation envelopes', () => {
  for (const [id, value] of Object.entries(authority.publicCases)) {
    const bound = bindIndependentPublicCase(value, id);
    assert.equal(bound.canonicalClaimUtf8, value.claim.utf8);
    assert.equal(bound.canonicalPlanUtf8, value.canonicalPlan.utf8);
    assert.equal(bound.canonicalResultUtf8, value.evaluation.utf8);
    assert.notEqual(bound.canonicalResultUtf8, value.canonicalResult.utf8);
  }
});

void test('should distinguish preserved result rows from evaluation inputs before runtime', () => {
  const row = authority.publicCases['f2-two-occurrences-positive'];
  assert.throws(
    () => requireEvaluationEnvelope(row.canonicalResult.utf8, 'preserved A8 layer mistake'),
    /expected complete evaluation envelope/u,
  );
  assert.throws(
    () => requireEvaluationEnvelope(row.submitResponse.utf8, 'submit response is separate'),
    /expected complete evaluation envelope/u,
  );
  assert.deepEqual(requireEvaluationEnvelope(row.evaluation.utf8, 'correct layer'), row.evaluation.value);
});
