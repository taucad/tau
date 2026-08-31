import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ isMobile: false }));
const send = vi.fn();
type EditorOutputEvent = {
  readonly type: string;
  readonly path?: string;
  readonly source?: 'user' | 'machine';
};
const listeners = new Map<string, (event: EditorOutputEvent) => void>();
const editorRef = {
  send,
  getSnapshot: () => ({
    context: {
      activePaneId: undefined,
      openFiles: [],
    },
  }),
  on: vi.fn((type: string, listener: (event: EditorOutputEvent) => void) => {
    listeners.set(type, listener);
    return { unsubscribe: vi.fn() };
  }),
};

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef, mainEntryPath: 'main.ts' }),
}));
vi.mock('#hooks/use-mobile.js', () => ({ useIsMobile: () => state.isMobile }));
vi.mock('#hooks/use-keyboard.js', () => ({ useKeybinding: vi.fn(() => ({ formattedKeyCombination: '' })) }));

const { ProjectWorkspaceProvider, resolveCompactAuxiliary, useProjectWorkspace } =
  await import('./project-workspace-context.js');
type Workspace = NonNullable<ReturnType<typeof useProjectWorkspace>>;

let workspace: Workspace;

function Probe(): React.JSX.Element {
  workspace = useProjectWorkspace();
  return <span hidden />;
}

describe('ProjectWorkspaceProvider', () => {
  beforeEach(() => {
    state.isMobile = false;
    send.mockClear();
    listeners.clear();
  });

  it('routes Files through the connected Workbench opener', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    act(() => {
      workspace.openPanel('files');
    });
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setPanelState',
      panelState: {
        desktopLayout: {
          workbenchOpen: true,
          compactAuxiliary: 'workbench',
        },
      },
    });

    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
    });
    expect(opener).toHaveBeenCalledExactlyOnceWith('files');
  });

  it('opens Share in the desktop Workbench', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
      workspace.openPanel('share');
    });
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setPanelState',
      panelState: { desktopLayout: { workbenchOpen: true, compactAuxiliary: 'workbench' } },
    });
    expect(opener).toHaveBeenCalledExactlyOnceWith('share');
  });

  it('keeps only the latest queued utility request before the Workbench connects', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    act(() => {
      workspace.openPanel('files');
      workspace.openPanel('revisions');
    });

    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
    });
    expect(opener).toHaveBeenCalledExactlyOnceWith('revisions');
  });

  it('maps supported Workbench actions to the existing mobile drawer tabs', () => {
    state.isMobile = true;
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    act(() => {
      workspace.openPanel('export');
    });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setPanelState',
      panelState: { mobileActiveTab: 'converter' },
    });

    act(() => {
      workspace.openPanel('share');
    });
    expect(send).toHaveBeenLastCalledWith({
      type: 'setPanelState',
      panelState: { mobileActiveTab: 'share' },
    });
  });

  it('does not mutate desktop state for unsupported mobile-only actions', () => {
    state.isMobile = true;
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    act(() => {
      workspace.openPanel('model');
      workspace.openPanel('revisions');
      workspace.openPanel('kernel');
    });

    expect(send).not.toHaveBeenCalled();
  });

  it('selects Workbench only for user-origin file opens on desktop', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    act(() => {
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'main.ts', source: 'machine' });
    });
    expect(send).not.toHaveBeenCalled();

    act(() => {
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'main.ts', source: 'user' });
    });
    expect(send).toHaveBeenCalledWith({
      type: 'setPanelState',
      panelState: { desktopLayout: { workbenchOpen: true, compactAuxiliary: 'workbench' } },
    });
  });

  it('should leave file reveal routing to the sender-selected Workbench owner', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    expect(listeners.has('fileRevealRequested')).toBe(false);
    expect(listeners.has('modelComponentRevealRequested')).toBe(true);
  });
});

describe('resolveCompactAuxiliary', () => {
  const layout: Parameters<typeof resolveCompactAuxiliary>[0] = {
    chatOpen: true,
    workbenchOpen: true,
    chatWidth: 320,
    workbenchWidth: 420,
    compactAuxiliary: 'chat',
  };

  it('uses the recorded open lane and falls back without rewriting state', () => {
    expect(resolveCompactAuxiliary(layout)).toBe('chat');
    expect(resolveCompactAuxiliary({ ...layout, chatOpen: false })).toBe('workbench');
    expect(resolveCompactAuxiliary({ ...layout, chatOpen: false, workbenchOpen: false })).toBeUndefined();
  });
});
