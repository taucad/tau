/* oxlint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-imports -- Hash-bound current authority is intentionally untyped JSON. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixturePath, fixtureWorkspaceRoot, readFixture } from '../fixtures/read-fixture.mjs';

const OLD_PROFILE = 'geospec-st-logical-requests-v3';
const NEW_PROFILE = 'geospec-st-prototypes-v4';
const OLD_F1_SOURCE = '38922652cc624d2a6c84377bddc20e76a0361dc95b87f9c3e94463ded6610df9';
// SHA256 of the existing 45-record F1 checker closure, with current source bytes.
const NEW_F1_SOURCE = '79cf6bca840e45dd5703b6892e5c5a75e27e2ec67ff61d03703d602c41fb6ed4';
const CURRENT_AUTHORITY = 'packages/geospec/host-tests/m3-corpus/current-authority-v3.json';
const CURRENT_AUTHORITY_SHA256 = 'fb0920d448648cf1ea82c1305f8701c7992156a72f5a592cc569b3b3bec0bd51';

function rebindPlan(canonicalUtf8) {
  const oldField = `"numericProfile":"${OLD_PROFILE}"`;
  assert.equal(canonicalUtf8.split(oldField).length, 2, 'plan must declare v3 profile exactly once');
  const plan = JSON.parse(canonicalUtf8);
  assert.equal(plan.numericProfile, OLD_PROFILE);
  return canonicalUtf8.replace(oldField, `"numericProfile":"${NEW_PROFILE}"`);
}

/** Bind only current ordinary expectations to the proposed v4 metadata. @internal */
export function loadCurrentM3CampaignProfileV4(backend, workspaceRoot) {
  assert.ok(backend === 'native' || backend === 'mixed');
  const root = workspaceRoot ?? fixtureWorkspaceRoot;
  const bytes = readFixture(CURRENT_AUTHORITY, root);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), CURRENT_AUTHORITY_SHA256);
  const authority = JSON.parse(bytes);
  assert.equal(authority.protocolVersion, 3);
  assert.equal(authority.registryVersion, 5);
  assert.equal(authority.canonicalProfile, 'geospec-jcs-v1');
  assert.equal(authority.numericProfile, OLD_PROFILE);
  assert.equal(authority.definitions.f1.sha256, OLD_F1_SOURCE);
  for (const [name, definition] of Object.entries(authority.definitions)) {
    const expected = name === 'f1' ? NEW_F1_SOURCE : definition.sha256;
    assert.ok(readFileSync(resolve(root, definition.path), 'utf8').includes(`"${expected}"`));
  }
  assert.equal(authority.rows.length, 352);
  assert.equal(new Set(authority.rows.map((row) => row.id)).size, 352);
  const source = {
    ...authority,
    backend,
    sourcePath: fixturePath(CURRENT_AUTHORITY, root),
    sourceCorpusFingerprint: CURRENT_AUTHORITY_SHA256,
    rows: authority.rows.map((row) => ({
      ...row,
      expected: {
        ...row.expected,
        status:
          backend === 'mixed' ? (authority.mixedStatusOverrides[row.id] ?? row.expected.status) : row.expected.status,
      },
    })),
  };
  const ordinary = source.rows.filter((row) => row.authority.scope === 'ordinary');
  assert.equal(ordinary.length, 334);
  assert.equal(source.rows.length - ordinary.length, 18);
  assert.ok(ordinary.every((row) => row.authority.group === 'ordinary-qualified'));
  const rows = ordinary.map((row) => {
    assert.equal(row.expected.canonicalResultUtf8, null, `${row.id}: new result golden requires review`);
    const { canonicalPlan } = row.expected;
    const key = canonicalPlan.status === 'success' ? 'canonicalUtf8' : 'derivationUtf8';
    const expected = {
      ...row.expected,
      canonicalPlan: {
        ...canonicalPlan,
        [key]: rebindPlan(canonicalPlan[key]),
      },
    };
    if (row.cohort === 'F1') {
      assert.equal(expected.verifierSourceHash, OLD_F1_SOURCE);
      expected.verifierSourceHash = NEW_F1_SOURCE;
    }
    return { ...row, expected };
  });
  assert.equal(new Set(rows.map((row) => row.id)).size, 334);
  assert.equal(rows.filter((row) => row.cohort === 'F1').length, 12);
  return {
    ...source,
    taskId: 'SIMD-P4-QUAL-A1',
    numericProfile: NEW_PROFILE,
    definitions: {
      ...source.definitions,
      f1: { ...source.definitions.f1, sha256: NEW_F1_SOURCE },
    },
    rows,
  };
}
