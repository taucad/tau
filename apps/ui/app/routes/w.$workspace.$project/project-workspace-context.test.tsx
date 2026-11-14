import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { WorkbenchLaneNode, WorkbenchLayout } from '@taucad/workbench';
import type * as KeyboardModule from '@taucad/ui/components/keyboard';
import { createActor } from 'xstate';
import { workbenchRecords } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import type { ActorRefFrom } from 'xstate';
import type { editorMachine } from '#machines/editor.machine.js';
import {
  createLayoutBridgeLogic,
  createProjectLayoutHost,
  createProjectShellPort,
} from '#runtime/project-runtime.layout.js';
import type { ProjectRuntime } from '#runtime/project-runtime.js';
import { createViewRecordPorts } from '#workbench-records/view-record-session.js';

const state = vi.hoisted(() => ({ isMobile: false, isEditorReady: true }));
const route = vi.hoisted<{
  key: string;
  search: string;
  navigationType?: 'POP' | 'PUSH' | 'REPLACE';
  state: { openChat?: boolean; focusChatComposer?: boolean } | undefined;
}>(() => ({
  key: 'initial',
  search: '',
  state: undefined,
}));
const send = vi.fn();
type EditorOutputEvent = {
  readonly type: string;
  readonly path?: string;
  readonly source?: 'user' | 'machine' | 'record';
};
const listeners = new Map<string, (event: EditorOutputEvent) => void>();
const editorFiles: Array<{ path: string }> = [];
const editorLanes = { chatOpen: true, workbenchOpen: true };
const editorSubscribers = new Set<(snapshot: unknown) => void>();
const editorRef = {
  send,
  getSnapshot: () => ({
    context: {
      activePaneId: undefined,
      openFiles: editorFiles,
      panelState: { desktopLayout: { ...editorLanes } },
    },
    // The editor has loaded its lanes: the bridge seeds the layout with them at once.
    matches: (value: string) => value === 'ready',
  }),
  on: vi.fn((type: string, listener: (event: EditorOutputEvent) => void) => {
    listeners.set(type, listener);
    return { unsubscribe: vi.fn() };
  }),
  subscribe: vi.fn((listener: (snapshot: unknown) => void) => {
    editorSubscribers.add(listener);
    return { unsubscribe: () => editorSubscribers.delete(listener) };
  }),
};
/** The editor applies a lane change: its subscribers (the runtime's bridge) see it. */
function setEditorLanes(change: Partial<typeof editorLanes>): void {
  Object.assign(editorLanes, change);
  for (const listener of editorSubscribers) {
    listener(editorRef.getSnapshot());
  }
}

let currentEditorRef = editorRef;

/*
 * The project runtime's parts the workspace speaks to (A8b): its shell port, the bridge that forwards the editor's
 * opens and reveals to it, and, for a project with view records, its layout child. The editor's `fileOpened` reaches
 * the workspace through the bridge, as in the app.
 */
