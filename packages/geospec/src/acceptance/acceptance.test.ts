// @vitest-environment node
/**
 * GeoSpec fixture acceptance harness (SB5-R6).
 *
 * Walks every committed fixture manifest under `packages/geospec/fixtures/`,
 * loads the STEP artifact through the SB1 verification kernel, builds the SB3
 * selector index, and asserts the manifest's selector expectations (statuses,
 * entity counts, subject-frame facts, diagnostic mentions) with a
 * double-resolve determinism check on every selector (master acceptance
 * case 1). Relationship expectations run through the SB4 proof surface
 * (`#proofs/index.js`), feature-detected at runtime: when the surface is
 * absent the relationship assertions skip with an explicit SB4 reason rather
 * than hard-failing — the manifests remain the red/green contract either way.
 *
 * This suite is also the conformance suite for the GeoSpec AP242 profile:
 * the hand-authored second-producer fixture (non-identity occurrence
 * transform and native datum placement) proves reader/index
 * kernel-agnosticism without writer-side stamp metadata.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMesh } from '#mesh/load-mesh.js';
import type { GeometrySubject } from '#mesh/types.js';
import { buildSelectorIndex, deserializeSelector, resolve, resolveTolerances } from '#selector/index.js';
import type {
  GeometryFacts,
  GeometrySelection,
  GeometrySelector,
  SelectorFaceFacts,
  SelectorFaceFactsTable,
  SelectorIndex,
} from '#selector/index.js';
import { loadStep } from '#step/index.js';
import type { GeoSpecNativeStepBackend, GeoSpecNativeXdeReadResult, XdeReadResult } from '#step/types.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';
import { parseFixtureManifest } from '#acceptance/manifest-types.js';
import type {
  FixtureManifest,
  FixtureRelationshipExpectation,
  FixtureSelectorExpectation,
} from '#acceptance/manifest-types.js';

const fixturesRoot = join(import.meta.dirname, '../../fixtures');
const families = ['contact', 'clearance', 'mate', 'containment', 'selector'] as const;
const corpusBudgetBytes = 5 * 1024 * 1024;

type FixtureEntry = { manifest: FixtureManifest; directory: string };

const discoverFixtures = (): FixtureEntry[] =>
  families
    .flatMap((family) =>
      readdirSync(join(fixturesRoot, family), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const directory = join(fixturesRoot, family, entry.name);
          const manifestPath = join(directory, 'manifest.json');
          const manifest = parseFixtureManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), manifestPath);
          return { manifest, directory };
        }),
    )
    .sort((a, b) => a.manifest.fixture.localeCompare(b.manifest.fixture));

const fixtures = discoverFixtures();

// SB4 feature detection (concurrent stream): resolved at collection time so
// relationship assertions skip with an explicit reason when the proof surface
// is absent, instead of failing the whole suite.
// oxlint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof import() keeps the runtime dependency dynamic (feature-detected); only the type is referenced statically.
type ProofsModule = typeof import('#proofs/index.js');
const proofsModule: ProofsModule | undefined = await import(/* @vite-ignore */ '#proofs/index.js').catch(
  () => undefined,
);
const sb4Suffix = proofsModule ? '' : ' [skipped: SB4 proof surface (#proofs) absent at runtime]';

type LoadedFixture = {
  index: SelectorIndex;
  native: GeoSpecNativeXdeReadResult;
  occurrenceIndexByPath: Map<string, number>;
};

let backend: GeoSpecNativeStepBackend;
const natives: GeoSpecNativeXdeReadResult[] = [];
const loadedByFixture = new Map<string, LoadedFixture>();

/** Module-scope accessor so loop-scoped test callbacks avoid closing over the mutable binding. */
const nativeBackend = (): GeoSpecNativeStepBackend => backend;

