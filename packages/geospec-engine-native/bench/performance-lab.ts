// oxlint-disable-next-line no-restricted-imports -- Static JSON stays private to the benchmark catalog.
import manifest from './fixtures/performance-lab/manifest.json' with { type: 'json' };
// oxlint-disable-next-line no-restricted-imports -- Static JSON stays private to the benchmark catalog.
import authorityCases from './fixtures/performance-lab/authority-cases.json' with { type: 'json' };
// oxlint-disable-next-line no-restricted-imports -- Static JSON stays private to the benchmark catalog.
import authorityQueries from './fixtures/performance-lab/authority-queries.json' with { type: 'json' };
// oxlint-disable-next-line no-restricted-imports -- Static analytic cases stay private to the benchmark catalog.
import analyticCases from './fixtures/performance-lab/analytic-cases.json' with { type: 'json' };

/** Browser-safe, internal fixture and claim catalog shared by the lab and its driver. */
export type LabFixture = {
  id: string;
  label: string;
  format: 'step' | 'glb' | 'rational-plate';
  url: string;
  path: string;
  sha256: string;
  bytes: number;
  previewGlb?: { url: string; path: string; sha256: string; bytes: number };
  previewUnavailableReason?: string;
  scale: boolean;
  role: 'subject' | 'preview';
  coordinateSystem: 'z-up' | 'y-up';
  sourceUnit: 'auto' | 'mm';
  outputUnit: 'mm';
  source: { kind: string; path: string; sha256: string };
};

/** Independent corpus row and exact subject provenance. */
export type PerformanceLabAuthority = {
  corpus: string;
  corpusSha256: string;
  rowId: string;
  jsonPointer: string;
  inputSha256: string;
  subjectSha256: string;
  derivation: string;
};

/** Independent fixture construction and the current matcher contract supporting an analytic case. */
export type PerformanceLabAnalyticAuthority = {
  subjectSha256: string;
  sourceIds: readonly string[];
  intentCase: string;
  nominalParameters: Readonly<Record<string, unknown>>;
  tolerance: { valueMm: number; sourceId: string; locator: string; authored: string };
  derivation: string;
};

/** Exact authored arguments and claim from an independently accepted M3 row. */
export type PerformanceLabCase = {
  id: string;
  fixtureId: string;
  matcher: string;
  arguments: readonly unknown[];
  claim: {
    claimId: string;
    capability: string;
    payload: unknown;
    polarity: 'positive' | 'negative';
    subjectSlots: readonly string[];
    workUnitBudget: number;
  };
  expectedStatus: 'passed' | 'failed' | 'unverified';
  baseline: 'supported' | 'unsupported' | 'unverified';
  authority?: PerformanceLabAuthority;
  analyticAuthority?: PerformanceLabAnalyticAuthority;
  note?: string;
};

/** A case with required accepted authority. */
export type PerformanceLabQualifiedCase = PerformanceLabCase & { authority: PerformanceLabAuthority };

/** A nominal analytic case whose expected status follows retained construction authority. */
export type PerformanceLabAnalyticCase = PerformanceLabCase & {
  analyticAuthority: PerformanceLabAnalyticAuthority;
  expectedStatus: 'passed' | 'failed';
};

/** Accepted native ancillary query timed outside matcher authoring. */
export type PerformanceLabQuery = {
  id: string;
  fixtureId: string;
  capability: string;
  claim: {
    claimId: string;
    capability: string;
    payload: unknown;
    polarity: 'positive';
    subjectSlots: readonly string[];
    workUnitBudget: number;
  };
  expectedStatus: 'passed';
  baseline: 'supported' | 'unsupported';
  authority: { corpusSha256: string; rowId: string; jsonPointer: string; subjectSha256: string };
};

