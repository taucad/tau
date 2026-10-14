import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import type { BrowserBridge, BrowserCommand, BrowserSnapshot } from '@taucad/types/browser';

/** Native page identity is local session state, never a project URL or file. */
export type BrowserPanelParameters = { browserTabId?: string };

export const browserPanelTabId = (panel: Pick<IDockviewPanel, 'params'>): string | undefined => {
  const parameters = panel.params as BrowserPanelParameters | undefined;
  return parameters?.browserTabId;
};

/** Project native browser pages into the workbench's existing tabs and close lifecycle. */
export const connectBrowserWorkbench = ({
  api,
  bridge,
  isRestoring,
  onError,
}: {
  api: DockviewApi;
  bridge: BrowserBridge;
  isRestoring: () => boolean;
  onError: (message: string) => void;
}): (() => void) => {
  let snapshot: BrowserSnapshot | undefined;
  let isDisposed = false;
  let isReconciling = false;
  let isCreating = false;
  let previousActiveId: string | undefined;
  const closing = new Set<string>();
  const panels = (): IDockviewPanel[] => api.panels.filter((panel) => panel.api.component === 'browser');
  const report = (error: unknown): void => {
    if (!isDisposed) {
      onError(error instanceof Error ? error.message : 'The browser action could not be completed.');
    }
  };
  const send = async (command: BrowserCommand): Promise<void> => {
    try {
      await bridge.command(command);
    } catch (error) {
      report(error);
    }
  };
  const reconcile = (): void => {
    if (isDisposed || isReconciling || isRestoring() || !snapshot) {
      return;
    }
    isReconciling = true;
    try {
      for (const panel of panels()) {
        const id = browserPanelTabId(panel);
        if (id && !snapshot.tabs.some((tab) => tab.id === id)) {
          api.removePanel(panel);
        }
      }
      for (const tab of snapshot.tabs) {
        if (closing.has(tab.id)) {
          continue;
        }
        let panel = panels().find((candidate) => browserPanelTabId(candidate) === tab.id);
        if (!panel) {
          panel = panels().find((candidate) => !browserPanelTabId(candidate));
          if (panel) {
            panel.api.updateParameters({ browserTabId: tab.id });
          } else {
            const group = api.activeGroup;
            panel = api.addPanel({
              id: `browser:${tab.id}`,
              component: 'browser',
              title: tab.title,
              params: { browserTabId: tab.id },
              inactive: true,
              ...(group ? { position: { direction: 'within', referenceGroup: group } } : {}),
            });
          }
        }
        if (panel.api.title !== tab.title) {
          panel.api.setTitle(tab.title);
        }
        if (snapshot.activeTabId === tab.id && previousActiveId !== tab.id) {
          panel.api.setActive();
        }
      }
      previousActiveId = snapshot.activeTabId;
    } finally {
      isReconciling = false;
    }
    const placeholder = panels().find((panel) => !browserPanelTabId(panel));
    if (placeholder && !isCreating) {
      isCreating = true;
      const createPage = async (): Promise<void> => {
        try {
          await bridge.command({ kind: 'new-tab' });
        } catch (error) {
          report(error);
          if (!isDisposed && api.getPanel(placeholder.id) === placeholder && !browserPanelTabId(placeholder)) {
            api.removePanel(placeholder);
          }
        } finally {
          isCreating = false;
          if (snapshot?.tabs.some((tab) => browserPanelTabId(placeholder) === tab.id)) {
            reconcile();
          }
        }
      };
      void createPage();
    }
  };
  const unsubscribe = bridge.subscribe((value) => {
    snapshot = value;
    for (const id of closing) {
      if (!value.tabs.some((tab) => tab.id === id)) {
        closing.delete(id);
      }
    }
    reconcile();
  });
  const added = api.onDidAddPanel(reconcile);
  const layout = api.onDidLayoutChange(() => {
    queueMicrotask(reconcile);
  });
  const changed = api.onDidActivePanelChange(({ panel }) => {
    if (isReconciling || isRestoring() || panel?.api.component !== 'browser') {
      return;
    }
    const tabId = browserPanelTabId(panel);
    if (tabId && tabId !== snapshot?.activeTabId) {
      void send({ kind: 'select-tab', tabId });
    }
  });
  const removed = api.onDidRemovePanel((panel) => {
    if (isReconciling || isRestoring() || panel.api.component !== 'browser') {
      return;
    }
    const tabId = browserPanelTabId(panel);
    if (tabId) {
      closing.add(tabId);
      void send({ kind: 'close-tab', tabId });
    }
  });
  const readInitial = async (): Promise<void> => {
    try {
      const value = await bridge.command({ kind: 'snapshot' });
      snapshot ??= value;
      reconcile();
    } catch (error) {
      report(error);
    }
  };
  void readInitial();
  return () => {
    isDisposed = true;
    unsubscribe();
    added.dispose();
    layout.dispose();
    changed.dispose();
    removed.dispose();
  };
};
