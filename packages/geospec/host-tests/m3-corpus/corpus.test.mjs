/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, no-restricted-imports -- This standalone host check consumes its sibling adapter outside workspace aliases and typed source roots. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { loadCurrentM3Campaign, loadM3Corpus } from './corpus.mjs';
import { fixtureWorkspaceRoot } from '../fixtures/read-fixture.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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

void test('should retain all 352 selected declarations and the 334 ordinary / 18 control partition', () => {
  const campaign = loadCurrentM3Campaign('native');
  assert.equal(campaign.rows.length, 352);
  assert.equal(new Set(campaign.rows.map((row) => row.id)).size, 352);
  assert.equal(
    sha256(campaign.rows.map((row) => row.id).join('\n')),
    '42f5b23e73d10b4b0083b57c6fb5e42bceaead47d33413af86bb312255ffdacf',
  );
  assert.equal(campaign.rows.filter((row) => row.authority.scope === 'ordinary').length, 334);
  const controls = campaign.rows.filter((row) => row.authority.scope === 'control');
  assert.deepEqual(
    controls.map((row) => row.id),
    [
      'ancillary/analyzeMesh/negative',
      'ancillary/analyzeBrep/negative',
      'ancillary/inspectGeometry/negative',
      'ancillary/analyzeMeshOverlap/negative',
      'required-pair/matcher/positive',
      'required-pair/matcher/negative',
      'required-pair/query/positive',
      'facet/missing/positive',
      'facet/missing/negative',
      'f2-nonparallel-positive',
      'f2-identical-composite-positive',
      'f2-ap242-without-pmi-positive',
      'f2-two-occurrences-budget-one-short',
      'f2-same-occurrence-budget-one-short',
      'f2-narrow-upper-budget-one-short',
      'f2-nonparallel-budget-one-short',
      'f2-identical-composite-budget-one-short',
      'f2-ap242-without-pmi-budget-one-short',
    ],
  );
  for (const row of controls) {
    if (row.id.startsWith('ancillary/')) {
      assert.equal(row.matcher, false);
      assert.equal(row.polarity, 'negative');
      assert.equal(row.expected.status, 'protocol-error');
      assert.deepEqual(row.expected.protocolError, {
        stage: 'canonical-plan',
        code: 'invalid-claim',
        message: `Ancillary capability '${row.capability}' requires positive polarity.`,
      });
    } else {
      assert.equal(row.expected.status, 'refused');
    }
  }
});

void test('should select only the four independently approved native/mixed status differences', () => {
  const native = loadCurrentM3Campaign('native');
  const mixed = loadCurrentM3Campaign('mixed');
  const differences = [];
  for (const [index, row] of native.rows.entries()) {
    const counterpart = mixed.rows[index];
    assert.deepEqual(counterpart, { ...row, expected: { ...row.expected, status: counterpart.expected.status } });
    if (row.expected.status !== counterpart.expected.status) {
      differences.push([row.id, row.expected.status, counterpart.expected.status]);
    }
  }
  assert.deepEqual(differences, [
    ['family/toHaveBoundingBox/positive', 'failed', 'passed'],
    ['family/toHaveBoundingBox/negative', 'passed', 'failed'],
    ['family/toHaveCenterOfMass/positive', 'failed', 'passed'],
    ['family/toHaveCenterOfMass/negative', 'passed', 'failed'],
  ]);
  for (const campaign of [native, mixed]) {
    assert.equal(campaign.rows.filter((row) => row.expected.status === 'passed').length, 214);
    assert.equal(campaign.rows.filter((row) => row.expected.status === 'failed').length, 120);
    assert.equal(campaign.rows.filter((row) => row.expected.status === 'refused').length, 14);
    assert.equal(campaign.rows.filter((row) => row.expected.status === 'protocol-error').length, 4);
    assert.ok(campaign.rows.every((row) => row.expected.canonicalResultUtf8 === null));
  }
});

