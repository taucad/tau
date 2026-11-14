/**
 * A0.7: the open-order load defects, pinned red until their fix (U13, U20, M2).
 *
 * Each row renders the route as the app does — `ProjectRouteGate` with
 * `ProjectChatRoute` below it, over the real live-session subtree — and scripts
 * the session's facts: the registry's liveness, the editor's state and the
 * revision status that model availability reads. The fixes act on the open
 * order, so a row that rendered one pane could never go green: `ChatViewer`
 * keeps its swap (`chat-viewer.tsx`, the `ChatViewer` wrapper). The viewer
 * dock is a stand-in that renders the real `ChatViewer` for one view.
 */
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { mock } from 'vitest-mock-extended';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import type { ViewerNode } from '@taucad/workbench';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectReadiness, RevisionStatusProjection } from '@taucad/revisions';
import type { ProjectRouteAccess } from '#runtime/project-library.js';
import { SessionsProvider } from '#hooks/use-sessions.js';
import { createSessionsActor } from '#services/sessions-store.js';
import type * as AgentHostClientModule from '#services/agent-host-client.js';
import type * as HandleStoreModule from '#filesystem/handle-store.js';
import type * as ProjectWorkspaceContextModule from '#routes/w.$workspace.$project/project-workspace-context.js';
import type * as PartThumbnailProviderModule from '#providers/part-thumbnail-provider.js';
import type * as SidebarStatusModule from '#hooks/use-sidebar-status.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type * as ViewerDockviewModule from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import type * as UnavailableOverlayModule from '#routes/w.$workspace.$project/project-unavailable-overlay.js';
import type { WorkbenchLayoutController } from '#routes/w.$workspace.$project/workbench-layout-controller.js';

/** The registry these rows share, composed as the app's root composes its own (MC-R4). */
const sessionsActor = createSessionsActor().start();

const projectA = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const mainEntryPath = 'main.ts';

// ── Scripted facts ─────────────────────────────────────────────────────────

