import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type State = Readonly<{
  coordinates: Readonly<Record<string, number>>;
  revision: number;
  playback: Readonly<{ status: 'stopped' | 'playing' | 'paused'; animationId?: string; time: number }>;
}>;
type BufferCounts = Readonly<{ allocations: number; updates: number }>;
type ViewerWindow = typeof globalThis & {
  __TAU_KINEMATICS_TEST__?: {
    getState(unitId: string): State | undefined;
    getComponentWorldMatrix(unitId: string, componentId: string): number[] | undefined;
  };
  __TAU_SECTION_VIEW_TEST__?: {
    getViewportCanvas(): HTMLCanvasElement;
    getModelComponents(): ReadonlyArray<{ id: string; name: string }>;
    getRendererIdentity(): Readonly<{ api: 'webgl' | 'webgpu'; name: string; frame: number }>;
  };
  __TAU_PICOVOXEL_BUFFER_TEST__?: { read(context: WebGL2RenderingContext): BufferCounts };
};

const unitId = 'file:main.ts';
const names = [
  'Base plate',
  'Near guide rail',
  'Far guide rail',
  'Front bearing block',
  'Rear bearing block',
  'Lead screw',
  'Handwheel',
  'Handwheel handle',
  'Carriage',
  'Bronze drive nut',
] as const;
const component = (index: number): string => `component:node-${index}`;
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const field = (id: string) => selectors.getByTestId(`kinematics-dof-${id}`).getByRole('spinbutton');

