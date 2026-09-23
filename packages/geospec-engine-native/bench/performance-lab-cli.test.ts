import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  parseCliArguments,
  planLabCells,
  selectLabFixtures,
  toRunCase,
  verifyLabArtifacts,
  loadLegacyWithoutPersistence,
} from '#bench/performance-lab-cli';
import {
  performanceLabCases,
  performanceLabFixtures,
  performanceLabNativeQueries,
  performanceLabScaleCases,
} from '#bench/performance-lab';

void it('plans the shared authored catalog and verifies a pinned ordinary input without loading engines', async () => {
  const options = parseCliArguments([
    '--legacy-module=/installed/legacy.mjs',
    '--mixed-module=/installed/mixed.mjs',
    '--native-module=/installed/native.mjs',
    '--output-dir=out/reports/benchmarks/performance-lab',
  ]);
  assert.equal(options.samples, 5);
  assert.equal(options.includeScale, false);
  assert.deepStrictEqual(
    options.modules.map(({ engine }) => engine),
    ['legacy-wasm', 'combined-wasm', 'native-desktop'],
  );
  assert.equal(options.outputDir, resolve(import.meta.dirname, '../../../out/reports/benchmarks/performance-lab'));
  const ordinary = selectLabFixtures(false);
  const selected = ordinary.flatMap(({ cases }) => cases);
  assert.deepStrictEqual(
    new Set(selected.map(({ id }) => id)),
    new Set([...performanceLabCases, ...performanceLabNativeQueries].map(({ id }) => id)),
  );
  assert.ok(ordinary.every(({ fixture }) => !fixture.scale && fixture.role === 'subject'));
  for (const entry of selected) {
    const input = toRunCase(entry);
    assert.strictEqual(input.payload, entry.claim.payload);
    assert.equal(input.claimId, entry.claim.claimId);
    assert.equal(input.subjectSlot, entry.claim.subjectSlots[0]);
    assert.equal(input.workUnitBudget, entry.claim.workUnitBudget);
    assert.equal(input.expectedStatus, entry.expectedStatus);
    assert.equal(input.polarity, entry.claim.polarity);
    if ('matcher' in entry) {
      assert.strictEqual(input.arguments, entry.arguments);
      assert.equal(input.matcher, entry.matcher);
      assert.equal(input.kind, 'matcher');
    } else {
      assert.deepStrictEqual(input.arguments, []);
      assert.equal(input.matcher, entry.capability);
      assert.equal(input.kind, 'query');
    }
  }
  assert.ok(selected.some((entry) => entry.claim.subjectSlots[0] === 'part'));
  const cells = planLabCells(options);
  assert.deepStrictEqual(planLabCells(options), cells);
  assert.equal(cells.length, ordinary.length * options.modules.length * options.samples);
  assert.equal(
    new Set(cells.map(({ round, module, selection }) => `${round}/${module.engine}/${selection.fixture.id}`)).size,
    cells.length,
  );
  assert.equal(cells[0]?.module.engine, 'legacy-wasm');
  assert.equal(cells[3]?.module.engine, 'combined-wasm');
  assert.equal(cells[ordinary.length * 3]?.selection.fixture.id, ordinary[1]?.fixture.id);
  assert.equal(cells[ordinary.length * 3]?.module.engine, 'native-desktop');
  assert.deepStrictEqual(
    [1, 2, 3, 4, 5].map(
      (round) =>
        cells.find((cell) => cell.round === round && cell.selection.fixture.id === ordinary[0]?.fixture.id)?.module
          .engine,
    ),
    ['legacy-wasm', 'combined-wasm', 'native-desktop', 'legacy-wasm', 'combined-wasm'],
  );
  const scaleOptions = parseCliArguments([
    '--native-module=/installed/native.mjs',
    '--output-dir=out/reports/benchmarks/scale',
    '--samples=2',
    '--include-scale',
  ]);
  assert.equal(scaleOptions.samples, 2);
  assert.deepStrictEqual(
    new Set(
      selectLabFixtures(scaleOptions.includeScale)
        .flatMap(({ cases }) => cases)
        .map(({ id }) => id),
    ),
    new Set([...selected, ...performanceLabScaleCases].map(({ id }) => id)),
  );
  const fixture = performanceLabFixtures.find(({ id }) => id === 'rational-plate');
  assert.ok(fixture);
  const path = resolve(import.meta.dirname, '../../..', fixture.path);
  const artifacts = await verifyLabArtifacts([{ path, sha256: fixture.sha256 }]);
  assert.deepStrictEqual(artifacts, [{ path, sha256: fixture.sha256, bytes: fixture.bytes }]);
});

void it('disables the selected legacy store before importing its entry module', async (context) => {
  const directory = await mkdtemp(resolve(tmpdir(), 'geospec-lab-inert-cache-'));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  await mkdir(resolve(directory, 'cache'));
  await writeFile(
    resolve(directory, 'cache/evidence-cache.mjs'),
    'let store = {}; export const setGeoSpecEvidenceStore = value => { store = value; }; export const getGeoSpecEvidenceStore = () => store;',
  );
  const entry = resolve(directory, 'index.mjs');
  await writeFile(
    entry,
    "import { getGeoSpecEvidenceStore } from './cache/evidence-cache.mjs'; export const geoSpecEngineImplementation = { disabledBeforeImport: getGeoSpecEvidenceStore() === undefined };",
  );
  const loaded = await loadLegacyWithoutPersistence(entry);
  assert.deepStrictEqual(loaded.geoSpecEngineImplementation, { disabledBeforeImport: true });
});
