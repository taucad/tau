import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

/*
 * The orbit snap-back regression (incident 2026-11-06-viewer-orbit-snap-back, fixed by #1602).
 * Once the camera has been quiet for 250 ms the view record saves its pose, and the store writes it
 * 500 ms later. Before #1602 the store published that write back as a foreign edit, and the sync
 * hook adopted it after the next 250 ms of camera quiet. On an idle camera that re-applies the pose
 * already shown, which is invisible. It shows only when drag 2's first camera change comes after
 * drag 1's pose is saved and before the echo lands, at least 750 ms after drag 1's last camera
 * change: the echo then snaps the camera back to where drag 1 ended, 250 ms after drag 2 stops.
 * The rows mirror the bisect harness, `viewer-orbit-snap-back-regression/repro.cjs` in Tau Brain.
 */

type Vector3 = readonly [number, number, number];

type CameraPose = Readonly<{
  position: Vector3;
  target: Vector3;
  quaternion: readonly [number, number, number, number];
  revision: number;
}>;

type PointerMark = Readonly<{ type: string; at: number; pose?: CameraPose }>;

type CameraBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    getCamera(): CameraPose;
  };
  __TAU_E2E_POINTER_MARKS__?: PointerMark[];
};

/** What the page saw of one pair of drags, on the page's own clock. */
type DragTimeline = Readonly<{
  firstDragMilliseconds: number;
  secondDragMilliseconds: number;
  /** From drag 1's last move to drag 2's first move. */
  gapMilliseconds: number;
  /** The longest wait between two moves of one drag; 250 ms of it would save a pose mid-drag. */
  longestPauseMilliseconds: number;
}>;

type DragPair = Readonly<{
  timeline: DragTimeline;
  beforeFirstDrag: CameraPose;
  endOfFirstDrag: CameraPose;
  endOfSecondDrag: CameraPose;
  settled: CameraPose;
}>;

const previewCanvasSelector = 'canvas[data-engine]';
const birdhouseFixtureRoute = '/__e2e/example-fixture?locator=replicad.birdhouse&graphicsBackend=webgl';
const dragDistancePixels = 120;
const dragSteps = 20;
/** `poseSettle` in `use-view-settings-sync.ts`: the camera quiet before a pose is saved or adopted. */
const poseSettleMilliseconds = 250;
/** `editDebounce` in `view-settings-sync-host.tsx`: the wait between a save and its write. */
const editDebounceMilliseconds = 500;
/**
 * The witness row: the shortest requested gap inside the snap window (more than `poseSettle`, less
 * than `poseSettle` plus `editDebounce`). The other rows assert the pose is kept but need not land
 * in the window: 200 ms is shorter than the settle, and 700 and 900 ms gain round trips past it.
 */
const witnessRowMilliseconds = 400;
/** Drag 2's last move must come more than this after drag 1's, measured from drag 1's last move. */
const secondDragEndAfterFirstMilliseconds = editDebounceMilliseconds;
/** The longest gap a witness retry may ask for: inside the window with margin for the press. */
const witnessRetryGapLimitMilliseconds = 650;
/** How many pairs a witness row may run to land one inside the window, as the harness's three reps. */
const witnessAttempts = 3;
/** Lets the page finish loading, or the previous pair's save and echo land, before a pair starts. */
const quietBeforePairMilliseconds = 2500;
/** The snap lands 250 ms after drag 2 stops; 1.5 s covers it with margin, as the harness did. */
const settleAfterSecondDragMilliseconds = 1500;
/** 1 cm is a noise floor; a 120 px orbit of the birdhouse moves the camera about 25 cm. */
const toleranceMeters = 0.01;

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

/**
 * Records every pointer event the page receives, before camera-controls handles it, and the pose at
 * each press. Reading drag 1's end pose at drag 2's press keeps a command round trip out of the gap.
 */
async function recordPointerMarks(): Promise<void> {
  await target.evaluate(() => {
    const page = globalThis as unknown as CameraBridgeWindow;
    const marks: PointerMark[] = [];
    page.__TAU_E2E_POINTER_MARKS__ = marks;
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
      page.addEventListener(
        type,
        () => {
          const pose = type === 'pointerdown' ? page.__TAU_SECTION_VIEW_TEST__?.getCamera() : undefined;
          marks.push({
            type,
            at: performance.now(),
            pose: pose && {
              position: pose.position,
              target: pose.target,
              quaternion: pose.quaternion,
              revision: pose.revision,
            },
          });
        },
        { capture: true },
      );
    }
  });
}

