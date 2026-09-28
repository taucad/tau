import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type MeasurePoint = readonly [number, number, number];

type MeasureState = {
  isMeasureActive: boolean;
  measurementUiMeshCount: number;
  rendererGeometryCount: number;
  snapDistancePx: number;
  candidates: ReadonlyArray<{ id: string; label: string }>;
  activeCandidateId?: string;
  lockedTargetId?: string;
  mode: 'auto' | 'point';
  currentStart: MeasurePoint | undefined;
  measurements: ReadonlyArray<{
    id: string;
    distance: number;
    startPoint: MeasurePoint;
    endPoint: MeasurePoint;
    operation?: string;
    quality?: string;
    status?: string;
    unavailableReason?: string;
  }>;
};

type MeasureBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    setCamera(camera: { position: MeasurePoint; target?: MeasurePoint; fov?: number; zoom?: number }): void;
    projectWorldPoint(point: MeasurePoint): { x: number; y: number; visible: boolean };
    getMeasureState(): MeasureState;
    getGraphicsBackend(): 'webgl' | 'webgpu';
  };
};

const previewCanvasSelector = 'canvas[data-engine]';
const measureFixtureLocator = 'jscad.section-picking-fixture';

/** The fixture's left cuboid: a 14 mm cube centred at x = -24 mm. Metres throughout. */
const cubeHalfSize = 0.007;
const cubeEdgeLength = cubeHalfSize * 2;
const leftCubeCenterX = -0.024;
const topFaceZ = cubeHalfSize;
const topFaceCenter: MeasurePoint = [leftCubeCenterX, 0, topFaceZ];
const nearCorner: MeasurePoint = [leftCubeCenterX - cubeHalfSize, -cubeHalfSize, topFaceZ];
const farCorner: MeasurePoint = [leftCubeCenterX + cubeHalfSize, -cubeHalfSize, topFaceZ];
/** Clicked a little inside each corner, so the ray lands on the face and snapping does the rest. */
const cornerInset = 0.0002;
const insetTowardsFaceCenter = (corner: MeasurePoint): MeasurePoint => [
  corner[0] + Math.sign(topFaceCenter[0] - corner[0]) * cornerInset,
  corner[1] + Math.sign(topFaceCenter[1] - corner[1]) * cornerInset,
  corner[2],
];

async function openMeasureFixture(backend: 'webgl' | 'webgpu', locator = measureFixtureLocator): Promise<void> {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`/__e2e/example-fixture?locator=${locator}&graphicsBackend=${backend}`);
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
  const actualBackend = await target.evaluate(() =>
    (globalThis as unknown as MeasureBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getGraphicsBackend(),
  );
  expect(actualBackend, 'the requested graphics backend must actually render').toBe(backend);

  if (locator !== measureFixtureLocator) {
    return;
  }

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
  await target.click(selectors.getByRole('button', { name: /^measure$/i, pressed: false }));
  await expect
    .poll(
      async () => {
        const state = await measureState();
        return state.isMeasureActive;
      },
      { message: 'measure mode should activate' },
    )
    .toBe(true);
  const active = await measureState();
  expect(active.snapDistancePx).toBe(10);
}

async function toggleTargetControls(): Promise<void> {
  await target.click(selectors.getByRole('button', { name: /^Targets:/ }));
}

async function chooseByTyping(label: string, text: string): Promise<void> {
  const select = selectors.getByRole('combobox', { name: label, exact: true });
  await target.focus(select);
  await target.type(select, text);
  await target.keyboardPress('Tab');
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

async function tapWorldPoint(point: MeasurePoint): Promise<void> {
  const projected = await projectWorldPoint(point);
  // Synthetic touch input exercises the app's pointer contract on the real rendered viewer.
  await target.evaluate(({ x, y }) => {
    const canvas = document.querySelector('canvas[data-engine]');
    if (!canvas) {
      throw new Error('Viewer canvas missing.');
    }
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 19,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerdown' ? 1 : 0,
          clientX: x,
          clientY: y,
        }),
      );
    }
  }, projected);
}

const distanceBetween = (a: MeasurePoint, b: MeasurePoint): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

