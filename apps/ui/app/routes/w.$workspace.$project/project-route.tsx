import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import { ChatInterface } from '#routes/w.$workspace.$project/chat-interface.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import type { Handle } from '#types/matches.types.js';
import { ProjectChatRunSettlement } from '#routes/w.$workspace.$project/project-chat-run-settlement.js';
import { ProjectWorkspaceProvider } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { ProjectShareRouteIntent } from '#routes/w.$workspace.$project/project-share-action.js';
import { ProjectCommandPaletteItems } from '#routes/w.$workspace.$project/project-command-items.js';
import { HomeFileManagerProvider, SharedWorkerGate, useFileManager } from '#hooks/use-file-manager.js';
import { MonacoModelServiceProvider } from '#hooks/use-monaco-model-service.js';
import { RevisionConflictChat } from '#routes/w.$workspace.$project/revision-conflict-chat.js';
import { RevisionRestore } from '#routes/w.$workspace.$project/revision-restore.js';
import { WorkbenchCheckoutRoot } from '#routes/w.$workspace.$project/workbench-checkout-root.js';
import { RevisionOutcomes } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { ChatWorkspaceAuthorityProvider } from '#providers/chat-workspace-authority-provider.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { RevisionSaveShortcut } from '#routes/w.$workspace.$project/revision-save-shortcut.js';
// Chat persistence + draft flush is handled centrally by `<GlobalChatFlushGuard>`
// (see `apps/ui/app/components/global-chat-flush-guard.tsx`). The project
// route only needs to flush its own project + editor machine state below.
import { WebglContextTrackerProvider } from '#hooks/use-webgl-context-tracker.js';
import { useProjectKernelOptions } from '#hooks/use-project-kernel-options.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFocusedChatReadState } from '#hooks/use-focused-chat-read-state.js';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';
import { Loader } from '#components/ui/loader.js';
import {
  deriveProjectRouteState,
  ProjectRouteStateContext,
  useProjectRouteState,
} from '#routes/w.$workspace.$project/project-route-state.js';
import type { ProjectRouteSlugs } from '#routes/w.$workspace.$project/project-route-state.js';
import { ProjectRouteNotice, ProjectRouteRetryContext } from '#routes/w.$workspace.$project/project-route-notices.js';
import { isKernelAvailable, nativeKernelRequirementForEntryPath } from '#constants/available-kernel-configurations.js';
import { useLiveProjectIds, useProjectSession, useSessions } from '#hooks/use-sessions.js';
import { forgetProjectRegions, registerProjectSessionServices, reportRegionReady } from '#services/sessions-store.js';
import type { ChatSyncState } from '#machines/chat-session.machine.js';
import {
  useRevisionClientLifecycle,
  useRevisionClientStatus,
  useRevisionCommands,
} from '#hooks/use-revision-status.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useCanonicalProjectUrlCorrection, useProjectIdBySlugs } from '#hooks/use-project-slug-route.js';
import { projectChatIdFromSearch, projectUrl } from '#utils/project-url.utils.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { stringParameter } from '#utils/search-parameter.codecs.js';

/* Module scope: the setter is memoised on the codec's identity. */
const cloudOpenParameter = stringParameter();

type ResolvedProjectRouteAccess = {
  readonly projectId: string;
  readonly access: ProjectRouteAccess;
  readonly requestedChatId: string | undefined;
};

type ProjectSessionFlushRegistration = {
  projectId: string;
  flush: () => Promise<void>;
  inFlight?: Promise<void>;
};

type ProjectRouteError = Readonly<{
  /**
   * What failed, not merely where.
   *
   * A rejected access check and a rejected view flush can both belong to the
   * project being navigated to, so the project id cannot tell them apart —
   * and they are two different notices (W1).
   */
  kind: 'access' | 'flush';
  projectId: string;
  loadAttempt: number;
  error: Error;
}>;

const ProjectSessionsHostContext = createContext(false);

const editorFlushTimeoutMilliseconds = 10_000;

/* A retained project has no route flush to register: the route's flush gate is
 * about the project the person is leaving, and the session's own `closing` is
 * what flushes a project that is actually going away (S44). */
