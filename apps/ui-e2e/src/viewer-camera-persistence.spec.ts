import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { TargetSurface } from '#support/external-target.js';

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
  lastChangeSource?: string;
}>;

type PointerMark = Readonly<{ type: string; at: number; pose?: CameraPose }>;

type CameraBridgeWindow = Window & {
  __TAU_SECTION_VIEW_TEST__?: {
    getCamera(): CameraPose & { lastChangeSource: string };
    getViewSettings(): { cameraView?: unknown } | undefined;
    getModelComponents(): Array<{ id: string }>;
    projectModelComponent(componentId: string): Array<{ x: number; y: number; visible: boolean }>;
    getModelHoverState(): { hoveredComponentId: string | undefined };
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
/** The camera's `cameraPoseSettleMilliseconds`: the quiet after a release before an adoption applies again. */
const poseSettleMilliseconds = 250;
/** `viewRecordEditDebounce` in `view-record-session.ts`: the wait between a save and its write. */
const editDebounceMilliseconds = 500;
/**
 * The witness row: the shortest requested gap inside the snap window (more than `poseSettle`, less
 * than `poseSettle` plus `editDebounce`). The other rows assert the pose is kept but need not land
 * in the window: 200 ms is shorter than the settle, and 700 and 900 ms gain round trips past it.
 */
const witnessRowMilliseconds = 400;
/** Drag 2's last move must come more than this after drag 1's, measured from drag 1's last move. */
const secondDragEndAfterFirstMilliseconds = editDebounceMilliseconds;
/** A witness retry aims its achieved gap at the middle of the snap window, 250 to 750 ms. */
const witnessTargetGapMilliseconds = poseSettleMilliseconds + editDebounceMilliseconds / 2;
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

async function readCameraPose(surface?: TargetSurface): Promise<CameraPose> {
  return target.evaluate(
    () => {
      const bridge = (globalThis as unknown as CameraBridgeWindow).__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('Section view e2e bridge is not installed.');
      }

      const { position, target: orbitTarget, quaternion, revision, lastChangeSource } = bridge.getCamera();
      return { position, target: orbitTarget, quaternion, revision, lastChangeSource };
    },
    undefined,
    surface,
  );
}

async function canvasCenter(surface?: TargetSurface): Promise<{ x: number; y: number }> {
  const canvas = selectors.getByCss(previewCanvasSelector).first();
  const box = await target.boundingBox(canvas, surface);
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

function expectSecondDragPoseKept(pair: DragPair, requestedGapMilliseconds: number): void {
  const { beforeFirstDrag, endOfFirstDrag, endOfSecondDrag, settled } = pair;
  const firstArc = distance(endOfFirstDrag.position, beforeFirstDrag.position);
  const secondArc = distance(endOfSecondDrag.position, endOfFirstDrag.position);
  const evidence = JSON.stringify({ requestedGapMilliseconds, ...pair });
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
    'keeps the second orbit drag pose with a %i ms gap requested between the drags',
    { timeout: 180_000 },
    async (gapMilliseconds, { annotate }) => {
      await openBirdhouseFixture();
      const center = await canvasCenter();
      await recordPointerMarks();

      const isWitnessRow = gapMilliseconds === witnessRowMilliseconds;
      const attempts: Array<{ requestedGapMilliseconds: number; timeline: DragTimeline }> = [];
      const timelines = (): DragTimeline[] => attempts.map(({ timeline }) => timeline);
      let requestedGapMilliseconds = gapMilliseconds;
      /* oxlint-disable no-await-in-loop -- Each pair needs the page quiet after the one before. */
      try {
        for (let attempt = 1; attempt <= (isWitnessRow ? witnessAttempts : 1); attempt += 1) {
          const pair = await runDragPair(center, requestedGapMilliseconds);
          attempts.push({ requestedGapMilliseconds, timeline: pair.timeline });
          expectSecondDragPoseKept(pair, requestedGapMilliseconds);
          if (isInSnapWindow(pair.timeline)) {
            break;
          }

          /* Steer the next pair's achieved gap toward the middle of the window. Raising it fixes a fast
           * host's short gap, or a drag 2 under 50 ms that would end the drags too close together.
           * Lowering it removes only requested delay above the release round trip: when the release and
           * press round trips alone reach 750 ms, every pair misses and the row fails as proving nothing. */
          const targetGapMilliseconds = Math.max(
            witnessTargetGapMilliseconds,
            secondDragEndAfterFirstMilliseconds + 50 - pair.timeline.secondDragMilliseconds,
          );
          requestedGapMilliseconds = Math.max(
            0,
            requestedGapMilliseconds + targetGapMilliseconds - pair.timeline.gapMilliseconds,
          );
        }
      } finally {
        /* Annotated on red runs too: the attempts show a product regression from a lost witness. */
        await annotate(`drag attempts (page clock): ${JSON.stringify(attempts)}`);
      }
      /* oxlint-enable no-await-in-loop */

      if (isWitnessRow) {
        expect(
          timelines().some((timeline) => isInSnapWindow(timeline)),
          `one pair should land in the snap window, or this row proves nothing: ${JSON.stringify(attempts)}`,
        ).toBe(true);
      }
    },
  );
});

