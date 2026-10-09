import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { it } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  isHostContended,
  parseCliArguments,
  planLabCells,
  selectLabFixtures,
  selectLabProducts,
  toRunCase,
  verifyLabArtifacts,
  verifySourceAuthority,
  summarizeLabCaseResults,
  writeLabChildReport,
  readLabChildReport,
} from '#experiments/performance-lab/performance-lab-cli.js';
/* oxlint-disable no-restricted-imports -- Private lab test reads the frozen native catalog and source receipt. */
import {
  performanceLabCases,
  performanceLabFixtures,
  performanceLabNativeQueries,
  performanceLabScaleCases,
  performanceLabScaleQueries,
} from '../../../geospec-engine-native/bench/performance-lab.ts';
import currentAuthority from '../../../geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v6.json' with { type: 'json' };
import manifest from '../../../geospec-engine-native/bench/fixtures/performance-lab/manifest.json' with { type: 'json' };
/* oxlint-enable no-restricted-imports */

void it('should transport complete evidence without embedding large strings in child receipts or parent rows', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'tau-lab-transport-'));
  const path = resolve(directory, 'result.json');
  const canonical = JSON.stringify({
    results: [{ claimId: 'claim', status: 'passed', diagnostics: [], evidence: 'x'.repeat(65_536) }],
  });
  const report: Parameters<typeof writeLabChildReport>[1] = {
    result: {
      engine: 'native-desktop',
      backend: 'native-desktop',
      profile: 'profile',
      fixtureId: 'fixture',
      cache: 'cold-module-cold-subject',
      buildIdentity: { source: 'immutable' },
      engineObservations: { calls: 1 },
      initializationTiming: 'startup',
      timing: { startup: 1, admission: 2, evaluation: 3, cleanup: 4, total: 10 },
      perCase: [
        {
          caseId: 'case',
          matcher: 'toBeWatertight',
          repeat: 0,
          status: 'passed',
          expectedStatus: 'passed',
          evaluation: 3,
          numericProfile: 'profile',
          diagnostics: [],
          result: JSON.parse(canonical).results[0],
          canonicalClaimUtf8: '{"claimId":"claim"}',
          canonicalResultUtf8: canonical,
          canonicalResultSha256: createHash('sha256').update(canonical).digest('hex'),
        },
      ],
    },
    memory: { method: 'test', scope: 'child', peakBytes: 42, observed: 'after cleanup' },
  };
  try {
    await writeLabChildReport(path, report);
    const receipt = await readLabChildReport(path);
    const receiptBytes = await readFile(path);
    assert.ok(receiptBytes.byteLength < 4096, 'Child receipt must reference rather than duplicate large evidence.');
    assert.ok(JSON.stringify({ ...receipt, host: 'parent' }).length < 4096, 'Parent row must remain compact.');
    const { result } = receipt;
    assert.ok(result);
    const [entry] = result.perCase;
    assert.ok(entry);
    assert.equal(entry.status, 'passed');
    assert.deepEqual(result.timing, report.result?.timing);
    const { evidence } = entry;
    assert.equal(await readFile(evidence.canonicalResult!.path, 'utf8'), canonical);
    assert.equal(evidence.result.path, evidence.canonicalResult!.path);
    assert.equal(evidence.result.pointer, '/results/0');
    assert.equal(evidence.diagnostics.pointer, '/results/0/diagnostics');
    assert.equal(evidence.canonicalResult!.bytes, Buffer.byteLength(canonical));
    await assert.rejects(writeLabChildReport(path, report), { code: 'EEXIST' });
    await writeFile(evidence.canonicalResult!.path, `${canonical} `);
    await assert.rejects(readLabChildReport(path), /Performance evidence artifact changed/);
    await rm(evidence.canonicalResult!.path);
    await assert.rejects(readLabChildReport(path), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void it('should preserve noncanonical decoded evidence and host diagnostics in verified sidecars', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'tau-lab-host-evidence-'));
  const path = resolve(directory, 'result.json');
  const text = `${'x'.repeat(65_535)}😀\n"\\`;
  const report: Parameters<typeof writeLabChildReport>[1] = {
    result: {
      engine: 'native-desktop',
      backend: 'native-desktop',
      profile: 'profile',
      fixtureId: 'fixture',
      cache: 'warm-module-cold-subject',
      buildIdentity: {},
      engineObservations: {},
      initializationTiming: 'startup',
      timing: { startup: 1, admission: 2, evaluation: 3, cleanup: 4, total: 10 },
      perCase: [
        {
          caseId: 'unsupported',
          matcher: 'toBeWatertight',
          repeat: 0,
          status: 'unsupported',
          expectedStatus: 'refused',
          evaluation: 0,
          numericProfile: null,
          diagnostics: [text],
          result: { hostOnly: [text, null, true, 1] },
          canonicalClaimUtf8: null,
          canonicalResultUtf8: null,
          canonicalResultSha256: null,
        },
      ],
    },
    error: { message: 'retained failure', stack: 'original stack' },
    memory: { method: 'test', scope: 'child', peakBytes: 42, observed: 'after cleanup' },
  };
  try {
    await writeLabChildReport(path, report);
    const receipt = await readLabChildReport(path);
    const { result } = receipt;
    assert.ok(result);
    const [entry] = result.perCase;
    assert.ok(entry);
    const { evidence } = entry;
    assert.equal(evidence.canonicalResult, null);
    assert.deepEqual(JSON.parse(await readFile(evidence.result.path, 'utf8')), report.result!.perCase[0]!.result);
    assert.deepEqual(JSON.parse(await readFile(evidence.diagnostics.path, 'utf8')), [text]);
    assert.deepEqual(receipt.error, report.error);
    assert.deepEqual(receipt.memory, report.memory);
    assert.equal(entry.status, 'unsupported');
    const receiptBytes = await readFile(path);
    assert.ok(receiptBytes.byteLength < 4096);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void it('admits only the approved public contract transition without changing frozen expectations', async () => {
  const frozen = JSON.stringify(manifest);
  const overlay = JSON.stringify(currentAuthority);
  await verifySourceAuthority();
  for (const sha256 of [
    '0'.repeat(64),
    '20303ca36a5ae9531cdd035c10e108e92b70aec76bba1aca849306dbe3eed82d',
    '1ff1809df5e0e2142aca7d7117794b9994866311dba185df449edbf0875df974',
  ]) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each rejected observation is independently settled before the next control.
    await assert.rejects(
      verifySourceAuthority(async (path) => ({
        path,
        sha256: path.endsWith('/packages/geospec/src/runner/types.ts')
          ? sha256
          : createHash('sha256')
              .update(await readFile(path))
              .digest('hex'),
      })),
      /Performance-lab source authority changed: packages\/geospec\/src\/runner\/types\.ts/,
    );
  }
  const { sources } = manifest.analyticAuthority;
  const original = structuredClone(sources);
  const index = sources.findIndex(({ id }) => id === 'public-contract');
  assert.notEqual(index, -1);
  const restore = () => sources.splice(0, sources.length, ...structuredClone(original));
  try {
    for (const field of ['id', 'path', 'sha256'] as const) {
      sources[index]![field] = 'changed';
      // oxlint-disable-next-line eslint/no-await-in-loop -- Shared fixture mutations must be restored sequentially.
      await assert.rejects(verifySourceAuthority(), /Performance-lab public-contract transition differs/);
      restore();
    }
    sources.push({ ...sources[index]! });
    await assert.rejects(verifySourceAuthority(), /Performance-lab public-contract transition differs/);
    restore();
    sources.splice(index, 1);
    await assert.rejects(verifySourceAuthority(), /Performance-lab public-contract transition differs/);
  } finally {
    restore();
  }
  assert.equal(JSON.stringify(manifest), frozen);
  assert.equal(JSON.stringify(currentAuthority), overlay);
});

void it('binds the explicit v6 successor without rewriting the immutable v5 status or numeric authority', async () => {
  const path = resolve(
    import.meta.dirname,
    '../../../geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v5.json',
  );
  const bytes = await readFile(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), currentAuthority.predecessorSha256);
  const prior = JSON.parse(bytes.toString('utf8')) as Pick<
    typeof currentAuthority,
    'affectedCaseIds' | 'affectedExpectedStatus' | 'frozenManifestSha256' | 'nativeContract'
  >;
  assert.deepEqual(currentAuthority.affectedCaseIds, prior.affectedCaseIds);
  assert.equal(currentAuthority.affectedExpectedStatus, prior.affectedExpectedStatus);
  assert.equal(currentAuthority.frozenManifestSha256, prior.frozenManifestSha256);
  assert.deepEqual(
    { ...currentAuthority.nativeContract, currentSha256: prior.nativeContract.currentSha256 },
    prior.nativeContract,
  );
  const observe = async (selected: string) => ({
    path: selected,
    sha256: createHash('sha256')
      .update(await readFile(selected))
      .digest('hex'),
  });
  for (const suffix of ['current-source-authority-v6.json', 'current-source-authority-v5.json']) {
    // oxlint-disable-next-line no-await-in-loop -- Independent negative source observations settle before advancing.
    await assert.rejects(
      verifySourceAuthority(async (selected) =>
        selected.endsWith(suffix) ? { path: selected, sha256: '0'.repeat(64) } : observe(selected),
      ),
      /successor authority/,
    );
  }
  const original = structuredClone(currentAuthority);
  try {
    currentAuthority.numericProfileSource.sha256 = '0'.repeat(64);
    await assert.rejects(verifySourceAuthority(), /numeric profile changed/);
    Object.assign(currentAuthority, structuredClone(original));
    currentAuthority.nativeContract.currentSha256 = prior.nativeContract.currentSha256;
    await assert.rejects(verifySourceAuthority(), /overlay does not match/);
  } finally {
    Object.assign(currentAuthority, original);
  }
});

