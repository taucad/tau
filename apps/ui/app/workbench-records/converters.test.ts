import { afterEach, describe, expect, it } from 'vitest';
import type { IContentRenderer, SerializedDockview } from 'dockview-react';
import { DockviewComponent } from 'dockview-react';
import type { WorkbenchLaneNode, WorkbenchLaneTab, ViewerNode } from '@taucad/workbench';
import { paneIds } from '@taucad/workbench';
import { fromDockview, mintViewRecordId, toDockview } from '#workbench-records/converters.js';
import persistedEditorRow from '#workbench-records/fixtures/persisted-editor-row.json';

const dockviews: Array<{ element: HTMLElement; dockview: DockviewComponent }> = [];
const createDockview = (layout: SerializedDockview, disableFloatingGroups = false): DockviewComponent => {
  const element = document.createElement('div');
  document.body.append(element);
  const dockview = new DockviewComponent(element, {
    createComponent: (): IContentRenderer => ({ element: document.createElement('div'), init: () => undefined }),
    disableFloatingGroups,
  });
  dockviews.push({ element, dockview });
  dockview.layout(layout.grid.width, layout.grid.height);
  dockview.fromJSON(layout);
  return dockview;
};
const mount = (layout: SerializedDockview): SerializedDockview => createDockview(layout).toJSON();
afterEach(() => {
  for (const { element, dockview } of dockviews.splice(0)) {
    dockview.dispose();
    element.remove();
  }
});

const viewer: ViewerNode = {
  kind: 'split',
  direction: 'row',
  children: [
    {
      kind: 'group',
      size: 3,
      tabs: [
        { kind: 'view', view: 'front' },
        { kind: 'view', view: 'back' },
      ],
      active: 0,
    },
    {
      kind: 'split',
      size: 1,
      direction: 'column',
      children: [
        { kind: 'group', size: 2, tabs: [] },
        { kind: 'group', size: 1, tabs: [{ kind: 'view', view: 'top' }] },
      ],
    },
  ],
};
const workbench: WorkbenchLaneNode = {
  kind: 'split',
  direction: 'column',
  children: [
    {
      kind: 'group',
      size: 1,
      tabs: [
        { kind: 'pane', pane: 'parameters' },
        { kind: 'file', path: 'docs/readme.md', presentation: 'source', filesOpen: true },
      ],
      active: 0,
    },
    { kind: 'group', size: 2, tabs: [{ kind: 'pane', pane: 'print' }] },
  ],
};
const files = { 'docs/readme.md': { paneId: 'pane_real_1', filesWidth: 288 } };

function shape(node: ViewerNode | WorkbenchLaneNode): Record<string, unknown> {
  if (node.kind === 'group') {
    return { ...node, size: undefined };
  }
  return { ...node, size: undefined, children: node.children.map(shape) };
}

