import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/*
 * The orbit snap-back regression (incident 2026-11-06-viewer-orbit-snap-back, fixed by #1602).
 * Two quick orbit drags: about 250 ms after the first drag settles the view record saves its pose,
 * and before #1602 the store published that save back as a foreign edit, which the sync hook
 * applied once the second drag settled. The camera then jumped back to where drag 1 ended.
 * The rows mirror the bisect harness, `viewer-orbit-snap-back-regression/repro.cjs` in Tau Brain.
 */

type Vector3 = readonly [number, number, number];

type CameraPose = Readonly<{
  position: Vector3;
  target: Vector3;
  quaternion: readonly [number, number, number, number];
  revision: number;
}>;

type CameraBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    getCamera(): CameraPose;
  };
};

const previewCanvasSelector = 'canvas[data-engine]';
const birdhouseFixtureRoute = '/__e2e/example-fixture?locator=replicad.birdhouse&graphicsBackend=webgl';
const dragDistancePixels = 120;
const dragSteps = 20;
const dragStepMilliseconds = 25;
/** Long enough for an earlier drag's pose save and its watch echoes to finish before a row starts. */
const quietBeforeRowMilliseconds = 2500;
/** The snap landed about 250 ms after drag 2 settled; 1.5 s covers it with margin, as the harness did. */
const settleAfterSecondDragMilliseconds = 1500;

async function openBirdhouseFixture(): Promise<void> {
  await target.setViewport({ width: 1400, height: 900 });
  await target.navigate(birdhouseFixtureRoute);
  await target.expectVisible(selectors.getByCss(previewCanvasSelector), 60_000);
  await target.expectGeometryFramed();
}

async function readCameraPose(): Promise<CameraPose> {
  return target.evaluate(() => {
    const bridge = (globalThis as unknown as CameraBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    if (!bridge) {
      throw new Error('Section view e2e bridge is not installed.');
    }

    const { position, target: orbitTarget, quaternion, revision } = bridge.getCamera();
    return { position, target: orbitTarget, quaternion, revision };
  });
}

async function canvasCenter(): Promise<{ x: number; y: number }> {
  const canvas = selectors.getByCss(previewCanvasSelector).first();
  const box = await target.boundingBox(canvas);
  if (!box) {
    throw new Error('The preview canvas has no bounding box.');
  }

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** One orbit drag, moved in discrete steps so camera-controls sees a person's drag, not a jump. */
async function orbitDrag(center: { x: number; y: number }): Promise<void> {
  await target.mouseMove(center.x, center.y);
  await target.mouseDown();
  /* oxlint-disable no-await-in-loop -- A drag is an ordered pointer stream with a pause between moves. */
  for (let step = 1; step <= dragSteps; step += 1) {
    await target.mouseMove(center.x + (dragDistancePixels * step) / dragSteps, center.y);
    await target.delay(dragStepMilliseconds);
  }
  /* oxlint-enable no-await-in-loop */

  await target.mouseUp();
}

function distance(first: Vector3, second: Vector3): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

test.describe('Viewer camera persistence', () => {
  test.each([200, 400, 700, 900])(
    'keeps the second orbit drag pose after a %i ms gap between drags',
    async (gapMilliseconds) => {
      await openBirdhouseFixture();
      const center = await canvasCenter();

      await target.delay(quietBeforeRowMilliseconds);
      const beforeFirstDrag = await readCameraPose();
      await orbitDrag(center);
      const endOfFirstDrag = await readCameraPose();
      expect(
        distance(endOfFirstDrag.position, beforeFirstDrag.position),
        'the first drag should orbit the camera',
      ).toBeGreaterThan(0);

      await target.delay(gapMilliseconds);
      await orbitDrag(center);
      const endOfSecondDrag = await readCameraPose();
      await target.delay(settleAfterSecondDragMilliseconds);
      const settled = await readCameraPose();

      /* The harness's snap threshold: 1% of the orbit radius, at least 1 cm. It absorbs the
       * controls' own settle after the button is released; a snap back to drag 1 moves far more. */
      const tolerance = 0.01 * Math.max(1, Math.hypot(...beforeFirstDrag.position));
      const evidence = JSON.stringify({ beforeFirstDrag, endOfFirstDrag, endOfSecondDrag, settled });
      expect(
        distance(settled.position, endOfSecondDrag.position),
        `the camera should stay where drag 2 ended, not snap back toward drag 1: ${evidence}`,
      ).toBeLessThanOrEqual(tolerance);
      expect(
        distance(settled.target, endOfSecondDrag.target),
        `the orbit target should not move: ${evidence}`,
      ).toBeLessThanOrEqual(tolerance);
    },
    120_000,
  );
});
