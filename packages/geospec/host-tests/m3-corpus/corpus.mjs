/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- The input is hash-verified frozen JSON without a runtime schema package. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
// oxlint-disable-next-line no-restricted-imports -- The standalone data harness reads its local fixture closure without workspace aliases.
import { fixtureWorkspaceRoot, readFixture } from '../fixtures/read-fixture.mjs';

const RUN = 'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation';
const B35 = `${RUN}/lead/matcher-full-entry/current-approved-b35-inputs.json`;
const B55 = `${RUN}/lead/matcher-full-entry/native-comparison-b55-inputs.json`;
const M3 = `${RUN}/lead/m2-delivery-a1/m3-inventory.json`;
const STEP_A2 = `${RUN}/lanes/matcher-full-oracle-metadata-a2/step-name-report-v2-amendment.json`;
const HISTORICAL = [
  `${RUN}/lead/matcher-full-entry/metadata-installed-b19/joined-inputs.json`,
  `${RUN}/lead/matcher-full-entry/a3-installed-b19/joined-inputs.json`,
];
const F1_RESULTS = `${RUN}/lanes/matcher-full-f1-fullwire-a1/revisions/metadata-a2/fullwire-results.json`;
const F1_ADMISSIONS = `${RUN}/lanes/matcher-full-f1-fullwire-a1/revisions/metadata-a2/binary-admissions.json`;
const PRINCIPAL_M3 = `${RUN}/execution/principal-m3-review-a1.json`;
const ACCEPTANCE = `${RUN}/lead/m3-geometry-a1/lanes/corpus/acceptance-track-addendum.md`;
const SHARED_V3 = `${RUN}/lead/m3-geometry-a1/shared-v3`;
const EARLY = 'packages/geospec-engine-native/conformance/early-corpus.json';

const AUTHORITIES = Object.freeze({
  [B35]: '843ddcab7d2a0b89f36e5cca418c155c0bf40ba387c82e9c1a70779c29185520',
  [B55]: '178845d6266551dcb03efe6bf5e155e4b75b5a9dbdf1912fc4ae89c259856111',
  [M3]: 'fcfa65f762de7d8cb8f37459d99fd3f9c89d82d8bdf220ca8ec9f831bd564c95',
  [STEP_A2]: '002ddd3b3088b6fe4e8135d7ac75293ae67d3a857b6c4a1de7f2688c206d7a86',
  [HISTORICAL[0]]: '0d0da6ad2b5c7beca4eced08d489f2d4da6fc56baeb3270cdf8481a3979dcd9e',
  [HISTORICAL[1]]: '85597915a354889e6dcef1df922a86ebf1b7c12212f936909c871d48be3fd57c',
  [F1_RESULTS]: 'd961d9e25b36fbc2baa8812e114b0fd37ee5c6f92453474dbac1022b86df1aab',
  [F1_ADMISSIONS]: 'f4454477a775cb0ade226d6f89a2cff460b0bfdb2f2c2655419da6c450051075',
  [ACCEPTANCE]: '2d40d6231048caed5209ac4b1518c89d0b2edadda84a6ed89d251639b0082ddb',
  [`${SHARED_V3}/definition-records.json`]: '757e741b398ec5b722e2ae0c524db6dd61cb98573b5b860b954957cf1ec7b81e',
  [`${SHARED_V3}/definition-source-bindings.json`]: '3126ac83435e6345815766ae921522b393ffaabdf8dbc8145bbcb7cfa9d896ef',
  [`${SHARED_V3}/definition-canonical.json`]: '831b4425151e11660c9e07f86babfecfd3adaaaf273991a623ce7ae9e0ad59b3',
  [`${SHARED_V3}/definition-encoding-receipt.json`]: '744b42f7efe06f679bcde6b6933fca802a103111e2d6b80637cb2ac72701ef7d',
  [EARLY]: '3d43750d055dceec2b7d57c92d4a953c4f7dcd40c2abb1452a82de83ea729476',
});