/** A tiny external store: the scripted fact and the React subscribers that read it. */
const createFact = <T,>(initial: T) => {
  const listeners = new Set<() => void>();
  let value = initial;
  return {
    get: (): T => value,
    set(next: T): void {
      value = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const facts = vi.hoisted(() => ({
  isMobile: false,
  /* The phone rows mount the real viewer dock and unavailable overlay; the others mount a one-panel stand-in. */
  isRealViewerBox: false,
  /* The viewer content's own lifecycle, read from its file hook: one mount per mounted content. */
  viewer: { mounts: 0, removals: 0 },
}));

/** What the revision client has published: `undefined` until its first projection. */
const revisionStatus = createFact<RevisionStatusProjection | undefined>(undefined);

/** The shared harness's clean local checkout; the fact the rows move is its readiness (D10). */
const statusAt = (readiness: ProjectReadiness): RevisionStatusProjection => ({
  ...revisionStatusHarness.status,
  projectId: projectA,
  readiness,
});

type EditorStateValue = string | { readonly [state: string]: EditorStateValue };

/** Whether `value` is in `pattern`, as XState matches a state value. */
const matchesStateValue = (value: EditorStateValue, pattern: EditorStateValue): boolean => {
  if (typeof pattern === 'string') {
    return typeof value === 'string' ? value === pattern : Object.hasOwn(value, pattern);
  }
  if (typeof value === 'string') {
    return false;
  }
  return Object.entries(pattern).every(([key, child]) => {
    const region = value[key];
    return region !== undefined && matchesStateValue(region, child);
  });
};

const editorReady = { ready: { operation: 'idle', storing: 'idle' } } as const;
const editorEnsuring = { ready: { operation: 'ensuringFocusedChat', storing: 'idle' } } as const;

const editorFact = createFact<{ value: EditorStateValue; focusedChatId: string | undefined }>({
  value: editorReady,
  focusedChatId: 'chat-1',
});

const desktopLayout = {
  chatOpen: true,
  workbenchOpen: false,
  chatWidth: 320,
  workbenchWidth: 420,
  compactAuxiliary: 'chat',
};

const editorSnapshot = () => {
  const { value, focusedChatId } = editorFact.get();
  return {
    status: 'active',
    value,
    matches: (pattern: EditorStateValue) => matchesStateValue(value, pattern),
    context: { focusedChatId, focusedChatError: undefined, error: undefined, panelState: { desktopLayout } },
  };
};
/* One snapshot per published fact, so `useSelector` sees a stable value between publications. */
let editorSnapshotValue = editorSnapshot();
editorFact.subscribe(() => {
  editorSnapshotValue = editorSnapshot();
});
const editorRef = {
  send: vi.fn(),
  getSnapshot: () => editorSnapshotValue,
  subscribe: (observer: { next?: (snapshot: unknown) => void } | ((snapshot: unknown) => void)) => {
    const unsubscribe = editorFact.subscribe(() => {
      const next = typeof observer === 'function' ? observer : observer.next;
      next?.(editorSnapshotValue);
    });
    return { unsubscribe };
  },
};

const routeProject = createProjectFixture({
  id: projectA,
  name: projectA,
  description: '',
  tags: [],
  assets: { main: { entryPath: mainEntryPath } },
});
const projectSnapshot = {
  context: { project: routeProject, viewGraphics: new Map(), error: undefined },
  matches: (state: unknown) => state !== 'runtimeCloseFailed' && state !== 'error',
};
const projectRef = {
  send: vi.fn(),
  on: () => ({ unsubscribe: () => undefined }),
  getSnapshot: () => projectSnapshot,
  subscribe: () => ({ unsubscribe: () => undefined }),
};
const projectValue = {
  projectId: projectA,
  projectRef,
  editorRef,
  parameterService: { close: async () => undefined, subscribeUnsavedDrafts: () => () => undefined },
  viewGraphics: projectSnapshot.context.viewGraphics,
  viewRecords: new Map(),
  entriesRecord: undefined,
  geometryUnits: new Map(),
  mainEntryPath,
  setViewEntryPath: () => undefined,
  flushWorkbenchRecordProducers: async () => undefined,
};

/**
 * The layout record as the record host serves it (`workbench-record-host.tsx`, `registerViewer`): a viewer that
 * registers after the record was read is applied at once. The phone rows read it before the route mounts.
 */
const mainViewer: ViewerNode = { kind: 'group', tabs: [{ kind: 'view', view: 'view-main' }] };
const layoutRecord: { viewer: ViewerNode | undefined } = { viewer: undefined };
const layoutController: WorkbenchLayoutController = {
  snapshot: () => undefined,
  subscribe: () => () => undefined,
  restorePreviousArrangement: async () => false,
  registerViewer(apply) {
    if (layoutRecord.viewer) {
      apply(layoutRecord.viewer, () => undefined);
    }
    return () => undefined;
  },
  registerWorkbench: () => () => undefined,
  personViewerChanged: () => undefined,
  personWorkbenchChanged: () => undefined,
  ready: () => layoutRecord.viewer !== undefined,
};

const getProjectRouteAccess = vi.fn<(projectId: string) => Promise<ProjectRouteAccess>>();
const projectManager = { getProjectRouteAccess, restoreProject: vi.fn(), libraryRevision: 0 };

const fileManagerRef = {
  getSnapshot: () => ({
    context: { rootDirectory: '/projects/live', openFileSystemBridge: vi.fn(), openRevisionSessionPort: vi.fn() },
    matches: (state: string) => state === 'ready',
  }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};

const chatSessionStore = {
  get: () => undefined,
  setProjectSession: () => undefined,
  setRevisionFacts: () => undefined,
  setFocusedProject: () => undefined,
  publishProjectHostConnector: () => () => undefined,
  getChatHostSettings: async () => undefined,
  cancelProjectedRun: async () => 'stopped',
};

// ── Session subtree: the route suite's doubles ─────────────────────────────

vi.mock('#services/agent-host-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof AgentHostClientModule>()),
  noteBrowserRunRated: async () => undefined,
  createBrowserAgentHostClient: () => ({ close: async () => undefined }),
  retainBrowserAgentHostProject: () => () => undefined,
  createAgentHostClient: () => ({ close: async () => undefined }),
  readBrowserRunStoppability: async () => 'stoppable',
}));
vi.mock('@taucad/chat-ui/services/daemon-agent-host-client', () => ({
  createDaemonAgentHostTransport: (dial: unknown) => ({ dial }),
}));
vi.mock('#filesystem/handle-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof HandleStoreModule>()),
  getProjectFileSystemConfig: async (projectId: string) => ({
    projectId,
    backend: 'opfs',
    providerBasePath: projectId,
  }),
}));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => 'authed' }));
vi.mock('#cloud/commercial-features.js', () => ({
  useCommercialFeatures: () => ({ isResolved: true, canSyncFiles: true }),
}));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => projectManager }));
vi.mock('#hooks/use-file-manager.js', () => ({
  SharedWorkerGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SessionFileManagerProvider: ({ children, projectId }: React.PropsWithChildren<{ projectId: string }>) => (
    <div data-testid='project-session' data-project-id={projectId}>
      {children}
    </div>
  ),
  useFileManager: () => ({
    fileManagerRef,
    workspace: { syncProjectRoots: async () => undefined },
    unavailableReason: undefined,
  }),
  useOptionalFileManager: () => undefined,
}));
vi.mock('#hooks/use-project.js', () => ({
  ProjectProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  useProject: () => projectValue,
}));
vi.mock('#hooks/use-publish-cloud-project-preview.js', () => ({
  usePublishCloudProjectPreview: () => () => undefined,
}));
vi.mock('./workbench-record-host.js', () => ({ WorkbenchRecordHost: () => null }));
vi.mock('./view-settings-sync-host.js', () => ({ ViewSettingsSyncHost: () => null }));
vi.mock('./entries-sync-host.js', () => ({ EntriesSyncHost: () => null }));
vi.mock('#hooks/use-flush-on-close.js', () => {
  const flushProducers = async (): Promise<void> => undefined;
  return { useFlushOnClose: () => undefined, useFlushProducers: () => flushProducers };
});
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));
/* Model availability reads the revision status; the rows publish it. */
vi.mock('#hooks/use-revision-status.js', () => {
  const useStatus = (): RevisionStatusProjection | undefined =>
    useSyncExternalStore(revisionStatus.subscribe, revisionStatus.get, revisionStatus.get);
  const revisionClient = {
    subscribeEvents: () => () => undefined,
    quiesce: async () => undefined,
    send: () => undefined,
  };
  return {
    useRevisionClient: () => undefined,
    useRevisionClientLifecycle: () => revisionClient,
    useRevisionClientStatus: useStatus,
    useRevisionStatus: useStatus,
    useProjectRole: () => 'owner',
    useRevisionCommands: () => ({ connectRemote: async () => undefined, syncNow: () => undefined }),
  };
});
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => chatSessionStore }));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    defaultExecution: { kind: 'tau', model: 'fixture-model' },
    resolveModel: (id: string) => ({ id, name: id, isResolved: false, provider: { id: 'unknown', name: 'Unknown' } }),
  }),
}));
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
vi.mock('#routes/w.$workspace.$project/project-command-items.js', () => ({ ProjectCommandPaletteItems: () => null }));
vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({ ProjectExportAction: () => null }));
vi.mock('#routes/w.$workspace.$project/project-print-route-intent.js', () => ({ ProjectPrintRouteIntent: () => null }));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({
  ProjectShareRouteIntent: () => null,
  ProjectShareWorkbenchPanel: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectWorkspaceContextModule>()),
  ProjectWorkspaceProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  useProjectWorkspace: () => ({ setChatOpen: () => undefined, setWorkbenchOpen: () => undefined, layoutController }),
}));
vi.mock('#routes/w.$workspace.$project/revision-conflict-chat.js', () => ({ RevisionConflictChat: () => null }));
vi.mock('#hooks/use-focused-chat-read-state.js', () => ({ useFocusedChatReadState: () => undefined }));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  ChatWorkspaceAuthorityProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  readRootedBridgeCapabilities: async () => ({ writable: true, durability: 'exclusive-append' }),
}));
vi.mock('#routes/w.$workspace.$project/project-route-notices.js', async () => {
  const { ProjectRouteRetryContext } = await import('#routes/w.$workspace.$project/project-route-state.js');
  return {
    ProjectRouteRetryContext,
    ProjectRouteNotice: ({ state }: { readonly state: { kind: string } }) => <p>Notice: {state.kind}</p>,
  };
});

