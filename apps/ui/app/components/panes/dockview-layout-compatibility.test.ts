import { afterEach, describe, expect, it } from 'vitest';
import type { IContentRenderer, SerializedDockview } from 'dockview-react';
import { DockviewComponent, Orientation } from 'dockview-react';

const v6WorkbenchLayout = {
  activeGroup: 'workbench-main',
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: {
            id: 'workbench-main',
            views: ['file-src-main', 'parameters'],
            activeView: 'file-src-main',
          },
          size: 760,
        },
        {
          type: 'leaf',
          data: {
            id: 'workbench-secondary',
            views: ['revisions'],
            activeView: 'revisions',
          },
          size: 440,
        },
      ],
      size: 1200,
    },
    height: 800,
    width: 1200,
    orientation: Orientation.VERTICAL,
  },
  panels: {
    'file-src-main': {
      id: 'file-src-main',
      contentComponent: 'file',
      title: 'main.ts',
      renderer: 'onlyWhenVisible',
      params: {
        filePath: 'src/main.ts',
        paneId: 'file-src-main',
        viewId: 'source',
        filesOpen: true,
        filesWidth: 288,
      },
    },
    parameters: {
      id: 'parameters',
      contentComponent: 'parameters',
      title: 'Parameters',
    },
    revisions: {
      id: 'revisions',
      contentComponent: 'revisions',
      title: 'Revisions',
    },
  },
} satisfies SerializedDockview;

const v6ViewerLayout = {
  activeGroup: 'viewer-main',
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: {
            id: 'viewer-main',
            views: ['view-main', 'view-secondary'],
            activeView: 'view-secondary',
          },
          size: 700,
        },
        {
          type: 'leaf',
          data: {
            id: 'viewer-split',
            views: ['view-tertiary'],
            activeView: 'view-tertiary',
          },
          size: 500,
        },
      ],
      size: 1200,
    },
    height: 800,
    width: 1200,
    orientation: Orientation.VERTICAL,
  },
  panels: {
    'view-main': {
      id: 'view-main',
      contentComponent: 'viewer',
      title: 'assembly.step',
      renderer: 'onlyWhenVisible',
      params: { viewId: 'view-main', entryPath: 'models/assembly.step' },
    },
    'view-secondary': {
      id: 'view-secondary',
      contentComponent: 'viewer',
      title: 'bracket.stl',
      renderer: 'always',
      params: { viewId: 'view-secondary', entryPath: 'parts/bracket.stl' },
    },
    'view-tertiary': {
      id: 'view-tertiary',
      contentComponent: 'viewer',
      title: 'housing.obj',
      params: { viewId: 'view-tertiary', entryPath: 'parts/housing.obj' },
    },
  },
} satisfies SerializedDockview;

const containers: HTMLElement[] = [];

const createDockview = (): DockviewComponent => {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);

  const dockview = new DockviewComponent(container, {
    createComponent: (): IContentRenderer => ({
      element: document.createElement('div'),
      init: () => undefined,
    }),
  });
  dockview.layout(1200, 800);
  return dockview;
};

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

describe('Dockview v6 layout compatibility', () => {
  it.each([
    {
      name: 'Workbench',
      layout: v6WorkbenchLayout,
      activePanelId: 'file-src-main',
      expectedGroups: [
        { id: 'workbench-main', panels: ['file-src-main', 'parameters'], activePanel: 'file-src-main' },
        { id: 'workbench-secondary', panels: ['revisions'], activePanel: 'revisions' },
      ],
    },
    {
      name: 'Viewer',
      layout: v6ViewerLayout,
      activePanelId: 'view-secondary',
      expectedGroups: [
        { id: 'viewer-main', panels: ['view-main', 'view-secondary'], activePanel: 'view-secondary' },
        { id: 'viewer-split', panels: ['view-tertiary'], activePanel: 'view-tertiary' },
      ],
    },
  ] as const)(
    'restores and round-trips the $name layout under Dockview v8',
    ({ layout, activePanelId, expectedGroups }) => {
      const dockview = createDockview();

      try {
        dockview.fromJSON(structuredClone(layout));

        expect(dockview.panels.map((panel) => panel.id)).toEqual(Object.keys(layout.panels));
        expect(
          dockview.groups.map((group) => ({
            id: group.id,
            panels: group.panels.map((panel) => panel.id),
            activePanel: group.activePanel?.id,
          })),
        ).toEqual(expectedGroups);
        expect(dockview.activePanel?.id).toBe(activePanelId);
        expect(dockview.activeGroup?.id).toBe(layout.activeGroup);

        for (const [panelId, state] of Object.entries(layout.panels)) {
          const panel = dockview.api.getPanel(panelId);
          expect(panel?.title).toBe(state.title);
          expect(panel?.params).toEqual('params' in state ? state.params : {});
        }

        const roundTrip = structuredClone(dockview.toJSON());
        const restored = createDockview();
        try {
          restored.fromJSON(roundTrip);
          expect(structuredClone(restored.toJSON())).toEqual(roundTrip);
        } finally {
          restored.dispose();
        }
      } finally {
        dockview.dispose();
      }
    },
  );
});