for (const backend of ['webgl', 'webgpu'] as const) {
  test.describe(`Measure tool (${backend})`, () => {
    test('draws snap indicators while hovering a model face', async () => {
      await openMeasureFixture(backend);
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

      await target.screenshot(
        selectors.getByCss(previewCanvasSelector),
        `measure-tool-hover-snap-indicators-${backend}.png`,
      );
    });

    test('snaps a measurement to the two corners of a cube edge', async () => {
      await openMeasureFixture(backend);
      await enableMeasure();
      await toggleTargetControls();
      await chooseByTyping('Measurement mode', 'Points');
      await toggleTargetControls();
      await expect
        .poll(async () => {
          const state = await measureState();
          return state.mode;
        })
        .toBe('point');

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
      expect(measurement!.distance, 'the measurement should report the cube edge length').toBeCloseTo(
        cubeEdgeLength,
        6,
      );
      expect(measurement!.quality).toBe('mesh');
      expect(measurement!.status).toBe('current');

      const canvasBounds = await target.boundingBox(selectors.getByCss(previewCanvasSelector));
      const doneBounds = await target.boundingBox(
        selectors.getByRole('button', { name: 'Done with measure', exact: true }),
      );
      expect(doneBounds).toBeDefined();
      expect(doneBounds!.x + doneBounds!.width).toBeLessThanOrEqual(canvasBounds!.x + canvasBounds!.width);
      await target.screenshot(
        selectors.getByCss(previewCanvasSelector),
        `measure-tool-completed-measurement-${backend}.png`,
      );
    });

    test('measures a whole edge from one Auto selection', async () => {
      await openMeasureFixture(backend);
      await enableMeasure();
      await clickWorldPoint([leftCubeCenterX, -cubeHalfSize, topFaceZ]);
      await expect
        .poll(async () => {
          const state = await measureState();
          return state.measurements.length;
        })
        .toBe(1);
      const completed = await measureState();
      const [result] = completed.measurements;
      expect(result).toMatchObject({ operation: 'edge-length', quality: 'mesh', status: 'current' });
      expect(result!.distance).toBeCloseTo(cubeEdgeLength, 6);
      expect(distanceBetween(result!.startPoint, result!.endPoint)).toBeCloseTo(cubeEdgeLength, 6);
    });

    test('releases hover geometry after repeated target changes', async () => {
      await openMeasureFixture(backend);
      await enableMeasure();
      const first = await projectWorldPoint(nearCorner);
      const second = await projectWorldPoint(farCorner);
      await target.mouseMove(first.x, first.y);
      await target.delay(150);
      const warm = await measureState();
      const firstTarget = warm.activeCandidateId;
      await target.mouseMove(second.x, second.y);
      await target.delay(150);
      const changed = await measureState();
      expect(changed.activeCandidateId).not.toBe(firstTarget);
      // Exercise disposal in the real renderer; eight repeated back-and-forth sweeps must plateau.
      for (let sweep = 0; sweep < 8; sweep++) {
        // oxlint-disable-next-line no-await-in-loop -- Sequential real pointer gestures exercise resource replacement.
        await target.mouseMove(first.x, first.y);
        // oxlint-disable-next-line no-await-in-loop -- Wait for each renderer update before replacing its geometry.
        await target.delay(40);
        // oxlint-disable-next-line no-await-in-loop -- Sequential real pointer gestures exercise resource replacement.
        await target.mouseMove(second.x, second.y);
        // oxlint-disable-next-line no-await-in-loop -- Wait for each renderer update before replacing its geometry.
        await target.delay(40);
      }
      const after = await measureState();
      expect(after.rendererGeometryCount).toBeLessThanOrEqual(changed.rendererGeometryCount + 2);
      expect(after.measurementUiMeshCount).toBeLessThanOrEqual(12);
    });

    test('previews a touch tap until Use target explicitly commits it', async () => {
      await openMeasureFixture(backend);
      await enableMeasure();
      await toggleTargetControls();
      await chooseByTyping('Measurement mode', 'Points');
      await toggleTargetControls();
      await tapWorldPoint(insetTowardsFaceCenter(nearCorner));
      const preview = await measureState();
      expect(preview.currentStart).toBeUndefined();
      expect(preview.measurements).toHaveLength(0);
      expect(preview.activeCandidateId).toBeTruthy();
      await toggleTargetControls();
      await target.click(selectors.getByRole('button', { name: 'Use target', exact: true }));
      await expect
        .poll(async () => {
          const state = await measureState();
          return state.currentStart;
        })
        .toBeDefined();
      const selected = await measureState();
      expect(distanceBetween(selected.currentStart!, nearCorner)).toBeLessThan(1e-6);
      expect(selected.measurements).toHaveLength(0);
      await toggleTargetControls();
      await tapWorldPoint(insetTowardsFaceCenter(farCorner));
      await toggleTargetControls();
      await target.click(selectors.getByRole('button', { name: 'Use target', exact: true }));
      await expect
        .poll(async () => {
          const state = await measureState();
          return state.measurements[0]?.distance;
        })
        .toBeCloseTo(cubeEdgeLength, 6);
    });

    test('chooses and locks a named feature with keyboard controls', async () => {
      await openMeasureFixture(backend);
      await enableMeasure();
      await toggleTargetControls();
      await chooseByTyping('Measurement mode', 'Points');
      await target.focus(selectors.getByRole('combobox', { name: 'Choose target', exact: true }));
      await expect
        .poll(async () => {
          const state = await measureState();
          return state.candidates.length;
        })
        .toBeGreaterThan(0);

      const catalog = await measureState();
      const requested = catalog.candidates.find((candidate) => candidate.label.includes('endpoint'))!;
      expect(requested).toBeDefined();
      await chooseByTyping('Choose target', requested.label);
      const chosen = await measureState();
      expect(chosen.activeCandidateId).toBe(requested.id);
      const selected = chosen.activeCandidateId;
      expect(selected).toBeTruthy();
      await target.focus(selectors.getByRole('button', { name: 'Lock target', exact: true }));
      await target.keyboardPress('Enter');
      await expect
        .poll(async () => {
          const state = await measureState();
          return state.lockedTargetId;
        })
        .toBe(selected);

      await target.screenshot(
        selectors.getByRole('dialog', { name: 'Measurement targets' }),
        `measure-target-chooser-${backend}.png`,
      );
      await target.focus(selectors.getByRole('button', { name: 'Use target', exact: true }));
      await target.keyboardPress('Enter');
      await expect
        .poll(async () => {
          const state = await measureState();
          return state.currentStart;
        })
        .toBeDefined();
      await toggleTargetControls();
      await target.keyboardPress('Escape');
      await expect
        .poll(async () => {
          const state = await measureState();
          return state.currentStart;
        })
        .toBeUndefined();
      const cancelled = await measureState();
      expect(cancelled.isMeasureActive).toBe(true);

      await target.screenshot(selectors.getByCss(previewCanvasSelector), `measure-tool-keyboard-target-${backend}.png`);
    });
  });
}