// ── The editor layout, real down to the viewer ─────────────────────────────

vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => facts.isMobile }));
vi.mock('#providers/part-thumbnail-provider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PartThumbnailProviderModule>()),
  PartThumbnailProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#components/geometry/cad/part-gallery.js', () => ({
  PartGalleryProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#components/tour/tour-host.js', () => ({
  TourHost: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#components/layout/command-palette.js', () => ({ useCommandPaletteItems: () => undefined }));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({
  WorkspaceSkeleton: () => <div data-testid='workspace-skeleton' />,
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  ActiveChatProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#chat-clients/chat-turn-host.js', () => ({ ChatTurnHost: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-history.js', () => ({
  ChatHistory: () => <div data-testid='chat-lane' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-workbench-dockview.js', () => ({
  WorkbenchDockview: () => <div data-testid='workbench-lane' />,
  getWorkbenchTabIcon: () => undefined,
}));
vi.mock('#routes/w.$workspace.$project/workbench-toggle.js', () => ({ WorkbenchToggle: () => null }));
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', async (importOriginal) => {
  const actual = await importOriginal<typeof UnavailableOverlayModule>();
  return {
    ...actual,
    ProjectUnavailableOverlay: (props: React.ComponentProps<typeof actual.ProjectUnavailableOverlay>) =>
      facts.isRealViewerBox ? <actual.ProjectUnavailableOverlay {...props} /> : null,
  };
});
/* Both layouts put the banner in the viewer box, beside the dock and the overlay: its slot names the box. */
vi.mock('#routes/w.$workspace.$project/project-manifest-issue-banner.js', () => ({
  ProjectManifestIssueBanner: () => <span hidden data-testid='viewer-box-slot' />,
}));
/* The dock's header actions; the phone hides the header, and their revision facts have their own suites. */
vi.mock('#routes/w.$workspace.$project/project-workspace-actions.js', () => ({ ProjectWorkspaceActions: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-lane-toggle.js', () => ({ ViewerChatLaneToggle: () => null }));
vi.mock('#components/ui/sidebar.js', () => ({ useSidebar: () => ({ open: true }) }));
vi.mock('@taucad/chat-ui/components/chat-context-insertion', () => ({
  ChatContextInsertionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('allotment', () => {
  const Pane = ({ children }: React.PropsWithChildren) => <div data-pane>{children}</div>;
  const Allotment = Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, { Pane });
  return { Allotment, LayoutPriority: { Low: 0, High: 1 } };
});
/* The dock stands in for Dockview's one viewer panel, whose content is the real `ChatViewer`; the phone rows mount the real dock. */
vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ViewerDockviewModule>();
  const { ChatViewer } = await import('#routes/w.$workspace.$project/chat-viewer.js');
  const panelApi = mock<React.ComponentProps<typeof ChatViewer>['panelApi']>();
  return {
    ...actual,
    ViewerDockview: (props: React.ComponentProps<typeof actual.ViewerDockview>) =>
      facts.isRealViewerBox ? (
        <actual.ViewerDockview {...props} />
      ) : (
        <div data-testid='viewer-dock'>
          <ChatViewer viewId='view-main' entryPath={mainEntryPath} panelApi={panelApi} profile='editor' />
        </div>
      ),
  };
});
vi.mock('#workbench-records/view-actions.js', () => ({
  useWorkbenchViewCommands: () => ({ edit: async () => true, remove: async () => true }),
}));
vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeSelector: <T,>(selector: (tree: ReadonlyMap<string, unknown>) => T) => selector(new Map()),
  useFileTreeMap: () => new Map(),
}));
/* The viewer content's file read: its effect is the viewer marker's mount and removal. */
vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: () => {
    useEffect(() => {
      facts.viewer.mounts += 1;
      return () => {
        facts.viewer.removals += 1;
      };
    }, []);
    return { kind: 'loading' };
  },
}));
/* The phone layout's sheet state, as `chat-interface-mobile.test.tsx` drives it: the chat surface is open. */
vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
  useChatInterfaceState: () => ({
    activeTab: 'chat',
    handleTabChange: () => undefined,
    drawerOpen: true,
    handleDrawerChange: () => undefined,
    snapPoints: [0.5, 1],
    activeSnapPoint: 0.5,
    handleSnapChange: () => undefined,
  }),
}));
vi.mock('#hooks/use-sidebar-status.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SidebarStatusModule>()),
  useProjectSidebarRow: () => ({ attention: 0, conflicted: false, settings: 0, failed: 0 }),
}));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));
vi.mock('#routes/w.$workspace.$project/mobile-project-top-bar.js', () => ({ MobileProjectTopBar: () => null }));

