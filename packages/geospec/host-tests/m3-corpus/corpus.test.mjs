/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, no-restricted-imports -- This standalone host check consumes its sibling adapter outside workspace aliases and typed source roots. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadM3Corpus } from './corpus.mjs';

void test('should assemble the frozen M3 corpus without crossing acceptance tracks', () => {
  const corpus = loadM3Corpus(process.cwd());
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