void it('counts known differences separately and preserves unsupported, unverified and unexpected statuses', () => {
  const positiveCases = ['toHaveBoundingBox', 'toHaveCenterOfMass', 'toHaveCircularHole', 'toHaveChamferFeature'].map(
    (matcher) =>
      ({
        caseId: `m3-${matcher}-positive`,
        repeat: 0,
        status: 'passed',
        expectedStatus: 'failed',
      }) as const,
  );
  const original = structuredClone(positiveCases);
  const mixed = summarizeLabCaseResults('combined-wasm', [
    ...positiveCases.slice(0, 2),
    ...['toHaveBoundingBox', 'toHaveCenterOfMass'].map(
      (matcher) =>
        ({
          caseId: `m3-${matcher}-negative`,
          repeat: 0,
          status: 'failed',
          expectedStatus: 'passed',
        }) as const,
    ),
    {
      caseId: 'm3-toHaveCircularHole-positive',
      repeat: 0,
      status: 'failed',
      expectedStatus: 'failed',
    },
    {
      caseId: 'm3-toHaveCircularHole-negative',
      repeat: 0,
      status: 'failed',
      expectedStatus: 'passed',
    },
    {
      caseId: 'm3-toHaveBoundingBox-negative',
      repeat: 1,
      status: 'unsupported',
      expectedStatus: 'passed',
    },
    {
      caseId: 'involute-gear-glb',
      repeat: 0,
      status: 'passed',
      expectedStatus: 'unverified',
    },
  ]);
  assert.deepStrictEqual(mixed.counts, {
    expectedMatches: 1,
    qualifiedTargetDifferences: 4,
    unexpectedStatuses: 1,
    unsupported: 1,
    unverifiedExpectations: 1,
  });
  assert.equal(mixed.knownDifferences.length, 4);
  assert.ok(mixed.knownDifferences.every(({ reason, sources }) => reason.length > 0 && sources.length > 0));
  assert.equal(summarizeLabCaseResults('native-desktop', positiveCases).counts.unexpectedStatuses, 4);
  assert.deepStrictEqual(positiveCases, original);
});