async function clearPointerMarks(): Promise<void> {
  await target.evaluate(() => {
    (globalThis as unknown as CameraBridgeWindow).__TAU_E2E_POINTER_MARKS__?.splice(0);
  });
}

async function readDragTimeline(): Promise<{ timeline: DragTimeline; secondPressPose: CameraPose }> {
  const marks = await target.evaluate(
    () => (globalThis as unknown as CameraBridgeWindow).__TAU_E2E_POINTER_MARKS__ ?? [],
  );
  const drags: PointerMark[][] = [];
  const presses: PointerMark[] = [];
  let current: PointerMark[] | undefined;
  for (const mark of marks) {
    if (mark.type === 'pointerdown') {
      presses.push(mark);
      current = [];
      drags.push(current);
    } else if (mark.type === 'pointerup') {
      current = undefined;
    } else if (current) {
      current.push(mark);
    }
  }

  const [first, second] = drags;
  const secondPressPose = presses[1]?.pose;
  if (drags.length !== 2 || !first?.length || !second?.length || !secondPressPose) {
    throw new Error(`Expected two drags with moves, saw: ${JSON.stringify(marks)}`);
  }

  const pauses = [first, second].flatMap((moves) => moves.slice(1).map((move, index) => move.at - moves[index]!.at));
  return {
    timeline: {
      firstDragMilliseconds: Math.round(first.at(-1)!.at - first[0]!.at),
      secondDragMilliseconds: Math.round(second.at(-1)!.at - second[0]!.at),
      gapMilliseconds: Math.round(second[0]!.at - first.at(-1)!.at),
      longestPauseMilliseconds: Math.round(Math.max(0, ...pauses)),
    },
    secondPressPose,
  };
}

/**
 * Whether a pair could have shown the snap with #1602 reverted: drag 2 started after drag 1's pose
 * was saved and before its echo could land; drag 2's last move came more than 500 ms after drag 1's,
 * so drag 2's own save (250 ms later) lands after drag 1's write was due and cannot replace it; and
 * no drag paused long enough to save a pose mid-drag.
 */
function isInSnapWindow(timeline: DragTimeline): boolean {
  return (
    timeline.gapMilliseconds > poseSettleMilliseconds &&
    timeline.gapMilliseconds < poseSettleMilliseconds + editDebounceMilliseconds &&
    timeline.gapMilliseconds + timeline.secondDragMilliseconds > secondDragEndAfterFirstMilliseconds &&
    timeline.longestPauseMilliseconds < poseSettleMilliseconds
  );
}

/**
 * Drags a pressed pointer 120 px to the right in 20 steps, so camera-controls sees a person's drag,
 * not a jump. The steps go in one command: a browser-mode command round trip costs far more than the
 * harness's 25 ms step, and a pause of 250 ms between commands would save a pose mid-drag.
 */
async function dragRightFrom(start: { x: number; y: number }): Promise<void> {
  await target.mouseMove(start.x + dragDistancePixels, start.y, { steps: dragSteps });
}

/** Two orbit drags with drag 2 pressed at least `gapMilliseconds` after drag 1's last move. */
async function runDragPair(center: { x: number; y: number }, gapMilliseconds: number): Promise<DragPair> {
  await target.delay(quietBeforePairMilliseconds);
  await clearPointerMarks();
  const beforeFirstDrag = await readCameraPose();
  await target.mouseMove(center.x, center.y);
  await target.mouseDown();
  await dragRightFrom(center);
  const firstDragMovedAt = performance.now();
  await target.mouseUp();
  /* Drag 2 starts where drag 1 released and drag 1's end pose is read in-page at drag 2's press,
   * so only the release and the press sit in the gap. Those round trips can exceed the shortest
   * gap, hence "at least"; the page clock records what was achieved. */
  await target.delay(Math.max(0, gapMilliseconds - (performance.now() - firstDragMovedAt)));
  await target.mouseDown();
  await dragRightFrom({ x: center.x + dragDistancePixels, y: center.y });
  /* Undamped controls, so the pose is final once the moves are in. Read before release: the
   * adoption fires 250 ms after this last move, so a later read could already see the snapped
   * pose and mistake it for where drag 2 ended. */
  const endOfSecondDrag = await readCameraPose();
  await target.mouseUp();
  /* Back to the centre for the next pair, outside every gap. */
  await target.mouseMove(center.x, center.y);
  await target.delay(settleAfterSecondDragMilliseconds);
  const settled = await readCameraPose();
  const { timeline, secondPressPose } = await readDragTimeline();
  return { timeline, beforeFirstDrag, endOfFirstDrag: secondPressPose, endOfSecondDrag, settled };
}