async function openCommand(name: string): Promise<void> {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), name);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`, 'u') }));
}

async function activateKinematics(): Promise<void> {
  await target.click(selectors.getByCss('.dv-tab[aria-label="Kinematics"]'));
  await target.expectVisible(selectors.getByTestId('kinematics-pane'));
}

async function state(): Promise<State> {
  const value = await target.evaluate(
    (unit) => (globalThis as ViewerWindow).__TAU_KINEMATICS_TEST__?.getState(unit),
    unitId,
  );
  if (!value) {
    throw new Error('Shipped PicoVoxel fixture has no kinematics state.');
  }
  return value;
}

async function stateField<Key extends keyof State>(key: Key): Promise<State[Key]> {
  const current = await state();
  return current[key];
}

async function matrices(): Promise<ReadonlyArray<readonly number[]>> {
  return target.evaluate((unit) => {
    const bridge = (globalThis as ViewerWindow).__TAU_KINEMATICS_TEST__;
    return Array.from({ length: 10 }, (_, index) => {
      const matrix = bridge?.getComponentWorldMatrix(unit, `component:node-${index}`);
      if (!matrix) {
        throw new Error(`Missing rendered component ${index}.`);
      }
      return matrix;
    });
  }, unitId);
}

function expectAsBuilt(values: ReadonlyArray<readonly number[]>): void {
  for (const [index, matrix] of values.entries()) {
    for (const [entry, value] of matrix.entries()) {
      expect(value, `${names[index]} as-built entry ${entry}`).toBeCloseTo(identity[entry]!, 9);
    }
  }
}

function expectPose(values: ReadonlyArray<readonly number[]>, degrees: number, millimetres: number): void {
  expectAsBuilt(values.slice(0, 5));
  const radians = (degrees * Math.PI) / 180;
  // Model millimetres, Z-up map to GLB metres, Y-up; this spindle axis remains +X.
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const spindle = [1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0.013 * (1 - cosine), -0.013 * sine, 1];
  for (const index of [5, 6, 7]) {
    for (const [entry, value] of values[index]!.entries()) {
      expect(value, `${names[index]} matrix entry ${entry}`).toBeCloseTo(spindle[entry]!, 8);
    }
  }
  const carriage: number[] = [...identity];
  carriage[12] = millimetres / 1000;
  for (const index of [8, 9]) {
    for (const [entry, value] of values[index]!.entries()) {
      expect(value, `${names[index]} matrix entry ${entry}`).toBeCloseTo(carriage[entry]!, 8);
    }
  }
}

async function setDriver(degrees: number): Promise<void> {
  await target.fill(field('turn'), String(degrees));
  await target.press(field('turn'), 'Enter');
  await expect.poll(async () => stateField('coordinates'), { timeout: 10_000 }).toEqual({ turn: degrees });
}

async function reset(): Promise<void> {
  await target.click(selectors.getByRole('button', { name: 'Reset pose to as built' }));
  await expect.poll(async () => stateField('coordinates'), { timeout: 10_000 }).toEqual({ turn: 0 });
  expect(await stateField('playback')).toMatchObject({ status: 'stopped', time: 0 });
  expectAsBuilt(await matrices());
}

async function buffers(): Promise<BufferCounts> {
  return target.evaluate(() => {
    const global = globalThis as ViewerWindow;
    const context = global.__TAU_SECTION_VIEW_TEST__?.getViewportCanvas().getContext('webgl2');
    if (!context || !global.__TAU_PICOVOXEL_BUFFER_TEST__) {
      throw new Error('Viewport buffer probe missing.');
    }
    return global.__TAU_PICOVOXEL_BUFFER_TEST__.read(context);
  });
}

test('should play, pause and reset the shipped PicoVoxel stage without remeshing or accumulated pose drift', async () => {
  // Count actual uploads on this viewport's WebGL context, rather than only its live geometry count.
  await target.addInitScript(() => {
    const counts = new WeakMap<WebGL2RenderingContext, { allocations: number; updates: number }>();
    const read = (context: WebGL2RenderingContext) => {
      let value = counts.get(context);
      if (!value) {
        value = { allocations: 0, updates: 0 };
        counts.set(context, value);
      }
      return value;
    };
    const allocate = WebGL2RenderingContext.prototype.bufferData;
    const update = WebGL2RenderingContext.prototype.bufferSubData;
    WebGL2RenderingContext.prototype.bufferData = new Proxy(allocate, {
      apply(original, context: WebGL2RenderingContext, args: unknown[]): void {
        read(context).allocations++;
        Reflect.apply(original, context, args);
      },
    });
    WebGL2RenderingContext.prototype.bufferSubData = new Proxy(update, {
      apply(original, context: WebGL2RenderingContext, args: unknown[]): void {
        read(context).updates++;
        Reflect.apply(original, context, args);
      },
    });
    (globalThis as ViewerWindow).__TAU_PICOVOXEL_BUFFER_TEST__ = { read };
  });
  await target.grantPermissions(['clipboard-read', 'clipboard-write']);
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate('/__e2e/example-fixture?locator=picovoxel.lead-screw-stage&graphicsBackend=webgl');
  try {
    await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  } catch (error) {
    await target.writeArtifact(
      'picovoxel-kinematics-navigation.json',
      JSON.stringify(
        {
          events: await target.events(),
          body: await target.evaluate(() => document.body.textContent),
        },
        null,
        2,
      ),
    );
    await target.screenshot(selectors.getByCss('body'), 'picovoxel-kinematics-navigation.png');
    throw error;
  }
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await target.expectGeometryFramed();
  await target.expectGraphicsBackend('webgl');
  const renderer = await target.evaluate(() =>
    (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.getRendererIdentity(),
  );
  expect(renderer?.api).toBe('webgl');
  await expect.poll(state, { timeout: 120_000 }).toMatchObject({ coordinates: { turn: 0 } });
  await target.keyboardPress('Control+m');
  await target.expectVisible(selectors.getByTestId('kinematics-pane'), 30_000);
  await target.expectValue(field('turn'), '0');
  const components = await target.evaluate(() =>
    (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.getModelComponents(),
  );
  expect(components).toEqual(names.map((name, index) => ({ id: component(index), name })));
  expectAsBuilt(await matrices());
  await target.click(selectors.getByRole('button', { name: 'Followers of Handwheel' }));
  await target.expectValue(field('slide'), '0');
  await target.delay(500);
  const before = await buffers();
  expect(before.allocations, 'initial geometry was uploaded').toBeGreaterThan(0);

  await setDriver(90);
  expectPose(await matrices(), 90, 1);
  await target.expectValue(field('slide'), '1');
  await target.screenshot(selectors.getByCss('body'), 'picovoxel-kinematics-quarter-turn.png');
  await setDriver(-90);
  expectPose(await matrices(), -90, -1);
  await setDriver(90);
  expectPose(await matrices(), 90, 1);
  await reset();

  await target.click(selectors.getByTestId('kinematics-play'));
  await expect.poll(async () => stateField('playback')).toMatchObject({ status: 'playing', animationId: 'traverse' });
  await expect
    .poll(
      async () => {
        const playback = await stateField('playback');
        return playback.time;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0.2);
  await target.click(selectors.getByTestId('kinematics-pause'));
  await expect.poll(async () => stateField('playback')).toMatchObject({ status: 'paused' });
  const paused = await state();
  const pausedMatrices = await matrices();
  expectPose(pausedMatrices, paused.coordinates['turn']!, paused.coordinates['turn']! / 90);
  await target.delay(500);
  expect(await state(), 'paused time and pose revision stay still').toEqual(paused);
  expect(await matrices()).toEqual(pausedMatrices);
  const timeline = selectors.getByRole('group', { name: 'Timeline', exact: true }).getByRole('spinbutton');
  await target.fill(timeline, '2');
  await target.press(timeline, 'Enter');
  await expect.poll(async () => stateField('playback')).toMatchObject({ status: 'paused', time: 2 });
  await expect.poll(async () => stateField('coordinates')).toEqual({ turn: 450 });
  expectPose(await matrices(), 450, 5);
  await target.expectValue(field('slide'), '5');
  await reset();
  const after = await buffers();
  expect(after, 'pose controls reuse uploaded mesh buffers').toEqual(before);

  await openCommand('Open parameters');
  const lead = selectors.getByLabelText('Input for Lead').first();
  await target.expectVisible(lead, 30_000);
  await target.fill(lead, '8');
  await target.press(lead, 'Enter');
  await activateKinematics();
  // The rebuilt mechanism changes the follower ratio and driver limits; both prove new metadata was presented.
  await target.expectAttribute(field('turn'), 'aria-valuemax', '900', 120_000);
  expectAsBuilt(await matrices());
  await setDriver(90);
  expectPose(await matrices(), 90, 2);
  await target.expectValue(field('slide'), '2');
  await reset();
  await target.click(selectors.getByCss('.dv-tab[aria-label="Parameters"]'));
  const position = selectors.getByLabelText('Input for Carriage Position').first();
  await target.fill(position, '15');
  await target.press(position, 'Enter');
  await activateKinematics();
  await target.expectAttribute(field('turn'), 'aria-valuemin', '-675', 120_000);
  expectAsBuilt(await matrices());
  await setDriver(90);
  expectPose(await matrices(), 90, 2);
  await reset();
  await target.writeArtifact(
    'picovoxel-kinematics.json',
    JSON.stringify(
      {
        before,
        after,
        renderer,
        paused,
        pausedMatrices,
        rebuilt: { lead: 8, carriagePosition: 15, degrees: 90, displacementMillimetres: 2 },
      },
      null,
      2,
    ),
  );
  await target.screenshot(selectors.getByCss('body'), 'picovoxel-kinematics-rebuilt-reset.png');

  // The selected component reveals its bound follower, using the same action as the viewer part menu.
  await target.click(selectors.getByRole('button', { name: 'Followers of Handwheel' }));
  await target.expectCount(field('slide'), 0);
  await openCommand('Open model structure');
  const parts = selectors.getByRole('list', { name: 'Model components for main.ts' });
  const carriage = parts.getByRole('button', { name: 'Carriage', exact: true });
  await target.click(carriage);
  await target.expectAttribute(carriage, 'aria-pressed', 'true');
  await target.expectVisible(
    selectors.getByCss('[data-slot="part-properties"]').getByText('Carriage', { exact: true }),
  );
  await target.hover(carriage);
  await target.click(parts.getByRole('button', { name: 'Actions for Carriage' }));
  await target.click(selectors.getByRole('menuitem', { name: 'Show kinematics' }));
  await target.expectVisible(field('slide'));
  await target.expectValue(field('slide'), '0');
  await target.screenshot(selectors.getByCss('body'), 'picovoxel-kinematics-selection.png');

  // Edit this fixture's private project copy. Rejected metadata must leave valid geometry viewable.
  const invalidSource = `