void it('plans the shared authored catalog and verifies a pinned ordinary input without loading engines', async () => {
  await verifySourceAuthority();
  await assert.rejects(
    verifySourceAuthority(async (path) => ({
      path,
      sha256: path.endsWith('/authority-queries.json')
        ? '0'.repeat(64)
        : createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
    })),
    /Performance-lab source authority changed: .*authority-queries\.json/,
  );
  const options = parseCliArguments([
    '--mixed-module=/installed/mixed.mjs',
    '--native-module=/installed/native.mjs',
    '--output-dir=out/reports/benchmarks/performance-lab',
  ]);
  assert.equal(options.samples, 5);
  assert.equal(options.includeScale, false);
  assert.equal(options.condition, 'cold');
  assert.throws(
    () =>
      parseCliArguments([
        '--native-module=/installed/native.mjs',
        '--output-dir=out/reports/benchmarks/short',
        '--samples=4',
      ]),
    /at least five --samples/,
  );
  assert.throws(
    () =>
      parseCliArguments([
        '--mixed-module=/installed/mixed.mjs',
        '--native-module=/installed/native.mjs',
        '--output-dir=out/reports/benchmarks/full',
        '--include-scale',
      ]),
    /requires an explicit installed-product hash manifest/,
  );
  assert.deepStrictEqual(
    options.modules.map(({ engine }) => engine),
    ['combined-wasm', 'native-desktop'],
  );
  assert.equal(options.outputDir, resolve(import.meta.dirname, '../../../../out/reports/benchmarks/performance-lab'));
  const ordinary = selectLabFixtures(false);
  const selected = ordinary.flatMap(({ cases }) => cases);
  const affected = selected.filter(({ id }) => currentAuthority.affectedCaseIds.includes(id));
  assert.deepStrictEqual(affected.map(({ id }) => id).sort(), [...currentAuthority.affectedCaseIds].sort());
  assert.ok(affected.every(({ expectedStatus }) => expectedStatus === 'unverified'));
  assert.ok(
    performanceLabCases
      .filter(({ id }) => currentAuthority.affectedCaseIds.includes(id))
      .every(({ expectedStatus }) => expectedStatus !== 'unverified'),
  );
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
  assert.equal(cells.length, ordinary.length * options.modules.length * options.samples * 2);
  assert.equal(
    new Set(
      cells.map(
        ({ round, condition, module, selection }) => `${round}/${condition}/${module.engine}/${selection.fixture.id}`,
      ),
    ).size,
    cells.length,
  );
  assert.equal(cells[0]?.module.engine, 'combined-wasm');
  assert.deepStrictEqual(
    cells.slice(0, 2).map(({ condition }) => condition),
    ['cold', 'warm'],
  );
  assert.equal(cells[6]?.module.engine, 'combined-wasm');
  assert.equal(cells[ordinary.length * 2 * 2]?.selection.fixture.id, ordinary[1]?.fixture.id);
  assert.equal(cells[ordinary.length * 2 * 2]?.module.engine, 'combined-wasm');
  assert.deepStrictEqual(
    [1, 2, 3, 4, 5].map(
      (round) =>
        cells.find(
          (cell) =>
            cell.round === round && cell.condition === 'cold' && cell.selection.fixture.id === ordinary[0]?.fixture.id,
        )?.module.engine,
    ),
    ['combined-wasm', 'native-desktop', 'combined-wasm', 'native-desktop', 'combined-wasm'],
  );
  const scaleOptions = parseCliArguments([
    '--native-module=/installed/native.mjs',
    '--output-dir=out/reports/benchmarks/scale',
    '--samples=5',
    '--include-scale',
  ]);
  assert.equal(scaleOptions.samples, 5);
  assert.equal(selectLabFixtures(true).length, 22);
  assert.equal(
    new Set(
      selectLabFixtures(true).flatMap(({ cases }) =>
        cases.map((entry) => ('matcher' in entry ? entry.matcher : entry.capability)),
      ),
    ).size,
    31,
  );
  assert.deepStrictEqual(
    new Set(
      selectLabFixtures(scaleOptions.includeScale)
        .flatMap(({ cases }) => cases)
        .map(({ id }) => id),
    ),
    new Set([...selected, ...performanceLabScaleCases, ...performanceLabScaleQueries].map(({ id }) => id)),
  );
  const fixture = performanceLabFixtures.find(({ id }) => id === 'rational-plate');
  assert.ok(fixture);
  const path = resolve(import.meta.dirname, '../../../..', fixture.path);
  const artifacts = await verifyLabArtifacts([{ path, sha256: fixture.sha256 }]);
  assert.deepStrictEqual(artifacts, [{ path, sha256: fixture.sha256, bytes: fixture.bytes }]);
});