/** Manifest records resolve artifact bytes without Node APIs. */
const recorded = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
/** Explicit GLB matcher subjects, as distinct from viewer previews. */
const cadGlbSubjects = new Set([
  'involute-gear-glb',
  'helical-gear-glb',
  'flanged-housing-glb',
  'elegant-vase-glb',
  'planetary-cad-glb',
  'large-mesh-48-glb',
]);
const preview = (id: string, url: string): NonNullable<LabFixture['previewGlb']> => {
  const entry = recorded.get(id);
  if (entry?.kind !== 'artifact' || entry.format !== 'glb') {
    throw new Error(`Missing GLB preview ${id} in the performance-lab manifest.`);
  }
  return { url, path: entry.path, sha256: entry.sha256, bytes: entry.bytes };
};
// oxlint-disable-next-line max-params -- Four static descriptor fields keep fixture declarations readable.
const fixture = (id: string, label: string, url: string, previewGlb?: LabFixture['previewGlb']): LabFixture => {
  const entry = recorded.get(id);
  if (entry?.kind !== 'artifact' || !['step', 'glb', 'rational-plate'].includes(entry.format)) {
    throw new Error(`Missing artifact ${id} in the performance-lab manifest.`);
  }
  return {
    id,
    label,
    format: entry.format as LabFixture['format'],
    url,
    path: entry.path,
    sha256: entry.sha256,
    bytes: entry.bytes,
    ...(previewGlb ? { previewGlb } : {}),
    ...(entry.previewGap ? { previewUnavailableReason: entry.previewGap } : {}),
    scale: entry.tier === 'scale',
    role: entry.format === 'glb' && !cadGlbSubjects.has(id) ? 'preview' : 'subject',
    coordinateSystem: entry.format === 'glb' && !cadGlbSubjects.has(id) ? 'y-up' : 'z-up',
    sourceUnit: entry.format === 'step' ? 'auto' : 'mm',
    outputUnit: 'mm',
    source: entry.source,
  };
};

