import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type SectionCapPerformanceFrame = Readonly<{
  sequence: number;
  timestamp: number;
  topologyKey?: string;
  styleKey?: string;
  baseCapTopologyKey?: string;
  baseCapFrameTopologyKey?: string;
  baseCapIsCurrent?: boolean;
  exactDiagnosticTopologyKey?: string;
  exactDiagnosticIsCurrent?: boolean;
  committedTopologyKey?: string;
  pendingTopologyKey?: string;
  pendingReason?: string;
  timings: Record<string, number>;
  counters: Record<string, number>;
  booleanOperations: Record<string, { count: number; total: number }>;
  packing: Record<string, number>;
}>;

type SectionCapPerformanceDiagnostics = Readonly<{
  latestFrame: SectionCapPerformanceFrame;
  history: readonly SectionCapPerformanceFrame[];
  aggregates: {
    frameTotal: { count: number; p50: number; p95: number; max: number };
    phases: Record<string, { count: number; p50: number; p95: number; max: number }>;
  };
}>;

type SectionPlaneCut = Readonly<{ kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }>;

type SectionViewBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setSectionCuts(cuts: readonly SectionPlaneCut[]): string[];
    updateSectionCut(id: string, patch: Readonly<{ offset: number }>): void;
    getSectionState(): { cuts: ReadonlyArray<{ id: string }> };
    setCamera(camera: {
      position: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
      zoom?: number;
    }): void;
    getSectionCapPerformanceDiagnostics(): SectionCapPerformanceDiagnostics | undefined;
    getRenderFrame(): { metersPerRenderUnit: number };
  };
};

type SectionCapDiagnosticsFixture = Readonly<{
  id: string;
  projectId: string;
  camera: {
    position: readonly [number, number, number];
    target: readonly [number, number, number];
    fov: number;
    zoom: number;
  };
  /** The plane swept through the offsets, in metres; it removes its +axis side. */
  plane: 'xy' | 'xz' | 'yz';
  overlapOffsets: readonly number[];
  noOverlapOffsets: readonly number[];
}>;

const diagnosticsFixtures: readonly SectionCapDiagnosticsFixture[] = [
  {
    id: 'baseline',
    projectId: 'jscad.section-overlap-fixture',
    camera: {
      position: [0.076, -0.07, 0.048],
      target: [0.032, 0, 0],
      fov: 38,
      zoom: 1.2,
    },
    plane: 'xy',
    overlapOffsets: [-0.00025, 0, 0.00025],
    noOverlapOffsets: [0.014, 0.0145, 0.015],
  },
  {
    id: 'heavy-planetary',
    projectId: 'jscad.section-overlap-heavy-planetary-fixture',
    camera: {
      position: [0.096, -0.11, 0.078],
      target: [0, 0, 0],
      fov: 36,
      zoom: 1.05,
    },
    plane: 'xy',
    overlapOffsets: [-0.002, -0.001, 0, 0.001, 0.002],
    noOverlapOffsets: [0.034, 0.036, 0.038],
  },
  {
    id: 'heavy-v8',
    projectId: 'jscad.section-overlap-heavy-v8-fixture',
    camera: {
      position: [0.122, -0.116, 0.072],
      target: [0, 0, 0.004],
      fov: 38,
      zoom: 1,
    },
    plane: 'xy',
    overlapOffsets: [-0.004, -0.002, 0, 0.002, 0.004],
    noOverlapOffsets: [0.064, 0.068, 0.072],
  },
];

const webgpuValidationPatterns: readonly RegExp[] = [
  /Vertex buffer slot \d+ required/,
  /Invalid CommandBuffer/,
  /depth-stencil format mismatch/,
];

const consoleMessageCount = async (): Promise<number> => {
  const events = await target.events();
  return events.consoleMessages.length;
};

const webGpuValidationFailures = async (from: number): Promise<string[]> => {
  const events = await target.events();
  return events.consoleMessages
    .slice(from)
    .filter(({ text }) => webgpuValidationPatterns.some((pattern) => pattern.test(text)))
    .map(({ text, type }) => `[${type}] ${text}`);
};

