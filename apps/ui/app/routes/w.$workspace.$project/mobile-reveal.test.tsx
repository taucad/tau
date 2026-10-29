// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartialDeep } from 'type-fest';
import type * as ReactRouter from 'react-router';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { WorkbenchPanesHostProvider, useWorkbenchPanesHost } from '@taucad/workbench-panes/host/workbench-host';
import type { WorkbenchPanesHost } from '@taucad/workbench-panes/host/workbench-host';
import type { ModelComponentActionTarget } from '@taucad/workbench-panes/component-menu/component-actions';
import { defaultPanelState } from '#constants/editor.constants.js';
import type { PanelState } from '#types/editor.types.js';
import { mergePanelState } from '#utils/panel-state.utils.js';

/*
 * A part-menu reveal opens a pane that is a cold lazy chunk on a phone. The editor emits the reveal once, before that
 * chunk loads and its pane subscribes, so the pane must still get it: the part is expanded and scrolled to on first
 * use. Real shell, real lazy Model and Kinematics bodies and real workspace; only the pane internals are stand-ins.
 */

type RevealEvent = {
  readonly type: string;
  readonly entryPath: string;
  readonly unitId: string;
  readonly componentId: string;
  readonly path: string;
  readonly expandTarget?: boolean;
};
type Snapshot = {
  readonly context: { readonly panelState: PanelState; readonly openFiles: readonly string[] };
  readonly matches: (state: string) => boolean;
};

const chunks = vi.hoisted(() => {
  const gate = (): { promise: Promise<void>; open: () => void } => {
    let open = (): void => undefined;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  };
  return { gate, model: gate(), kinematics: gate(), files: gate() };
});
const editor = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  handlers: new Map<string, Set<(event: unknown) => void>>(),
  emitted: [] as string[],
  snapshot: undefined as unknown as Snapshot,
}));

const emitByCommand: Record<string, string> = {
  revealFileInTree: 'fileRevealRequested',
  revealModelComponentInExplorer: 'modelComponentRevealRequested',
  revealModelComponentInKinematics: 'kinematicsRevealRequested',
};
const editorRef = {
  send(event: { readonly type: string; readonly panelState?: PartialDeep<PanelState> } & Partial<RevealEvent>): void {
    const emitted = emitByCommand[event.type];
    if (emitted) {
      editor.emitted.push(emitted);
      for (const handler of editor.handlers.get(emitted) ?? []) {
        handler({ ...event, type: emitted });
      }
      return;
    }
    if (event.type !== 'setPanelState') {
      return;
    }
    editor.snapshot = {
      ...editor.snapshot,
      context: {
        ...editor.snapshot.context,
        panelState: mergePanelState(editor.snapshot.context.panelState, event.panelState),
      },
    };
    for (const listener of editor.listeners) {
      listener();
    }
  },
  getSnapshot: (): Snapshot => editor.snapshot,
  subscribe(observer: (() => void) | { readonly next: () => void }): { unsubscribe: () => void } {
    const listener =
      typeof observer === 'function'
        ? observer
        : () => {
            observer.next();
          };
    editor.listeners.add(listener);
    return {
      unsubscribe() {
        editor.listeners.delete(listener);
      },
    };
  },
  on(type: string, handler: (event: unknown) => void): { unsubscribe: () => void } {
    const handlers = editor.handlers.get(type) ?? new Set();
    handlers.add(handler);
    editor.handlers.set(type, handlers);
    return {
      unsubscribe() {
        handlers.delete(handler);
      },
    };
  },
};

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef, mainEntryPath: 'main.ts', projectId: 'project-1', viewRecords: new Map() }),
}));
vi.mock('#hooks/use-project-availability.js', () => ({ useProjectAvailability: () => 'ready' }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useLocation: () => ({ key: 'initial', search: '', state: undefined }),
}));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => true }));
vi.mock('#hooks/use-sidebar-status.js', () => ({
  useProjectSidebarRow: () => ({ attention: 0, conflicted: false, settings: 0, failed: 0 }),
}));