const routeModule = await import('./project-route.js');
const sessionsModule = await import('./project-live-sessions.js');
const { startFocusHost } = await import('#runtime/app-runtime-focus.fixture.js');

/* Focus and its ports over the registry, as the runtime root composes them (A5b). One host per row, so a focus a row
 * left on a project never answers the next row's request. */
const startRowFocus = () =>
  startFocusHost({
    sessions: sessionsActor,
    library: {
      routeAccess: async (projectId) => getProjectRouteAccess(projectId),
      epoch: () => projectManager.libraryRevision,
      onEpochChanged: () => () => undefined,
    },
    loadModule: async () => undefined,
  });
let focusHost = startRowFocus();
/* Both layouts are lazy chunks; load them before a row runs so a fake clock never waits on a module read. */
await import('./chat-interface-desktop.js');
await import('./chat-interface-mobile.js');

const OpenRoute = (): React.JSX.Element => (
  <MemoryRouter>
    <KeyboardProvider>
      <TooltipProvider>
        <SessionsProvider actor={sessionsActor} focus={focusHost}>
          <routeModule.ProjectRouteProviders projectId={projectA}>
            <sessionsModule.ProjectChatRoute />
          </routeModule.ProjectRouteProviders>
        </SessionsProvider>
      </TooltipProvider>
    </KeyboardProvider>
  </MemoryRouter>
);

