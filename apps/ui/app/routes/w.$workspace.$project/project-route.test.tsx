import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router';
import { DataBrowserRouter } from '#test-utils/data-memory-router.js';
import type { NavigateOptions } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { RevisionStatusProjection, RemoteFacet, SyncFacet } from '@taucad/revisions';
import type { ProjectRouteAccess } from '@taucad/files-ui/runtime/project-library';
import { tauCloudIntent } from '#lib/tau-cloud-intent.js';
import { SessionsProvider } from '#hooks/use-sessions.js';
import type { FocusHostFixture } from '#runtime/app-runtime-focus.fixture.js';
import { createSessionsActor } from '#services/sessions-store.js';
import type { SessionRuntimeOpener, SessionWiring } from '#services/sessions-store.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { openSessionRuntimeStandIn } from '#runtime/project-runtime.session.fixture.js';
import { sessionRuntimeWork } from '#runtime/project-runtime.session.js';
import type { SessionRuntimeStandIn } from '#runtime/project-runtime.session.fixture.js';
import type { AnyActorRef } from 'xstate';
import type * as AgentHostClientModule from '#services/agent-host-client.js';
import type * as HandleStoreModule from '@taucad/files-ui/filesystem/handle-store';
import type * as DesktopBridgeModule from '@taucad/files-ui/filesystem/desktop-bridge';
import type * as NoticesModule from '#routes/w.$workspace.$project/project-route-notices.js';
import type { ProjectRouteState } from '#types/project-route-state.types.js';
import { useProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import type * as ProjectWorkspaceWarmupModule from '#lib/project-workspace-warmup.js';
import type * as FocusedProjectViewModule from '#routes/w.$workspace.$project/focused-project-view.js';
import type * as ProjectSyncPlaceholderModule from '#routes/w.$workspace.$project/project-sync-placeholder.js';

/*
 * A6d: each session's `project` child builds its runtime; a stand-in records what the session handed it: the chat
 * the editor was asked for (as the provider's props were before A6d) and the native kernel id the runtime was built
 * with (as the subtree's kernel options were).
 */
const runtimes: SessionRuntimeStandIn[] = [];
const runtimeOpener: SessionRuntimeOpener = {
  open: async (input) => {
    const standIn = {
      ...openSessionRuntimeStandIn(input),
      /* A7c: the session's flushes and close run the real work over the rows' project and editor stand-ins, as the
       * route's binding ran them over `useProject` before the session's `project` child took them. */
      ...sessionRuntimeWork({
        projectId: input.projectId,
        producers: { flushAll: async () => flushWorkbenchRecords() },
        parameterService: () => parameterService,
        projectRef: projectRef as unknown as AnyActorRef,
        editorRef: editorRef as unknown as AnyActorRef,
      }),
    };
    const { requestChat } = standIn;
    kernelOptionInputs.push({ projectId: input.projectId, nativeKernelId: input.request?.nativeKernelId });
    runtimes.push({
      ...standIn,
      requestChat: (chat) => {
        projectProviderChatInputs.push({ requestedChatId: chat.chatId, createdChatId: chat.createdChatId });
        projectProviderRequests.push({
          projectId: input.projectId,
          requestedChatId: chat.chatId,
          createdChatId: chat.createdChatId,
        });
        requestChat(chat);
      },
    });
    return runtimes.at(-1)!;
  },
  onChoicesChanged: () => () => undefined,
};

/** The editor of a project's live runtime focused `chatId`, for the chat it was last asked for. */
const resolveFocusedChat = (projectId: string, chatId: string): void => {
  const runtime = runtimes.findLast((candidate) => candidate.input.projectId === projectId && !candidate.isClosed());
  runtime?.set({ focusedChat: { requestedChatId: runtime.chats.at(-1)?.chatId, chatId } });
};

const projectA = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const projectB = 'proj_bbbbbbbbbbbbbbbbbbbbb';
const projectC = 'proj_ccccccccccccccccccccc';

let currentProjectId = projectA;
const getProjectRouteAccess = vi.fn<(projectId: string) => Promise<ProjectRouteAccess>>();
const restoreProject = vi.fn<(projectId: string) => Promise<void>>();
/* W2: a trash or restore publishes a new manager value carrying the next
 * `libraryRevision`, and that value is how it reaches an already-resolved route. */
let projectManager = {
  getProjectRouteAccess,
  restoreProject,
  libraryRevision: 0,
};
const mounts: string[] = [];
const unmounts: string[] = [];
/** A11: mounts of the focused project's view (`FocusedProjectView`, in the outlet), by project. */
const viewMounts: string[] = [];
const viewUnmounts: string[] = [];
const fileManagerInputs: Array<{ projectId: string; rootDirectory: string }> = [];
const projectProviderInputs: string[] = [];
const projectProviderChatInputs: Array<{
  requestedChatId: string | undefined;
  createdChatId: string | undefined;
}> = [];
/** A0.2: every input a project provider rendered with, by project, in render order. */
const projectProviderRequests: Array<{
  projectId: string;
  requestedChatId: string | undefined;
  createdChatId: string | undefined;
}> = [];
/** Mounts of the editor branch's marker (A0.2 same-project rows). */
const editorMarker = { mounts: 0, unmounts: 0 };
/** Every notice kind rendered, in render order. */
const noticeKinds: string[] = [];
/** The native kernel id each project's runtime was built with, in build order (S34). */
const kernelOptionInputs: Array<{ projectId: string; nativeKernelId: string | undefined }> = [];
/*
 * The discovery listing slug resolution reads (`useProjects`), as a store a row can change: the real
 * `use-project-slug-route` resolves slugs and corrects the URL from it.
 */
type ListedProject = Readonly<{
  id: string;
  locator: { backend: 'opfs' };
  slugs: { workspaceSlug: string; projectSlug: string };
}>;
const listing = {
  projects: [] as readonly ListedProject[],
  isLoading: false,
  listeners: new Set<() => void>(),
  snapshot: { projects: [] as readonly ListedProject[], isLoading: false },
  set(projects: readonly ListedProject[], isLoading = false): void {
    this.projects = projects;
    this.isLoading = isLoading;
    this.snapshot = { projects, isLoading };
    for (const listener of this.listeners) {
      listener();
    }
  },
};
const editorSend = vi.fn();
const projectSend = vi.fn();
const connectRemote = vi.fn(async () => undefined);
const connectorReleases: Array<ReturnType<typeof vi.fn>> = [];
const publishProjectHostConnector = vi.fn(
  (
    _projectId: string,
    _connector: (chatId: string) => Promise<unknown>,
    _stoppability: (chatId: string) => Promise<unknown>,
  ) => {
    const release = vi.fn();
    connectorReleases.push(release);
    return release;
  },
);
const browserClientOptions: unknown[] = [];
const browserHostLeaseReleases: Array<ReturnType<typeof vi.fn>> = [];
/* Hoisted: the agent-host client's mock reads these when the module is first imported, which the app runtime's
 * graph does during this file's imports. */
const { retainBrowserAgentHostProject, noteBrowserRunRated } = vi.hoisted(() => ({
  retainBrowserAgentHostProject: vi.fn((_options: unknown) => {
    const release = vi.fn();
    browserHostLeaseReleases.push(release);
    return release;
  }),
  noteBrowserRunRated: vi.fn(async (_rating: unknown) => undefined),
}));
const daemonClientTransports: unknown[] = [];
const cancelProjectedRun = vi.fn(async (): Promise<'stopped' | 'continuing'> => 'stopped');
const storedHostSettings = new Map<
  string,
  { activeExecution?: { kind: 'tau'; model: string; hostId?: string }; activeKernel?: 'openscad' }
>();
let fileManagerReady = false;
let sharedWorkerState: 'ready' | 'pending' | 'failed' = 'ready';
const projectWorkspace = { syncProjectRoots: vi.fn(async () => undefined) };
const projectFileManagerRef = {
  getSnapshot: () => ({
    context: { rootDirectory: '/projects/live', openFileSystemBridge: vi.fn(), openRevisionSessionPort: vi.fn() },
    matches: (state: string) => state === 'ready' && fileManagerReady,
  }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
const chatSessionStore = {
  get: () => undefined,
  setRevisionFacts: () => undefined,
  publishProjectHostConnector,
  getChatHostSettings: async (chatId: string) => storedHostSettings.get(chatId),
  cancelProjectedRun,
};
/* A7b: each session publishes its project's host connector from its own `hostConnector` child, over the file manager
 * its `fileManager` child opened. A row that sets `fileManagerReady` opens one with a worker and the bridge the
 * connector reads; the rest open one with no worker, so they publish nothing. The revision client is not this suite's. */
const routeWorker = { name: 'route-worker' } as unknown as Worker;
const sessionWiring: SessionWiring = {
  loadRevisions: async () => ({
    createSessionRevisionsPorts: (ports) => ports as never,
    /* A14: no client publishes in these rows, so the file check is settled at once, as for a registry without one. */
    sessionRevisionsCallback:
      () =>
      ({ sendBack }) => {
        sendBack({ type: 'fileCheckChanged', settled: true, judged: true });
        return () => undefined;
      },
  }),
  loadHostConnector: async () => import('#runtime/host-connector.js'),
  registerCloseCut: () => () => undefined,
  registerProducer: () => () => undefined,
  focusedProject: { get: () => undefined, subscribe: () => () => undefined },
  documentVisible: { get: () => true, subscribe: () => () => undefined },
  chatSessions: chatSessionStore as unknown as SessionWiring['chatSessions'],
  choices: () => ({
    computePlacement: { state: 'local' },
    computeSelectionRevision: 0,
    computeReuseMode: 'durable',
    computeReuseRevision: 0,
    defaultExecution: { kind: 'tau', model: 'fixture-model' },
    modelCatalog: { status: 'loading' },
    modelPinning: true,
    defaultKernel: 'openscad',
    testingEnabled: true,
  }),
  rootSync: () => ({ syncProjectRoots: projectWorkspace.syncProjectRoots, close: () => undefined }),
};

/** The registry these rows share, composed as the app's root composes its own (MC-R4). */
const sessionsActor = createSessionsActor({
  openFileManager: (projectId) =>
    openSessionFileManagerStandIn(
      projectId,
      fileManagerReady ? { worker: routeWorker, context: projectFileManagerRef.getSnapshot().context } : {},
    ),
  openRuntime: runtimeOpener,
  wiring: sessionWiring,
}).start();

/** The desktop shell's bridge, when a row stands in for the desktop app; otherwise the web build's none. */
let desktopShellBridge: unknown;
vi.mock('@taucad/files-ui/filesystem/desktop-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof DesktopBridgeModule>();
  return { ...actual, desktopBridge: () => desktopShellBridge ?? actual.desktopBridge() };
});
vi.mock('#services/agent-host-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentHostClientModule>()),
  noteBrowserRunRated,
  createBrowserAgentHostClient: (options: unknown) => {
    browserClientOptions.push(options);
    return { close: async () => undefined };
  },
  retainBrowserAgentHostProject,
  createAgentHostClient: (transport: unknown) => {
    daemonClientTransports.push(transport);
    return { close: async () => undefined };
  },
  readBrowserRunStoppability: async () => 'stoppable',
}));
vi.mock('@taucad/chat-ui/services/daemon-agent-host-client', () => ({
  createDaemonAgentHostTransport: (dial: unknown) => ({ dial }),
}));
vi.mock('@taucad/files-ui/filesystem/handle-store', async (importOriginal) => ({
  ...(await importOriginal<typeof HandleStoreModule>()),
  getProjectFileSystemConfig: async (projectId: string) => ({
    projectId,
    backend: 'opfs',
    providerBasePath: projectId,
  }),
}));
/* `quiesce` is W13's close cut: `closing.flushing` calls it on this client. */
const revisionStatus = vi.fn<() => RevisionStatusProjection | undefined>(() => undefined);
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => 'authed' }));
vi.mock('#cloud/commercial-features.js', () => ({
  useCommercialFeatures: () => ({ isResolved: true, canSyncFiles: true }),
}));
const revisionClient = { subscribeEvents: () => () => undefined, quiesce: async () => undefined };
let editorIsIdle = true;
type EditorSnapshot = Readonly<{
  status: 'active';
  matches: (state?: unknown) => boolean;
  /* The producers flush reads `context.error` to tell "idle" from "idle, having
   * failed to store"; a double without it throws inside `closing.flushing`. */
  context: { error?: Error };
}>;
const editorSnapshot = (): EditorSnapshot => ({
  status: 'active',
  /* A loaded store (A6e: a store that has not loaded owes nothing), idle once it has stored. */
  matches: (state?: unknown) => state === 'ready' || editorIsIdle,
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
/* One Map for the life of the suite: the write-side host selects it, and a fresh one per snapshot
 * read would hand React a new value on every render. */
const viewGraphics = new Map();
const projectRef = {
  send: projectSend,
  /* `matches` is not decoration: the session's `closing.flushingProducers`
   * awaits `waitFor(projectRef, (state) => state.matches(...))`, so a snapshot
   * without it threw, the session settled in `failed` instead of `closed`, and
   * the registry never dropped its ref. `closeProjectRuntime` reads it too: a
   * project whose runtime closed cleanly is not also in `runtimeCloseFailed`. A loaded project is what reports the
   * session's runtime region ready, so the session goes live and focus settles on it (A5b, `TargetView`). */
  getSnapshot: () => ({
    context: { project: { loaded: true }, viewGraphics },
    matches: (state: unknown) => state !== 'runtimeCloseFailed',
  }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
const parameterService = {
  close: vi.fn(async () => undefined),
  subscribeUnsavedDrafts: () => () => undefined,
};
const flushWorkbenchRecords = async (): Promise<void> => undefined;

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => projectManager,
}));

/* Marks the subtree the focused project's view renders, so the provider stand-in tells it from a session's. */
const { focusedViewContext, projectIdContext, palette } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    focusedViewContext: createContext(false),
    /* The project a provider stand-in serves, for the palette's stand-in. */
    projectIdContext: createContext<string | undefined>(undefined),
    /* The palette's registry as `CommandPaletteProvider` keeps it: one entry per registration id. */
    palette: new Map<string, string | undefined>(),
  };
});
vi.mock('#routes/w.$workspace.$project/focused-project-view.js', async (importOriginal) => {
  const actual = await importOriginal<typeof FocusedProjectViewModule>();
  return {
    ...actual,
    FocusedProjectView: (props: React.ComponentProps<typeof actual.FocusedProjectView>) => (
      <focusedViewContext.Provider value>
        <actual.FocusedProjectView {...props} />
      </focusedViewContext.Provider>
    ),
  };
});
/* The session's focus as its subtree shows it: the binding announces sync for the focused project only. */
vi.mock('#routes/w.$workspace.$project/project-sync-placeholder.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectSyncPlaceholderModule>()),
  ProjectSyncAnnouncement: () => <span data-testid='focused-session' />,
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  SharedWorkerGate: ({
    children,
    placeholder,
    shouldReportFailure = true,
  }: React.PropsWithChildren<{ placeholder?: React.ReactNode; shouldReportFailure?: boolean }>): React.ReactNode => {
    if (sharedWorkerState === 'failed' && shouldReportFailure) {
      return <div role='alert'>File service unavailable</div>;
    }
    return sharedWorkerState === 'ready' ? <div>{children}</div> : placeholder;
  },
  SessionFileManagerProvider: ({
    children,
    projectId,
    rootDirectory,
  }: React.PropsWithChildren<{ projectId: string; rootDirectory: string }>) => {
    /* A11: the focused project's view re-homes this provider in the outlet; that copy is the view's, not a session. */
    const isView = useContext(focusedViewContext);
    if (!isView) {
      fileManagerInputs.push({ projectId, rootDirectory });
    }
    useEffect(() => {
      (isView ? viewMounts : mounts).push(projectId);
      return () => {
        (isView ? viewUnmounts : unmounts).push(projectId);
      };
    }, [isView, projectId]);
    return (
      <div data-testid={isView ? 'focused-view' : 'project-session'} data-project-id={projectId}>
        {children}
      </div>
    );
  },
  useFileManager: () => ({
    fileManagerRef: projectFileManagerRef,
    workspace: projectWorkspace,
  }),
  useOptionalFileManager: () => undefined,
}));

