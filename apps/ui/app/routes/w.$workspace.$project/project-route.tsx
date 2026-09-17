import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router';
import { useSelector } from '@xstate/react';
import type { Handle } from '#types/matches.types.js';
import { ProjectCommandPaletteItems } from '#routes/w.$workspace.$project/project-command-items.js';
import { SharedWorkerGate } from '#hooks/use-file-manager.js';
// Chat persistence + draft flush is handled centrally by `<GlobalChatFlushGuard>`
// (see `apps/ui/app/components/global-chat-flush-guard.tsx`). The project
// route only needs to flush its own project + editor machine state below.
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';
import { Loader } from '#components/ui/loader.js';
import {
  deriveProjectRouteState,
  ProjectRouteStateContext,
} from '#routes/w.$workspace.$project/project-route-state.js';
import type { ProjectRouteSlugs } from '#routes/w.$workspace.$project/project-route-state.js';
import { ProjectRouteRetryContext } from '#routes/w.$workspace.$project/project-route-notices.js';
import type { ProjectSessionFlushRegistration } from '#routes/w.$workspace.$project/project-live-sessions.js';
import { isKernelAvailable, nativeKernelRequirementForEntryPath } from '#constants/available-kernel-configurations.js';
import { useLiveProjectIds, useSessions } from '#hooks/use-sessions.js';
import { useCanonicalProjectUrlCorrection, useProjectIdBySlugs } from '#hooks/use-project-slug-route.js';
import { projectChatIdFromSearch, projectUrl } from '#utils/project-url.utils.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { searchParameterName } from '#constants/search-parameter.constants.js';
import { stringParameter } from '#utils/search-parameter.codecs.js';

/*
 * D19/W21: the CAD workspace is not in the root layout's module graph. Everything a live project
 * needs — Monaco, three.js, the chat surface — is behind this boundary, which mounts only once a
 * project is live, and is prefetched off the critical path once the shell is idle.
 */
const LiveProjectSessions = lazy(async () => {
  const module = await import('#routes/w.$workspace.$project/project-live-sessions.js');
  return { default: module.LiveProjectSessions };
});

const prefetchLiveProjectSessions = async (): Promise<void> => {
  try {
    await import('#routes/w.$workspace.$project/project-live-sessions.js');
  } catch {
    /* A warm-up, not a load: the `lazy()` above is what actually needs the
     * chunk, and it reports its own failure. Swallowing this one keeps a flaky
     * idle fetch out of the console as an unhandled rejection (9g). */
  }
};

/* Module scope: the setter is memoised on the codec's identity. */
const cloudOpenParameter = stringParameter();

type ResolvedProjectRouteAccess = {
  readonly projectId: string;
  readonly access: ProjectRouteAccess;
  readonly requestedChatId: string | undefined;
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
              : {
                  ...prior,
                  [requestedProjectId]: requirement?.runtimeKernelId,
                },
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
   * I22/P72: the focused project's subtree hosts the shell when the editor is
   * live, because the editor is the only route state that reads the project's
   * providers (`ProjectChatRoute`). It moves between the keyed session and the
   * sibling position below as that changes, so it does remount — but in one
   * commit, never through a frame with no shell at all (Finding 5a).
   *
   * While a destination is pending the person is looking at the `resolving`
   * notice behind the overlay, so the shell renders as a sibling: the project
   * being left must not supply providers to the project being navigated to.
   */
  const isEditor = state?.kind === 'editor';
  const isShellHostedByFocusedSession = isEditor && !pending;
  const focused =
    resolved?.access.status === 'ready'
      ? {
          projectId: resolved.projectId,
          requestedChatId: pending ? resolved.requestedChatId : requestedChatId,
          createdChatId: pending ? undefined : createdChatId,
          children: isShellHostedByFocusedSession ? children : undefined,
          ...(shouldOpenFromTauCloud === true ? { shouldOpenFromTauCloud: true } : {}),
        }
      : undefined;

  return (
    <SharedWorkerGate>
      <ProjectRouteStateContext.Provider value={state}>
        <ProjectRouteRetryContext.Provider value={handleRetryLoad}>
          <div className='contents' inert={pending || undefined} aria-busy={pending}>
            {/* P72: this keyed resource list stays at one React tree position for
                project, loading, error and non-project routes alike. It is absent only while no
                project is live at all, where it would render nothing anyway (W21). */}
            {liveProjectIds.length > 0 ? (
              <Suspense fallback={null}>
                <LiveProjectSessions
                  focused={focused}
                  liveProjectIds={liveProjectIds}
                  onFocusedChatResolved={pending ? undefined : onFocusedChatResolved}
                  onFlushRegistration={registerSessionFlush}
                  retainedKernels={retainedKernels}
                />
              </Suspense>
            ) : null}
            {isShellHostedByFocusedSession ? undefined : children}
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
  /* Opening a project must not pay for the split: fetch the workspace chunk once the shell has
   * nothing better to do, so it is already there when a project goes live. */
  useEffect(() => {
    if (!('requestIdleCallback' in globalThis)) {
      const timer = setTimeout(prefetchLiveProjectSessions, 1000);
      return () => {
        clearTimeout(timer);
      };
    }
    const handle = globalThis.requestIdleCallback(prefetchLiveProjectSessions);
    return () => {
      globalThis.cancelIdleCallback(handle);
    };
  }, []);
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
