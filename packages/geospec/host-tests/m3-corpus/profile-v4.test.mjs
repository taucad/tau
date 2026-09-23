/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- The frozen authority and source records are hash-bound JSON. */
/* eslint-disable no-restricted-imports -- This standalone source check reads its sibling adapters and fixture root. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { loadCurrentM3CampaignProfileV4 } from './profile-v4.mjs';
import { fixtureWorkspaceRoot, readFixture } from '../fixtures/read-fixture.mjs';

const OLD_PROFILE = 'geospec-st-logical-requests-v3';
const NEW_PROFILE = 'geospec-st-prototypes-v4';
const NEW_F1_SOURCE = '79cf6bca840e45dd5703b6892e5c5a75e27e2ec67ff61d03703d602c41fb6ed4';
const OLD_F1_SOURCE = '38922652cc624d2a6c84377bddc20e76a0361dc95b87f9c3e94463ded6610df9';
const SOURCE_RECORDS =
  'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lead/m3-geometry-a1/principal-integration-a14/definition/f1-records.json';
const ORDINARY_SELECTION =
  'docs/research/artifacts/geospec-native-engine-charter/runs/2026-09-08-worktree-implementation/lanes/m5-current-package-handoff-a38/selection.json';
const CURRENT_AUTHORITY = 'packages/geospec/host-tests/m3-corpus/current-authority-v3.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

void test('should derive the F1 v4 binding from the existing checker closure', () => {
  const records = JSON.parse(readFileSync(resolve(fixtureWorkspaceRoot, SOURCE_RECORDS), 'utf8'));
  assert.equal(records.length, 45);
  assert.equal(sha256(JSON.stringify(records)), OLD_F1_SOURCE);
  const changed = [];
  for (const record of records) {
    if (record.path.startsWith('crates/')) {
      continue; // Archive pins stay in the accepted closure.
    }
    const current = sha256(readFileSync(resolve(fixtureWorkspaceRoot, record.path)));
    if (current !== record.sha256) {
      changed.push(record.path);
    }
    record.sha256 = current;
  }
  assert.deepEqual(changed, [
    'packages/geospec-engine-native/rust/src/certificates/plate_verifier.rs',
    'packages/geospec-engine-native/rust/src/lib.rs',
  ]);
  assert.equal(sha256(JSON.stringify(records)), NEW_F1_SOURCE);
});

void test('should keep the independent checker literal aligned with the core profile', () => {
  const root = resolve(fixtureWorkspaceRoot, 'packages/geospec-engine-native/rust/src');
  const checker = readFileSync(resolve(root, 'certificates/plate_verifier.rs'), 'utf8');
  const protocol = readFileSync(resolve(root, 'protocol.rs'), 'utf8');
  const definition = readFileSync(resolve(root, 'certificates/definition.rs'), 'utf8');
  const checkerProfile = /text\(field\(root, "numericProfile"\)\?\)\? != "([^"]+)"/.exec(checker);
  const coreProfile = /pub\(crate\) const NUMERIC_PROFILE: &str = "([^"]+)";/.exec(protocol);
  const boundSource = /VERIFIER_SOURCE_HASH: &str =\s*"([\da-f]{64})";/.exec(definition);
  assert.ok(checkerProfile);
  assert.ok(coreProfile);
  assert.ok(boundSource);
  assert.equal(checkerProfile[1], NEW_PROFILE);
  assert.equal(checkerProfile[1], coreProfile[1]);
  assert.doesNotMatch(checker, /crate::protocol::NUMERIC_PROFILE/);
  assert.equal(boundSource[1], NEW_F1_SOURCE);
});

void test('should reject stale F1 plan and checker bindings in an inert result', () => {
  const source = readFileSync(new URL('installed.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const compareRecord =');
  const end = source.indexOf('\n};', start);
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const context = vm.createContext({
    Buffer,
    canonicalize: (bytes) => bytes,
    byteRecord: (bytes) => ({ utf8: bytes.toString() }),
    sha256,
  });
  vm.runInContext(`${source.slice(start, end + 3)}\nglobalThis.compare = compareRecord;`, context);
  const row = loadCurrentM3CampaignProfileV4('native').rows.find(
    (candidate) => candidate.cohort === 'F1' && candidate.expected.status === 'passed',
  );
  assert.ok(row);
  const plan = row.expected.canonicalPlan.canonicalUtf8;
  const claim = JSON.parse(plan).plan.claims[0];
  const evidence = {
    planHash: sha256(plan),
    verifierSourceHash: NEW_F1_SOURCE,
  };
  const outcome = {
    route: 'javascript-standalone',
    admittedIdentity: {
      expected: row.expectedIdentity,
      actual: row.expectedIdentity,
    },
    report: {
      canonicalClaim: { utf8: JSON.stringify(claim) },
      canonicalPlan: { utf8: plan },
      canonicalResult: { utf8: '{}' },
      claimId: row.claimId,
      result: { evidence },
      status: 'passed',
    },
    error: null,
    stages: { cleanup: { status: 'released', close: 'closed' } },
  };
  assert.deepEqual([...context.compare(row, outcome).hardFailures], []);
  evidence.planHash = 'stale';
  assert.ok(context.compare(row, outcome).hardFailures.includes('f1-plan-hash'));
  evidence.planHash = sha256(plan);
  evidence.verifierSourceHash = OLD_F1_SOURCE;
  assert.ok(context.compare(row, outcome).hardFailures.includes('f1-verifier-source'));
});

void test('should preserve all ordinary v3 geometry expectations and exclude held controls', () => {
  const frozen = JSON.parse(readFixture(CURRENT_AUTHORITY));
  const selectionBytes = readFileSync(resolve(fixtureWorkspaceRoot, ORDINARY_SELECTION));
  assert.equal(sha256(selectionBytes), 'e77401d8071b36fc929afc7e3d5f6d51118d8161ea22dda5c6ac471ecc508c54');
  const selection = JSON.parse(selectionBytes);
  for (const backend of ['native', 'mixed']) {
    const v4 = loadCurrentM3CampaignProfileV4(backend);
    assert.equal(v4.numericProfile, NEW_PROFILE);
    assert.equal(v4.sourceCorpusFingerprint, sha256(readFixture(CURRENT_AUTHORITY)));
    assert.equal(v4.rows.length, 334);
    assert.equal(frozen.rows.length, 352);
    assert.deepEqual(
      v4.rows.map((row) => row.id),
      frozen.rows.filter((row) => row.authority.scope === 'ordinary').map((row) => row.id),
    );
    assert.deepEqual(
      v4.rows.map((row) => row.id),
      selection.selectedIds,
    );
    assert.deepEqual(
      frozen.rows.filter((row) => row.authority.scope === 'control').map((row) => row.id),
      selection.heldIds,
    );
    assert.equal(v4.definitions.f1.sha256, NEW_F1_SOURCE);
    assert.deepEqual(v4.definitions.f2, frozen.definitions.f2);
    for (const row of v4.rows) {
      const frozenRow = frozen.rows.find((candidate) => candidate.id === row.id);
      assert.ok(frozenRow);
      const original = {
        ...frozenRow,
        expected: {
          ...frozenRow.expected,
          status:
            backend === 'mixed'
              ? (frozen.mixedStatusOverrides[row.id] ?? frozenRow.expected.status)
              : frozenRow.expected.status,
        },
      };
      const key = original.expected.canonicalPlan.status === 'success' ? 'canonicalUtf8' : 'derivationUtf8';
      const oldPlan = original.expected.canonicalPlan[key];
      const newPlan = row.expected.canonicalPlan[key];
      assert.equal(newPlan.replace(`"numericProfile":"${NEW_PROFILE}"`, `"numericProfile":"${OLD_PROFILE}"`), oldPlan);
      assert.equal(JSON.parse(newPlan).numericProfile, NEW_PROFILE);
      assert.equal(row.expected.canonicalResultUtf8, null);
      const restoredExpected = {
        ...row.expected,
        canonicalPlan: original.expected.canonicalPlan,
      };
      if (row.cohort === 'F1') {
        restoredExpected.verifierSourceHash = original.expected.verifierSourceHash;
      }
      assert.deepEqual({ ...row, expected: restoredExpected }, original);
      if (row.cohort === 'F1') {
        assert.equal(row.expected.verifierSourceHash, NEW_F1_SOURCE);
      }
    }
  }
});
