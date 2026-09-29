import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { readWorkbenchTree, writeWorkbenchFile } from '#support/workbench-files.js';

const layoutPath = '/.tau/workbench/layout.json';
const workspace = 'workbench-records-external';
const viewPath = (id: string): string => `/.tau/workbench/views/${id}.json`;
const mainEntry = 'public/models/honeycomb.js';
const viewTab = (title: string) => selectors.getByCss('.dv-tab').filter({ hasText: title });
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
  await target.expectVisible(viewTab('Review front · honeycomb.js'), 60_000);
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
  await target.expectVisible(viewTab('Review front · honeycomb.js'), 60_000);
  expect(await readFile(viewPath('review-front'))).toBe(canonicalView);

  const invalid = '{"version":1,"viewer":';
  await writeWorkbenchFile(layoutPath, invalid, workspace);
  await target.reload();
  await target.expectVisible(selectors.getByRole('alert').getByRole('button', { name: 'Reset' }), 60_000);
  expect(await readFile(layoutPath)).toBe(invalid);
  await target.click(selectors.getByRole('alert').getByRole('button', { name: 'Reset' }));
  await expect
    .poll(
      async () => {
        const content = await readFile(layoutPath);
        return (JSON.parse(content!) as { version: number }).version;
      },
      { timeout: 60_000 },
    )
    .toBe(1);

  const newer = JSON.stringify({ ...arranged, version: 2 });
  await writeWorkbenchFile(layoutPath, newer, workspace);
  await target.reload();
  await target.expectVisible(selectors.getByRole('alert'), 60_000);
  expect(await target.textContent(selectors.getByRole('alert'))).toContain('Update Tau');
  await target.expectCount(selectors.getByRole('alert').getByRole('button', { name: 'Reset' }), 0);
  expect(await readFile(layoutPath)).toBe(newer);
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
  await target.expectVisible(viewTab('Outside front · honeycomb.js'), 60_000);
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
  const closingTab = viewTab('Isometric · honeycomb.js');
  await target.expectVisible(closingTab, 60_000);
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