import type { Pico } from 'picovoxel';
export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico) {
  return { shape: pico.createVoxels({ shape: 'sphere', radius: 5 }), name: 'Body' };
}
export const mechanism = {
  schemaVersion: 1, units: { length: 'mm', angle: 'deg' }, root: 'frame',
  links: { frame: { shapes: ['Absent'] } }, joints: {},
};
`;
  await openCommand('Open files');
  await target.click(selectors.getByCss('[data-testid="file-tree-item"][data-file-tree-path="main.ts"]'));
  await target.expectVisible(selectors.getByCss('.monaco-editor:visible .view-lines').last(), 60_000);
  await target.click(selectors.getByCss('.monaco-editor:visible').last(), { position: { x: 80, y: 50 } });
  await target.keyboardPress('ControlOrMeta+a');
  await target.evaluate(async (text) => navigator.clipboard.writeText(text), invalidSource);
  await target.keyboardPress('ControlOrMeta+v');
  await target.keyboardPress('Escape');
  await expect
    .poll(
      async () => target.evaluate(() => (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.getModelComponents()),
      { timeout: 120_000 },
    )
    .toEqual([{ id: component(0), name: 'Body' }]);
  await target.expectGeometryFramed();
  await activateKinematics();
  const warning = selectors.getByRole('alert', { name: 'Kinematics error' });
  await target.expectVisible(warning.getByText('The mechanism could not be loaded', { exact: true }));
  await target.expectVisible(warning.getByText(/Absent/u));
  await target.expectCount(field('turn'), 0);
  await target.screenshot(selectors.getByCss('body'), 'picovoxel-kinematics-invalid-metadata.png');
});
