import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { projectToManifest } from '@taucad/types';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';
import { SessionsProvider } from '#hooks/use-sessions.js';
import { sessionsActor } from '#services/sessions-store.js';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import type { ActorRefFrom } from 'xstate';
import type { projectMachine } from '#machines/project.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';

const projectA = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const projectB = 'proj_bbbbbbbbbbbbbbbbbbbbb';
const projectC = 'proj_ccccccccccccccccccccc';

let currentProjectId = projectA;
const getProjectRouteAccess = vi.fn<(projectId: string) => Promise<ProjectRouteAccess>>();
const restoreProject = vi.fn<(projectId: string) => Promise<void>>();
const projectManager = {
  getProjectRouteAccess,
  restoreProject,
  /* W2: bumping this is how a trash or restore reaches an already-resolved route. */
  libraryRevision: 0,
};
const mounts: string[] = [];
const unmounts: string[] = [];
const fileManagerInputs: Array<{ projectId: string; rootDirectory: string }> = [];
const projectProviderInputs: string[] = [];
const projectProviderChatInputs: Array<{
  requestedChatId: string | undefined;
  createdChatId: string | undefined;
}> = [];
const editorSend = vi.fn();
const projectSend = vi.fn();
const connectRemote = vi.fn(async () => undefined);
/* `quiesce` is W13's close cut: `closing.flushing` calls it on this client. */
const revisionClient = { subscribeEvents: () => () => undefined, quiesce: async () => undefined };
let editorIsIdle = true;
type EditorSnapshot = Readonly<{
  status: 'active';
  matches: () => boolean;
  /* The producers flush reads `context.error` to tell "idle" from "idle, having
   * failed to store"; a double without it throws inside `closing.flushing`. */
  context: { error?: Error };
}>;
const editorSnapshot = (): EditorSnapshot => ({
  status: 'active',
  matches: () => editorIsIdle,
  context: {},
});
const editorObservers = new Set<{
  next?: (snapshot: ReturnType<typeof editorSnapshot>) => void;
  error?: (error: unknown) => void;
}>();
const editorRef = {
  send: editorSend,
  getSnapshot: editorSnapshot,
  subscribe: (observer: {
    next?: (snapshot: ReturnType<typeof editorSnapshot>) => void;
    error?: (error: unknown) => void;
  }) => {
    editorObservers.add(observer);
    return { unsubscribe: () => editorObservers.delete(observer) };
  },
};
const setEditorIdle = (isIdle: boolean): void => {
  editorIsIdle = isIdle;
  const snapshot = editorSnapshot();
  for (const observer of editorObservers) {
    observer.next?.(snapshot);
  }
};
const failEditorFlush = (error: Error): void => {
  for (const observer of editorObservers) {
    observer.error?.(error);
  }
};
const projectRef = {
  send: projectSend,
  /* `matches` is not decoration: the session's `closing.flushingProducers`
   * awaits `waitFor(projectRef, (state) => state.matches(...))`, so a snapshot
   * without it threw, the session settled in `failed` instead of `closed`, and
   * the registry never dropped its ref. */
  getSnapshot: () => ({ context: { project: undefined }, matches: () => true }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
const parameterService = {
  close: vi.fn(async () => undefined),
  subscribeUnsavedDrafts: () => () => undefined,
};

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => projectManager,
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useSharedFileManagerWorker: () => undefined,
  SharedWorkerGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  HomeFileManagerProvider: ({
    children,
    projectId,
    rootDirectory,
  }: React.PropsWithChildren<{ projectId: string; rootDirectory: string }>) => {
    fileManagerInputs.push({ projectId, rootDirectory });
    useEffect(() => {
      mounts.push(projectId);
      return () => {
        unmounts.push(projectId);
      };
    }, [projectId]);
    return (
      <div data-testid='project-session' data-project-id={projectId}>
        {children}
      </div>
    );
  },
  useFileManager: () => ({
    fileManagerRef: {
      getSnapshot: () => ({ context: {}, matches: () => false }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
  }),
  useOptionalFileManager: () => undefined,
}));

vi.mock('#hooks/use-project.js', () => ({
  ProjectProvider: ({
    children,
    projectId,
    requestedChatId,
    createdChatId,
  }: React.PropsWithChildren<{
    projectId: string;
    requestedChatId?: string;
    createdChatId?: string;
  }>) => {
    projectProviderInputs.push(projectId);
    projectProviderChatInputs.push({ requestedChatId, createdChatId });
    return <div>{children}</div>;
  },
  useProject: () => ({ projectRef, editorRef, parameterService }),
}));
vi.mock('#hooks/use-flush-on-close.js', () => ({
  useFlushOnClose: () => undefined,
}));
vi.mock('#hooks/use-flush-on-close.js', () => ({ useFlushOnClose: () => undefined }));
/* The registry's agent-host region is a real browser probe. Unmocked it rejects
 * in jsdom, so `closing.releasingAgentHost` threw, every session settled in
 * `failed` instead of `closed`, and the registry never dropped its ref — one
 * case's project stayed live for the next one. */
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));
/* The session binding is headless and has its own suites; this route suite is
 * about which subtrees are mounted, so its two app-level handles are stubs. */
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () => undefined,
  useRevisionClientLifecycle: () => revisionClient,
  useRevisionClientStatus: () => undefined,
  useRevisionStatus: () => undefined,
  useRevisionCommands: () => ({ connectRemote }),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({
    get: () => undefined,
    setProjectSession: () => undefined,
    setFocusedProject: () => undefined,
  }),
}));
/* The `Mod+S` registration needs the application root's `KeyboardProvider`,
 * which this route-level suite does not mount; the shortcut has its own test. */