vi.mock('#hooks/project-provider.js', () => ({
  SessionProjectProvider: ({ children, projectId }: React.PropsWithChildren<{ projectId: string }>) => {
    projectProviderInputs.push(projectId);
    return (
      <projectIdContext.Provider value={projectId}>
        <div>{children}</div>
      </projectIdContext.Provider>
    );
  },
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectId: useContext(projectIdContext),
    projectRef,
    editorRef,
    parameterService,
    viewGraphics,
    mainEntryPath: '',
    viewRecords: new Map(),
    geometryUnits: new Map(),
  }),
}));
vi.mock('#hooks/use-publish-cloud-project-preview.js', () => ({
  usePublishCloudProjectPreview: () => () => undefined,
}));
vi.mock('./workbench-record-host.js', () => ({ WorkbenchRecordHost: () => null }));
vi.mock('#hooks/use-flush-on-close.js', () => {
  const flushProducers = async (): Promise<void> => undefined;
  return { useFlushOnClose: () => undefined, useFlushProducers: () => flushProducers };
});
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
  useRevisionClient: () => revisionClient,
  useRevisionClientStatus: () => revisionStatus(),
  useRevisionStatus: () => undefined,
  useProjectRole: () => 'owner',
  useRevisionCommands: () => ({ connectRemote }),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => chatSessionStore,
}));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    defaultExecution: { kind: 'tau', model: 'fixture-model' },
    resolveModel: (id: string) => ({ id, name: id, isResolved: false, provider: { id: 'unknown', name: 'Unknown' } }),
  }),
  resolveCatalogModel: (id: string) => ({
    id,
    name: id,
    isResolved: false,
    provider: { id: 'unknown', name: 'Unknown' },
  }),
}));
/* The `Mod+S` registration needs the application root's `KeyboardProvider`,
 * which this route-level suite does not mount; the shortcut has its own test. It marks the focused project's view. */