void test('should preserve approved request/plan bytes, identities and budgets without result goldens', () => {
  const campaign = loadCurrentM3Campaign('native');
  const contracts = [];
  const pmi = [];
  for (const row of campaign.rows) {
    const planUtf8 = row.expected.canonicalPlan.canonicalUtf8 ?? row.expected.canonicalPlan.derivationUtf8;
    contracts.push(`${row.id}\0${sha256(row.authoredRequestUtf8)}\0${sha256(planUtf8)}`);
    const authored = JSON.parse(row.authoredRequestUtf8);
    const canonical = JSON.parse(planUtf8);
    const ingest = JSON.parse(row.sourceRow.transport.ingestRequestUtf8);
    for (const request of [authored, canonical, ingest]) {
      assert.equal(request.protocolVersion, 3);
      assert.equal(request.registryVersion, 5);
      assert.equal(request.canonicalProfile, 'geospec-jcs-v1');
    }
    assert.equal(canonical.numericProfile, 'geospec-st-logical-requests-v3');
    for (const request of [authored, canonical]) {
      const claim = request.plan.claims[0];
      assert.equal(claim.claimId, row.claimId);
      assert.equal(claim.capability, row.capability);
      assert.equal(claim.polarity, row.polarity);
      assert.equal(claim.workUnitBudget, row.workUnitBudget);
      assert.deepEqual(claim.subjectSlots, [row.subjectSlot]);
      assert.equal(request.plan.subjects[0][row.identityField], row.expectedIdentity);
    }
    assert.deepEqual(row.authoring.queryPayload, authored.plan.claims[0].payload);
    assert.equal(sha256(row.sourceRow.identity.descriptorUtf8), row.expectedIdentity);
    if (row.capability === 'queryPmi') {
      pmi.push(row.id);
      assert.equal(authored.plan.claims[0].payload, null);
      assert.deepEqual(canonical.plan.claims[0].payload, { maxOutputBytes: 1_048_576, maxRecords: 1024 });
    }
  }
  assert.equal(sha256(contracts.join('\n')), '7e99d2621b946976d2dd8896c03cdc159a4f72a36f680f7e41439e6127d88f6a');
  assert.deepEqual(pmi, [
    'queryPmi/parallel-plane-distance-source#710',
    'queryPmi/parallel-plane-distance-same-occurrence-source#710',
    'queryPmi/nist_ctc_05_asme1_ap242-e1.stp#941',
  ]);
});

void test('should resolve all 70 exact assets through the existing fixture closure and retain definition guards', () => {
  const campaign = loadCurrentM3Campaign('native');
  const manifest = JSON.parse(readFileSync(new URL('../fixtures/manifest.json', import.meta.url), 'utf8'));
  const registered = new Map(
    Object.values(manifest.files).map((record) => [resolve(fixtureWorkspaceRoot, record.path), record]),
  );
  assert.deepEqual(campaign.definitions, {
    f1: {
      path: 'packages/geospec-engine-native/rust/src/certificates/definition.rs',
      sha256: '38922652cc624d2a6c84377bddc20e76a0361dc95b87f9c3e94463ded6610df9',
    },
    f2: {
      path: 'packages/geospec-engine-native/rust/src/certificates/parallel_plane_definition.rs',
      sha256: '4beeda4833a7609b9b22f58e25df6554be61233f4eb5224320e69251f7a265d7',
    },
  });
  const assets = new Set();
  for (const row of campaign.rows) {
    const { transport } = row.sourceRow;
    for (const record of [transport.primaryBuffer, ...transport.resourceBuffers]) {
      const path = resolve(dirname(campaign.sourcePath), record.path);
      assert.equal(registered.get(path).sha256, record.sha256);
      const bytes = readFileSync(path);
      assert.equal(bytes.byteLength, record.byteLength);
      assert.equal(sha256(bytes), record.sha256);
      assets.add(record.sha256);
    }
    if (row.capability === 'toSatisfyRationalPlate') {
      assert.equal(row.expected.verifierSourceHash, campaign.definitions.f1.sha256);
    } else if (row.capability === 'toSatisfyParallelPlaneDistance' || row.capability === 'queryPmi') {
      assert.equal(row.expected.verifierSourceHash, campaign.definitions.f2.sha256);
    }
  }
  assert.equal(assets.size, 70);
});
