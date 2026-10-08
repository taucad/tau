// eslint-disable-next-line @nx/enforce-module-boundaries -- Test-only registry inventory checks the static browser catalog against the public matcher list.
import { createGeoSpecMatcherMethods, geoSpecMatcherDescriptors } from 'geospec/assertion-client';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Test-only authoring type checks the private catalog against the public API.
import type { GeoSpecAuthoringInvocation } from 'geospec/assertion-client';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
/* oxlint-disable no-restricted-imports -- Private lab checks read the frozen native catalog and fixture receipts. */
import manifest from '../../../geospec-engine-native/bench/fixtures/performance-lab/manifest.json' with { type: 'json' };
import currentAuthority from '../../../geospec-engine-native/bench/fixtures/performance-lab/current-source-authority-v5.json' with { type: 'json' };
import {
  classifyPerformanceLabDifference,
  performanceLabAnalyticCases,
  performanceLabCases,
  performanceLabFixtures,
  performanceLabNativeQueries,
  performanceLabQualifiedCases,
  performanceLabScaleCases,
  performanceLabScaleQueries,
} from '../../../geospec-engine-native/bench/performance-lab.ts';
/* oxlint-enable no-restricted-imports */
import {
  selectLabProducts,
  toRunCase,
  verifySourceAuthority,
} from '#experiments/performance-lab/performance-lab-cli.js';
import { runPerformanceLabCell } from '#experiments/performance-lab/performance-lab-runner.js';

const root = resolve(import.meta.dirname, '../../../..');

/**
 * Run one scale cell on the installed native engine, as the lab times it.
 * @param fixtureId - Scale fixture to admit.
 * @param cases - Catalog cases evaluated against that one admission.
 * @returns The engine's whole-shape tessellation counters after the cell.
 */
const scaleCellTessellation = async (
  fixtureId: string,
  cases: ReadonlyArray<Parameters<typeof toRunCase>[0]>,
): Promise<{ tessellations: unknown; meshRecords: unknown }> => {
  const fixture = performanceLabFixtures.find(({ id }) => id === fixtureId)!;
  const result = await runPerformanceLabCell(
    {
      engine: 'native-desktop',
      fixture: {
        id: fixture.id,
        format: fixture.format,
        sourceUnit: fixture.sourceUnit,
        bytes: new Uint8Array(await readFile(new URL(fixture.url))),
        sha256: fixture.sha256,
      },
      cases: cases.map((entry) => toRunCase(entry)),
      repeats: 1,
      cache: 'cold',
    },
    { native: async () => selectLabProducts({})(resolve(root, 'packages/geospec-engine-native/src/node.ts')) },
  );
  const { physical } = result.engineObservations as { physical: Record<string, unknown> };
  return { tessellations: physical['tessellations'], meshRecords: physical['meshRecords'] };
};