const OLD_PROFILE = 'geospec-st-logical-requests-v2';
const NEW_PROFILE = 'geospec-st-logical-requests-v3';
const OLD_VERIFIER = 'cbf1df63a329f71fdc772938eb3a8a16f42d52983f82ccaf6966ea4182f4542c';
const NEW_VERIFIER = '831b4425151e11660c9e07f86babfecfd3adaaaf273991a623ce7ae9e0ad59b3';
const CONTINUOUS_DECISION_SHA256 = 'f600f72f04f7d6b7c77e602b939d9f40075393463170305085b47fa1d9a5677b';
const ANCILLARY = new Set(['analyzeMesh', 'analyzeBrep', 'inspectGeometry', 'analyzeMeshOverlap']);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readAuthority(workspaceRoot, path) {
  const bytes = readFixture(path, workspaceRoot);
  assert.equal(sha256(bytes), AUTHORITIES[path], `authority hash changed: ${path}`);
  return JSON.parse(bytes);
}

function verifyDeclaredSources(workspaceRoot, sources) {
  const seen = new Set();
  for (const source of sources) {
    if (seen.has(source.path)) {
      continue;
    }
    seen.add(source.path);
    assert.equal(
      sha256(readFixture(source.path, workspaceRoot)),
      source.sha256,
      `declared source hash changed: ${source.path}`,
    );
  }
}

function loadBytes(workspaceRoot, spec, cache) {
  if (cache.has(spec.sha256)) {
    return cache.get(spec.sha256);
  }
  let bytes;
  if (spec.utf8 === undefined) {
    bytes =
      spec.hex === undefined
        ? readFixture(spec.path ?? spec.originalPath, workspaceRoot)
        : Buffer.from(spec.hex, 'hex');
  } else {
    bytes = Buffer.from(spec.utf8);
  }
  assert.equal(bytes.byteLength, spec.byteLength ?? spec.bytes, `byte length changed: ${spec.path ?? spec.sha256}`);
  assert.equal(sha256(bytes), spec.sha256, `binary hash changed: ${spec.path ?? spec.sha256}`);
  cache.set(spec.sha256, bytes);
  return bytes;
}

function claimFrom(row) {
  const request = JSON.parse(row.authoredRequestJson ?? row.submitRequestUtf8);
  const claim = request.plan.claims[0];
  const arguments_ =
    claim.payload?.arguments ??
    (claim.capability === 'toBeWatertight' ||
    claim.capability === 'toSatisfyRationalPlate' ||
    ANCILLARY.has(claim.capability)
      ? []
      : [claim.payload?.expected]);
  return { ...claim, arguments: arguments_ };
}

function relationshipKind(claim) {
  return claim.payload?.expected?.relationships?.[0]?.kind ?? null;
}

function comparisonStatus(row) {
  if (row.protocolError) {
    return 'protocol-error';
  }
  if (row.evaluatePlanResultUtf8 && row.submitClaimsResultUtf8) {
    return row.comparison ?? 'full';
  }
  return 'canonical-only';
}

function currentIdentity(row, stepAmendment) {
  const amendment = stepAmendment.get(row.id)?.successorReportV2;
  const { subject } = row;
  return {
    subjectHash: amendment?.subjectHash ?? subject.subjectHash,
    subjectContentHash: amendment?.subjectContentHash ?? subject.subjectContentHash ?? subject.primary?.sha256,
    descriptorUtf8: amendment?.descriptorUtf8 ?? subject.descriptorUtf8 ?? subject.semanticDescriptorUtf8,
    ingestRequestUtf8: amendment?.ingestRequestUtf8 ?? subject.ingestTransport.requestUtf8,
    format:
      subject.format ??
      JSON.parse(amendment?.descriptorUtf8 ?? subject.descriptorUtf8 ?? subject.semanticDescriptorUtf8).format,
  };
}

