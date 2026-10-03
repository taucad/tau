import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
// oxlint-disable-next-line no-restricted-imports -- Source-only admission authority controls use the same private owner.
import * as profileJoin from '../../conformance/current-profile.mjs';

const { joinCurrentCorpus, projectMaterialRepairSuggestion, projectNumericProfile, selectCorpusRecords } = profileJoin;

const original = await readFile(new URL('../../conformance/early-corpus.json', import.meta.url));
const profile = await readFile(
  new URL('../../rust/tests/fixtures/current-profile-01/plan-corpus.json', import.meta.url),
);
const successor = await readFile(
  new URL('../../rust/tests/fixtures/current-profile-v5/numeric-profile.txt', import.meta.url),
);
const materialSuccessor = await readFile(
  new URL('../../rust/tests/fixtures/current-profile-v6/numeric-profile.txt', import.meta.url),
);

await it('should expose the separately pinned material corpus admission owner', () => {
  assert.equal(typeof profileJoin.loadMaterialCorpus, 'function');
});

await it('should pin material subject byte admissions separately and reject any changed authority', async () => {
  const bytes = await readFile(new URL('../../conformance/material-v6.json', import.meta.url));
  const corpus = await profileJoin.loadMaterialCorpus(bytes);
  assert.equal(corpus.records.length, 46);
  assert.equal(corpus.meshes.length, 20);
  const housing = corpus.meshes.find((mesh) => mesh.id === 'housing-rotor');
  const inverted = corpus.meshes.find((mesh) => mesh.id === 'housing-inverted-winding');
  assert.ok(housing?.admission === 'subject' && inverted?.admission === 'subject');
  assert.equal(housing.contentHash, inverted.contentHash);
  assert.notEqual(housing.resources[0].sha256, inverted.resources[0].sha256);
  assert.notEqual(housing.subjectHash, inverted.subjectHash);
  assert.ok(corpus.meshes.every((mesh) => mesh.admission === 'subject' && !('meshHex' in mesh)));
  assert.equal(selectCorpusRecords(corpus, ['material/tetra-cube/at'])[0].id, 'material/tetra-cube/at');
  const changed = Buffer.from(bytes);
  changed[changed.length - 2] += 1;
  await assert.rejects(profileJoin.loadMaterialCorpus(changed), /material corpus SHA-256/);
  await assert.rejects(profileJoin.loadMaterialCorpus(original), /material corpus SHA-256/);
});

await it('should bind the material successor with only the approved profile and eight repair suggestions changed', async () => {
  const historical = await joinCurrentCorpus(original, profile, 'full-backend', successor);
  const current = await joinCurrentCorpus(original, profile, 'full-backend', materialSuccessor);
  assert.equal(current.records.length, 320);
  assert.deepEqual(current.meshes, historical.meshes);
  for (const [index, row] of current.records.entries()) {
    const old = historical.records[index];
    /** @type {(text: string | undefined) => string | undefined} */
    const project = (text) =>
      text?.replaceAll('"numericProfile":"geospec-demand-v5"', '"numericProfile":"geospec-demand-v6"');
    assert.deepEqual(row, {
      ...old,
      inputUtf8: project(old.inputUtf8),
      expectedUtf8: project(projectMaterialRepairSuggestion(old.id, old.expectedUtf8)),
    });
  }
  const changed = Buffer.from(materialSuccessor);
  changed[0] += 1;
  await assert.rejects(joinCurrentCorpus(original, profile, 'full-backend', changed), /successor SHA-256/);
});

await it('should change only the exact approved suggestion literal and refuse missing, duplicate or wrong premises', () => {
  const id = 'a2/raw/zero-tolerance';
  const old = 'Correct the model dimensions, or widen the declared bounding-box tolerance.';
  const approved = 'Correct the model dimensions to match the declared bounds; preserve the authored tolerance.';
  const source = `{"result":{"results":[{"diagnostics":[{"code":"GEOSPEC_BOUNDING_BOX_MISMATCH","suggestion":${JSON.stringify(old)}}]}]},"number":1.00}`;
  assert.equal(
    projectMaterialRepairSuggestion(id, source),
    source.replace(JSON.stringify(old), JSON.stringify(approved)),
  );
  assert.equal(projectMaterialRepairSuggestion('unrelated', source), source);
  assert.throws(() => projectMaterialRepairSuggestion(id, undefined), /missing bbox/);
  assert.throws(() => projectMaterialRepairSuggestion(id, source.replace(old, 'wrong')), /exact bbox/);
  assert.throws(() => projectMaterialRepairSuggestion(id, source.replace('1.00', JSON.stringify(old))), /exact bbox/);
  assert.throws(
    () => projectMaterialRepairSuggestion(id, source.replace('GEOSPEC_BOUNDING_BOX_MISMATCH', 'OTHER')),
    /exact bbox/,
  );
});

await it('should declare full backend and approved minimum capability while preserving all other frozen expectations', async () => {
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
    const expected =
      /** @type {{ result: { capabilities: Array<{implementation: string, name: string, profile?: string, qualification: string, registryVersion: number, scope: string}>, configuration: { backends: { brep: boolean, csg: boolean } } } }} */ (
        JSON.parse(row.expectedUtf8)
      );
    assert.deepEqual(expected.result.configuration.backends, { brep: true, csg: true });
    assert.deepEqual(expected.result.capabilities.at(-1), {
      implementation: 'implemented',
      name: 'minimumDistance',
      profile: 'geospec-minimum-distance-v1',
      qualification: 'unqualified',
      registryVersion: 5,
      scope: 'declared-subject-profile',
    });
    assert.equal(expected.result.capabilities.filter(({ name }) => name === 'minimumDistance').length, 1);
    expected.result.capabilities.pop();
    expected.result.configuration.backends = { brep: false, csg: false };
    assert.deepEqual(expected, JSON.parse(baseline.expectedUtf8));
    assert.deepEqual({ ...row, expectedUtf8: baseline.expectedUtf8 }, baseline);
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
  await assert.rejects(joinCurrentCorpus(original, profile, 'full-backend', changedSuccessor), /successor SHA-256/);
});
