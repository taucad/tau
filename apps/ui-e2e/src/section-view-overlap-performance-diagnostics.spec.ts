import { writeFileSync } from 'node:fs';
import type { ConsoleMessage, Page, TestInfo } from '@playwright/test';
import { expect, test } from '@playwright/test';

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

type SectionViewBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setSectionView(state: {
      plane: 'xy' | 'xz' | 'yz';
      direction?: 1 | -1;
      rotationRadians?: readonly [number, number, number];
      pivot?: readonly [number, number, number];
      translation?: number;
    }): void;
    setCamera(camera: {
      position: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
      zoom?: number;
    }): void;
    getSectionCapPerformanceDiagnostics(): SectionCapPerformanceDiagnostics | undefined;
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
  section: {
    plane: 'xy' | 'xz' | 'yz';
    direction?: 1 | -1;
    rotationRadians?: readonly [number, number, number];
    pivot?: readonly [number, number, number];
  };
  overlapTranslations: readonly number[];
  noOverlapTranslations: readonly number[];
}>;

const diagnosticsFixtures: readonly SectionCapDiagnosticsFixture[] = [
  {
    id: 'baseline',
    projectId: 'jscad_section_overlap_fixture',
    camera: {
      position: [76, -70, 48],
      target: [32, 0, 0],
      fov: 38,
      zoom: 1.2,
    },
    section: {
      plane: 'xy',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 0],
    },
    overlapTranslations: [-0.25, 0, 0.25],
    noOverlapTranslations: [14, 14.5, 15],
  },
  {
    id: 'heavy-planetary',
    projectId: 'jscad_section_overlap_heavy_planetary_fixture',
    camera: {
      position: [96, -110, 78],
      target: [0, 0, 0],
      fov: 36,
      zoom: 1.05,
    },
    section: {
      plane: 'xy',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 0],
    },
    overlapTranslations: [-2, -1, 0, 1, 2],
    noOverlapTranslations: [34, 36, 38],
  },
  {
    id: 'heavy-v8',
    projectId: 'jscad_section_overlap_heavy_v8_fixture',
    camera: {
      position: [122, -116, 72],
      target: [0, 0, 4],
      fov: 38,
      zoom: 1,
    },
    section: {
      plane: 'xy',
      direction: 1,
      rotationRadians: [0, 0, 0],
      pivot: [0, 0, 0],
    },
    overlapTranslations: [-4, -2, 0, 2, 4],
    noOverlapTranslations: [64, 68, 72],
  },
];

const webgpuValidationPatterns: readonly RegExp[] = [
  /Vertex buffer slot \d+ required/,
  /Invalid CommandBuffer/,
  /depth-stencil format mismatch/,
];

const attachWebGpuValidationListener = (
  page: Page,
): {
  failuresRef: { lines: string[] };
  detach(): void;
} => {
  const failuresRef: { lines: string[] } = { lines: [] };

  const listener = (message: ConsoleMessage): void => {
    const text = message.text();
    for (const pattern of webgpuValidationPatterns) {
      if (pattern.test(text)) {
        failuresRef.lines.push(`[${message.type()}] ${text}`);
        break;
      }
    }
  };

  page.on('console', listener);

  return {
    failuresRef,
    detach: () => {
      page.off('console', listener);
    },
  };
};

const driveSectionView = async (
  page: Page,
  fixture: SectionCapDiagnosticsFixture,
  translation: number,
): Promise<void> => {
  await page.evaluate(
    ({ nextFixture, nextTranslation }) => {
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
      bridge.setSectionView({
        plane: nextFixture.section.plane,
        direction: nextFixture.section.direction ?? 1,
        rotationRadians: nextFixture.section.rotationRadians ?? [0, 0, 0],
        pivot: nextFixture.section.pivot ?? [0, 0, 0],
        translation: nextTranslation,
      });
    },
    { nextFixture: fixture, nextTranslation: translation },
  );
};

const getPerformanceDiagnostics = async (page: Page): Promise<SectionCapPerformanceDiagnostics | undefined> =>
  page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionCapPerformanceDiagnostics();
  });