const noFlushRegistration = (): void => undefined;

const flushRegisteredSession = async (session: ProjectSessionFlushRegistration): Promise<void> => {
  const pendingFlush = session.inFlight ?? session.flush();
  session.inFlight = pendingFlush;
  try {
    await pendingFlush;
  } finally {
    if (session.inFlight === pendingFlush) {
      session.inFlight = undefined;
    }
  }
};

/**
 * The session's half of a project subtree (S44).
 *
 * The registry decides *whether* a project is live; this reports whether its
 * resources came up, and hands the session the four things `closing` has to do.
 * It is mounted inside the project's providers, which is the only place that
 * can reach them.
 */
function ProjectSessionBinding({
  projectId,
  isFocused,
  shouldOpenFromTauCloud,
}: {
  readonly projectId: string;
  readonly isFocused: boolean;
  readonly shouldOpenFromTauCloud?: boolean;
}): React.JSX.Element {
  const { fileManagerRef } = useFileManager();
  const { projectRef, editorRef } = useProject();
  const client = useRevisionClientLifecycle();
  const { connectRemote } = useRevisionCommands();
  const chatSessions = useChatSessionStore();
  const session = useProjectSession(projectId);
  const viewsReady = useSelector(fileManagerRef, (state) => state.matches('ready'));
  const runtimeReady = useSelector(projectRef, (state) => state.context.project !== undefined);
  const status = useRevisionClientStatus(client);
  /* W7 tier 3: the `cloudOpen` marker is read and cleared by the host, through
   * the router, so React sees the change. This half only acts on it. */
  useEffect(() => {
    if (client === undefined || shouldOpenFromTauCloud !== true) {
      return;
    }
    void connectRemote('tau');
  }, [client, connectRemote, shouldOpenFromTauCloud]);

  useEffect(() => {
    if (viewsReady) {
      reportRegionReady(projectId, 'views');
    }
  }, [projectId, viewsReady]);

  useEffect(() => {
    if (runtimeReady) {
      reportRegionReady(projectId, 'runtime');
    }
  }, [projectId, runtimeReady]);

  /* What a policy close is allowed to touch (I24, I25), from the one place that
   * knows: the project's own revision projection. The *session* owns these
   * facts and tells the registry; the route never reports over its head. */
  useEffect(() => {
    if (status === undefined || session === undefined) {
      return;
    }
    const { sync } = status;
    /* R11: the sync facet is the sync facet. `pending`/`queued`/`failed` are
     * all "this device has something the remote has not acknowledged" — a
     * clean tree with a queued push is NOT synced, which is what deriving this
     * from dirtiness used to claim. */
    const syncState: ChatSyncState =
      sync.state === 'conflicted'
        ? 'conflicted'
        : sync.state === 'pending' || sync.state === 'queued' || sync.state === 'failed'
          ? 'pending'
          : 'synced';
    session.send({
      type: 'revisionState',
      dirty: status.projectDirty,
      pushed: sync.state === 'noRemote' || sync.state === 'backedUp',
      sync: syncState,
      /* R11: the branch the checkout is on gives `revision.line` its producer,
       * so the `⎇ <branch>` chip has data instead of a permanent `onMain`. */
      pendingCount: sync.pendingCount,
      ...(status.branch === undefined ? {} : { branch: status.branch }),
    });
  }, [session, status]);

  useEffect(() => {
    return registerProjectSessionServices(projectId, {
      flushProducers: async () => {
        projectRef.send({ type: 'flushNow' });
        editorRef.send({ type: 'flushNow' });
        await Promise.all([
          waitFor(projectRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
            timeout: editorFlushTimeoutMilliseconds,
          }),
          waitFor(editorRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
            timeout: editorFlushTimeoutMilliseconds,
          }),
        ]);
      },
      /* W13's seam, called: the worker's `release()` takes the close cut and
       * awaits `awaitSyncSettled` before it answers this. */
      flushSync: async () => {
        await client?.quiesce();
      },
      cancelRuns: async (chatIds) => {
        await Promise.all(
          chatIds.map(async (chatId) => {
            const chat = chatSessions.get(chatId);
            if (chat === undefined) {
              throw new Error(`Chat ${chatId} is no longer attached to this project.`);
            }
            chatSessions.stopRun(chatId);
            await waitFor(
              chat.persistenceActorRef,
              (state) => state.matches({ requestLifecycle: 'idle' }) && state.matches({ messagePersistence: 'idle' }),
              { timeout: editorFlushTimeoutMilliseconds },
            );
          }),
        );
      },
      /* The leases go with the root: `release()` retires every one this
       * session's turns took, inside the flush above. Kept as its own step
       * because a host whose leases outlive its tree has one to implement. */
      releaseLeases: async () => undefined,
    });
  }, [chatSessions, client, editorRef, projectId, projectRef]);

  /* Every live project registers its session, not only the focused one (R2):
   * a run that settles after the person navigates away must reach the project
   * that ran it, and W20's sidebar reads a chat machine per live project. */
  useEffect(() => {
    if (session === undefined) {
      return;
    }
    chatSessions.setProjectSession(projectId, session);
    return () => {
      chatSessions.setProjectSession(projectId, undefined);
    };
  }, [chatSessions, projectId, session]);

  useEffect(() => {
    if (session === undefined) {
      return;
    }
    const reportVisibility = (): void => {
      session.send({ type: 'visibilityChanged', visible: isFocused && document.visibilityState === 'visible' });
    };
    reportVisibility();
    document.addEventListener('visibilitychange', reportVisibility);
    return () => {
      document.removeEventListener('visibilitychange', reportVisibility);
    };
  }, [isFocused, session]);

  /* A chat is acquired from inside its own project's route. */
  useEffect(() => {
    if (!isFocused) {
      return;
    }
    chatSessions.setFocusedProject(projectId);
    return () => {
      chatSessions.setFocusedProject(undefined);
    };
  }, [chatSessions, isFocused, projectId]);

  useEffect(
    () => () => {
      forgetProjectRegions(projectId);
    },
    [projectId],
  );

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- Headless component
  return <></>;
}

