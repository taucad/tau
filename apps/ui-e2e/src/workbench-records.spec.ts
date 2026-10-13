import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readWorkbenchTree, writeWorkbenchFile } from '#support/workbench-files.js';
import { readProjectStorageState } from '#support/project-storage-state.js';

const layoutPath = '/.tau/workbench/layout.json';
const workspace = 'workbench-records-external';
const viewPath = (id: string): string => `/.tau/workbench/views/${id}.json`;
const mainEntry = 'public/models/honeycomb.js';
const viewTab = (id: string) => selectors.getByCss(`.dv-tab[data-tab-panel-id="${id}"]`);
type CameraEvidence = {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  verticalSpan: number;
  zoom: number;
};
const readFile = async (path: string): Promise<string | undefined> => {
  const files = await readWorkbenchTree(workspace);
  return files[path];
};

const openProject = async (): Promise<void> => {
  await target.setViewport({ width: 1440, height: 900 });
  await target.navigate(`/__e2e/project-file-tree?workspace=${workspace}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/]+/u, 60_000);
  await expect.poll(async () => (await readFile(layoutPath)) !== undefined, { timeout: 60_000 }).toBe(true);
};

test('reloads authored records and preserves invalid and newer bytes', async () => {
  await openProject();
  const seeded = await readWorkbenchTree(workspace);
  const initial = JSON.parse(seeded[layoutPath]!) as {
    version: number;
    lanes: { chat: boolean; workbench: boolean };
    viewer: { kind: 'group'; tabs: Array<{ kind: 'view'; view: string }>; active?: number };
    workbench: { kind: 'group'; tabs: unknown[] };
  };
  expect(initial.version).toBe(1);
  expect(initial.viewer.tabs).toHaveLength(1);
  const originalView = initial.viewer.tabs[0]!.view;
  expect(JSON.parse(seeded[viewPath(originalView)]!)).toMatchObject({ version: 1, entryPath: mainEntry });

  const nextView = {
    version: 1,
    entryPath: mainEntry,
    name: 'Review front',
    camera: { kind: 'preset', preset: 'front' },
    grid: { unit: 'in' },
    section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: false }] },
  };
  await writeWorkbenchFile(viewPath('review-front'), JSON.stringify(nextView), workspace);
  const arranged = {
    ...initial,
    viewer: { kind: 'group', tabs: [...initial.viewer.tabs, { kind: 'view', view: 'review-front' }], active: 1 },
  };
  await writeWorkbenchFile(layoutPath, JSON.stringify(arranged), workspace);
  const adopted = await readWorkbenchTree(workspace);
  expect(JSON.parse(adopted[viewPath('review-front')]!)).toMatchObject({
    grid: { unit: 'in' },
    section: { cuts: [{ offset: 0.012 }] },
  });
  expect(JSON.parse(adopted[layoutPath]!)).toMatchObject({
    viewer: { tabs: [{ view: originalView }, { view: 'review-front' }] },
  });

  await target.reload();
  await target.expectVisible(viewTab('review-front'), 60_000);
  expect(await target.textContent(viewTab('review-front').getByCss('.dockview-tab-title'))).toBe('honeycomb.js');
  await expect
    .poll(
      async () =>
        target.evaluate(() => {
          const bridges =
            (
              globalThis as {
                __TAU_SECTION_VIEW_TEST_BRIDGES__?: Array<{
                  getSectionState(): {
                    isActive: boolean;
                    cuts: Array<{ kind: string; plane?: string; offset?: number }>;
                  };
                  getCamera(): { position: readonly number[] };
                }>;
              }
            ).__TAU_SECTION_VIEW_TEST_BRIDGES__ ?? [];
          return bridges.some((bridge) => {
            const section = bridge.getSectionState();
            return (
              section.isActive &&
              section.cuts.some((cut) => cut.kind === 'plane' && cut.plane === 'xy' && cut.offset === 0.012) &&
              bridge.getCamera().position.every(Number.isFinite)
            );
          });
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await target.expectVisible(selectors.getByRole('button', { name: /Grid .* in, units and grid/iu }), 60_000);
  const canonicalView = await readFile(viewPath('review-front'));
  expect(JSON.parse(canonicalView!)).toMatchObject({
    version: 1,
    entryPath: mainEntry,
    name: 'Review front',
    camera: { kind: 'preset', preset: 'front' },
    grid: { unit: 'in' },
    section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.012, isFlipped: false }] },
  });
  await target.reload();
  await target.expectVisible(viewTab('review-front'), 60_000);
  expect(await target.textContent(viewTab('review-front').getByCss('.dockview-tab-title'))).toBe('honeycomb.js');
  expect(await readFile(viewPath('review-front'))).toBe(canonicalView);

  const invalid = '{"version":1,"viewer":';
  await writeWorkbenchFile(layoutPath, invalid, workspace);
  await target.reload();
  const settingsTrigger = selectors.getByRole('button', { name: 'Settings not applied · 1 record', exact: true });
  const layoutIssue = selectors.getByRole('listitem', { name: 'Pane layout', exact: true });
  let invalidDocument: { href: string; timeOrigin: number };
  try {
    await target.expectVisible(settingsTrigger, 60_000);
    invalidDocument = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
    await target.click(settingsTrigger);
    await target.expectVisible(layoutIssue);
    expect(await readFile(layoutPath)).toBe(invalid);
    await target.click(layoutIssue.getByRole('button', { name: 'More actions for Pane layout', exact: true }));
    await target.click(selectors.getByRole('menuitem', { name: 'Reset settings…', exact: true }));
    await target.expectVisible(selectors.getByRole('alertdialog', { name: 'Reset pane layout?', exact: true }));
  } catch (error) {
    try {
      const [physicalLayout, storage, dom] = await Promise.allSettled([
        readFile(layoutPath),
        readProjectStorageState(),
        target.evaluate(() => ({
          href: location.href,
          timeOrigin: performance.timeOrigin,
          body: document.body.textContent.slice(0, 12_000),
          alerts: [...document.querySelectorAll('[role="alert"], [role="alertdialog"], [role="status"]')]
            .slice(0, 16)
            .map((element) => ({ role: element.getAttribute('role'), text: element.textContent.slice(0, 2048) })),
          buttons: [...document.querySelectorAll('button')].slice(0, 80).map((element) => ({
            label: element.getAttribute('aria-label'),
            text: element.textContent.slice(0, 256),
            expanded: element.getAttribute('aria-expanded'),
          })),
        })),
      ]);
      await target.writeArtifact(
        'workbench-invalid-layout-precondition',
        JSON.stringify({ expectedBytes: invalid, physicalLayout, storage, dom }),
      );
      await target.screenshot(undefined, 'workbench-invalid-layout-precondition.png');
    } catch {
      // Keep the original Reset assertion if optional evidence collection fails.
    }
    throw error;
  }
  expect(await readFile(layoutPath)).toBe(invalid);
  await target.click(
    selectors.getByRole('alertdialog', { name: 'Reset pane layout?', exact: true }).getByRole('button', {
      name: 'Reset settings',
      exact: true,
    }),
  );
  await expect
    .poll(
      async () => {
        const content = await readFile(layoutPath);
        return (JSON.parse(content!) as { version: number }).version;
      },
      { timeout: 60_000 },
    )
    .toBe(1);

  expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(
    invalidDocument,
  );

  const newer = JSON.stringify({ ...arranged, version: 2 });
  await writeWorkbenchFile(layoutPath, newer, workspace);
  await target.reload();
  await target.expectVisible(settingsTrigger, 60_000);
  const newerDocument = await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }));
  await target.click(settingsTrigger);
  await target.expectVisible(layoutIssue);
  expect(await target.textContent(layoutIssue)).toContain('until this project is opened with a newer Tau');
  await target.expectCount(layoutIssue.getByRole('button', { name: 'More actions for Pane layout', exact: true }), 0);
  await target.expectCount(selectors.getByRole('menuitem', { name: 'Reset settings…', exact: true }), 0);
  await target.expectCount(selectors.getByRole('alertdialog', { name: 'Reset pane layout?', exact: true }), 0);
  expect(await readFile(layoutPath)).toBe(newer);
  expect(await target.evaluate(() => ({ href: location.href, timeOrigin: performance.timeOrigin }))).toEqual(
    newerDocument,
  );
});

test('adopts a valid external WebAccess layout edit without a reload', async () => {
  await openProject();
  const initial = JSON.parse((await readFile(layoutPath))!) as {
    viewer: { kind: 'group'; tabs: Array<{ kind: 'view'; view: string }> };
  };
  // Let the workspace watcher establish its first physical snapshot before an outside editor changes bytes.
  await new Promise((resolve) => {
    setTimeout(resolve, 3500);
  });
  await writeWorkbenchFile(
    viewPath('outside-front'),
    JSON.stringify({
      version: 1,
      entryPath: mainEntry,
      name: 'Outside front',
      camera: { kind: 'preset', preset: 'front' },
    }),
    workspace,
  );
  await writeWorkbenchFile(
    layoutPath,
    JSON.stringify({
      ...initial,
      viewer: {
        kind: 'group',
        tabs: [...initial.viewer.tabs, { kind: 'view', view: 'outside-front' }],
        active: initial.viewer.tabs.length,
      },
    }),
    workspace,
  );
  await target.expectVisible(viewTab('outside-front'), 60_000);
  expect(await target.textContent(viewTab('outside-front').getByCss('.dockview-tab-title'))).toBe('honeycomb.js');
  expect(JSON.parse((await readFile(layoutPath))!)).toMatchObject({
    viewer: { tabs: [{ view: initial.viewer.tabs[0]!.view }, { view: 'outside-front' }] },
  });
  await writeWorkbenchFile(
    viewPath('outside-front'),
    JSON.stringify({
      version: 1,
      entryPath: mainEntry,
      name: 'Outside front',
      camera: { kind: 'look', direction: [1, 0, 0] },
    }),
    workspace,
  );
  await expect
    .poll(
      async () =>
        target.evaluate(() => {
          const bridge = (
            globalThis as {
              __TAU_SECTION_VIEW_TEST__?: {
                getCamera(): { position: readonly [number, number, number]; target: readonly [number, number, number] };
              };
            }
          ).__TAU_SECTION_VIEW_TEST__;
          if (!bridge) {
            return false;
          }
          const { position, target } = bridge.getCamera();
          const direction = position.map((value, index) => value - target[index]!);
          const length = Math.hypot(...direction);
          return (
            direction[0]! / length > 0.95 &&
            Math.abs(direction[1]! / length) < 0.05 &&
            Math.abs(direction[2]! / length) < 0.05
          );
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
});

test('keeps the live camera and canvas when only workbench tabs change', async () => {
  await openProject();
  const initial = JSON.parse((await readFile(layoutPath))!) as {
    lanes: { chat: boolean; workbench: boolean };
    viewer: { kind: 'group'; tabs: Array<{ view: string }> };
  };
  const id = initial.viewer.tabs[0]!.view;
  await target.expectVisible(viewTab(id), 60_000);
  await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
  await expect
    .poll(
      async () =>
        target.evaluate(() => {
          const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: { isGeometryFramed(): boolean } })
            .__TAU_SECTION_VIEW_TEST__;
          return bridge?.isGeometryFramed() ?? false;
        }),
      { timeout: 60_000 },
    )
    .toBe(true);

  await target.evaluate(() => {
    type Bridge = {
      setCamera(camera: {
        position: readonly [number, number, number];
        target: readonly [number, number, number];
        fov: number;
      }): void;
      getCamera(): CameraEvidence;
      getViewportCanvas(): HTMLCanvasElement;
    };
    const scope = globalThis as typeof globalThis & {
      __TAU_SECTION_VIEW_TEST__?: Bridge;
      __workbenchCameraIdentity?: { canvas: HTMLCanvasElement };
    };
    const bridge = scope.__TAU_SECTION_VIEW_TEST__;
    const canvas = bridge?.getViewportCanvas();
    if (!bridge || !canvas) {
      throw new Error('Viewer camera and canvas are required.');
    }
    scope.__workbenchCameraIdentity = { canvas };
    bridge.setCamera({ position: [0.2, -0.3, 0.4], target: [0.01, 0.02, 0.03], fov: 38 });
  });
  await expect
    .poll(
      async () =>
        target.evaluate(() => {
          const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: { getCamera(): { position: number[] } } })
            .__TAU_SECTION_VIEW_TEST__;
          return bridge ? Math.abs(bridge.getCamera().position[0]! - 0.2) < 0.001 : false;
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  const settledCamera = await target.evaluate(() => {
    const bridge = (globalThis as { __TAU_SECTION_VIEW_TEST__?: { getCamera(): CameraEvidence } })
      .__TAU_SECTION_VIEW_TEST__;
    return bridge!.getCamera();
  });
  const offset = settledCamera.position.map((value, index) => value - settledCamera.target[index]!);
  const distance = Math.hypot(...offset);
  const direction = offset.map((value) => value / distance);

  await writeWorkbenchFile(
    layoutPath,
    JSON.stringify({
      ...initial,
      lanes: { ...initial.lanes, workbench: true },
      workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'model' }] },
    }),
    workspace,
  );
  const modelTab = selectors.getByCss('.dv-tab[data-tab-panel-id="workbench:model"]');
  await target.expectVisible(modelTab, 60_000);
  expect(await target.textContent(modelTab.getByCss('.dockview-tab-title'))).toBe('Model');
  const identity = await target.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __TAU_SECTION_VIEW_TEST__?: { getViewportCanvas(): HTMLCanvasElement };
      __workbenchCameraIdentity?: { canvas: HTMLCanvasElement };
    };
    return {
      canvasSame: scope.__TAU_SECTION_VIEW_TEST__?.getViewportCanvas() === scope.__workbenchCameraIdentity?.canvas,
      selectedCanvasSame: document.querySelector('canvas[data-engine]') === scope.__workbenchCameraIdentity?.canvas,
    };
  });
  expect(identity.canvasSame, JSON.stringify(identity)).toBe(true);
  expect(identity.selectedCanvasSame, JSON.stringify(identity)).toBe(true);
  const afterLayout = await target.evaluate(() =>
    (
      globalThis as { __TAU_SECTION_VIEW_TEST__?: { getCamera(): CameraEvidence } }
    ).__TAU_SECTION_VIEW_TEST__!.getCamera(),
  );
  for (let index = 0; index < 3; index++) {
    expect(afterLayout.position[index]).toBeCloseTo(settledCamera.position[index]!, 3);
    expect(afterLayout.target[index]).toBeCloseTo(settledCamera.target[index]!, 3);
  }
  await expect
    .poll(
      async () => {
        const record = JSON.parse((await readFile(viewPath(id)))!) as {
          camera: {
            kind: string;
            target?: number[];
            direction?: number[];
            verticalSpan?: number;
            perspectiveZoom?: number;
          };
        };
        const pose = record.camera;
        const matches = Boolean(
          pose.kind === 'pose' &&
          pose.target?.every((value, index) => Math.abs(value - settledCamera.target[index]!) < 0.001) &&
          pose.direction?.every((value, index) => Math.abs(value - direction[index]!) < 0.001) &&
          Math.abs((pose.verticalSpan ?? 0) - settledCamera.verticalSpan) < 0.001 &&
          Math.abs((pose.perspectiveZoom ?? 0) - settledCamera.zoom) < 0.001,
        );
        return matches
          ? 'true'
          : JSON.stringify({
              pose,
              expected: {
                target: settledCamera.target,
                direction,
                verticalSpan: settledCamera.verticalSpan,
                perspectiveZoom: settledCamera.zoom,
              },
            });
      },
      { timeout: 60_000 },
    )
    .toBe('true');
});

test('deletes a view record when the person closes its tab', async () => {
  await openProject();
  const initial = JSON.parse((await readFile(layoutPath))!) as { viewer: { tabs: Array<{ view: string }> } };
  const id = initial.viewer.tabs[0]!.view;
  expect(await readFile(viewPath(id))).toBeDefined();
  const original = JSON.parse((await readFile(viewPath(id)))!) as {
    camera: { kind: string; preset?: string };
    name?: string;
  };
  expect(original.name).toBeUndefined();
  expect(original.camera).toMatchObject({ kind: 'preset', preset: 'isometric' });
  const closingTab = viewTab(id);
  await target.expectVisible(closingTab, 60_000);
  expect(await target.textContent(closingTab.getByCss('.dockview-tab-title'))).toBe('honeycomb.js');
  await target.hover(closingTab);
  await target.click(closingTab.getByCss('.dv-default-tab-action'), { force: true });
  await target.expectCount(closingTab, 0, 60_000);
  await expect.poll(async () => readFile(viewPath(id)), { timeout: 60_000 }).toBeUndefined();
  await expect
    .poll(
      async () => {
        const final = JSON.parse((await readFile(layoutPath))!) as { viewer: { tabs: Array<{ view: string }> } };
        return final.viewer.tabs.some((tab) => tab.view === id);
      },
      { timeout: 60_000 },
    )
    .toBe(false);
});