// The lazy bodies are the real modules, loading only once a test lets them: a cold chunk on a slow phone.
vi.mock('#routes/w.$workspace.$project/chat-explorer.js', async (importOriginal) => {
  await chunks.model.promise;
  return importOriginal();
});
vi.mock('#routes/w.$workspace.$project/chat-kinematics.js', async (importOriginal) => {
  await chunks.kinematics.promise;
  return importOriginal();
});
vi.mock('#routes/w.$workspace.$project/chat-file-tree.js', async (importOriginal) => {
  await chunks.files.promise;
  return importOriginal();
});
vi.mock('#routes/w.$workspace.$project/chat-editor-file-tree.js', async () => {
  const { subscribeWorkbenchFileReveal } = await import('#routes/w.$workspace.$project/workbench-reveal.js');
  const { useProject } = await import('#hooks/use-project.js');
  return {
    ChatEditorFileTree(): React.JSX.Element {
      const { editorRef: projectEditor } = useProject();
      const [heard, setHeard] = useState('nothing');
      useEffect(
        () =>
          subscribeWorkbenchFileReveal(projectEditor, (target) => {
            setHeard(target.path);
          }),
        [projectEditor],
      );
      return <p>{`Files revealed ${heard}`}</p>;
    },
  };
});
// The panes subscribe on mount, as the real ones do, and show the last reveal they heard.
vi.mock('@taucad/workbench-panes/model/model-pane', () => ({
  ModelPane(): React.JSX.Element {
    const reveal = useWorkbenchPanesHost().model?.reveal;
    const [heard, setHeard] = useState('nothing');
    useEffect(
      () =>
        reveal?.subscribe((target) => {
          setHeard(`${target.entryPath} ${target.unitId} ${target.componentId}`);
        }),
      [reveal],
    );
    return <p>{`Model tree revealed ${heard}`}</p>;
  },
}));
vi.mock('@taucad/workbench-panes/kinematics/kinematics-pane', () => ({
  KinematicsPane(): React.JSX.Element {
    const subscribeReveal = useWorkbenchPanesHost().kinematics?.subscribeReveal;
    const [heard, setHeard] = useState('nothing');
    useEffect(
      () =>
        subscribeReveal?.((request) => {
          setHeard(`${request.entryPath} ${request.componentId}`);
        }),
      [subscribeReveal],
    );
    return <p>{`Kinematics revealed ${heard}`}</p>;
  },
}));
vi.mock('#routes/w.$workspace.$project/workbench-panes-host.js', () => ({
  ProjectWorkbenchPanesHost: ({
    sources,
    children,
  }: {
    readonly sources: Partial<WorkbenchPanesHost>;
    readonly children: React.ReactNode;
  }): React.JSX.Element => (
    <WorkbenchPanesHostProvider value={{ ...sources, useUnits: () => [] } as unknown as WorkbenchPanesHost}>
      {children}
    </WorkbenchPanesHostProvider>
  ),
}));

// The stage: the viewer's part menu with the app's real part verbs.
vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', async () => {
  const { useProjectWorkspace } = await import('#routes/w.$workspace.$project/project-workspace-context.js');
  const { useModelComponentProjectActions } = await import('#components/geometry/cad/model-component-actions.js');
  const target = {
    manifest: { sourceFile: 'main.ts' },
    graphicsRef: { send: () => undefined },
    unitId: 'unit-1',
  } as unknown as ModelComponentActionTarget;
  return {
    ViewerDockview(): React.JSX.Element {
      const actions = useModelComponentProjectActions();
      const workspace = useProjectWorkspace();
      return (
        <>
          <button
            type='button'
            onClick={() => {
              actions.revealComponent(target, 'wheel');
            }}
          >
            Reveal wheel
          </button>
          <button
            type='button'
            onClick={() => {
              workspace.openPanel('files');
              editorRef.send({ type: 'revealFileInTree', path: 'parts/nested/wheel.ts' });
            }}
          >
            Reveal file
          </button>
          <button
            type='button'
            onClick={() => {
              actions.showKinematics(target, 'axle');
            }}
          >
            Show axle kinematics
          </button>
        </>
      );
    },
  };
});
vi.mock('#routes/w.$workspace.$project/focused-chat-gate.js', () => ({
  ChatHistoryGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  ChatInterfaceSessionGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#routes/w.$workspace.$project/chat-history.js', () => ({ ChatHistory: () => null }));
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', () => ({
  ProjectUnavailableOverlay: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-manifest-issue-banner.js', () => ({
  ProjectManifestIssueBanner: () => null,
}));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({ WorkspaceSkeleton: () => null }));
/* The project top bar (W2) has its own suite; this shell suite only needs its slot. */
vi.mock('#routes/w.$workspace.$project/mobile-project-top-bar.js', () => ({ MobileProjectTopBar: () => null }));