void describe('performance lab catalog', () => {
  void it('explains only source-bound target outcomes without changing claims', async () => {
    const currentHash = 'ec7d1f97dda08e52f00d418475df2a3a02b4298a49267fd8581b7910a7bbea86';
    const currentBytes = await readFile(resolve(root, 'packages/geospec/host-tests/fixtures/data', currentHash));
    assert.equal(createHash('sha256').update(currentBytes).digest('hex'), currentHash);
    const current = JSON.parse(currentBytes.toString()) as {
      mixedStatusOverrides: Record<string, 'passed' | 'failed'>;
      rows: Array<{
        id: string;
        authoredRequestUtf8: string;
        expected: { status: string };
        sourceRow: { transport: { primaryBuffer: { sha256: string } } };
      }>;
    };
    let mixedCount = 0;
    for (const entry of performanceLabQualifiedCases) {
      const status = entry.expectedStatus === 'passed' ? 'failed' : 'passed';
      const observed = {
        engine: 'combined-wasm',
        caseId: entry.id,
        status,
        expectedStatus: entry.expectedStatus,
      } as const;
      const difference = classifyPerformanceLabDifference(observed);
      const override = current.mixedStatusOverrides[entry.authority.rowId];
      if (override === undefined) {
        assert.equal(difference, undefined, entry.id);
      } else {
        assert.equal(status, override);
        assert.ok(difference);
        assert.equal(difference.kind, 'qualified-target-difference');
        assert.equal(difference.sources[0]?.sha256, currentHash);
        assert.equal(
          difference.sources[0].jsonPointer,
          `/mixedStatusOverrides/${entry.authority.rowId.replaceAll('/', '~1')}`,
        );
        const native = current.rows.find(({ id }) => id === entry.authority.rowId);
        assert.ok(native);
        assert.deepStrictEqual(JSON.parse(native.authoredRequestUtf8).plan.claims[0], entry.claim);
        assert.equal(native.expected.status, entry.expectedStatus);
        assert.equal(native.sourceRow.transport.primaryBuffer.sha256, entry.authority.subjectSha256);
        assert.deepStrictEqual(difference.sources[1], {
          path: `packages/geospec/host-tests/fixtures/data/${currentHash}`,
          sha256: currentHash,
          jsonPointer: `/rows/${current.rows.indexOf(native)}/expected/status`,
        });
        mixedCount += 1;
      }
      assert.equal(classifyPerformanceLabDifference({ ...observed, engine: 'native-desktop' }), undefined);
      assert.equal(classifyPerformanceLabDifference({ ...observed, status: 'unsupported' }), undefined);
      assert.equal(classifyPerformanceLabDifference({ ...observed, expectedStatus: 'unverified' }), undefined);
      assert.equal(classifyPerformanceLabDifference({ ...observed, status: entry.expectedStatus }), undefined);
    }
    assert.equal(mixedCount, 4);
  });

  void it('covers every exported matcher with independently authored ordinary positive and negative claims', async () => {
    const names = Object.keys(geoSpecMatcherDescriptors).sort();
    assert.deepStrictEqual([...new Set(performanceLabQualifiedCases.map((entry) => entry.matcher))].sort(), names);
    assert.equal(performanceLabQualifiedCases.length, names.length * 2);
    const authorityRecord = manifest.claimAuthority;
    const corpusPath = 'packages/geospec/host-tests/fixtures/data/' + authorityRecord.sha256;
    const corpusBytes = await readFile(resolve(root, corpusPath));
    assert.equal(createHash('sha256').update(corpusBytes).digest('hex'), authorityRecord.sha256);
    const corpus = JSON.parse(corpusBytes.toString()) as {
      rows: Array<{
        id: string;
        authoredRequestUtf8: string;
        authoring: { argumentsProtocolJson: unknown[] };
        expected: { status: string };
        sourceRow: { transport: { primaryBuffer: { sha256: string } } };
      }>;
    };
    const byId = new Map(corpus.rows.map((row) => [row.id, row]));
    const fixtures = new Map(performanceLabFixtures.map((entry) => [entry.id, entry]));
    for (const matcher of names) {
      const cases = performanceLabQualifiedCases.filter((entry) => entry.matcher === matcher);
      assert.deepStrictEqual(
        cases.map((entry) => entry.claim.polarity),
        ['positive', 'negative'],
      );
    }
    for (const entry of performanceLabQualifiedCases) {
      const source = byId.get(entry.authority.rowId);
      assert.ok(source, entry.id);
      assert.deepStrictEqual(entry.claim, JSON.parse(source.authoredRequestUtf8).plan.claims[0]);
      assert.deepStrictEqual(entry.arguments, source.authoring.argumentsProtocolJson);
      assert.equal(entry.expectedStatus, source.expected.status);
      assert.equal(entry.authority.subjectSha256, source.sourceRow.transport.primaryBuffer.sha256);
      assert.equal(fixtures.get(entry.fixtureId)?.sha256, entry.authority.subjectSha256);
    }
    assert.equal(
      performanceLabCases.length,
      performanceLabQualifiedCases.length + performanceLabAnalyticCases.length + 2,
    );
    assert.ok(performanceLabCases.every((entry) => fixtures.get(entry.fixtureId)?.scale === false));
    assert.ok(performanceLabScaleCases.every((entry) => fixtures.get(entry.fixtureId)?.scale === true));
  });

  void it('runs one scale claim per capability family beside a tessellating analyzeMesh query', () => {
    const fixtures = new Map(performanceLabFixtures.map((entry) => [entry.id, entry]));
    for (const fixtureId of new Set(performanceLabScaleCases.map((entry) => entry.fixtureId))) {
      assert.deepStrictEqual(
        performanceLabScaleCases.filter((entry) => entry.fixtureId === fixtureId).map(({ matcher }) => matcher),
        fixtures.get(fixtureId)?.format === 'step'
          ? [
              'toBeWatertight',
              'toHaveVolume',
              'toBeValidBrep',
              'toHaveProductStructure',
              'toHaveNoComponentInterference',
              'toHaveMinimumWallThickness',
            ]
          : ['toBeWatertight', 'toHaveVolume'],
        fixtureId,
      );
      assert.deepStrictEqual(
        performanceLabScaleQueries.filter((entry) => entry.fixtureId === fixtureId).map(({ capability }) => capability),
        ['analyzeMesh'],
      );
    }
    assert.equal(new Set(performanceLabScaleCases.map((entry) => entry.fixtureId)).size, 9);
    for (const entry of performanceLabScaleCases) {
      const methods = createGeoSpecMatcherMethods({
        subject: entry.fixtureId,
        polarity: entry.claim.polarity,
        invoke: (invocation) => invocation,
      });
      const method = methods[entry.matcher as keyof typeof methods];
      const authored = Reflect.apply(method, methods, entry.arguments) as GeoSpecAuthoringInvocation;
      assert.deepStrictEqual(entry.claim.payload, { kind: authored.kind, expected: authored.expected });
    }
  });

  void it('runs STEP-scale interference and wall untessellated and meshes once for analyzeMesh', async () => {
    const settling = new Set(['toHaveNoComponentInterference', 'toHaveMinimumWallThickness']);
    const cells = Map.groupBy(
      performanceLabScaleCases.filter(({ matcher }) => settling.has(matcher)),
      ({ fixtureId }) => fixtureId,
    );
    assert.equal(cells.size, 5);
    for (const [fixtureId, cases] of cells) {
      // oxlint-disable-next-line no-await-in-loop -- One native engine per cell, as the lab runs them.
      assert.deepStrictEqual(await scaleCellTessellation(fixtureId, cases), { tessellations: '0', meshRecords: '0' });
    }
    const query = performanceLabScaleQueries.find(({ fixtureId }) => fixtureId === 'many-occurrences-4096-step')!;
    const { meshRecords } = await scaleCellTessellation(query.fixtureId, [query]);
    assert.equal(meshRecords, '1');
  });

  void it('pins accepted ancillary queries including PMI inventory', async () => {
    assert.deepStrictEqual(performanceLabNativeQueries.map((entry) => entry.capability).sort(), [
      'analyzeBrep',
      'analyzeMesh',
      'analyzeMeshOverlap',
      'inspectGeometry',
      'queryPmi',
    ]);
    const bytes = await readFile(
      resolve(root, `packages/geospec/host-tests/fixtures/data/${manifest.claimAuthority.sha256}`),
    );
    const corpus = JSON.parse(bytes.toString()) as {
      rows: Array<{ id: string; authoredRequestUtf8: string; expected: { status: string } }>;
    };
    const rows = new Map(corpus.rows.map((row) => [row.id, row]));
    for (const query of performanceLabNativeQueries) {
      const source = rows.get(query.authority.rowId);
      assert.ok(source);
      assert.deepStrictEqual(query.claim, JSON.parse(source.authoredRequestUtf8).plan.claims[0]);
      assert.equal(query.expectedStatus, source.expected.status);
    }
  });

  void it('binds available ordinary STEP previews and exposes the unconverted shared-bore preview gap', () => {
    for (const fixture of performanceLabFixtures.filter((entry) => entry.format === 'step' && !entry.scale)) {
      if (fixture.id === 'shared-bore-step') {
        assert.equal(fixture.previewGlb, undefined);
        assert.ok(fixture.previewUnavailableReason);
        continue;
      }
      assert.ok(fixture.previewGlb, fixture.id);
      const conversion = manifest.conversions.find((entry) => entry.output === fixture.previewGlb?.path);
      assert.ok(conversion, fixture.id);
      assert.ok(
        conversion.inputClosure.some((input) => input.sha256 === fixture.sha256),
        fixture.id,
      );
      assert.equal(fixture.coordinateSystem, 'z-up');
      assert.equal(fixture.sourceUnit, 'auto');
    }
  });

  void it('preserves M3 bytes and pins analytic construction sources without executing geometry', async () => {
    const manifestBytes = await readFile(
      resolve(root, 'packages/geospec-engine-native/bench/fixtures/performance-lab/manifest.json'),
    );
    assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), currentAuthority.frozenManifestSha256);
    const frozenNative = manifest.analyticAuthority.sources.find(({ id }) => id === 'native-contract');
    assert.ok(frozenNative);
    assert.equal(frozenNative.path, currentAuthority.nativeContract.path);
    assert.equal(frozenNative.sha256, currentAuthority.nativeContract.frozenSha256);
    await verifySourceAuthority();
    const sources = new Map(manifest.analyticAuthority.sources.map((source) => [source.id, source]));
    const fixtures = new Map(performanceLabFixtures.map((entry) => [entry.id, entry]));
    for (const entry of performanceLabAnalyticCases) {
      assert.equal(entry.analyticAuthority.subjectSha256, fixtures.get(entry.fixtureId)?.sha256);
      assert.ok(entry.analyticAuthority.sourceIds.every((id) => sources.has(id)));
      assert.ok(entry.analyticAuthority.sourceIds.includes(entry.analyticAuthority.tolerance.sourceId));
      const methods = createGeoSpecMatcherMethods({
        subject: entry.fixtureId,
        polarity: entry.claim.polarity,
        invoke: (invocation) => invocation,
      });
      const method = methods[entry.matcher as keyof typeof methods];
      assert.equal(typeof method, 'function');
      const authored = Reflect.apply(method, methods, entry.arguments) as GeoSpecAuthoringInvocation;
      assert.deepStrictEqual(entry.claim.payload, { kind: authored.kind, expected: authored.expected });
      assert.equal(authored.matcher, entry.matcher);
    }
  });

  void it('uses source-declared feature dimensions, termination controls and edge mismatch options', async () => {
    const directory = resolve(root, 'packages/geospec-engine-native/bench/fixtures/performance-lab/analytic-authority');
    const [boreBytes, edgeBytes, boreBindings, edgeBindings] = await Promise.all([
      readFile(resolve(directory, 'bores/intent.json'), 'utf8'),
      readFile(resolve(directory, 'edges/intent.json'), 'utf8'),
      readFile(resolve(directory, 'bores/fixture-manifest.json'), 'utf8'),
      readFile(resolve(directory, 'edges/fixture-manifest.json'), 'utf8'),
    ]);
    const bores = JSON.parse(boreBytes) as {
      common: { bore: { radiusMm: number } };
      cases: Array<{ id: string; occurrenceTranslationsMm?: number[][] }>;
    };
    const edges = JSON.parse(edgeBytes) as {
      nominalMatcherOptions: Record<string, { member: unknown; mismatch: unknown }>;
    };
    const bindings = [boreBindings, edgeBindings].flatMap(
      (bytes) => (JSON.parse(bytes) as { fixtures: Array<{ id: string; sha256: string }> }).fixtures,
    );
    const counts = new Map<string, number>();
    for (const entry of performanceLabAnalyticCases) {
      const passing = entry.expectedStatus === 'passed';
      const intent = entry.analyticAuthority.intentCase;
      assert.equal(bindings.find((binding) => binding.id === intent)?.sha256, entry.analyticAuthority.subjectSha256);
      counts.set(entry.matcher, (counts.get(entry.matcher) ?? 0) + 1);
      if (entry.matcher === 'toHaveCircularHole') {
        const through = intent === 'through';
        assert.deepStrictEqual(entry.arguments, [
          { diameter: 2 * bores.common.bore.radiusMm, through: passing ? through : !through, axis: 'z' },
        ]);
      } else if (entry.matcher === 'toHaveCircularHolePattern') {
        const occurrences = bores.cases.find((source) => source.id === intent)?.occurrenceTranslationsMm;
        assert.deepStrictEqual(occurrences, [
          [0, 0, 0],
          [20, 0, 0],
        ]);
        assert.deepStrictEqual(entry.arguments, [
          { count: occurrences.length + (passing ? 0 : 1), holeDiameter: 2 * bores.common.bore.radiusMm, axis: 'z' },
        ]);
      } else {
        const options =
          edges.nominalMatcherOptions[entry.matcher === 'toHaveChamferFeature' ? 'chamfer' : 'filletRadius2'];
        assert.ok(options);
        assert.deepStrictEqual(entry.arguments, [passing ? options.member : options.mismatch]);
      }
    }
    assert.deepStrictEqual(Object.fromEntries(counts), {
      toHaveCircularHole: 4,
      toHaveCircularHolePattern: 2,
      toHaveChamferFeature: 2,
      toHaveFilletFeature: 2,
    });
    assert.equal(performanceLabAnalyticCases.filter((entry) => entry.expectedStatus === 'passed').length, 5);
    assert.equal(performanceLabAnalyticCases.filter((entry) => entry.expectedStatus === 'failed').length, 5);
  });

  void it('pins every available artifact and source to its actual bytes', async () => {
    const paths = new Set(performanceLabFixtures.map((fixture) => fixture.path));
    await Promise.all(
      manifest.fixtures.map(async (fixture) => {
        const bytes = await readFile(resolve(root, fixture.path));
        assert.equal(bytes.byteLength, fixture.bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
        if (fixture.kind === 'artifact') {
          assert.ok(paths.has(fixture.path));
        }
      }),
    );
  });
});
