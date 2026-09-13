import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import { toast } from 'sonner';
import { ChatInterface } from '#routes/w.$workspace.$project/chat-interface.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import type { Handle } from '#types/matches.types.js';
import { ProjectChatRunSettlement } from '#routes/w.$workspace.$project/project-chat-run-settlement.js';
import { ProjectWorkspaceProvider } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { ProjectShareRouteIntent } from '#routes/w.$workspace.$project/project-share-action.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
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
import { Button } from '@taucad/ui/components/button';
import { ProjectNotFound } from '#routes/w.$workspace.$project/project-not-found.js';
import { ProjectLoadError } from '#routes/w.$workspace.$project/project-load-error.js';
import { isKernelAvailable, nativeKernelRequirementForEntryPath } from '#constants/available-kernel-configurations.js';
import { useLiveProjectIds, useProjectSession, useSessions } from '#hooks/use-sessions.js';
import { forgetProjectRegions, registerProjectSessionServices, reportRegionReady } from '#services/sessions-store.js';
import { useRevisionClient } from '#hooks/use-revision-status.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';

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
  projectId: string;
  error: Error;
}>;

const editorFlushTimeoutMilliseconds = 10_000;

/* A retained project has no route flush to register: the route's flush gate is
 * about the project the person is leaving, and the session's own `closing` is
 * what flushes a project that is actually going away (S44). */
const noFlushRegistration = (): void => undefined;

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
}: {
  readonly projectId: string;
  readonly isFocused: boolean;
}): React.JSX.Element {
  const { fileManagerRef } = useFileManager();
  const { projectRef } = useProject();
  const client = useRevisionClient();
  const chatSessions = useChatSessionStore();
  const session = useProjectSession(projectId);
  const viewsReady = useSelector(fileManagerRef, (state) => state.matches('ready'));
  const runtimeReady = useSelector(projectRef, (state) => state.context.project !== undefined);
  const sync = useSelector(
    useSessions(),
    () => client?.status()?.sync,
    (left, right) => left?.state === right?.state && left?.pendingCount === right?.pendingCount,
  );

  useEffect(() => {
    if (viewsReady) {
      reportRegionReady(projectId, 'views');
    }
  }, [projectId, viewsReady]);

  useEffect(() => {
    if (runtimeReady) {
      reportRegionReady(projectId, 'runtime');
      /*
       * Ponytail: the browser agent host still registers per request.
       * The session owns the attachment's *lifetime* today — it dies with the
       * project — but `agent-host-client.ts`'s 10 s `initializationTimeout` is
       * still the route's race. Upgrade path: a session-owned registration
       * child, reported here instead of assumed.
       */
      reportRegionReady(projectId, 'agentHost');
    }
  }, [projectId, runtimeReady]);

  /* What a policy close is allowed to touch (I24, I25), from the one place that
   * knows: the project's own revision projection. The *session* owns these
   * facts and tells the registry; the route never reports over its head. */
  useEffect(() => {
    const status = client?.status();
    if (status === undefined || session === undefined) {
      return;
    }
    session.send({
      type: 'revisionState',
      dirty: status.dirty,
      pushed: status.sync.state === 'noRemote' || status.sync.state === 'backedUp',
      sync: status.sync.state === 'conflicted' ? 'conflicted' : status.dirty ? 'pending' : 'synced',
    });
  }, [client, session, sync]);

  useEffect(() => {
    return registerProjectSessionServices(projectId, {
      /*
       * P34: a thin wait on `sync.machine`'s facet leaving `checking`. The three
       * exits are the machine's; this only stops waiting when it has answered.
       */
      awaitPull: async () => {
        if (client?.status()?.sync.state !== 'checking') {
          return;
        }
        await new Promise<void>((resolve) => {
          const unsubscribe = client.subscribe(() => {
            if (client.status()?.sync.state !== 'checking') {
              unsubscribe();
              resolve();
            }
          });
        });
      },
      /* W13's seam, called: the worker's `release()` takes the close cut and
       * awaits `awaitSyncSettled` before it answers this. */
      flushSync: async () => {
        await client?.quiesce();
      },
      cancelRuns: async (chatIds) => {
        await Promise.allSettled(chatIds.map(async (chatId) => chatSessions.get(chatId)?.chat.stop()));
      },
      /* The leases go with the root: `release()` retires every one this
       * session's turns took, inside the flush above. Kept as its own step
       * because a host whose leases outlive its tree has one to implement. */
      releaseLeases: async () => undefined,
    });
  }, [chatSessions, client, projectId]);

  /* The chat machines belong to the session of the project the person is in
   * (I23). A retained project keeps its own agents running; it does not own
   * the chat store, which follows the route. */
  useEffect(() => {
    if (!isFocused || session === undefined) {
      return;
    }
    chatSessions.setProjectSession(session);
    return () => {
      chatSessions.setProjectSession(undefined);
    };
  }, [chatSessions, isFocused, session]);

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
}: {
  readonly children?: React.ReactNode;
  readonly projectId: string;
  readonly isFocused?: boolean;
  readonly nativeKernelId?: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly onFlushRegistration: (registration: ProjectSessionFlushRegistration | undefined) => void;
}): React.ReactNode {
  const kernelSelection = useProjectKernelOptions({
    projectId,
    nativeKernelId,
  });
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
          <ProjectSessionBinding projectId={projectId} isFocused={isFocused === true} />
          <RevisionSaveShortcut />
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
        </ProjectProvider>
      </WebglContextTrackerProvider>
    </HomeFileManagerProvider>
  );
}