// Prepare the real modules before interaction: Vitest's source transformation is not chunk delivery time.
// The lazy mocks still withhold these modules until the test opens their gates after the reveal.
await Promise.all([
  vi.importActual('#routes/w.$workspace.$project/chat-explorer.js'),
  vi.importActual('#routes/w.$workspace.$project/chat-kinematics.js'),
  vi.importActual('#routes/w.$workspace.$project/chat-file-tree.js'),
]);

const { ProjectWorkspaceProvider } = await import('#routes/w.$workspace.$project/project-workspace-context.js');
const { ChatInterfaceMobile } = await import('#routes/w.$workspace.$project/chat-interface-mobile.js');

const renderShell = (): void => {
  render(
    <KeyboardProvider>
      <TooltipProvider>
        <ProjectWorkspaceProvider>
          <ChatInterfaceMobile />
        </ProjectWorkspaceProvider>
      </TooltipProvider>
    </KeyboardProvider>,
  );
};

beforeEach(() => {
  editor.listeners.clear();
  editor.emitted.length = 0;
  editor.snapshot = {
    context: {
      panelState: structuredClone(defaultPanelState) as unknown as PanelState,
      openFiles: [],
    },
    matches: (state) => state === 'ready',
  };
});

describe('phone part-menu reveal into a lazy pane', { timeout: 30_000 }, () => {
  it('should reveal the part in the model tree although its chunk loads after the reveal', async () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Reveal wheel' }));
    // The editor has emitted, and no Model pane exists to hear it yet.
    await waitFor(() => {
      expect(editor.emitted).toEqual(['modelComponentRevealRequested']);
    });
    expect(editor.snapshot.context.panelState.mobileActiveTab).toBe('model-tree');
    expect(screen.queryByText(/^Model tree revealed/u)).not.toBeInTheDocument();

    chunks.model.open();

    expect(
      await screen.findByText('Model tree revealed main.ts unit-1 wheel', undefined, { timeout: 15_000 }),
    ).toBeVisible();
  });

  it('should show the part in kinematics although its chunk loads after the request', async () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Show axle kinematics' }));
    await waitFor(() => {
      expect(editor.emitted).toEqual(['kinematicsRevealRequested']);
    });
    expect(editor.snapshot.context.panelState.mobileActiveTab).toBe('kinematics');
    expect(screen.queryByText(/^Kinematics revealed/u)).not.toBeInTheDocument();

    chunks.kinematics.open();

    expect(await screen.findByText('Kinematics revealed main.ts axle', undefined, { timeout: 15_000 })).toBeVisible();
  });

  it('should deliver a file reveal after the cold Files chunk mounts', async () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal file' }));
    await waitFor(() => {
      expect(editor.emitted).toEqual(['fileRevealRequested']);
    });
    expect(editor.snapshot.context.panelState.mobileActiveTab).toBe('files');
    expect(screen.queryByText(/^Files revealed/u)).not.toBeInTheDocument();
    chunks.files.open();
    expect(
      await screen.findByText('Files revealed parts/nested/wheel.ts', undefined, { timeout: 15_000 }),
    ).toBeVisible();
  });
});
