/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, no-restricted-imports -- This standalone host check consumes its sibling adapter outside workspace aliases and typed source roots. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { loadM3Corpus, projectCurrentM3Campaign, requireDefinitionsInBinary } from './corpus.mjs';
import { readFixture } from '../fixtures/read-fixture.mjs';
import { loadAuthority } from '../f1-public-a1/authority.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

void test('should bind the existing F1 authority to the exact current profile and independently verified definition', () => {
  const authority = loadAuthority();
  const original = JSON.parse(
    readFixture(
      'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lanes/matcher-full-f1-fullwire-a1/revisions/metadata-a2/fullwire-results.json',
    ),
  );
  assert.equal(authority.rows.length, 12);
  assert.equal(authority.admissions.size, 6);
  for (const [index, row] of authority.rows.entries()) {
    const prior = original[index];
    assert.equal(row.id, prior.id);
    assert.equal(JSON.parse(row.canonicalPlanUtf8).numericProfile, 'geospec-demand-v6');
    assert.equal(
      row.canonicalPlanUtf8,
      prior.canonicalPlanUtf8
        .replace('"numericProfile":"geospec-st-logical-requests-v2"', '"numericProfile":"geospec-demand-v6"')
        .replace('"registryVersion":4', '"registryVersion":5'),
    );
    assert.ok(
      row.claimResult.canonicalUtf8.includes('d0af57f6550b508cc9fdb63b84180a554541ff3c7b8f53346ba1350449043350'),
    );
    assert.ok(
      row.neutralResult.canonicalUtf8.includes('d0af57f6550b508cc9fdb63b84180a554541ff3c7b8f53346ba1350449043350'),
    );
    assert.ok(row.claimResult.canonicalUtf8.includes(sha256(row.canonicalPlanUtf8)));
    for (const key of ['claimResult', 'neutralResult']) {
      let restored = row[key].canonicalUtf8
        .replace(sha256(row.canonicalPlanUtf8), sha256(prior.canonicalPlanUtf8))
        .replace(
          'd0af57f6550b508cc9fdb63b84180a554541ff3c7b8f53346ba1350449043350',
          'cbf1df63a329f71fdc772938eb3a8a16f42d52983f82ccaf6966ea4182f4542c',
        );
      if (key === 'neutralResult') {
        restored = restored.replace(
          '"numericProfile":"geospec-demand-v6"',
          '"numericProfile":"geospec-st-logical-requests-v2"',
        );
      }
      assert.equal(restored, prior[key].canonicalUtf8);
    }
  }
});

void test('should preserve every frozen M3 declaration with only exact profile and F1 definition identities projected', () => {
  const original = JSON.parse(readFixture('packages/geospec/host-tests/m3-corpus/current-authority-v5.json'));
  const before = JSON.stringify(original);
  const current = projectCurrentM3Campaign(original);
  assert.equal(JSON.stringify(original), before);
  for (const [index, row] of current.rows.entries()) {
    const prior = original.rows[index];
    const key = prior.expected.canonicalPlan.canonicalUtf8 === undefined ? 'derivationUtf8' : 'canonicalUtf8';
    assert.deepEqual(row, {
      ...prior,
      expected: {
        ...prior.expected,
        canonicalPlan: {
          ...prior.expected.canonicalPlan,
          [key]: prior.expected.canonicalPlan[key].replace(
            '"numericProfile":"geospec-demand-v5"',
            '"numericProfile":"geospec-demand-v6"',
          ),
        },
        ...(row.capability === 'toSatisfyRationalPlate'
          ? { verifierSourceHash: 'd0af57f6550b508cc9fdb63b84180a554541ff3c7b8f53346ba1350449043350' }
          : {}),
      },
    });
  }
  for (const change of [
    (value) => {
      value.numericProfile = 'wrong';
    },
    (value) => {
      value.definitions.f1.sha256 = '0'.repeat(64);
    },
    (value) => {
      value.rows[0].expected.canonicalPlan.canonicalUtf8 = '{}';
    },
    (value) => {
      value.rows[0].expected.canonicalPlan.canonicalUtf8 =
        String(value.rows[0].expected.canonicalPlan.canonicalUtf8) + '"numericProfile":"geospec-demand-v5"';
    },
    (value) => {
      value.rows[0].expected.canonicalResultUtf8 = '{}';
    },
    (value) => {
      value.rows[0].id = value.rows[1].id;
    },
  ]) {
    const changed = structuredClone(original);
    change(changed);
    assert.throws(() => projectCurrentM3Campaign(changed), assert.AssertionError);
  }
});