function referenceTrack(row, source) {
  if (!row) {
    return { status: 'not-applicable-new-independent-row', source: null };
  }
  return {
    status: 'frozen-historical-reference',
    source,
    subjectHash: row.subject.subjectHash,
    descriptorUtf8: row.subject.semanticDescriptorUtf8 ?? row.subject.descriptorUtf8,
    ingestRequestUtf8: row.subject.ingestTransport.requestUtf8,
    authoredRequestUtf8: row.authoredRequestJson,
    canonicalPlanUtf8: row.canonicalPlanUtf8,
    evaluatePlanResultUtf8: row.evaluatePlanResultUtf8 ?? null,
    submitClaimsResultUtf8: row.submitClaimsResultUtf8 ?? null,
    protocolError: row.protocolError ? { stage: 'canonical-plan', ...row.protocolError } : null,
  };
}

function measurementTrack(row, claim, selectedSource) {
  if (row.protocolError ?? !row.evaluatePlanResultUtf8) {
    return { classification: 'nonmeasurement', authority: selectedSource, exactDomain: null };
  }
  const exactDomain = row.cohort === 'strict-cylinder' || row.cohort === 'continuous-box';
  return {
    classification: exactDomain ? 'exact-domain-control' : 'approximate-scalar-or-structural',
    authority: selectedSource,
    exactDomain: exactDomain ? 'approved nominal analytic control only' : null,
    accuracyContract: exactDomain
      ? 'independently predeclared expected wire result'
      : (row.applicability?.numericCertification ?? null),
    measured: JSON.parse(row.evaluatePlanResultUtf8).results?.[0]?.evidence?.measured ?? null,
    decisionContract: claim.payload ?? null,
  };
}

function canonicalRecord(canonicalUtf8) {
  return {
    value: JSON.parse(canonicalUtf8),
    canonicalUtf8,
    sha256: sha256(canonicalUtf8),
    byteLength: Buffer.byteLength(canonicalUtf8),
  };
}

function prospectiveF1Row(row, subject) {
  assert.ok(row.canonicalPlanUtf8.includes(OLD_PROFILE), `${row.id}: missing frozen v2 profile`);
  assert.ok(row.claimResult.canonicalUtf8.includes(OLD_VERIFIER), `${row.id}: missing frozen verifier digest`);
  const canonicalPlanUtf8 = row.canonicalPlanUtf8.replaceAll(OLD_PROFILE, NEW_PROFILE);
  const canonicalPlanSha256 = sha256(canonicalPlanUtf8);
  const rewrite = (value) =>
    value
      .replaceAll(row.canonicalPlanSha256, canonicalPlanSha256)
      .replaceAll(OLD_PROFILE, NEW_PROFILE)
      .replaceAll(OLD_VERIFIER, NEW_VERIFIER);
  return {
    id: row.id,
    geometryId: row.geometryId,
    subjectHash: row.subjectHash,
    subjectBinding: {
      status: 'unchanged-from-v2-admission',
      descriptorUtf8: subject.descriptorUtf8,
      primary: {
        originalPath: subject.primary.originalPath,
        byteLength: subject.primary.byteLength,
        sha256: subject.primary.sha256,
      },
    },
    numericProfile: NEW_PROFILE,
    verifierSourceHash: NEW_VERIFIER,
    canonicalPlanUtf8,
    canonicalPlanSha256,
    submitRequestUtf8: row.submitRequestUtf8,
    submitRequestSha256: row.submitRequestSha256,
    claimResult: canonicalRecord(rewrite(row.claimResult.canonicalUtf8)),
    neutralResult: canonicalRecord(rewrite(row.neutralResult.canonicalUtf8)),
    submitResponse: canonicalRecord(rewrite(row.submitResponse.canonicalUtf8)),
    cacheBinding: {
      executionProfile: NEW_PROFILE,
      namespaceSha256: sha256(`${NEW_PROFILE}\0${NEW_VERIFIER}\0${row.subjectHash}\0${canonicalPlanSha256}`),
    },
    sourceJoins: [
      ...row.sourceJoins.filter((source) => source.sha256 !== OLD_VERIFIER),
      { path: `${SHARED_V3}/definition-canonical.json`, sha256: NEW_VERIFIER, jsonPointer: '' },
    ],
    status: 'prospective-independent-metadata-binding; empirical-profile-conformance-pending',
  };
}

