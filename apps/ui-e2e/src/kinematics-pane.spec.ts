import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { expect, inject, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import {
  expectedMotionLinkDisplacements,
  getMovingMotionComponentIds,
  invertMotionMatrix,
  multiplyMotionMatrices,
  motionResourceSignature,
  getMotionBodyCandidate,
  verifyDrainedMotionActivity,
  verifyNoMotionThumbnailJobs,
  installMotionExactWorkerObservation,
  expectedMotionSourceCorners,
  transformMotionPoint,
} from '#support/parts-assemblies-motion.js';
import type {
  AssemblyTestBridgeApi,
  MotionActivityObservation,
  MotionHeadlessRecord,
  MotionBrowserWindow,
  MotionDrawObservation,
  MotionExactObservationWindow,
  MotionNativeOracleInput,
} from '#support/parts-assemblies-motion.js';

type Vector = readonly [number, number, number];
type ScreenPoint = Readonly<{ x: number; y: number }>;
type CameraPose = Readonly<{ position: Vector; quaternion: readonly [number, number, number, number] }>;

type KinematicsTestState = Readonly<{
  coordinates: Readonly<Record<string, number>>;
  revision: number;
  playback: Readonly<{
    status: 'stopped' | 'playing' | 'paused';
    animationId: string | undefined;
    time: number;
    speed: number;
  }>;
  drag?: Readonly<{ componentId: string; link: string; status: 'solved' | 'blocked'; reason?: string }>;
  atLimit: readonly string[];
}>;

type KinematicsBridgeWindow = typeof globalThis & {
  __TAU_KINEMATICS_TEST__?: {
    getState(unitId: string): KinematicsTestState | undefined;
    getComponentWorldMatrix(unitId: string, componentId: string): number[] | undefined;
    projectComponent(unitId: string, componentId: string): ScreenPoint | undefined;
  };
  __TAU_SECTION_VIEW_TEST__?: {
    getCamera(): CameraPose;
    getModelHoverState(): { hoveredComponentId: string | undefined };
    projectModelComponent(componentId: string): Array<{ x: number; y: number; visible: boolean }>;
  };
};

/** Every fixture's entry file is one model-interaction unit. */
const unitId = 'file:main.ts';

const planetary = {
  locator: 'replicad.planetary-gear-system',
  ring: 'component:internal-ring-gear',
  sun: 'component:sun-gear-and-input-shaft',
  carrier: 'component:carrier-front-and-output-hub',
  planet: 'component:planet-gear-1',
  links: [
    'component:internal-ring-gear',
    'component:sun-gear-and-input-shaft',
    'component:carrier-front-and-output-hub',
    'component:planet-gear-1',
    'component:planet-gear-2',
    'component:planet-gear-3',
  ],
  /** Planet 1 pin as built, in model millimetres: (sun + planet teeth) × module / 2 = 48 along +X. */
  planetPin: [48, 0, 0],
} as const;

const arm = {
  locator: 'replicad.six-axis-arm',
  base: 'component:base-pedestal',
  tool: 'component:tool-flange',
  /** The tool-flange joint origin at home, in model millimetres: (reach / 2 + 70, 0, height + reach / 2). */
  flangeOrigin: [350, 0, 580],
} as const;

const wormGear = {
  locator: 'replicad.worm-gear-system',
  worm: 'component:single-start-worm',
  wheel: 'component:bronze-wheel-30-teeth',
  wheelTeeth: 30,
} as const;

/** The bridge reports GLB space: the kernel maps model (x, y, z) millimetres, Z-up, to (x, z, −y) metres, Y-up. */
const toGlbDirection = ([x, y, z]: Vector): Vector => [x, z, -y];
const toGlbPoint = ([x, y, z]: Vector): Vector => [x / 1000, z / 1000, -y / 1000];
const modelX = toGlbDirection([1, 0, 0]);
const modelY = toGlbDirection([0, 1, 0]);
const modelZ = toGlbDirection([0, 0, 1]);
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

/** Column-major 4×4 rotation part applied to a direction. */
const rotate = (matrix: readonly number[], [x, y, z]: Vector): Vector => [
  matrix[0]! * x + matrix[4]! * y + matrix[8]! * z,
  matrix[1]! * x + matrix[5]! * y + matrix[9]! * z,
  matrix[2]! * x + matrix[6]! * y + matrix[10]! * z,
];

const transformPoint = (matrix: readonly number[], point: Vector): Vector => {
  const [x, y, z] = rotate(matrix, point);
  return [x + matrix[12]!, y + matrix[13]!, z + matrix[14]!];
};

const distance = (a: Vector, b: Vector): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Signed angle in degrees of the matrix's rotation about a unit axis (right-hand rule). */
const rotationAbout = (matrix: readonly number[], [x, y, z]: Vector): number => {
  const sine = (x * (matrix[6]! - matrix[9]!) + y * (matrix[8]! - matrix[2]!) + z * (matrix[1]! - matrix[4]!)) / 2;
  const cosine = (matrix[0]! + matrix[5]! + matrix[10]! - 1) / 2;
  return (Math.atan2(sine, cosine) * 180) / Math.PI;
};

function expectRotation(
  matrix: readonly number[],
  { about, degrees }: Readonly<{ about: Vector; degrees: number }>,
  label: string,
): void {
  expect(distance(rotate(matrix, about), about), `${label} should turn about its joint axis`).toBeLessThan(1e-6);
  const wrapped = ((rotationAbout(matrix, about) - degrees + 540) % 360) - 180;
  expect(wrapped, `${label} should turn ${degrees.toFixed(3)}°`).toBeCloseTo(0, 4);
}

function expectIdentity(matrix: readonly number[], label: string): void {
  const deviation = Math.max(...matrix.map((value, index) => Math.abs(value - identity[index]!)));
  expect(deviation, `${label} should be at its as-built placement`).toBeLessThan(1e-9);
}

async function readState(): Promise<KinematicsTestState> {
  const state = await target.evaluate(
    (unit) => (globalThis as unknown as KinematicsBridgeWindow).__TAU_KINEMATICS_TEST__?.getState(unit) ?? null,
    unitId,
  );
  if (!state) {
    throw new Error('The kinematics e2e bridge has no state for the fixture unit.');
  }
  return state;
}

async function readStateField<Key extends keyof KinematicsTestState>(key: Key): Promise<KinematicsTestState[Key]> {
  const state = await readState();
  return state[key];
}

async function readMatrix(componentId: string): Promise<readonly number[]> {
  const matrix = await target.evaluate(
    ([unit, component]) =>
      (globalThis as unknown as KinematicsBridgeWindow).__TAU_KINEMATICS_TEST__?.getComponentWorldMatrix(
        unit,
        component,
      ) ?? null,
    [unitId, componentId] as const,
  );
  if (!matrix) {
    throw new Error(`Component ${componentId} is not in the posed scene.`);
  }
  return matrix;
}

async function projectComponent(componentId: string): Promise<ScreenPoint> {
  const point = await target.evaluate(
    ([unit, component]) =>
      (globalThis as unknown as KinematicsBridgeWindow).__TAU_KINEMATICS_TEST__?.projectComponent(unit, component) ??
      null,
    [unitId, componentId] as const,
  );
  if (!point) {
    throw new Error(`Component ${componentId} cannot be projected.`);
  }
  return point;
}

async function readCamera(): Promise<CameraPose> {
  const camera = await target.evaluate(() => {
    const pose = (globalThis as unknown as KinematicsBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getCamera();
    return pose ? { position: pose.position, quaternion: pose.quaternion } : null;
  });
  if (!camera) {
    throw new Error('Section view e2e bridge is not installed.');
  }
  return camera;
}

async function readHoveredComponentId(): Promise<string | undefined> {
  return target.evaluate(
    () =>
      (globalThis as unknown as KinematicsBridgeWindow).__TAU_SECTION_VIEW_TEST__?.getModelHoverState()
        .hoveredComponentId,
  );
}

/**
 * A viewport point whose live raycast hovers `componentId`. The projected bounds centre can land on an
 * occluding part or in a bore, so surface samples nearest to it are tried in turn.
 */
async function findSurfacePoint(componentId: string): Promise<ScreenPoint> {
  const candidates = await target.evaluate(
    ([unit, component]) => {
      const bridgeWindow = globalThis as unknown as KinematicsBridgeWindow;
      const centre = bridgeWindow.__TAU_KINEMATICS_TEST__?.projectComponent(unit, component);
      const samples = bridgeWindow.__TAU_SECTION_VIEW_TEST__?.projectModelComponent(component) ?? [];
      if (!centre) {
        return [];
      }
      const byCentreDistance = samples
        .filter((sample) => sample.visible)
        .sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y));
      return [centre, ...byCentreDistance];
    },
    [unitId, componentId] as const,
  );

  for (const candidate of candidates) {
    /* oxlint-disable-next-line no-await-in-loop -- Each candidate is verified against the live hover raycast in turn. */
    await target.mouseMove(candidate.x, candidate.y);
    for (let attempt = 0; attempt < 5; attempt++) {
      /* oxlint-disable-next-line no-await-in-loop -- Hover state updates only after the pointer move is processed. */
      await target.delay(80);
      /* oxlint-disable-next-line no-await-in-loop -- Polling the browser-side hover state at a fixed cadence. */
      if ((await readHoveredComponentId()) === componentId) {
        return { x: candidate.x, y: candidate.y };
      }
    }
  }
  throw new Error(`No viewport point hovers ${componentId}: ${JSON.stringify(candidates.slice(0, 5))}`);
}

/** Presses at `start` and moves by `offset` in small steps, leaving the button down. */
async function pressAndMove(start: ScreenPoint, offset: ScreenPoint, steps = 12): Promise<void> {
  await target.mouseMove(start.x, start.y);
  await target.mouseDown();
  for (let step = 1; step <= steps; step++) {
    /* oxlint-disable-next-line no-await-in-loop -- A drag is a sequence of pointer moves, one per frame. */
    await target.mouseMove(start.x + (offset.x * step) / steps, start.y + (offset.y * step) / steps);
    /* oxlint-disable-next-line no-await-in-loop -- Lets the rAF-coalesced drag solve each move. */
    await target.delay(40);
  }
  await target.delay(100);
}

/** Seeds an editor project from the example and waits until its geometry is framed in the viewer. */
async function openFixture(locator: string): Promise<void> {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`/__e2e/example-fixture?locator=${locator}&graphicsBackend=webgl`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await target.expectGeometryFramed();
  await target.waitFor(
    (unit) => (globalThis as unknown as KinematicsBridgeWindow).__TAU_KINEMATICS_TEST__?.getState(unit) !== undefined,
    unitId,
    { timeout: 120_000 },
  );
}

async function openMechanismFixture(locator: string): Promise<void> {
  await openFixture(locator);
  // `loadMechanism` gives the unit its first revision.
  await target.waitFor(
    (unit) =>
      ((globalThis as unknown as KinematicsBridgeWindow).__TAU_KINEMATICS_TEST__?.getState(unit)?.revision ?? 0) > 0,
    unitId,
    { timeout: 120_000 },
  );
}

async function openKinematicsPane(): Promise<void> {
  await target.keyboardPress('Control+m');
  await target.expectVisible(selectors.getByTestId('kinematics-pane'), 30_000);
}

const dofField = (dofId: string) => selectors.getByTestId(`kinematics-dof-${dofId}`).getByRole('spinbutton');

async function setDriver(dofId: string, value: number): Promise<void> {
  await target.fill(dofField(dofId), String(value));
  await target.press(dofField(dofId), 'Enter');
  await expect
    .poll(async () => readStateField('coordinates'), { timeout: 10_000, message: `${dofId} = ${value}` })
    .toMatchObject({ [dofId]: value });
}