function distance(first: Vector3, second: Vector3): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

function expectSecondDragPoseKept(pair: DragPair, gapMilliseconds: number): void {
  const { beforeFirstDrag, endOfFirstDrag, endOfSecondDrag, settled } = pair;
  const firstArc = distance(endOfFirstDrag.position, beforeFirstDrag.position);
  const secondArc = distance(endOfSecondDrag.position, endOfFirstDrag.position);
  const evidence = JSON.stringify({ gapMilliseconds, ...pair });
  expect(firstArc, `the first drag should orbit the camera: ${evidence}`).toBeGreaterThan(toleranceMeters);
  /* Both drags are the same azimuth-only gesture, so they must sweep the same arc. A backstop: an
   * adoption that lands before the end-of-drag-2 read shows as no arc at all. */
  expect(
    Math.abs(secondArc - firstArc),
    `the second drag should sweep the same arc as the first: ${evidence}`,
  ).toBeLessThanOrEqual(toleranceMeters);
  expect(
    distance(settled.position, endOfSecondDrag.position),
    `the camera should stay where drag 2 ended, not snap back toward drag 1: ${evidence}`,
  ).toBeLessThanOrEqual(toleranceMeters);
  expect(
    distance(settled.target, endOfSecondDrag.target),
    `the orbit target should stay where drag 2 left it: ${evidence}`,
  ).toBeLessThanOrEqual(toleranceMeters);
}

test.describe('Viewer camera persistence', () => {
  test.for([200, 400, 700, 900])(
    'keeps the second orbit drag pose when drag 2 starts at least %i ms after drag 1 ends',
    { timeout: 180_000 },
    async (gapMilliseconds, { annotate }) => {
      await openBirdhouseFixture();
      const center = await canvasCenter();
      await recordPointerMarks();

      const isWitnessRow = gapMilliseconds === witnessRowMilliseconds;
      const timelines: DragTimeline[] = [];
      let requestedGapMilliseconds = gapMilliseconds;
      /* oxlint-disable no-await-in-loop -- Each pair needs the page quiet after the one before. */
      for (let attempt = 1; attempt <= (isWitnessRow ? witnessAttempts : 1); attempt += 1) {
        const pair = await runDragPair(center, requestedGapMilliseconds);
        timelines.push(pair.timeline);
        expectSecondDragPoseKept(pair, gapMilliseconds);
        if (isInSnapWindow(pair.timeline)) {
          break;
        }

        /* On a fast host drag 2 can end too soon after drag 1 for its save to miss drag 1's write.
         * Ask for a longer gap next time, still inside the window, so the drags end far enough apart. */
        const shortfall =
          secondDragEndAfterFirstMilliseconds - (pair.timeline.gapMilliseconds + pair.timeline.secondDragMilliseconds);
        if (shortfall >= 0) {
          requestedGapMilliseconds = Math.min(
            witnessRetryGapLimitMilliseconds,
            requestedGapMilliseconds + shortfall + 50,
          );
        }
      }
      /* oxlint-enable no-await-in-loop */

      await annotate(`drag timelines (page clock): ${JSON.stringify(timelines)}`);
      if (isWitnessRow) {
        expect(
          timelines.some((timeline) => isInSnapWindow(timeline)),
          `one pair should land in the snap window, or this row proves nothing: ${JSON.stringify(timelines)}`,
        ).toBe(true);
      }
    },
  );
});
