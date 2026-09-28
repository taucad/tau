/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-imports -- This source-only overlay validates hash-bound corpus JSON outside typed source roots. */
import assert from 'node:assert/strict';
import { loadM3Corpus } from './corpus.mjs';

const OLD_PROFILE = 'geospec-st-logical-requests-v2';
const NEW_PROFILE = 'geospec-st-logical-requests-v3';
const VERIFIER_SOURCE_HASH = '831b4425151e11660c9e07f86babfecfd3adaaaf273991a623ce7ae9e0ad59b3';
const OVERLAY_SOURCE = 'packages/geospec/host-tests/m3-corpus/profile-v3.mjs';

function rebindProfile(canonicalUtf8, nestedInResult = false) {
  const document = JSON.parse(canonicalUtf8);
  const parent = nestedInResult ? document.result : document;
  assert.equal(
    parent.numericProfile,
    OLD_PROFILE,
    `missing v2 numericProfile at ${nestedInResult ? 'result' : '<root>'}`,
  );
  const oldField = `"numericProfile":"${OLD_PROFILE}"`;
  assert.equal(canonicalUtf8.split(oldField).length, 2, 'numericProfile field must occur exactly once');
  const rebound = canonicalUtf8.replace(oldField, `"numericProfile":"${NEW_PROFILE}"`);
  const reboundDocument = JSON.parse(rebound);
  const reboundParent = nestedInResult ? reboundDocument.result : reboundDocument;
  assert.equal(reboundParent.numericProfile, NEW_PROFILE);
  return rebound;
}

function preserveAuthoredRequest(authoredRequestUtf8) {
  const request = JSON.parse(authoredRequestUtf8);
  assert.equal(
    Object.hasOwn(request, 'numericProfile'),
    false,
    'authored submit request unexpectedly binds numericProfile',
  );
  assert.equal(authoredRequestUtf8.includes('"numericProfile"'), false);
  return authoredRequestUtf8;
}

function rebindOptional(canonicalUtf8, nestedInResult = false) {
  return canonicalUtf8 === null ? null : rebindProfile(canonicalUtf8, nestedInResult);
}

function isPendingNewDomain(row) {
  return row.capability === 'toHaveVoidContinuity' || row.relationshipKind === 'insertion';
}

function prospectiveRow(row) {
  const previous = row.expected.independentCorrectness;
  const pendingNewDomain = isPendingNewDomain(row);
  const canonicalPlanUtf8 = rebindProfile(previous.canonicalPlanUtf8);
  return {
    id: row.id,
    sourceRow: row,
    numericProfile: NEW_PROFILE,
    authoredRequestUtf8: preserveAuthoredRequest(previous.authoredRequestUtf8),
    canonicalPlan:
      previous.protocolError === null
        ? { status: 'success', canonicalUtf8: canonicalPlanUtf8 }
        : {
            status: 'error',
            error: previous.protocolError,
            derivationUtf8: canonicalPlanUtf8,
          },
    expected: {
      status: pendingNewDomain ? 'pending-new-domain-authority' : previous.status,
      source: OVERLAY_SOURCE,
      sourceV2: previous.source,
      evaluatePlanResultUtf8: pendingNewDomain ? null : rebindOptional(previous.evaluatePlanResultUtf8),
      submitClaimsResultUtf8: pendingNewDomain ? null : rebindOptional(previous.submitClaimsResultUtf8, true),
      measurement: pendingNewDomain ? null : previous.measurement,
      preservedGaps: previous.preservedGaps,
      referenceCompatibility: row.expected.referenceCompatibility,
      empiricalProfileConformance: row.expected.empiricalProfileConformance,
      withheldV2: pendingNewDomain ? previous : null,
    },
  };
}

/** Load the prospective v3 metadata overlay without mutating the frozen v2 corpus. */
export function loadM3CorpusProfileV3(workspaceRoot) {
  const sourceCorpus = loadM3Corpus(workspaceRoot);
  const rows = sourceCorpus.rows.filter((row) => row.cohort !== 'F1').map((row) => prospectiveRow(row));
  assert.equal(rows.length, 322, 'prospective v3 non-F1 denominator changed');
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, 'prospective v3 row IDs must be unique');
  assert.equal(sourceCorpus.prospectiveV3.f1.rows.length, 12, 'prospective v3 F1 denominator changed');
  assert.equal(
    sourceCorpus.prospectiveV3.f1.verifierSourceHash,
    VERIFIER_SOURCE_HASH,
    'prospective v3 F1 digest changed',
  );
  return {
    schemaVersion: 1,
    taskId: 'M3-CORPUS-V3-A1',
    numericProfile: NEW_PROFILE,
    sourceCorpus,
    rows,
    f1: sourceCorpus.prospectiveV3.f1,
  };
}