const stops = new Set<() => void>();
type TestRuntime = Readonly<{
  projectRuntime: ProjectRuntime;
  layout: ReturnType<typeof createLayoutActor> | undefined;
  /** Let the layout record's first read answer. */
  answerRead: () => void;
}>;
const storedLayout = (): Parameters<typeof workbenchRecords.layout.serialize>[0] => ({
  version: 1,
  lanes: { chat: true, workbench: true },
  viewer: { kind: 'group', tabs: [] },
  workbench: { kind: 'group', tabs: [{ kind: 'pane', pane: 'parameters' }] },
});
function createLayoutActor(read: Promise<void>, editor: typeof editorRef) {
  const bytes = new TextEncoder().encode(workbenchRecords.layout.serialize(storedLayout()));
  const files = {
    exists: async () => {
      await read;
      return true;
    },
    readFile: async () => bytes,
    writeFileChecked: async (): Promise<CheckedFileWriteResult> => ({ status: 'applied', content: bytes }),
  };
  const ports = createViewRecordPorts({
    projectId: 'p',
    root: '/projects/p',
    host: {
      files,
      watch: () => ({
        ready: Promise.resolve(),
        closed: new Promise<void>(() => {
          /* Stays open: the watch is never closed by its host. */
        }),
        dispose: () => undefined,
      }),
    },
    setViewRecord: () => undefined,
    setViewEntryPath: () => undefined,
    setAppliedWorkbenchRevision: () => undefined,
  });
  const host = createProjectLayoutHost({ projectId: 'p', ports });
  const { desktopLayout } = editor.getSnapshot().context.panelState;
  const actor = createActor(host.logic, {
    input: {
      ...host.input,
      workbenchOpen: desktopLayout.workbenchOpen,
      lanes: { chat: desktopLayout.chatOpen, workbench: desktopLayout.workbenchOpen },
    },
  });
  return { host, actor };
}
function runtimeFor(editor: typeof editorRef, options: { layout?: boolean } = {}): TestRuntime {
  const shell = createProjectShellPort();
  const read = Promise.withResolvers<void>();
  const layout = options.layout ? createLayoutActor(read.promise, editor) : undefined;
  layout?.actor.start();
  const bridge = createActor(createLayoutBridgeLogic({ shell, host: layout?.host }), {
    input: { editor: editor as unknown as ActorRefFrom<typeof editorMachine>, layout: layout?.actor },
  });
  bridge.start();
  stops.add(() => {
    bridge.stop();
    layout?.actor.stop();
  });
  return {
    projectRuntime: {
      shell,
      layout: layout?.host,
      actor: { getSnapshot: () => ({ context: { layoutRef: layout?.actor } }) },
    } as unknown as ProjectRuntime,
    layout,
    answerRead: () => {
      read.resolve();
    },
  };
}
let currentRuntime: TestRuntime | undefined;

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: currentEditorRef,
    mainEntryPath: 'main.ts',
    projectRuntime: currentRuntime?.projectRuntime,
  }),
}));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => state.isMobile }));
vi.mock('react-router', () => ({
  NavigationType: { Pop: 'POP', Push: 'PUSH', Replace: 'REPLACE' },
  useLocation: () => route,
  useNavigationType: () => route.navigationType ?? 'PUSH',
}));
vi.mock('@xstate/react', () => ({
  useSelector: (_actor: unknown, selector: (snapshot: { matches: () => boolean }) => unknown) =>
    selector({ matches: () => state.isEditorReady }),
}));
const stubKeybinding = (): ReturnType<typeof KeyboardModule.useKeybinding> => ({ formattedKeyCombination: '' });
const keyboard = vi.hoisted(() => ({ useKeybinding: vi.fn<typeof KeyboardModule.useKeybinding>() }));
vi.mock('@taucad/ui/components/keyboard', async (importOriginal) => ({
  ...(await importOriginal<typeof KeyboardModule>()),
  useKeybinding: keyboard.useKeybinding,
}));

const { ProjectWorkspaceProvider, resolveCompactAuxiliary, useFileReturn, useProjectWorkspace } =
  await import('./project-workspace-context.js');
const keyboardActual = await vi.importActual<typeof KeyboardModule>('@taucad/ui/components/keyboard');
type Workspace = NonNullable<ReturnType<typeof useProjectWorkspace>>;

let workspace: Workspace;
let fileReturn: ReturnType<typeof useFileReturn>;

function Probe(): React.JSX.Element {
  workspace = useProjectWorkspace();
  fileReturn = useFileReturn();
  return <span hidden />;
}

