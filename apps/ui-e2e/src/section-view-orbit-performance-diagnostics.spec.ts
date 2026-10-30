import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * The bridge's stencil cap counts for one drawn cap frame. `buildMilliseconds` is the part of `submitMilliseconds`
 * spent building the draw list rather than submitting it, so a camera-only frame's rebuild can be priced separately
 * from the draws it feeds.
 */
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
        rebuilt: boolean;
        buildMilliseconds: number;
        submitMilliseconds: number;
      }>
    | undefined;
}>;

type SectionPlaneCut = Readonly<{ kind: 'plane'; plane: 'xy' | 'xz' | 'yz'; offset: number; isFlipped: boolean }>;

type SectionViewBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setSectionCuts(cuts: readonly SectionPlaneCut[]): string[];
    setCamera(camera: {
      position: readonly [number, number, number];
      target?: readonly [number, number, number];
      fov?: number;
      zoom?: number;
    }): void;
    getSectionCapStencilDiagnostics(): SectionCapStencilDiagnostics | undefined;
  };
};

type OrbitFixture = Readonly<{
  id: string;
  projectId: string;
  camera: Readonly<{ target: readonly [number, number, number]; fov: number; zoom: number }>;
  /** The orbit's radius and height above `camera.target`, in metres. */
  radius: number;
  height: number;
  plane: 'xy' | 'xz' | 'yz';
  /** One offset, in metres, at which the plane cuts the model; it is set once and never moved again. */
  offset: number;
}>;

const orbitFixtures: readonly OrbitFixture[] = [
  {
    id: 'heavy-planetary',
    projectId: 'jscad.section-overlap-heavy-planetary-fixture',
    camera: { target: [0, 0, 0], fov: 36, zoom: 1.05 },
    radius: 0.146,
    height: 0.078,
    plane: 'xy',
    offset: 0,
  },
  {
    id: 'baseline',
    projectId: 'jscad.section-overlap-fixture',
    camera: { target: [0.032, 0, 0], fov: 38, zoom: 1.2 },
    radius: 0.104,
    height: 0.048,
    plane: 'xy',
    offset: 0,
  },
];

const readDiagnostics = async (): Promise<SectionCapStencilDiagnostics | undefined> =>
  target.evaluate(() => {
    const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    return bridge?.getSectionCapStencilDiagnostics();
  });

const readSequence = async (): Promise<number> => {
  const diagnostics = await readDiagnostics();
  return diagnostics?.sequence ?? 0;
};

/** Resolves once a cap frame later than `sequence` has drawn. */
const waitForCapFrame = async (sequence: number): Promise<void> =>
  target.waitFor(
    (previous) => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      return (bridge?.getSectionCapStencilDiagnostics()?.sequence ?? 0) > previous;
    },
    sequence,
    { timeout: 60_000 },
  );

const setCamera = async (fixture: OrbitFixture, angle: number): Promise<void> =>
  target.evaluate(
    ({ position, nextTarget, fov, zoom }) => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Section view e2e bridge is not installed.');
      }
      bridge.setCamera({ position, target: nextTarget, fov, zoom });
    },
    {
      position: [
        fixture.camera.target[0] + fixture.radius * Math.cos(angle),
        fixture.camera.target[1] + fixture.radius * Math.sin(angle),
        fixture.camera.target[2] + fixture.height,
      ] as const,
      nextTarget: fixture.camera.target,
      fov: fixture.camera.fov,
      zoom: fixture.camera.zoom,
    },
  );

/** How many cap frames the viewer draws over `milliseconds` while nothing is touched: demand rendering draws none. */
const countIdleFrames = async (milliseconds: number): Promise<number> => {
  const before = await readSequence();
  await target.evaluate(
    async (wait) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, wait);
      }),
    milliseconds,
  );
  const after = await readSequence();
  return after - before;
};

type OrbitStep = Readonly<{ angle: number; sequenceDelta: number; latest: unknown }>;

/** One orbit step: move only the camera, then read the cap frame it drew. */
const collectOrbitStep = async (fixture: OrbitFixture, index: number): Promise<OrbitStep> => {
  const angle = (index * Math.PI) / 24;
  const before = await readSequence();
  await setCamera(fixture, angle);
  await waitForCapFrame(before);
  const diagnostics = await readDiagnostics();
  return { angle, sequenceDelta: (diagnostics?.sequence ?? 0) - before, latest: diagnostics?.latest };
};

type OrbitSweepOptions = Readonly<{
  fixture: OrbitFixture;
  index?: number;
  steps: number;
  collected?: readonly OrbitStep[];
}>;

const collectOrbitSweep = async ({
  collected = [],
  fixture,
  index = 0,
  steps,
}: OrbitSweepOptions): Promise<readonly OrbitStep[]> => {
  if (index >= steps) {
    return collected;
  }
  return collectOrbitSweep({
    collected: [...collected, await collectOrbitStep(fixture, index)],
    fixture,
    index: index + 1,
    steps,
  });
};