describe('workbench Dockview converters', () => {
  it('restores utility tab labels and file names with their display case', () => {
    const layout = toDockview(
      'workbench',
      {
        kind: 'group',
        tabs: [
          { kind: 'pane', pane: 'model' },
          { kind: 'pane', pane: 'parameters' },
          { kind: 'pane', pane: 'kernel' },
          { kind: 'file', path: 'models/MainPart.ts' },
        ],
      },
      { dimensions: { width: 800, height: 500 }, files: { 'models/MainPart.ts': { paneId: 'pane-main' } } },
    );

    expect(mount(layout).panels).toMatchObject({
      'workbench:model': { title: 'Model' },
      'workbench:parameters': { title: 'Parameters' },
      'workbench:kernel': { title: 'Telemetry' },
      'pane-main': { title: 'MainPart.ts' },
    });
  });

  it.each([
    { width: 1200, height: 800 },
    { width: 520, height: 1080 },
  ])('preserves all singleton panes and default-last activation at $width by $height', (dimensions) => {
    const tabs: WorkbenchLaneTab[] = paneIds.map((pane) => ({ kind: 'pane', pane }));
    const layout = toDockview('workbench', { kind: 'group', tabs }, { dimensions });
    expect(layout.grid.root.size).toBe(dimensions.height);
    if (!Array.isArray(layout.grid.root.data)) {
      throw new TypeError('Expected branch');
    }
    expect(layout.grid.root.data[0]?.size).toBe(dimensions.width);
    const restored = mount(layout);
    expect(restored.grid.root.type).toBe('branch');
    expect(fromDockview('workbench', restored)).toEqual({ kind: 'group', size: undefined, tabs });
    if (!Array.isArray(restored.grid.root.data)) {
      throw new TypeError('Expected branch');
    }
    const only = restored.grid.root.data[0];
    if (!only || Array.isArray(only.data)) {
      throw new TypeError('Expected group');
    }
    expect(only.data.activeView).toBe('workbench:console');
  });

  it.each([
    { width: 1200, height: 800 },
    { width: 520, height: 1080 },
  ])('round-trips both lanes through real Dockview at $width by $height', (dimensions) => {
    for (const [lane, tree] of [
      ['viewer', viewer],
      ['workbench', workbench],
    ] as const) {
      const serialized = toDockview(lane, tree, { dimensions, files });
      expect(serialized.grid.root.size).toBe(lane === 'viewer' ? dimensions.height : dimensions.width);
      expect(serialized.activeGroup).toBe('workbench-group-root-0');
      const restored = mount(serialized);
      const portable = fromDockview(lane, restored);
      const again = fromDockview(lane, mount(toDockview(lane, portable, { dimensions, files })));
      expect(again).toEqual(portable);
      expect(shape(portable)).toMatchObject(shape(tree));
      expect(JSON.stringify(portable)).not.toContain('filesWidth');
      if (lane === 'workbench') {
        expect(restored.panels['pane_real_1']?.params?.['filesWidth']).toBe(288);
      }
    }
  });

  it('flattens same-direction splits without losing group order or weights', () => {
    const nested: ViewerNode = {
      kind: 'split',
      direction: 'row',
      children: [
        { kind: 'group', size: 1, tabs: [{ kind: 'view', view: 'a' }] },
        {
          kind: 'split',
          direction: 'row',
          size: 3,
          children: [
            { kind: 'group', size: 1, tabs: [{ kind: 'view', view: 'b' }] },
            { kind: 'group', size: 2, tabs: [{ kind: 'view', view: 'c' }] },
          ],
        },
      ],
    };
    const result = fromDockview(
      'viewer',
      mount(toDockview('viewer', nested, { dimensions: { width: 1200, height: 800 } })),
    );
    expect(result.kind).toBe('split');
    if (result.kind !== 'split') {
      return;
    }
    expect(result.children.map((child) => child.kind === 'group' && child.tabs[0]?.view)).toEqual(['a', 'b', 'c']);
    expect(result.children.map((child) => child.size)).toEqual([0.25, 0.25, 0.5]);
  });

  it('projects an empty workbench group as a launcher and back', () => {
    const layout = toDockview('workbench', { kind: 'group', tabs: [] }, { dimensions: { width: 640, height: 400 } });
    const restored = mount(layout);
    expect(Object.values(restored.panels).map((panel) => panel.contentComponent)).toEqual(['newTab']);
    expect(fromDockview('workbench', restored)).toEqual({ kind: 'group', size: undefined, tabs: [] });
  });

  it('refuses floating layouts and migrates the retired Machines singleton', () => {
    const layout = toDockview('workbench', workbench, { dimensions: { width: 900, height: 600 }, files });
    const group = layout.grid.root;
    if (group.type !== 'branch' || !Array.isArray(group.data)) {
      throw new Error('Expected branch');
    }
    const second = group.data[1];
    if (second?.type !== 'leaf' || Array.isArray(second.data)) {
      throw new Error('Expected leaf');
    }
    second.data.views = ['workbench:machines'];
    delete layout.panels['workbench:print'];
    layout.panels['workbench:machines'] = { id: 'workbench:machines', contentComponent: 'machines' };
    expect(JSON.stringify(fromDockview('workbench', layout))).toContain('"pane":"print"');
    expect(() =>
      fromDockview('workbench', {
        ...layout,
        floatingGroups: [
          { data: { id: 'floating', views: [] }, position: { top: 0, left: 0, width: 200, height: 100 } },
        ],
      }),
    ).toThrow('Floating');
  });

  it('mints portable lowercase view ids', () => {
    expect(mintViewRecordId()).toMatch(/^v-[a-z0-9]{8}$/u);
    const layout = toDockview(
      'viewer',
      { kind: 'group', tabs: [{ kind: 'view', view: 'front' }] },
      {
        dimensions: { width: 800, height: 500 },
      },
    );
    const legacyPanel = layout.panels['front'];
    if (!legacyPanel) {
      throw new Error('Expected viewer panel');
    }
    delete layout.panels['front'];
    layout.panels['view_legacy'] = { ...legacyPanel, id: 'view_legacy', params: { viewId: 'view_legacy' } };
    if (!Array.isArray(layout.grid.root.data)) {
      throw new TypeError('Expected branch');
    }
    const only = layout.grid.root.data[0];
    if (!only || Array.isArray(only.data)) {
      throw new TypeError('Expected leaf');
    }
    only.data.views = ['view_legacy'];
    const ids = new Map<string, string>();
    const first = fromDockview('viewer', layout, ids);
    expect(first).toEqual(fromDockview('viewer', layout, ids));
    expect(ids.get('view_legacy')).toMatch(/^v-[a-z0-9]{8}$/u);
  });

  it('prevents the same Shift pointer-down that floats an enabled tab', () => {
    const layout = toDockview(
      'viewer',
      { kind: 'group', tabs: [{ kind: 'view', view: 'front' }] },
      {
        dimensions: { width: 800, height: 500 },
      },
    );
    for (const disabled of [false, true]) {
      const dockview = createDockview(layout, disabled);
      const tab = dockview.element.querySelector('.dv-tab');
      if (!tab) {
        throw new Error('Expected a Dockview tab');
      }
      const pointerDown = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      tab.dispatchEvent(pointerDown);
      expect(pointerDown.defaultPrevented).toBe(!disabled);
      expect(dockview.toJSON().floatingGroups ?? []).toHaveLength(disabled ? 0 : 1);
    }
  });

  it('round-trips a captured editor row from the production Dockview/editor persistence path', () => {
    // Captured by T05's one-time production editor actor + IndexedDbStorageProvider harness; fake-indexeddb transport.
    const row = persistedEditorRow as unknown as {
      viewerLayout: SerializedDockview;
      workbenchLayout: SerializedDockview;
      openFiles: Array<{ paneId: string; path: string }>;
    };
    expect(row.openFiles).toHaveLength(1);
    expect(row.viewerLayout.grid.root.size).toBe(740);
    expect(row.workbenchLayout.grid.root.size).toBe(720);
    const legacyIds = new Map<string, string>();
    const viewerTree = fromDockview('viewer', row.viewerLayout, legacyIds);
    const workbenchTree = fromDockview('workbench', row.workbenchLayout);
    expect(legacyIds.get('view_legacy')).toMatch(/^v-[a-z0-9]{8}$/u);
    expect(JSON.stringify(workbenchTree)).toContain('"filesOpen":true');
    const files = Object.fromEntries(row.openFiles.map(({ path, paneId }) => [path, { paneId, filesWidth: 256 }]));
    for (const dimensions of [
      { width: 1180, height: 740 },
      { width: 520, height: 1080 },
    ]) {
      const viewer = fromDockview('viewer', mount(toDockview('viewer', viewerTree, { dimensions })), legacyIds);
      const workbench = fromDockview('workbench', mount(toDockview('workbench', workbenchTree, { dimensions, files })));
      expect(viewer).toEqual(viewerTree);
      expect(workbench).toEqual(workbenchTree);
    }
  });
});