test('resolves CAD occurrence minimum through the browser AP242 worker', async () => {
  await openMeasureFixture('webgl', 'replicad.bench-vise');
  await target.evaluate(() => {
    const api = (globalThis as unknown as MeasureBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!api) {
      throw new Error('Section view e2e bridge is not installed.');
    }
    api.setCamera({ position: [0.0275, 0, 0.65], target: [0.0275, 0, 0.09], fov: 38, zoom: 1 });
  });
  await target.delay(900);
  await enableMeasure();
  await toggleTargetControls();
  await chooseByTyping('Feature filter', 'Bodies');
  await chooseByTyping('Measurement operation', 'Minimum distance');
  await target.focus(selectors.getByRole('combobox', { name: 'Choose target', exact: true }));
  await expect
    .poll(async () => {
      const state = await measureState();
      return state.candidates.length;
    })
    .toBeGreaterThanOrEqual(2);
  const catalog = await measureState();
  const frame = catalog.candidates.find((candidate) => candidate.label.startsWith('Frame:'));
  const carriage = catalog.candidates.find((candidate) => candidate.label.startsWith('Carriage:'));
  expect(frame, JSON.stringify(catalog.candidates)).toBeDefined();
  expect(carriage).toBeDefined();
  await chooseByTyping('Choose target', frame!.label);
  await target.click(selectors.getByRole('button', { name: 'Use target', exact: true }));
  await expect
    .poll(async () => {
      const state = await measureState();
      return state.currentStart;
    })
    .toBeDefined();
  await chooseByTyping('Choose target', carriage!.label);
  await target.click(selectors.getByRole('button', { name: 'Use target', exact: true }));
  await expect
    .poll(
      async () => {
        const state = await measureState();
        const result = state.measurements[0];
        return result !== undefined && result.status !== 'pending';
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  const completed = await measureState();
  const result = completed.measurements[0]!;
  expect(result).toMatchObject({ operation: 'minimum-distance', quality: 'cad', status: 'current' });
  // The separate native conformance fixture proves a 20 mm analytic gap; this exercises real viewer correspondence.
  expect(result.distance).toBeGreaterThan(0);
  expect(distanceBetween(result.startPoint, result.endPoint)).toBeCloseTo(result.distance, 6);
});

test('measures the chess board frame width as a mesh extent', async () => {
  await openMeasureFixture('webgl', 'openscad.cyber-chess-set');
  await target.evaluate(() => {
    const api = (globalThis as unknown as MeasureBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!api) {
      throw new Error('Section view e2e bridge is not installed.');
    }
    api.setCamera({ position: [0, 0, 0.75], target: [0, 0, 0.01], fov: 38, zoom: 1 });
  });
  await target.delay(900);
  await enableMeasure();
  await toggleTargetControls();
  await chooseByTyping('Feature filter', 'Bodies');
  await chooseByTyping('Measurement operation', 'X extent');
  await toggleTargetControls();
  await clickWorldPoint([0.119, 0, 0.012]);
  await expect
    .poll(async () => {
      const state = await measureState();
      return state.measurements[0];
    })
    .toMatchObject({ operation: 'extent-x', quality: 'mesh', status: 'current' });
  const completed = await measureState();
  // The main.scad steel frame is cube([244, 244, 8]) with a 224 mm square cutout.
  expect(completed.measurements[0]!.distance).toBeCloseTo(0.244, 6);
  await target.screenshot(selectors.getByCss(previewCanvasSelector), 'measure-chess-frame-244mm.png');
});
