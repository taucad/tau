import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchLaneNode, WorkbenchLayout } from '@taucad/workbench';
import type * as KeyboardModule from '#hooks/use-keyboard.js';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';

const state = vi.hoisted(() => ({ isMobile: false, isEditorReady: true }));
const route = vi.hoisted<{
  key: string;
  state: { openChat?: boolean; focusChatComposer?: boolean } | undefined;
}>(() => ({
  key: 'initial',
  state: undefined,
}));
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
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => state.isMobile }));
vi.mock('react-router', () => ({ useLocation: () => route }));
vi.mock('@xstate/react', () => ({
  useSelector: (_actor: unknown, selector: (snapshot: { matches: () => boolean }) => unknown) =>
    selector({ matches: () => state.isEditorReady }),
}));
const stubKeybinding = (): ReturnType<typeof KeyboardModule.useKeybinding> => ({ formattedKeyCombination: '' });
const keyboard = vi.hoisted(() => ({ useKeybinding: vi.fn<typeof KeyboardModule.useKeybinding>() }));
vi.mock('#hooks/use-keyboard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof KeyboardModule>()),
  useKeybinding: keyboard.useKeybinding,
}));

const { ProjectWorkspaceProvider, resolveCompactAuxiliary, useProjectWorkspace } =
  await import('./project-workspace-context.js');
const keyboardActual = await vi.importActual<typeof KeyboardModule>('#hooks/use-keyboard.js');
type Workspace = NonNullable<ReturnType<typeof useProjectWorkspace>>;

let workspace: Workspace;

function Probe(): React.JSX.Element {
  workspace = useProjectWorkspace();
  return <span hidden />;
}

describe('ProjectWorkspaceProvider', () => {
  beforeEach(() => {
    state.isMobile = false;
    state.isEditorReady = true;
    route.key = 'initial';
    route.state = undefined;
    send.mockClear();
    listeners.clear();
    keyboard.useKeybinding.mockImplementation(stubKeybinding);
  });

  it('reveals the Workbench lane for Files before its launcher mounts', () => {
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
    expect(opener).not.toHaveBeenCalled();
  });

  it('opens Files immediately when the Workbench opener is connected', () => {
    render(<ProjectWorkspaceProvider><Probe /></ProjectWorkspaceProvider>);
    const opener = vi.fn();
    act(() => { workspace.connectWorkbench(opener); workspace.openPanel('files'); });
    expect(opener).toHaveBeenCalledExactlyOnceWith('files');
  });

  it('should reopen the chat pane on a sidebar chat navigation, including the selected chat', () => {
    const rendered = render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    expect(send).not.toHaveBeenCalled();

    route.key = 'clicked-chat';
    route.state = { openChat: true };
    rendered.rerender(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setPanelState',
      panelState: { desktopLayout: { chatOpen: true, compactAuxiliary: 'chat' } },
    });
  });

  it('should wait for the destination project editor before opening its chat pane', () => {
    state.isEditorReady = false;
    route.state = { openChat: true };
    const rendered = render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    expect(send).not.toHaveBeenCalled();

    state.isEditorReady = true;
    rendered.rerender(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setPanelState',
      panelState: { desktopLayout: { chatOpen: true, compactAuxiliary: 'chat' } },
    });
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

  it('records utility intent in the layout owner before the Dockview connects', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    const layout: WorkbenchLayout = { version: 1, lanes: { chat: true, workbench: true },
      viewer: { kind: 'group', tabs: [] }, workbench: { kind: 'group', tabs: [] } };
    let workbench: WorkbenchLaneNode = layout.workbench;
    const controller: WorkbenchLayoutController = {
      snapshot: () => ({ layout: { ...layout, workbench }, layoutDigest: 'missing', refused: [] }),
      subscribe: () => () => undefined,
      restorePreviousArrangement: async () => true,
      registerViewer: () => () => undefined,
      registerWorkbench: (apply) => { apply(workbench, () => undefined); return () => undefined; },
      personViewerChanged: () => undefined,
      personWorkbenchChanged: (next) => { workbench = typeof next === 'function' ? next(workbench) : next; },
    };
    act(() => { workspace.registerLayoutController(controller); });

    act(() => {
      workspace.openPanel('files');
      workspace.openPanel('parameters');
      workspace.openPanel('revisions');
    });

    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
    });
    expect(opener).not.toHaveBeenCalled();
    expect(workbench).toEqual({ kind: 'group', tabs: [
      { kind: 'pane', pane: 'parameters' }, { kind: 'pane', pane: 'revisions' },
    ], active: 1 });
    const adopt = vi.fn();
    act(() => { workspace.layoutController.registerWorkbench(adopt); });
    expect(adopt).toHaveBeenCalledExactlyOnceWith(workbench, expect.any(Function));
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

    act(() => {
      workspace.openPanel('revisions');
    });
    expect(send).toHaveBeenLastCalledWith({
      type: 'setPanelState',
      panelState: { mobileActiveTab: 'revisions' },
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

  it('should leave Ctrl+M to a focused code editor and open Kinematics everywhere else', () => {
    keyboard.useKeybinding.mockImplementation(keyboardActual.useKeybinding);
    render(
      <keyboardActual.KeyboardProvider>
        <ProjectWorkspaceProvider>
          <Probe />
        </ProjectWorkspaceProvider>
      </keyboardActual.KeyboardProvider>,
    );
    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
    });
    // Monaco 0.55 types into a role="textbox" EditContext div, or its textarea fallback, and binds Ctrl+M there
    // on Windows and Linux ("Toggle Tab Key Moves Focus").
    const editContext = document.createElement('div');
    editContext.setAttribute('role', 'textbox');
    editContext.tabIndex = 0;
    const textArea = document.createElement('textarea');
    textArea.setAttribute('role', 'textbox');
    document.body.append(editContext, textArea);

    for (const input of [editContext, textArea]) {
      // `fireEvent` returns false once a listener has prevented the default action.
      expect(fireEvent.keyDown(input, { key: 'm', ctrlKey: true })).toBe(true);
    }
    expect(opener).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(document.body, { key: 'm', ctrlKey: true })).toBe(false);
    expect(opener).toHaveBeenCalledExactlyOnceWith('kinematics');
    editContext.remove();
    textArea.remove();
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
