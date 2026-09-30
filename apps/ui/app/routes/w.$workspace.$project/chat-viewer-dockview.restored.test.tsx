import { act, render, screen } from '@testing-library/react';
import { createElement, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DockviewApi, DockviewReadyEvent, IDockviewPanelProps } from 'dockview-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  projectSend: vi.fn(),
  nextProjectSend: vi.fn(),
  editorSend: vi.fn(),
  revealSecondary: () => undefined,
  hideSecondary: () => undefined,
  switchProject: () => undefined,
  resetProject: () => undefined,
  editorSnapshot: {
    context: {
      viewerLayout: { restored: true },
      viewSettings: {},
      unitSettings: {},
    },
  },
}));

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (state: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));

vi.mock('#hooks/use-project.js', () => {
  const projectRef = {
    send: fixture.projectSend,
    getSnapshot: () => ({ matches: (state: string) => state === 'ready' }),
    on: () => ({ unsubscribe: () => undefined }),
  };
  const nextProjectRef = { ...projectRef, send: fixture.nextProjectSend };
  const project = {
    projectRef,
    editorRef: {
      send: fixture.editorSend,
      getSnapshot: () => fixture.editorSnapshot,
    },
    mainEntryPath: 'main.ts',
    geometryUnits: new Map(),
    viewRecords: new Map(),
    setViewEntryPath: vi.fn(),
  };
  fixture.switchProject = () => {
    project.projectRef = nextProjectRef;
  };
  fixture.resetProject = () => {
    project.projectRef = projectRef;
  };
  return { useProject: () => project };
});

vi.mock('#routes/w.$workspace.$project/chat-viewer.js', () => ({
  ChatViewer: ({ entryPath }: { entryPath: string }) => <div data-testid={`content:${entryPath}`} />,
}));
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({ edit: vi.fn(), remove: vi.fn() }),
}));

vi.mock('#components/panes/dockview.js', () => ({
  Dockview: ({
    components,
    onReady,
  }: {
    components: { viewer: (properties: IDockviewPanelProps) => ReactNode };
    onReady: (event: DockviewReadyEvent) => void;
  }) => {
    const [, refresh] = useState(0);
    const [api] = useState(() => {
      const visibilityListeners = new Set<() => void>();
      const main = {
        id: 'main-view',
        params: { viewId: 'main-view', entryPath: 'main.ts' },
        api: { isVisible: true, onDidVisibilityChange: () => ({ dispose: () => undefined }) },
      };
      const secondary = {
        id: 'secondary-view',
        params: { viewId: 'secondary-view', entryPath: 'other.ts' },
        api: {
          isVisible: false,
          onDidVisibilityChange: (listener: () => void) => {
            visibilityListeners.add(listener);
            return { dispose: () => visibilityListeners.delete(listener) };
          },
        },
      };
      const panels: Array<typeof main | typeof secondary> = [];
      fixture.revealSecondary = () => {
        secondary.api.isVisible = true;
        for (const listener of visibilityListeners) {
          listener();
        }
        refresh((value) => value + 1);
      };
      fixture.hideSecondary = () => {
        secondary.api.isVisible = false;
        for (const listener of visibilityListeners) {
          listener();
        }
        refresh((value) => value + 1);
      };
      const subscribe = () => ({ dispose: () => undefined });
      return {
        panels,
        groups: [{}],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Dockview's public API spells this method fromJSON.
        fromJSON: () => {
          panels.push(main, secondary);
          refresh((value) => value + 1);
        },
        addPanel: ({ id, params }: { id: string; params: { viewId: string; entryPath: string } }) => {
          panels.push({ id, params, api: main.api });
          refresh((value) => value + 1);
        },
        clear: () => {
          panels.length = 0;
          refresh((value) => value + 1);
        },
        onDidLayoutChange: subscribe,
        onDidActivePanelChange: subscribe,
        onDidAddPanel: subscribe,
        onDidRemovePanel: subscribe,
        onWillDragPanel: subscribe,
        onUnhandledDragOver: subscribe,
      } as unknown as DockviewApi;
    });
    useEffect(() => {
      onReady({ api } as DockviewReadyEvent);
      if (api.panels.length === 0) {
        api.fromJSON({} as Parameters<DockviewApi['fromJSON']>[0]);
      }
    }, [api, onReady]);
    return createElement(
      'div',
      undefined,
      api.panels.map((panel) =>
        createElement(components.viewer, {
          key: panel.id,
          api: panel.api,
          params: panel.params,
        } as unknown as IDockviewPanelProps),
      ),
    );
  },
}));

const { ViewerDockview } = await import('./chat-viewer-dockview.js');

describe('restored viewer layout admission', () => {
  beforeEach(() => {
    fixture.resetProject();
    fixture.projectSend.mockClear();
    fixture.nextProjectSend.mockClear();
    fixture.editorSend.mockClear();
  });

  it('admits main immediately and defers a distinct hidden entry until reveal', () => {
    render(<ViewerDockview />);

    expect(screen.getByTestId('content:main.ts')).toBeInTheDocument();
    expect(screen.queryByTestId('content:other.ts')).not.toBeInTheDocument();
    expect(fixture.projectSend).toHaveBeenCalledWith({
      type: 'createGeometryUnit',
      entryPath: 'main.ts',
      operationTimeout: undefined,
    });
    expect(fixture.projectSend).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'createGeometryUnit', entryPath: 'other.ts' }),
    );

    act(() => {
      fixture.revealSecondary();
    });
    expect(screen.getByTestId('content:other.ts')).toBeInTheDocument();
    expect(fixture.projectSend).toHaveBeenCalledWith({
      type: 'createGeometryUnit',
      entryPath: 'other.ts',
      operationTimeout: undefined,
    });

    act(() => {
      fixture.hideSecondary();
    });
    expect(screen.queryByTestId('content:other.ts')).not.toBeInTheDocument();
    act(() => {
      fixture.revealSecondary();
    });
    expect(screen.getByTestId('content:other.ts')).toBeInTheDocument();
    expect(
      fixture.projectSend.mock.calls.filter(
        ([event]) => event.type === 'createGeometryUnit' && event.entryPath === 'other.ts',
      ),
    ).toHaveLength(1);
  });

  it('re-admits visible panel IDs when the project actor changes', () => {
    const view = render(<ViewerDockview />);
    fixture.switchProject();
    view.rerender(<ViewerDockview profile='shared' />);

    expect(fixture.nextProjectSend).toHaveBeenCalledWith({
      type: 'createGeometryUnit',
      entryPath: 'main.ts',
      operationTimeout: undefined,
    });
    expect(fixture.nextProjectSend).not.toHaveBeenCalledWith(expect.objectContaining({ entryPath: 'other.ts' }));
  });

  it('releases only the hidden secondary viewer demand after reveal', () => {
    render(<ViewerDockview />);
    act(() => {
      fixture.revealSecondary();
    });
    expect(fixture.projectSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'createGeometryUnit', entryPath: 'other.ts' }),
    );

    fixture.projectSend.mockClear();
    act(() => {
      fixture.hideSecondary();
    });
    expect(screen.queryByTestId('content:other.ts')).not.toBeInTheDocument();
    expect(fixture.projectSend).toHaveBeenCalledWith({ type: 'setViewerGeometryDemand', viewId: 'secondary-view' });
    expect(fixture.projectSend).not.toHaveBeenCalledWith({ type: 'setViewerGeometryDemand', viewId: 'main-view' });
    expect(fixture.projectSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'parkRuntime' }));
    expect(fixture.projectSend).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'destroyGeometryUnit' }));
  });
});
