import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
// oxlint-disable-next-line no-restricted-imports -- Pure host check consumes the adjacent nonpublished fixture join.
import { joinCurrentCorpus, selectCorpusRecords } from '../../conformance/current-profile.mjs';

const original = await readFile(new URL('../../conformance/early-corpus.json', import.meta.url));
const profile = await readFile(
  new URL('../../rust/tests/fixtures/current-profile-01/plan-corpus.json', import.meta.url),
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