export function ProjectRouteGate({
  children,
  onFocusedChatResolved,
  requestedProjectId,
  requestedChatId,
  createdChatId,
}: {
  readonly children?: React.ReactNode;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly requestedProjectId: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
}): React.ReactNode {
  const projectManager = useProjectManager();
  const sessions = useSessions();
  const liveProjectIds = useLiveProjectIds();
  /* What a retained project's subtree needs to keep running. Recorded when the
   * project was the requested one; a project can only be opened through a
   * resolved route, so nothing here is ever guessed. */
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
      let access: ProjectRouteAccess;
      try {
        access = await projectManager.getProjectRouteAccess(requestedProjectId);
      } catch {
        if (!isCancelled()) {
          setRouteError({
            projectId: requestedProjectId,
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
          const pendingFlush = session.inFlight ?? session.flush();
          session.inFlight = pendingFlush;
          try {
            await pendingFlush;
          } finally {
            if (activeSessionFlushRef.current === session && session.inFlight === pendingFlush) {
              session.inFlight = undefined;
            }
          }
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
            projectId: requestedProjectId,
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
  }, [requestedProjectId, projectManager, loadAttempt]);

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
    if (resolved?.access.status !== 'ready' || resolved.projectId !== requestedProjectId) {
      return;
    }
    sessions.send({ type: 'open', projectId: requestedProjectId });
    sessions.send({ type: 'touch', projectId: requestedProjectId });
  }, [requestedProjectId, resolved, sessions]);

  const handleRetryLoad = (): void => {
    setRouteError(undefined);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const handleRestore = async (): Promise<void> => {
    if (resolved?.access.status !== 'trashed') {
      return;
    }
    const { access, projectId } = resolved;
    await projectManager.restoreProject(projectId);
    if (latestRequestedProjectIdRef.current !== projectId) {
      return;
    }
    setResolved((current) =>
      current?.projectId === projectId && current.access.status === 'trashed'
        ? {
            projectId,
            access: { status: 'ready', project: access.project },
            requestedChatId: latestRequestedChatIdRef.current,
          }
        : current,
    );
  };

  if (!resolved && routeError?.projectId === requestedProjectId) {
    return (
      <div className='relative h-full'>
        <ProjectLoadError error={routeError.error} onReload={handleRetryLoad} />
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className='flex h-full items-center justify-center' role='status' aria-label='Opening project'>
        <Loader />
      </div>
    );
  }

  const { access, projectId } = resolved;
  const pending = projectId !== requestedProjectId;
  let content: React.ReactNode;

  switch (access.status) {
    case 'ready': {
      const nativeRequirement = nativeKernelRequirementForEntryPath(access.project.assets.main.entryPath);
      if (nativeRequirement && !isKernelAvailable(nativeRequirement.configuration.id)) {
        content = (
          <div className='flex h-full items-center justify-center p-6 text-center'>
            <div className='max-w-md space-y-2'>
              <h1 className='text-xl font-semibold'>{nativeRequirement.configuration.name} requires Tau Desktop</h1>
              <p className='text-sm text-muted-foreground'>
                This project runs native code, which is not included in the web runtime.
              </p>
            </div>
          </div>
        );
        break;
      }
      content = (
        <ProjectSession
          key={projectId}
          projectId={projectId}
          isFocused
          nativeKernelId={nativeRequirement?.runtimeKernelId}
          requestedChatId={pending ? resolved.requestedChatId : requestedChatId}
          createdChatId={pending ? undefined : createdChatId}
          onFocusedChatResolved={pending ? undefined : onFocusedChatResolved}
          onFlushRegistration={registerSessionFlush}
        >
          {children}
        </ProjectSession>
      );
      break;
    }
    case 'missing': {
      content = <ProjectNotFound />;
      break;
    }
    case 'trashed': {
      content = (
        <div className='flex h-full items-center justify-center p-6'>
          <div className='max-w-md space-y-4 text-center'>
            <h1 className='text-xl font-semibold'>Project is in Trash</h1>
            <p className='text-sm text-muted-foreground'>
              Its files remain in place. Restore it for this Tau browser profile to reopen the editor.
            </p>
            <Button onClick={handleRestore}>Restore Project</Button>
          </div>
        </div>
      );
      break;
    }
    case 'conflict':
    case 'unavailable': {
      content = (
        <div className='flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground'>
          {access.status === 'conflict'
            ? 'This project ID exists in more than one directory. Resolve the conflict from the project library.'
            : 'The project storage location is currently unavailable.'}
        </div>
      );
      break;
    }
    case 'recovering': {
      content = (
        <div className='flex h-full items-center justify-center p-6 text-center'>
          <div className='space-y-3'>
            <Loader className='mx-auto' />
            <p className='text-sm text-muted-foreground'>Tau is finishing this project.</p>
          </div>
        </div>
      );
      break;
    }
    case 'recovery-failed': {
      const message =
        access.recovery.reason === 'workspace-unavailable'
          ? 'Reconnect the project workspace and reload so Tau can finish recovery.'
          : access.recovery.reason === 'identity-conflict'
            ? 'The project directory belongs to different or unidentifiable content.'
            : access.recovery.reason === 'local-state-error'
              ? 'The project files committed, but local project state could not be restored.'
              : 'Tau could not finish writing the project files.';
      content = (
        <div className='flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground'>
          {message}
        </div>
      );
      break;
    }
  }

  return (
    <>
      <div className='contents' inert={pending || undefined} aria-busy={pending}>
        {content}
      </div>
      {/*
        The other live projects (V21, I22).
        Each keeps its own resources — file manager, kernel, revision port,
        watchers — and renders no chrome, because the person is looking at one
        project at a time. The registry decides who is in this list; the route
        never removes anybody from it.
      */}
      {liveProjectIds
        .filter((liveProjectId) => liveProjectId !== projectId && Object.hasOwn(retainedKernels, liveProjectId))
        .map((liveProjectId) => (
          <ProjectSession
            key={liveProjectId}
            projectId={liveProjectId}
            nativeKernelId={retainedKernels[liveProjectId]}
            onFlushRegistration={noFlushRegistration}
          />
        ))}
      {pending && routeError?.projectId !== requestedProjectId ? (
        <div
          className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center'
          role='status'
          aria-label='Opening project'
        >
          <Loader className='size-8' />
        </div>
      ) : null}
      {routeError?.projectId === requestedProjectId ? (
        <ProjectLoadError error={routeError.error} onReload={handleRetryLoad} />
      ) : null}
    </>
  );
}

/**
 * Everything a project route needs once its `proj_` id is known. Both route
 * shapes render this: `/w/{workspace}/{project}` after slug resolution, and
 * the legacy `/projects/:id` resolver only ever redirects into it (D4/D6 — the
 * id stays the currency of everything downstream).
 */
export function ProjectRouteProviders({
  children,
  onFocusedChatResolved,
  projectId,
  requestedChatId,
  createdChatId,
}: {
  readonly children?: React.ReactNode;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly projectId: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
}): React.JSX.Element {
  return (
    <SharedWorkerGate>
      <ProjectRouteGate
        requestedProjectId={projectId}
        requestedChatId={requestedChatId}
        createdChatId={createdChatId}
        onFocusedChatResolved={onFocusedChatResolved}
      >
        {children}
      </ProjectRouteGate>
    </SharedWorkerGate>
  );
}

/** Chrome shared by every project route; each route module adds `providers`. */
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
  useKeybinding(
    {
      key: 's',
      modKey: true,
    },
    () => {
      toast.success('Your project is saved automatically');
    },
  );

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

  useFlushOnClose(() => {
    projectRef.send({ type: 'flushNow' });
  });
  useFlushOnClose(() => {
    editorRef.send({ type: 'flushNow' });
  });

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
  return <ChatWithProvider />;
}
