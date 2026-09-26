import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

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

type KinematicsBridgeWindow = Window & {
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
    // oxlint-disable-next-line no-await-in-loop -- Each candidate is verified against the live hover raycast in turn.
    await target.mouseMove(candidate.x, candidate.y);
    for (let attempt = 0; attempt < 5; attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- Hover state updates only after the pointer move is processed.
      await target.delay(80);
      // oxlint-disable-next-line no-await-in-loop -- Polling the browser-side hover state at a fixed cadence.
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
    // oxlint-disable-next-line no-await-in-loop -- A drag is a sequence of pointer moves, one per frame.
    await target.mouseMove(start.x + (offset.x * step) / steps, start.y + (offset.y * step) / steps);
    // oxlint-disable-next-line no-await-in-loop -- Lets the rAF-coalesced drag solve each move.
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

const dofField = (dofId: string) => selectors.getByTestId(`kinematics-dof-${dofId}`).getByRole('textbox');

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
      // oxlint-disable-next-line no-await-in-loop -- One bridge read per link.
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
    await target.expectValue(dofField('carrier'), '22.5');
    await target.expectValue(dofField('planet-1'), '-67.5');

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

    await target.click(selectors.getByTestId('kinematics-reset'));
    await expect.poll(async () => readStateField('coordinates'), { timeout: 10_000 }).toEqual({ sun: 0 });
    expect(await readStateField('playback')).toMatchObject({ status: 'stopped', time: 0 });
    for (const componentId of planetary.links) {
      // oxlint-disable-next-line no-await-in-loop -- One bridge read per link.
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
      // oxlint-disable-next-line no-await-in-loop -- Pointer moves on a grounded part are sampled one at a time.
      await target.mouseMove(press.x + step * 5, press.y + step * 5);
      // oxlint-disable-next-line no-await-in-loop -- The drag state is read after each move.
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