test.describe('Kinematics pane', () => {
  test('should pose the carrier and planets from the sun slider and its ArrowUp step', async () => {
    await openMechanismFixture(planetary.locator);
    await openKinematicsPane();
    for (const componentId of planetary.links) {
      /* oxlint-disable-next-line no-await-in-loop -- One bridge read per link. */
      expectIdentity(await readMatrix(componentId), componentId);
    }

    await setDriver('sun', 90);
    expectRotation(await readMatrix(planetary.sun), { about: modelZ, degrees: 90 }, 'sun');
    expectRotation(await readMatrix(planetary.carrier), { about: modelZ, degrees: 22.5 }, 'carrier (sun / 4)');
    // World planet angle = carrier + relative (−3/4 sun) = −sun / 2; its pin orbits with the carrier.
    const planet = await readMatrix(planetary.planet);
    expectRotation(planet, { about: modelZ, degrees: -45 }, 'planet 1 (−sun / 2)');
    const carrierAngle = (22.5 * Math.PI) / 180;
    const orbit: Vector = [48 * Math.cos(carrierAngle), 48 * Math.sin(carrierAngle), 0];
    expect(distance(transformPoint(planet, toGlbPoint(planetary.planetPin)), toGlbPoint(orbit))).toBeLessThan(1e-6);
    expectIdentity(await readMatrix(planetary.ring), 'grounded ring');
    // The sun's followers wait in a closed group under it.
    await target.click(selectors.getByRole('button', { name: 'Followers of sun' }));
    await target.expectValue(dofField('carrier'), '22.5');
    await target.expectValue(dofField('planet-1'), '-67.5');
    await target.expectAttribute(dofField('sun'), 'aria-valuetext', '90 °');

    await target.focus(dofField('sun'));
    await target.keyboardPress('ArrowUp');
    await expect.poll(async () => readStateField('coordinates'), { timeout: 10_000 }).toEqual({ sun: 91 });
    expectRotation(await readMatrix(planetary.sun), { about: modelZ, degrees: 91 }, 'sun after ArrowUp');
    expectRotation(await readMatrix(planetary.carrier), { about: modelZ, degrees: 22.75 }, 'carrier after ArrowUp');
    await target.expectValue(dofField('carrier'), '22.75');
    await target.screenshot(selectors.getByCss('body'), 'kinematics-planetary-sun-91.png');
  });

  test('should play the authored clip, pause it and reset every link to the as-built pose', async () => {
    await openMechanismFixture(planetary.locator);
    await openKinematicsPane();

    await target.click(selectors.getByTestId('kinematics-play'));
    await expect
      .poll(async () => readStateField('playback'), { timeout: 10_000 })
      .toMatchObject({ status: 'playing', animationId: 'four-sun-turns' });
    await expect
      .poll(
        async () => {
          const { playback } = await readState();
          return playback.time;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0.2);
    await expect
      .poll(async () => Math.abs(rotationAbout(await readMatrix(planetary.sun), modelZ)), { timeout: 10_000 })
      .toBeGreaterThan(1);
    await target.expectVisible(selectors.getByTestId('kinematics-pause'));

    await target.click(selectors.getByTestId('kinematics-pause'));
    await expect.poll(async () => readStateField('playback'), { timeout: 10_000 }).toMatchObject({ status: 'paused' });
    const paused = await readState();
    await target.delay(500);
    const stillPaused = await readState();
    expect(stillPaused.playback.time, 'paused time should not advance').toBe(paused.playback.time);
    expect(stillPaused.revision, 'a paused clip should not re-pose').toBe(paused.revision);
    await target.expectText(
      selectors.getByTestId('kinematics-status'),
      `Paused at ${paused.playback.time.toFixed(1)} s`,
    );
    await target.expectVisible(selectors.getByTestId('kinematics-play'));

    // The pose mark beside the file name resets it, as the Parameters header resets parameters.
    await target.click(selectors.getByRole('button', { name: 'Reset pose to as built' }));
    await expect.poll(async () => readStateField('coordinates'), { timeout: 10_000 }).toEqual({ sun: 0 });
    expect(await readStateField('playback')).toMatchObject({ status: 'stopped', time: 0 });
    for (const componentId of planetary.links) {
      /* oxlint-disable-next-line no-await-in-loop -- One bridge read per link. */
      expectIdentity(await readMatrix(componentId), componentId);
    }

    // Choosing a clip in the picker starts it.
    await target.click(selectors.getByRole('button', { name: 'Animation: Four sun turns' }));
    await target.click(selectors.getByTestId('kinematics-animation-four-sun-turns'));
    await expect.poll(async () => readStateField('playback'), { timeout: 10_000 }).toMatchObject({ status: 'playing' });
    await target.expectVisible(selectors.getByTestId('kinematics-pause'));
  });

  test('should drive only the sun and keep the coupling ratios when a planet gear is dragged', async () => {
    await openMechanismFixture(planetary.locator);
    await openKinematicsPane();
    const grab = await findSurfacePoint(planetary.planet);
    const centre = await projectComponent(planetary.ring);
    const radial = { x: grab.x - centre.x, y: grab.y - centre.y };
    const radialLength = Math.hypot(radial.x, radial.y);
    expect(await readStateField('drag')).toBeUndefined();

    await pressAndMove(grab, { x: (-radial.y / radialLength) * 60, y: (radial.x / radialLength) * 60 });
    const dragging = await readState();
    expect(dragging.drag).toMatchObject({ componentId: planetary.planet, link: 'planet-1' });
    expect(['solved', 'blocked']).toContain(dragging.drag?.status);
    await target.expectText(selectors.getByTestId('kinematics-status'), 'Ready');
    await target.screenshot(selectors.getByCss('body'), 'kinematics-planetary-planet-drag.png');
    await target.mouseUp();

    await expect.poll(async () => readStateField('drag'), { timeout: 10_000 }).toBeUndefined();
    const { coordinates } = await readState();
    expect(Object.keys(coordinates), 'the sun is the only driver').toEqual(['sun']);
    const sun = coordinates['sun']!;
    expect(Math.abs(sun), 'the drag should turn the sun').toBeGreaterThan(5);
    expectRotation(await readMatrix(planetary.sun), { about: modelZ, degrees: sun }, 'sun');
    expectRotation(await readMatrix(planetary.carrier), { about: modelZ, degrees: sun / 4 }, 'carrier (sun / 4)');
    const planet = await readMatrix(planetary.planet);
    expectRotation(planet, { about: modelZ, degrees: -sun / 2 }, 'planet 1 (−sun / 2)');
    const carrierAngle = ((sun / 4) * Math.PI) / 180;
    const orbit: Vector = [48 * Math.cos(carrierAngle), 48 * Math.sin(carrierAngle), 0];
    expect(distance(transformPoint(planet, toGlbPoint(planetary.planetPin)), toGlbPoint(orbit))).toBeLessThan(1e-6);
    expectIdentity(await readMatrix(planetary.ring), 'grounded ring');
    await target.expectText(selectors.getByTestId('kinematics-status'), 'Ready');
  });

  test('should pull the arm tool toward the pointer and restore the pose on Escape', async () => {
    await openMechanismFixture(arm.locator);
    // The viewer arms part drags only while the pane shows the mechanism.
    await openKinematicsPane();
    const grab = await findSurfacePoint(arm.tool);
    const camera = await readCamera();
    const toolBefore = await projectComponent(arm.tool);
    expect(await readStateField('drag')).toBeUndefined();

    await pressAndMove(grab, { x: 0, y: -60 });
    const dragging = await readState();
    expect(dragging.drag).toMatchObject({ componentId: arm.tool, link: 'tool' });
    expect(['solved', 'blocked']).toContain(dragging.drag?.status);
    // Read with the button still down: a settled pose re-measures the bounds and may re-frame the camera.
    expect(await readCamera(), 'dragging a part should not orbit the camera').toEqual(camera);
    const toolAfter = await projectComponent(arm.tool);
    await target.screenshot(selectors.getByCss('body'), 'kinematics-arm-tool-drag.png');
    await target.mouseUp();

    await expect.poll(async () => readStateField('drag'), { timeout: 10_000 }).toBeUndefined();
    const released = await readState();
    expect(released.coordinates, 'release should keep the dragged pose').toEqual(dragging.coordinates);
    const movedJoints = Object.values(released.coordinates).filter((value) => Math.abs(value) > 0.5);
    expect(movedJoints.length, 'the drag should move at least one arm joint').toBeGreaterThan(0);
    expect(toolBefore.y - toolAfter.y, 'the tool should follow the pointer up the screen').toBeGreaterThan(30);
    expect(Math.abs(toolAfter.x - toolBefore.x), 'the tool should not stray sideways').toBeLessThan(15);
    const flange = transformPoint(await readMatrix(arm.tool), toGlbPoint(arm.flangeOrigin));
    expect(flange[1] - toGlbPoint(arm.flangeOrigin)[1], 'the flange should rise').toBeGreaterThan(0.02);

    const toolMatrix = await readMatrix(arm.tool);
    const regrab = await findSurfacePoint(arm.tool);
    await pressAndMove(regrab, { x: 40, y: 0 }, 10);
    const cancelling = await readState();
    expect(cancelling.drag?.componentId).toBe(arm.tool);
    expect(cancelling.coordinates).not.toEqual(released.coordinates);
    const cameraBeforeCancel = await readCamera();
    await target.keyboardPress('Escape');
    await expect.poll(async () => readStateField('drag'), { timeout: 10_000 }).toBeUndefined();
    expect(await readStateField('coordinates'), 'Escape restores the pre-drag pose').toEqual(released.coordinates);
    expect(await readCamera(), 'Escape should not orbit the camera').toEqual(cameraBeforeCancel);
    await target.mouseUp();
    expect(await readStateField('coordinates'), 'releasing after Escape should keep it').toEqual(released.coordinates);
    const restoredMatrix = await readMatrix(arm.tool);
    for (const [index, value] of restoredMatrix.entries()) {
      expect(value).toBeCloseTo(toolMatrix[index]!, 9);
    }
  });

  test('should leave a drag on a part to the camera while the pane is closed', async () => {
    await openMechanismFixture(arm.locator);
    const before = await readState();
    const grab = await findSurfacePoint(arm.tool);
    const camera = await readCamera();
    // The hover label adds a kinematics line under the part's name only while the pane arms drags.
    await target.expectText(selectors.getByTestId('model-component-name-badge'), 'Tool flange');

    await pressAndMove(grab, { x: 0, y: -60 });
    expect(await readStateField('drag'), 'no part drag starts while the pane is closed').toBeUndefined();
    await target.mouseUp();

    const after = await readState();
    expect(after.coordinates).toEqual(before.coordinates);
    expect(after.revision, 'the pose should not change').toBe(before.revision);
    expect(await readCamera(), 'the drag should orbit the camera').not.toEqual(camera);
  });

  test('should refuse to drag the grounded base and say so', async () => {
    await openMechanismFixture(arm.locator);
    await openKinematicsPane();
    const before = await readState();
    const press = await findSurfacePoint(arm.base);
    const label = selectors.getByTestId('model-component-name-badge');

    // While the pane arms drags, the hover label adds the part's kinematics line under its name.
    await target.expectText(label, /^Base pedestal\s*Grounded · does not move$/u);
    await target.mouseDown();
    for (let step = 1; step <= 6; step++) {
      /* oxlint-disable-next-line no-await-in-loop -- Pointer moves on a grounded part are sampled one at a time. */
      await target.mouseMove(press.x + step * 5, press.y + step * 5);
      /* oxlint-disable-next-line no-await-in-loop -- The drag state is read after each move. */
      expect(await readStateField('drag'), 'a grounded part should never start a drag').toBeUndefined();
    }
    const after = await readState();
    expect(after.coordinates).toEqual(before.coordinates);
    expect(after.revision, 'the pose should not change').toBe(before.revision);
    await target.mouseUp();
  });

  test('should turn the wheel back one tooth for each worm turn', async () => {
    await openMechanismFixture(wormGear.locator);
    await openKinematicsPane();

    await setDriver('worm', 90);
    expectRotation(await readMatrix(wormGear.worm), { about: modelX, degrees: 90 }, 'worm');
    expectRotation(
      await readMatrix(wormGear.wheel),
      { about: modelY, degrees: -90 / wormGear.wheelTeeth },
      'wheel (−worm / teeth)',
    );

    await setDriver('worm', 360);
    expectRotation(await readMatrix(wormGear.worm), { about: modelX, degrees: 0 }, 'worm after a full turn');
    expectRotation(
      await readMatrix(wormGear.wheel),
      { about: modelY, degrees: -360 / wormGear.wheelTeeth },
      'wheel after one worm turn',
    );
    await target.expectValue(dofField('wheel'), '-12');
    await target.screenshot(selectors.getByCss('body'), 'kinematics-worm-one-turn.png');
  });

  test('should show the empty state for a model without a mechanism', async () => {
    await openFixture('replicad.birdhouse');
    await openKinematicsPane();

    await target.expectVisible(selectors.getByText('This model declares no mechanism', { exact: true }), 30_000);
    expect(await readState()).toMatchObject({ coordinates: {}, revision: 0 });
    await target.expectCount(selectors.getByCss('[data-testid^="kinematics-dof-"]'), 0);
    await target.expectCount(selectors.getByTestId('kinematics-play'), 0);
    await target.screenshot(selectors.getByCss('body'), 'kinematics-empty-state.png');
  });
});

/** Finite pinned native fixture; the owning seed-route branch must be applied with the frozen producer/bridge. */
async function readMotionDrawObservation(): Promise<MotionDrawObservation> {
  const value = await target.evaluate(() => {
    const browser: MotionBrowserWindow = globalThis;
    return browser.__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory() ?? null;
  });
  if (!value) {
    throw new Error('No coherent committed native moving-links draw inventory.');
  }
  return value;
}

async function openFiniteMovingLinks(backend: 'webgl' | 'webgpu'): Promise<MotionDrawObservation> {
  initialMotionSources = undefined;
  await target.setViewport({ width: 1920, height: 1080 });
  await target.navigate(`/__e2e/project-file-tree?main=moving-links-100&chat=1&graphicsBackend=${backend}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 120_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await target.expectGeometryFramed();
  await target.waitFor(
    () => {
      const browser: MotionBrowserWindow = globalThis;
      return browser.__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory() !== undefined;
    },
    undefined,
    { timeout: 120_000 },
  );
  expect(
    await target.evaluate(() => {
      const browser: MotionBrowserWindow = globalThis;
      return browser.__TAU_SECTION_VIEW_TEST__?.getGraphicsBackend();
    }),
  ).toBe(backend);
  await openKinematicsPane();
  const draw = await readMotionDrawObservation();
  // Capture before motion or explicit exports; these real initial bytes are the later invariance baseline.
  const chain = await captureInitialMotionSource('motion/parts/chain.js', draw);
  const assembly = await captureInitialMotionSource('motion/assembly.json', draw);
  if (chain.projectId !== assembly.projectId) {
    throw new Error('The two initial authored files belong to different committed projects.');
  }
  initialMotionSources = { chain, assembly };
  await openKinematicsPane();
  await assertInitialMotionSubject(assembly);
  const fresh = await readMotionDrawObservation();
  if (fresh.key !== draw.key || fresh.unitId !== draw.unitId || fresh.poseRevision !== draw.poseRevision) {
    throw new Error('The initial authored byte capture changed the held root/unit/pose.');
  }
  return fresh;
}

type InitialMotionSource = Readonly<{
  path: string;
  bytes: Uint8Array<ArrayBuffer>;
  digest: string;
  key: string;
  unitId: string;
  projectId: string;
}>;
let initialMotionSources: Readonly<{ chain: InitialMotionSource; assembly: InitialMotionSource }> | undefined;

async function assertInitialMotionSubject(
  draw: Pick<MotionDrawObservation, 'key' | 'unitId'> & { projectId?: string },
): Promise<string> {
  const current = await target.evaluate((held) => {
    const browser: MotionBrowserWindow = globalThis;
    const capture = browser.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
    const fresh = browser.__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
    const projectId = capture?.diagnostics.projectId;
    return capture?.isCurrent() === true &&
      capture.assemblyDisplay?.root.digest === held.key &&
      fresh?.key === held.key &&
      fresh.unitId === held.unitId &&
      typeof projectId === 'string' &&
      (held.projectId === undefined || projectId === held.projectId)
      ? projectId
      : undefined;
  }, draw);
  if (current === undefined) {
    throw new Error('The initial authored source download changed its committed project subject.');
  }
  return current;
}

async function captureInitialMotionSource(
  path: string,
  draw: Pick<MotionDrawObservation, 'key' | 'unitId'>,
): Promise<InitialMotionSource> {
  const projectId = await assertInitialMotionSubject(draw);
  await revealMotionFile(path);
  await target.click(motionFile(path), { button: 'right' });
  const file = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
  await assertInitialMotionSubject({ ...draw, projectId });
  const bytes = base64ToUint8Array(file.base64);
  const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  await target.writeArtifact(
    `c6-${projectId}-initial-download-${path.split('/').at(-1)}.base64.json`,
    JSON.stringify(
      {
        path,
        suggestedFilename: file.suggestedFilename,
        base64: file.base64,
        digest,
        byteLength: bytes.byteLength,
        root: draw.key,
        key: draw.key,
        unitId: draw.unitId,
        projectId,
      },
      undefined,
      2,
    ),
  );
  return { path, bytes, digest, key: draw.key, unitId: draw.unitId, projectId };
}

type MotionManagedHandoff = Readonly<{
  root: Awaited<ReturnType<typeof readMotionPinBytes>>['root'];
  projectId: string;
  authoredUnitId: string;
  unitId: string;
  canonicalIds: readonly string[];
}>;

/** Bind frozen authored recipe bytes to this genuinely reopened managed subject without rewriting the original unit. */
async function assertMotionManagedHandoff(handoff: MotionManagedHandoff): Promise<void> {
  const initial = initialMotionSources?.assembly;
  if (
    !initial ||
    initial.key !== handoff.root.digest ||
    initial.unitId !== handoff.authoredUnitId ||
    initial.projectId !== handoff.projectId ||
    handoff.unitId === handoff.authoredUnitId
  ) {
    throw new Error('Managed recipe handoff does not belong to the immutable initial authored bytes.');
  }
  const current = await target.evaluate((held) => {
    const browser: MotionBrowserWindow = globalThis;
    const capture = browser.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
    const draw = browser.__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
    const root = capture?.assemblyDisplay?.root;
    const ids = draw?.canonicalComponents.map(({ component }) => component.id) ?? [];
    return (
      capture?.isCurrent() === true &&
      capture.diagnostics.projectId === held.projectId &&
      capture.diagnostics.sourceEntryPath === held.root.path &&
      root?.path === held.root.path &&
      root.digest === held.root.digest &&
      root.byteLength === held.root.byteLength &&
      draw?.key === held.root.digest &&
      draw.unitId === held.unitId &&
      ids.length === held.canonicalIds.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => held.canonicalIds.includes(id))
    );
  }, handoff);
  if (!current) {
    throw new Error('The actual managed pin/project/unit/canonical recipe handoff is no longer current.');
  }
}

/** Independent source recipe geometry, not production bounds or measured output. */
async function expectedMotionCanonicalCorners(
  draw: MotionDrawObservation,
  componentId: string,
  handoff?: MotionManagedHandoff,
) {
  const metadata = draw.canonicalComponents.find(({ component }) => component.id === componentId);
  if (!metadata?.component.name || metadata.ancestry.length !== 1) {
    throw new Error('Expected one supported flat canonical fixture body.');
  }
  const initial = initialMotionSources?.assembly;
  if (
    !initial ||
    initial.key !== draw.key ||
    (handoff
      ? handoff.unitId !== draw.unitId || handoff.authoredUnitId !== initial.unitId
      : initial.unitId !== draw.unitId)
  ) {
    throw new Error('No initial authored assembly bytes belong to this committed subject.');
  }
  if (handoff) {
    await assertMotionManagedHandoff(handoff);
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(initial.bytes));
  if (!value || typeof value !== 'object' || !('occurrences' in value) || !Array.isArray(value.occurrences)) {
    throw new Error('Frozen authored occurrence recipe is invalid.');
  }
  const occurrence: unknown = value.occurrences.find(
    (row: unknown) =>
      row !== null && row !== undefined && typeof row === 'object' && 'id' in row && row.id === metadata.ancestry[0],
  );
  if (
    !occurrence ||
    typeof occurrence !== 'object' ||
    !('transform' in occurrence) ||
    !Array.isArray(occurrence.transform) ||
    occurrence.transform.length !== 16 ||
    !occurrence.transform.every((entry: unknown) => typeof entry === 'number' && Number.isFinite(entry))
  ) {
    throw new Error('Canonical ancestry does not bind the actual flat authored transform.');
  }
  const occurrenceMatrix = occurrence.transform.map((entry: unknown) => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new TypeError('Authored matrix entry is not finite.');
    }
    return entry;
  });
  let driverRadians = 0;
  const label = /^Link c([0-4]) b([0-4])$/u.exec(metadata.component.name);
  if (label) {
    const driver = draw.canonicalComponents.find(
      ({ ancestry, component }) =>
        JSON.stringify(ancestry) === JSON.stringify(metadata.ancestry) && component.name === `Link c${label[1]} b0`,
    );
    const link =
      driver &&
      Object.entries(draw.mechanism?.links ?? {}).find(([, entry]) => entry.components.includes(driver.component.id));
    const joint = link && Object.entries(draw.mechanism?.joints ?? {}).find(([, entry]) => entry.child === link[0]);
    if (joint?.[1].type !== 'revolute') {
      throw new Error('Actual canonical driver binding is absent.');
    }
    const coordinates = await target.evaluate(
      (unit) => (globalThis as MotionBrowserWindow).__TAU_KINEMATICS_TEST__?.getState(unit)?.coordinates ?? null,
      draw.unitId,
    );
    const value = coordinates?.[joint[0]];
    if (value === undefined) {
      throw new Error('Actual paused source driver coordinate is absent.');
    }
    driverRadians = value;
  }
  return expectedMotionSourceCorners(metadata.component.name, driverRadians).map((corner) =>
    transformMotionPoint(occurrenceMatrix, corner),
  );
}
async function expectedMotionExtentX(draw: MotionDrawObservation, componentId: string): Promise<number> {
  const corners = await expectedMotionCanonicalCorners(draw, componentId);
  const frame = await target.evaluate(
    () => (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getRenderFrame() ?? null,
  );
  if (!frame) {
    throw new Error('Actual committed render frame is absent.');
  }
  const x = corners.map(
    (corner) => transformMotionPoint(draw.canonicalToRenderMatrix, corner)[0] * frame.metersPerRenderUnit,
  );
  return Math.max(...x) - Math.min(...x);
}

async function openCommand(name: string): Promise<void> {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), name);
  await target.click(selectors.getByRole('option', { name, exact: true }));
}

/** UI actions use the existing row/menu and native select controls, not Graphics actor injection. */
const motionRow = (id: string) =>
  selectors.getByCss(`[data-model-component-row][data-model-component-id=${JSON.stringify(id)}]`);

async function filterMotionRow(id: string, name: string): Promise<void> {
  await openCommand('Open model structure');
  await target.fill(selectors.getByRole('searchbox', { name: 'Filter parts' }), name);
  await target.expectVisible(motionRow(id), 15_000);
  await target.scrollIntoView(motionRow(id));
}
async function motionMenu(id: string): Promise<void> {
  await target.click(motionRow(id).getByCss('button[aria-label^="Actions for "]'));
}
async function motionMenuAction(id: string, action: string): Promise<void> {
  await motionMenu(id);
  await target.click(selectors.getByRole('menuitem', { name: action, exact: true }));
}
async function motionVisibility(): Promise<
  Readonly<{ hiddenComponentIds: readonly string[]; isolatedComponentIds: readonly string[] }>
> {
  const value = await target.evaluate(() => {
    const browser: MotionBrowserWindow = globalThis;
    return browser.__TAU_SECTION_VIEW_TEST__?.getModelVisibility() ?? null;
  });
  if (!value) {
    throw new Error('Missing actual model visibility owner.');
  }
  return value;
}
async function motionRendered(id: string) {
  const value = await target.evaluate((componentId) => {
    const browser: MotionBrowserWindow = globalThis;
    return browser.__TAU_SECTION_VIEW_TEST__?.getRenderedModelComponentState(componentId) ?? null;
  }, id);
  if (!value) {
    throw new Error('Missing actual rendered component inventory.');
  }
  return value;
}
async function motionMeasureState() {
  const value = await target.evaluate(() => {
    const browser: MotionBrowserWindow = globalThis;
    return browser.__TAU_SECTION_VIEW_TEST__?.getMeasureState() ?? null;
  });
  if (!value) {
    throw new Error('Missing actual measure consumer.');
  }
  return value;
}
async function setMotionSelect(label: string, value: string): Promise<void> {
  await target.evaluate(
    ({ field, next }) => {
      const element = [...document.querySelectorAll<HTMLSelectElement>('select')].find(
        (select) => select.getAttribute('aria-label') === field,
      );
      if (!element || ![...element.options].some((option) => option.value === next)) {
        throw new Error(`Actual select ${field} has no qualified option ${next}.`);
      }
      element.value = next;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { field: label, next: value },
  );
}
async function prepareMotionBodyMeasure(operation: 'extent-x' | 'minimum-distance'): Promise<void> {
  const state = await motionMeasureState();
  if (!state.isMeasureActive) {
    await target.click(selectors.getByRole('button', { name: /^measure$/iu, pressed: false }));
  }
  await target.click(selectors.getByRole('button', { name: /^Targets:/u }));
  await setMotionSelect('Feature filter', 'body');
  await setMotionSelect('Measurement operation', operation);
  await target.focus(selectors.getByRole('combobox', { name: 'Choose target', exact: true }));
  await expect
    .poll(async () => {
      const awaitedResult1 = await motionMeasureState();
      return awaitedResult1.candidates.length;
    })
    .toBeGreaterThan(0);
  const more = selectors.getByRole('button', { name: 'Load more targets', exact: true });
  /* oxlint-disable no-await-in-loop -- The real catalog is paginated; every append is acquired before requesting the next page. */
  let page = await target.read(more);
  while (page.visible) {
    const previous = await motionMeasureState();
    await target.click(more);
    await expect
      .poll(async () => {
        const current = await motionMeasureState();
        const available = await target.read(more);
        return current.candidates.length > previous.candidates.length || !available.visible;
      })
      .toBe(true);
    page = await target.read(more);
  }
  /* oxlint-enable no-await-in-loop */
}
async function chooseMotionBody(id: string): Promise<void> {
  const draw = await readMotionDrawObservation();
  const row = draw.surfaces.find((candidate) => candidate.componentId === id);
  if (!row) {
    throw new Error('Canonical component has no current actual draw owner.');
  }
  const catalog = await motionMeasureState();
  await setMotionSelect('Choose target', getMotionBodyCandidate(row, catalog.candidates));
  await target.click(selectors.getByRole('button', { name: 'Use target', exact: true }));
}
async function explicitMotionMinimum(left: string, right: string) {
  await prepareMotionBodyMeasure('minimum-distance');
  const awaitedResult2 = await motionMeasureState();
  const prior = new Set(awaitedResult2.measurements.map(({ id }) => id));
  await chooseMotionBody(left);
  await expect
    .poll(async () => {
      const awaitedResult3 = await motionMeasureState();
      return awaitedResult3.currentStart;
    })
    .toBeDefined();
  await chooseMotionBody(right);
  await expect
    .poll(
      async () => {
        const awaitedResult4 = await motionMeasureState();
        return awaitedResult4.measurements.find(({ id }) => !prior.has(id))?.status;
      },
      {
        timeout: 120_000,
      },
    )
    .toBe('current');
  const awaitedResult5 = await motionMeasureState();
  const result = awaitedResult5.measurements.find(({ id }) => !prior.has(id));
  if (!result) {
    throw new Error('Exact consumer omitted its real measurement.');
  }
  expect(result).toMatchObject({ operation: 'minimum-distance', quality: 'cad', status: 'current' });
  expect(result.distance).toBeGreaterThan(0);
  expect(Math.hypot(...result.startPoint.map((value, index) => value - result.endPoint[index]!))).toBeCloseTo(
    result.distance,
    8,
  );
  await target.click(selectors.getByRole('button', { name: /^measure$/iu, pressed: true }));
  return result;
}
async function downloadMotionRecipe(format: 'step' | 'png'): Promise<void> {
  await openCommand('Export');
  const panel = selectors.getByCss('[data-slot="export-panel-body"]');
  await target.expectVisible(panel);
  const toggles = await target.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Formats"] button[aria-pressed]')].map((button) => ({
      name: (button.querySelector(':scope > span')?.textContent ?? '').trim(),
      selected: button.getAttribute('aria-pressed') === 'true',
    })),
  );
  expect(
    toggles.some(({ name }) => name.toLowerCase() === format),
    `Installed ${format} route must be honest and present`,
  ).toBe(true);
  for (const toggle of toggles) {
    if (toggle.selected !== (toggle.name.toLowerCase() === format)) {
      // oxlint-disable-next-line no-await-in-loop -- Selection changes must settle in this viewport before export.
      await target.click(panel.getByRole('button', { name: toggle.name, exact: true }));
    }
  }
  const file = await target.download(panel.getByRole('button', { name: new RegExp(`^Export ${format}$`, 'iu') }));
  expect(file.base64.length).toBeGreaterThan(0);
  expect(file.suggestedFilename.toLowerCase()).toMatch(new RegExp(`\\.${format}$`, 'u'));
}
async function readMotionActivity(): Promise<MotionActivityObservation> {
  const value = await target.evaluate(() => {
    const browser: MotionBrowserWindow = globalThis;
    return browser.__TAU_SECTION_VIEW_TEST__?.getCadActivity() ?? null;
  });
  if (!value) {
    throw new Error('No coherent actual CAD activity evidence.');
  }
  return value;
}
async function readMotionHeadless(): Promise<readonly MotionHeadlessRecord[]> {
  const value = await target.evaluate(() => {
    const browser: MotionBrowserWindow = globalThis;
    if (!browser.__TAU_HEADLESS_IMAGE_DEBUG__) {
      return null;
    }
    if (document.querySelector('[data-model-component-row] button[aria-busy="true"]')) {
      return null;
    }
    return browser.__TAU_HEADLESS_IMAGE_DEBUG__.records;
  });
  if (!value) {
    throw new Error('Thumbnail evidence is absent or a visible canonical preview is pending.');
  }
  return value;
}
const motionFile = (path: string) =>
  selectors.getByCss(`[data-testid="file-tree-item"][data-file-tree-path=${JSON.stringify(path)}]`);
async function revealMotionFile(path: string): Promise<void> {
  await openCommand('Open files');
  const segments = path.split('/');
  for (let depth = 1; depth < segments.length; depth++) {
    const directory = motionFile(segments.slice(0, depth).join('/'));
    /* oxlint-disable-next-line no-await-in-loop -- Each real nested folder exists only after its parent has expanded. */
    await target.expectVisible(directory, 15_000);
    // oxlint-disable-next-line no-await-in-loop -- Each nested folder exists only after its parent expands.
    const expanded = await target.getAttribute(directory, 'aria-expanded');
    if (expanded !== 'true') {
      // oxlint-disable-next-line no-await-in-loop -- Expand ancestors in their actual hierarchy order.
      await target.click(directory, { position: { x: 8, y: 14 } });
    }
  }
  await target.expectVisible(motionFile(path), 15_000);
  await target.scrollIntoView(motionFile(path));
}
async function downloadMotionSource(path: string, handoff?: MotionManagedHandoff): Promise<string> {
  const initial =
    path === 'motion/parts/chain.js'
      ? initialMotionSources?.chain
      : path === 'motion/assembly.json'
        ? initialMotionSources?.assembly
        : undefined;
  if (!initial) {
    throw new Error('Source observation has no initial finite authored byte baseline.');
  }
  await (handoff ? assertMotionManagedHandoff(handoff) : assertInitialMotionSubject(initial));
  await revealMotionFile(path);
  await target.click(motionFile(path), { button: 'right' });
  const file = await target.download(selectors.getByRole('menuitem', { name: 'Download', exact: true }));
  await (handoff ? assertMotionManagedHandoff(handoff) : assertInitialMotionSubject(initial));
  const bytes = base64ToUint8Array(file.base64);
  const digest = `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  await target.writeArtifact(
    `c6-${initial.projectId}-later-download-${path.split('/').at(-1)}.base64.json`,
    JSON.stringify(
      {
        path,
        suggestedFilename: file.suggestedFilename,
        base64: file.base64,
        digest,
        byteLength: bytes.byteLength,
        root: initial.key,
        key: initial.key,
        unitId: initial.unitId,
        projectId: initial.projectId,
      },
      undefined,
      2,
    ),
  );
  expect(bytes).toEqual(initial.bytes);
  expect(digest).toBe(initial.digest);
  return digest;
}
async function removeUnchangedMotionSource(path: string, handoff?: MotionManagedHandoff): Promise<void> {
  // The existing content download proves the file still belongs to the exact seeded recipe before removal.
  await downloadMotionSource(path, handoff);
  await target.click(motionFile(path), { button: 'right' });
  await target.click(selectors.getByRole('menuitem', { name: 'Delete', exact: true }));
  const dialog = selectors.getByRole('alertdialog');
  await target.expectVisible(dialog);
  await target.click(dialog.getByRole('button', { name: /^Delete/u }));
  await target.expectCount(motionFile(path), 0);
  await target.expectCount(dialog, 0);
}

async function readMotionPinBytes() {
  return target.evaluate(async () => {
    const browser: MotionBrowserWindow = globalThis;
    const capture = browser.__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly();
    const display = capture?.assemblyDisplay;
    if (!capture || !display || !capture.isCurrent()) {
      throw new Error('Missing actual admitted current pin.');
    }
    const digest = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
      `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    const rootBytes = await capture.readRawBytes(display.root.path);
    if (rootBytes.byteLength !== display.root.byteLength || (await digest(rootBytes)) !== display.root.digest) {
      throw new Error('Actual immutable root bytes changed.');
    }
    const variants: Array<{ part: string; variant: string; source: string; glb: string; exact?: string }> = [];
    for (const [part, record] of Object.entries(display.admitted.publication.parts)) {
      for (const [variant, recipe] of Object.entries(record.variants)) {
        /* oxlint-disable-next-line no-await-in-loop -- The real UI/pose observation is ordered on one viewport; the next gesture or frame depends on this settled result. */
        const glb = await display.admitted.readAsset(recipe.glb.digest);
        /* oxlint-disable-next-line no-await-in-loop -- The real UI/pose observation is ordered on one viewport; the next gesture or frame depends on this settled result. */
        if (glb.byteLength !== recipe.glb.byteLength || (await digest(glb)) !== recipe.glb.digest) {
          throw new Error('Actual admitted canonical display asset changed.');
        }
        /* oxlint-disable-next-line no-await-in-loop -- The real UI/pose observation is ordered on one viewport; the next gesture or frame depends on this settled result. */
        const exact = recipe.exact && (await display.admitted.readAsset(recipe.exact.asset.digest));
        if (
          recipe.exact &&
          (!exact ||
            exact.byteLength !== recipe.exact.asset.byteLength ||
            /* oxlint-disable-next-line no-await-in-loop -- The real UI/pose observation is ordered on one viewport; the next gesture or frame depends on this settled result. */
            (await digest(exact)) !== recipe.exact.asset.digest)
        ) {
          throw new Error('Actual admitted native pin asset changed.');
        }
        variants.push({
          part,
          variant,
          source: JSON.stringify(recipe.source),
          glb: recipe.glb.digest,
          exact: recipe.exact?.asset.digest,
        });
      }
    }
    if (!capture.isCurrent()) {
      throw new Error('Pin changed during its byte observation.');
    }
    return { root: display.root, variants };
  });
}

for (const backend of ['webgl', 'webgpu'] as const) {
  test(`C6 native100 should retain real draw resources while all100 links move on ${backend}`, async () => {
    const before = await openFiniteMovingLinks(backend);
    const moving = getMovingMotionComponentIds(before);
    expect(moving).toHaveLength(100);
    expect(new Set(moving).size).toBe(100);
    expect(before.mechanism?.units).toEqual({ length: 'm', angle: 'rad' });
    expect(before.mechanism?.couplings).toHaveLength(80);
    const sources = before.canonicalComponents.filter(({ component }) => moving.includes(component.id));
    expect(new Set(sources.map(({ ancestry }) => JSON.stringify(ancestry))).size).toBe(4);
    expect(
      sources.every(({ ancestry }) => ancestry.length === 1),
      'posed STEP must use supported flat leaves',
    ).toBe(true);
    const rows = before.surfaces.filter(({ componentId }) => moving.includes(componentId));
    expect(rows).toHaveLength(100);
    expect(
      rows.every(({ visible, projection }) => visible && projection.finiteProjection && projection.intersectsFrustum),
    ).toBe(true);
    expect(
      before.edges.filter(({ visible }) => visible).reduce((count, { segments }) => count + segments.length, 0),
    ).toBeGreaterThanOrEqual(100);
    const initialCoordinates = await target.evaluate((unit) => {
      const browser: MotionBrowserWindow = globalThis;
      return browser.__TAU_KINEMATICS_TEST__?.getState(unit)?.coordinates ?? null;
    }, before.unitId);
    expect(initialCoordinates).not.toBeNull();
    expect(Object.keys(initialCoordinates!)).toHaveLength(20);
    expect(Object.values(initialCoordinates!).every((value) => value === 0)).toBe(true);
    const initialResources = motionResourceSignature(before);
    await target.screenshot(selectors.getByCss('body'), `c6-native100-${backend}-as-built.png`);
    const authorBefore = await downloadMotionSource('motion/parts/chain.js');
    const authoredAssemblyBefore = await downloadMotionSource('motion/assembly.json');
    await downloadMotionRecipe('step');
    await downloadMotionRecipe('png');
    await openKinematicsPane();
    const pinBefore = await readMotionPinBytes();
    const activityBefore = await readMotionActivity();
    const thumbnailsBefore = await readMotionHeadless();
    verifyNoMotionThumbnailJobs(thumbnailsBefore, thumbnailsBefore);
    const intervalStart = await target.evaluate(() => Math.max(Date.now(), performance.timeOrigin + performance.now()));
    let intervalEnd: number | undefined;
    let activityAtIntervalEnd: MotionActivityObservation | undefined;
    try {
      await target.click(selectors.getByRole('button', { name: /^Animation:/u }));
      await target.click(selectors.getByTestId('kinematics-animation-sweep'));
      const play = selectors.getByTestId('kinematics-play');
      const awaitedResult6 = await target.read(play);
      if (awaitedResult6.visible) {
        await target.click(play);
      }
      await target.expectVisible(selectors.getByTestId('kinematics-pause'));
      const samples = await target.evaluate(async () => {
        const browser: MotionBrowserWindow = globalThis;
        const captures: Array<{ draw: MotionDrawObservation; coordinates: Readonly<Record<string, number>> }> = [];
        for (let frame = 0; frame < 120; frame += 1) {
          // Explicit test observation only; no production per-frame capture or telemetry hook.
          /* oxlint-disable-next-line no-await-in-loop -- The real UI/pose observation is ordered on one viewport; the next gesture or frame depends on this settled result. */
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
          const capture = browser.__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
          if (!capture) {
            throw new Error('The presented root or pose became incoherent during animation.');
          }
          const state = browser.__TAU_KINEMATICS_TEST__?.getState(capture.unitId);
          if (!state) {
            throw new Error('Missing actual pose coordinates.');
          }
          captures.push({ draw: capture, coordinates: state.coordinates });
        }
        return captures;
      });
      intervalEnd = await target.evaluate(() => Math.min(Date.now(), performance.timeOrigin + performance.now()));
      activityAtIntervalEnd = await readMotionActivity();
      expect(new Set(samples.map(({ draw }) => draw.poseRevision)).size).toBeGreaterThan(1);
      const canonicalToRender = before.canonicalToRenderMatrix;
      const renderToCanonical = invertMotionMatrix(canonicalToRender);
      for (const { draw: sample, coordinates } of samples) {
        const displacements = expectedMotionLinkDisplacements(before.mechanism!, coordinates);
        for (const [linkId, link] of Object.entries(before.mechanism!.links)) {
          for (const id of link.components) {
            if (!moving.includes(id)) {
              continue;
            }
            const initial = rows.find(({ componentId }) => componentId === id)!;
            const actual = sample.surfaces.find(({ componentId }) => componentId === id)!;
            const expected = multiplyMotionMatrices(
              multiplyMotionMatrices(
                multiplyMotionMatrices(canonicalToRender, displacements.get(linkId)!),
                renderToCanonical,
              ),
              initial.drawMatrixWorld,
            );
            expect(
              Math.max(...actual.drawMatrixWorld.map((value, index) => Math.abs(value - expected[index]!))),
              id,
            ).toBeLessThan(1e-6);
          }
        }
        expect(sample.canonicalToRenderMatrix).toEqual(before.canonicalToRenderMatrix);
        expect(sample.key).toBe(before.key);
        expect(sample.presentationRevision).toBe(before.presentationRevision);
        expect(sample.candidateSceneId).toBe(before.candidateSceneId);
        expect(sample.unitId).toBe(before.unitId);
        expect(motionResourceSignature(sample)).toBe(initialResources);
      }
      for (const id of moving) {
        const original = rows.find(({ componentId }) => componentId === id)!;
        expect(
          samples.some(({ draw: sample }) =>
            sample.surfaces.some(
              (row) =>
                row.componentId === id &&
                row.drawMatrixWorld.some((value, index) => Math.abs(value - original.drawMatrixWorld[index]!) > 1e-8),
            ),
          ),
          id,
        ).toBe(true);
      }
      await target.screenshot(selectors.getByCss('body'), `c6-native100-${backend}-moving.png`);
    } finally {
      const pause = selectors.getByTestId('kinematics-pause');
      const awaitedResult7 = await target.read(pause);
      if (awaitedResult7.visible) {
        await target.click(pause);
      }
    }
    // The explicit exact consumer is the real dispatcher drain boundary. It is never called per animation frame.
    const firstAncestry = sources[0]!.ancestry;
    const pair = sources
      .filter(
        ({ ancestry, component }) =>
          JSON.stringify(ancestry) === JSON.stringify(firstAncestry) &&
          (component.name === 'Link c0 b0' || component.name === 'Link c4 b0'),
      )
      .map(({ component }) => component.id);
    expect(pair).toHaveLength(2);
    await explicitMotionMinimum(pair[0]!, pair[1]!);
    const activityAfter = await readMotionActivity();
    const thumbnailsAfter = await readMotionHeadless();
    const drained = verifyDrainedMotionActivity({
      before: activityBefore,
      during: activityAtIntervalEnd,
      after: activityAfter,
      intervalStart,
      intervalEnd,
    });
    expect(Object.values(drained.counts)).toEqual(Array.from({ length: Object.keys(drained.counts).length }, () => 0));
    expect(verifyNoMotionThumbnailJobs(thumbnailsBefore, thumbnailsAfter)).toEqual({
      admitted: 0,
      completed: 0,
      transcodes: 0,
    });
    expect(await readMotionPinBytes()).toEqual(pinBefore);
    expect(await downloadMotionSource('motion/parts/chain.js')).toBe(authorBefore);
    expect(await downloadMotionSource('motion/assembly.json')).toBe(authoredAssemblyBefore);
    await target.writeArtifact(
      `c6-native100-${backend}-drained-work.json`,
      JSON.stringify(
        {
          intervalStart,
          intervalEnd,
          drained,
          requestedRenderId: activityAfter.lastRequestedRenderId,
          settledRenderId: activityAfter.lastSettledRenderId,
          immutablePin: pinBefore,
          actualAuthorSourceDigest: authorBefore,
          authoredAssemblyDigest: authoredAssemblyBefore,
        },
        undefined,
        2,
      ),
    );
    // These are actual retained CPU/job records, not GPU bindings/uploads, independent AP242 bytes, pixels or timing qualification.
  });
}

for (const backend of ['webgl', 'webgpu'] as const) {
  test(`C6 native100 should execute every canonical occurrence action through real consumers on ${backend}`, async () => {
    const initial = await openFiniteMovingLinks(backend);
    await target.click(selectors.getByRole('button', { name: /^Animation:/u }));
    await target.click(selectors.getByTestId('kinematics-animation-sweep'));
    const play = selectors.getByTestId('kinematics-play');
    const awaitedResult8 = await target.read(play);
    if (awaitedResult8.visible) {
      await target.click(play);
    }
    await expect
      .poll(async () =>
        target.evaluate((unit) => {
          const browser: MotionBrowserWindow = globalThis;
          return Object.values(browser.__TAU_KINEMATICS_TEST__?.getState(unit)?.coordinates ?? {}).some(
            (value) => Math.abs(value) > 1e-4,
          );
        }, initial.unitId),
      )
      .toBe(true);
    await target.click(selectors.getByTestId('kinematics-pause'));
    const before = await readMotionDrawObservation();
    expect(before.poseRevision).toBeGreaterThan(initial.poseRevision);
    const canonicalIds = [...new Set(before.surfaces.map(({ componentId }) => componentId))];
    expect(canonicalIds).toHaveLength(104);
    const pinBefore = await readMotionPinBytes();
    const heldProjectId = await assertInitialMotionSubject(before);
    const heldCanonicalIds = before.canonicalComponents.map(({ component }) => component.id).toSorted();
    const heldSurfaceIds = before.surfaces.map(({ componentId }) => componentId).toSorted();
    expect(heldCanonicalIds).toHaveLength(108);
    expect(heldSurfaceIds).toHaveLength(104);
    const camera = await target.evaluate(() => {
      const browser: MotionBrowserWindow = globalThis;
      return browser.__TAU_SECTION_VIEW_TEST__?.getCamera() ?? null;
    });
    if (!camera) {
      throw new Error('Actual camera authority is absent.');
    }
    const completed: Array<{
      componentId: string;
      actions: readonly string[];
      extentMeters: number;
      expectedExtentMeters: number;
      chatToken: string;
      clippedStockParity: boolean;
    }> = [];
    const chatTokens = new Set<string>();
    const removedRayOccurrences = new Set<string>();
    const removedRayEvidence: Array<{
      ancestry: readonly string[];
      componentId: string;
      candidateSceneId: string;
      pointer: ScreenPoint;
    }> = [];
    // The shared view deliberately serializes independent occurrence actions; no native request runs in this loop.
    for (const id of canonicalIds) {
      const component = before.canonicalComponents.find(({ component: item }) => item.id === id)?.component;
      if (!component?.name) {
        throw new Error('Actual canonical component has no row label.');
      }
      /* oxlint-disable-next-line no-await-in-loop -- Every occurrence operates on the same live viewer and must settle before the next gesture. */
      await filterMotionRow(id, component.name);
      /* oxlint-disable-next-line no-await-in-loop -- Every group starts with the actual full canonical inventory after camera restoration. */
      await expect
        .poll(async () => {
          const awaitedResult9 = await readMotionDrawObservation();
          return awaitedResult9.surfaces.length;
        })
        .toBe(104);
      /* oxlint-disable-next-line no-await-in-loop -- Save independent neighboring draw/material state before mutation. */
      const actionBefore = await readMotionDrawObservation();
      expect({
        key: actionBefore.key,
        unitId: actionBefore.unitId,
        poseRevision: actionBefore.poseRevision,
        presentationRevision: actionBefore.presentationRevision,
      }).toEqual({
        key: before.key,
        unitId: before.unitId,
        poseRevision: before.poseRevision,
        presentationRevision: before.presentationRevision,
      });
      expect(actionBefore.canonicalComponents.map(({ component: item }) => item.id).toSorted()).toEqual(
        heldCanonicalIds,
      );
      expect(actionBefore.surfaces.map(({ componentId }) => componentId).toSorted()).toEqual(heldSurfaceIds);
      const targetBefore = actionBefore.surfaces.filter(({ componentId }) => componentId === id);
      expect(targetBefore).toHaveLength(1);
      const baselineMaterialOpacities = targetBefore.flatMap(({ materialOpacities }) => materialOpacities);
      expect(baselineMaterialOpacities.length).toBeGreaterThan(0);
      expect(baselineMaterialOpacities.every((opacity) => Number.isFinite(opacity))).toBe(true);
      const neighbors = actionBefore.surfaces.filter(({ componentId }) => componentId !== id);
      expect(neighbors).toHaveLength(103);
      const neighborVisibility = new Map(
        neighbors.map(({ componentId, visible }): [string, boolean] => [componentId, visible]),
      );
      const neighborOpacity = new Map(
        neighbors.map(({ componentId, materialOpacities }): [string, readonly number[]] => [
          componentId,
          materialOpacities,
        ]),
      );
      expect(neighborVisibility.size).toBe(103);
      expect(neighborOpacity.size).toBe(103);
      expect([...neighborVisibility.keys()].every((componentId) => canonicalIds.includes(componentId))).toBe(true);
      /* oxlint-disable-next-line no-await-in-loop -- The actual row toggles the canonical occurrence owner. */
      await target.click(motionRow(id).getByCss('button[aria-label^="Hide "]'));
      /* oxlint-disable-next-line no-await-in-loop -- Observe committed action state before showing the same occurrence. */
      await expect
        .poll(async () => {
          const awaitedResult10 = await motionVisibility();
          return awaitedResult10.hiddenComponentIds.includes(id);
        })
        .toBe(true);
      /* oxlint-disable-next-line no-await-in-loop -- A hidden canonical occurrence must have no actual visible draw. */
      await expect
        .poll(async () => {
          const awaitedResult11 = await motionRendered(id);
          return awaitedResult11.visibleMeshCount;
        })
        .toBe(0);
      /* oxlint-disable-next-line no-await-in-loop -- Hide may not affect any other canonical occurrence. */
      const awaitedResult12 = await readMotionDrawObservation();
      const afterHideNeighbors = awaitedResult12.surfaces.filter(({ componentId }) => componentId !== id);
      expect(afterHideNeighbors).toHaveLength(103);
      const afterHideVisibility = new Map(
        afterHideNeighbors.map(({ componentId, visible }): [string, boolean] => [componentId, visible]),
      );
      expect(afterHideVisibility.size).toBe(103);
      expect(afterHideVisibility).toEqual(neighborVisibility);
      /* oxlint-disable-next-line no-await-in-loop -- Show is the same occurrence's existing row control. */
      await target.click(motionRow(id).getByCss('button[aria-label^="Show "]'));
      /* oxlint-disable-next-line no-await-in-loop -- Show must settle before isolation. */
      await expect
        .poll(async () => {
          const awaitedResult13 = await motionVisibility();
          return awaitedResult13.hiddenComponentIds.includes(id);
        })
        .toBe(false);
      /* oxlint-disable-next-line no-await-in-loop -- The opacity control edits this occurrence through the existing menu owner. */
      await motionMenu(id);
      /* oxlint-disable-next-line no-await-in-loop -- The real menu input commits its occurrence opacity. */
      await target.focus(selectors.getByRole('spinbutton', { name: 'Opacity', exact: true }));
      /* oxlint-disable-next-line no-await-in-loop -- This is a native input gesture, not material mutation by the test. */
      await target.fill(selectors.getByRole('spinbutton', { name: 'Opacity', exact: true }), '40');
      /* oxlint-disable-next-line no-await-in-loop -- Enter commits the slider input's real action. */
      await target.keyboardPress('Enter');
      /* oxlint-disable-next-line no-await-in-loop -- Close the actual menu before inspecting draw materials. */
      await target.keyboardPress('Escape');
      /* oxlint-disable-next-line no-await-in-loop -- The actual material owner must expose the requested occurrence opacity. */
      await expect
        .poll(async () => {
          const awaitedResult14 = await readMotionDrawObservation();
          const materialOpacities = awaitedResult14.surfaces
            .filter(({ componentId }) => componentId === id)
            .flatMap((surface) => surface.materialOpacities);
          return materialOpacities.length > 0 && materialOpacities.every((opacity) => Math.abs(opacity - 0.4) < 1e-8);
        })
        .toBe(true);
      /* oxlint-disable-next-line no-await-in-loop -- Appearance mutation must preserve all same-definition neighboring material opacities. */
      const awaitedResult15 = await readMotionDrawObservation();
      const afterOpacityNeighbors = awaitedResult15.surfaces.filter(({ componentId }) => componentId !== id);
      expect(afterOpacityNeighbors).toHaveLength(103);
      const afterNeighborOpacity = new Map(
        afterOpacityNeighbors.map(({ componentId, materialOpacities }): [string, readonly number[]] => [
          componentId,
          materialOpacities,
        ]),
      );
      expect(afterNeighborOpacity.size).toBe(103);
      expect(afterNeighborOpacity).toEqual(neighborOpacity);
      /* oxlint-disable-next-line no-await-in-loop -- Restore the held effective opacity through the same consumer. */
      await motionMenuAction(id, 'Reset opacity');
      /* oxlint-disable-next-line no-await-in-loop -- Reset precedes full-evidence measurement and sectioning. */
      await expect
        .poll(async () => {
          const awaitedResult16 = await readMotionDrawObservation();
          const materialOpacities = awaitedResult16.surfaces
            .filter(({ componentId }) => componentId === id)
            .flatMap((surface) => surface.materialOpacities);
          return {
            key: awaitedResult16.key,
            unitId: awaitedResult16.unitId,
            poseRevision: awaitedResult16.poseRevision,
            presentationRevision: awaitedResult16.presentationRevision,
            canonicalIds: awaitedResult16.canonicalComponents.map(({ component: item }) => item.id).toSorted(),
            surfaceIds: awaitedResult16.surfaces.map(({ componentId }) => componentId).toSorted(),
            materialOpacities,
            neighborOpacities: new Map(
              awaitedResult16.surfaces
                .filter(({ componentId }) => componentId !== id)
                .map(({ componentId, materialOpacities: values }): [string, readonly number[]] => [
                  componentId,
                  values,
                ]),
            ),
          };
        })
        .toEqual({
          key: actionBefore.key,
          unitId: actionBefore.unitId,
          poseRevision: actionBefore.poseRevision,
          presentationRevision: actionBefore.presentationRevision,
          canonicalIds: heldCanonicalIds,
          surfaceIds: heldSurfaceIds,
          materialOpacities: baselineMaterialOpacities,
          neighborOpacities: neighborOpacity,
        });
      /* oxlint-disable-next-line no-await-in-loop -- Isolate exercises the real action menu. */
      await motionMenuAction(id, 'Isolate');
      /* oxlint-disable-next-line no-await-in-loop -- Isolation binds precisely the requested canonical owner. */
      await expect
        .poll(async () => {
          const awaitedResult17 = await motionVisibility();
          return awaitedResult17.isolatedComponentIds;
        })
        .toEqual([id]);
      /* oxlint-disable-next-line no-await-in-loop -- Real isolation may draw only the requested canonical body. */
      await expect
        .poll(async () => {
          const awaitedResult18 = await readMotionDrawObservation();
          return [
            ...new Set(awaitedResult18.surfaces.filter(({ visible }) => visible).map(({ componentId }) => componentId)),
          ];
        })
        .toEqual([id]);
      /* oxlint-disable-next-line no-await-in-loop -- Capture the held root/unit/pose/candidate around the actual draft consumer. */
      const chatBefore = await readMotionDrawObservation();
      /* oxlint-disable-next-line no-await-in-loop -- The existing canonical row action inserts the reference without sending a model request. */
      await motionMenuAction(id, 'Add to chat');
      const composer = selectors.getByRole('textbox', { name: 'Ask Tau to build anything...', exact: true }).first();
      /* oxlint-disable-next-line no-await-in-loop -- Select through the actual editable UI before invoking its existing copy serialization. */
      await target.focus(composer);
      /* oxlint-disable-next-line no-await-in-loop -- Native editor selection binds the chip copied below. */
      await target.keyboardPress('ControlOrMeta+a');
      /* oxlint-disable-next-line no-await-in-loop -- Read the actual Tiptap copy output, never reconstruct its reference from the row. */
      const reference = await target.evaluateLocator(composer, (editor) => {
        const data = new DataTransfer();
        editor.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data }));
        const document = new DOMParser().parseFromString(data.getData('text/html'), 'text/html');
        const chips = document.querySelectorAll<HTMLElement>('[data-type="context-chip"][data-chip-type="geometry"]');
        if (chips.length !== 1) {
          throw new Error('Actual composer copy did not contain exactly one geometry draft reference.');
        }
        const chip = chips[0]!;
        const value: unknown = JSON.parse(chip.dataset['geometryReference'] ?? 'null');
        if (
          !value ||
          typeof value !== 'object' ||
          !('componentId' in value) ||
          !('filePath' in value) ||
          !('geometryHash' in value)
        ) {
          throw new Error('Actual draft reference lacks canonical file/root fields.');
        }
        return {
          componentId: value.componentId,
          filePath: value.filePath,
          geometryHash: value.geometryHash,
          token: chip.dataset['referenceToken'],
          id: chip.dataset['id'],
          text: data.getData('text/plain'),
        };
      });
      const token = `@cad[motion/assembly.json#${id}]`;
      expect(reference).toMatchObject({
        componentId: id,
        filePath: 'motion/assembly.json',
        geometryHash: before.key,
        token,
        id: `motion/assembly.json#${id}`,
      });
      expect(reference.text).toContain(token);
      expect(chatTokens.has(token)).toBe(false);
      chatTokens.add(token);
      /* oxlint-disable-next-line no-await-in-loop -- Release the draft context through the real editor, without any outbound provider action. */
      await target.keyboardPress('Backspace');
      /* oxlint-disable-next-line no-await-in-loop -- The existing draft must be empty before the neighboring occurrence inserts its own reference. */
      await expect.poll(async () => target.evaluateLocator(composer, (editor) => editor.textContent.trim())).toBe('');
      /* oxlint-disable-next-line no-await-in-loop -- Pose is test evidence only; the existing public reference remains canonical as-built. */
      const chatAfter = await readMotionDrawObservation();
      expect({
        key: chatAfter.key,
        unit: chatAfter.unitId,
        pose: chatAfter.poseRevision,
        candidate: chatAfter.candidateSceneId,
      }).toEqual({
        key: chatBefore.key,
        unit: chatBefore.unitId,
        pose: chatBefore.poseRevision,
        candidate: chatBefore.candidateSceneId,
      });
      const readFocusedDrawState = async () =>
        target.evaluate(
          (held) => {
            const api = (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__;
            const subject = api?.getCommittedAssembly();
            const draw = api?.getCommittedDrawInventory();
            const hover = api?.getModelHoverState();
            const root = subject?.assemblyDisplay?.root;
            if (!api || !subject || !draw || !hover || !root || !subject.isCurrent()) {
              return undefined;
            }
            const { frame } = api.getRendererIdentity({ includeRendererName: false });
            const surfaceIds = draw.surfaces.map(({ componentId }) => componentId);
            return {
              submittedFrame: Number.isFinite(frame) && frame > 0,
              rootMatches:
                root.path === held.root.path &&
                root.digest === held.root.digest &&
                root.byteLength === held.root.byteLength,
              projectId: subject.diagnostics.projectId,
              key: draw.key,
              unitId: draw.unitId,
              poseRevision: draw.poseRevision,
              presentationRevision: draw.presentationRevision,
              canonicalIds: draw.canonicalComponents.map(({ component }) => component.id).toSorted(),
              surfaceIds: surfaceIds.toSorted(),
              mountedSurfacesMatchCanonicalSubject:
                surfaceIds.length > 0 &&
                new Set(surfaceIds).size === surfaceIds.length &&
                surfaceIds.every((componentId) => held.surfaceIds.includes(componentId)),
              focusedSurfaceMountedAndVisible: draw.surfaces.some(
                ({ componentId, visible }) => componentId === held.selectedId && visible,
              ),
              pointerCandidateMatchesCurrentDraw: hover.rayParity?.candidateSceneId === draw.candidateSceneId,
              activeUnitId: hover.activeUnitId,
              selectedComponentIds: hover.selectedComponentIds,
              stockComponentId: hover.rayParity?.stockComponentId,
              tauComponentId: hover.rayParity?.tauComponentId,
              clippingEnabled: hover.rayParity?.clippingEnabled,
            };
          },
          { root: pinBefore.root, surfaceIds: heldSurfaceIds, selectedId: id },
        );
      const heldFocusedDraw = {
        submittedFrame: true,
        rootMatches: true,
        projectId: heldProjectId,
        key: chatAfter.key,
        unitId: chatAfter.unitId,
        poseRevision: chatAfter.poseRevision,
        presentationRevision: chatAfter.presentationRevision,
        canonicalIds: heldCanonicalIds,
        mountedSurfacesMatchCanonicalSubject: true,
        focusedSurfaceMountedAndVisible: true,
      };
      /* oxlint-disable-next-line no-await-in-loop -- Focus uses the actual camera and action owner. */
      await motionMenuAction(id, 'Focus on part');
      /* oxlint-disable-next-line no-await-in-loop -- A legitimate managed scene replacement must present the exact held canonical subject before pointer sampling. */
      await expect.poll(readFocusedDrawState).toMatchObject(heldFocusedDraw);
      /* oxlint-disable-next-line no-await-in-loop -- Require real visible geometry after focus, not a row-only state. */
      await expect
        .poll(async () => {
          const awaitedResult19 = await motionRendered(id);
          return awaitedResult19.visibleMeshCount;
        })
        .toBeGreaterThan(0);
      /* oxlint-disable-next-line no-await-in-loop -- Every isolated real body supplies its own screen sample; no instance-name inference. */
      const pick = await target.evaluate((componentId) => {
        const api = (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__;
        if (!api) {
          throw new Error('Existing actual model projection is unavailable.');
        }
        const points = api.projectModelComponent(componentId).filter(({ visible }) => visible);
        if (points.length === 0) {
          throw new Error('The isolated canonical body has no actual projected geometry.');
        }
        const rect = api.getViewportCanvas().getBoundingClientRect();
        const camera = api.getCamera();
        return {
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
          projection: {
            points,
            pointCount: points.length,
            sampledScreenBounds: {
              minX: Math.min(...points.map(({ x }) => x)),
              maxX: Math.max(...points.map(({ x }) => x)),
              minY: Math.min(...points.map(({ y }) => y)),
              maxY: Math.max(...points.map(({ y }) => y)),
            },
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            camera: {
              position: camera.position,
              quaternion: camera.quaternion,
              target: camera.target,
              projection: camera.projection,
              fov: camera.fov ?? null,
              zoom: camera.zoom ?? null,
              aspect: camera.aspect,
            },
          },
        };
      }, id);
      /* oxlint-disable-next-line no-await-in-loop -- A genuine pointer hover must bind the isolated part. */
      await target.mouseMove(pick.x, pick.y);
      const readHoverObservation = async () =>
        target.evaluate((componentId) => {
          type HoverState = ReturnType<AssemblyTestBridgeApi['getModelHoverState']>;
          const state: typeof globalThis & {
            __TAU_SECTION_VIEW_TEST__?: Omit<AssemblyTestBridgeApi, 'getModelHoverState'> & {
              getModelHoverState(): Omit<HoverState, 'rayParity'> & {
                rayParity?: NonNullable<HoverState['rayParity']> &
                  Readonly<{
                    ray: Readonly<{
                      origin: readonly number[];
                      direction: readonly number[];
                      near: number;
                      far: number | string;
                      layers: number;
                    }>;
                    cameraMatrixWorld: readonly number[];
                    cameraProjectionMatrix: readonly number[];
                    candidateMatrixWorld: readonly number[];
                    rendererFrame: number;
                    pickableMeshCount: number;
                    poseRevision: number;
                    presentationRevision: number;
                  }>;
              };
            };
          } = globalThis;
          const api = state.__TAU_SECTION_VIEW_TEST__;
          if (!api) {
            return undefined;
          }
          // Retain the original hover read before later root/draw control observations.
          const hover = api.getModelHoverState();
          const capture = api.getCommittedAssembly();
          const draw = api.getCommittedDrawInventory();
          const parity = hover.rayParity;
          const surfaces = draw?.surfaces.filter((surface) => surface.componentId === componentId);
          return {
            hoveredComponentId: hover.hoveredComponentId,
            identities: {
              project: capture.diagnostics.projectId,
              unit: draw?.unitId,
              activeUnit: hover.activeUnitId,
              candidate: draw?.candidateSceneId,
              drawKey: draw?.key,
              rayCandidate: parity?.candidateSceneId,
              stock: parity?.stockComponentId,
              tau: parity?.tauComponentId,
            },
            scalars: {
              captureCurrent: capture.isCurrent(),
              rootDigest: capture.assemblyDisplay?.root.digest ?? null,
              rootByteLength: capture.assemblyDisplay?.root.byteLength ?? null,
              poseRevision: draw?.poseRevision ?? null,
              presentationRevision: draw?.presentationRevision ?? null,
              pointerCandidateMatchesCurrentDraw:
                parity === undefined || draw === undefined ? null : parity.candidateSceneId === draw.candidateSceneId,
              pointer: parity?.pointer ?? null,
              ray: parity?.ray ?? null,
              rayPoseRevision: parity?.poseRevision ?? null,
              rayPresentationRevision: parity?.presentationRevision ?? null,
              clippingEnabled: parity?.clippingEnabled ?? null,
              rendererFrame: parity?.rendererFrame ?? null,
              cameraMatrixWorld: parity?.cameraMatrixWorld ?? null,
              cameraProjectionMatrix: parity?.cameraProjectionMatrix ?? null,
              candidateMatrixWorld: parity?.candidateMatrixWorld ?? null,
              pickableMeshCount: parity?.pickableMeshCount ?? null,
              selectedSurfaceCount: surfaces?.length ?? null,
              selectedSurfaces:
                surfaces?.map((surface) => ({
                  visible: surface.visible,
                  instanceId: surface.instanceId ?? null,
                  canonicalRenderBounds: surface.canonicalRenderBounds,
                  drawMatrixWorld: surface.drawMatrixWorld,
                })) ?? null,
            },
          };
        }, id);
      const hoverObservation: { current: Awaited<ReturnType<typeof readHoverObservation>> } = { current: undefined };
      try {
        /* oxlint-disable-next-line no-await-in-loop -- Preserve actual canonical hover equality for every group. */
        await expect
          .poll(async () => {
            hoverObservation.current = await readHoverObservation();
            return hoverObservation.current?.hoveredComponentId;
          })
          .toBe(id);
      } catch (error) {
        try {
          const observation = hoverObservation.current;
          const identitySha256 = async (value: string | undefined) =>
            value === undefined
              ? null
              : `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
                  .map((byte) => byte.toString(16).padStart(2, '0'))
                  .join('')}`;
          const identities = { expected: id, observed: observation?.hoveredComponentId, ...observation?.identities };
          /* oxlint-disable-next-line no-await-in-loop -- Read the existing joined control once on failure, without another gesture or retry. */
          const [identityHashes, focused] = await Promise.all([
            Promise.all(
              Object.entries(identities).map(
                async ([name, value]) =>
                  [name, { sha256: await identitySha256(value), absent: value === undefined }] as const,
              ),
            ),
            readFocusedDrawState(),
          ]);
          /* oxlint-disable-next-line no-await-in-loop -- Only bounded primitives and hashes leave the failed pointer seam. */
          await target.writeArtifact(
            `c6-${backend}-primary-hover-failure.json`,
            JSON.stringify(
              {
                completedGroupCount: completed.length,
                heldRoot: { digest: pinBefore.root.digest, byteLength: pinBefore.root.byteLength },
                heldPoseRevision: chatAfter.poseRevision,
                heldPresentationRevision: chatAfter.presentationRevision,
                chosenSample: { x: pick.x, y: pick.y },
                projection: pick.projection,
                identityHashes: Object.fromEntries(identityHashes),
                observation: observation?.scalars ?? null,
                focusedControl: focused
                  ? {
                      submittedFrame: focused.submittedFrame,
                      rootMatches: focused.rootMatches,
                      poseRevision: focused.poseRevision,
                      presentationRevision: focused.presentationRevision,
                      focusedSurfaceMountedAndVisible: focused.focusedSurfaceMountedAndVisible,
                      mountedSurfacesMatchCanonicalSubject: focused.mountedSurfacesMatchCanonicalSubject,
                      pointerCandidateMatchesCurrentDraw: focused.pointerCandidateMatchesCurrentDraw,
                      clippingEnabled: focused.clippingEnabled ?? null,
                    }
                  : null,
              },
              undefined,
              2,
            ),
          );
        } catch {
          // Diagnostics must not replace the original canonical hover failure.
        }
        throw error;
      }
      /* oxlint-disable-next-line no-await-in-loop -- Focus selects the real canonical owner before either viewport toggle. */
      await expect.poll(readFocusedDrawState).toMatchObject({
        ...heldFocusedDraw,
        activeUnitId: chatAfter.unitId,
        selectedComponentIds: [id],
        pointerCandidateMatchesCurrentDraw: true,
        stockComponentId: id,
        tauComponentId: id,
        clippingEnabled: false,
      });
      /* oxlint-disable-next-line no-await-in-loop -- The first real viewport gesture toggles the already focused selection off. */
      await target.mouseDown();
      /* oxlint-disable-next-line no-await-in-loop -- Complete the native pointer gesture. */
      await target.mouseUp();
      /* oxlint-disable-next-line no-await-in-loop -- Require the real off transition while preserving the same canonical ray owner. */
      await expect.poll(readFocusedDrawState).toMatchObject({
        ...heldFocusedDraw,
        activeUnitId: chatAfter.unitId,
        selectedComponentIds: [],
        pointerCandidateMatchesCurrentDraw: true,
        stockComponentId: id,
        tauComponentId: id,
        clippingEnabled: false,
      });
      /* oxlint-disable-next-line no-await-in-loop -- A second genuine viewport gesture must select that same canonical occurrence. */
      await target.mouseDown();
      /* oxlint-disable-next-line no-await-in-loop -- Complete the second native pointer gesture. */
      await target.mouseUp();
      /* oxlint-disable-next-line no-await-in-loop -- Canonical selection and same-ray stock parity must agree. */
      await expect.poll(readFocusedDrawState).toMatchObject({
        ...heldFocusedDraw,
        activeUnitId: chatAfter.unitId,
        selectedComponentIds: [id],
        pointerCandidateMatchesCurrentDraw: true,
        stockComponentId: id,
        tauComponentId: id,
        clippingEnabled: false,
      });
      /* oxlint-disable-next-line no-await-in-loop -- Whole-body extent is a mesh consumer; exact native roundtrip is separately explicit. */
      await prepareMotionBodyMeasure('extent-x');
      /* oxlint-disable-next-line no-await-in-loop -- Retain the actual measurement list before selecting this canonical body. */
      const awaitedResult20 = await motionMeasureState();
      const priorMeasures = new Set(awaitedResult20.measurements.map(({ id: measurementId }) => measurementId));
      /* oxlint-disable-next-line no-await-in-loop -- Canonical ID is resolved through the current actual object UUID/catalog binding. */
      await chooseMotionBody(id);
      /* oxlint-disable-next-line no-await-in-loop -- Require one actual settled mesh measurement for this occurrence. */
      await expect
        .poll(async () => {
          const awaitedResult21 = await motionMeasureState();
          return awaitedResult21.measurements.find(({ id: measurementId }) => !priorMeasures.has(measurementId))
            ?.status;
        })
        .toBe('current');
      /* oxlint-disable-next-line no-await-in-loop -- Observe the real distance result before sectioning. */
      const awaitedResult22 = await motionMeasureState();
      const extent = awaitedResult22.measurements.find(({ id: measurementId }) => !priorMeasures.has(measurementId));
      expect(extent).toMatchObject({ operation: 'extent-x', quality: 'mesh', status: 'current' });
      /* oxlint-disable-next-line no-await-in-loop -- Independent authored corners and observed driver coordinate define this extent; no measured bounds feed the expectation. */
      const expectedExtentMeters = await expectedMotionExtentX(actionBefore, id);
      expect(extent?.distance).toBeCloseTo(expectedExtentMeters, 6);
      if (extent?.distance === undefined) {
        throw new Error('Actual whole-body extent did not return a finite distance.');
      }
      /* oxlint-disable-next-line no-await-in-loop -- Exit the actual measure mode before section/pick controls. */
      await target.click(selectors.getByRole('button', { name: /^measure$/iu, pressed: true }));
      /* oxlint-disable-next-line no-await-in-loop -- Actual camera/render frame converts the current body centre into Tau section space. */
      await target.evaluate((componentId) => {
        const api = (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__;
        const draw = api?.getCommittedDrawInventory();
        const row = draw?.surfaces.find((surface) => surface.componentId === componentId);
        if (!api || !row) {
          throw new Error('Current body section frame is unavailable.');
        }
        const frame = api.getRenderFrame();
        const offset =
          frame.originMeters[0]! +
          ((row.canonicalRenderBounds.min[0]! + row.canonicalRenderBounds.max[0]!) / 2) * frame.metersPerRenderUnit;
        api.setSectionCuts([{ kind: 'plane', plane: 'yz', offset, isFlipped: false }]);
        api.setSectionViewActive(true);
      }, id);
      /* oxlint-disable-next-line no-await-in-loop -- Wait for certified section topology, not only the requested plane. */
      await target.waitFor(
        () => (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getSectionState().isCommitted,
        undefined,
        { timeout: 30_000 },
      );
      /* oxlint-disable-next-line no-await-in-loop -- Require genuine capped geometry from the actual section consumer. */
      const cap = await target.evaluate(
        () => (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getSectionCapCompleteness() ?? null,
      );
      expect(cap?.status).toBe('complete');
      expect(cap?.trueCutComponentCount).toBeGreaterThan(0);
      expect(cap?.cappedTrueCutComponentCount).toBe(cap?.trueCutComponentCount);
      expect(cap?.unsupportedSourceCount).toBe(0);
      /* oxlint-disable-next-line no-await-in-loop -- Reuse real projected geometry and the committed clip owner for the same pointer ray. */
      const clippedSamples = await target.evaluate((componentId) => {
        const points =
          (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__
            ?.projectModelComponent(componentId)
            .filter(({ visible }) => visible) ?? [];
        if (points.length === 0) {
          throw new Error('The sectioned real body has no viewport footprint.');
        }
        const center = {
          x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
          y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        };
        return [
          center,
          ...points.map((point) => ({ x: center.x * 0.2 + point.x * 0.8, y: center.y * 0.2 + point.y * 0.8 })),
        ];
      }, id);
      let clippedParity = false;
      let retainedSample: ScreenPoint | undefined;
      for (const sample of clippedSamples) {
        /* oxlint-disable-next-line no-await-in-loop -- Each bounded sample is an actual pointer query against the same committed cut. */
        await target.mouseMove(sample.x, sample.y);
        /* oxlint-disable-next-line no-await-in-loop -- Read the real raycaster/clip owner after that pointer event. */
        const hit = await target.evaluate(() =>
          (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getModelHoverState(),
        );
        if (
          hit?.hoveredComponentId === id &&
          hit.rayParity?.clippingEnabled === true &&
          hit.rayParity.stockComponentId === id &&
          hit.rayParity.tauComponentId === id
        ) {
          clippedParity = true;
          retainedSample = sample;
          break;
        }
      }
      expect(clippedParity).toBe(true);
      if (component.name === 'Link c0 b0') {
        const ancestry = before.canonicalComponents.find(({ component: item }) => item.id === id)?.ancestry;
        if (ancestry?.length !== 1 || !retainedSample) {
          throw new Error('Representative clipped ray has no actual flat occurrence binding.');
        }
        const occurrenceKey = JSON.stringify(ancestry);
        expect(removedRayOccurrences.has(occurrenceKey)).toBe(false);
        /* oxlint-disable-next-line no-await-in-loop -- Hold the actual camera/root/candidate before the controlled removed-versus-retained ray. */
        const held = await readMotionDrawObservation();
        /* oxlint-disable-next-line no-await-in-loop -- Camera authority must remain fixed through both queries. */
        const heldCamera = await target.evaluate(() =>
          (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getCamera(),
        );
        /* oxlint-disable-next-line no-await-in-loop -- The same exact pointer must first genuinely hit this real body without clipping. */
        const retainedRay = await target.evaluate(() =>
          (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getModelHoverState(),
        );
        if (!retainedRay?.rayParity) {
          throw new Error('Current pointer parity authority is absent.');
        }
        const retainedPointer = retainedRay.rayParity.pointer;
        expect(retainedRay).toMatchObject({
          hoveredComponentId: id,
          rayParity: {
            candidateSceneId: held.candidateSceneId,
            clippingEnabled: true,
            unclippedStockComponentId: id,
            stockComponentId: id,
            tauComponentId: id,
          },
        });
        /* oxlint-disable-next-line no-await-in-loop -- Replace only the committed cut through the existing section owner; remove the entire isolated body. */
        await target.evaluate((componentId) => {
          const api = (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__;
          const row = api?.getCommittedDrawInventory()?.surfaces.find((surface) => surface.componentId === componentId);
          if (!api || !row) {
            throw new Error('Current clipped body frame is absent.');
          }
          const frame = api.getRenderFrame();
          const minimum = frame.originMeters[0]! + row.canonicalRenderBounds.min[0]! * frame.metersPerRenderUnit;
          const width =
            (row.canonicalRenderBounds.max[0]! - row.canonicalRenderBounds.min[0]!) * frame.metersPerRenderUnit;
          api.setSectionCuts([
            { kind: 'plane', plane: 'yz', offset: minimum - Math.max(width * 0.1, 0.000001), isFlipped: false },
          ]);
          api.setSectionViewActive(true);
        }, id);
        /* oxlint-disable-next-line no-await-in-loop -- Both negative queries use the actual certified cut, not a requested-only plane. */
        await target.waitFor(
          () => (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getSectionState().isCommitted,
          undefined,
          { timeout: 30_000 },
        );
        /* oxlint-disable-next-line no-await-in-loop -- Force a real pointer update, then return to the original ray without changing the camera. */
        await target.mouseMove(retainedSample.x + 0.5, retainedSample.y);
        /* oxlint-disable-next-line no-await-in-loop -- The final pointer is exactly the original positive sample. */
        await target.mouseMove(retainedSample.x, retainedSample.y);
        /* oxlint-disable-next-line no-await-in-loop -- Ignoring clipping would return id here and fail; actual hover must clear as well. */
        await expect
          .poll(async () => {
            const state = await target.evaluate(() =>
              (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getModelHoverState(),
            );
            return (
              state?.rayParity !== undefined &&
              state.rayParity.candidateSceneId === held.candidateSceneId &&
              state.rayParity.clippingEnabled &&
              state.rayParity.pointer[0] === retainedPointer[0] &&
              state.rayParity.pointer[1] === retainedPointer[1] &&
              state.rayParity.unclippedStockComponentId === id &&
              state.rayParity.stockComponentId === undefined &&
              state.rayParity.tauComponentId === undefined &&
              state.hoveredComponentId === undefined
            );
          })
          .toBe(true);
        /* oxlint-disable-next-line no-await-in-loop -- Restore the original partial cut and prove the same retained ray returns the canonical body again. */
        await target.evaluate((componentId) => {
          const api = (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__;
          const row = api?.getCommittedDrawInventory()?.surfaces.find((surface) => surface.componentId === componentId);
          if (!api || !row) {
            throw new Error('Current retained body frame is absent.');
          }
          const frame = api.getRenderFrame();
          const offset =
            frame.originMeters[0]! +
            ((row.canonicalRenderBounds.min[0]! + row.canonicalRenderBounds.max[0]!) / 2) * frame.metersPerRenderUnit;
          api.setSectionCuts([{ kind: 'plane', plane: 'yz', offset, isFlipped: false }]);
          api.setSectionViewActive(true);
        }, id);
        /* oxlint-disable-next-line no-await-in-loop -- Reacquire the same committed partial cut before the positive query. */
        await target.waitFor(
          () => (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getSectionState().isCommitted,
          undefined,
          { timeout: 30_000 },
        );
        /* oxlint-disable-next-line no-await-in-loop -- Restore the identical actual ray after cut commit. */
        await target.mouseMove(retainedSample.x + 0.5, retainedSample.y);
        /* oxlint-disable-next-line no-await-in-loop -- Same pointer, camera and paused pose as the removed query. */
        await target.mouseMove(retainedSample.x, retainedSample.y);
        /* oxlint-disable-next-line no-await-in-loop -- Require actual pointer hover, Tau and clipped stock positives again. */
        await expect
          .poll(async () =>
            target.evaluate(() => (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getModelHoverState()),
          )
          .toMatchObject({
            hoveredComponentId: id,
            rayParity: {
              candidateSceneId: held.candidateSceneId,
              pointer: retainedPointer,
              clippingEnabled: true,
              unclippedStockComponentId: id,
              stockComponentId: id,
              tauComponentId: id,
            },
          });
        /* oxlint-disable-next-line no-await-in-loop -- Actual held root/unit/pose/candidate and camera must survive both cut states. */
        const restored = await readMotionDrawObservation();
        expect({
          key: restored.key,
          unit: restored.unitId,
          pose: restored.poseRevision,
          candidate: restored.candidateSceneId,
        }).toEqual({ key: held.key, unit: held.unitId, pose: held.poseRevision, candidate: held.candidateSceneId });
        expect(
          /* oxlint-disable-next-line no-await-in-loop -- The real UI/pose observation is ordered on one viewport; the next gesture or frame depends on this settled result. */
          await target.evaluate(() => (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getCamera()),
        ).toEqual(heldCamera);
        removedRayOccurrences.add(occurrenceKey);
        removedRayEvidence.push({
          ancestry,
          componentId: id,
          candidateSceneId: held.candidateSceneId,
          pointer: retainedSample,
        });
      }

      /* oxlint-disable-next-line no-await-in-loop -- Hold the actual current paused draw before restoring section, isolation and camera. */
      const restorationHeld = await readMotionDrawObservation();
      expect(restorationHeld.key).toBe(before.key);
      expect(restorationHeld.unitId).toBe(before.unitId);
      expect(restorationHeld.poseRevision).toBe(before.poseRevision);
      expect(restorationHeld.presentationRevision).toBe(before.presentationRevision);
      /* oxlint-disable-next-line no-await-in-loop -- Disable section before restoring this occurrence's isolation. */
      await target.evaluate(() =>
        (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.setSectionViewActive(false),
      );
      /* oxlint-disable-next-line no-await-in-loop -- Remove isolation with its real menu action. */
      await motionMenuAction(id, 'Remove isolation');
      /* oxlint-disable-next-line no-await-in-loop -- Capture this request's synchronous accepted camera at its real native endpoint. */
      const cameraRequest = await target.evaluate((pose) => {
        const api = (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__;
        if (!api) {
          throw new Error('The actual restoration camera owner is absent.');
        }
        const { frame } = api.getRendererIdentity({ includeRendererName: false });
        api.setCamera(pose);
        return { frame, accepted: api.getCamera() };
      }, camera);
      expect(cameraRequest.accepted).toMatchObject({
        actorStatus: 'active',
        projection: camera.projection,
        bounds: camera.bounds,
        target: camera.target,
        fov: camera.fov,
        zoom: camera.zoom,
        aspect: camera.aspect,
      });
      const acceptedCamera = {
        actorStatus: cameraRequest.accepted.actorStatus,
        projection: cameraRequest.accepted.projection,
        bounds: cameraRequest.accepted.bounds,
        target: cameraRequest.accepted.target,
        direction: cameraRequest.accepted.direction,
        up: cameraRequest.accepted.up,
        verticalSpan: cameraRequest.accepted.verticalSpan,
        requestedFov: cameraRequest.accepted.requestedFov,
        requestedPerspectiveZoom: cameraRequest.accepted.requestedPerspectiveZoom,
        position: cameraRequest.accepted.position,
        quaternion: cameraRequest.accepted.quaternion,
        fov: cameraRequest.accepted.fov,
        zoom: cameraRequest.accepted.zoom,
        aspect: cameraRequest.accepted.aspect,
      };
      /* oxlint-disable-next-line no-await-in-loop -- Restore full canonical residency on a newer actual frame before the original direct draw assertions. */
      await expect
        .poll(async () =>
          target.evaluate(
            (held) => {
              const api = (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__;
              const subject = api?.getCommittedAssembly();
              const draw = api?.getCommittedDrawInventory();
              const root = subject?.assemblyDisplay?.root;
              if (!api || !subject?.isCurrent() || !draw || !root) {
                return undefined;
              }
              const { frame } = api.getRendererIdentity({ includeRendererName: false });
              return {
                root,
                projectId: subject.diagnostics.projectId,
                key: draw.key,
                unitId: draw.unitId,
                poseRevision: draw.poseRevision,
                presentationRevision: draw.presentationRevision,
                canonicalIds: draw.canonicalComponents.map(({ component }) => component.id).toSorted(),
                surfaceIds: draw.surfaces.map(({ componentId }) => componentId).toSorted(),
                newerFrame: Number.isFinite(frame) && frame > 0 && frame > held.frame,
                section: api.getSectionState(),
                camera: api.getCamera(),
              };
            },
            { frame: cameraRequest.frame },
          ),
        )
        .toMatchObject({
          root: pinBefore.root,
          projectId: heldProjectId,
          key: restorationHeld.key,
          unitId: restorationHeld.unitId,
          poseRevision: restorationHeld.poseRevision,
          presentationRevision: restorationHeld.presentationRevision,
          canonicalIds: heldCanonicalIds,
          surfaceIds: heldSurfaceIds,
          newerFrame: true,
          section: {
            isActive: false,
            isCommitted: false,
            certification: 'certified',
            committedCuts: [],
            committedPieces: [],
          },
          camera: acceptedCamera,
        });
      /* oxlint-disable-next-line no-await-in-loop -- Each finished action group must retain the actual same immutable root. */
      const settled = await readMotionDrawObservation();
      expect(settled.key).toBe(before.key);
      expect(settled.unitId).toBe(before.unitId);
      completed.push({
        componentId: id,
        extentMeters: extent.distance,
        expectedExtentMeters,
        chatToken: token,
        clippedStockParity: clippedParity,
        actions: [
          'hide',
          'show',
          'isolate',
          'focus',
          'tau-pick',
          'stock-clipped-ray-parity',
          'viewport-canonical-selection',
          'as-built-chat-reference-and-release',
          'occurrence-opacity',
          'mesh-measure',
          'certified-section',
          'remove-isolation',
        ],
      });
    }
    expect(completed.map(({ componentId }) => componentId)).toEqual(canonicalIds);
    expect(chatTokens.size).toBe(104);
    expect(removedRayOccurrences.size).toBe(4);
    expect(await readMotionPinBytes()).toEqual(pinBefore);
    await target.writeArtifact(
      `c6-native100-${backend}-all-occurrence-actions.json`,
      JSON.stringify({ completed, removedRayEvidence }, undefined, 2),
    );
    await target.screenshot(selectors.getByCss('body'), `c6-native100-${backend}-all-occurrence-actions.png`);
  }, 4_200_000);
}

for (const backend of ['webgl', 'webgpu'] as const) {
  test(`C6 native100 should reopen the managed pin and request posed exact minimum after its author sources are removed on ${backend}`, async () => {
    const workerAsset = inject('motionExactWorkerAsset');
    if (workerAsset === undefined) {
      throw new Error('Native motion proof requires the source-qualified current production worker manifest.');
    }
    await target.addInitScript(installMotionExactWorkerObservation, workerAsset.path);
    const authored = await openFiniteMovingLinks(backend);
    const pin = await readMotionPinBytes();
    await revealMotionFile(pin.root.path);
    await target.click(motionFile(pin.root.path), { button: 'right' });
    await target.click(selectors.getByRole('menuitem', { name: 'Open in Viewer', exact: true }));
    await target.waitFor(
      (key) => {
        const draw = (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedDrawInventory();
        return draw?.key === key;
      },
      pin.root.digest,
      { timeout: 120_000 },
    );
    const managed = await readMotionDrawObservation();
    expect(managed.key).toBe(authored.key);
    expect(managed.unitId).not.toBe(authored.unitId);
    const projectId = await target.evaluate(
      () => (globalThis as MotionBrowserWindow).__TAU_SECTION_VIEW_TEST__?.getCommittedAssembly().diagnostics.projectId,
    );
    if (!projectId) {
      throw new Error('Managed reopen lost the actual initial authored project.');
    }
    const canonicalIds = managed.canonicalComponents.map(({ component }) => component.id);
    expect(canonicalIds).toHaveLength(authored.canonicalComponents.length);
    expect(new Set(canonicalIds)).toEqual(new Set(authored.canonicalComponents.map(({ component }) => component.id)));
    const handoff: MotionManagedHandoff = {
      root: pin.root,
      projectId,
      authoredUnitId: authored.unitId,
      unitId: managed.unitId,
      canonicalIds,
    };
    await assertMotionManagedHandoff(handoff);
    // The new unit owns the current display; original project/root/recipe bytes and canonical IDs remain exact.
    await removeUnchangedMotionSource('motion/parts/chain.js', handoff);
    await removeUnchangedMotionSource('motion/assembly.json', handoff);
    expect(await readMotionPinBytes()).toEqual(pin);
    await openKinematicsPane();
    await target.click(selectors.getByRole('button', { name: /^Animation:/u }));
    await target.click(selectors.getByTestId('kinematics-animation-sweep'));
    const play = selectors.getByTestId('kinematics-play');
    const awaitedResult23 = await target.read(play);
    if (awaitedResult23.visible) {
      await target.click(play);
    }
    await expect
      .poll(async () =>
        target.evaluate((unit) => {
          const browser: MotionBrowserWindow = globalThis;
          return Object.values(browser.__TAU_KINEMATICS_TEST__?.getState(unit)?.coordinates ?? {}).some(
            (value) => Math.abs(value) > 1e-4,
          );
        }, managed.unitId),
      )
      .toBe(true);
    await target.click(selectors.getByTestId('kinematics-pause'));
    const posed = await readMotionDrawObservation();
    expect(posed.poseRevision).toBeGreaterThan(managed.poseRevision);
    const ancestry = posed.canonicalComponents.find(({ component }) => component.name === 'Link c0 b0')?.ancestry;
    if (!ancestry) {
      throw new Error('Missing actual admitted body ancestry.');
    }
    const pair = posed.canonicalComponents.filter(
      ({ ancestry: path, component }) =>
        JSON.stringify(path) === JSON.stringify(ancestry) &&
        (component.name === 'Link c0 b0' || component.name === 'Link c4 b0'),
    );
    expect(pair).toHaveLength(2);
    await target.evaluate(
      ({ key, unitId, poseRevision, candidateSceneId, names }) => {
        const browser: MotionExactObservationWindow = globalThis;
        const observer = browser.__TAU_C6_EXACT_OBSERVATION__;
        if (!observer) {
          throw new Error('Real worker observer was not installed before navigation.');
        }
        observer.arm({ key, unitId, poseRevision, candidateSceneId, names });
      },
      {
        key: posed.key,
        unitId: posed.unitId,
        poseRevision: posed.poseRevision,
        candidateSceneId: posed.candidateSceneId,
        names: [pair[0]!.component.id, pair[1]!.component.id] as const,
      },
    );
    const result = await explicitMotionMinimum(pair[0]!.component.id, pair[1]!.component.id);
    const observed = await target.evaluate(() => {
      const browser: MotionExactObservationWindow = globalThis;
      return browser.__TAU_C6_EXACT_OBSERVATION__?.read() ?? null;
    });
    if (!observed || Boolean(observed.failure) || !observed.response || observed.bytes.length === 0) {
      throw new Error(observed?.failure ?? 'The real exact worker request/response was not observed.');
    }
    expect(observed.id).toBe(observed.response.id);
    expect(observed.response.status).toBe('cad-geometry');
    expect(observed.response.distanceMeters).toBeCloseTo(result.distance, 10);
    expect(observed.binding).toEqual({
      key: posed.key,
      unitId: posed.unitId,
      poseRevision: posed.poseRevision,
      candidateSceneId: posed.candidateSceneId,
      names: [pair[0]!.component.id, pair[1]!.component.id],
    });
    const expectedNative: Array<MotionNativeOracleInput['expected'][number]> = [];
    for (const { component } of posed.canonicalComponents.filter(({ component }) =>
      posed.surfaces.some(({ componentId }) => componentId === component.id),
    )) {
      // Observed export is numeric Y-up millimetres: native source S-once/pose/O has already been independently
      // converted to canonical GLTF Y-up above. Geometry probes use these raw byte coordinates without rotation.
      /* oxlint-disable-next-line no-await-in-loop -- The real UI/pose observation is ordered on one viewport; the next gesture or frame depends on this settled result. */
      const awaitedResult24 = await expectedMotionCanonicalCorners(posed, component.id, handoff);
      const corners = awaitedResult24.map(([x, y, z]) => [x * 1000, y * 1000, z * 1000] as const);
      const minimum = (axis: number) => Math.min(...corners.map((point) => point[axis]!));
      const maximum = (axis: number) => Math.max(...corners.map((point) => point[axis]!));
      expectedNative.push({
        id: component.id,
        corners,
        min: [minimum(0), minimum(1), minimum(2)] as const,
        max: [maximum(0), maximum(1), maximum(2)] as const,
      });
    }
    // Full current-pose geometry is a separate real export, not a relabelled pair worker request.
    const posedExport = await target.evaluate(async () => {
      const browser: MotionBrowserWindow = globalThis;
      const bridge = browser.__TAU_SECTION_VIEW_TEST__;
      if (!bridge) {
        throw new Error('The actual full-pose debug owner is absent.');
      }
      return bridge.exportCurrentPosedAssembly();
    });
    expect(posedExport.canonicalIds).toHaveLength(104);
    expect(new Set(posedExport.canonicalIds)).toEqual(new Set(expectedNative.map(({ id }) => id)));
    expect(posedExport).toMatchObject({
      root: pin.root,
      projectId,
      sourceEntryPath: pin.root.path,
      key: posed.key,
      unitId: posed.unitId,
      poseRevision: posed.poseRevision,
      presentationRevision: posed.presentationRevision,
      candidateSceneId: posed.candidateSceneId,
      coordinateSystem: 'y-up',
    });
    const secondNative = await target.motionNativeOracle({
      observation: observed,
      expected: expectedNative,
      posedExport,
    });
    const nativeBytes = Uint8Array.from(posedExport.bytes);
    const pairBytes = Uint8Array.from(observed.bytes);
    const pairDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', pairBytes))]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    const nativeDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', nativeBytes))]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    await target.writeArtifact(
      `c6-native100-${backend}-actual-posed-ap242.base64.json`,
      JSON.stringify(
        {
          base64: uint8ArrayToBase64(nativeBytes),
          byteLength: nativeBytes.byteLength,
          sha256: nativeDigest,
          fullPosedExport: { ...posedExport, bytes: undefined },
          separatePairRequest: {
            binding: observed.binding,
            requestId: observed.id,
            response: observed.response,
            sha256: pairDigest,
            byteLength: pairBytes.byteLength,
          },
        },
        undefined,
        2,
      ),
    );

    const current = await readMotionDrawObservation();
    expect({
      key: current.key,
      unit: current.unitId,
      pose: current.poseRevision,
      candidate: current.candidateSceneId,
    }).toEqual({
      key: posed.key,
      unit: posed.unitId,
      pose: posed.poseRevision,
      candidate: posed.candidateSceneId,
    });
    expect(await readMotionPinBytes()).toEqual(pin);
    await target.writeArtifact(
      `c6-native100-${backend}-sourcefree-actual-exact.json`,
      JSON.stringify(
        {
          root: pin.root,
          actualCanonicalIds: pair.map(({ component }) => component.id),
          unitId: posed.unitId,
          poseRevision: posed.poseRevision,
          result,
          fullPosedNativeBytes: {
            sha256: nativeDigest,
            byteLength: nativeBytes.byteLength,
            exportId: posedExport.exportId,
          },
          separatePairRequest: {
            requestId: observed.id,
            binding: observed.binding,
            response: observed.response,
            sha256: pairDigest,
            byteLength: pairBytes.byteLength,
          },
          extraNativeWork: { fullPosedPublishedExports: 1, outsideAnimationAndTimingIntervals: true },
          independentSecondNativeOracle: secondNative,
        },
        undefined,
        2,
      ),
    );
    // The second engine checks full current-pose geometry and the separate genuine pair bytes outside all animation/timing intervals.
  });
}

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Vitest's ProvidedContext requires interface declaration merging. */ /* oxlint-disable-next-line typescript/consistent-type-definitions -- Vitest's ProvidedContext requires interface declaration merging. */
  export interface ProvidedContext {
    motionExactWorkerAsset?: Readonly<{ path: string; sha256: string; sourceMapSha256: string }>;
  }
}