void test('should assemble the frozen M3 corpus without crossing acceptance tracks', () => {
  const corpus = loadM3Corpus();
  assert.equal(corpus.rows.length, 334);
  assert.equal(corpus.preservedCohorts.early320.records, 320);
  assert.equal(corpus.preservedCohorts.selector87, 87);
  assert.equal(corpus.preservedCohorts.relationship67, 67);
  assert.equal(corpus.coverage.originalMatchers.present.length, 24);
  assert.deepEqual(
    corpus.coverage.relationshipKinds.present,
    [...corpus.coverage.relationshipKinds.expected].sort((left, right) => left.localeCompare(right)),
  );
  assert.equal(corpus.coverage.ancillaryOperations.present.length, 4);
  assert.equal(corpus.reusedM2Cases.length, 30);
  assert.equal(corpus.coverage.F1.rows, 12);
  assert.equal(corpus.coverage.F2.rows, 0);
  assert.equal(corpus.rows.filter((row) => row.expected.independentCorrectness.protocolError).length, 4);
  assert.ok(corpus.rows.every((row) => Buffer.isBuffer(row.transport.primaryBuffer)));
  assert.ok(corpus.rows.every((row) => !('primaryBuffer' in row.identity)));
  assert.ok(
    corpus.rows
      .filter((row) => row.cohort === 'F1')
      .every((row) => row.expected.referenceCompatibility.status === 'not-applicable-new-independent-row'),
  );
  assert.ok(
    corpus.prospectiveV3.f1.rows.every((row) => row.canonicalPlanUtf8.includes('geospec-st-logical-requests-v3')),
  );
  assert.ok(
    corpus.prospectiveV3.f1.rows.every((row) => row.cacheBinding.executionProfile === 'geospec-st-logical-requests-v3'),
  );
  assert.ok(corpus.prospectiveV3.f1.rows.every((row) => row.subjectBinding.status === 'unchanged-from-v2-admission'));
  assert.ok(
    corpus.prospectiveV3.f1.rows.every(
      (row) => !JSON.stringify(row).includes('cbf1df63a329f71fdc772938eb3a8a16f42d52983f82ccaf6966ea4182f4542c'),
    ),
  );
  assert.match(corpus.fingerprint, /^[\da-f]{64}$/);
});

void test('should bind pinned definitions to the consumed engine binary bytes', () => {
  const definitions = {
    f1: { path: 'f1.rs', sha256: 'd0af57f6550b508cc9fdb63b84180a554541ff3c7b8f53346ba1350449043350' },
    f2: { path: 'f2.rs', sha256: '4beeda4833a7609b9b22f58e25df6554be61233f4eb5224320e69251f7a265d7' },
  };
  const binary = Buffer.concat([
    Buffer.from([0, 97, 115, 109]),
    Buffer.from(definitions.f1.sha256, 'latin1'),
    Buffer.from([0]),
    Buffer.from(definitions.f2.sha256, 'latin1'),
  ]);
  requireDefinitionsInBinary(definitions, binary, 'engine.wasm');
  const drifted = { ...definitions, f2: { ...definitions.f2, sha256: 'f'.repeat(64) } };
  assert.throws(() => {
    requireDefinitionsInBinary(drifted, binary, 'engine.wasm');
  }, /does not carry definition f2/u);
  assert.throws(() => {
    requireDefinitionsInBinary({ f1: { path: 'f1.rs', sha256: 'D0AF' } }, binary, 'engine.wasm');
  }, /pinned definition identity/u);
});