vi.mock('#routes/w.$workspace.$project/revision-save-shortcut.js', () => ({
  RevisionSaveShortcut: () => <span data-testid='focused-project' />,
}));
vi.mock('#hooks/use-monaco-model-service.js', () => ({
  MonacoModelServiceProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#hooks/use-webgl-context-tracker.js', () => ({
  WebglContextTrackerProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  RevisionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/revision-restore.js', () => ({ RevisionRestore: () => null }));
vi.mock('#routes/w.$workspace.$project/workbench-checkout-root.js', () => ({ WorkbenchCheckoutRoot: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-outcomes.js', () => ({ RevisionOutcomes: () => null }));
vi.mock('#routes/w.$workspace.$project/project-chat-run-settlement.js', () => ({
  ProjectChatRunSettlement: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-command-items.js', () => ({
  ProjectCommandPaletteItems: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({
  ProjectExportAction: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({
  ProjectShareRouteIntent: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  ProjectWorkspaceProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/chat-interface.js', () => ({
  ChatInterface: () => null,
}));
/* W10's conflict chat reads `useChats`, which needs the root `QueryClient`
 * this route-level suite does not mount; it has its own tests. */
vi.mock('#routes/w.$workspace.$project/revision-conflict-chat.js', () => ({ RevisionConflictChat: () => null }));
/* Same reason, and the reason this suite was already red on `geospec` before
 * the notice work: the authority provider reads `useChats` too, so every
 * focused-session test threw "No QueryClient set" at module render. */
vi.mock('#hooks/use-focused-chat-read-state.js', () => ({ useFocusedChatReadState: () => undefined }));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  ChatWorkspaceAuthorityProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
/*
 * The notice presentation is W3's own suite. Here it stands in for every
 * non-editor state so these tests stay about what the *gate* derives and
 * whether the app shell survived it.
 */
vi.mock('#routes/w.$workspace.$project/project-route-notices.js', async () => {
  const { createContext, useContext } = await import('react');
  const ProjectRouteRetryContext = createContext<() => void>(() => undefined);
  return {
    ProjectRouteRetryContext,
    ProjectRouteNotice: ({ state }: { readonly state: { kind: string; error?: Error } }) => {
      const retry = useContext(ProjectRouteRetryContext);
      return (
        <div>
          <p>Notice: {state.kind}</p>
          {state.error ? <p>{state.error.message}</p> : undefined}
          <button type='button' onClick={retry}>
            Retry project
          </button>
        </div>
      );
    },
  };
});

const routeModule = await import('./project-route.js');

const project = (id: string) =>
  projectToManifest({
    id,
    name: id,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });

const ready = (id: string): ProjectRouteAccess => ({
  status: 'ready',
  project: project(id),
});

const trashed = (id: string): ProjectRouteAccess => ({
  status: 'trashed',
  project: project(id),
});

const deferred = <T,>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} => {
  let resolveDeferred!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolveDeferred = resolve;
  });
  return { promise, resolve: resolveDeferred };
};

/**
 * Both route shapes render `<ProjectRouteProviders>`: `/w/{workspace}/{project}`
 * after slug resolution and the legacy id resolver after its redirect. The gate
 * is therefore exercised through the shared component, parameterised by id.
 */
const renderRouteProvider = ({
  requestedChatId,
  createdChatId,
  shouldOpenFromTauCloud,
}: {
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
  readonly shouldOpenFromTauCloud?: boolean;
} = {}): {
  Provider: React.JSXElementConstructor<React.PropsWithChildren>;
  view: ReturnType<typeof render>;
} => {
  /* The route renders one subtree per LIVE project (R1), so the registry that
   * decides the live set has to be here — exactly as `root.tsx` mounts it. */
  /*
   * `children` stands in for the app shell, which renders the route component
   * through its `<Outlet/>`. The notice lives there (W2/W3), so a gate-only
   * tree would never show one — include it exactly where the shell does.
   */
  const Provider = ({ children }: React.PropsWithChildren): React.JSX.Element => (
    <SessionsProvider>
      <routeModule.ProjectRouteProviders
        projectId={currentProjectId}
        requestedChatId={requestedChatId}
        createdChatId={createdChatId}
        shouldOpenFromTauCloud={shouldOpenFromTauCloud}
      >
        {children}
        <routeModule.ProjectChatRoute />
      </routeModule.ProjectRouteProviders>
    </SessionsProvider>
  );
  return {
    Provider,
    view: render(
      <Provider>
        <div>content</div>
      </Provider>,
    ),
  };
};

beforeEach(() => {
  currentProjectId = projectA;
  getProjectRouteAccess.mockReset();
  restoreProject.mockReset();
  projectManager.libraryRevision = 0;
  mounts.length = 0;
  unmounts.length = 0;
  fileManagerInputs.length = 0;
  projectProviderInputs.length = 0;
  projectProviderChatInputs.length = 0;
  editorSend.mockReset();
  projectSend.mockReset();
  connectRemote.mockClear();
  editorObservers.clear();
  editorIsIdle = true;
});

/**
 * Which project the person is looking at.
 *
 * Every live project renders a subtree now (I22, R1), so "the session" is no
 * longer "the only one mounted": the focused one is the subtree that holds the
 * route's children.
 */
const focusedSessionId = (): string | undefined =>
  screen.queryByTestId('focused-project')?.closest<HTMLElement>('[data-project-id]')?.dataset['projectId'];

/** Every mounted project subtree, in render order. */
const sessionIds = (): readonly string[] =>
  screen.queryAllByTestId('project-session').map((element) => element.dataset['projectId'] ?? '');

afterEach(async () => {
  /* A case that left the editor mid-flush would hold `flushProducers` open
   * until its timeout; the drain is about liveness, not about that case. */
  editorIsIdle = true;
  /*
   * The registry is one app singleton (S44); a project left live by one case is
   * live for the next one. Closing is a round trip: `close` moves the session
   * to `closing`, `confirmClose` lets it past `asking`, and only when its flush
   * and release settle does the registry drop the ref. A close that *throws*
   * lands in `failed` instead and is never dropped, which is why the doubles
   * above have to answer `matches` and `quiesce`.
   */
  await act(async () => {
    const live = Object.keys(sessionsActor.getSnapshot().context.refs);
    for (const projectId of live) {
      sessionsActor.send({ type: 'close', projectId, reason: 'user' });
    }
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
    for (const ref of Object.values(sessionsActor.getSnapshot().context.refs)) {
      ref.send({ type: 'confirmClose' });
    }
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  });
  /* The drain is the guard, so prove it drained rather than hoping. */
  expect(Object.keys(sessionsActor.getSnapshot().context.refs)).toEqual([]);
});

describe('project route session identity', () => {
  it('should settle parameters and both UI stores, and leave the cut to flushSync', async () => {
    const order: string[] = [];
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    const projectSnapshot = mock<ReturnType<ActorRefFrom<typeof projectMachine>['getSnapshot']>>();
    const editorSnapshotValue = mock<ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>>();
    projectSnapshot.matches.mockReturnValue(true);
    editorSnapshotValue.matches.mockReturnValue(true);
    project.getSnapshot.mockReturnValue(projectSnapshot);
    editor.getSnapshot.mockReturnValue(editorSnapshotValue);
    parameters.close.mockImplementation(async () => {
      order.push('parameters');
    });
    project.send.mockImplementation(() => {
      order.push('project');
    });
    editor.send.mockImplementation(() => {
      order.push('editor');
    });

    await routeModule.flushProjectSessionPersistence({
      parameterService: parameters,
      projectRef: project,
      editorRef: editor,
      closeFlushMilliseconds: 100,
    });

    expect(order).toEqual(['parameters', 'project', 'editor']);
  });

  it('should refuse the producers flush when parameter settlement fails', async () => {
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    parameters.close.mockRejectedValue(new Error('checked parameter flush failed'));

    await expect(
      routeModule.flushProjectSessionPersistence({
        parameterService: parameters,
        projectRef: project,
        editorRef: editor,
        closeFlushMilliseconds: 100,
      }),
    ).rejects.toThrow('checked parameter flush failed');
    expect(project.send).not.toHaveBeenCalled();
    expect(editor.send).not.toHaveBeenCalled();
  });

  it('should refuse the producers flush when project storage reports idle with an error', async () => {
    const parameters = mock<ParameterSetService>();
    const project = mock<ActorRefFrom<typeof projectMachine>>();
    const editor = mock<ActorRefFrom<typeof editorMachine>>();
    const projectFailure = new Error('project save failed');
    const projectSnapshot = {
      matches: () => true,
      context: { error: projectFailure },
    } as unknown as ReturnType<ActorRefFrom<typeof projectMachine>['getSnapshot']>;
    const editorSnapshotValue = {
      matches: () => true,
      context: { error: undefined },
    } as unknown as ReturnType<ActorRefFrom<typeof editorMachine>['getSnapshot']>;
    project.getSnapshot.mockReturnValue(projectSnapshot);
    editor.getSnapshot.mockReturnValue(editorSnapshotValue);

    await expect(
      routeModule.flushProjectSessionPersistence({
        parameterService: parameters,
        projectRef: project,
        editorRef: editor,
        closeFlushMilliseconds: 100,
      }),
    ).rejects.toThrow('project save failed');
  });

  it('connects a Tau Cloud library open through the project-scoped client', async () => {
    getProjectRouteAccess.mockResolvedValue(ready(projectA));
    renderRouteProvider({ shouldOpenFromTauCloud: true });

    await waitFor(() => {
      expect(connectRemote).toHaveBeenCalledWith('tau');
    });
  });

  it('forwards a trusted created chat to the active project session', async () => {
    getProjectRouteAccess.mockResolvedValue(ready(projectA));
    renderRouteProvider({
      requestedChatId: 'chat-created',
      createdChatId: 'chat-created',
    });

    await screen.findAllByTestId('project-session');
    expect(projectProviderChatInputs.at(-1)).toEqual({
      requestedChatId: 'chat-created',
      createdChatId: 'chat-created',
    });
  });

  it('should render only the route status while initial access is unresolved', async () => {
    const pendingA = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockReturnValue(pendingA.promise);
    renderRouteProvider();

    /* W2: the initial wait is the `resolving` notice now, and its loader with
     * the `Opening project` label is asserted in the notice's own suite. The
     * overlay below still owns the *navigation* wait, which is a different
     * state: a project is already on screen behind it. */
    expect(screen.getByText('Notice: resolving')).toBeInTheDocument();
    expect(screen.queryByTestId('project-session')).not.toBeInTheDocument();

    await act(async () => {
      pendingA.resolve(ready(projectA));
      await pendingA.promise;
    });
    await screen.findAllByTestId('project-session');
    expect(focusedSessionId()).toBe(projectA);
  });

  it('should leave the initial loader for a retryable access error', async () => {
    getProjectRouteAccess.mockRejectedValueOnce(new Error('discovery failed')).mockResolvedValueOnce(ready(projectA));
    renderRouteProvider();

    expect(await screen.findByText('Notice: access-error')).toBeInTheDocument();
    expect(screen.getByText(/could not check this project/)).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Opening project' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry project' }));
    await screen.findAllByTestId('project-session');
    expect(focusedSessionId()).toBe(projectA);
    expect(getProjectRouteAccess).toHaveBeenCalledTimes(2);
  });

  it('should retain project A inertly until project B access commits', async () => {
    const pendingA = deferred<ProjectRouteAccess>();
    const pendingB = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectA ? pendingA.promise : pendingB.promise));
    const { Provider, view } = renderRouteProvider();

    await act(async () => {
      pendingA.resolve(ready(projectA));
      await pendingA.promise;
    });
    expect(focusedSessionId()).toBe(projectA);

    currentProjectId = projectB;
    view.rerender(
      <Provider>
        <div>content</div>
      </Provider>,
    );

    const retainedSession = screen.getAllByTestId('project-session')[0]!;
    const pendingOutcome = retainedSession.closest('[aria-busy="true"]');
    expect(focusedSessionId()).toBe(projectA);
    expect(pendingOutcome).toHaveAttribute('inert');
    expect(screen.getByRole('status', { name: 'Opening project' })).toBeInTheDocument();
    expect(unmounts).not.toContain(projectA);
    expect(fileManagerInputs.every((input) => input.projectId === projectA)).toBe(true);
    expect(fileManagerInputs.every((input) => input.rootDirectory === `/projects/${projectA}`)).toBe(true);
    expect(projectProviderInputs.every((id) => id === projectA)).toBe(true);

    await act(async () => {
      pendingB.resolve(ready(projectB));
      await pendingB.promise;
    });
    expect(focusedSessionId()).toBe(projectB);
    /* I22: arriving at B opens B and closes nothing. A keeps its file manager,
     * kernel and watchers, which is what makes going back instant. */
    expect(unmounts.filter((id) => id === projectA)).toHaveLength(0);
    expect(mounts.filter((id) => id === projectB)).toHaveLength(1);
    expect(sessionIds()).toEqual([projectA, projectB]);
  });

  it('should flush and await pending EditorState before replacing the current project session', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');
    setEditorIdle(false);

    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);

    await waitFor(() => {
      expect(editorSend).toHaveBeenCalledWith({ type: 'flushNow' });
    });
    expect(focusedSessionId()).toBe(projectA);
    expect(unmounts).not.toContain(projectA);

    act(() => {
      setEditorIdle(true);
    });
    await waitFor(() => {
      expect(focusedSessionId()).toBe(projectB);
    });
  });

  it('should share one pending flush across rapid navigation and commit only the latest project', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');
    setEditorIdle(false);

    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    await waitFor(() => {
      expect(editorSend).toHaveBeenCalledTimes(1);
    });
    currentProjectId = projectC;
    view.rerender(<Provider>content</Provider>);
    await act(async () => {
      await Promise.resolve();
    });
    expect(editorSend).toHaveBeenCalledTimes(1);

    act(() => {
      setEditorIdle(true);
    });
    await waitFor(() => {
      expect(focusedSessionId()).toBe(projectC);
    });
    expect(mounts).not.toContain(projectB);
  });

  it('should keep the current session mounted when its editor flush fails', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');
    setEditorIdle(false);

    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    await waitFor(() => {
      expect(editorSend).toHaveBeenCalledWith({ type: 'flushNow' });
    });
    act(() => {
      failEditorFlush(new Error('storage failed'));
    });

    expect(await screen.findByText('Notice: flush-error')).toBeInTheDocument();
    expect(screen.getByText(/could not save the current project view/)).toBeInTheDocument();
    expect(focusedSessionId()).toBe(projectA);
    expect(unmounts).not.toContain(projectA);
  });

  it('should commit only project C during rapid A to B to C navigation', async () => {
    const pendingB = deferred<ProjectRouteAccess>();
    const pendingC = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => {
      if (id === projectA) {
        return ready(projectA);
      }
      return id === projectB ? pendingB.promise : pendingC.promise;
    });
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');

    await act(async () => {
      currentProjectId = projectB;
      view.rerender(<Provider>content</Provider>);
    });
    await act(async () => {
      currentProjectId = projectC;
      view.rerender(<Provider>content</Provider>);
    });

    expect(focusedSessionId()).toBe(projectA);

    await act(async () => {
      pendingC.resolve(ready(projectC));
      await pendingC.promise;
    });
    expect(focusedSessionId()).toBe(projectC);
    await act(async () => {
      pendingB.resolve(ready(projectB));
      await pendingB.promise;
    });

    expect(focusedSessionId()).toBe(projectC);
    expect(mounts).not.toContain(projectB);
  });

  it.each([
    ['missing', 'Notice: missing'],
    ['conflict', 'Notice: conflict'],
    ['unavailable', 'Notice: unavailable'],
  ] as const)('should render %s access without mounting project B resources', async (status, message) => {
    const pendingB = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectA ? ready(projectA) : pendingB.promise));
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');

    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);

    await act(async () => {
      pendingB.resolve({ status });
      await pendingB.promise;
    });
    expect(screen.getByText(message, { exact: false })).toBeInTheDocument();
    /* W2: the app shell is no longer swapped out for the notice. */
    expect(screen.getByText('content')).toBeInTheDocument();
    /* A stays live behind the message (I22); B never got resources. */
    expect(sessionIds()).not.toContain(projectB);
    expect(fileManagerInputs.some((input) => input.projectId === projectB)).toBe(false);
    expect(projectProviderInputs).not.toContain(projectB);
  });

  it.each([
    [
      {
        status: 'recovering',
        recovery: {
          operationId: 'req_recovery',
          projectId: projectB,
          kind: 'create',
          storage: { backend: 'opfs', providerBasePath: '/pending' },
          status: 'recovering',
        },
      } satisfies ProjectRouteAccess,
      'Notice: recovering',
    ],
    [
      {
        status: 'recovery-failed',
        recovery: {
          operationId: 'req_recovery',
          projectId: projectB,
          kind: 'create',
          storage: { backend: 'opfs', providerBasePath: '/pending' },
          status: 'failed',
          reason: 'filesystem-error',
        },
      } satisfies ProjectRouteAccess,
      'Notice: recovery-failed',
    ],
  ])('should render pending-operation access without mounting project resources', async (access, message) => {
    getProjectRouteAccess.mockResolvedValue(access);
    renderRouteProvider();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByTestId('project-session')).not.toBeInTheDocument();
  });

  it('should retain project A inertly when project B access rejects', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => {
      if (id === projectA) {
        return ready(projectA);
      }
      throw new Error('discovery failed');
    });
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');

    currentProjectId = projectB;
    view.rerender(
      <Provider>
        <div>content</div>
      </Provider>,
    );

    expect(await screen.findByText('Notice: access-error')).toBeInTheDocument();
    expect(focusedSessionId()).toBe(projectA);
    expect(screen.getByTestId('project-session').closest('[inert]')).not.toBeNull();
    expect(unmounts).not.toContain(projectA);
  });

  it('should re-resolve access when the library revision changes (W2)', async () => {
    /*
     * Finding 2: deleting the open project closes its session and writes
     * `deletedAt`. The close was live; the trash was not, so the route kept
     * showing "Closed" — and its Reopen would have re-mounted a trashed
     * project. The revision counter is what makes the second fact arrive.
     */
    getProjectRouteAccess.mockResolvedValue(ready(projectA));
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');

    getProjectRouteAccess.mockResolvedValue(trashed(projectA));
    await act(async () => {
      projectManager.libraryRevision += 1;
      view.rerender(<Provider>content</Provider>);
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0);
      });
    });

    expect(await screen.findByText('Notice: trashed')).toBeInTheDocument();
  });

  it('should return to the editor when a restore bumps the library revision (W2)', async () => {
    getProjectRouteAccess.mockResolvedValue(trashed(projectA));
    const { Provider, view } = renderRouteProvider();
    expect(await screen.findByText('Notice: trashed')).toBeInTheDocument();

    getProjectRouteAccess.mockResolvedValue(ready(projectA));
    await act(async () => {
      projectManager.libraryRevision += 1;
      view.rerender(<Provider>content</Provider>);
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0);
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Notice: trashed')).not.toBeInTheDocument();
    });
    expect(focusedSessionId()).toBe(projectA);
  });

  it('should keep the app shell mounted in every non-editor state (W2)', async () => {
    /*
     * The blueprint's whole first finding: `children` is the app shell, and the
     * gate used to substitute its terminal markup for it, so closing a project
     * stranded the person on a page with no sidebar and no way out.
     */
    getProjectRouteAccess.mockResolvedValue(trashed(projectA));
    renderRouteProvider();

    expect(await screen.findByText('Notice: trashed')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('should show the closed notice with the shell when the session closes (W2)', async () => {
    getProjectRouteAccess.mockResolvedValue(ready(projectA));
    renderRouteProvider();
    await screen.findAllByTestId('project-session');

    await act(async () => {
      sessionsActor.send({ type: 'close', projectId: projectA, reason: 'user' });
      sessionsActor.getSnapshot().context.refs[projectA]?.send({ type: 'confirmClose' });
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0);
      });
    });

    expect(await screen.findByText('Notice: closed')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('should ignore pending access after the route gate unmounts', async () => {
    const pendingA = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockReturnValue(pendingA.promise);
    const { view } = renderRouteProvider();

    view.unmount();
    pendingA.resolve(ready(projectA));
    await act(async () => {
      await pendingA.promise;
    });

    expect(mounts).toEqual([]);
  });
});