void it('should load lane-built add-on, glue and ST binary overrides and disclose a contended host only on opt-in', async (context) => {
  const options = parseCliArguments([
    '--native-module=/installed/native.mjs',
    '--native-addon=/lane/geospec-engine-native.node',
    '--mixed-module=/installed/wasm.mjs',
    '--mixed-binary=/lane/geospec_engine_native.wasm',
    '--mixed-glue=/lane/geospec_engine_native.mjs',
    '--output-dir=out/reports/benchmarks/lane',
    '--contended-host',
  ]);
  assert.equal(options.nativeAddon, '/lane/geospec-engine-native.node');
  assert.equal(options.mixedBinary, '/lane/geospec_engine_native.wasm');
  assert.equal(options.mixedGlue, '/lane/geospec_engine_native.mjs');
  assert.equal(options.contendedHost, true);
  assert.equal(
    parseCliArguments(['--native-module=/installed/native.mjs', '--output-dir=out/reports/benchmarks/x']).contendedHost,
    false,
  );
  for (const args of [
    ['--native-module=/installed/native.mjs', '--native-addon=lane.node'],
    ['--native-module=/installed/native.mjs', '--mixed-binary=/lane/geospec_engine_native.wasm'],
  ]) {
    assert.throws(() => parseCliArguments([...args, '--output-dir=out/reports/benchmarks/x']), /absolute product file/);
  }
  const guards = { maxLoadPerCpu: 1, minFreeMemoryMiB: 1024 };
  assert.equal(isHostContended({ loadAverage: 6, loadPerCpu: 0.5, freeMemoryMiB: 4096 }, guards), false);
  assert.equal(isHostContended({ loadAverage: 24, loadPerCpu: 2, freeMemoryMiB: 4096 }, guards), true);
  assert.equal(isHostContended({ loadAverage: 6, loadPerCpu: 0.5, freeMemoryMiB: 100 }, guards), true);

  const directory = await mkdtemp(resolve(tmpdir(), 'geospec-lab-products-'));
  const previousAddon = process.env['NAPI_RS_NATIVE_LIBRARY_PATH'];
  context.after(async () => {
    if (previousAddon === undefined) {
      delete process.env['NAPI_RS_NATIVE_LIBRARY_PATH'];
    } else {
      process.env['NAPI_RS_NATIVE_LIBRARY_PATH'] = previousAddon;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const glue = resolve(directory, 'lane-glue.mjs');
  await writeFile(glue, "export default 'lane glue';");
  const binary = resolve(directory, 'lane.wasm');
  await writeFile(binary, new Uint8Array([0, 97, 115, 109, 7]));
  const entry = resolve(directory, 'entry.mjs');
  await writeFile(
    entry,
    "export const calls = []; export const initialize = async (bytes, execution) => { calls.push([Array.from(bytes), execution, (await import('#mixed-wasm-binding')).default]); };",
  );
  const load = selectLabProducts({
    nativeAddon: '/lane/geospec-engine-native.node',
    mixedGlue: glue,
    mixedBinary: binary,
  });
  assert.equal(process.env['NAPI_RS_NATIVE_LIBRARY_PATH'], '/lane/geospec-engine-native.node');
  const first = (await load(entry)) as unknown as { calls: unknown[] };
  await load(entry);
  assert.deepStrictEqual(first.calls, [[[0, 97, 115, 109, 7], { variant: 'st' }, 'lane glue']]);
});