/** Cuts the fixture's plane at `offset`; later calls move that cut, as a drag does. */
const driveSectionView = async (fixture: SectionCapDiagnosticsFixture, offset: number): Promise<void> => {
  await target.evaluate(
    ({ nextFixture, nextOffset }) => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Section view e2e bridge is not installed.');
      }

      bridge.setCamera({
        position: nextFixture.camera.position,
        target: nextFixture.camera.target,
        fov: nextFixture.camera.fov,
        zoom: nextFixture.camera.zoom,
      });
      const [cut] = bridge.getSectionState().cuts;
      if (cut) {
        bridge.updateSectionCut(cut.id, { offset: nextOffset });
      } else {
        bridge.setSectionCuts([{ kind: 'plane', plane: nextFixture.plane, offset: nextOffset, isFlipped: false }]);
      }
    },
    { nextFixture: fixture, nextOffset: offset },
  );
};

const getPerformanceDiagnostics = async (): Promise<SectionCapPerformanceDiagnostics | undefined> =>
  target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionCapPerformanceDiagnostics();
  });

const driveAndReadPerformance = async (
  fixture: SectionCapDiagnosticsFixture,
  offset: number,
): Promise<SectionCapPerformanceDiagnostics> => {
  const previousSequence = await target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    return bridge?.getSectionCapPerformanceDiagnostics()?.latestFrame.sequence ?? 0;
  });

  await driveSectionView(fixture, offset);
  // Settled: the worker answered these cuts, or no cap reaches the worker because the plane misses the solids.
  await target.waitFor(
    (sequence) => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const latestFrame = bridge?.getSectionCapPerformanceDiagnostics()?.latestFrame;
      return (latestFrame?.sequence ?? 0) > sequence && latestFrame?.pendingReason === 'none';
    },
    previousSequence,
    { timeout: 30_000 },
  );

  const diagnostics = await getPerformanceDiagnostics();
  expect(diagnostics, `expected performance diagnostics after offset ${offset}`).toBeDefined();
  return diagnostics!;
};

const expectFiniteNonNegativeValues = (values: Record<string, number>, label: string): void => {
  for (const [key, value] of Object.entries(values)) {
    expect(Number.isFinite(value), `${label}.${key} should be finite`).toBe(true);
    expect(value, `${label}.${key} should be non-negative`).toBeGreaterThanOrEqual(0);
  }
};

const expectPerformanceShape = (diagnostics: SectionCapPerformanceDiagnostics, label: string): void => {
  expect(diagnostics.history.length, `${label}: history should not be empty`).toBeGreaterThan(0);
  expect(diagnostics.aggregates.frameTotal.count, `${label}: frame aggregate count`).toBe(diagnostics.history.length);
  expect(diagnostics.latestFrame.sequence, `${label}: latest sequence`).toBeGreaterThan(0);
  expect(diagnostics.latestFrame.topologyKey, `${label}: topology key`).toEqual(expect.any(String));
  expect(diagnostics.latestFrame.styleKey, `${label}: style key`).toEqual(expect.any(String));
  expect(diagnostics.latestFrame.baseCapTopologyKey, `${label}: base cap topology key`).toEqual(expect.any(String));
  expect(diagnostics.latestFrame.baseCapFrameTopologyKey, `${label}: base cap frame topology key`).toEqual(
    expect.any(String),
  );
  expect(diagnostics.latestFrame.baseCapIsCurrent, `${label}: base cap currentness`).toBe(true);
  expect(diagnostics.latestFrame.exactDiagnosticIsCurrent, `${label}: exact diagnostic currentness`).toEqual(
    expect.any(Boolean),
  );
  expect(diagnostics.latestFrame.pendingReason, `${label}: pending reason`).toEqual(expect.any(String));
  expectFiniteNonNegativeValues(diagnostics.latestFrame.timings, `${label}.timings`);
  expectFiniteNonNegativeValues(diagnostics.latestFrame.counters, `${label}.counters`);
  expectFiniteNonNegativeValues(diagnostics.latestFrame.packing, `${label}.packing`);
  for (const [operation, stats] of Object.entries(diagnostics.latestFrame.booleanOperations)) {
    expect(stats.count, `${label}.${operation}.count`).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(stats.total), `${label}.${operation}.total`).toBe(true);
    expect(stats.total, `${label}.${operation}.total`).toBeGreaterThanOrEqual(0);
  }
};

type WriteDiagnosticsOptions = Readonly<{
  backend: string;
  diagnostics: Readonly<{
    overlap: readonly SectionCapPerformanceDiagnostics[];
    noOverlap: readonly SectionCapPerformanceDiagnostics[];
  }>;
  fixture: SectionCapDiagnosticsFixture;
}>;