const loadFixture = (entry: FixtureEntry): LoadedFixture => {
  const cached = loadedByFixture.get(entry.manifest.fixture);
  if (cached) {
    return cached;
  }
  const reader = backend.GeoSpecXdeReader;
  if (!reader) {
    throw new Error('GeoSpecXdeReader is missing from the native backend.');
  }
  const text = readFileSync(join(entry.directory, 'model.step'), 'utf8');
  const native = reader.readText(text, '{}');
  natives.push(native);
  if (!native.isSuccess()) {
    throw new Error(`${entry.manifest.fixture}: ${native.resultJson()}`);
  }
  const xde = JSON.parse(native.resultJson()) as XdeReadResult;
  const faceFactsByOccurrence: SelectorFaceFactsTable = {};
  const occurrenceIndexByPath = new Map<string, number>();
  for (const [position, occurrence] of xde.occurrences.entries()) {
    occurrenceIndexByPath.set(occurrence.path, position);
    faceFactsByOccurrence[occurrence.path] = JSON.parse(native.faceFacts(position)) as {
      faces: SelectorFaceFacts[];
    };
  }
  const loaded: LoadedFixture = {
    index: buildSelectorIndex({ xde, faceFactsByOccurrence }),
    native,
    occurrenceIndexByPath,
  };
  loadedByFixture.set(entry.manifest.fixture, loaded);
  return loaded;
};

const toSelector = (value: FixtureSelectorExpectation['selector']): GeometrySelector =>
  typeof value === 'string' ? value : deserializeSelector(value);

const proofContext = (
  loaded: LoadedFixture,
): NonNullable<Parameters<ProofsModule['proveRelationship']>[0]>['context'] => ({
  native: loaded.native,
  index: loaded.index,
  occurrenceIndexByPath: loaded.occurrenceIndexByPath,
  tolerances: resolveTolerances(),
});

const expectFactsMatch = (options: {
  facts: GeometryFacts;
  expected: NonNullable<FixtureSelectorExpectation['facts']>;
  tolerance: number;
  label: string;
}): void => {
  const actualRecord = options.facts as Record<string, unknown>;
  for (const [key, expected] of Object.entries(options.expected)) {
    const actual = actualRecord[key];
    if (typeof expected === 'string') {
      expect(actual, `${options.label} facts.${key}`).toBe(expected);
      continue;
    }
    const expectedComponents = typeof expected === 'number' ? [expected] : expected;
    const actualComponents = typeof actual === 'number' ? [actual] : actual;
    expect(Array.isArray(actualComponents), `${options.label} facts.${key} is missing`).toBe(true);
    expect(actualComponents, `${options.label} facts.${key}`).toHaveLength(expectedComponents.length);
    for (const [component, expectedValue] of expectedComponents.entries()) {
      const actualValue = (actualComponents as number[])[component] ?? Number.NaN;
      expect(
        Math.abs(actualValue - expectedValue),
        `${options.label} facts.${key}[${component}]: expected ${expectedValue}, got ${actualValue}`,
      ).toBeLessThanOrEqual(options.tolerance);
    }
  }
};

const assertSelectorExpectation = (
  loaded: LoadedFixture,
  expectation: FixtureSelectorExpectation,
): GeometrySelection => {
  const selector = toSelector(expectation.selector);
  const selection = resolve(selector, loaded.index);
  // Master acceptance case 1: identical artifact + identical selector →
  // deeply equal resolution, on every declared selector.
  expect(resolve(selector, loaded.index), 'double-resolve determinism (master case 1)').toEqual(selection);
  const label = typeof expectation.selector === 'string' ? expectation.selector : JSON.stringify(expectation.selector);
  expect(selection.status, `${label} status`).toBe(expectation.status);
  if (expectation.entityCount !== undefined) {
    expect(selection.entities, `${label} entity count`).toHaveLength(expectation.entityCount);
  }
  if (expectation.facts) {
    const first = selection.entities[0];
    expect(first, `${label} resolved no entities to check facts on`).toBeDefined();
    expectFactsMatch({
      facts: first?.facts ?? {},
      expected: expectation.facts,
      tolerance: expectation.factsTolerance ?? 1e-6,
      label,
    });
  }
  if (expectation.mentions) {
    const payload = JSON.stringify(selection);
    for (const mention of expectation.mentions) {
      expect(payload, `${label} resolution must mention '${mention}'`).toContain(mention);
    }
  }
  return selection;
};