function ProjectSession({
  children,
  projectId,
  isFocused,
  nativeKernelId,
  requestedChatId,
  createdChatId,
  onFocusedChatResolved,
  onFlushRegistration,
  shouldOpenFromTauCloud,
}: {
  readonly children?: React.ReactNode;
  readonly projectId: string;
  readonly isFocused?: boolean;
  readonly nativeKernelId?: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly onFlushRegistration: (registration: ProjectSessionFlushRegistration | undefined) => void;
  readonly shouldOpenFromTauCloud?: boolean;
}): React.ReactNode {
  const kernelSelection = useProjectKernelOptions({
    projectId,
    nativeKernelId,
  });
  const focused = isFocused === true;
  return (
    <HomeFileManagerProvider projectId={projectId} rootDirectory={`/projects/${projectId}`}>
      <WebglContextTrackerProvider>
        <ProjectProvider
          key={kernelSelection.key}
          projectId={projectId}
          requestedChatId={requestedChatId}
          createdChatId={createdChatId}
          onFocusedChatResolved={onFocusedChatResolved}
          kernelOptionsFactory={kernelSelection.kernelOptionsFactory}
        >
          <ProjectPersistenceGuard projectId={projectId} onFlushRegistration={onFlushRegistration} />
          <ProjectSessionBinding
            projectId={projectId}
            isFocused={focused}
            shouldOpenFromTauCloud={shouldOpenFromTauCloud}
          />
          {focused ? (
            <>
              <RevisionSaveShortcut isFocused={focused} />
              <MonacoModelServiceProvider>
                <ChatWorkspaceAuthorityProvider>
                  <ProjectWorkspaceProvider>
                    <ProjectShareRouteIntent />
                    <RevisionRestore />
                    {/* AC14: *Ask chat to resolve* seeds one chat, bound to the
                        conflict its turn is being started for. */}
                    <RevisionConflictChat />
                    {/* S27: the workbench follows the selected checkout's route. */}
                    <WorkbenchCheckoutRoot />
                    {/* A4: the two outcomes that record no revision are not silent. */}
                    <RevisionOutcomes />
                    {children}
                  </ProjectWorkspaceProvider>
                </ChatWorkspaceAuthorityProvider>
              </MonacoModelServiceProvider>
            </>
          ) : null}
        </ProjectProvider>
      </WebglContextTrackerProvider>
    </HomeFileManagerProvider>
  );
}

