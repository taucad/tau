import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
// oxlint-disable-next-line no-restricted-imports -- Pure host check consumes the adjacent nonpublished fixture join.
import { joinCurrentCorpus, projectNumericProfile, selectCorpusRecords } from '../../conformance/current-profile.mjs';

const original = await readFile(new URL('../../conformance/early-corpus.json', import.meta.url));
const profile = await readFile(
  new URL('../../rust/tests/fixtures/current-profile-01/plan-corpus.json', import.meta.url),
);
const successor = await readFile(
  new URL('../../rust/tests/fixtures/current-profile-v5/numeric-profile.txt', import.meta.url),
);

await it('should declare full backend presence while preserving every other frozen expectation and input', async () => {
  const before = [Buffer.from(original), Buffer.from(profile)];
  const core = await joinCurrentCorpus(original, profile);
  const full = await joinCurrentCorpus(original, profile, 'full-backend');
  assert.equal(core.bindingProfile, 'core-only');
  assert.equal(full.bindingProfile, 'full-backend');
  assert.deepEqual(full.meshes, core.meshes);
  assert.deepEqual(full.equivalentCanonicalGroups, core.equivalentCanonicalGroups);
  assert.equal(full.records.length, 320);
  let changed = 0;
  for (const [index, row] of full.records.entries()) {
    const baseline = core.records[index];
    if (row.id !== 'a1/raw/initialize') {
      assert.deepEqual(row, baseline);
      continue;
    }
    changed += 1;
    assert.notEqual(row.expectedUtf8, undefined);
    assert.notEqual(baseline.expectedUtf8, undefined);
    const expected = /** @type {{ result: { configuration: { backends: { brep: boolean, csg: boolean } } } }} */ (
      JSON.parse(row.expectedUtf8)
    );
    assert.deepEqual(expected.result.configuration.backends, { brep: true, csg: true });
    expected.result.configuration.backends = { brep: false, csg: false };
    assert.deepEqual(expected, JSON.parse(baseline.expectedUtf8));
    assert.deepEqual({ ...row, expectedUtf8: baseline.expectedUtf8 }, baseline);
    assert.equal(Buffer.byteLength(row.expectedUtf8), Buffer.byteLength(baseline.expectedUtf8) - 2);
  }
  assert.equal(changed, 1);
  assert.deepEqual([original, profile], before);
});

await it('should select exact ordered valid records with complete equivalent groups and preserve the full default', async () => {
  const corpus = await joinCurrentCorpus(original, profile);
  assert.deepEqual(selectCorpusRecords(corpus), corpus.records);
  const ids = ['a1/raw/initialize', ...corpus.equivalentCanonicalGroups[0], 'a2/ingest/asymmetric'];
  const selected = selectCorpusRecords(corpus, ids);
  assert.deepEqual(
    selected.map(({ id }) => id),
    ids,
  );
  assert.equal(selected.length, 9);
  assert.equal(selected.filter(({ id }) => corpus.equivalentCanonicalGroups[0].includes(id)).length, 7);
  assert.deepEqual(
    selected,
    ids.map((id) => corpus.records.find((row) => row.id === id)),
  );
});

await it('should leave incidental profile text and similarly named fields unchanged', () => {
  const old = 'geospec-st-logical-requests-v3';
  const source = `{"numericProfile":"${old}","note":"${old}","otherNumericProfile":"${old}"}`;
  assert.equal(
    projectNumericProfile(source, 'geospec-demand-v5'),
    `{"numericProfile":"geospec-demand-v5","note":"${old}","otherNumericProfile":"${old}"}`,
  );
  assert.equal(projectNumericProfile(undefined, 'geospec-demand-v5'), undefined);
});

await it('should project only the pinned v5 numeric profile and three diagnostics after frozen source validation', async () => {
  const before = [Buffer.from(original), Buffer.from(profile), Buffer.from(successor)];
  const baseline = await joinCurrentCorpus(original, profile, 'full-backend');
  const projected = await joinCurrentCorpus(original, profile, 'full-backend', successor);
  const newToken = 'geospec-demand-v5';
  const axisIds = new Set([
    'a2/invalid-claim/string-axis',
    'plan/invalid-claim/string-axis/canonical',
    'plan/invalid-claim/string-axis/evaluate',
  ]);
  assert.equal(baseline.successorSha256, undefined);
  assert.equal(projected.successorSha256, '5dfd1c400ff18b91804cf5514dfc862f47a975bea00877fbd4f2d5ffe609e34f');
  assert.deepEqual(projected.equivalentCanonicalGroups, baseline.equivalentCanonicalGroups);
  assert.deepEqual(projected.meshes, baseline.meshes);
  let changedInputs = 0;
  let changedOutputs = 0;
  let changedMessages = 0;
  for (const [index, row] of projected.records.entries()) {
    const old = baseline.records[index];
    assert.equal(row.id, old.id);
    assert.equal(row.inputHex, old.inputHex);
    assert.equal(row.inputUtf8, projectNumericProfile(old.inputUtf8, newToken));
    assert.equal(row.expectedUtf8, projectNumericProfile(old.expectedUtf8, newToken));
    assert.equal(
      row.expectedMessage,
      axisIds.has(row.id) ? 'GeoSpec numeric expectation must be an object.' : old.expectedMessage,
    );
    changedInputs += Number(row.inputUtf8 !== old.inputUtf8);
    changedOutputs += Number(row.expectedUtf8 !== old.expectedUtf8);
    changedMessages += Number(row.expectedMessage !== old.expectedMessage);
  }
  assert.deepEqual([changedInputs, changedOutputs, changedMessages], [81, 128, 3]);
  assert.deepEqual([original, profile, successor], before);
  const changedSuccessor = Buffer.from(successor);
  changedSuccessor[0] += 1;
  await assert.rejects(joinCurrentCorpus(original, profile, 'full-backend', changedSuccessor), /v5 successor SHA-256/);
});
