import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/*
 * The orbit snap-back regression (incident 2026-11-06-viewer-orbit-snap-back, fixed by #1602).
 * About 250 ms after an orbit drag settles the view record saves its pose, and the store writes it
 * about 500 ms later. Before #1602 the store published that write back as a foreign edit, and the
 * sync hook adopted it once the camera had been quiet for 250 ms, which is 250 ms after drag 2's
 * last move: the camera jumped back to where drag 1 ended. The echo only exists when drag 2 starts
 * before it lands, about 750 ms after drag 1's last move. The rows mirror the bisect harness,
 * `viewer-orbit-snap-back-regression/repro.cjs` in Tau Brain.
 */

type Vector3 = readonly [number, number, number];

type CameraPose = Readonly<{
  position: Vector3;
  target: Vector3;
  quaternion: readonly [number, number, number, number];
  revision: number;
}>;

type PointerMark = Readonly<{ type: string; at: number }>;

type CameraBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    getCamera(): CameraPose;
  };
  __TAU_E2E_POINTER_MARKS__?: PointerMark[];
};

/** What the page saw of the two drags, on the page's own clock. */
type DragTimeline = Readonly<{
  firstDragMilliseconds: number;
  secondDragMilliseconds: number;
  /** From drag 1's last move to drag 2's first move: how long the echo had to land before drag 2. */
  gapMilliseconds: number;
}>;

const previewCanvasSelector = 'canvas[data-engine]';
const birdhouseFixtureRoute = '/__e2e/example-fixture?locator=replicad.birdhouse&graphicsBackend=webgl';
const dragDistancePixels = 120;
/** 20 steps, as the harness, sent as 4 commands of 5 so the drag stays about as long as a person's. */
const dragCommands = 4;
const stepsPerCommand = 5;
/** Drag 1's save echo lands about 750 ms (250 ms settle plus 500 ms write debounce) after its last move. */
const echoAfterFirstDragMilliseconds = 750;
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

/** Records every pointer event the page receives, before camera-controls handles it. */
async function recordPointerMarks(): Promise<void> {
  await target.evaluate(() => {
    const page = globalThis as unknown as CameraBridgeWindow;
    const marks: PointerMark[] = [];
    page.__TAU_E2E_POINTER_MARKS__ = marks;
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
      page.addEventListener(
        type,
        () => {
          marks.push({ type, at: performance.now() });
        },
        { capture: true },
      );
    }
  });
}

async function readDragTimeline(): Promise<DragTimeline> {
  const marks = await target.evaluate(
    () => (globalThis as unknown as CameraBridgeWindow).__TAU_E2E_POINTER_MARKS__ ?? [],
  );
  const drags: PointerMark[][] = [];
  let current: PointerMark[] | undefined;
  for (const mark of marks) {
    if (mark.type === 'pointerdown') {
      current = [];
      drags.push(current);
    } else if (mark.type === 'pointerup') {
      current = undefined;
    } else if (current) {
      current.push(mark);
    }
  }

  const [first, second] = drags;
  if (drags.length !== 2 || !first?.length || !second?.length) {
    throw new Error(`Expected two drags with moves, saw: ${JSON.stringify(marks)}`);
  }

  return {
    firstDragMilliseconds: Math.round(first.at(-1)!.at - first[0]!.at),
    secondDragMilliseconds: Math.round(second.at(-1)!.at - second[0]!.at),
    gapMilliseconds: Math.round(second[0]!.at - first.at(-1)!.at),
  };
}

/**
 * Drags a pressed pointer 120 px to the right in discrete steps, so camera-controls sees a person's
 * drag, not a jump. Every browser-mode command round trip costs far more than the harness's 25 ms
 * step, so the 20 steps go as a few multi-step commands instead of one command each.
 */
async function dragRightFrom(start: { x: number; y: number }): Promise<void> {
  /* oxlint-disable no-await-in-loop -- A drag is an ordered pointer stream. */
  for (let command = 1; command <= dragCommands; command += 1) {
    await target.mouseMove(start.x + (dragDistancePixels * command) / dragCommands, start.y, {
      steps: stepsPerCommand,
    });
  }
  /* oxlint-enable no-await-in-loop */
}

function distance(first: Vector3, second: Vector3): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

test.describe('Viewer camera persistence', () => {
  test.for([200, 400, 700, 900])(
    'keeps the second orbit drag pose when drag 2 starts at least %i ms after drag 1 ends',
    { timeout: 120_000 },
    async (gapMilliseconds, { annotate }) => {
      await openBirdhouseFixture();
      const center = await canvasCenter();
      await recordPointerMarks();

      await target.delay(quietBeforeRowMilliseconds);
      const beforeFirstDrag = await readCameraPose();
      await target.mouseMove(center.x, center.y);
      await target.mouseDown();
      await dragRightFrom(center);
      /* Undamped controls: once the last move's command returns, the pose is final. Reading it while
       * the button is still down keeps the read out of the gap. */
      const firstDragMovedAt = performance.now();
      const endOfFirstDrag = await readCameraPose();
      await target.mouseUp();
      /* Drag 2 starts where drag 1 released, so no pointer move sits in the gap. The round trips that
       * remain can exceed the shortest gap, hence "at least"; the page clock records what was achieved. */
      await target.delay(Math.max(0, gapMilliseconds - (performance.now() - firstDragMovedAt)));
      await target.mouseDown();
      const secondDragStart = { x: center.x + dragDistancePixels, y: center.y };
      await dragRightFrom(secondDragStart);
      /* Read before release: the adoption fires 250 ms after this last move, so a later read could
       * already see the snapped pose and mistake it for where drag 2 ended. */
      const endOfSecondDrag = await readCameraPose();
      await target.mouseUp();
      await target.delay(settleAfterSecondDragMilliseconds);
      const settled = await readCameraPose();
      const timeline = await readDragTimeline();
      await annotate(`drag timeline (page clock): ${JSON.stringify(timeline)}`);

      /* 1 cm is a noise floor; a 120 px orbit of the birdhouse moves the camera about 25 cm. */
      const tolerance = 0.01;
      const firstArc = distance(endOfFirstDrag.position, beforeFirstDrag.position);
      const secondArc = distance(endOfSecondDrag.position, endOfFirstDrag.position);
      const evidence = JSON.stringify({
        gapMilliseconds,
        timeline,
        beforeFirstDrag,
        endOfFirstDrag,
        endOfSecondDrag,
        settled,
      });
      if (gapMilliseconds < echoAfterFirstDragMilliseconds - 300) {
        /* These rows are the witness: drag 2 must be under way before drag 1's echo lands, or the
         * row could not go red with the regression present. */
        expect(
          timeline.gapMilliseconds,
          `drag 2 should start before drag 1's save echo lands, or this row proves nothing: ${evidence}`,
        ).toBeLessThan(echoAfterFirstDragMilliseconds);
      }
      expect(firstArc, `the first drag should orbit the camera: ${evidence}`).toBeGreaterThan(tolerance);
      /* Both drags are the same azimuth-only gesture, so they must sweep the same arc. This is a
       * backstop: an adoption that lands before the end-of-drag-2 read shows as no arc at all. */
      expect(
        Math.abs(secondArc - firstArc),
        `the second drag should sweep the same arc as the first: ${evidence}`,
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
  );
});
