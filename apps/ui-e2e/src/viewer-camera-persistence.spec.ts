import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/*
 * The orbit snap-back regression (incident 2026-11-06-viewer-orbit-snap-back, fixed by #1602).
 * About 250 ms after an orbit drag settles the view record saves its pose, and the store writes it
 * about 500 ms later. Before #1602 the store published that write back as a foreign edit, and the
 * sync hook adopted it once the camera had been quiet for 250 ms: the camera jumped back to where
 * drag 1 ended. Depending on when the echo lands that is after drag 2, or between two of its steps,
 * after which the rest of drag 2 orbits on from drag 1's pose. The rows mirror the bisect harness,
 * `viewer-orbit-snap-back-regression/repro.cjs` in Tau Brain, and assert both outcomes.
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
/** Lets the freshly opened fixture finish loading and framing before the first drag. */
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

/** Presses the button at the canvas centre, ready to drag. */
async function pressAt(center: { x: number; y: number }): Promise<void> {
  await target.mouseMove(center.x, center.y);
  await target.mouseDown();
}

/**
 * Moves a pressed pointer 120 px in discrete steps, so camera-controls sees a person's drag, not a
 * jump. The steps go in one command: each browser-mode command round trip costs far more than the
 * harness's 25 ms step, so pacing them from the test would stretch the drag several times over.
 */
async function dragFrom(center: { x: number; y: number }): Promise<void> {
  await target.mouseMove(center.x + dragDistancePixels, center.y, { steps: dragSteps });
}

function distance(first: Vector3, second: Vector3): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

test.describe('Viewer camera persistence', () => {
  test.each([200, 400, 700, 900])(
    'keeps the second orbit drag pose when drag 2 starts at least %i ms after drag 1 ends',
    async (gapMilliseconds) => {
      await openBirdhouseFixture();
      const center = await canvasCenter();

      await target.delay(quietBeforeRowMilliseconds);
      const beforeFirstDrag = await readCameraPose();
      await pressAt(center);
      await dragFrom(center);
      /* The gap runs from drag 1's last move to drag 2's press, on the test clock, so the command
       * round trips in between come out of the named gap instead of adding to it. Those round trips
       * alone can exceed the shortest gap, hence "at least"; the evidence records the achieved gap. */
      const firstDragMovedAt = performance.now();
      await target.mouseUp();
      const endOfFirstDrag = await readCameraPose();
      await target.mouseMove(center.x, center.y);
      await target.delay(Math.max(0, gapMilliseconds - (performance.now() - firstDragMovedAt)));
      await target.mouseDown();
      const achievedGapMilliseconds = Math.round(performance.now() - firstDragMovedAt);
      await dragFrom(center);
      await target.mouseUp();
      const endOfSecondDrag = await readCameraPose();
      await target.delay(settleAfterSecondDragMilliseconds);
      const settled = await readCameraPose();

      /* The viewer's controls are undamped, so a pose read after release is final. 1 cm is a noise
       * floor; a 120 px orbit of the birdhouse moves the camera about 25 cm. */
      const tolerance = 0.01;
      const firstArc = distance(endOfFirstDrag.position, beforeFirstDrag.position);
      const secondArc = distance(endOfSecondDrag.position, endOfFirstDrag.position);
      const evidence = JSON.stringify({
        gapMilliseconds,
        achievedGapMilliseconds,
        beforeFirstDrag,
        endOfFirstDrag,
        endOfSecondDrag,
        settled,
      });
      expect(firstArc, `the first drag should orbit the camera: ${evidence}`).toBeGreaterThan(tolerance);
      /* Both drags are the same azimuth-only gesture, so they must sweep the same arc. A snap-back
       * between two of drag 2's steps restarts it from drag 1's pose and shortens or lengthens it. */
      expect(
        Math.abs(secondArc - firstArc),
        `the second drag should sweep the same arc as the first, not restart from drag 1's pose: ${evidence}`,
      ).toBeLessThanOrEqual(tolerance);
      expect(
        distance(settled.position, endOfSecondDrag.position),
        `the camera should stay where drag 2 ended, not snap back toward drag 1: ${evidence}`,
      ).toBeLessThanOrEqual(tolerance);
      expect(
        distance(settled.target, endOfSecondDrag.target),
        `the orbit target should stay where drag 2 left it: ${evidence}`,
      ).toBeLessThanOrEqual(tolerance);
    },
    120_000,
  );
});