type ContinuousOrbit = Readonly<{
  sequenceDelta: number;
  elapsed: number;
  cameraSets: number;
  latest: unknown;
}>;

/**
 * Orbits the camera on every animation frame for `milliseconds`, as dragging on the canvas does, and reports how many
 * cap frames were drawn. This is the orbit regime: the cut never changes, only the camera.
 */
const driveContinuousOrbit = async (fixture: OrbitFixture, milliseconds: number): Promise<ContinuousOrbit> =>
  target.evaluate(
    async ({ nextFixture, wait }) =>
      new Promise<ContinuousOrbit>((resolve) => {
        const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
        if (!bridge) {
          throw new Error('Section view e2e bridge is not installed.');
        }
        const before = bridge.getSectionCapStencilDiagnostics()?.sequence ?? 0;
        const startedAt = performance.now();
        let cameraSets = 0;
        const step = (): void => {
          const elapsed = performance.now() - startedAt;
          const diagnostics = bridge.getSectionCapStencilDiagnostics();
          if (elapsed >= wait) {
            resolve({
              sequenceDelta: (diagnostics?.sequence ?? 0) - before,
              elapsed,
              cameraSets,
              latest: diagnostics?.latest,
            });
            return;
          }
          const angle = (elapsed / 1000) * 0.6;
          bridge.setCamera({
            position: [
              nextFixture.camera.target[0] + nextFixture.radius * Math.cos(angle),
              nextFixture.camera.target[1] + nextFixture.radius * Math.sin(angle),
              nextFixture.camera.target[2] + nextFixture.height,
            ],
            target: nextFixture.camera.target,
            fov: nextFixture.camera.fov,
            zoom: nextFixture.camera.zoom,
          });
          cameraSets++;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    { nextFixture: fixture, wait: milliseconds },
  );

const orbitSteps = 24;

const collectFixtureDiagnostics = async (fixture: OrbitFixture, backend: 'webgl' | 'webgpu'): Promise<void> => {
  await target.navigate(`/__e2e/example-fixture?locator=${fixture.projectId}&graphicsBackend=${backend}`);
  await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
  await target.expectPresentedGraphicsBackend(backend);
  await target.expectGeometryFramed();

  // No cut: the control for demand rendering, which draws nothing while nothing changes.
  await setCamera(fixture, 0);
  const uncutIdleFrames = await countIdleFrames(2000);

  // One cut, committed once and then never touched again.
  const sequenceBeforeCut = await readSequence();
  await target.evaluate(
    ({ plane, offset }) => {
      const bridge = (globalThis as unknown as SectionViewBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Section view e2e bridge is not installed.');
      }
      bridge.setSectionCuts([{ kind: 'plane', plane, offset, isFlipped: false }]);
    },
    { plane: fixture.plane, offset: fixture.offset },
  );
  await waitForCapFrame(sequenceBeforeCut);
  const atCut = await readDiagnostics();

  // The committed cut now stands still, and so does the camera.
  const cutIdleFrames = await countIdleFrames(2000);

  // Camera-only frames: the cut is never moved again from here.
  const orbit = await collectOrbitSweep({ fixture, steps: orbitSteps });
  const continuousOrbit = await driveContinuousOrbit(fixture, 3000);

  await target.writeArtifact(
    `section-cap-orbit-diagnostics-${fixture.id}-${backend}.json`,
    `${JSON.stringify({ fixture, backend, uncutIdleFrames, cutIdleFrames, atCut, orbit, continuousOrbit }, null, 2)}\n`,
  );

  expect(atCut?.latest, `${backend}.${fixture.id}: a cap frame drew the committed cut`).toBeDefined();
  expect(orbit, `${backend}.${fixture.id}: orbit steps`).toHaveLength(orbitSteps);
  // A camera-only frame draws a cap frame: the stage is not guarded on the cut.
  expect(
    orbit.every(({ sequenceDelta }) => sequenceDelta > 0),
    `${backend}.${fixture.id}: every orbit step should draw a cap frame`,
  ).toBe(true);
};

type FixturesDiagnosticsOptions = Readonly<{
  backend: 'webgl' | 'webgpu';
  index?: number;
}>;

const collectFixturesDiagnostics = async ({ backend, index = 0 }: FixturesDiagnosticsOptions): Promise<void> => {
  const fixture = orbitFixtures[index];
  if (!fixture) {
    return;
  }
  await collectFixtureDiagnostics(fixture, backend);
  await collectFixturesDiagnostics({ backend, index: index + 1 });
};

test.describe('Section view orbit performance diagnostics', () => {
  for (const backend of ['webgl', 'webgpu'] as const) {
    test(`captures static-cut orbit diagnostics in ${backend}`, async () => {
      await collectFixturesDiagnostics({ backend });
    });
  }
});