export const performanceLabFixtures: readonly LabFixture[] = [
  fixture(
    'box-step',
    'Analytic AP242 box',
    new URL('../native/occt/rust/tests/fixtures/ap242-box.step', import.meta.url).href,
    preview('box-preview', new URL('fixtures/performance-lab/generated/box.glb', import.meta.url).href),
  ),
  fixture(
    'assembly-step',
    'Two placed cubes',
    new URL('../native/occt/rust/tests/fixtures/two-cube-assembly.step', import.meta.url).href,
    preview('assembly-preview', new URL('fixtures/performance-lab/generated/assembly.glb', import.meta.url).href),
  ),
  fixture(
    'inch-cube-step',
    'Inch unit cube',
    new URL('../native/occt/rust/tests/fixtures/inch-cube.step', import.meta.url).href,
    preview('inch-cube-preview', new URL('fixtures/performance-lab/generated/inch-cube.glb', import.meta.url).href),
  ),
  fixture(
    'cylinder-step',
    'Analytic cylinder',
    new URL('../native/occt/rust/tests/fixtures/ap242-radius1-height10.step', import.meta.url).href,
    preview('cylinder-preview', new URL('fixtures/performance-lab/generated/cylinder.glb', import.meta.url).href),
  ),
  fixture(
    'pmi-step',
    'Parallel plane PMI',
    new URL('../native/occt/rust/tests/fixtures/parallel-plane-distance-source.step', import.meta.url).href,
    preview('pmi-preview', new URL('fixtures/performance-lab/generated/pmi.glb', import.meta.url).href),
  ),
  fixture(
    'nist-pmi-step',
    'NIST AP242 PMI',
    new URL('../native/occt/rust/tests/fixtures/nist-pmi-bspline.step', import.meta.url).href,
    preview('nist-pmi-preview', new URL('fixtures/performance-lab/generated/nist-pmi.glb', import.meta.url).href),
  ),
  fixture(
    'through-bore-step',
    'Through bore',
    new URL('../native/occt/rust/tests/fixtures/circular-bores/01-through.step', import.meta.url).href,
    preview(
      'through-bore-preview',
      new URL('fixtures/performance-lab/generated/through-bore.glb', import.meta.url).href,
    ),
  ),
  fixture(
    'blind-bore-step',
    'Blind bore',
    new URL('../native/occt/rust/tests/fixtures/circular-bores/02-blind.step', import.meta.url).href,
    preview('blind-bore-preview', new URL('fixtures/performance-lab/generated/blind-bore.glb', import.meta.url).href),
  ),
  fixture(
    'shared-bore-step',
    'Two identical through-bore occurrences',
    new URL('../native/occt/rust/tests/fixtures/circular-bores/07-shared-instance.step', import.meta.url).href,
  ),
  fixture(
    'chamfer-step',
    'Planar chamfer',
    new URL('../native/occt/rust/tests/fixtures/edge-treatments/01-planar-chamfer.step', import.meta.url).href,
    preview('chamfer-preview', new URL('fixtures/performance-lab/generated/chamfer.glb', import.meta.url).href),
  ),
  fixture(
    'fillet-step',
    'Cylindrical fillet',
    new URL('../native/occt/rust/tests/fixtures/edge-treatments/02-cylindrical-fillet.step', import.meta.url).href,
    preview('fillet-preview', new URL('fixtures/performance-lab/generated/fillet.glb', import.meta.url).href),
  ),
  fixture(
    'bore-guide-step',
    'Nominal guide bore',
    new URL('../native/occt/rust/tests/fixtures/nominal-bore-void/guide.step', import.meta.url).href,
    preview('bore-guide-preview', new URL('fixtures/performance-lab/generated/bore-guide.glb', import.meta.url).href),
  ),
  fixture(
    'rational-plate',
    'Exact two-window plate',
    new URL('fixtures/performance-lab/rational-plate.json', import.meta.url).href,
  ),
  fixture(
    'm3-control-step',
    'M3 component-interference control',
    new URL('../native/occt/rust/tests/fixtures/component-interference/original.step', import.meta.url).href,
    preview('m3-control-preview', new URL('fixtures/performance-lab/generated/m3-control.glb', import.meta.url).href),
  ),
  fixture(
    'm3-clearance-step',
    'M3 bolt clearance control',
    new URL('../../geospec-engine/fixtures/clearance/bolt-clearance-hole-positive/model.step', import.meta.url).href,
    preview(
      'm3-clearance-preview',
      new URL('fixtures/performance-lab/generated/m3-clearance.glb', import.meta.url).href,
    ),
  ),
  fixture(
    'm3-pmi-step',
    'M3 two-occurrence PMI control',
    new URL('fixtures/performance-lab/m3-pmi.step', import.meta.url).href,
    preview('pmi-preview', new URL('fixtures/performance-lab/generated/pmi.glb', import.meta.url).href),
  ),
  fixture(
    'many-occurrences-4096-step',
    'Scale: 4096-occurrence AP242 assembly',
    new URL('fixtures/performance-lab/generated/many-occurrences-4096.step', import.meta.url).href,
  ),
  fixture(
    'large-mesh-48-glb',
    'Scale: 1.33M-triangle mesh',
    new URL('fixtures/performance-lab/generated/large-mesh-48.glb', import.meta.url).href,
  ),
  fixture(
    'planetary-gearbox-step',
    'Workspace mechanical vise assembly STEP',
    new URL('fixtures/performance-lab/workspace/planetary-gearbox-assembly.step', import.meta.url).href,
    preview(
      'planetary-gearbox-glb',
      new URL('fixtures/performance-lab/generated/planetary-gearbox.glb', import.meta.url).href,
    ),
  ),
  fixture(
    'planetary-cad-step',
    'Workspace planetary gear assembly STEP',
    new URL('fixtures/performance-lab/generated/planetary-gearbox-cad.step', import.meta.url).href,
    preview(
      'planetary-cad-glb',
      new URL('fixtures/performance-lab/generated/planetary-gearbox-cad.glb', import.meta.url).href,
    ),
  ),
  fixture(
    'planetary-cad-glb',
    'Workspace planetary gear assembly GLB',
    new URL('fixtures/performance-lab/generated/planetary-gearbox-cad.glb', import.meta.url).href,
  ),
  fixture(
    'helical-gear-step',
    'Workspace helical gear STEP',
    new URL('fixtures/performance-lab/generated/helical-gear.step', import.meta.url).href,
    preview('helical-gear-glb', new URL('fixtures/performance-lab/generated/helical-gear.glb', import.meta.url).href),
  ),
  fixture(
    'flanged-housing-step',
    'Workspace hollow flanged housing STEP',
    new URL('fixtures/performance-lab/generated/flanged-housing.step', import.meta.url).href,
    preview(
      'flanged-housing-glb',
      new URL('fixtures/performance-lab/generated/flanged-housing.glb', import.meta.url).href,
    ),
  ),
  fixture(
    'involute-gear-glb',
    'Workspace involute gear GLB',
    new URL('fixtures/performance-lab/generated/involute-gear.glb', import.meta.url).href,
  ),
  fixture(
    'helical-gear-glb',
    'Workspace helical gear GLB',
    new URL('fixtures/performance-lab/generated/helical-gear.glb', import.meta.url).href,
  ),
  fixture(
    'flanged-housing-glb',
    'Workspace hollow flanged housing GLB',
    new URL('fixtures/performance-lab/generated/flanged-housing.glb', import.meta.url).href,
  ),
  fixture(
    'elegant-vase-glb',
    'Workspace curved vase GLB',
    new URL('fixtures/performance-lab/generated/elegant-vase.glb', import.meta.url).href,
  ),
  fixture(
    'planetary-gearbox-glb',
    'Workspace mechanical vise mesh preview',
    new URL('fixtures/performance-lab/generated/planetary-gearbox.glb', import.meta.url).href,
  ),
  fixture(
    'm3-control-preview',
    'M3 control mesh preview',
    new URL('fixtures/performance-lab/generated/m3-control.glb', import.meta.url).href,
  ),
  fixture(
    'm3-clearance-preview',
    'M3 clearance mesh preview',
    new URL('fixtures/performance-lab/generated/m3-clearance.glb', import.meta.url).href,
  ),
  fixture(
    'box-preview',
    'Box mesh preview',
    new URL('fixtures/performance-lab/generated/box.glb', import.meta.url).href,
  ),
  fixture(
    'assembly-preview',
    'Assembly mesh preview',
    new URL('fixtures/performance-lab/generated/assembly.glb', import.meta.url).href,
  ),
  fixture(
    'inch-cube-preview',
    'Inch cube mesh preview',
    new URL('fixtures/performance-lab/generated/inch-cube.glb', import.meta.url).href,
  ),
  fixture(
    'cylinder-preview',
    'Cylinder mesh preview',
    new URL('fixtures/performance-lab/generated/cylinder.glb', import.meta.url).href,
  ),
  fixture(
    'pmi-preview',
    'PMI source mesh preview',
    new URL('fixtures/performance-lab/generated/pmi.glb', import.meta.url).href,
  ),
  fixture(
    'nist-pmi-preview',
    'NIST source mesh preview',
    new URL('fixtures/performance-lab/generated/nist-pmi.glb', import.meta.url).href,
  ),
  fixture(
    'through-bore-preview',
    'Through bore mesh preview',
    new URL('fixtures/performance-lab/generated/through-bore.glb', import.meta.url).href,
  ),
  fixture(
    'blind-bore-preview',
    'Blind bore mesh preview',
    new URL('fixtures/performance-lab/generated/blind-bore.glb', import.meta.url).href,
  ),
  fixture(
    'chamfer-preview',
    'Chamfer mesh preview',
    new URL('fixtures/performance-lab/generated/chamfer.glb', import.meta.url).href,
  ),
  fixture(
    'fillet-preview',
    'Fillet mesh preview',
    new URL('fixtures/performance-lab/generated/fillet.glb', import.meta.url).href,
  ),
  fixture(
    'bore-guide-preview',
    'Guide bore mesh preview',
    new URL('fixtures/performance-lab/generated/bore-guide.glb', import.meta.url).href,
  ),
];