const measuredTolerance = (expected: number): number => Math.max(0.005, Math.abs(expected) * 0.005);

const occurrenceBounds = (loaded: LoadedFixture, path: string): { min: readonly number[]; max: readonly number[] } => {
  const body = loaded.index.bodies.find((row) => row.occurrencePath === path);
  expect(body?.bounds, `occurrence '${path}' must carry AABB bounds`).toBeDefined();
  return body!.bounds!;
};

const assertRelationshipExpectation = (loaded: LoadedFixture, row: FixtureRelationshipExpectation): void => {
  if (!proofsModule) {
    throw new Error('unreachable: relationship assertions are skipped without the SB4 surface');
  }
  const subject = resolve(toSelector(row.subject), loaded.index);
  const target = resolve(toSelector(row.target), loaded.index);
  const subjectName = typeof row.subject === 'string' ? row.subject : JSON.stringify(row.subject);
  const targetName = typeof row.target === 'string' ? row.target : JSON.stringify(row.target);
  expect(subject.status, `relationship subject '${subjectName}'`).toBe('resolved');
  expect(target.status, `relationship target '${targetName}'`).toBe('resolved');
  const expectation: GeoSpecSpatialRelationshipExpectation = {
    ...(row.options as Partial<GeoSpecSpatialRelationshipExpectation>),
    kind: row.kind as GeoSpecSpatialRelationshipExpectation['kind'],
    subject: subjectName,
    target: targetName,
  };
  const evidence = proofsModule.proveRelationship({ subject, target, expectation, context: proofContext(loaded) });
  const label = `${row.kind} ${subjectName} → ${targetName}`;
  expect(evidence.verdict, `${label} verdict`).toBe(row.expected.verdict);
  if (row.expected.broadPhase) {
    // Master acceptance case 6: broad-phase candidacy is recorded separately
    // from the final proof — the adversarial fixtures assert both.
    expect(evidence.broadPhase?.candidate, `${label} broadPhase.candidate`).toBe(row.expected.broadPhase.candidate);
  }
  if (row.expected.final?.method !== undefined) {
    expect(evidence.final?.method, `${label} final.method`).toBe(row.expected.final.method);
  }
  for (const [key, expected] of Object.entries(row.expected.final?.measured ?? {})) {
    const measured = evidence.final?.measured[key];
    expect(measured, `${label} final.measured.${key}`).toBeDefined();
    expect(
      Math.abs((measured ?? Number.NaN) - expected),
      `${label} final.measured.${key}: expected ${expected}, got ${measured}`,
    ).toBeLessThanOrEqual(measuredTolerance(expected));
  }
  if (row.expected.verdict === 'fail') {
    expect(evidence.diagnostics.length, `${label} must carry failure diagnostics`).toBeGreaterThan(0);
  }
  if (row.expected.mentions) {
    const payload = JSON.stringify(evidence.diagnostics);
    for (const mention of row.expected.mentions) {
      expect(payload, `${label} diagnostics must mention '${mention}'`).toContain(mention);
    }
  }
};

