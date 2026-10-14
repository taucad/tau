// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DockviewComponent, DockviewApi } from 'dockview-react';
import type { BrowserBridge, BrowserSnapshot } from '@taucad/types/browser';
import { connectBrowserWorkbench, browserPanelTabId } from '#components/browser/browser-workbench.js';
import { fromDockview } from '#workbench-records/converters.js';

const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0).reverse()) {
    dispose();
  }
});

const setup = async (): Promise<{
  api: DockviewApi;
  bridge: BrowserBridge;
  publish: (value: BrowserSnapshot) => void;
  snapshot: () => BrowserSnapshot;
}> => {
  const element = document.createElement('div');
  document.body.append(element);
  const dockview = new DockviewComponent(element, {
    createComponent: () => ({ element: document.createElement('div'), init: () => undefined }),
  });
  dockview.layout(1000, 700);
  const api = new DockviewApi(dockview);
  disposals.push(() => {
    dockview.dispose();
    element.remove();
  });
  let state: BrowserSnapshot = {
    tabs: [],
    history: [],
    downloads: [],
    settings: { searchEngine: 'duckduckgo', rememberHistory: true, defaultZoom: 1 },
  };
  let listener: (value: BrowserSnapshot) => void = () => undefined;
  let nextId = 0;
  const bridge: BrowserBridge = {
    subscribe: (callback) => {
      listener = callback;
      return () => {
        listener = () => undefined;
      };
    },
    command: vi.fn<BrowserBridge['command']>(async (command) => {
      switch (command.kind) {
        case 'new-tab': {
          const id = String(++nextId);
          state = {
            ...state,
            activeTabId: id,
            tabs: [
              ...state.tabs,
              {
                id,
                title: 'New tab',
                url: '',
                isLoading: false,
                canGoBack: false,
                canGoForward: false,
                zoom: 1,
              },
            ],
          };
          break;
        }
        case 'select-tab': {
          state = { ...state, activeTabId: command.tabId };
          break;
        }
        case 'close-tab': {
          state = { ...state, tabs: state.tabs.filter((tab) => tab.id !== command.tabId) };
          break;
        }
        default: {
          break;
        }
      }
      if (command.kind !== 'snapshot') {
        listener(state);
      }
      return state;
    }),
  };
  disposals.push(
    connectBrowserWorkbench({
      api,
      bridge,
      isRestoring: () => false,
      onError: (message) => {
        throw new Error(message);
      },
    }),
  );
  await Promise.resolve();
  return {
    api,
    bridge,
    snapshot: () => state,
    publish: (value) => {
      state = value;
      listener(value);
    },
  };
};

describe('browser workbench tabs', () => {
  it('should use the workbench tab for each page, update its title, and close the native page from that tab', async () => {
    const { api, bridge, snapshot, publish } = await setup();
    api.addPanel({ id: 'browser:first', component: 'browser', title: 'Browser' });
    await vi.waitFor(() => {
      expect(browserPanelTabId(api.panels[0]!)).toBe('1');
    });
    publish({
      ...snapshot(),
      tabs: snapshot().tabs.map((tab) => ({ ...tab, title: 'Reference', url: 'https://example.com/' })),
    });
    expect(api.panels[0]?.title).toBe('Reference');
    await bridge.command({ kind: 'new-tab' });
    expect(api.panels.map((panel) => browserPanelTabId(panel))).toEqual(['1', '2']);
    expect(browserPanelTabId(api.activePanel!)).toBe('2');
    api.panels[0]!.api.setActive();
    expect(bridge.command).toHaveBeenLastCalledWith({ kind: 'select-tab', tabId: '1' });
    api.panels[0]!.api.close();
    expect(bridge.command).toHaveBeenCalledWith({ kind: 'close-tab', tabId: '1' });
    expect(snapshot().tabs.map((tab) => tab.id)).toEqual(['2']);
    expect(api.panels.map((panel) => browserPanelTabId(panel))).toEqual(['2']);
  });

  it('should open additional pages alongside files and keep URLs out of portable project layouts', async () => {
    const { api, bridge, snapshot, publish } = await setup();
    api.addPanel({ id: 'file', component: 'editor', title: 'model.scad', params: { filePath: 'model.scad' } });
    await bridge.command({ kind: 'new-tab' });
    await bridge.command({ kind: 'new-tab' });
    expect(api.panels.map((panel) => panel.api.component)).toEqual(['editor', 'browser', 'browser']);
    expect(fromDockview('workbench', api.toJSON())).toMatchObject({
      kind: 'group',
      tabs: [
        { kind: 'file', path: 'model.scad' },
        { kind: 'pane', pane: 'browser' },
      ],
    });
    api.getPanel('file')!.api.setActive();
    // A background page update must not steal the workbench's selected file.
    publish({ ...snapshot(), tabs: snapshot().tabs.map((tab) => ({ ...tab, title: 'Updated title' })) });
    expect(api.activePanel?.id).toBe('file');
    publish({ ...snapshot(), tabs: [], activeTabId: undefined });
    expect(api.panels.map((panel) => panel.id)).toEqual(['file']);
  });
});