const driveAndReadPerformance = async (
  page: Page,
  fixture: SectionCapDiagnosticsFixture,
  translation: number,
): Promise<SectionCapPerformanceDiagnostics> => {
  const previousSequence = await page.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    return bridge?.getSectionCapPerformanceDiagnostics()?.latestFrame.sequence ?? 0;
  });

  await driveSectionView(page, fixture, translation);
  await page.waitForFunction(
    (sequence) => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      const latestFrame = bridge?.getSectionCapPerformanceDiagnostics()?.latestFrame;
      return (latestFrame?.sequence ?? 0) > sequence && (latestFrame?.counters['workerCurrentResponseCount'] ?? 0) > 0;
    },
    previousSequence,
    { timeout: 30_000 },
  );

  const diagnostics = await getPerformanceDiagnostics(page);
  expect(diagnostics, `expected performance diagnostics after translation ${translation}`).toBeDefined();
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
  testInfo: TestInfo;
}>;

const writeDiagnostics = ({ backend, diagnostics, fixture, testInfo }: WriteDiagnosticsOptions): void => {
  writeFileSync(
    testInfo.outputPath(`section-cap-performance-diagnostics-${fixture.id}-${backend}.json`),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
};

type PerformanceSweepOptions = Readonly<{
  diagnostics?: readonly SectionCapPerformanceDiagnostics[];
  fixture: SectionCapDiagnosticsFixture;
  index?: number;
  page: Page;
  translations: readonly number[];
}>;

const collectPerformanceSweep = async ({
  diagnostics = [],
  fixture,
  index = 0,
  page,
  translations,
}: PerformanceSweepOptions): Promise<SectionCapPerformanceDiagnostics[]> => {
  const translation = translations[index];
  if (translation === undefined) {
    return [...diagnostics];
  }

  return collectPerformanceSweep({
    diagnostics: [...diagnostics, await driveAndReadPerformance(page, fixture, translation)],
    fixture,
    index: index + 1,
    page,
    translations,
  });
};

type FixtureDiagnosticsOptions = Readonly<{
  backend: string;
  fixture: SectionCapDiagnosticsFixture;
  page: Page;
  testInfo: TestInfo;
}>;

const collectFixtureDiagnostics = async ({
  backend,
  fixture,
  page,
  testInfo,
}: FixtureDiagnosticsOptions): Promise<void> => {
  await page.goto(`/examples/${fixture.projectId}?graphicsBackend=${backend}`);
  await expect(page.getByRole('img', { name: /3d model preview/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('bbox-viewer')).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() =>
    Boolean((globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__),
  );

  const overlap = await collectPerformanceSweep({
    fixture,
    page,
    translations: fixture.overlapTranslations,
  });
  const noOverlap = await collectPerformanceSweep({
    fixture,
    page,
    translations: fixture.noOverlapTranslations,
  });

  writeDiagnostics({ backend, diagnostics: { overlap, noOverlap }, fixture, testInfo });

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
  backend: string;
  index?: number;
  page: Page;
  testInfo: TestInfo;
}>;

const collectFixturesDiagnostics = async ({
  backend,
  index = 0,
  page,
  testInfo,
}: FixturesDiagnosticsOptions): Promise<void> => {
  const fixture = diagnosticsFixtures[index];
  if (!fixture) {
    return;
  }

  await collectFixtureDiagnostics({ backend, fixture, page, testInfo });
  await collectFixturesDiagnostics({ backend, index: index + 1, page, testInfo });
};

test.describe('Section view overlap performance diagnostics', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`captures overlap and no-overlap diagnostics in ${backend}`, async ({ page }, testInfo) => {
      if (backend === 'webgpu') {
        const hasWebGpu = await page.evaluate(() => 'gpu' in navigator);
        test.skip(!hasWebGpu, 'WebGPU is not available in this browser runtime.');
      }

      const listener = backend === 'webgpu' ? attachWebGpuValidationListener(page) : undefined;

      try {
        await collectFixturesDiagnostics({ backend, page, testInfo });

        expect(
          listener?.failuresRef.lines ?? [],
          `WebGPU validation errors leaked to the console:\n${listener?.failuresRef.lines.join('\n') ?? ''}`,
        ).toEqual([]);
      } finally {
        listener?.detach();
      }
    });
  }
});