describe('GeoSpec fixture acceptance harness', () => {
  beforeAll(async () => {
    const module_ = (await import('geospec/native/opencascade/single')) as unknown as {
      default: () => Promise<GeoSpecNativeStepBackend>;
    };
    backend = await module_.default();
  }, 180_000);

  afterAll(() => {
    for (const native of natives) {
      native.delete?.();
    }
  });

  it('should keep the committed corpus under the 5 MiB budget', () => {
    const totalBytes = fixtures.reduce((total, entry) => total + statSync(join(entry.directory, 'model.step')).size, 0);
    expect(fixtures.length).toBeGreaterThanOrEqual(36);
    expect(totalBytes).toBeLessThanOrEqual(corpusBudgetBytes);
  });

  for (const entry of fixtures) {
    const { manifest } = entry;
    describe(manifest.fixture, () => {
      for (const expectation of manifest.selectors) {
        const label =
          typeof expectation.selector === 'string' ? expectation.selector : JSON.stringify(expectation.selector);
        it(`should resolve ${label} as '${expectation.status}' deterministically`, () => {
          assertSelectorExpectation(loadFixture(entry), expectation);
        });
      }
      if (manifest.adversarialAabb) {
        const { subject, target } = manifest.adversarialAabb;
        it(`should overlap whole-part AABBs of '${subject}' and '${target}' (adversarial premise, master case 6)`, () => {
          // Audit rule 3: the fixture's part-level AABBs must be exactly what
          // a naive AABB matcher would accept — the exact proof must still fail.
          const loaded = loadFixture(entry);
          const subjectBounds = occurrenceBounds(loaded, subject);
          const targetBounds = occurrenceBounds(loaded, target);
          for (const axis of [0, 1, 2]) {
            expect(
              (subjectBounds.min[axis] ?? 0) <= (targetBounds.max[axis] ?? 0) + 0.02 &&
                (targetBounds.min[axis] ?? 0) <= (subjectBounds.max[axis] ?? 0) + 0.02,
              `part AABBs must overlap on axis ${axis}`,
            ).toBe(true);
          }
        });
      }
      for (const row of manifest.relationships ?? []) {
        const subjectLabel = typeof row.subject === 'string' ? row.subject : JSON.stringify(row.subject);
        const targetLabel = typeof row.target === 'string' ? row.target : JSON.stringify(row.target);
        const pendingSuffix = row.pending === undefined ? sb4Suffix : ` [pending: ${row.pending}]`;
        it.skipIf(!proofsModule || row.pending !== undefined)(
          `should prove ${row.kind} '${subjectLabel}' → '${targetLabel}' as '${row.expected.verdict}'${pendingSuffix}`,
          () => {
            assertRelationshipExpectation(loadFixture(entry), row);
          },
        );
      }
      if (manifest.budgets) {
        const budget = manifest.budgets.loadAndResolve;
        it(
          `should load and resolve every declared selector within the ${budget} ms canary budget`,
          { timeout: budget + 120_000 },
          async () => {
            // Full public load path (loadStep → StepEvidence.xde + nativeXde
            // face facts → index → resolution), timed end to end. SB4's broad
            // phase is accountable to this budget per the sub-blueprint.
            const start = performance.now();
            const subject: GeometrySubject = await loadStep({
              source: join(entry.directory, 'model.step'),
              name: `${manifest.fixture}.step`,
              nativeStepBackend: nativeBackend(),
            });
            try {
              const xde = subject.step?.xde;
              const native = subject.nativeXde;
              expect(xde, 'canary subject must carry StepEvidence.xde').toBeDefined();
              expect(native, 'canary subject must retain the native XDE handle').toBeDefined();
              const faceFactsByOccurrence: SelectorFaceFactsTable = {};
              for (const [position, occurrence] of (xde?.occurrences ?? []).entries()) {
                faceFactsByOccurrence[occurrence.path] = JSON.parse(native?.faceFacts(position) ?? '{"faces":[]}') as {
                  faces: SelectorFaceFacts[];
                };
              }
              const index = buildSelectorIndex({ xde: xde!, faceFactsByOccurrence });
              for (const expectation of manifest.selectors) {
                expect(resolve(toSelector(expectation.selector), index).status).toBe(expectation.status);
              }
              const elapsed = performance.now() - start;
              expect(elapsed, `load+index+resolve took ${elapsed.toFixed(0)} ms`).toBeLessThanOrEqual(budget);
            } finally {
              subject.nativeXde?.delete?.();
            }
          },
        );
      }
    });
  }

  describe('matcher preconditions (master cases 5 and 8)', () => {
    it.skipIf(!proofsModule)(
      `should yield no proof context for a mesh-only subject — the D5 matcher precondition input (master case 5)${sb4Suffix}`,
      async () => {
        // The matcher-level single-diagnostic behavior is asserted at the
        // collector surface in runner/production-matchers.test.ts (SB4);
        // this asserts the precondition input through the proofs surface.
        const meshResult = await loadMesh({
          source: {
            format: 'mesh-buffer',
            name: 'mesh-only',
            positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 1, 2],
          },
        });
        if (!meshResult.success) {
          throw new Error('mesh-only subject failed to load');
        }
        expect(proofsModule?.getSubjectProofContext(meshResult.subject)).toBeUndefined();
      },
    );

    it.skipIf(!proofsModule)(
      `should reject an explicit fixture selector in a production relationship (master case 8)${sb4Suffix}`,
      () => {
        const entry = fixtures.find((candidate) => candidate.manifest.fixture === 'contact.flange-face-positive');
        expect(entry).toBeDefined();
        const loaded = loadFixture(entry!);
        const explicitSelection: GeometrySelection = {
          selector: { kind: 'axis', query: { axis: { direction: [0, 0, 1] } } },
          status: 'resolved',
          entities: [
            { id: 'explicit:axis', entityType: 'axis', facts: { axisOrigin: [0, 0, 0], axisDirection: [0, 0, 1] } },
          ],
          expected: 'one',
          source: 'explicit',
          stability: 'explicit',
          diagnostics: [],
        };
        const target = resolve('head.port.mount', loaded.index);
        const evidence = proofsModule?.proveRelationship({
          subject: explicitSelection,
          target,
          expectation: { kind: 'contact', subject: 'explicit:axis', target: 'head.port.mount', tolerance: 0.02 },
          context: proofContext(loaded),
        });
        expect(evidence?.verdict).toBe('unsupported');
        expect(JSON.stringify(evidence?.diagnostics)).toContain('evidence policy rejects');
      },
    );
  });

  describe('manifest schema validation', () => {
    const valid = {
      family: 'contact',
      fixture: 'contact.example',
      generator: { script: 'scripts/contact/example/main.ts' },
      selectors: [{ selector: 'a.b', status: 'resolved' }],
    };

    it('should accept a structurally valid manifest', () => {
      expect(parseFixtureManifest(valid, 'valid.json').fixture).toBe('contact.example');
    });

    it('should reject non-object manifests', () => {
      expect(() => parseFixtureManifest(null, 'bad.json')).toThrow('not an object');
      expect(() => parseFixtureManifest([valid], 'bad.json')).toThrow('not an object');
    });

    it('should reject unknown families', () => {
      expect(() => parseFixtureManifest({ ...valid, family: 'bogus' }, 'bad.json')).toThrow("unknown family 'bogus'");
    });

    it('should reject fixture ids not prefixed with their family', () => {
      expect(() => parseFixtureManifest({ ...valid, fixture: 42 }, 'bad.json')).toThrow('prefixed');
      expect(() => parseFixtureManifest({ ...valid, fixture: 'clearance.example' }, 'bad.json')).toThrow('prefixed');
    });

    it('should reject generators without a script path', () => {
      expect(() => parseFixtureManifest({ ...valid, generator: 'nope' }, 'bad.json')).toThrow('generator.script');
      expect(() => parseFixtureManifest({ ...valid, generator: { script: 5 } }, 'bad.json')).toThrow(
        'generator.script',
      );
    });

    it('should reject empty or malformed selector lists', () => {
      expect(() => parseFixtureManifest({ ...valid, selectors: 'nope' }, 'bad.json')).toThrow('non-empty array');
      expect(() => parseFixtureManifest({ ...valid, selectors: [] }, 'bad.json')).toThrow('non-empty array');
      expect(() => parseFixtureManifest({ ...valid, selectors: [{}] }, 'bad.json')).toThrow('selectors[0]');
      expect(() => parseFixtureManifest({ ...valid, selectors: ['x'] }, 'bad.json')).toThrow('selectors[0]');
    });

    it('should reject non-array relationships', () => {
      expect(() => parseFixtureManifest({ ...valid, relationships: 'nope' }, 'bad.json')).toThrow(
        'relationships must be an array',
      );
      expect(parseFixtureManifest({ ...valid, relationships: [] }, 'ok.json').relationships).toEqual([]);
    });
  });
});
