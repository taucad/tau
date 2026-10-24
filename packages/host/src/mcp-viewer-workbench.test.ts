import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import type { TauViewerViewSettings, TauViewerViewState } from '@taucad/mcp/viewer-protocol';
import { workbenchPaths, workbenchRecords } from '@taucad/workbench';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpViewerWorkbench } from '#mcp-viewer-workbench.js';

/** Runs before the keeper stages a replacement for a record, so a test can play another writer in between. */
const beforeStaging = vi.hoisted(() => ({ hook: undefined as ((record: string) => Promise<void>) | undefined }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    async writeFile(...args: Parameters<typeof actual.writeFile>): Promise<void> {
      const [path] = args;
      if (beforeStaging.hook !== undefined && typeof path === 'string' && path.endsWith('.tmp')) {
        await beforeStaging.hook(path.replace(/\.[\da-f]{12}\.tmp$/, ''));
      }
      await actual.writeFile(...args);
    },
  };
});

const viewOf = (overrides: Partial<TauViewerViewState> = {}): TauViewerViewState => ({
  model: { id: 'm1', title: 'plate', path: '.tau/artifacts/plate.glb', sourceFile: 'plate.ts' },
  selected: [],
  hidden: [],
  isolated: [],
  camera: { target: [0, 0, 0], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 0.2 },
  sectionActive: false,
  measurementCount: 0,
  composition: 'tab',
  interactedAt: 0,
  ...overrides,
});

/** The settings a page reports after the person turned the grid off and cut a section. */
const settingsOf = (overrides: Partial<TauViewerViewSettings> = {}): TauViewerViewSettings => ({
  fieldOfView: 45,
  upDirection: 'z',
  display: { surfaces: true, lines: true, gizmo: true, grid: false, axes: true, matcap: false, postProcessing: false },
  grid: { unit: 'cm' },
  section: { active: true, cuts: [{ kind: 'plane', plane: 'xy', offset: 0.01, isFlipped: false }] },
  measurements: [{ id: 'm-1', frameId: 'tau:root', startPoint: [0, 0, 0], endPoint: [0.1, 0, 0], distance: 0.1 }],
  ...overrides,
});

/** A layout that shows one view, `front`. */
const layoutShowing = (view: string): string =>
  workbenchRecords.layout.serialize({
    version: 1,
    lanes: { chat: true, workbench: false },
    viewer: { kind: 'group', tabs: [{ kind: 'view', view }] },
    workbench: { kind: 'group', tabs: [] },
  });

const readRecord = async (root: string, path: string): Promise<unknown> =>
  JSON.parse(await readFile(join(root, path), 'utf8')) as unknown;