type FocusedProjectSession = Readonly<{
  projectId: string;
  requestedChatId: string | undefined;
  createdChatId: string | undefined;
  children: React.ReactNode;
  shouldOpenFromTauCloud?: boolean;
}>;

/** The app-level keyed host for every live project's resource subtree. */
function LiveProjectSessions({
  focused,
  liveProjectIds,
  onFocusedChatResolved,
  onFlushRegistration,
  retainedKernels,
}: {
  readonly focused?: FocusedProjectSession;
  readonly liveProjectIds: readonly string[];
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly onFlushRegistration: (registration: ProjectSessionFlushRegistration | undefined) => void;
  readonly retainedKernels: Readonly<Record<string, string | undefined>>;
}): React.JSX.Element {
  return (
    <>
      {liveProjectIds.map((projectId) => {
        const isFocused = focused?.projectId === projectId;
        return (
          <ProjectSession
            key={projectId}
            projectId={projectId}
            isFocused={isFocused}
            nativeKernelId={retainedKernels[projectId]}
            requestedChatId={isFocused ? focused.requestedChatId : undefined}
            createdChatId={isFocused ? focused.createdChatId : undefined}
            onFocusedChatResolved={isFocused ? onFocusedChatResolved : undefined}
            onFlushRegistration={isFocused ? onFlushRegistration : noFlushRegistration}
            shouldOpenFromTauCloud={isFocused ? focused.shouldOpenFromTauCloud : undefined}
          >
            {isFocused ? focused.children : undefined}
          </ProjectSession>
        );
      })}
    </>
  );
}