vi.mock('#routes/w.$workspace.$project/revision-save-shortcut.js', () => ({
  RevisionSaveShortcut: () => <span data-testid='focused-project' />,
}));
vi.mock('#hooks/use-editor-document-session.js', () => ({
  EditorDocumentSessionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('@taucad/viewer/hooks/use-webgl-context-tracker', () => ({
  WebglContextTrackerProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  RevisionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/revision-restore.js', () => ({ RevisionRestore: () => null }));
vi.mock('#routes/w.$workspace.$project/workbench-checkout-root.js', () => ({ WorkbenchCheckoutRoot: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-outcomes.js', () => ({ RevisionOutcomes: () => null }));
/* A11: the palette's project items register from the focused project's view, as `useCommandPaletteItems` does: set
 * under their id on mount, deleted under it on unmount. */
vi.mock('#routes/w.$workspace.$project/project-command-items.js', () => ({
  ProjectCommandPaletteItems: ({ paletteId }: { readonly paletteId: string }) => {
    const projectId = useContext(projectIdContext);
    useEffect(() => {
      palette.set(paletteId, projectId);
      return () => {
        palette.delete(paletteId);
      };
    }, [paletteId, projectId]);
    return null;
  },
}));
vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({
  ProjectExportAction: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-print-route-intent.js', () => ({ ProjectPrintRouteIntent: () => null }));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({
  ProjectShareRouteIntent: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-provider.js', () => ({
  ProjectWorkspaceProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/chat-interface.js', () => ({
  /* A0.2: the editor branch's marker. Its mount count is what "the same project keeps its editor" means. */
  ChatInterface: () => {
    useEffect(() => {
      editorMarker.mounts += 1;
      return () => {
        editorMarker.unmounts += 1;
      };
    }, []);
    return <span data-testid='editor-marker' />;
  },
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
  readRootedBridgeCapabilities: async () => ({ writable: true, durability: 'exclusive-append' }),
}));
/*
 * The notice presentation is W3's own suite. Here it stands in for every
 * non-editor state so these tests stay about what the *gate* derives and
 * whether the app shell survived it.
 */
vi.mock('#routes/w.$workspace.$project/project-route-notices.js', async () => {
  const { useContext } = await import('react');
  const { ProjectRouteRetryContext } = await import('#routes/w.$workspace.$project/project-route-state.js');
  return {
    ProjectRouteRetryContext,
    ProjectRouteNotice: ({ state }: { readonly state: { kind: string; error?: Error } }) => {
      const retry = useContext(ProjectRouteRetryContext);
      noticeKinds.push(state.kind);
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

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () =>
    useSyncExternalStore(
      (listener: () => void) => {
        listing.listeners.add(listener);
        return () => {
          listing.listeners.delete(listener);
        };
      },
      () => listing.snapshot,
    ),
}));
const routeModule = await import('./project-route.js');
const { WorkspaceFrame } = await import('./workspace-frame.js');
const intentModule = await import('./project-route-intent.js');
const sessionsModule = await import('./project-live-sessions.js');
const { startFocusHost } = await import('#runtime/app-runtime-focus.fixture.js');

/* Focus and its ports over the shared registry, as the runtime root composes them (A5b): the library port reads the
 * mocked route access at the manager's revision, and a revision bump reaches it as `ProjectLibrary`'s change does. */
const libraryListeners = new Set<(epoch: number) => void>();
const startTestFocus = (): FocusHostFixture =>
  startFocusHost({
    sessions: sessionsActor,
    library: {
      routeAccess: async (projectId) => getProjectRouteAccess(projectId),
      epoch: () => projectManager.libraryRevision,
      onEpochChanged: (listener) => {
        libraryListeners.add(listener);
        return () => {
          libraryListeners.delete(listener);
        };
      },
    },
    /* The module the app's focus loads (`loadProjectWorkspace`), which a row may hold pending. */
    loadModule: async () => {
      const { loadProjectWorkspace } = await import('#lib/project-workspace-warmup.js');
      await loadProjectWorkspace();
    },
  });
let focusHost: FocusHostFixture = startTestFocus();

/** W2: a trash or restore moves the library to its next revision, which focus hears through its library port. */
const bumpLibraryRevision = (): void => {
  projectManager = { ...projectManager, libraryRevision: projectManager.libraryRevision + 1 };
  for (const listener of libraryListeners) {
    listener(projectManager.libraryRevision);
  }
};

/** A committed route the router would hand the gate: slugs that may not resolve yet, and the project they name. */
function CommittedRoute({
  children,
  projectId,
  slugs,
}: {
  readonly children?: React.ReactNode;
  readonly projectId?: string;
  readonly slugs?: { workspaceSlug: string; projectSlug: string };
}): React.JSX.Element {
  const committed =
    slugs === undefined && projectId === undefined
      ? undefined
      : { slugs: slugs ?? { workspaceSlug: '', projectSlug: projectId ?? '' }, projectId, chatId: undefined };
  const route = { committed, createdChatId: undefined, slugsMissing: false, cloudOpen: false };
  const [sink] = useState(() => (): void => undefined);
  return (
    <>
      <intentModule.ProjectRouteIntent route={route} sink={sink} />
      <routeModule.ProjectRouteGate committed={committed}>{children}</routeModule.ProjectRouteGate>
    </>
  );
}

const project = (id: string) =>
  createProjectFixture({
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
}: {
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
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
    <SessionsProvider actor={sessionsActor} focus={focusHost}>
      <routeModule.ProjectRouteProviders
        projectId={currentProjectId}
        requestedChatId={requestedChatId}
        createdChatId={createdChatId}
      >
        {children}
        <sessionsModule.ProjectChatRoute />
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
  tauCloudIntent.set(projectA, undefined);
  currentProjectId = projectA;
  getProjectRouteAccess.mockReset();
  restoreProject.mockReset();
  projectManager.libraryRevision = 0;
  focusHost.stop();
  focusHost = startTestFocus();
  mounts.length = 0;
  unmounts.length = 0;
  fileManagerInputs.length = 0;
  projectProviderInputs.length = 0;
  viewMounts.length = 0;
  viewUnmounts.length = 0;
  palette.clear();
  projectProviderChatInputs.length = 0;
  editorSend.mockReset();
  projectSend.mockReset();
  connectRemote.mockClear();
  revisionStatus.mockReset();
  publishProjectHostConnector.mockClear();
  noteBrowserRunRated.mockReset();
  desktopShellBridge = undefined;
  connectorReleases.length = 0;
  browserClientOptions.length = 0;
  retainBrowserAgentHostProject.mockClear();
  browserHostLeaseReleases.length = 0;
  daemonClientTransports.length = 0;
  storedHostSettings.clear();
  cancelProjectedRun.mockClear();
  fileManagerReady = false;
  sharedWorkerState = 'ready';
  editorObservers.clear();
  editorIsIdle = true;
  projectProviderRequests.length = 0;
  editorMarker.mounts = 0;
  editorMarker.unmounts = 0;
  noticeKinds.length = 0;
  kernelOptionInputs.length = 0;
  listing.set([]);
});

/**
 * Which project the person is looking at.
 *
 * Every live project renders a subtree now (I22, R1), so "the session" is no
 * longer "the only one mounted": the focused one is the subtree that holds the
 * route's children.
 */
const focusedSessionId = (): string | undefined =>
  screen.queryByTestId('focused-session')?.closest<HTMLElement>('[data-project-id]')?.dataset['projectId'];

/** The project whose view the outlet holds (A11): its providers and its focused-only siblings. */
const focusedViewId = (): string | undefined =>
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
  it.each(['pending', 'failed'] as const)('should render non-project content while the worker is %s', (workerState) => {
    sharedWorkerState = workerState;
    render(
      <SessionsProvider actor={sessionsActor} focus={focusHost}>
        <routeModule.ProjectRouteProviders>
          <input aria-label='New project name' />
        </routeModule.ProjectRouteProviders>
      </SessionsProvider>,
    );
    const input = screen.getByRole('textbox', { name: 'New project name' });
    fireEvent.change(input, { target: { value: 'Retained draft' } });
    expect(input).toHaveValue('Retained draft');
    expect(getProjectRouteAccess).not.toHaveBeenCalled();
    if (workerState === 'failed') {
      // The available page owns its inline recovery notice; no full-page sibling displaces it.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  });

  it('should retain the live project and await pending writes across a non-project visit', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const Shell = ({ projectId }: { readonly projectId?: string }): React.JSX.Element => (
      <SessionsProvider actor={sessionsActor} focus={focusHost}>
        <routeModule.ProjectRouteProviders projectId={projectId}>
          <input aria-label='Page input' />
        </routeModule.ProjectRouteProviders>
      </SessionsProvider>
    );
    const view = render(<Shell projectId={projectA} />);
    await screen.findAllByTestId('project-session');
    const originalSession = screen.getByTestId('project-session');
    const pageInput = screen.getByRole('textbox', { name: 'Page input' });
    setEditorIdle(false);
    view.rerender(<Shell />);
    await waitFor(() => {
      expect(editorSend).toHaveBeenCalledWith({ type: 'flushNow' });
    });
    expect(screen.getByTestId('project-session')).toBe(originalSession);
    expect(screen.getByRole('textbox', { name: 'Page input' }).closest('[inert]')).not.toBeNull();
    await act(async () => {
      setEditorIdle(true);
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Page input' }).closest('[inert]')).toBeNull();
    });
    view.rerender(<Shell projectId={projectA} />);
    await waitFor(() => {
      expect(focusedSessionId()).toBe(projectA);
    });
    /* D24 (A11): the shell is never inside a session's subtree; it keeps its one node across the visit. */
    expect(screen.getByRole('textbox', { name: 'Page input' })).toBe(pageInput);
    expect(screen.getByTestId('project-session')).not.toContainElement(pageInput);
    expect(screen.getByTestId('project-session')).toBe(originalSession);
    expect(mounts).toEqual([projectA]);
    expect(unmounts).toEqual([]);
  });

  it('closes an unseen live chat by projected host cancel without an SDK session', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    renderRouteProvider();
    await screen.findAllByTestId('project-session');
    const session = sessionsActor.getSnapshot().context.refs[projectA];
    expect(session).toBeDefined();
    session?.send({
      type: 'projectedRunsChanged',
      runs: ['chat-unseen', 'chat-other-build'],
      stoppableRuns: ['chat-unseen'],
    });
    session?.send({ type: 'close', reason: 'user' });
    session?.send({ type: 'confirmClose' });
    await waitFor(() => {
      expect(cancelProjectedRun).toHaveBeenCalledWith('chat-unseen');
    });
    expect(cancelProjectedRun).not.toHaveBeenCalledWith('chat-other-build');
  });
  it('keeps the project open when a preflight-stoppable run refuses cancellation', async () => {
    cancelProjectedRun.mockResolvedValueOnce('continuing');
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    renderRouteProvider();
    await screen.findAllByTestId('project-session');
    const session = sessionsActor.getSnapshot().context.refs[projectA];
    expect(session).toBeDefined();
    session?.send({ type: 'projectedRunsChanged', runs: ['chat-unseen'], stoppableRuns: ['chat-unseen'] });
    session?.send({ type: 'close', reason: 'user' });
    session?.send({ type: 'confirmClose' });
    await waitFor(() => {
      expect(cancelProjectedRun).toHaveBeenCalledWith('chat-unseen');
      expect(session?.getSnapshot().matches('failed')).toBe(true);
    });
    expect(sessionsActor.getSnapshot().context.refs[projectA]).toBe(session);
  });
  /* LW8: in the desktop app a rating also reaches the desktop host, whichever host ran the run; each reports its own. */
  it('sends a rating to the browser host and the desktop host, and loses neither to the other’s failure', async () => {
    fileManagerReady = true;
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const desktopRated = vi.fn(async (_rating: unknown) => undefined);
    desktopShellBridge = { agentHost: { rated: desktopRated } };
    renderRouteProvider();
    await screen.findAllByTestId('project-session');
    await waitFor(() => {
      expect(publishProjectHostConnector).toHaveBeenCalled();
    });
    const extras = publishProjectHostConnector.mock.calls[0]?.[2] as unknown as {
      rated: (rating: Readonly<Record<string, unknown>>) => Promise<void>;
    };
    const rating = { chatId: 'chat-1', runId: 'run-1', value: 'positive', at: 1 } as const;
    noteBrowserRunRated.mockRejectedValueOnce(new Error('no browser host'));

    await extras.rated(rating);

    expect(noteBrowserRunRated).toHaveBeenCalledExactlyOnceWith({ projectId: projectA, ...rating });
    expect(desktopRated).toHaveBeenCalledExactlyOnceWith({ projectId: projectA, ...rating });
  });

  it('retains one project connector when focus moves to another live project', async () => {
    fileManagerReady = true;
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');
    await waitFor(() => {
      expect(publishProjectHostConnector).toHaveBeenCalledWith(
        projectA,
        expect.any(Function),
        expect.objectContaining({
          stoppability: expect.any(Function) as unknown,
          presented: expect.any(Function) as unknown,
        }),
      );
    });
    const connector = publishProjectHostConnector.mock.calls[0]?.[1] as (chatId: string) => Promise<unknown>;
    await connector('chat-browser');
    expect(retainBrowserAgentHostProject).toHaveBeenCalledOnce();

    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    await waitFor(() => {
      expect(focusedSessionId()).toBe(projectB);
    });
    expect(sessionIds()).toContain(projectA);
    await waitFor(() => {
      expect(publishProjectHostConnector.mock.calls.map(([projectId]) => projectId)).toEqual([projectA, projectB]);
    });
    expect(browserHostLeaseReleases[0]).not.toHaveBeenCalled();
  });

  it('opens unopened chats on their own persisted host and retains one browser host until the session closes', async () => {
    fileManagerReady = true;
    storedHostSettings.set('chat-browser', {
      activeExecution: { kind: 'tau', model: 'model-browser' },
      activeKernel: 'openscad',
    });
    storedHostSettings.set('chat-daemon', {
      activeExecution: { kind: 'tau', model: 'model-daemon', hostId: 'origin' },
    });
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { view } = renderRouteProvider();
    await waitFor(() => {
      expect(publishProjectHostConnector).toHaveBeenCalledWith(
        projectA,
        expect.any(Function),
        expect.objectContaining({
          stoppability: expect.any(Function) as unknown,
          presented: expect.any(Function) as unknown,
        }),
      );
    });
    const connector = publishProjectHostConnector.mock.calls[0]?.[1] as (chatId: string) => Promise<unknown>;

    await connector('chat-browser');
    await connector('chat-daemon');
    await connector('chat-browser');
    expect(browserClientOptions).toHaveLength(2);
    expect(retainBrowserAgentHostProject).toHaveBeenCalledOnce();
    expect(browserClientOptions[0]).toMatchObject({
      authority: { projectId: projectA, workspaceId: 'live' },
      projectStorage: { projectId: projectA, backend: 'opfs' },
    });
    expect((browserClientOptions[0] as { systemPrompt: string }).systemPrompt).toContain('model-browser');
    expect(daemonClientTransports).toHaveLength(1);
    /* A7b: the connector is the session's, so leaving the route keeps it (I5); the session's close withdraws it. */
    view.unmount();
    expect(connectorReleases[0]).not.toHaveBeenCalled();
    expect(browserHostLeaseReleases[0]).not.toHaveBeenCalled();
    sessionsActor.send({ type: 'close', projectId: projectA, reason: 'user' });
    await waitFor(() => {
      expect(connectorReleases[0]).toHaveBeenCalledOnce();
    });
    expect(browserHostLeaseReleases[0]).toHaveBeenCalledOnce();
  });
  it('connects a Tau Cloud library open through the project-scoped client', async () => {
    getProjectRouteAccess.mockResolvedValue(ready(projectA));
    revisionStatus.mockReturnValue(
      mock<RevisionStatusProjection>({
        remote: mock<RemoteFacet>({ kind: 'none', phase: 'none' }),
        sync: mock<SyncFacet>({ hasAppliedRemote: false, state: 'noRemote', pendingCount: 0 }),
        line: { kind: 'unknown' },
      }),
    );
    const lifecycle = deferred<Response>();
    const fetchProjects = vi.spyOn(globalThis, 'fetch').mockReturnValue(lifecycle.promise);
    try {
      tauCloudIntent.set(projectA, 'open');
      renderRouteProvider();

      await waitFor(() => {
        expect(fetchProjects).toHaveBeenCalledWith(
          expect.stringMatching(/\/v1\/projects$/u),
          expect.objectContaining({ credentials: 'include' }),
        );
      });
      expect(connectRemote).not.toHaveBeenCalled();
      await act(async () => {
        lifecycle.resolve(
          Response.json([
            { id: projectA, name: 'Project A', role: 'owner', cloudState: 'active', canDeleteCloud: false },
          ]),
        );
      });
      await waitFor(() => {
        expect(connectRemote).toHaveBeenCalledWith('tau');
      });
    } finally {
      fetchProjects.mockRestore();
    }
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

  it('should never leave the closed notice on screen between tasks while a ready project opens', async () => {
    const pendingA = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockReturnValue(pendingA.promise);
    renderRouteProvider();
    expect(screen.getByText('Notice: resolving')).toBeInTheDocument();

    /* Outside `act`, React renders on its own schedule, so the DOM between tasks is what a browser
     * could paint. Opening the session in a passive effect left `closed` committed for a task. */
    const previous = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    const seen: string[] = [];
    try {
      pendingA.resolve(ready(projectA));
      for (let task = 0; task < 50 && screen.queryAllByTestId('project-session').length === 0; task++) {
        // oxlint-disable-next-line no-await-in-loop -- one sample per task, in order, is the point
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, 0);
        });
        seen.push(document.body.textContent);
      }
    } finally {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previous;
    }

    await screen.findAllByTestId('project-session');
    expect(seen.some((text) => text.includes('Notice: closed'))).toBe(false);
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

  it('should keep the app shell in the document while project B access is pending', async () => {
    const pendingA = deferred<ProjectRouteAccess>();
    const pendingB = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectA ? pendingA.promise : pendingB.promise));
    const { Provider, view } = renderRouteProvider();

    await act(async () => {
      pendingA.resolve(ready(projectA));
      await pendingA.promise;
    });

    currentProjectId = projectB;
    view.rerender(
      <Provider>
        <div>content</div>
      </Provider>,
    );

    /* The overlay covers the wait; it does not replace the app shell. A frame
     * with no sidebar is what `project-navigation.spec.ts` watches for. */
    expect(screen.getByRole('status', { name: 'Opening project' })).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
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

  it('should keep a held notice for another project usable while the project it left stays inert (round 2)', async () => {
    getProjectRouteAccess.mockImplementation(async (projectId: string) =>
      projectId === projectA ? ready(projectA) : trashed(projectB),
    );
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');

    currentProjectId = projectB;
    view.rerender(
      <Provider>
        <div>content</div>
      </Provider>,
    );

    const notice = await screen.findByText('Notice: trashed');
    expect(notice.closest('[inert]')).toBeNull();
    expect(screen.getByTestId('project-session').closest('[inert]')).not.toBeNull();
  });

  it('should re-resolve access when the library revision changes (W2)', async () => {
    /*
     * Finding 2: deleting the open project closes its session and writes
     * `deletedAt`. The close was live; the trash was not, so the route kept
     * showing "Closed" — and its Reopen would have re-mounted a trashed
     * project. The manager's next value is what makes the second fact arrive.
     */
    getProjectRouteAccess.mockResolvedValue(ready(projectA));
    const { Provider, view } = renderRouteProvider();
    await screen.findAllByTestId('project-session');

    getProjectRouteAccess.mockResolvedValue(trashed(projectA));
    await act(async () => {
      bumpLibraryRevision();
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
      bumpLibraryRevision();
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

// ===========================================================================
// A0.2: route gate and session binding rows (app state orchestration charter)
// ===========================================================================

/** Every route state the gate published, in render order. */
const publishedKinds: string[] = [];

function RouteStateProbe(): React.JSX.Element {
  const state: ProjectRouteState | undefined = useProjectRouteState();
  publishedKinds.push(state?.kind ?? 'none');
  return <span data-testid='route-state'>{state?.kind ?? 'none'}</span>;
}

/** What the router last rendered, and a handle to move it. */
const router: {
  location: ReturnType<typeof useLocation> | undefined;
  navigate: ReturnType<typeof useNavigate> | undefined;
  /** How the router got to `location`: PUSH, REPLACE or POP. */
  action: ReturnType<typeof useNavigationType> | undefined;
} = { location: undefined, navigate: undefined, action: undefined };

function RouterProbe(): undefined {
  const location = useLocation();
  const navigate = useNavigate();
  const action = useNavigationType();
  useEffect(() => {
    router.location = location;
    router.navigate = navigate;
    router.action = action;
  }, [location, navigate, action]);
  return undefined;
}

const listed = (id: string, workspaceSlug: string, projectSlug: string): ListedProject => ({
  id,
  locator: { backend: 'opfs' },
  slugs: { workspaceSlug, projectSlug },
});

const readyAt = (id: string, entryPath: string): ProjectRouteAccess => ({
  status: 'ready',
  project: createProjectFixture({ id, name: id, description: '', tags: [], assets: { main: { entryPath } } }),
});

/** Render the gate and let its first access answer land inside `act`. */
const renderAndSettle = async (): Promise<ReturnType<typeof renderRouteProvider>> => {
  const rendered = renderRouteProvider();
  await flushTasks();
  return rendered;
};

/** Let settled promises and the commits they cause land, without waiting on time. */
const flushTasks = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  });
};

const navigateTo = async (target: string, options?: NavigateOptions): Promise<void> => {
  await act(async () => {
    await router.navigate?.(target, options);
  });
  await flushTasks();
};

/**
 * The app-owned host over a real router, with the editor's route component below it — exactly as
 * the root layout mounts `ProjectSessionsHost` around the outlet.
 */
const renderHost = (initialEntry: string, shell?: React.ReactNode): ReturnType<typeof render> =>
  render(
    <DataBrowserRouter initialEntry={initialEntry}>
      <RouterProbe />
      <SessionsProvider actor={sessionsActor} focus={focusHost}>
        <routeModule.ProjectSessionsHost>
          <Routes>
            <Route
              path='/w/:workspace/:project'
              element={
                <>
                  <RouteStateProbe />
                  <sessionsModule.ProjectChatRoute />
                  {shell}
                </>
              }
            />
            <Route path='*' element={<RouteStateProbe />} />
          </Routes>
        </routeModule.ProjectSessionsHost>
      </SessionsProvider>
    </DataBrowserRouter>,
  );

const providerRequestsOf = (projectId: string) =>
  projectProviderRequests.filter((request) => request.projectId === projectId);

const kernelIdsOf = (projectId: string): ReadonlyArray<string | undefined> =>
  kernelOptionInputs.filter((input) => input.projectId === projectId).map((input) => input.nativeKernelId);

describe('A0.2 route gate rows', () => {
  beforeEach(() => {
    publishedKinds.length = 0;
    router.location = undefined;
    router.navigate = undefined;
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  /* One row per `ProjectRouteState` member (`project-route-state.ts` 31 to 48): what the gate
   * publishes, and which project subtrees exist once it has. */
  it.each<readonly [ProjectRouteState['kind'], () => Promise<void>, readonly string[]]>([
    [
      'resolving',
      async () => {
        getProjectRouteAccess.mockReturnValue(deferred<ProjectRouteAccess>().promise);
        await renderAndSettle();
      },
      [],
    ],
    [
      'editor',
      async () => {
        getProjectRouteAccess.mockResolvedValue(ready(projectA));
        await renderAndSettle();
      },
      [projectA],
    ],
    [
      'closed',
      async () => {
        getProjectRouteAccess.mockResolvedValue(ready(projectA));
        await renderAndSettle();
        await act(async () => {
          sessionsActor.send({ type: 'close', projectId: projectA, reason: 'user' });
          await Promise.resolve();
        });
      },
      [],
    ],
    [
      'trashed',
      async () => {
        getProjectRouteAccess.mockResolvedValue(trashed(projectA));
        await renderAndSettle();
      },
      [],
    ],
    [
      'missing',
      async () => {
        getProjectRouteAccess.mockResolvedValue({ status: 'missing' });
        await renderAndSettle();
      },
      [],
    ],
    [
      'conflict',
      async () => {
        getProjectRouteAccess.mockResolvedValue({ status: 'conflict' });
        await renderAndSettle();
      },
      [],
    ],
    [
      'unavailable',
      async () => {
        getProjectRouteAccess.mockResolvedValue({ status: 'unavailable' });
        await renderAndSettle();
      },
      [],
    ],
    [
      'recovering',
      async () => {
        getProjectRouteAccess.mockResolvedValue({
          status: 'recovering',
          recovery: {
            operationId: 'req_recovery',
            projectId: projectA,
            kind: 'create',
            storage: { backend: 'opfs', providerBasePath: '/pending' },
            status: 'recovering',
          },
        });
        await renderAndSettle();
      },
      [],
    ],
    [
      'recovery-failed',
      async () => {
        getProjectRouteAccess.mockResolvedValue({
          status: 'recovery-failed',
          recovery: {
            operationId: 'req_recovery',
            projectId: projectA,
            kind: 'create',
            storage: { backend: 'opfs', providerBasePath: '/pending' },
            status: 'failed',
            reason: 'filesystem-error',
          },
        });
        await renderAndSettle();
      },
      [],
    ],
    [
      'native-kernel',
      async () => {
        /* `main.py` needs the build123d runtime, which the web build does not carry. */
        getProjectRouteAccess.mockResolvedValue(readyAt(projectA, 'main.py'));
        await renderAndSettle();
      },
      /* Today the gate still opens a ready project whose kernel this host cannot run: `open`
       * follows a ready answer (`project-route.tsx` 262 to 273), so its subtree mounts behind the
       * notice although `editor` is the only state documented to mount resources. */
      [projectA],
    ],
    [
      'access-error',
      async () => {
        getProjectRouteAccess.mockRejectedValue(new Error('discovery failed'));
        await renderAndSettle();
      },
      [],
    ],
    [
      'flush-error',
      async () => {
        getProjectRouteAccess.mockImplementation(async (id) => ready(id));
        const { Provider, view } = await renderAndSettle();
        setEditorIdle(false);
        currentProjectId = projectB;
        view.rerender(<Provider>content</Provider>);
        await flushTasks();
        act(() => {
          failEditorFlush(new Error('storage failed'));
        });
      },
      /* The failed leave flush keeps A and never opens B (I3). */
      [projectA],
    ],
  ])('should publish %s and mount only the subtrees it owns', async (kind, arrange, subtrees) => {
    await arrange();
    await flushTasks();

    expect(screen.getByText(kind === 'editor' ? 'content' : `Notice: ${kind}`)).toBeInTheDocument();
    if (kind === 'editor') {
      expect(screen.queryByText(/^Notice: /u)).not.toBeInTheDocument();
      expect(focusedSessionId()).toBe(projectA);
    }
    expect(sessionIds()).toEqual(subtrees);
    /* W2: the shell survives every state. */
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('should retry a failed leave flush and move once the retry settles', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { Provider, view } = renderRouteProvider();
    await flushTasks();
    setEditorIdle(false);
    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    await flushTasks();
    act(() => {
      failEditorFlush(new Error('storage failed'));
    });
    await flushTasks();
    expect(screen.getByText('Notice: flush-error')).toBeInTheDocument();
    expect(editorSend.mock.calls.filter(([event]) => (event as { type: string }).type === 'flushNow')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry project' }));
    await flushTasks();
    /* The retry flushes again: a failed flush is never treated as done. */
    expect(editorSend.mock.calls.filter(([event]) => (event as { type: string }).type === 'flushNow')).toHaveLength(2);
    expect(focusedSessionId()).toBe(projectA);

    act(() => {
      setEditorIdle(true);
    });
    await flushTasks();
    expect(focusedSessionId()).toBe(projectB);
    expect(screen.queryByText('Notice: flush-error')).not.toBeInTheDocument();
  });

  it('should retry a failed access check with a new request and open on its answer', async () => {
    getProjectRouteAccess.mockRejectedValueOnce(new Error('discovery failed')).mockResolvedValueOnce(ready(projectA));
    renderRouteProvider();
    await flushTasks();
    expect(screen.getByText('Notice: access-error')).toBeInTheDocument();
    expect(sessionIds()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Retry project' }));
    await flushTasks();

    expect(getProjectRouteAccess.mock.calls).toEqual([[projectA], [projectA]]);
    expect(focusedSessionId()).toBe(projectA);
  });

  it('should open only the latest destination when a second navigation lands during the first leave flush', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { Provider, view } = renderRouteProvider();
    await flushTasks();
    setEditorIdle(false);
    publishedKinds.length = 0;

    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    await flushTasks();
    currentProjectId = projectC;
    view.rerender(<Provider>content</Provider>);
    await flushTasks();

    /* One flush for the project being left, shared by both requests. */
    expect(editorSend.mock.calls.filter(([event]) => (event as { type: string }).type === 'flushNow')).toHaveLength(1);
    expect(Object.keys(sessionsActor.getSnapshot().context.refs)).toEqual([projectA]);

    act(() => {
      setEditorIdle(true);
    });
    await flushTasks();

    expect(focusedSessionId()).toBe(projectC);
    expect(Object.keys(sessionsActor.getSnapshot().context.refs)).toEqual([projectA, projectC]);
    expect(projectProviderInputs).not.toContain(projectB);
  });

  it('should open nothing when the leave flush settles while the newest destination is still checking access', async () => {
    const accessC = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectC ? accessC.promise : ready(id)));
    const { Provider, view } = renderRouteProvider();
    await flushTasks();
    setEditorIdle(false);

    /* B's access answers and its effect waits on the flush; C's access is still out. */
    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    await flushTasks();
    currentProjectId = projectC;
    view.rerender(<Provider>content</Provider>);
    await flushTasks();

    act(() => {
      setEditorIdle(true);
    });
    await flushTasks();

    /* The superseded B request must not open once the flush it waited on settles. */
    expect(focusedSessionId()).toBe(projectA);
    expect(Object.keys(sessionsActor.getSnapshot().context.refs)).toEqual([projectA]);
    expect(projectProviderInputs).not.toContain(projectB);

    await act(async () => {
      accessC.resolve(ready(projectC));
      await accessC.promise;
    });
    await flushTasks();

    expect(focusedSessionId()).toBe(projectC);
    expect(projectProviderInputs).not.toContain(projectB);
  });

  it('should drop an access answer that a library revision superseded while it was resolving', async () => {
    const first = deferred<ProjectRouteAccess>();
    const second = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { Provider, view } = renderRouteProvider();
    await flushTasks();
    expect(screen.getByText('Notice: resolving')).toBeInTheDocument();

    bumpLibraryRevision();
    view.rerender(<Provider>content</Provider>);
    await flushTasks();
    expect(getProjectRouteAccess).toHaveBeenCalledTimes(2);

    /* The superseded check answers ready; its effect was cancelled, so nothing opens. */
    await act(async () => {
      first.resolve(ready(projectA));
      await first.promise;
    });
    await flushTasks();
    expect(screen.getByText('Notice: resolving')).toBeInTheDocument();
    expect(Object.keys(sessionsActor.getSnapshot().context.refs)).toEqual([]);

    await act(async () => {
      second.resolve(trashed(projectA));
      await second.promise;
    });
    await flushTasks();
    expect(screen.getByText('Notice: trashed')).toBeInTheDocument();
    expect(sessionIds()).toEqual([]);
  });

  it('should keep the project being left, open nothing and send no close while a failed leave flush blocks the move (I3)', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { Provider, view } = renderRouteProvider();
    await flushTasks();
    const session = sessionsActor.getSnapshot().context.refs[projectA];
    setEditorIdle(false);
    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    await flushTasks();
    act(() => {
      failEditorFlush(new Error('storage failed'));
    });
    await flushTasks();

    expect(screen.getByText('Notice: flush-error')).toBeInTheDocument();
    expect(getProjectRouteAccess.mock.calls).toEqual([[projectA], [projectB]]);
    expect(Object.keys(sessionsActor.getSnapshot().context.refs)).toEqual([projectA]);
    expect(sessionsActor.getSnapshot().context.refs[projectA]).toBe(session);
    expect(session?.getSnapshot().matches('closing')).toBe(false);
    expect(focusedSessionId()).toBe(projectA);
  });
});

/*
 * A5b: the today defects the model names, fixed by moving the open path and the leave flush to focus
 * (`ProjectFocus.today-held-skips-flush` and `today-module-race`, which stay as the record of today's code).
 */
describe('A5b the defects focus fixes', () => {
  it('should still flush the project it leaves after a held answer on it (today-held-skips-flush, I3)', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const { Provider, view } = await renderAndSettle();
    expect(focusedSessionId()).toBe(projectA);

    /* An edit while a library change re-resolves the project, and the answer comes back held. */
    setEditorIdle(false);
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectA ? trashed(id) : ready(id)));
    await act(async () => {
      bumpLibraryRevision();
      await Promise.resolve();
    });
    await flushTasks();
    expect(screen.getByText('Notice: trashed')).toBeInTheDocument();
    editorSend.mockClear();

    /* The next navigation leaves the held project: its unsaved work is flushed before anything else opens. */
    currentProjectId = projectB;
    view.rerender(<Provider>content</Provider>);
    await flushTasks();
    expect(editorSend.mock.calls.filter(([event]) => (event as { type: string }).type === 'flushNow')).toHaveLength(1);
    expect(sessionIds()).toEqual([projectA]);

    act(() => {
      setEditorIdle(true);
    });
    await flushTasks();
    expect(focusedSessionId()).toBe(projectB);
  });

  it('should derive resolving, never editor, while the session module is still loading (today-module-race, U1)', async () => {
    const workspace = deferred<Awaited<WorkspaceLoad>>();
    workspaceImport.pending = workspace.promise;
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    try {
      const { Provider, view } = renderRouteProvider();
      await flushTasks();
      expect(screen.getByText('Notice: resolving')).toBeInTheDocument();
      expect(screen.queryByTestId('focused-project')).not.toBeInTheDocument();

      await act(async () => {
        workspace.resolve(sessionsModule);
        await workspace.promise;
      });
      view.rerender(<Provider>content</Provider>);
      await screen.findByTestId('focused-project');
      expect(screen.queryByText(/^Notice: /u)).not.toBeInTheDocument();
    } finally {
      await act(async () => {
        workspace.resolve(sessionsModule);
        await workspace.promise;
      });
      workspaceImport.pending = undefined;
    }
  });
});

describe('A0.2 the same project keeps its editor (I20, D7)', () => {
  beforeEach(() => {
    publishedKinds.length = 0;
    listing.set([listed(projectA, 'ws', 'alpha'), listed(projectB, 'ws', 'beta')]);
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('should keep one editor mount and render no notice when the chat in the URL changes', async () => {
    renderHost('/w/ws/alpha?chat=chat-1');
    await flushTasks();
    expect(screen.getByTestId('editor-marker')).toBeInTheDocument();
    expect(editorMarker).toEqual({ mounts: 1, unmounts: 0 });
    publishedKinds.length = 0;
    noticeKinds.length = 0;

    await navigateTo('/w/ws/alpha?chat=chat-2');

    expect(providerRequestsOf(projectA).at(-1)).toMatchObject({ requestedChatId: 'chat-2' });
    expect(editorMarker).toEqual({ mounts: 1, unmounts: 0 });
    expect(noticeKinds).toEqual([]);
    expect(publishedKinds.length).toBeGreaterThan(0);
    expect(publishedKinds.filter((kind) => kind !== 'editor')).toEqual([]);
    expect(getProjectRouteAccess).toHaveBeenCalledTimes(1);
  });

  it("should keep one editor mount and render no notice when the editor's focused chat replaces the URL", async () => {
    renderHost('/w/ws/alpha');
    await flushTasks();
    expect(editorMarker).toEqual({ mounts: 1, unmounts: 0 });
    const historyKey = router.location?.key;
    publishedKinds.length = 0;
    noticeKinds.length = 0;

    await act(async () => {
      resolveFocusedChat(projectA, 'chat-3');
      await Promise.resolve();
    });
    await flushTasks();

    expect(router.location).toMatchObject({ pathname: '/w/ws/alpha', search: '?chat=chat-3' });
    expect(router.location?.key).not.toBe(historyKey);
    expect(router.action).toBe('REPLACE');
    /* The editor is asked for the chat the URL now names, as the provider's prop asked it before A6d. */
    expect(providerRequestsOf(projectA).at(-1)).toMatchObject({ requestedChatId: 'chat-3' });
    expect(editorMarker).toEqual({ mounts: 1, unmounts: 0 });
    expect(noticeKinds).toEqual([]);
    expect(publishedKinds.length).toBeGreaterThan(0);
    expect(publishedKinds.filter((kind) => kind !== 'editor')).toEqual([]);
  });
});

describe('A6d the editor follows the chat the route shows (D21 round 1)', () => {
  beforeEach(() => {
    listing.set([listed(projectA, 'ws', 'alpha')]);
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it("should show the editor's next focused chat after it showed one it focused itself", async () => {
    renderHost('/w/ws/alpha');
    await flushTasks();
    await act(async () => {
      resolveFocusedChat(projectA, 'chat-3');
      await Promise.resolve();
    });
    await flushTasks();
    expect(router.location).toMatchObject({ search: '?chat=chat-3' });

    /* A chat focused in the editor itself (Fix with AI, a conflict's chat) reaches the URL too. */
    await act(async () => {
      resolveFocusedChat(projectA, 'chat-4');
      await Promise.resolve();
    });
    await flushTasks();

    expect(router.location).toMatchObject({ pathname: '/w/ws/alpha', search: '?chat=chat-4' });
  });
});

describe('A6d a chatless return shows the chat the editor kept (A0.1 I2 witness, D21 round 2)', () => {
  beforeEach(() => {
    listing.set([listed(projectA, 'ws', 'alpha'), listed(projectB, 'ws', 'beta')]);
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('should put the retained chat back in the URL when the person returns through a link with no chat', async () => {
    renderHost('/w/ws/alpha');
    await flushTasks();
    await act(async () => {
      resolveFocusedChat(projectA, 'chat-1');
      await Promise.resolve();
    });
    await flushTasks();
    expect(router.location).toMatchObject({ search: '?chat=chat-1' });

    await navigateTo('/w/ws/beta');
    await navigateTo('/w/ws/alpha');
    await flushTasks();

    expect(focusedSessionId()).toBe(projectA);
    expect(router.location).toMatchObject({ pathname: '/w/ws/alpha', search: '?chat=chat-1' });
  });
});

describe('A0.2 the chat request reaches the provider after open (S12, route half)', () => {
  beforeEach(() => {
    listing.set([listed(projectA, 'ws', 'alpha'), listed(projectB, 'ws', 'beta')]);
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('should hand the focused provider a changed chat and a created chat with its trust marker', async () => {
    renderHost('/w/ws/alpha?chat=chat-1');
    await flushTasks();
    expect(providerRequestsOf(projectA).at(-1)).toEqual({
      projectId: projectA,
      requestedChatId: 'chat-1',
      createdChatId: undefined,
    });

    await navigateTo('/w/ws/alpha?chat=chat-new', { state: { focusChatComposer: true } });

    expect(providerRequestsOf(projectA).at(-1)).toEqual({
      projectId: projectA,
      requestedChatId: 'chat-new',
      createdChatId: 'chat-new',
    });
    expect(editorMarker).toEqual({ mounts: 1, unmounts: 0 });
  });

  it('should keep a retained project on its chat while it is behind, and hand it the chat it regains focus with', async () => {
    renderHost('/w/ws/alpha?chat=chat-1');
    await flushTasks();
    await navigateTo('/w/ws/beta');
    expect(focusedSessionId()).toBe(projectB);
    /* A6d (D14): the session holds its chat; the editor is no longer reset to no chat when focus leaves. */
    expect(providerRequestsOf(projectA).at(-1)).toMatchObject({ requestedChatId: 'chat-1', createdChatId: undefined });

    await navigateTo('/w/ws/alpha?chat=chat-2');

    expect(focusedSessionId()).toBe(projectA);
    expect(providerRequestsOf(projectA).at(-1)).toMatchObject({ requestedChatId: 'chat-2', createdChatId: undefined });
    /* A was never re-opened as a new subtree: I22 retention. */
    expect(mounts.filter((id) => id === projectA)).toHaveLength(1);
  });
});

describe('A0.2 ProjectSessionsHost (S29, S34)', () => {
  beforeEach(() => {
    publishedKinds.length = 0;
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('should resolve slugs to the project id before it checks access', async () => {
    listing.set([listed(projectA, 'ws', 'alpha')]);
    renderHost('/w/ws/alpha');
    await flushTasks();

    expect(getProjectRouteAccess.mock.calls).toEqual([[projectA]]);
    expect(focusedSessionId()).toBe(projectA);
  });

  it('should derive resolving while the listing loads and missing for slugs that name nothing', async () => {
    listing.set([], true);
    renderHost('/w/ws/alpha');
    await flushTasks();
    expect(screen.getByTestId('route-state')).toHaveTextContent('resolving');
    expect(getProjectRouteAccess).not.toHaveBeenCalled();

    act(() => {
      listing.set([listed(projectB, 'ws', 'beta')]);
    });
    await flushTasks();
    expect(screen.getByTestId('route-state')).toHaveTextContent('missing');
    expect(noticeKinds.at(-1)).toBe('missing');
    expect(getProjectRouteAccess).not.toHaveBeenCalled();
  });

  it('should keep the resolved project on its path when its slug is renamed, and correct the address bar', async () => {
    listing.set([listed(projectA, 'ws', 'alpha')]);
    renderHost('/w/ws/alpha');
    await flushTasks();
    expect(globalThis.location.pathname).toBe('/w/ws/alpha');
    noticeKinds.length = 0;

    act(() => {
      listing.set([listed(projectA, 'ws', 'alpha-renamed')]);
    });
    await flushTasks();

    expect(focusedSessionId()).toBe(projectA);
    expect(screen.getByTestId('route-state')).toHaveTextContent('editor');
    expect(noticeKinds).toEqual([]);
    expect(editorMarker).toEqual({ mounts: 1, unmounts: 0 });
    expect(globalThis.location.pathname).toBe('/w/ws/alpha-renamed');
    expect(getProjectRouteAccess.mock.calls).toEqual([[projectA]]);
  });

  it('should correct an id-addressed URL to its canonical slugs and send the focused chat there', async () => {
    listing.set([listed(projectA, 'ws', 'alpha')]);
    renderHost(`/w/ws/${projectA}`);
    await flushTasks();
    expect(focusedSessionId()).toBe(projectA);
    expect(globalThis.location.pathname).toBe('/w/ws/alpha');

    await act(async () => {
      resolveFocusedChat(projectA, 'chat-7');
      await Promise.resolve();
    });
    await flushTasks();

    expect(router.location).toMatchObject({ pathname: '/w/ws/alpha', search: '?chat=chat-7' });
    expect(editorMarker).toEqual({ mounts: 1, unmounts: 0 });
  });

  it('should consume the cloudOpen marker once and strip it from the URL', async () => {
    const lifecycle = deferred<Response>();
    const fetchProjects = vi.spyOn(globalThis, 'fetch').mockReturnValue(lifecycle.promise);
    try {
      listing.set([listed(projectA, 'ws', 'alpha')]);
      renderHost('/w/ws/alpha?chat=chat-1&cloudOpen=tau');
      await flushTasks();

      expect(tauCloudIntent.get(projectA)).toBe('open');
      expect(router.location?.search).toBe('?chat=chat-1');

      tauCloudIntent.set(projectA, undefined);
      await navigateTo('/w/ws/alpha?chat=chat-2');
      expect(tauCloudIntent.get(projectA)).toBeUndefined();
    } finally {
      tauCloudIntent.set(projectA, undefined);
      fetchProjects.mockRestore();
    }
  });

  it('should keep the native kernel id a retained project was opened with after focus moves on (S34)', async () => {
    desktopShellBridge = { runtimeKernelIds: ['build123d'] };
    listing.set([listed(projectA, 'ws', 'alpha'), listed(projectB, 'ws', 'beta')]);
    getProjectRouteAccess.mockImplementation(async (id) =>
      id === projectA ? readyAt(projectA, 'main.py') : ready(id),
    );
    renderHost('/w/ws/alpha');
    await flushTasks();
    expect(focusedSessionId()).toBe(projectA);
    expect(kernelIdsOf(projectA)).toEqual(['build123d']);

    await navigateTo('/w/ws/beta');

    expect(focusedSessionId()).toBe(projectB);
    /* A6d: the session built A's runtime once, with its open request's kernel, and leaving it rebuilds nothing. */
    expect(kernelIdsOf(projectA)).toEqual(['build123d']);
    expect(runtimes.filter((runtime) => runtime.input.projectId === projectA && !runtime.isClosed())).toHaveLength(1);
    expect(kernelIdsOf(projectB)).toEqual([undefined]);
  });
});

/* The real handlers, not the stand-in notice above: these rows are about what they send. */
const actualNotices = await vi.importActual<typeof NoticesModule>(
  '#routes/w.$workspace.$project/project-route-notices.js',
);
const { useSidebarCommands } = await import('#hooks/use-sidebar-status.js');

describe('A0.2 the other senders of open keep what the gate kept (S39)', () => {
  function ReopenControls(): React.JSX.Element {
    const run = actualNotices.useProjectRouteNoticeActions(projectA);
    const { openProject } = useSidebarCommands();
    return (
      <>
        <button
          type='button'
          onClick={() => {
            run('reopen');
          }}
        >
          Notice reopen
        </button>
        <button
          type='button'
          onClick={() => {
            openProject(projectA);
          }}
        >
          Sidebar open
        </button>
      </>
    );
  }

  beforeEach(() => {
    desktopShellBridge = { runtimeKernelIds: ['build123d'] };
    listing.set([listed(projectA, 'ws', 'alpha')]);
    getProjectRouteAccess.mockImplementation(async (id) => readyAt(id, 'main.py'));
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it.each(['Notice reopen', 'Sidebar open'])(
    'should remount a closed project on %s with its kept native kernel id and its chat',
    async (control) => {
      renderHost('/w/ws/alpha?chat=chat-1', <ReopenControls />);
      await flushTasks();
      expect(focusedSessionId()).toBe(projectA);

      await act(async () => {
        sessionsActor.send({ type: 'close', projectId: projectA, reason: 'user' });
        await Promise.resolve();
      });
      await flushTasks();
      expect(screen.getByTestId('route-state')).toHaveTextContent('closed');
      expect(sessionIds()).toEqual([]);
      kernelOptionInputs.length = 0;
      projectProviderRequests.length = 0;

      fireEvent.click(screen.getByRole('button', { name: control }));
      await flushTasks();

      expect(focusedSessionId()).toBe(projectA);
      expect(new Set(kernelIdsOf(projectA))).toEqual(new Set(['build123d']));
      expect(providerRequestsOf(projectA).at(-1)).toMatchObject({ requestedChatId: 'chat-1' });
    },
  );

  /*
   * I4: "a person's open re-sends the one focus kept". Focus kept build123d (main.py) and chat-1 for this
   * project; the reopened session must carry them as its open request. Both senders send `openRequested` to
   * focus (A5b), which opens with its kept request. The row above pins the preconditions (the same session
   * is spawned and focused).
   */
  it.each(['Notice reopen', 'Sidebar open'])(
    'I4: should open the session %s spawns with the request focus kept: native kernel build123d and chat-1',
    async (control) => {
      renderHost('/w/ws/alpha?chat=chat-1', <ReopenControls />);
      await flushTasks();
      await act(async () => {
        sessionsActor.send({ type: 'close', projectId: projectA, reason: 'user' });
        await Promise.resolve();
      });
      await flushTasks();

      fireEvent.click(screen.getByRole('button', { name: control }));
      await flushTasks();

      expect(sessionsActor.getSnapshot().context.refs[projectA]?.getSnapshot().context).toMatchObject({
        request: { nativeKernelId: 'build123d', chatId: 'chat-1' },
      });
    },
  );
});

/*
 * A0.7: the route-shell load defects, pinned red until their fix (U1, U2, U22), flipped by A11 (D24, I19).
 *
 * `children` is the app shell (the sidebar and the outlet). The marker counts
 * its own mounts, so a shell that moves between tree positions, or waits under
 * a Suspense fallback, shows as a second mount or as an absent node.
 */
type WorkspaceLoad = ReturnType<typeof ProjectWorkspaceWarmupModule.loadProjectWorkspace>;
const workspaceImport = vi.hoisted((): { pending: WorkspaceLoad | undefined; calls: number } => ({
  pending: undefined,
  calls: 0,
}));
vi.mock('#lib/project-workspace-warmup.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectWorkspaceWarmupModule>();
  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- `use` must receive the promise the row controls.
  const loadProjectWorkspace = (): WorkspaceLoad => {
    if (workspaceImport.pending === undefined) {
      return actual.loadProjectWorkspace();
    }
    workspaceImport.calls += 1;
    return workspaceImport.pending;
  };
  return {
    ...actual,
    loadProjectWorkspace,
    /* A warm while a row controls the import starts that import, so no path reaches the module another way. */
    warmProjectWorkspace: () => {
      if (workspaceImport.pending === undefined) {
        actual.warmProjectWorkspace();
        return;
      }
      void loadProjectWorkspace();
    },
  };
});

describe('project route shell identity (A0.7)', () => {
  const shell = { mounts: 0 };

  function ShellMarker(): React.JSX.Element {
    useEffect(() => {
      shell.mounts += 1;
    }, []);
    return <nav data-testid='app-shell' aria-label='App shell' />;
  }

  function ShellRoute({
    projectId,
    isProjectUrl = projectId !== undefined,
  }: {
    readonly projectId?: string;
    readonly isProjectUrl?: boolean;
  }): React.JSX.Element {
    return (
      <SessionsProvider actor={sessionsActor} focus={focusHost}>
        <CommittedRoute
          projectId={projectId}
          slugs={isProjectUrl ? { workspaceSlug: 'live', projectSlug: projectId ?? 'unknown' } : undefined}
        >
          <ShellMarker />
          <sessionsModule.ProjectChatRoute />
        </CommittedRoute>
      </SessionsProvider>
    );
  }

  /** The shell nodes in the document now. */
  const shellNodes = (): readonly HTMLElement[] => screen.queryAllByTestId('app-shell');

  beforeEach(() => {
    shell.mounts = 0;
    workspaceImport.pending = undefined;
    workspaceImport.calls = 0;
  });

  it('U1: should keep one shell mounted while the workspace import is pending', async () => {
    const workspace = deferred<Awaited<WorkspaceLoad>>();
    workspaceImport.pending = workspace.promise;
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    try {
      render(<ShellRoute projectId={projectA} />);
      await act(async () => {
        await getProjectRouteAccess.mock.results[0]?.value;
      });

      /* Access is ready at once; the workspace import is still outstanding, and it is the one the route asked for. */
      expect(workspaceImport.calls, 'U1: the route asks for the workspace import the row controls').toBeGreaterThan(0);
      expect(shellNodes()).toHaveLength(1);
      expect(shell.mounts).toBe(1);

      await act(async () => {
        workspace.resolve(sessionsModule);
        await workspace.promise;
      });
      await screen.findByTestId('focused-project');
      expect(shellNodes()).toHaveLength(1);
      expect(shell.mounts).toBe(1);
    } finally {
      /* A red run stops before the import settles; settle it so the drain closes a mounted session. */
      await act(async () => {
        workspace.resolve(sessionsModule);
        await workspace.promise;
      });
      workspaceImport.pending = undefined;
    }
  });

  it('U2: should mount the shell once across resolving to editor', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    render(<ShellRoute projectId={projectA} />);
    expect(screen.getByText('Notice: resolving')).toBeInTheDocument();

    await screen.findByTestId('focused-project');
    expect(focusedSessionId()).toBe(projectA);
    expect(shell.mounts).toBe(1);
  });

  it('U2: should mount the shell once across project A to project B', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const view = render(<ShellRoute projectId={projectA} />);
    await screen.findByTestId('focused-project');
    expect(focusedSessionId()).toBe(projectA);
    /* Counted from the shell on screen in A's editor: what U2 measures is the move to B. */
    shell.mounts = 1;

    view.rerender(<ShellRoute projectId={projectB} />);
    await waitFor(() => {
      expect(focusedSessionId()).toBe(projectB);
    });
    expect(shell.mounts).toBe(1);
  });

  it('U22: should mount the shell once across Home to a project', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const view = render(<ShellRoute />);
    expect(shellNodes()).toHaveLength(1);

    view.rerender(<ShellRoute projectId={projectA} />);
    await screen.findByTestId('focused-project');
    expect(focusedSessionId()).toBe(projectA);
    expect(shell.mounts).toBe(1);
  });

  /* A0.7 carry: every row above runs with the worker ready. The app's own tree: the shell beside the gate, the
   * project's content in the outlet under the route's providers. */
  it('A11: should mount the shell once while the file-manager worker connects, then opens the project', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    listing.set([listed(projectA, 'ws', 'alpha')]);
    sharedWorkerState = 'pending';
    const tree = (): React.JSX.Element => (
      <DataBrowserRouter initialEntry='/w/ws/alpha'>
        <SessionsProvider actor={sessionsActor} focus={focusHost}>
          <routeModule.ProjectSessionsHost>
            <ShellMarker />
            {/* A15b2: the shell hosts the workspace frame (`Page`), around the route's providers. */}
            <WorkspaceFrame>
              <Routes>
                <Route
                  path='/w/:workspace/:project'
                  element={
                    <routeModule.ProjectRouteProviders>
                      <sessionsModule.ProjectChatRoute />
                    </routeModule.ProjectRouteProviders>
                  }
                />
              </Routes>
            </WorkspaceFrame>
          </routeModule.ProjectSessionsHost>
        </SessionsProvider>
      </DataBrowserRouter>
    );
    const view = render(tree());
    await flushTasks();
    /* Connecting: the shell is there and the content region holds the workspace frame, with nothing over it. */
    expect(shellNodes()).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="workspace-frame"]')).toHaveLength(1);
    expect(screen.getByTestId('workspace-opening')).toBeInTheDocument();
    expect(screen.queryByTestId('focused-project')).not.toBeInTheDocument();

    sharedWorkerState = 'ready';
    view.rerender(tree());
    await screen.findByTestId('focused-project');
    expect(shellNodes()).toHaveLength(1);
    expect(shell.mounts).toBe(1);
  });
});

/*
 * A11 (programme-control ruling, 2026-11-15): the palette's project items register from the focused project's view
 * into the registry above the shell.
 */
describe('the palette reads the focused project (A11)', () => {
  function PaletteRoute({ projectId }: { readonly projectId?: string }): React.JSX.Element {
    return (
      <SessionsProvider actor={sessionsActor} focus={focusHost}>
        <CommittedRoute projectId={projectId}>
          <sessionsModule.ProjectChatRoute />
        </CommittedRoute>
      </SessionsProvider>
    );
  }

  it("should hold B's project items and none of A's after a move from A to B", async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const view = render(<PaletteRoute projectId={projectA} />);
    await screen.findByTestId('focused-project');
    expect([...palette.entries()]).toEqual([['routes/w.$workspace.$project', projectA]]);

    view.rerender(<PaletteRoute projectId={projectB} />);
    await waitFor(() => {
      expect(focusedViewId()).toBe(projectB);
    });
    await flushTasks();
    expect([...palette.entries()]).toEqual([['routes/w.$workspace.$project', projectB]]);
  });

  it('should hold no project items while the route resolves, as main does', async () => {
    const pending = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async () => pending.promise);
    render(<PaletteRoute projectId={projectA} />);
    expect(screen.getByText('Notice: resolving')).toBeInTheDocument();
    await flushTasks();
    expect(palette.size).toBe(0);
    await act(async () => {
      pending.resolve(ready(projectA));
      await pending.promise;
    });
    await screen.findByTestId('focused-project');
    expect([...palette.entries()]).toEqual([['routes/w.$workspace.$project', projectA]]);
  });
});

describe('round 9: the editor corrects a chat the URL named but could not focus (I18, gate half)', () => {
  beforeEach(() => {
    listing.set([listed(projectA, 'ws', 'alpha')]);
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
  });
  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it("should show the chat the editor fell back to when the URL's chat does not resolve", async () => {
    renderHost('/w/ws/alpha?chat=chat-gone');
    await flushTasks();
    expect(providerRequestsOf(projectA).at(-1)).toMatchObject({ requestedChatId: 'chat-gone' });

    await act(async () => {
      resolveFocusedChat(projectA, 'chat-9');
      await Promise.resolve();
    });
    await flushTasks();

    expect(router.location).toMatchObject({ pathname: '/w/ws/alpha', search: '?chat=chat-9' });
  });
});

describe('round 11: the project a move leaves keeps its own chat', () => {
  beforeEach(() => {
    listing.set([listed(projectA, 'ws', 'alpha'), listed(projectB, 'ws', 'beta')]);
  });

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/');
  });

  it('should keep handing A its own chat while the move to B is resolving', async () => {
    const pendingB = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectB ? pendingB.promise : ready(id)));
    renderHost('/w/ws/alpha?chat=chat-1');
    await flushTasks();
    expect(providerRequestsOf(projectA).at(-1)).toMatchObject({ requestedChatId: 'chat-1' });

    await navigateTo('/w/ws/beta');

    expect(focusedSessionId()).toBe(projectA);
    expect(screen.getByRole('status', { name: 'Opening project' })).toBeInTheDocument();
    expect(providerRequestsOf(projectA).map((request) => request.requestedChatId)).not.toContain(undefined);
    await act(async () => {
      pendingB.resolve(ready(projectB));
      await pendingB.promise;
    });
  });

  it("should not hand the retained A the chat B's URL created", async () => {
    const pendingB = deferred<ProjectRouteAccess>();
    getProjectRouteAccess.mockImplementation(async (id) => (id === projectB ? pendingB.promise : ready(id)));
    renderHost('/w/ws/alpha?chat=chat-1');
    await flushTasks();

    await navigateTo('/w/ws/beta?chat=chat-b-new', { state: { focusChatComposer: true } });

    expect(focusedSessionId()).toBe(projectA);
    expect(providerRequestsOf(projectA).map((request) => request.createdChatId)).toEqual(
      providerRequestsOf(projectA).map(() => undefined),
    );
    await act(async () => {
      pendingB.resolve(ready(projectB));
      await pendingB.promise;
    });
  });
});

describe('round 12: a held answer on the project focus is on', () => {
  it('should stop focusing the live project whose own access answer comes back held', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    await renderAndSettle();
    expect(focusedSessionId()).toBe(projectA);

    getProjectRouteAccess.mockImplementation(async (id) => (id === projectA ? trashed(id) : ready(id)));
    await act(async () => {
      bumpLibraryRevision();
      await Promise.resolve();
    });
    await flushTasks();
    expect(screen.getByText('Notice: trashed')).toBeInTheDocument();
    expect(sessionIds()).toEqual([projectA]);
    /* As on main (`focused` only for a ready answer): the held project's focused providers unmount. */
    expect(focusedSessionId()).toBeUndefined();
  });
});

describe('round 13: a project left for a non-project route', () => {
  it('should stop focusing the project once its leave flush settles and focus is idle', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    const Shell = ({ projectId }: { readonly projectId?: string }): React.JSX.Element => (
      <SessionsProvider actor={sessionsActor} focus={focusHost}>
        <routeModule.ProjectRouteProviders projectId={projectId}>
          <input aria-label='Page input' />
        </routeModule.ProjectRouteProviders>
      </SessionsProvider>
    );
    const view = render(<Shell projectId={projectA} />);
    await screen.findByTestId('focused-session');
    expect(focusedSessionId()).toBe(projectA);
    view.rerender(<Shell />);
    await flushTasks();
    await flushTasks();
    expect(focusHost.focus.getSnapshot().value).toBe('idle');
    expect(sessionIds()).toEqual([projectA]);
    expect(focusedSessionId()).toBeUndefined();
    expect(screen.getByTestId('project-session').closest('[inert]')).toBeNull();
  });
});

describe('round 13: no overlay on the project focus is on', () => {
  it('should show no move overlay and leave the page usable once the project is focused', async () => {
    getProjectRouteAccess.mockImplementation(async (id) => ready(id));
    listing.set([listed(projectA, 'ws', 'alpha')]);
    renderHost('/w/ws/alpha?chat=chat-1');
    await flushTasks();
    await flushTasks();
    expect(focusedSessionId()).toBe(projectA);
    expect(screen.queryByRole('status', { name: 'Opening project' })).not.toBeInTheDocument();
    expect(screen.getByTestId('project-session').closest('[inert]')).toBeNull();
    expect(screen.getByTestId('project-session').closest('[aria-busy="true"]')).toBeNull();
  });
});