/** Hash-bound accepted ordinary M3 cases: one positive and one negative polarity per matcher. */
export const performanceLabQualifiedCases = authorityCases as readonly PerformanceLabQualifiedCase[];

/** Passing feature cases and ordinary mismatches authored from frozen analytic construction. */
export const performanceLabAnalyticCases = analyticCases as readonly PerformanceLabAnalyticCase[];

/** One authored claim of a capability family; `expected` is a placeholder, since exploratory cases time evaluation. */
type ExploratoryClaim = { matcher: string; kind: string; expected: unknown; formats: ReadonlyArray<LabFixture['format']> };

const watertight: ExploratoryClaim = { matcher: 'toBeWatertight', kind: 'watertight', expected: true, formats: [] };

/**
 * Build an unverified model exploration case.
 * @param fixtureId - Registered model fixture.
 * @param family - Authored claim; the nullary watertight claim keeps the original case id.
 * @returns A claim without a certified result.
 */
const exploratoryCase = (fixtureId: string, family = watertight): PerformanceLabCase => {
  const id = family === watertight ? `exploratory-${fixtureId}` : `exploratory-${fixtureId}-${family.matcher}`;
  return {
    id,
    fixtureId,
    matcher: family.matcher,
    arguments: family === watertight ? [] : [family.expected],
    claim: {
      claimId: `simd-lab/${id}`,
      capability: family.matcher,
      payload: { expected: family.expected, kind: family.kind },
      polarity: 'positive',
      subjectSlots: ['subject'],
      workUnitBudget: 8_000_000,
    },
    expectedStatus: 'unverified',
    baseline: 'unverified',
    note: 'Exploratory user-workspace model; no independent expected assertion.',
  };
};

export const performanceLabExploratoryCases: readonly PerformanceLabCase[] = [
  exploratoryCase('involute-gear-glb'),
  exploratoryCase('elegant-vase-glb'),
];

