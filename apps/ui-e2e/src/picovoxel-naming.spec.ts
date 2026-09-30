import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

type ViewerWindow = typeof globalThis & {
  __TAU_SECTION_VIEW_TEST__?: {
    getModelComponents(): ReadonlyArray<{ id: string; name: string }>;
    setCamera(camera: { position: readonly [number, number, number]; target: readonly [number, number, number] }): void;
    projectWorldPoint(point: readonly [number, number, number]): { x: number; y: number; visible: boolean };
    getModelHoverState(): { hoveredComponentId?: string };
  };
};

const openCommand = async (name: string) => {
  await target.click(selectors.getByRole('button', { name: 'Search', exact: true }));
  await target.fill(selectors.getByPlaceholder('Search projects, chats, and actions…'), name);
  await target.click(selectors.getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`, 'u') }));
};

const source = (name: string, reordered = false): string => `
import type { Pico } from 'picovoxel';
import type { PicovoxelResult } from '@taucad/picovoxel';
export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico): PicovoxelResult {
  const left = { shape: pico.createVoxels({ shape: 'sphere', center: [-20, 0, 0], radius: 5 }), name: ${JSON.stringify(name)} };
  const middle = { shape: pico.createVoxels({ shape: 'sphere', radius: 5 }), name: 'Mesh' };
  const right = pico.createVoxels({ shape: 'sphere', center: [20, 0, 0], radius: 5 });
  return ${reordered ? '[right, middle, left]' : '[left, middle, right]'};
}
`;

const replaceMain = async (code: string) => {
  await openCommand('Open files');
  await target.click(selectors.getByCss('[data-testid="file-tree-item"][data-file-tree-path="main.ts"]'));
  await target.expectVisible(selectors.getByCss('.monaco-editor:visible .view-lines').last(), 60_000);
  // Click inside the editor viewport; a long rendered line can extend beneath adjacent panels.
  await target.click(selectors.getByCss('.monaco-editor:visible').last(), { position: { x: 80, y: 50 } });
  await target.keyboardPress('ControlOrMeta+a');
  // Paste one edit: character-by-character input invokes Monaco's bracket/quote completion.
  await target.evaluate(async (text) => navigator.clipboard.writeText(text), code);
  await target.keyboardPress('ControlOrMeta+v');
  await target.keyboardPress('Escape');
  await expect
    .poll(async () =>
      target.evaluate(() =>
        [...document.querySelectorAll('.monaco-editor .view-lines')]
          .map((element) => element.textContent)
          .join('')
          .replaceAll(/\s/gu, ''),
      ),
    )
    .toContain('constleft=');
};

const components = async () =>
  target.evaluate(() => (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.getModelComponents() ?? []);

const checkParts = async (leftName: string, reordered: boolean) => {
  await openCommand('Open model structure');
  const names = reordered ? ['Shape 1', 'Mesh', leftName] : [leftName, 'Mesh', 'Shape 3'];
  await expect
    .poll(components, { timeout: 120_000 })
    .toEqual(names.map((name, index) => ({ id: `component:node-${index}`, name })));
  await target.expectGeometryFramed();
  await target.evaluate(() =>
    (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.setCamera({ position: [0, 0, 0.15], target: [0, 0, 0] }),
  );
  const list = selectors.getByRole('list', { name: 'Model components for main.ts' });
  // Reordering can retain a payload-local selection. Clear it before testing fresh canvas clicks.
  const selected = list.getByCss('button[aria-pressed="true"]');
  const selection = await target.read(selected);
  if (selection.count === 1) {
    await target.click(selected);
  }
  for (const [x, index] of [
    [-0.02, reordered ? 2 : 0],
    [0, 1],
    [0.02, reordered ? 0 : 2],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one real hover and selection at a time
    let point = await target.evaluate(
      (position) => (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.projectWorldPoint([position, 0, 0]),
      x,
    );
    expect(point?.visible).toBe(true);
    // oxlint-disable-next-line no-await-in-loop -- wait for the actual viewer picking event
    await expect
      .poll(
        async () => {
          point = await target.evaluate(
            (position) => (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.projectWorldPoint([position, 0, 0]),
            x,
          );
          await target.mouseMove(point!.x, point!.y);
          return target.evaluate(
            () => (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.getModelHoverState().hoveredComponentId,
          );
        },
        { timeout: 10_000 },
      )
      .toBe(`component:node-${index}`);
    // oxlint-disable-next-line no-await-in-loop -- assert the visible hover badge
    await target.expectVisible(
      selectors.getByTestId('model-component-name-badge').getByText(names[index]!, { exact: true }),
    );
    // oxlint-disable-next-line no-await-in-loop -- actual canvas selection
    await target.mouseClick(point!.x, point!.y);
    // oxlint-disable-next-line no-await-in-loop -- selection is projected into the explorer
    await target.expectAttribute(
      list.getByRole('button', { name: names[index]!, exact: true }),
      'aria-pressed',
      'true',
    );
    // oxlint-disable-next-line no-await-in-loop -- properties follow the selected manifest label
    await target.expectVisible(
      selectors.getByCss('[data-slot="part-properties"]').getByText(names[index]!, { exact: true }),
    );
    // oxlint-disable-next-line no-await-in-loop -- the selection action also uses the authored label
    await target.hover(list.getByRole('button', { name: names[index]!, exact: true }));
    // oxlint-disable-next-line no-await-in-loop -- verify selection action title
    await target.expectVisible(list.getByRole('button', { name: `Actions for ${names[index]}` }));
  }
  const filter = selectors.getByRole('searchbox', { name: 'Filter parts' });
  await target.fill(filter, leftName);
  await target.expectVisible(list.getByRole('button', { name: leftName, exact: true }));
  await target.expectCount(list.getByRole('button', { name: 'Mesh', exact: true }), 0);
  await target.fill(filter, '');
};

test('should deliver authored names on hover, selection and lists through rename and reordered output', async () => {
  await target.setViewport({ width: 1600, height: 1000 });
  await target.grantPermissions(['clipboard-read', 'clipboard-write']);
  await target.navigate('/__e2e/example-fixture?locator=picovoxel.hello-world&graphicsBackend=webgl');
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await target.expectGeometryFramed();
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await replaceMain(source('Housing / 蓋 🧩'));
  await checkParts('Housing / 蓋 🧩', false);
  // Only JSON labels change; the indexed geometry remains eligible for the existing in-place path.
  await replaceMain(source('Renamed / 蓋 🧩'));
  await checkParts('Renamed / 蓋 🧩', false);
  await replaceMain(source('Renamed / 蓋 🧩', true));
  await checkParts('Renamed / 蓋 🧩', true);
  const namedPoint = await target.evaluate(() =>
    (globalThis as ViewerWindow).__TAU_SECTION_VIEW_TEST__?.projectWorldPoint([-0.02, 0, 0]),
  );
  await target.mouseMove(namedPoint!.x, namedPoint!.y);
  await target.mouseClick(namedPoint!.x, namedPoint!.y);
  await target.expectVisible(
    selectors.getByTestId('model-component-name-badge').getByText('Renamed / 蓋 🧩', { exact: true }),
  );
  await target.expectVisible(
    selectors.getByCss('[data-slot="part-properties"]').getByText('Renamed / 蓋 🧩', { exact: true }),
  );
  await target.screenshot(selectors.getByCss('body'), 'picovoxel-naming.png');
});
