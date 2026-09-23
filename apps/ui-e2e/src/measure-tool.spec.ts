import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type MeasurePoint = readonly [number, number, number];

type MeasureState = {
  isMeasureActive: boolean;
  measurementUiMeshCount: number;
  currentStart: MeasurePoint | undefined;
  measurements: ReadonlyArray<{ id: string; distance: number; startPoint: MeasurePoint; endPoint: MeasurePoint }>;
};

type MeasureBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setCamera(camera: { position: MeasurePoint; target?: MeasurePoint; fov?: number; zoom?: number }): void;
    projectWorldPoint(point: MeasurePoint): { x: number; y: number; visible: boolean };
    getMeasureState(): MeasureState;
  };
};

const previewCanvasSelector = 'canvas[data-engine]';
const measureFixtureRoute = '/__e2e/example-fixture?locator=jscad.section-picking-fixture&graphicsBackend=webgl';

/** The fixture's left cuboid: a 14 mm cube centred at x = -24 mm. Metres throughout. */
const cubeHalfSize = 0.007;
const cubeEdgeLength = cubeHalfSize * 2;
const leftCubeCenterX = -0.024;
const topFaceZ = cubeHalfSize;
const topFaceCenter: MeasurePoint = [leftCubeCenterX, 0, topFaceZ];
const nearCorner: MeasurePoint = [leftCubeCenterX - cubeHalfSize, -cubeHalfSize, topFaceZ];
const farCorner: MeasurePoint = [leftCubeCenterX + cubeHalfSize, -cubeHalfSize, topFaceZ];
/** Clicked a little inside each corner, so the ray lands on the face and snapping does the rest. */
const cornerInset = 0.0015;
const insetTowardsFaceCenter = (corner: MeasurePoint): MeasurePoint => [
  corner[0] + Math.sign(topFaceCenter[0] - corner[0]) * cornerInset,
  corner[1] + Math.sign(topFaceCenter[1] - corner[1]) * cornerInset,
  corner[2],
];

async function openMeasureFixture(): Promise<void> {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(measureFixtureRoute);
  await target.expectVisible(selectors.getByCss(previewCanvasSelector), 60_000);
  const declineCookies = selectors.getByRole('button', { name: /^decline$/i });
  if (await target.isVisible(declineCookies).catch(() => false)) {
    await target.click(declineCookies);
  }

  const closeParameters = selectors.getByRole('button', { name: /^close parameters$/i });
  const closeParametersResult = await target.read(closeParameters).catch(() => ({ count: 0 }));
  if (closeParametersResult.count > 0) {
    await target.click(closeParameters, { force: true });
  }

  await target.expectGeometryFramed();

  // Straight down onto the cube's top face, so its corners are the only snap candidates.
  await target.evaluate(() => {
    const api = (globalThis as unknown as MeasureBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!api) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    api.setCamera({ position: [-0.024, 0, 0.08], target: [-0.024, 0, 0], fov: 38, zoom: 1 });
  });
  await target.delay(900);
}

async function projectWorldPoint(point: MeasurePoint): Promise<{ x: number; y: number; visible: boolean }> {
  return target.evaluate((nextPoint) => {
    const api = (globalThis as unknown as MeasureBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!api) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return api.projectWorldPoint(nextPoint);
  }, point);
}

async function measureState(): Promise<MeasureState> {
  return target.evaluate(() => {
    const api = (globalThis as unknown as MeasureBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!api) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    return api.getMeasureState();
  });
}

async function enableMeasure(): Promise<void> {
  await target.click(selectors.getByRole('button', { name: /enable measuring tool/i }));
  await expect
    .poll(
      async () => {
        const state = await measureState();
        return state.isMeasureActive;
      },
      { message: 'measure mode should activate' },
    )
    .toBe(true);
}

async function clickWorldPoint(point: MeasurePoint): Promise<void> {
  const projected = await projectWorldPoint(point);
  expect(projected.visible, `measure target ${point.join(',')} should be inside the camera frustum`).toBe(true);
  await target.mouseMove(projected.x, projected.y);
  await target.delay(150);
  await target.mouseDown();
  await target.mouseUp();
  await target.delay(150);
}

const distanceBetween = (a: MeasurePoint, b: MeasurePoint): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test.describe('Measure tool', () => {
  test('draws snap indicators while hovering a model face', async () => {
    await openMeasureFixture();
    await enableMeasure();

    const faceCenter = await projectWorldPoint(topFaceCenter);
    expect(faceCenter.visible, 'top face centre should be inside the camera frustum').toBe(true);
    await target.mouseMove(faceCenter.x, faceCenter.y);

    await expect
      .poll(
        async () => {
          const state = await measureState();
          return state.measurementUiMeshCount;
        },
        {
          message: 'hovering a model face should draw snap indicators into the scene',
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(0);

    await target.screenshot(selectors.getByCss(previewCanvasSelector), 'measure-tool-hover-snap-indicators.png');
  });

  test('snaps a measurement to the two corners of a cube edge', async () => {
    await openMeasureFixture();
    await enableMeasure();

    await clickWorldPoint(insetTowardsFaceCenter(nearCorner));
    await expect
      .poll(
        async () => {
          const state = await measureState();
          return state.currentStart;
        },
        { message: 'the first click should start a measurement' },
      )
      .toBeDefined();

    await clickWorldPoint(insetTowardsFaceCenter(farCorner));
    await expect
      .poll(
        async () => {
          const state = await measureState();
          return state.measurements.length;
        },
        { message: 'the second click should complete a measurement' },
      )
      .toBe(1);

    const completed = await measureState();
    const [measurement] = completed.measurements;
    expect(
      distanceBetween(measurement!.startPoint, nearCorner),
      'the first click should snap to the cube corner',
    ).toBeLessThan(1e-6);
    expect(
      distanceBetween(measurement!.endPoint, farCorner),
      'the second click should snap to the cube corner',
    ).toBeLessThan(1e-6);
    expect(measurement!.distance, 'the measurement should report the cube edge length').toBeCloseTo(cubeEdgeLength, 6);

    await target.screenshot(selectors.getByCss(previewCanvasSelector), 'measure-tool-completed-measurement.png');
  });
});