function metadataRow(row) {
  return {
    id: row.id,
    cohort: row.cohort,
    capability: row.claim.capability,
    polarity: row.claim.polarity,
    subjectHash: row.identity.subjectHash,
    primarySha256: row.identity.primary.sha256,
    resourceSha256: row.identity.resources.map((resource) => resource.sha256),
    canonicalPlanSha256: sha256(row.expected.independentCorrectness.canonicalPlanUtf8),
    comparison: row.expected.independentCorrectness.status,
  };
}

export function fingerprintM3Corpus(corpus) {
  return sha256(
    JSON.stringify({
      schemaVersion: corpus.schemaVersion,
      rows: corpus.rows.map(metadataRow),
      prospectiveF1: corpus.prospectiveV3.f1.rows.map((row) => ({
        id: row.id,
        plan: row.canonicalPlanSha256,
        result: row.claimResult.sha256,
        neutral: row.neutralResult.sha256,
        response: row.submitResponse.sha256,
      })),
    }),
  );
}

export function loadM3Corpus(workspaceRoot = fixtureWorkspaceRoot) {
  const b35 = readAuthority(workspaceRoot, B35);
  const b55 = readAuthority(workspaceRoot, B55);
  const m3 = readAuthority(workspaceRoot, M3);
  const stepA2 = readAuthority(workspaceRoot, STEP_A2);
  const histories = HISTORICAL.map((path) => [path, readAuthority(workspaceRoot, path)]);
  const f1Results = readAuthority(workspaceRoot, F1_RESULTS);
  const f1Admissions = readAuthority(workspaceRoot, F1_ADMISSIONS);
  const principal = JSON.parse(readFixture(PRINCIPAL_M3, workspaceRoot));
  const early = readAuthority(workspaceRoot, EARLY);
  readAuthority(workspaceRoot, `${SHARED_V3}/definition-records.json`);
  readAuthority(workspaceRoot, `${SHARED_V3}/definition-source-bindings.json`);
  readAuthority(workspaceRoot, `${SHARED_V3}/definition-canonical.json`);
  const definitionReceipt = readAuthority(workspaceRoot, `${SHARED_V3}/definition-encoding-receipt.json`);
  assert.equal(
    sha256(readFixture(ACCEPTANCE, workspaceRoot)),
    AUTHORITIES[ACCEPTANCE],
    `authority hash changed: ${ACCEPTANCE}`,
  );
  assert.equal(
    sha256(JSON.stringify(principal.continuousContractDecision)),
    CONTINUOUS_DECISION_SHA256,
    'principal continuous-contract decision changed',
  );
  verifyDeclaredSources(workspaceRoot, [...b35.sources, ...b55.sources]);

  const replacement = new Map(b55.rows.map((row) => [row.id, row]));
  const selected = b35.rows.map((row) => replacement.get(row.id) ?? row);
  const baseIds = new Set(b35.rows.map((row) => row.id));
  selected.push(...b55.rows.filter((row) => !baseIds.has(row.id)));
  assert.equal(new Set(selected.map((row) => row.id)).size, 322, 'B35/B55 join must contain 322 unique rows');

  const history = new Map();
  for (const [source, corpus] of histories) {
    for (const row of corpus.rows) {
      assert.ok(!history.has(row.id), `duplicate historical row: ${row.id}`);
      history.set(row.id, { row, source });
    }
  }
  assert.equal(history.size, 304, 'historical reference denominator changed');

  const stepAmendment = new Map(stepA2.rowAmendments.map((row) => [row.id, row]));
  const observed = new Set(m3.capabilities.flatMap((entry) => entry.m2ObservedCases.map((row) => row.id)));
  assert.equal(observed.size, 30, 'M2 observed denominator changed');
  const bytes = new Map();
  const rows = selected.map((row) => {
    const claim = claimFrom(row);
    const identity = currentIdentity(row, stepAmendment);
    const transport = row.subject.ingestTransport;
    const canonicalSubject = JSON.parse(row.canonicalPlanUtf8).plan.subjects[0].subjectHash;
    assert.equal(canonicalSubject, identity.subjectHash, `${row.id}: canonical/current subject mismatch`);
    const historical = history.get(row.id);
    const selectedSource = replacement.has(row.id) ? B55 : B35;
    return {
      id: row.id,
      cohort: row.cohort ?? row.id.split('/')[0],
      capability: claim.capability,
      relationshipKind: relationshipKind(claim),
      claim,
      authoring: {
        javascript: { module: '@taucad/geospec/assertion-client', method: 'expectGeo', arguments: claim.arguments },
        python: { module: 'geospec', method: 'expect_geo', arguments: claim.arguments },
      },
      identity: {
        ...identity,
        primary: { ...transport.primaryBuffer, bytes: undefined },
        resources: transport.resourceBuffers.map(({ utf8: _utf8, hex: _hex, ...resource }) => resource),
      },
      transport: {
        ingestRequestUtf8: identity.ingestRequestUtf8,
        primaryBuffer: loadBytes(workspaceRoot, transport.primaryBuffer, bytes),
        resourceBuffers: transport.resourceBuffers.map((resource) => loadBytes(workspaceRoot, resource, bytes)),
      },
      expected: {
        referenceCompatibility: referenceTrack(historical?.row, historical?.source),
        independentCorrectness: {
          status: comparisonStatus(row),
          source: selectedSource,
          authoredRequestUtf8: row.authoredRequestJson,
          canonicalPlanUtf8: row.canonicalPlanUtf8,
          evaluatePlanResultUtf8: row.evaluatePlanResultUtf8 ?? null,
          submitClaimsResultUtf8: row.submitClaimsResultUtf8 ?? null,
          protocolError: row.protocolError ? { stage: 'canonical-plan', ...row.protocolError } : null,
          measurement: measurementTrack(row, claim, selectedSource),
          preservedGaps: row.preservedGaps ?? [],
        },
        empiricalProfileConformance: {
          status: observed.has(row.id) ? 'reuse-m2-observed-cell' : 'pending-lead-runtime-campaign',
          source: M3,
        },
      },
      amendments: [
        ...(stepAmendment.has(row.id) ? [{ kind: 'step-report-v2-identity', source: STEP_A2 }] : []),
        ...(replacement.has(row.id) ? [{ kind: 'approved-b55-successor', source: B55 }] : []),
      ],
    };
  });

  const admission = new Map(f1Admissions.map((row) => [row.subjectId, row]));
  for (const result of f1Results) {
    const subject = admission.get(result.geometryId);
    assert.ok(subject, `${result.id}: missing F1 subject admission`);
    const claim = claimFrom(result);
    rows.push({
      id: result.id,
      cohort: 'F1',
      capability: claim.capability,
      relationshipKind: null,
      claim,
      authoring: {
        javascript: { module: '@taucad/geospec/assertion-client', method: 'expectGeo', arguments: [] },
        python: { module: 'geospec', method: 'expect_geo', arguments: [] },
      },
      identity: {
        subjectHash: subject.subjectHash,
        subjectContentHash: subject.primary.sha256,
        descriptorUtf8: subject.descriptorUtf8,
        format: 'rational-plate',
        primary: {
          originalPath: subject.primary.originalPath,
          byteLength: subject.primary.byteLength,
          sha256: subject.primary.sha256,
        },
        resources: subject.resourceBuffers.map(({ utf8: _utf8, hex: _hex, ...resource }) => resource),
      },
      transport: {
        ingestRequestUtf8: subject.request.canonicalUtf8,
        primaryBuffer: loadBytes(workspaceRoot, subject.primary, bytes),
        resourceBuffers: subject.resourceBuffers.map((resource) => loadBytes(workspaceRoot, resource, bytes)),
      },
      expected: {
        referenceCompatibility: { status: 'not-applicable-new-independent-row', source: null },
        independentCorrectness: {
          status: 'full',
          source: F1_RESULTS,
          authoredRequestUtf8: result.submitRequestUtf8,
          canonicalPlanUtf8: result.canonicalPlanUtf8,
          evaluatePlanResultUtf8: result.neutralResult.canonicalUtf8,
          submitClaimsResultUtf8: result.submitResponse.canonicalUtf8,
          protocolError: null,
          measurement: {
            classification: 'exact-domain-control',
            authority: F1_RESULTS,
            exactDomain: 'geospec.rational-orthogonal-plate/v1',
            accuracyContract: 'exact rational independent box-intersection and row-sweep evidence',
            measured: result.claimResult.value.evidence.measured,
            decisionContract: claim.payload,
          },
          preservedGaps: [],
        },
        empiricalProfileConformance: { status: 'reuse-m2-observed-cell', source: M3 },
      },
      amendments: [],
    });
  }
  assert.equal(rows.length, 334, 'selected M3 corpus denominator changed');

  const originalMatchers = m3.capabilities
    .filter((entry) => entry.category === 'original-matcher')
    .map((entry) => entry.capability);
  const ancillary = m3.capabilities.filter((entry) => entry.category === 'ancillary').map((entry) => entry.capability);
  const standardRelationships = new Set(
    rows.filter((row) => row.id.startsWith('relationship/')).map((row) => row.id.replace(/\/(positive|negative)$/, '')),
  );
  const analyticRelationships = new Set(
    rows
      .filter((row) => row.id.startsWith('analytic-relationship/'))
      .map((row) => row.id.split('/').slice(0, -3).join('/')),
  );
  const relationshipKinds = new Set(rows.map((row) => row.relationshipKind).filter(Boolean));
  const prospectiveF1 = f1Results.map((row) => prospectiveF1Row(row, admission.get(row.geometryId)));
  assert.equal(definitionReceipt.verifierSourceHash, NEW_VERIFIER, 'shared v3 verifier receipt changed');
  assert.equal(principal.continuousContractDecision.id, 'W3-W5-CONTINUOUS-NOMINAL-01');

  const corpus = {
    schemaVersion: 1,
    taskId: 'M3-CORPUS-A1',
    authorities: [
      ...Object.entries(AUTHORITIES).map(([path, sha256]) => ({ path, sha256 })),
      { path: PRINCIPAL_M3, jsonPointer: '/continuousContractDecision', sha256: CONTINUOUS_DECISION_SHA256 },
    ],
    rows,
    preservedCohorts: {
      early320: {
        path: EARLY,
        sha256: AUTHORITIES[EARLY],
        records: early.records.length,
        meshes: early.meshes.length,
        equivalentCanonicalGroups: early.equivalentCanonicalGroups.length,
        status: 'frozen-unchanged',
      },
      selector87: rows.filter((row) => row.cohort === 'selector').length,
      relationship67: standardRelationships.size + analyticRelationships.size,
    },
    coverage: {
      selectedRows: rows.length,
      originalMatchers: {
        expected: 24,
        present: originalMatchers.filter((capability) => rows.some((row) => row.capability === capability)),
      },
      relationshipKinds: {
        expected: m3.relationshipKinds,
        present: [...relationshipKinds].sort((left, right) => left.localeCompare(right)),
      },
      ancillaryOperations: {
        expected: 4,
        present: ancillary.filter((capability) => rows.some((row) => row.capability === capability)),
      },
      F1: { rows: f1Results.length, status: 'independent-v2-expected-plus-prospective-v3-binding' },
      F2: { rows: 0, ...m3.F2 },
    },
    reusedM2Cases: m3.capabilities.flatMap((entry) =>
      entry.m2ObservedCases.map((row) => ({ capability: entry.capability, ...row, source: M3 })),
    ),
    prospectiveV3: {
      decision: {
        id: principal.continuousContractDecision.id,
        numericProfile: NEW_PROFILE,
        status: 'adopted-for-implementation; no runtime, target, or full-family acceptance',
      },
      continuous: { status: 'pending-independent-controls-for-every-new-outcome', frozenV2RowsUnchanged: true },
      f1: {
        status: 'prospective-independent-metadata-rebinding; empirical-profile-conformance-pending',
        verifierSourceHash: NEW_VERIFIER,
        rows: prospectiveF1,
      },
    },
    integration: {
      registration: {
        owner: 'M3 lead',
        module: 'packages/geospec/host-tests/m3-corpus/corpus.mjs',
        export: 'loadM3Corpus',
        applied: false,
      },
      focusedCheck: 'node --test packages/geospec/host-tests/m3-corpus/corpus.test.mjs',
      input:
        'loadM3Corpus(workspaceRoot); pass each row transport buffer separately from row identity and expected tracks',
    },
  };
  corpus.fingerprint = fingerprintM3Corpus(corpus);
  return corpus;
}