const writeDiagnostics = async ({ backend, diagnostics, fixture }: WriteDiagnosticsOptions): Promise<void> => {
  await target.writeArtifact(
    `section-cap-performance-diagnostics-${fixture.id}-${backend}.json`,
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
};

type PerformanceSweepOptions = Readonly<{
  diagnostics?: readonly SectionCapPerformanceDiagnostics[];
  fixture: SectionCapDiagnosticsFixture;
  index?: number;
  offsets: readonly number[];
}>;

const collectPerformanceSweep = async ({
  diagnostics = [],
  fixture,
  index = 0,
  offsets,
}: PerformanceSweepOptions): Promise<SectionCapPerformanceDiagnostics[]> => {
  const offset = offsets[index];
  if (offset === undefined) {
    return [...diagnostics];
  }

  return collectPerformanceSweep({
    diagnostics: [...diagnostics, await driveAndReadPerformance(fixture, offset)],
    fixture,
    index: index + 1,
    offsets,
  });
};

type FixtureDiagnosticsOptions = Readonly<{
  backend: 'webgl' | 'webgpu';
  fixture: SectionCapDiagnosticsFixture;
}>;

const collectFixtureDiagnostics = async ({ backend, fixture }: FixtureDiagnosticsOptions): Promise<void> => {
  await target.navigate(`/__e2e/example-fixture?locator=${fixture.projectId}&graphicsBackend=${backend}`);
  await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
  await target.expectGraphicsBackend(backend);
  await target.expectGeometryFramed();

  const overlap = await collectPerformanceSweep({
    fixture,
    offsets: fixture.overlapOffsets,
  });
  const noOverlap = await collectPerformanceSweep({
    fixture,
    offsets: fixture.noOverlapOffsets,
  });

  await writeDiagnostics({ backend, diagnostics: { overlap, noOverlap }, fixture });

  for (const [index, diagnostics] of overlap.entries()) {
    expectPerformanceShape(diagnostics, `${backend}.${fixture.id}.overlap[${index}]`);
  }
  for (const [index, diagnostics] of noOverlap.entries()) {
    expectPerformanceShape(diagnostics, `${backend}.${fixture.id}.noOverlap[${index}]`);
  }

  expect(
    overlap.some((diagnostics) => (diagnostics.latestFrame.counters['positiveAreaPairCount'] ?? 0) > 0),
    `${backend}.${fixture.id}: overlap sweep should include positive-area overlap work`,
  ).toBe(true);
  expect(
    overlap.some((diagnostics) => (diagnostics.latestFrame.booleanOperations['intersection']?.count ?? 0) > 0),
    `${backend}.${fixture.id}: overlap sweep should report exact intersection calls`,
  ).toBe(true);
  expect(
    overlap.some((diagnostics) => (diagnostics.latestFrame.packing['packedVertexCount'] ?? 0) > 0),
    `${backend}.${fixture.id}: overlap sweep should report packed cap vertices`,
  ).toBe(true);
  expect(
    overlap.every((diagnostics) => (diagnostics.latestFrame.counters['styleInvalidatedWorkerRequestCount'] ?? 0) === 0),
    `${backend}.${fixture.id}: style changes should not invalidate topology worker requests`,
  ).toBe(true);
  expect(
    overlap.every((diagnostics) => diagnostics.latestFrame.pendingReason !== 'style-change'),
    `${backend}.${fixture.id}: style changes should not be reported as pending exact topology`,
  ).toBe(true);
  expect(
    noOverlap.every((diagnostics) => diagnostics.latestFrame.counters['positiveAreaPairCount'] === 0),
    `${backend}.${fixture.id}: no-overlap sweep should report zero positive-area pairs`,
  ).toBe(true);
};

type FixturesDiagnosticsOptions = Readonly<{
  backend: 'webgl' | 'webgpu';
  index?: number;
}>;

const collectFixturesDiagnostics = async ({ backend, index = 0 }: FixturesDiagnosticsOptions): Promise<void> => {
  const fixture = diagnosticsFixtures[index];
  if (!fixture) {
    return;
  }

  await collectFixtureDiagnostics({ backend, fixture });
  await collectFixturesDiagnostics({ backend, index: index + 1 });
};

test.describe('Section view overlap performance diagnostics', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`captures overlap and no-overlap diagnostics in ${backend}`, async () => {
      const messageStart = await consoleMessageCount();
      await collectFixturesDiagnostics({ backend });
      const failures = backend === 'webgpu' ? await webGpuValidationFailures(messageStart) : [];
      expect(failures, `WebGPU validation errors leaked to the console:\n${failures.join('\n')}`).toEqual([]);
    });
  }
});