export function ProjectRouteGate({
  children,
  onFocusedChatResolved,
  requestedProjectId,
  requestedChatId,
  createdChatId,
  shouldOpenFromTauCloud,
  slugs,
  isResolvingSlugs = false,
}: {
  readonly children?: React.ReactNode;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly requestedProjectId?: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
  readonly shouldOpenFromTauCloud?: boolean;
  /** How the URL addressed this project, for a slug that resolves to nothing. */
  readonly slugs?: ProjectRouteSlugs;
  readonly isResolvingSlugs?: boolean;
}): React.ReactNode {
  const projectManager = useProjectManager();
  const sessions = useSessions();
  const liveProjectIds = useLiveProjectIds();
  const closedReason = useSelector(sessions, (state) =>
    requestedProjectId === undefined ? undefined : state.context.closed[requestedProjectId]?.reason,
  );
  /*
   * Ponytail: bounded by the projects visited in one document, so a smell not
   * a leak; prune it when the sidebar can open a project this route never saw.
   * What a retained project's subtree needs to keep running. Recorded when the
   * project was the requested one; a project can only be opened through a
   * resolved route, so nothing here is ever guessed.
   */
  const [retainedKernels, setRetainedKernels] = useState<Readonly<Record<string, string | undefined>>>({});
  const latestRequestedProjectIdRef = useRef(requestedProjectId);
  const latestRequestedChatIdRef = useRef(requestedChatId);
  const activeSessionFlushRef = useRef<ProjectSessionFlushRegistration | undefined>(undefined);
  const [resolved, setResolved] = useState<ResolvedProjectRouteAccess>();
  const [routeError, setRouteError] = useState<ProjectRouteError>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    latestRequestedProjectIdRef.current = requestedProjectId;
    latestRequestedChatIdRef.current = requestedChatId;
  }, [requestedChatId, requestedProjectId]);
  const registerSessionFlush = useCallback((registration: ProjectSessionFlushRegistration | undefined): void => {
    activeSessionFlushRef.current = registration;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const isCancelled = (): boolean => controller.signal.aborted;
    const loadAccess = async (): Promise<void> => {
      if (requestedProjectId === undefined) {
        try {
          const session = activeSessionFlushRef.current;
          if (session) {
            await flushRegisteredSession(session);
          }
          if (!isCancelled()) {
            setRouteError(undefined);
            setResolved(undefined);
          }
        } catch {
          if (!isCancelled()) {
            setRouteError({
              kind: 'flush',
              projectId: '',
              loadAttempt,
              error: new Error('Tau could not save the current project view. Try again before leaving.'),
            });
          }
        }
        return;
      }
      let access: ProjectRouteAccess;
      try {
        access = await projectManager.getProjectRouteAccess(requestedProjectId);
      } catch {
        if (!isCancelled()) {
          setRouteError({
            kind: 'access',
            projectId: requestedProjectId,
            loadAttempt,
            error: new Error('Tau could not check this project. Try again.'),
          });
        }
        return;
      }
      if (isCancelled()) {
        return;
      }
      try {
        const session = activeSessionFlushRef.current;
        if (session && session.projectId !== requestedProjectId) {
          await flushRegisteredSession(session);
        }
        if (isCancelled()) {
          return;
        }
        setRouteError(undefined);
        if (access.status === 'ready') {
          /* What a retained subtree needs to keep running after the person
           * navigates on: recorded the once, from the resolved route. */
          const requirement = nativeKernelRequirementForEntryPath(access.project.assets.main.entryPath);
          setRetainedKernels((prior) =>
            Object.hasOwn(prior, requestedProjectId)
              ? prior
              : { ...prior, [requestedProjectId]: requirement?.runtimeKernelId },
          );
        }
        setResolved({
          projectId: requestedProjectId,
          access,
          requestedChatId: latestRequestedChatIdRef.current,
        });
      } catch {
        if (!isCancelled()) {
          setRouteError({
            kind: 'flush',
            projectId: requestedProjectId,
            loadAttempt,
            error: new Error('Tau could not save the current project view. Try again before leaving.'),
          });
        }
      }
    };
    // async-iife: bootstrap -- the effect cancellation flag owns this route-access request.
    void loadAccess();
    return () => {
      controller.abort();
    };
    /*
     * `libraryRevision` (W2): trashing or restoring the project on screen must
     * re-resolve access. Without it the route kept a one-shot answer and showed
     * the closed notice for a project that is in the Trash (Finding 2).
     */
  }, [requestedProjectId, projectManager, loadAttempt, projectManager.libraryRevision]);

  /*
   * Liveness is orthogonal to navigation (A35, I22).
   *
   * Arriving at a project opens it if it is closed and touches it otherwise;
   * *leaving* sends nothing at all. The retained subtrees below are what makes
   * that true in the tree as well as in the registry: a project the user
   * navigated away from keeps its file manager, its kernel and its revision
   * port, so a running agent settles and returning is instant.
   */
  useEffect(() => {
    if (
      requestedProjectId === undefined ||
      resolved?.access.status !== 'ready' ||
      resolved.projectId !== requestedProjectId
    ) {
      return;
    }
    sessions.send({ type: 'open', projectId: requestedProjectId });
    sessions.send({ type: 'touch', projectId: requestedProjectId });
  }, [requestedProjectId, resolved, sessions]);

  /* The other half of "navigation and focus only" (R16): coming back to the
   * window is attention, so the idle window measures time since the person was
   * last here rather than time since the last navigation. */
  useEffect(() => {
    if (
      requestedProjectId === undefined ||
      resolved?.access.status !== 'ready' ||
      resolved.projectId !== requestedProjectId
    ) {
      return;
    }
    const touch = (): void => {
      sessions.send({ type: 'touch', projectId: requestedProjectId });
    };
    globalThis.addEventListener('focus', touch);
    return () => {
      globalThis.removeEventListener('focus', touch);
    };
  }, [requestedProjectId, resolved, sessions]);

  /* Memoised because it is a context value: a new identity on every render
   * would re-render every notice below the outlet. */
  const handleRetryLoad = useCallback((): void => {
    setRouteError(undefined);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const pending = resolved !== undefined && resolved.projectId !== requestedProjectId;
  const nativeRequirement =
    resolved?.access.status === 'ready'
      ? nativeKernelRequirementForEntryPath(resolved.access.project.assets.main.entryPath)
      : undefined;

  /*
   * W1/W2: one derived state, published once.
   *
   * This used to be a switch that chose markup, and because `children` is the
   * whole app shell, every terminal branch unmounted the sidebar with it. The
   * shell now renders for every state; the route component below the outlet
   * picks between the editor and a notice.
   */
  const state = deriveProjectRouteState({
    requestedProjectId,
    slugs,
    isResolvingSlugs,
    resolvedProjectId: resolved?.projectId,
    access: resolved?.access,
    error: routeError?.loadAttempt === loadAttempt ? routeError.error : undefined,
    errorKind: routeError?.loadAttempt === loadAttempt ? routeError.kind : undefined,
    errorProjectId: routeError?.loadAttempt === loadAttempt ? routeError.projectId : undefined,
    liveProjectIds,
    closedReason,
    nativeKernelRequirement: nativeRequirement && {
      kernelName: nativeRequirement.configuration.name,
      runtimeKernelId: nativeRequirement.configuration.id,
    },
    isKernelAvailable,
  });

  /*
   * I22/P72 unchanged: the focused project's subtree still hosts the shell when
   * the editor is live, so navigating between projects does not remount it.
   * Every other state renders the same shell as a sibling of the keyed list.
   */
  const isEditor = state?.kind === 'editor';
  /*
   * The destination waits behind the overlay below while the view the person
   * is leaving still owes a flush — but only while there is nothing to say. A
   * failed access check or a failed flush is exactly what they navigated into,
   * so its notice renders rather than spinning forever.
   */
  const isHoldingDestination = pending && (state === undefined || state.kind === 'resolving');
  const focused =
    resolved?.access.status === 'ready'
      ? {
          projectId: resolved.projectId,
          requestedChatId: pending ? resolved.requestedChatId : requestedChatId,
          createdChatId: pending ? undefined : createdChatId,
          children: pending || !isEditor ? undefined : children,
          ...(shouldOpenFromTauCloud === true ? { shouldOpenFromTauCloud: true } : {}),
        }
      : undefined;

  return (
    <SharedWorkerGate>
      <ProjectRouteStateContext.Provider value={state}>
        <ProjectRouteRetryContext.Provider value={handleRetryLoad}>
          <div className='contents' inert={pending || undefined} aria-busy={pending}>
            {/* P72: this keyed resource list stays at one React tree position for
                project, loading, error and non-project routes alike. */}
            <LiveProjectSessions
              focused={focused}
              liveProjectIds={liveProjectIds}
              onFocusedChatResolved={pending ? undefined : onFocusedChatResolved}
              onFlushRegistration={registerSessionFlush}
              retainedKernels={retainedKernels}
            />
            {isEditor || isHoldingDestination ? undefined : children}
          </div>
          {pending ? (
            <div
              className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center'
              role='status'
              aria-label='Opening project'
            >
              <Loader className='size-8' />
            </div>
          ) : null}
        </ProjectRouteRetryContext.Provider>
      </ProjectRouteStateContext.Provider>
    </SharedWorkerGate>
  );
}

/** Mount every live project below the app registry and place route chrome in the focused one. */
export function ProjectSessionsHost({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const match = useMatch({ path: '/w/:workspace/:project', end: true });
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = match?.params.workspace ?? '';
  const project = match?.params.project ?? '';
  const resolution = useProjectIdBySlugs(workspace, project);
  const routePath = match === null ? undefined : location.pathname;
  const resolvedProjectId = resolution.status === 'resolved' ? resolution.value : undefined;
  const [retainedRoute, setRetainedRoute] = useState<Readonly<{ path: string; projectId: string }> | undefined>();
  useEffect(() => {
    if (routePath === undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- Leaving the route invalidates its external-rename cache before a later visit.
      setRetainedRoute(undefined);
    } else if (resolvedProjectId !== undefined) {
      // oxlint-disable-next-line react/set-state-in-effect -- Discovery is the external source; cache its durable id for a same-path rename correction.
      setRetainedRoute((current) =>
        current?.path === routePath && current.projectId === resolvedProjectId
          ? current
          : { path: routePath, projectId: resolvedProjectId },
      );
    }
  }, [resolvedProjectId, routePath]);
  const projectId = resolvedProjectId ?? (retainedRoute?.path === routePath ? retainedRoute?.projectId : undefined);
  const canonicalSlugs = useCanonicalProjectUrlCorrection(projectId);
  const requestedChatId = projectId === undefined ? undefined : projectChatIdFromSearch(location.search);
  const createdChatId = location.state?.focusChatComposer === true ? requestedChatId : undefined;
  /*
   * W7 tier 3: `cloudOpen` is a consume-once marker. It used to be stripped
   * with `history.replaceState` from deep inside the session subtree, which
   * React never saw, so the URL and the render disagreed. Read it through the
   * router and clear it here; the intent is latched because the connection it
   * triggers needs a revision client that does not exist yet at this render.
   */
  const [cloudOpen, setCloudOpen] = useSearchParameter(searchParameterName.cloudOpen, cloudOpenParameter);
  const [hasTauCloudIntent, setHasTauCloudIntent] = useState(false);
  useEffect(() => {
    if (cloudOpen !== 'tau') {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- The URL is the external source; the marker is consumed once and cleared.
    setHasTauCloudIntent(true);
    setCloudOpen(cloudOpenParameter.fallback);
  }, [cloudOpen, setCloudOpen]);
  const shouldOpenFromTauCloud = location.state?.openFromTauCloud === true || hasTauCloudIntent;
  const currentUrl = `${location.pathname}${location.search}`;
  const handleFocusedChatResolved = useCallback(
    (chatId: string) => {
      const parameters = new URLSearchParams(currentUrl.split('?')[1] ?? '');
      parameters.set('chat', chatId);
      const path = projectUrl(canonicalSlugs ?? { workspaceSlug: workspace, projectSlug: project });
      const target = `${path}?${parameters.toString()}`;
      if (currentUrl !== target) {
        void navigate(target, {
          replace: true,
          ...(shouldOpenFromTauCloud ? { state: { openFromTauCloud: true } } : {}),
        });
      }
    },
    [canonicalSlugs, currentUrl, navigate, project, shouldOpenFromTauCloud, workspace],
  );
  /*
   * W2: the shell is no longer swapped out here either. An unresolvable slug is
   * a route *state* the gate publishes, not a replacement for `children`.
   */
  return (
    <ProjectSessionsHostContext.Provider value>
      <ProjectRouteGate
        requestedProjectId={projectId}
        requestedChatId={requestedChatId}
        createdChatId={createdChatId}
        shouldOpenFromTauCloud={shouldOpenFromTauCloud}
        onFocusedChatResolved={handleFocusedChatResolved}
        slugs={match === null ? undefined : { workspaceSlug: workspace, projectSlug: project }}
        isResolvingSlugs={resolution.status === 'resolving'}
      >
        {children}
      </ProjectRouteGate>
    </ProjectSessionsHostContext.Provider>
  );
}

/**
 * The live-project host once its focused `proj_` id is known. The app shell
 * owns this; project routes contribute only their focused content.
 */
export function ProjectRouteProviders({
  children,
  onFocusedChatResolved,
  projectId,
  requestedChatId,
  createdChatId,
  shouldOpenFromTauCloud,
}: {
  readonly children?: React.ReactNode;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly projectId?: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
  readonly shouldOpenFromTauCloud?: boolean;
}): React.ReactNode {
  const appHosted = useContext(ProjectSessionsHostContext);
  if (appHosted) {
    return children;
  }
  return (
    <ProjectRouteGate
      requestedProjectId={projectId}
      requestedChatId={requestedChatId}
      createdChatId={createdChatId}
      shouldOpenFromTauCloud={shouldOpenFromTauCloud}
      onFocusedChatResolved={onFocusedChatResolved}
    >
      {children}
    </ProjectRouteGate>
  );
}

/** Chrome shared by every project route. */
export const projectRouteHandle: Omit<Handle, 'providers'> = {
  commandPalette(match) {
    return <ProjectCommandPaletteItems match={match} />;
  },
  enablePageHeader: false,
};

// Chat component - handles keyboard shortcuts. Terminal-run settlement is
// wired up by `<ProjectChatRunSettlement>` once per chatId from the app-shell
// `ChatSessionStore` (settlement is per-session, not per-route — see
// `apps/ui/app/routes/w.$workspace.$project/project-chat-run-settlement.tsx`).
function Chat(): React.JSX.Element {
  return <ChatInterface />;
}

/**
 * Project route chat composition.
 *
 * - `<ChatInterface>` mounts the stable Chat | Viewer | Workbench shell.
 *   The desktop shell uses `<ChatInterfaceSessionGate>` as the single
 *   `<ActiveChatProvider>` boundary so both the chat history and its
 *   composer share the focused chat. `<ChatHistoryGate>` remains the
 *   focused-chat skeleton/error boundary inside that session.
 * - `<ProjectChatRunSettlement>` reads chat ids from the app-shell
 *   `ChatSessionStore` directly (no `<ActiveChatProvider>` dependency),
 *   so settlement persists across `focusedChatId` changes and across
 *   `ensureFocusedChatActor` retries.
 *
 * Persistence + draft `flushNow` is dispatched centrally by
 * `<GlobalChatFlushGuard>` (mounted in `apps/ui/app/root.tsx`) — every
 * live session in the store is fanned out automatically. Project + editor
 * machine flushing remains route-scoped via `ProjectPersistenceGuard` in the
 * retained project session.
 */
function ChatWithProvider(): React.JSX.Element {
  const { projectRef } = useProject();
  const name = useSelector(projectRef, (state) => state.context.project?.name);
  const description = useSelector(projectRef, (state) => state.context.project?.description);
  useFocusedChatReadState();

  return (
    <>
      {name ? <title>{name}</title> : null}
      {description ? <meta name='description' content={description} /> : null}
      <ProjectChatRunSettlement />
      <Chat />
    </>
  );
}

/**
 * Inner component that wires up the flush-on-close handler.
 * Needs to be a child of ProjectProvider to access project + editor refs.
 */
function ProjectPersistenceGuard({
  projectId,
  onFlushRegistration,
}: {
  readonly projectId: string;
  readonly onFlushRegistration: (registration: ProjectSessionFlushRegistration | undefined) => void;
}): React.JSX.Element {
  const { projectRef, editorRef } = useProject();

  useFlushOnClose(
    async () => {
      projectRef.send({ type: 'flushNow' });
      editorRef.send({ type: 'flushNow' });
      await Promise.all([
        waitFor(projectRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
          timeout: editorFlushTimeoutMilliseconds,
        }),
        waitFor(editorRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
          timeout: editorFlushTimeoutMilliseconds,
        }),
      ]);
    },
    { stage: 'producer' },
  );

  useEffect(() => {
    const registration: ProjectSessionFlushRegistration = {
      projectId,
      async flush() {
        editorRef.send({ type: 'flushNow' });
        await waitFor(editorRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
          timeout: editorFlushTimeoutMilliseconds,
        });
      },
    };
    onFlushRegistration(registration);
    return () => {
      onFlushRegistration(undefined);
    };
  }, [editorRef, onFlushRegistration, projectId]);

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- Headless component
  return <></>;
}

export function ProjectChatRoute(): React.JSX.Element {
  const state = useProjectRouteState();
  /*
   * W2/W3: the editor is the only state with the project's providers above it,
   * so `ChatWithProvider`'s `useProject()` stays inside that branch. Every other
   * state renders its notice in the same shell, with the sidebar intact.
   */
  return state === undefined || state.kind === 'editor' ? <ChatWithProvider /> : <ProjectRouteNotice state={state} />;
}