/** A save's write and the other window's watch answer well inside this. */
const crossWindowMilliseconds = 15_000;

/** Polls a surface's camera until `accept` holds, and returns the pose it accepted. */
async function pollCameraPose(
  accept: (pose: CameraPose) => boolean,
  surface?: TargetSurface,
  timeout = crossWindowMilliseconds,
): Promise<CameraPose> {
  let last: CameraPose | undefined;
  await expect
    .poll(
      async () => {
        last = await readCameraPose(surface);
        return accept(last);
      },
      { timeout, interval: 100 },
    )
    .toBe(true);
  return last!;
}

/** Whether the view's record holds a saved camera pose. */
async function hasSavedPose(): Promise<boolean> {
  return target.evaluate(
    () =>
      (globalThis as unknown as CameraBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getViewSettings()?.cameraView !==
      undefined,
  );
}

/** Moves the camera toward its target, so a later fit or focus visibly moves it back. */
async function zoomIn(): Promise<void> {
  await target.evaluate(() => {
    const bridge = (
      globalThis as unknown as {
        __TAU_SECTION_VIEW_TEST__?: {
          getCamera(): { position: readonly [number, number, number]; target: readonly [number, number, number] };
          setCamera(camera: { position: readonly number[]; target: readonly number[] }): void;
        };
      }
    ).__TAU_SECTION_VIEW_TEST__;
    const camera = bridge?.getCamera();
    if (bridge && camera) {
      const { position, target: orbitTarget } = camera;
      bridge.setCamera({
        position: position.map((value, axis) => orbitTarget[axis]! + (value - orbitTarget[axis]!) * 0.4),
        target: orbitTarget,
      });
    }
  });
}

/** A point on screen over a part: a projected point of the model the pointer's raycast confirms. */
async function partHitPoint(): Promise<{ x: number; y: number }> {
  const points = await target.evaluate(() => {
    const bridge = (globalThis as unknown as CameraBridgeWindow).__TAU_SECTION_VIEW_TEST__;
    return (bridge?.getModelComponents() ?? [])
      .flatMap(({ id }) => bridge?.projectModelComponent(id) ?? [])
      .filter((point) => point.visible);
  });
  const step = Math.max(1, Math.floor(points.length / 12));
  for (let index = 0; index < points.length; index += step) {
    const point = points[index]!;
    // oxlint-disable-next-line no-await-in-loop -- each point is hovered and checked before the next.
    await target.mouseMove(point.x, point.y);
    // oxlint-disable-next-line no-await-in-loop -- the hover answers a frame later.
    await target.delay(150);
    // oxlint-disable-next-line no-await-in-loop -- the raycast confirms the point before the next is tried.
    const hovered = await target.evaluate(
      () =>
        (globalThis as unknown as CameraBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getModelHoverState()
          .hoveredComponentId,
    );
    if (hovered !== undefined) {
      return point;
    }
  }
  throw new Error(`No projected point of the model is over a part: ${JSON.stringify(points.slice(0, 12))}`);
}

/** Polls until the camera stands within the tolerance of `expected`, after a reload restores it. */
async function pollRestoredTo(expected: CameraPose): Promise<CameraPose> {
  return pollCameraPose((pose) => distance(pose.position, expected.position) <= toleranceMeters);
}

/** Opens the same project in a second window, which shows the same view and follows its record. */
async function openSecondWindow(): Promise<{ x: number; y: number }> {
  await target.openSecondary(await target.currentUrl());
  await target.setViewport({ width: 1400, height: 900 }, 'secondary');
  await target.expectVisible(selectors.getByCss(previewCanvasSelector), 60_000, 'secondary');
  await target.waitFor(
    () => {
      const bridges = (
        globalThis as typeof globalThis & {
          __TAU_SECTION_VIEW_TEST_BRIDGES__?: ReadonlyArray<{ isGeometryFramed(): boolean }>;
        }
      ).__TAU_SECTION_VIEW_TEST_BRIDGES__;
      return Boolean(bridges && bridges.length > 0 && bridges.every((bridge) => bridge.isGeometryFramed()));
    },
    undefined,
    { surface: 'secondary', timeout: 60_000 },
  );
  return canvasCenter('secondary');
}

/** An orbit drag in one window, released. */
async function orbit(center: { x: number; y: number }, surface?: TargetSurface): Promise<void> {
  await target.mouseMove(center.x, center.y, undefined, surface);
  await target.mouseDown(undefined, surface);
  await target.mouseMove(center.x + dragDistancePixels, center.y, { steps: dragSteps }, surface);
  await target.mouseUp(undefined, surface);
}

/*
 * The view record's owners after G6b (charter D15, D20): another window's edit reaches this one through
 * the record's watch, and the camera adopts it while idle but drops it during a drag. Only a person's
 * camera change is saved, so Fit view survives a reload and the first automatic frame does not.
 */
test.describe('Viewer camera persistence across windows and reloads', () => {
  test('adopts a pose orbited in a second window while this one is idle', { timeout: 180_000 }, async () => {
    await openBirdhouseFixture();
    const before = await readCameraPose();
    const secondCenter = await openSecondWindow();
    try {
      await orbit(secondCenter, 'secondary');
      const orbited = await pollCameraPose(
        (pose) => distance(pose.position, before.position) > toleranceMeters,
        'secondary',
      );
      const adopted = await pollCameraPose((pose) => distance(pose.position, orbited.position) <= toleranceMeters);
      expect(adopted.lastChangeSource, JSON.stringify({ before, orbited, adopted })).toBe('persisted');
    } finally {
      await target.closeSecondary();
    }
  });

  test(
    "drops a second window's pose that arrives during a drag and saves the drag's pose (D15)",
    { timeout: 180_000 },
    async () => {
      await openBirdhouseFixture();
      const center = await canvasCenter();
      const secondCenter = await openSecondWindow();
      let held: CameraPose | undefined;
      try {
        await target.mouseMove(center.x, center.y);
        await target.mouseDown();
        await dragRightFrom(center);
        held = await readCameraPose();
        const dragPose = held;
        /* The other window orbits the other way and its write lands while this drag is held. */
        await target.mouseMove(secondCenter.x, secondCenter.y, undefined, 'secondary');
        await target.mouseDown(undefined, 'secondary');
        await target.mouseMove(secondCenter.x - dragDistancePixels, secondCenter.y, { steps: dragSteps }, 'secondary');
        await target.mouseUp(undefined, 'secondary');
        const foreign = await readCameraPose('secondary');
        await target.delay(poseSettleMilliseconds + editDebounceMilliseconds + 2500);
        const stillHeld = await readCameraPose();
        expect(
          distance(stillHeld.position, held.position),
          `the held drag should keep its pose: ${JSON.stringify({ held, foreign, stillHeld })}`,
        ).toBeLessThanOrEqual(toleranceMeters);
        await target.mouseUp();
        /* The drag's pose is saved, and the other window follows it. */
        await pollCameraPose((pose) => distance(pose.position, dragPose.position) <= toleranceMeters, 'secondary');
        await target.delay(quietBeforePairMilliseconds);
        const released = await readCameraPose();
        expect(distance(released.position, dragPose.position)).toBeLessThanOrEqual(toleranceMeters);
      } finally {
        await target.closeSecondary();
      }

      await target.reload();
      await target.expectGeometryFramed();
      await pollRestoredTo(held);
    },
  );

  test(
    'keeps Fit view over a reload and does not save the first automatic frame (D20)',
    { timeout: 180_000 },
    async () => {
      await openBirdhouseFixture();
      await target.delay(quietBeforePairMilliseconds);
      /* The first frame is automatic: a reload frames the model again rather than restoring a saved pose. */
      await target.reload();
      await target.expectGeometryFramed();
      await target.delay(quietBeforePairMilliseconds);
      expect(await hasSavedPose(), 'the first automatic frame should not be saved').toBe(false);

      const center = await canvasCenter();
      await orbit(center);
      /* Zoomed in first, so Fit view moves the camera: an orbit alone keeps the fitted distance. */
      await zoomIn();
      const zoomed = await readCameraPose();
      await target.click(selectors.getByRole('button', { name: 'Fit view' }).first());
      const fitted = await pollCameraPose((pose) => pose.lastChangeSource === 'fit');
      expect(
        distance(fitted.position, zoomed.position),
        `Fit view should move the camera, or this row proves nothing: ${JSON.stringify({ zoomed, fitted })}`,
      ).toBeGreaterThan(toleranceMeters);
      await expect.poll(hasSavedPose, { timeout: crossWindowMilliseconds }).toBe(true);
      await target.delay(poseSettleMilliseconds + editDebounceMilliseconds + 1500);
      const settled = await readCameraPose();
      await target.reload();
      await target.expectGeometryFramed();
      await pollRestoredTo(settled);
    },
  );

  test('keeps a focus on a part over a reload (D20)', { timeout: 180_000 }, async () => {
    await openBirdhouseFixture();
    /* The birdhouse is one part, so its focus frames the whole model: zoomed in first, the focus moves the camera. */
    await zoomIn();
    const before = await readCameraPose();
    const part = await partHitPoint();
    /* The part under the pointer, from its menu: the person's focus, one change with the source `focus`. */
    await target.mouseClick(part.x, part.y, { button: 'right' });
    await target.click(selectors.getByRole('menuitem', { name: 'Focus on part' }).first());
    const focused = await pollCameraPose((pose) => pose.lastChangeSource === 'focus');
    expect(
      distance(focused.position, before.position),
      `the focus should move the camera, or this row proves nothing: ${JSON.stringify({ before, focused })}`,
    ).toBeGreaterThan(toleranceMeters);
    await expect.poll(hasSavedPose, { timeout: crossWindowMilliseconds }).toBe(true);
    await target.delay(poseSettleMilliseconds + editDebounceMilliseconds + 1500);
    const settled = await readCameraPose();
    await target.reload();
    await target.expectGeometryFramed();
    await pollRestoredTo(settled);
  });

  test('does not save an automatic refit after the model changes (D20)', { timeout: 240_000 }, async () => {
    await openBirdhouseFixture();
    await target.delay(quietBeforePairMilliseconds);
    const before = await readCameraPose();
    await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
    await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), 'Open parameters');
    await target.click(selectors.getByText('Open parameters', { exact: true }));
    const width = selectors.getByLabelText('Input for Width', { exact: true }).first();
    await target.expectVisible(width, 60_000);
    /* Three times as wide: the bounds grow past the refit ratio, so framing refits the camera on its own. */
    await target.fill(width, '360');
    await target.press(width, 'Enter');
    const refitted = await pollCameraPose(
      (pose) => pose.revision > before.revision && pose.lastChangeSource === 'framing',
      undefined,
      120_000,
    );
    expect(
      distance(refitted.position, before.position),
      `the refit should move the camera, or this row proves nothing: ${JSON.stringify({ before, refitted })}`,
    ).toBeGreaterThan(toleranceMeters);
    await target.delay(poseSettleMilliseconds + editDebounceMilliseconds + 2500);
    expect(await hasSavedPose(), 'an automatic refit should not be saved').toBe(false);
  });
});