describe('createMcpViewerWorkbench', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-viewer-workbench-'));
  });

  afterEach(async () => {
    beforeStaging.hook = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it('should write nothing until the person interacts', async () => {
    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 5 }) });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 5, hidden: ['gear'] }) });
    await keeper.close();

    await expect(readFile(join(root, workbenchPaths.layout))).rejects.toThrow();
  });

  it("should create a view of the entry with the page's pose, its component display and a viewer tab", async () => {
    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf() });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 9, hidden: ['gear'], isolated: [] }) });
    await keeper.close();

    const layout = workbenchRecords.layout.read(new Uint8Array(await readFile(join(root, workbenchPaths.layout))));
    expect(layout.status).toBe('current');
    const viewer = layout.status === 'current' ? layout.record.viewer : undefined;
    expect(viewer).toMatchObject({ kind: 'group', active: 0, tabs: [{ kind: 'view' }] });
    const id = viewer?.kind === 'group' ? viewer.tabs[0]?.view : undefined;
    expect(await readRecord(root, workbenchPaths.view(id ?? ''))).toMatchObject({
      entryPath: 'plate.ts',
      camera: {
        kind: 'pose',
        frameId: 'tau:root',
        target: [0, 0, 0],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 0.2,
        perspectiveZoom: 1,
      },
    });
    expect(await readRecord(root, workbenchPaths.entries)).toEqual({
      version: 1,
      entries: { 'plate.ts': { components: { hidden: ['gear'], isolated: [], opacity: [] } } },
    });
  });

  it("should update the layout's existing view of the entry and keep its other fields", async () => {
    await mkdir(join(root, '.tau/workbench/views'), { recursive: true });
    await writeFile(
      join(root, workbenchPaths.view('front')),
      workbenchRecords.view.serialize({ version: 1, entryPath: 'plate.ts', name: 'Front', fieldOfView: 30 }),
    );
    const layoutText = workbenchRecords.layout.serialize({
      version: 1,
      lanes: { chat: true, workbench: false },
      viewer: { kind: 'group', tabs: [{ kind: 'view', view: 'front' }] },
      workbench: { kind: 'group', tabs: [] },
    });
    await writeFile(join(root, workbenchPaths.layout), layoutText);

    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf() });
    keeper.report({
      root,
      pageId: 'page-1',
      view: viewOf({ interactedAt: 3, camera: { ...viewOf().camera!, perspectiveZoom: 2, frameId: 'tau:root' } }),
    });
    await keeper.close();

    expect(await readFile(join(root, workbenchPaths.layout), 'utf8')).toBe(layoutText);
    expect(await readRecord(root, workbenchPaths.view('front'))).toMatchObject({
      name: 'Front',
      fieldOfView: 30,
      camera: { kind: 'pose', perspectiveZoom: 2 },
    });
  });

  it('should leave an invalid record untouched and write nothing', async () => {
    await mkdir(join(root, '.tau/workbench'), { recursive: true });
    await writeFile(join(root, workbenchPaths.layout), '{"version":1}');

    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf() });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 3 }) });
    await keeper.close();

    expect(await readFile(join(root, workbenchPaths.layout), 'utf8')).toBe('{"version":1}');
    await expect(readFile(join(root, workbenchPaths.entries))).rejects.toThrow();
  });

  it("should leave another writer's component display alone when the page re-reports an unchanged view", async () => {
    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf() });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 5, hidden: ['gear'] }) });
    await keeper.flush();
    const entriesText = workbenchRecords.entries.serialize({
      version: 1,
      entries: { 'plate.ts': { components: { hidden: ['housing'], isolated: [], opacity: [] } } },
    });
    await writeFile(join(root, workbenchPaths.entries), entriesText);

    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 5, hidden: ['gear'] }) });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 7, hidden: ['gear'] }) });
    await keeper.close();

    expect(await readFile(join(root, workbenchPaths.entries), 'utf8')).toBe(entriesText);
  });

  it("should write only the camera when the person orbits after another writer's component change", async () => {
    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf() });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 5, hidden: ['gear'] }) });
    await keeper.flush();
    const entriesText = workbenchRecords.entries.serialize({
      version: 1,
      entries: { 'plate.ts': { components: { hidden: ['housing'], isolated: [], opacity: [] } } },
    });
    await writeFile(join(root, workbenchPaths.entries), entriesText);

    const orbited = { ...viewOf().camera!, direction: [0, 1, 0] as const };
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 9, hidden: ['gear'], camera: orbited }) });
    await keeper.close();

    expect(await readFile(join(root, workbenchPaths.entries), 'utf8')).toBe(entriesText);
    const views = await readdir(join(root, '.tau/workbench/views'));
    expect(views).toHaveLength(1);
    expect(await readRecord(root, `.tau/workbench/views/${views[0]}`)).toMatchObject({
      camera: { direction: [0, 1, 0] },
    });
  });

  it('should leave one view, named by the layout, when entries writes keep conflicting', async () => {
    let conflicts = 0;
    beforeStaging.hook = async (record) => {
      if (basename(record) === basename(workbenchPaths.entries)) {
        conflicts += 1;
        await writeFile(
          record,
          workbenchRecords.entries.serialize({ version: 1, entries: { [`other-${conflicts}.ts`]: {} } }),
        );
      }
    };
    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf() });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 5, hidden: ['gear'] }) });
    await keeper.flush();
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 6, hidden: ['housing'] }) });
    await keeper.close();

    expect(conflicts).toBe(2);
    const views = await readdir(join(root, '.tau/workbench/views'));
    expect(views).toHaveLength(1);
    const layout = workbenchRecords.layout.read(new Uint8Array(await readFile(join(root, workbenchPaths.layout))));
    const viewer = layout.status === 'current' ? layout.record.viewer : undefined;
    expect(viewer).toMatchObject({ kind: 'group', tabs: [{ kind: 'view', view: basename(views[0]!, '.json') }] });
  });

  it('should remove the view it created when the layout write conflicts', async () => {
    beforeStaging.hook = async (record) => {
      if (basename(record) === basename(workbenchPaths.layout)) {
        await writeFile(
          record,
          workbenchRecords.layout.serialize({
            version: 1,
            lanes: { chat: true, workbench: true },
            viewer: { kind: 'group', tabs: [] },
            workbench: { kind: 'group', tabs: [] },
          }),
        );
      }
    };
    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf() });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 5, hidden: ['gear'] }) });
    await keeper.close();

    expect(await readdir(join(root, '.tau/workbench/views'))).toEqual([]);
  });

  it("should keep the page's display, grid, field of view, section and measurements in the view", async () => {
    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ settings: settingsOf({ grid: { unit: 'mm' } }) }) });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 4, settings: settingsOf() }) });
    await keeper.close();

    const views = await readdir(join(root, '.tau/workbench/views'));
    expect(await readRecord(root, `.tau/workbench/views/${views[0]}`)).toMatchObject({
      entryPath: 'plate.ts',
      ...settingsOf(),
      camera: { kind: 'pose', direction: [1, 0, 0] },
    });
    await expect(readFile(join(root, workbenchPaths.entries))).rejects.toThrow();
  });

  it('should write only the settings when the person changes them, keeping an arranged camera', async () => {
    await mkdir(join(root, '.tau/workbench/views'), { recursive: true });
    await writeFile(
      join(root, workbenchPaths.view('front')),
      workbenchRecords.view.serialize({
        version: 1,
        entryPath: 'plate.ts',
        camera: { kind: 'preset', preset: 'front' },
      }),
    );
    await writeFile(join(root, workbenchPaths.layout), layoutShowing('front'));

    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ settings: settingsOf({ fieldOfView: 60 }) }) });
    keeper.report({ root, pageId: 'page-1', view: viewOf({ interactedAt: 4, settings: settingsOf() }) });
    await keeper.close();

    expect(await readRecord(root, workbenchPaths.view('front'))).toMatchObject({
      camera: { kind: 'preset', preset: 'front' },
      fieldOfView: 45,
      section: { active: true },
    });
  });

  it("should write the camera into the selected kernel view's camera, as the Tau app does", async () => {
    await mkdir(join(root, '.tau/workbench/views'), { recursive: true });
    await writeFile(
      join(root, workbenchPaths.view('front')),
      workbenchRecords.view.serialize({
        version: 1,
        entryPath: 'plate.ts',
        selectedKernelView: 'top-view',
        kernelViews: [{ id: 'top-view' }],
      }),
    );
    await writeFile(join(root, workbenchPaths.layout), layoutShowing('front'));

    const keeper = createMcpViewerWorkbench({ settle: 10 });
    keeper.report({ root, pageId: 'page-1', view: viewOf() });
    keeper.report({
      root,
      pageId: 'page-1',
      view: viewOf({ interactedAt: 4, camera: { ...viewOf().camera!, verticalSpan: 3 } }),
    });
    await keeper.close();

    expect(await readRecord(root, workbenchPaths.view('front'))).toMatchObject({
      camera: { kind: 'preset', preset: 'isometric' },
      kernelViews: [{ id: 'top-view', camera: { kind: 'pose', verticalSpan: 3 } }],
    });
    await expect(keeper.state({ root, entryPath: 'plate.ts' })).resolves.toMatchObject({
      view: { camera: { kind: 'pose', verticalSpan: 3 } },
    });
  });

  describe('state', () => {
    it("should read the view the layout shows for the entry and the entry's component display", async () => {
      await mkdir(join(root, '.tau/workbench/views'), { recursive: true });
      /* A record as the Tau app writes it. */
      const desktop = workbenchRecords.view.serialize({
        version: 1,
        entryPath: 'plate.ts',
        name: 'Front',
        camera: { kind: 'look', direction: [0, -1, 1] },
        ...settingsOf(),
      });
      await writeFile(join(root, workbenchPaths.view('front')), desktop);
      await writeFile(join(root, workbenchPaths.layout), layoutShowing('front'));
      await writeFile(
        join(root, workbenchPaths.entries),
        workbenchRecords.entries.serialize({
          version: 1,
          entries: { 'plate.ts': { components: { hidden: ['gear'], isolated: ['arm'], opacity: [] } } },
        }),
      );

      const keeper = createMcpViewerWorkbench({ settle: 10 });
      await expect(keeper.state({ root, entryPath: 'plate.ts' })).resolves.toEqual({
        viewId: 'front',
        view: { camera: { kind: 'look', direction: [0, -1, 1] }, ...settingsOf() },
        components: { hidden: ['gear'], isolated: ['arm'] },
      });
      await expect(keeper.state({ root, entryPath: 'other.ts' })).resolves.toEqual({});
      await keeper.close();
    });

    it('should leave out a record that is invalid or from a newer Tau', async () => {
      await mkdir(join(root, '.tau/workbench'), { recursive: true });
      await writeFile(join(root, workbenchPaths.layout), '{"version":2}');
      await writeFile(join(root, workbenchPaths.entries), '{"version":1,"entries":3}');

      const keeper = createMcpViewerWorkbench({ settle: 10 });
      await expect(keeper.state({ root, entryPath: 'plate.ts' })).resolves.toEqual({});
      await keeper.close();
    });

    it('should read what a page reported last, writing it first', async () => {
      const keeper = createMcpViewerWorkbench({ settle: 60_000 });
      keeper.report({ root, pageId: 'page-1', view: viewOf({ settings: settingsOf({ fieldOfView: 60 }) }) });
      keeper.report({
        root,
        pageId: 'page-1',
        view: viewOf({ interactedAt: 4, hidden: ['gear'], settings: settingsOf() }),
      });

      await expect(keeper.state({ root, entryPath: 'plate.ts' })).resolves.toMatchObject({
        view: { fieldOfView: 45, camera: { kind: 'pose', direction: [1, 0, 0] } },
        components: { hidden: ['gear'], isolated: [] },
      });
      await keeper.close();
    });
  });
});