/** Whether project A's session has reported live. */
const isSessionLive = (): boolean =>
  sessionsActor.getSnapshot().context.refs[projectA]?.getSnapshot().matches('live') === true;

/**
 * Let the route, the registry and the lazy layout settle under the fake clock: rounds of tasks until the document
 * stops changing, so a fix that adds asynchronous hops reaches the row's own assertion.
 */
const settle = async (): Promise<void> => {
  const quietRounds = 3;
  const maxRounds = 200;
  let previous = document.body.innerHTML;
  let quiet = 0;
  for (let round = 0; round < maxRounds; round++) {
    // oxlint-disable-next-line no-await-in-loop -- each round lets one round of tasks and commits land, in order
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const current = document.body.innerHTML;
    quiet = current === previous ? quiet + 1 : 0;
    previous = current;
    if (quiet >= quietRounds) {
      return;
    }
  }
  throw new Error(`settle: the document was still changing after ${maxRounds} rounds of tasks`);
};

/** The box a layout gives the viewer: the element that holds the viewer-box slot as a child. */
const isViewerBox = (element: Element): boolean =>
  [...element.children].some((child) => child.matches('[data-testid="viewer-box-slot"]'));

/** Whether `element`, or an ancestor along its own parent chain, is a viewer box. */
const climbsIntoViewerBox = (element: Element): { readonly isIn: boolean; readonly top: Element | undefined } => {
  let top: Element | undefined;
  for (let current: Element | undefined = element; current; current = current.parentElement ?? undefined) {
    if (isViewerBox(current)) {
      return { isIn: true, top: current };
    }
    top = current;
  }
  return { isIn: false, top };
};

