import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import type { TauViewerViewState } from '@taucad/mcp/viewer-protocol';
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
});