/**
 * Check the complete evaluation layer without changing its canonical bytes.
 * A single result row or submit response is a different protocol object.
 * @internal
 */
export function requireEvaluationEnvelope(utf8, label) {
  assert.equal(typeof utf8, 'string', `${label}: evaluation UTF8 is required`);
  const value = JSON.parse(utf8);
  assert.deepEqual(
    Object.keys(value).sort(),
    ['numericProfile', 'results'],
    `${label}: expected complete evaluation envelope`,
  );
  assert.equal(typeof value.numericProfile, 'string', `${label}: numeric profile`);
  assert.ok(Array.isArray(value.results), `${label}: evaluation results`);
  return value;
}

/**
 * Bind an independently frozen public case at its actual protocol layers.
 * This reads authority bytes; it does not invoke a candidate codec or engine.
 * @internal
 */
export function bindIndependentPublicCase(value, label) {
  for (const key of ['claim', 'canonicalPlan', 'canonicalResult', 'evaluation']) {
    const record = value[key];
    assert.equal(typeof record?.utf8, 'string', `${label}: ${key} UTF8`);
    const bytes = Buffer.from(record.utf8);
    assert.equal(bytes.byteLength, record.byteLength, `${label}: ${key} length`);
    assert.equal(sha256(bytes), record.sha256, `${label}: ${key} hash`);
    assert.deepEqual(JSON.parse(record.utf8), record.value, `${label}: ${key} value`);
  }
  const envelope = requireEvaluationEnvelope(value.evaluation.utf8, label);
  assert.equal(envelope.numericProfile, value.canonicalPlan.value.numericProfile, `${label}: profile join`);
  assert.deepEqual(value.canonicalPlan.value.plan.claims, [value.claim.value], `${label}: claim join`);
  assert.deepEqual(envelope.results, [value.canonicalResult.value], `${label}: result-row join`);
  assert.equal(value.canonicalResult.value.claimId, value.claim.value.claimId, `${label}: result identity`);
  return {
    canonicalClaimUtf8: value.claim.utf8,
    canonicalPlanUtf8: value.canonicalPlan.utf8,
    canonicalResultUtf8: value.evaluation.utf8,
  };
}
