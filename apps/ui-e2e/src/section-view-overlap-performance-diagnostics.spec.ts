import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/** The bridge's stencil cap counts: each depends on the cut pieces and the sources' meshes, never on triangles. */
type SectionCapStencilDiagnostics = Readonly<{
  sequence: number;
  latest:
    | Readonly<{
        pieceCount: number;
        drawnPieceCount: number;
        crossingSourceCount: number;
        overlapCandidateSourceCount: number;
        outlineSourceCount: number;
        meshDrawCount: number;
        polygonDrawCount: number;
        submitMilliseconds: number;
      }>
    | undefined;
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
    getSectionCapStencilDiagnostics(): SectionCapStencilDiagnostics | undefined;
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

const getPerformanceDiagnostics = async (): Promise<SectionCapStencilDiagnostics | undefined> =>
  target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return bridge.getSectionCapStencilDiagnostics();
  });

const driveAndReadPerformance = async (
  fixture: SectionCapDiagnosticsFixture,
  offset: number,
): Promise<SectionCapStencilDiagnostics> => {
  const previousSequence = await target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    return bridge?.getSectionCapStencilDiagnostics()?.sequence ?? 0;
  });

  await driveSectionView(fixture, offset);
  // A cap frame drew these cuts.
  await target.waitFor(
    (sequence) => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      return (bridge?.getSectionCapStencilDiagnostics()?.sequence ?? 0) > sequence;
    },
    previousSequence,
    { timeout: 30_000 },
  );

  const diagnostics = await getPerformanceDiagnostics();
  expect(diagnostics, `expected performance diagnostics after offset ${offset}`).toBeDefined();
  return diagnostics!;
};

const expectStencilShape = (diagnostics: SectionCapStencilDiagnostics, label: string): void => {
  expect(diagnostics.sequence, `${label}: sequence`).toBeGreaterThan(0);
  expect(diagnostics.latest, `${label}: latest frame`).toBeDefined();
  for (const [key, value] of Object.entries(diagnostics.latest ?? {})) {
    expect(Number.isFinite(value), `${label}.${key} should be finite`).toBe(true);
    expect(value, `${label}.${key} should be non-negative`).toBeGreaterThanOrEqual(0);
  }
};

type WriteDiagnosticsOptions = Readonly<{
  backend: string;
  diagnostics: Readonly<{
    overlap: readonly SectionCapStencilDiagnostics[];
    noOverlap: readonly SectionCapStencilDiagnostics[];
  }>;
  fixture: SectionCapDiagnosticsFixture;
}>;

const writeDiagnostics = async ({ backend, diagnostics, fixture }: WriteDiagnosticsOptions): Promise<void> => {
  await target.writeArtifact(
    `section-cap-stencil-diagnostics-${fixture.id}-${backend}.json`,
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
};

type PerformanceSweepOptions = Readonly<{
  diagnostics?: readonly SectionCapStencilDiagnostics[];
  fixture: SectionCapDiagnosticsFixture;
  index?: number;
  offsets: readonly number[];
}>;

const collectPerformanceSweep = async ({
  diagnostics = [],
  fixture,
  index = 0,
  offsets,
}: PerformanceSweepOptions): Promise<SectionCapStencilDiagnostics[]> => {
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
    expectStencilShape(diagnostics, `${backend}.${fixture.id}.overlap[${index}]`);
  }
  for (const [index, diagnostics] of noOverlap.entries()) {
    expectStencilShape(diagnostics, `${backend}.${fixture.id}.noOverlap[${index}]`);
  }

  expect(
    overlap.some((diagnostics) => (diagnostics.latest?.overlapCandidateSourceCount ?? 0) > 0),
    `${backend}.${fixture.id}: overlap sweep should mark overlap candidates`,
  ).toBe(true);
  expect(
    overlap.every((diagnostics) => (diagnostics.latest?.drawnPieceCount ?? 0) > 0),
    `${backend}.${fixture.id}: every overlap offset should draw a cap`,
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
