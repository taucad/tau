/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-imports -- This standalone source-only check consumes its sibling corpus adapter outside typed source roots. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadM3CorpusProfileV3 } from './profile-v3.mjs';

const OLD_PROFILE = 'geospec-st-logical-requests-v2';
const NEW_PROFILE = 'geospec-st-logical-requests-v3';
const PROFILE_FIELD = '"numericProfile"';

void test('should overlay only prospective v3 profile metadata', () => {
  const profile = loadM3CorpusProfileV3();
  assert.equal(profile.rows.length, 322);
  assert.equal(profile.f1.rows.length, 12);
  assert.equal(profile.f1.verifierSourceHash, '831b4425151e11660c9e07f86babfecfd3adaaaf273991a623ce7ae9e0ad59b3');
  assert.ok(profile.f1.rows.every((row) => row.numericProfile === NEW_PROFILE));
  assert.ok(profile.f1.rows.every((row) => row.cacheBinding.executionProfile === NEW_PROFILE));

  const pendingIds = [];
  let protocolErrors = 0;
  for (const row of profile.rows) {
    const source = row.sourceRow;
    const previous = source.expected.independentCorrectness;
    assert.equal(row.authoredRequestUtf8, previous.authoredRequestUtf8);
    assert.equal(row.authoredRequestUtf8.includes(PROFILE_FIELD), false);
    assert.strictEqual(row.sourceRow.transport.primaryBuffer, source.transport.primaryBuffer);
    assert.deepEqual(row.sourceRow.transport.resourceBuffers, source.transport.resourceBuffers);
    assert.strictEqual(row.expected.referenceCompatibility, source.expected.referenceCompatibility);
    assert.strictEqual(row.expected.empiricalProfileConformance, source.expected.empiricalProfileConformance);

    const reboundPlan =
      row.canonicalPlan.status === 'success' ? row.canonicalPlan.canonicalUtf8 : row.canonicalPlan.derivationUtf8;
    assert.equal(reboundPlan.replace(NEW_PROFILE, OLD_PROFILE), previous.canonicalPlanUtf8);
    assert.equal(JSON.parse(reboundPlan).numericProfile, NEW_PROFILE);

    if (previous.protocolError === null) {
      assert.equal(row.canonicalPlan.status, 'success');
    } else {
      protocolErrors += 1;
      assert.equal(row.canonicalPlan.status, 'error');
      assert.strictEqual(row.canonicalPlan.error, previous.protocolError);
      assert.equal(row.expected.evaluatePlanResultUtf8, null);
      assert.equal(row.expected.submitClaimsResultUtf8, null);
    }

    if (row.expected.status === 'pending-new-domain-authority') {
      pendingIds.push(row.id);
      assert.strictEqual(row.expected.withheldV2, previous);
      assert.equal(row.expected.evaluatePlanResultUtf8, null);
      assert.equal(row.expected.submitClaimsResultUtf8, null);
      assert.equal(row.expected.measurement, null);
      continue;
    }

    assert.equal(row.expected.status, previous.status);
    assert.equal(row.expected.withheldV2, null);
    assert.equal(row.expected.source, 'packages/geospec/host-tests/m3-corpus/profile-v3.mjs');
    assert.equal(row.expected.sourceV2, previous.source);
    assert.strictEqual(row.expected.measurement, previous.measurement);
    if (row.expected.evaluatePlanResultUtf8 !== null) {
      assert.equal(
        row.expected.evaluatePlanResultUtf8.replace(NEW_PROFILE, OLD_PROFILE),
        previous.evaluatePlanResultUtf8,
      );
    }
    if (row.expected.submitClaimsResultUtf8 !== null) {
      assert.equal(
        row.expected.submitClaimsResultUtf8.replace(NEW_PROFILE, OLD_PROFILE),
        previous.submitClaimsResultUtf8,
      );
    }
  }

  assert.equal(protocolErrors, 4);
  assert.deepEqual(pendingIds, [
    'relationship/packages/geospec-engine/fixtures/containment/spark-plug-thread-positive/manifest.json#relationships[0]/positive',
    'relationship/packages/geospec-engine/fixtures/containment/spark-plug-thread-positive/manifest.json#relationships[0]/negative',
    'amendment/W5-VOID-CONTINUOUS-01/minCrossSection/positive',
    'amendment/W5-VOID-CONTINUOUS-01/minCrossSection/negative',
    'analytic-relationship/insertion/half-span-engaged/positive/positive',
    'analytic-relationship/insertion/half-span-engaged/positive/negative',
    'analytic-relationship/insertion/half-span-too-shallow/negative/positive',
    'analytic-relationship/insertion/half-span-too-shallow/negative/negative',
    'family/toHaveVoidContinuity/positive',
    'family/toHaveVoidContinuity/negative',
  ]);
  assert.equal(profile.sourceCorpus.fingerprint, '633a1a2e5deeb1aee1aeedd9ff54c9bcc24bdc4400cfc7f870b3c5c1cc7e30b7');
  assert.ok(
    profile.sourceCorpus.rows.every((row) =>
      row.expected.independentCorrectness.canonicalPlanUtf8.includes(OLD_PROFILE),
    ),
  );
});