const scaleFixtures = [
  'planetary-gearbox-step',
  'planetary-cad-step',
  'helical-gear-step',
  'flanged-housing-step',
  'helical-gear-glb',
  'flanged-housing-glb',
  'planetary-cad-glb',
  'many-occurrences-4096-step',
  'large-mesh-48-glb',
].map((id) => performanceLabFixtures.find((fixture) => fixture.id === id)!);

/**
 * Scale claims beside watertight, one per capability family: exact facts, validity and structure next to
 * interference and wall thickness, which tessellate (with analyzeMesh below), so MT/ST comparisons time evaluation.
 */
const scaleFamilies: readonly ExploratoryClaim[] = [
  { matcher: 'toHaveVolume', kind: 'volume', expected: { value: 0, tolerance: 0 }, formats: ['step', 'glb'] },
  { matcher: 'toBeValidBrep', kind: 'validBrep', expected: {}, formats: ['step'] },
  { matcher: 'toHaveProductStructure', kind: 'productStructure', expected: { count: 1 }, formats: ['step'] },
  { matcher: 'toHaveNoComponentInterference', kind: 'componentInterference', expected: {}, formats: ['step'] },
  {
    matcher: 'toHaveMinimumWallThickness',
    kind: 'minimumWallThickness',
    expected: { value: { greaterThanOrEqual: 1 }, tolerance: 0 },
    formats: ['step'],
  },
];

/** Long-running controls and larger workspace models are explicit opt-in cases. */
export const performanceLabScaleCases: readonly PerformanceLabCase[] = scaleFixtures.flatMap(({ id, format }) => [
  exploratoryCase(id),
  ...scaleFamilies.filter(({ formats }) => formats.includes(format)).map((family) => exploratoryCase(id, family)),
]);

/** An unverified scale-tier query; it has no accepted authority row. */
export type PerformanceLabScaleQuery = Omit<PerformanceLabQuery, 'expectedStatus' | 'baseline' | 'authority'> & {
  expectedStatus: 'unverified';
  baseline: 'unverified';
};

/** An analyzeMesh query on every scale fixture: the query that tessellates a STEP subject. */
export const performanceLabScaleQueries: readonly PerformanceLabScaleQuery[] = scaleFixtures.map(({ id }) => ({
  id: `exploratory-${id}-analyzeMesh`,
  fixtureId: id,
  capability: 'analyzeMesh',
  claim: {
    claimId: `simd-lab/exploratory-${id}-analyzeMesh`,
    capability: 'analyzeMesh',
    payload: null,
    polarity: 'positive',
    subjectSlots: ['subject'],
    workUnitBudget: 8_000_000,
  },
  expectedStatus: 'unverified',
  baseline: 'unverified',
}));

export const performanceLabCases: readonly PerformanceLabCase[] = [
  ...performanceLabQualifiedCases,
  ...performanceLabAnalyticCases,
  ...performanceLabExploratoryCases,
];

/** Native-only fixed contracts are visible as gaps in the legacy column. */
export const performanceLabLegacyGaps: Readonly<Record<string, string>> = {
  toSatisfyRationalPlate: 'No legacy fixed-contract plate matcher.',
  toSatisfyParallelPlaneDistance: 'No legacy fixed-contract PMI matcher.',
  queryPmi: 'No legacy PMI inventory protocol operation.',
};

/** Accepted M3 ancillary methods, including PMI inventory, for the shared timer. */
export const performanceLabNativeQueries = authorityQueries as readonly PerformanceLabQuery[];

/** A bounded status difference; never a replacement expectation or correctness pass. */
export type PerformanceLabDifference = {
  kind: 'qualified-target-difference' | 'known-legacy-defect' | 'retained-legacy-numerical-outcome';
  reason: string;
  sources: ReadonlyArray<{ path: string; sha256: string; jsonPointer: string }>;
};