/**
 * Whether a node a commit added or removed sat in a viewer box, read from its own position. A node still attached
 * climbs its own ancestors. A detached one climbs what is left of its subtree and, where that ends at the record's own
 * added or removed root, the parent the root was added to or removed from.
 */
const isInViewerBoxAt = (match: Element, record: MutationRecord): boolean => {
  const own = climbsIntoViewerBox(match);
  if (own.isIn || match.isConnected) {
    return own.isIn;
  }
  const roots = [...record.addedNodes, ...record.removedNodes];
  const isRecordRoot = own.top !== undefined && roots.includes(own.top);
  return isRecordRoot && record.target instanceof Element && climbsIntoViewerBox(record.target).isIn;
};

/**
 * Every node matching `selector` that any commit put in the document, recorded as it lands, including one a later
 * commit in the same task removed again: a removal is recorded too, since the observer starts before the render.
 *
 * @param selector - The nodes to record.
 * @param where - Which added nodes count, by their own position; every one by default.
 * @returns `read` (drains pending records first) and `stop`.
 */
const recordAdditions = (
  selector: string,
  where: (match: Element, record: MutationRecord) => boolean = () => true,
): { readonly read: () => readonly Element[]; readonly stop: () => void } => {
  const added = new Set<Element>();
  const collect = (records: readonly MutationRecord[]): void => {
    for (const record of records) {
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (node instanceof Element) {
          const matches = [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)];
          for (const match of matches.filter((candidate) => where(candidate, record))) {
            added.add(match);
          }
        }
      }
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(document.body, { childList: true, subtree: true });
  return {
    read: () => {
      collect(observer.takeRecords());
      return [...added];
    },
    stop: () => {
      observer.disconnect();
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  focusHost = startRowFocus();
  facts.isMobile = false;
  facts.isRealViewerBox = false;
  layoutRecord.viewer = undefined;
  facts.viewer.mounts = 0;
  facts.viewer.removals = 0;
  revisionStatus.set(undefined);
  editorFact.set({ value: editorReady, focusedChatId: 'chat-1' });
  getProjectRouteAccess.mockReset();
  getProjectRouteAccess.mockImplementation(async (id) => ({
    status: 'ready',
    project: createProjectFixture({
      id,
      name: id,
      description: '',
      tags: [],
      assets: { main: { entryPath: mainEntryPath } },
    }),
  }));
});

afterEach(async () => {
  vi.useRealTimers();
  focusHost.stop();
  /* The registry is one app singleton: close what a row left live, as the route suite does. */
  await act(async () => {
    for (const projectId of Object.keys(sessionsActor.getSnapshot().context.refs)) {
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
  expect(Object.keys(sessionsActor.getSnapshot().context.refs)).toEqual([]);
});

describe('project open order (A0.7)', () => {
  it.fails('U13: should mount the viewer once and never remove it when the files check follows live', async () => {
    render(<OpenRoute />);
    await settle();
    expect(isSessionLive()).toBe(true);

    /* The revision client's first projection: the fill has not answered for this tree yet. */
    await act(async () => {
      revisionStatus.set(statusAt('materialized'));
    });
    await settle();
    expect(
      facts.viewer.mounts - facts.viewer.removals,
      'U13: no viewer content is mounted while the first files check is outstanding',
    ).toBe(0);
    const waitedInResolving = screen.queryByText('Notice: resolving') !== null;
    await act(async () => {
      revisionStatus.set(statusAt('filled'));
    });
    await settle();

    expect(screen.getByTestId('viewer-dock')).toBeInTheDocument();
    expect(facts.viewer).toEqual({ mounts: 1, removals: 0 });
    expect(waitedInResolving, 'U13: the route waited in resolving while the first files check was outstanding').toBe(
      true,
    );
  });

  it.fails('U20: should never render "Preparing model" when local files settle 200 ms after live', async () => {
    const preparing = recordAdditions('[role="region"][aria-label="Preparing model"]');
    /* Local files: no Tau Cloud open is owed, and the fill's word on this tree is still out. */
    revisionStatus.set(statusAt('materialized'));
    const session = createFact(false);
    const unsubscribe = sessionsActor.subscribe(() => {
      if (!session.get() && isSessionLive()) {
        session.set(true);
        globalThis.setTimeout(() => {
          revisionStatus.set(statusAt('filled'));
        }, 200);
      }
    });
    try {
      render(<OpenRoute />);
      await settle();
      expect(session.get()).toBe(true);
      expect(
        facts.viewer.mounts - facts.viewer.removals,
        'U20: no viewer content is mounted while the first files check is outstanding',
      ).toBe(0);
      const waitedInResolving = screen.queryByText('Notice: resolving') !== null;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      await settle();

      expect(screen.getByTestId('viewer-dock')).toBeInTheDocument();
      expect(preparing.read().map((node) => node.getAttribute('aria-label'))).toEqual([]);
      expect(waitedInResolving, 'U20: the route waited in resolving while the first files check was outstanding').toBe(
        true,
      );
    } finally {
      unsubscribe.unsubscribe();
      preparing.stop();
    }
  });
});

describe('phone viewer box while the focused chat is ensured (A0.7)', () => {
  const emptyState = '[data-slot="panel-empty-state"]';

  /** Render the phone route over the real viewer dock and overlay, with the layout record already read. */
  const openOnPhone = async (editor: EditorStateValue): Promise<readonly Element[]> => {
    facts.isMobile = true;
    facts.isRealViewerBox = true;
    layoutRecord.viewer = mainViewer;
    // Files are already filled, so availability does not hold the open and the row isolates the chat-session fact.
    revisionStatus.set(statusAt('filled'));
    editorFact.set({ value: editor, focusedChatId: 'chat-1' });
    const emptyStates = recordAdditions(emptyState, isInViewerBoxAt);
    try {
      render(<OpenRoute />);
      await settle();
      return [...emptyStates.read()];
    } finally {
      emptyStates.stop();
    }
  };

  const viewerBoxes = (): readonly Element[] =>
    [...document.querySelectorAll('[data-testid="viewer-box-slot"]')].flatMap((slot) =>
      slot.parentElement ? [slot.parentElement] : [],
    );

  it('should record an empty state inserted with its viewer box and removed in the same task, and none outside it', async () => {
    function TransientBox(): React.JSX.Element {
      const [isShown, setIsShown] = useState(true);
      useLayoutEffect(() => {
        setIsShown(false);
      }, []);
      return (
        <div>
          <span hidden data-testid='viewer-box-slot' />
          {isShown ? <div data-slot='panel-empty-state' /> : null}
        </div>
      );
    }
    const emptyStates = recordAdditions(emptyState, isInViewerBoxAt);
    try {
      render(
        <>
          <TransientBox />
          <div data-slot='panel-empty-state' />
        </>,
      );
      expect(document.querySelectorAll(emptyState)).toHaveLength(1);
      expect(emptyStates.read()).toHaveLength(1);
    } finally {
      emptyStates.stop();
    }
  });

  it('M2: should render no empty-state panel in the phone viewer box while the focused chat is ensured', async () => {
    const added = await openOnPhone(editorEnsuring);

    /* Today the layout mounts while the chat is ensured and its pane waits below the viewer; once the open waits for
     * the chat, nothing of the layout mounts until it is ready. Either way, no viewer box shows an empty state. */
    const boxes = viewerBoxes();
    expect(boxes.length === 0 || screen.queryByTestId('chat-pane-skeleton-ensuring') !== null).toBe(true);
    expect(boxes.filter((box) => box.querySelector(emptyState) !== null)).toEqual([]);
    expect(added.map((node) => node.textContent)).toEqual([]);
  });
});