describe('ProjectWorkspaceProvider', () => {
  beforeEach(() => {
    currentEditorRef = editorRef;
    editorFiles.length = 0;
    state.isMobile = false;
    state.isEditorReady = true;
    route.key = 'initial';
    route.search = '';
    route.state = undefined;
    route.navigationType = undefined;
    send.mockClear();
    listeners.clear();
    keyboard.useKeybinding.mockImplementation(stubKeybinding);
    for (const stop of stops) {
      stop();
    }
    stops.clear();
    editorSubscribers.clear();
    Object.assign(editorLanes, { chatOpen: true, workbenchOpen: true });
    currentRuntime = runtimeFor(editorRef);
  });

  it.each(['replace', 'gap', 'moved'] as const)(
    'should preserve recovery focus across header %s without stealing it',
    (mode) => {
      function Header(): React.JSX.Element {
        const { registerRecordRecoveryFocus } = useProjectWorkspace();
        return (
          <button ref={registerRecordRecoveryFocus} type='button'>
            Share
          </button>
        );
      }
      const tree = (header: string | undefined) => (
        <ProjectWorkspaceProvider>
          <Probe />
          {header && <Header key={header} />}
          <button type='button'>Export</button>
        </ProjectWorkspaceProvider>
      );
      const view = render(tree('old'));
      act(() => {
        workspace.restoreRecordRecoveryFocus();
      });
      expect(screen.getByRole('button', { name: 'Share' })).toHaveFocus();
      if (mode !== 'replace') {
        view.rerender(tree(undefined));
        if (mode === 'moved') {
          screen.getByRole('button', { name: 'Export' }).focus();
        } else {
          act(() => {
            workspace.restoreRecordRecoveryFocus();
          });
        }
      }
      view.rerender(tree('replacement'));
      expect(screen.getByRole('button', { name: mode === 'moved' ? 'Export' : 'Share' })).toHaveFocus();
      const restore = workspace.restoreRecordRecoveryFocus;
      view.unmount();
      expect(() => {
        restore();
      }).not.toThrow();
      expect(document.body).toHaveFocus();
    },
  );

  it.each(['request-after-detach', 'focused-before-detach', 'moved-before-detach'] as const)(
    'should preserve recovery across external header removal: %s',
    (mode) => {
      const oldContainer = document.createElement('div');
      const nextContainer = document.createElement('div');
      document.body.append(oldContainer, nextContainer);
      function Header({ container }: { readonly container: HTMLElement }): React.JSX.Element {
        const { registerRecordRecoveryFocus } = useProjectWorkspace();
        return createPortal(
          <button ref={registerRecordRecoveryFocus} type='button'>
            Share
          </button>,
          container,
        );
      }
      const tree = (container: HTMLElement) => (
        <ProjectWorkspaceProvider>
          <Probe />
          <Header container={container} />
          <button type='button'>Export</button>
        </ProjectWorkspaceProvider>
      );
      const view = render(tree(oldContainer));
      if (mode !== 'request-after-detach') {
        act(() => {
          workspace.restoreRecordRecoveryFocus();
        });
        if (mode === 'moved-before-detach') {
          screen.getByRole('button', { name: 'Export' }).focus();
        }
      }
      oldContainer.remove();
      if (mode === 'request-after-detach') {
        act(() => {
          workspace.restoreRecordRecoveryFocus();
        });
      }
      view.rerender(tree(nextContainer));
      expect(screen.getByRole('button', { name: mode === 'moved-before-detach' ? 'Export' : 'Share' })).toHaveFocus();
      view.unmount();
      nextContainer.remove();
    },
  );
  it('opens a Preview drawer and delivers Export once its workbench mounts on mobile', () => {
    state.isMobile = true;
    const reveal = vi.fn();
    const open = vi.fn();
    render(
      <ProjectWorkspaceProvider workbenchMode='pane' onWorkbenchOpen={reveal}>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    act(() => {
      workspace.openPanel('export');
    });
    expect(reveal).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    act(() => {
      workspace.connectWorkbench(open);
    });
    expect(open).toHaveBeenCalledExactlyOnceWith('export');
    act(() => {
      workspace.connectWorkbench(open);
    });
    expect(open).toHaveBeenCalledTimes(1);
    act(() => {
      workspace.openPanel('files');
    });
    expect(open).toHaveBeenLastCalledWith('files');
  });

  it('does not deliver a pending Preview panel after navigating to another route', () => {
    const open = vi.fn();
    const view = render(
      <ProjectWorkspaceProvider workbenchMode='pane'>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    act(() => {
      workspace.openPanel('export');
    });
    route.key = 'another-preview';
    view.rerender(
      <ProjectWorkspaceProvider workbenchMode='pane'>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    act(() => {
      workspace.connectWorkbench(open);
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('reveals the Workbench lane and fulfills Files once when its launcher mounts', () => {
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
    const replacement = vi.fn();
    act(() => {
      workspace.connectWorkbench(replacement);
    });
    expect(replacement).not.toHaveBeenCalled();
  });

  it.each([false, true])('opens an archive deep link after editor readiness (mobile=%s)', (isMobile) => {
    state.isMobile = isMobile;
    state.isEditorReady = false;
    route.search = '?chat=original&archivedChats=1';
    const view = render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    expect(send).not.toHaveBeenCalled();
    state.isEditorReady = true;
    view.rerender(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    expect(send).toHaveBeenCalledWith({
      type: 'setPanelState',
      panelState: { desktopLayout: { chatOpen: true, compactAuxiliary: 'chat' } },
    });
    if (isMobile) {
      expect(send).toHaveBeenCalledWith({ type: 'setPanelState', panelState: { mobileActiveTab: 'chat' } });
    }
    send.mockClear();
    route.search += '&q=bracket';
    route.key = 'search-edit';
    view.rerender(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('opens Files immediately when the Workbench opener is connected', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
      workspace.openPanel('files');
    });
    expect(opener).toHaveBeenCalledExactlyOnceWith('files');
  });

  // A8b: 'panel' moved out ("a later pane supersedes held Files" below); the one slot keeps the latest pane.
  it.each(['close', 'navigation', 'unmount'] as const)('cancels an unconnected Files intent after %s', (reason) => {
    const view = render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    act(() => {
      workspace.openPanel('files');
    });
    const { connectWorkbench } = workspace;
    switch (reason) {
      case 'close': {
        act(() => {
          workspace.setWorkbenchOpen(false);
        });
        break;
      }
      case 'navigation': {
        route.key = 'destination';
        view.rerender(
          <ProjectWorkspaceProvider>
            <Probe />
          </ProjectWorkspaceProvider>,
        );
        break;
      }
      case 'unmount': {
        view.unmount();
        break;
      }
    }
    const opener = vi.fn();
    act(() => {
      connectWorkbench(opener);
    });
    expect(opener).not.toHaveBeenCalled();
  });

  // Without a layout (a project with no view records, or a preview's pane), one slot holds the latest pane asked for
  // before the workbench connects: a later pane supersedes held Files (the named single-slot decision, A8b).
  it('lets a later pane supersede held Files in the one slot', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    act(() => {
      workspace.openPanel('files');
      workspace.openPanel('parameters');
    });
    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
    });
    expect(opener).toHaveBeenCalledExactlyOnceWith('parameters');
  });

  it('refuses a retired route connector without consuming the replacement Files intent', () => {
    const view = render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    const retiredConnect = workspace.connectWorkbench;
    route.key = 'replacement-route';
    view.rerender(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    const retired = vi.fn();
    const replacement = vi.fn();
    act(() => {
      workspace.openPanel('files');
      retiredConnect(retired);
      workspace.connectWorkbench(replacement);
    });
    expect(retired).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledExactlyOnceWith('files');
    act(() => {
      retiredConnect(retired);
      workspace.openPanel('files');
    });
    expect(retired).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledTimes(2);
  });

  it('preserves a Files intent issued by a child effect in the navigation commit', () => {
    function RequestFiles(): React.JSX.Element {
      const current = useProjectWorkspace();
      useEffect(() => {
        current.openPanel('files');
      }, [current.openPanel]);
      return <Probe />;
    }
    const view = render(
      <ProjectWorkspaceProvider>
        <RequestFiles />
      </ProjectWorkspaceProvider>,
    );
    route.key = 'same-commit-navigation';
    view.rerender(
      <ProjectWorkspaceProvider>
        <RequestFiles />
      </ProjectWorkspaceProvider>,
    );
    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
    });
    expect(opener).toHaveBeenCalledExactlyOnceWith('files');
  });

  it('retains the replacement opener after the retired opener cleanup runs', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    const retired = vi.fn();
    const replacement = vi.fn();
    let releaseRetired: (() => void) | undefined;
    act(() => {
      releaseRetired = workspace.connectWorkbench(retired);
      workspace.connectWorkbench(replacement);
      releaseRetired();
      workspace.openPanel('files');
    });
    expect(retired).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledExactlyOnceWith('files');
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

  it.each([
    ['model', 'model-tree'],
    ['kinematics', 'kinematics'],
    ['print', 'print'],
    ['agents', 'agents'],
    ['kernel', 'kernel'],
    ['console', 'console'],
    ['parameters', 'parameters'],
    ['files', 'files'],
    ['details', 'details'],
  ] as const)('opens %s as the %s phone surface without touching the desktop lanes (I1)', (panel, surface) => {
    state.isMobile = true;
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    act(() => {
      workspace.openPanel(panel);
    });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setPanelState',
      panelState: { mobileActiveTab: surface },
    });
  });

  it('opens browser as the browser phone surface in the desktop app (I1)', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    state.isMobile = true;
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    act(() => {
      workspace.openPanel('browser');
    });

    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'setPanelState',
      panelState: { mobileActiveTab: 'browser' },
    });
  });

  it.each([
    [undefined, false, 'browser'],
    [undefined, false, 'jobs'],
    [undefined, true, 'jobs'],
    ['desktop', false, 'jobs'],
    ['desktop', true, 'jobs'],
  ] as const)(
    'refuses an unshipped surface on any layout (TAU_TARGET=%s, mobile=%s, %s)',
    (buildTarget, isMobile, panel) => {
      vi.stubEnv('TAU_TARGET', buildTarget);
      onTestFinished(() => {
        vi.unstubAllEnvs();
      });
      state.isMobile = isMobile;
      render(
        <ProjectWorkspaceProvider>
          <Probe />
        </ProjectWorkspaceProvider>,
      );

      act(() => {
        workspace.openPanel(panel);
      });

      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'should deliver a user file opened before Workbench connects once on mobile=%s',
    (isMobile) => {
      state.isMobile = isMobile;
      render(
        <ProjectWorkspaceProvider>
          <Probe />
        </ProjectWorkspaceProvider>,
      );
      editorFiles.push({ path: 'chosen-folder.md' });
      act(() => {
        listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'chosen-folder.md', source: 'user' });
      });
      const activateFile = vi.fn();
      const connect = workspace.connectWorkbench;
      let disconnect = (): void => undefined;
      act(() => {
        disconnect = connect(vi.fn(), activateFile);
      });
      expect(activateFile).toHaveBeenCalledExactlyOnceWith('chosen-folder.md');
      act(() => {
        disconnect();
        connect(vi.fn(), activateFile);
      });
      expect(activateFile).toHaveBeenCalledTimes(1);
    },
  );

  it('should retain the latest user file, deliver live opens, and ignore machine and record opens', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    editorFiles.push({ path: 'first.md' }, { path: 'chosen.md' });
    act(() => {
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'first.md', source: 'user' });
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'chosen.md', source: 'user' });
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'machine.md', source: 'machine' });
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'record.md', source: 'record' });
    });
    const activate = vi.fn();
    act(() => {
      workspace.connectWorkbench(vi.fn(), activate);
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'live.md', source: 'user' });
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'record.md', source: 'record' });
    });
    expect(activate.mock.calls).toEqual([['chosen.md'], ['live.md']]);
  });

  // A8b (§11): opening a pane no longer discards a held file without a reason; 'utility' and 'files' moved to "should
  // keep a held file when %s opens after it".
  it.each(['close', 'file-closed'] as const)('should discard a held file after %s supersedes it', (action) => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    editorFiles.push({ path: 'chosen.md' });
    const activate = vi.fn();
    act(() => {
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'chosen.md', source: 'user' });
      if (action === 'close') {
        workspace.setWorkbenchOpen(false);
      } else {
        editorFiles.length = 0;
      }
      workspace.connectWorkbench(vi.fn(), activate);
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it.each(['utility', 'files'] as const)('should keep a held file when %s opens after it', (action) => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    editorFiles.push({ path: 'chosen.md' });
    const activate = vi.fn();
    const opener = vi.fn();
    act(() => {
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'chosen.md', source: 'user' });
      workspace.openPanel(action === 'files' ? 'files' : 'parameters');
      workspace.connectWorkbench(opener, activate);
    });
    expect(activate).toHaveBeenCalledExactlyOnceWith('chosen.md');
    expect(opener).toHaveBeenCalledExactlyOnceWith(action === 'files' ? 'files' : 'parameters');
  });

  it.each(['route', 'actor', 'unmount'] as const)(
    'should discard held opens and reject stale callbacks after %s changes',
    (change) => {
      const tree = (
        <ProjectWorkspaceProvider>
          <Probe />
        </ProjectWorkspaceProvider>
      );
      const view = render(tree);
      editorFiles.push({ path: 'old.md' }, { path: 'new.md' });
      const retiredConnect = workspace.connectWorkbench;
      const retiredEvent = listeners.get('fileOpened');
      act(() => {
        retiredEvent?.({ type: 'fileOpened', path: 'old.md', source: 'user' });
      });
      if (change === 'route') {
        route.key = 'next';
      } else if (change === 'actor') {
        // Another editor is another project runtime, with its own bridge and shell port.
        currentEditorRef = { ...editorRef };
        currentRuntime = runtimeFor(currentEditorRef);
      }
      if (change === 'unmount') {
        view.unmount();
      } else {
        view.rerender(
          <ProjectWorkspaceProvider>
            <Probe />
          </ProjectWorkspaceProvider>,
        );
      }
      const retired = vi.fn();
      const current = vi.fn();
      act(() => {
        // The retired runtime's bridge reaches no workspace. After a route change the bridge is the same one, and
        // an open it forwards is a new open under the new route (A8b), so only the held one is checked there.
        if (change !== 'route') {
          retiredEvent?.({ type: 'fileOpened', path: 'old.md', source: 'user' });
        }
        retiredConnect(vi.fn(), retired);
        if (change !== 'unmount') {
          workspace.connectWorkbench(vi.fn(), current);
        }
      });
      expect(retired).not.toHaveBeenCalled();
      expect(current).not.toHaveBeenCalled();
      if (change !== 'unmount') {
        act(() => {
          listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'new.md', source: 'user' });
        });
        expect(current).toHaveBeenCalledExactlyOnceWith('new.md');
      }
    },
  );

  it('should not let retired cleanup disconnect a replacement using the same file callback', () => {
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    const activate = vi.fn();
    act(() => {
      const disconnect = workspace.connectWorkbench(vi.fn(), activate);
      workspace.connectWorkbench(vi.fn(), activate);
      disconnect();
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'chosen.md', source: 'user' });
    });
    expect(activate).toHaveBeenCalledExactlyOnceWith('chosen.md');
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

  it('offers one way back to the pane a file was opened from, until another file opens', () => {
    const opener = vi.fn();
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );
    act(() => {
      workspace.connectWorkbench(opener);
    });
    const preview = '.tau/artifacts/abc/main.gcode.3mf';

    act(() => {
      fileReturn?.openFileFrom(preview, 'print');
    });
    expect(send).toHaveBeenCalledWith({ type: 'openFile', path: preview, source: 'user' });
    // The preview's own open, however late the code editor reports it, keeps the way back.
    act(() => {
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: preview, source: 'user' });
    });
    expect(fileReturn?.returnTo).toEqual({ path: preview, panel: 'print' });

    act(() => {
      fileReturn?.back();
    });
    expect(opener).toHaveBeenCalledWith('print');
    expect(fileReturn?.returnTo).toBeUndefined();

    act(() => {
      fileReturn?.openFileFrom(preview, 'print');
    });
    act(() => {
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'main.ts', source: 'user' });
    });
    expect(fileReturn?.returnTo).toBeUndefined();
  });

  it('should leave file reveal routing to the sender-selected Workbench owner', () => {
    state.isMobile = true;
    render(
      <ProjectWorkspaceProvider>
        <Probe />
      </ProjectWorkspaceProvider>,
    );

    const opener = vi.fn();
    act(() => {
      workspace.connectWorkbench(opener);
      listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'parts/wheel.ts', source: 'user' });
    });
    expect(send).toHaveBeenCalledWith({ type: 'setPanelState', panelState: { mobileActiveTab: 'editor' } });
    opener.mockClear();
    send.mockClear();
    act(() => {
      listeners.get('fileRevealRequested')?.({ type: 'fileRevealRequested', path: 'parts/wheel.ts' });
    });
    expect(listeners.has('fileRevealRequested')).toBe(true);
    expect(opener).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(listeners.has('modelComponentRevealRequested')).toBe(true);
  });

  it.each([
    ['a', 'model'],
    ['m', 'kinematics'],
  ] as const)('should leave Ctrl+%s to focused text and open %s elsewhere', (key, panel) => {
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
    // Preserve Select All and CodeMirror Tab focus mode inside editable text.
    const codeContent = document.createElement('div');
    codeContent.className = 'cm-content';
    codeContent.contentEditable = 'true';
    codeContent.setAttribute('role', 'textbox');
    codeContent.tabIndex = 0;
    const textArea = document.createElement('textarea');
    textArea.setAttribute('role', 'textbox');
    document.body.append(codeContent, textArea);

    for (const input of [codeContent, textArea]) {
      // `fireEvent` returns false once a listener has prevented the default action.
      expect(fireEvent.keyDown(input, { key, ctrlKey: true })).toBe(true);
    }
    expect(opener).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(document.body, { key, ctrlKey: true })).toBe(false);
    expect(opener).toHaveBeenCalledExactlyOnceWith(panel);
    codeContent.remove();
    textArea.remove();
  });

  /*
   * Pane intents through a live project's layout (A8b). Until A8b these rows registered a stub controller whose
   * record took a pane as a change or handed it back; the workspace now sends a pane intent to the runtime's layout,
   * which queues it until the first read and an attached workbench, then delivers it once (I11, D14). Old row → new
   * row:
   * - "records utility intent in the layout owner before the Dockview connects" → "queues pane intents before the
   *   Dockview connects and applies each once".
   * - "asks for a pane as a change on top of the saved arrangement while the layout record is still being read" →
   *   "waits for the first read before applying a pane intent".
   * - "opens a pane directly when the layout record cannot take the change" and "should apply a handed-back pane
   *   intent once when the workbench connects after it" → "should apply a pane intent once when the workbench connects
   *   after it".
   * - "should drop a pane intent when the route key changes %s the record hands it back" → "should drop a pane intent
   *   when the route key changes %s the first read".
   * - "should keep a handed-back pane intent across a workbench close and apply it once on the next connect" →
   *   "should keep a pane intent across a workbench close and apply it once on the next connect".
   * - "should settle a workbench pane intent on the phone by setting mobileActiveTab alone" → same name.
   */
  describe('pane intents through the layout (A0.3, A8b)', () => {
    /** Let the layout's reads and the runtime's bridge settle. */
    const settle = async (): Promise<void> => {
      for (let step = 0; step < 5; step++) {
        // oxlint-disable-next-line no-await-in-loop -- each step lets one more promise hop land.
        await act(async () => undefined);
      }
    };
    const renderLive = () => {
      currentRuntime = runtimeFor(editorRef, { layout: true });
      return render(
        <ProjectWorkspaceProvider>
          <Probe />
        </ProjectWorkspaceProvider>,
      );
    };
    /** The workbench's Dockview attaches: it shows what it is handed at once. */
    const attachWorkbench = (): (() => void) =>
      workspace.layoutController.registerWorkbench((_node, applied) => {
        applied();
      });

    it('queues pane intents before the Dockview connects and applies each once', async () => {
      renderLive();
      act(() => {
        workspace.openPanel('files');
        workspace.openPanel('parameters');
        workspace.openPanel('revisions');
      });
      currentRuntime?.answerRead();
      await settle();
      const opener = vi.fn();
      let disconnect = (): void => undefined;
      act(() => {
        attachWorkbench();
        disconnect = workspace.connectWorkbench(opener);
      });
      expect(opener.mock.calls).toEqual([['files'], ['parameters'], ['revisions']]);
      act(() => {
        disconnect();
        workspace.connectWorkbench(opener);
      });
      expect(opener).toHaveBeenCalledTimes(3);
    });

    it('waits for the first read before applying a pane intent', async () => {
      renderLive();
      const opener = vi.fn();
      act(() => {
        attachWorkbench();
        workspace.connectWorkbench(opener);
      });
      // A Share deep link lands before the record is read: it waits, so the saved arrangement cannot replace it.
      act(() => {
        workspace.openPanel('share');
      });
      await settle();
      expect(opener).not.toHaveBeenCalled();
      currentRuntime?.answerRead();
      await settle();
      expect(opener).toHaveBeenCalledExactlyOnceWith('share');
      act(() => {
        workspace.openPanel('export');
      });
      expect(opener).toHaveBeenLastCalledWith('export');
      expect(opener).toHaveBeenCalledTimes(2);
    });

    // A0.3 row 1a, Y5/I11: an intent asked for before the workbench connects is applied once, when it connects.
    it('should apply a pane intent once when the workbench connects after it', async () => {
      renderLive();
      currentRuntime?.answerRead();
      await settle();
      act(() => {
        workspace.openPanel('share');
      });
      const opener = vi.fn();
      let disconnect = (): void => undefined;
      act(() => {
        attachWorkbench();
        disconnect = workspace.connectWorkbench(opener);
      });
      expect(opener).toHaveBeenCalledExactlyOnceWith('share');
      act(() => {
        disconnect();
        workspace.connectWorkbench(opener);
      });
      expect(opener).toHaveBeenCalledOnce();
    });

    // A0.3 row 1b, Y5/I11 (`routeChanged`): a route key change drops the intents queued before it.
    it.each(['before', 'after'] as const)(
      'should drop a pane intent when the route key changes %s the first read',
      async (order) => {
        const view = renderLive();
        act(() => {
          workspace.openPanel('share');
        });
        if (order === 'after') {
          currentRuntime?.answerRead();
          await settle();
        }
        route.key = 'next-route';
        view.rerender(
          <ProjectWorkspaceProvider>
            <Probe />
          </ProjectWorkspaceProvider>,
        );
        if (order === 'before') {
          currentRuntime?.answerRead();
          await settle();
        }
        const opener = vi.fn();
        act(() => {
          attachWorkbench();
          workspace.connectWorkbench(opener);
        });
        expect(opener).not.toHaveBeenCalled();
      },
    );

    // A8b review: the Dockview attached before the first read, so the read's apply lands inside the layout's own step
    // and releases the intent there, before the layout has heard the route the shell pushed to meanwhile. It opens
    // nothing: the intent was asked for under a route the shell has left.
    it('should drop a pane intent when the route changes before the first read on a workbench attached before it', async () => {
      const view = renderLive();
      const opener = vi.fn();
      act(() => {
        attachWorkbench();
        workspace.connectWorkbench(opener);
      });
      act(() => {
        workspace.openPanel('share');
      });
      route.key = 'next-route';
      view.rerender(
        <ProjectWorkspaceProvider>
          <Probe />
        </ProjectWorkspaceProvider>,
      );
      currentRuntime?.answerRead();
      await settle();
      expect(opener).not.toHaveBeenCalled();
    });

    // A0.3 row 2 (I11, A0.1 row 2): a replace navigation, such as a route intent's own parameter cleanup, keeps the
    // intents queued under the route it corrects.
    it('should keep a pane intent across a replace navigation', async () => {
      const view = renderLive();
      act(() => {
        workspace.openPanel('print', 'route');
      });
      route.key = 'cleaned-parameters';
      route.navigationType = 'REPLACE';
      view.rerender(
        <ProjectWorkspaceProvider>
          <Probe />
        </ProjectWorkspaceProvider>,
      );
      currentRuntime?.answerRead();
      await settle();
      const opener = vi.fn();
      act(() => {
        attachWorkbench();
        workspace.connectWorkbench(opener);
      });
      expect(opener).toHaveBeenCalledExactlyOnceWith('print');
    });

    // A0.3 row 1c, Y5/I11: a pane intent survives a workbench close (rule 7 drops only file intents) and is applied
    // exactly once when a workbench next connects.
    it('should keep a pane intent across a workbench close and apply it once on the next connect', async () => {
      renderLive();
      currentRuntime?.answerRead();
      await settle();
      act(() => {
        workspace.openPanel('share');
      });
      act(() => {
        workspace.setWorkbenchOpen(false);
        setEditorLanes({ workbenchOpen: false });
      });
      act(() => {
        setEditorLanes({ workbenchOpen: true });
      });
      const opener = vi.fn();
      let disconnect = (): void => undefined;
      act(() => {
        attachWorkbench();
        disconnect = workspace.connectWorkbench(opener);
      });
      expect(opener).toHaveBeenCalledExactlyOnceWith('share');
      act(() => {
        disconnect();
        workspace.connectWorkbench(opener);
      });
      expect(opener).toHaveBeenCalledOnce();
    });

    // A8b review: the Dockview stays attached while the desktop workbench lane is hidden. A file the person opens then
    // asks the editor to open the lane, which it has not shown yet when the layout delivers the intent in the same step;
    // the lane is being opened, not closed, so the file is shown.
    it('should show a file the person opens while the desktop workbench lane is closed', async () => {
      renderLive();
      currentRuntime?.answerRead();
      await settle();
      act(() => {
        setEditorLanes({ workbenchOpen: false });
      });
      const opener = vi.fn();
      const activate = vi.fn();
      act(() => {
        attachWorkbench();
        workspace.connectWorkbench(opener, activate);
      });
      editorFiles.push({ path: 'chosen.md' });
      act(() => {
        listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'chosen.md', source: 'user' });
      });
      expect(activate).toHaveBeenCalledExactlyOnceWith('chosen.md');
      expect(opener).not.toHaveBeenCalled();
      expect(Object.values(currentRuntime!.layout!.actor.getSnapshot().context.outcomes)).toEqual([
        { outcome: 'applied' },
      ]);
    });

    // §11 (A8b): opening a pane keeps a file the person opened before it; both are applied when the workbench connects.
    it('should keep a file intent when a pane is opened after it', async () => {
      renderLive();
      currentRuntime?.answerRead();
      await settle();
      editorFiles.push({ path: 'chosen.md' });
      act(() => {
        listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'chosen.md', source: 'user' });
        workspace.openPanel('parameters');
      });
      const opener = vi.fn();
      const activate = vi.fn();
      act(() => {
        attachWorkbench();
        workspace.connectWorkbench(opener, activate);
      });
      expect(activate).toHaveBeenCalledExactlyOnceWith('chosen.md');
      expect(opener).toHaveBeenCalledExactlyOnceWith('parameters');
    });

    // §11 (A8b): a workbench close drops the file intents queued before it (rule 7).
    it('should drop a file intent when the workbench closes before it connects', async () => {
      renderLive();
      currentRuntime?.answerRead();
      await settle();
      editorFiles.push({ path: 'chosen.md' });
      act(() => {
        listeners.get('fileOpened')?.({ type: 'fileOpened', path: 'chosen.md', source: 'user' });
      });
      act(() => {
        workspace.setWorkbenchOpen(false);
        setEditorLanes({ workbenchOpen: false });
      });
      act(() => {
        setEditorLanes({ workbenchOpen: true });
      });
      const activate = vi.fn();
      act(() => {
        attachWorkbench();
        workspace.connectWorkbench(vi.fn(), activate);
      });
      expect(activate).not.toHaveBeenCalled();
    });

    // A0.3 row 6, Y4/Y5 (`target-phone`): on the phone shell a workbench pane intent settles by setting the active
    // tab; it never waits for a workbench adapter or the layout record.
    it('should settle a workbench pane intent on the phone by setting mobileActiveTab alone', async () => {
      state.isMobile = true;
      renderLive();
      act(() => {
        workspace.openPanel('share');
      });
      await settle();
      expect(send).toHaveBeenCalledExactlyOnceWith({
        type: 'setPanelState',
        panelState: { mobileActiveTab: 'share' },
      });
      const opener = vi.fn();
      act(() => {
        workspace.connectWorkbench(opener);
      });
      expect(opener).not.toHaveBeenCalled();
    });

    // §11 (A8b, spec-la round 4): a phone has no workbench lane, so closing its last pane leaves the desktop lane, and
    // the layout's workbench, as they are.
    it('should leave the workbench lane as it is when the last phone pane closes', async () => {
      state.isMobile = true;
      renderLive();
      currentRuntime?.answerRead();
      await settle();
      send.mockClear();
      act(() => {
        workspace.setWorkbenchOpen(false);
      });
      expect(send).not.toHaveBeenCalled();
    });
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