const currentAuthorityHash = 'fb0920d448648cf1ea82c1305f8701c7992156a72f5a592cc569b3b3bec0bd51';
const referenceCompatibilityHash = '0d0da6ad2b5c7beca4eced08d489f2d4da6fc56baeb3270cdf8481a3979dcd9e';
const mixedDifferences = [
  {
    caseId: 'm3-toHaveBoundingBox-positive',
    rowId: 'family/toHaveBoundingBox/positive',
    currentRow: 0,
    status: 'passed',
    expectedStatus: 'failed',
  },
  {
    caseId: 'm3-toHaveBoundingBox-negative',
    rowId: 'family/toHaveBoundingBox/negative',
    currentRow: 1,
    status: 'failed',
    expectedStatus: 'passed',
  },
  {
    caseId: 'm3-toHaveCenterOfMass-positive',
    rowId: 'family/toHaveCenterOfMass/positive',
    currentRow: 20,
    status: 'passed',
    expectedStatus: 'failed',
  },
  {
    caseId: 'm3-toHaveCenterOfMass-negative',
    rowId: 'family/toHaveCenterOfMass/negative',
    currentRow: 21,
    status: 'failed',
    expectedStatus: 'passed',
  },
] as const;
const legacyDifferences = [
  {
    caseId: 'm3-toHaveBoundingBox-positive',
    referenceRow: 0,
    currentRow: 0,
    kind: 'retained-legacy-numerical-outcome',
    reason:
      'Retained legacy numerical outcome (not an accuracy certificate): the identical frozen subject and zero-tolerance bounding-box claim passed in the historical reference. The original expected failed remains unchanged.',
  },
  {
    caseId: 'm3-toHaveCenterOfMass-positive',
    referenceRow: 20,
    currentRow: 20,
    kind: 'retained-legacy-numerical-outcome',
    reason:
      'Retained legacy numerical outcome (not an accuracy certificate): the identical frozen subject and zero-tolerance center-of-mass claim passed in the historical reference. The original expected failed remains unchanged.',
  },
  {
    caseId: 'm3-toHaveCircularHole-positive',
    referenceRow: 34,
    currentRow: 34,
    kind: 'known-legacy-defect',
    reason:
      'Known legacy defect: the retained reference passed through:false for a two-mouth through bore. The accepted current contract fails this unchanged claim.',
  },
  {
    caseId: 'm3-toHaveChamferFeature-positive',
    referenceRow: 38,
    currentRow: 38,
    kind: 'known-legacy-defect',
    reason:
      'Known legacy defect: the retained reference reported a heuristic chamfer on geometry with no authored edge treatment. The accepted current contract fails this unchanged claim.',
  },
] as const;

/**
 * Explain only exact source-backed status tuples without changing raw expectations.
 * @internal
 * @param observed - Actual engine/case status and the original catalog expectation.
 * @returns A retained disposition, or undefined when no such authority applies.
 */
export const classifyPerformanceLabDifference = (observed: {
  engine: 'legacy-wasm' | 'combined-wasm' | 'native-desktop';
  caseId: string;
  status: string;
  expectedStatus: PerformanceLabCase['expectedStatus'];
}): PerformanceLabDifference | undefined => {
  if (observed.engine === 'combined-wasm') {
    const match = mixedDifferences.find(
      (entry) =>
        entry.caseId === observed.caseId &&
        entry.status === observed.status &&
        entry.expectedStatus === observed.expectedStatus,
    );
    if (match) {
      return {
        kind: 'qualified-target-difference',
        reason: `Qualified mixed-target status difference: pinned M3 mixedStatusOverrides specifies ${match.status} for this zero-tolerance claim. The original native expectation remains ${match.expectedStatus}; cross-target numeric equality is not implied.`,
        sources: [
          {
            path: `packages/geospec/host-tests/fixtures/data/${currentAuthorityHash}`,
            sha256: currentAuthorityHash,
            jsonPointer: `/mixedStatusOverrides/${match.rowId.replaceAll('/', '~1')}`,
          },
          {
            path: `packages/geospec/host-tests/fixtures/data/${currentAuthorityHash}`,
            sha256: currentAuthorityHash,
            jsonPointer: `/rows/${match.currentRow}/expected/status`,
          },
        ],
      };
    }
  }
  if (observed.engine === 'legacy-wasm' && observed.status === 'passed' && observed.expectedStatus === 'failed') {
    const match = legacyDifferences.find((entry) => entry.caseId === observed.caseId);
    if (match) {
      return {
        kind: match.kind,
        reason: match.reason,
        sources: [
          {
            path: `packages/geospec/host-tests/fixtures/data/${referenceCompatibilityHash}`,
            sha256: referenceCompatibilityHash,
            jsonPointer: `/rows/${match.referenceRow}/evaluatePlanResultUtf8`,
          },
          {
            path: `packages/geospec/host-tests/fixtures/data/${currentAuthorityHash}`,
            sha256: currentAuthorityHash,
            jsonPointer: `/rows/${match.currentRow}/expected/status`,
          },
        ],
      };
    }
  }
  return undefined;
};
