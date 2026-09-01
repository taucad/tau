import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import { toast } from 'sonner';
import { ChatInterface } from '#routes/w.$workspace.$project/chat-interface.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import type { Handle } from '#types/matches.types.js';
import { ProjectChatRpcBindings } from '#routes/w.$workspace.$project/project-chat-rpc-bindings.js';
import { ProjectWorkspaceProvider } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { ProjectShareRouteIntent } from '#routes/w.$workspace.$project/project-share-action.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { ProjectCommandPaletteItems } from '#routes/w.$workspace.$project/project-command-items.js';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { ChatRpcSocketProvider } from '#hooks/use-chat-rpc-socket.js';
import { MonacoModelServiceProvider } from '#hooks/use-monaco-model-service.js';
import { RevisionProvider } from '#routes/w.$workspace.$project/revision-provider.js';
import { ChatWorkspaceAuthorityProvider } from '#providers/chat-workspace-authority-provider.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useBlockBrowserNavigation } from '#hooks/use-block-browser-navigation.js';
// Chat persistence + draft flush is handled centrally by `<GlobalChatFlushGuard>`
// (see `apps/ui/app/components/global-chat-flush-guard.tsx`). The project
// route only needs to flush its own project + editor machine state below.
import { WebglContextTrackerProvider } from '#hooks/use-webgl-context-tracker.js';
import { localKernelOptions } from '#constants/desktop-kernel-options.js';
import { remoteKernelOptions } from '#constants/remote-kernel-options.js';
import { useRemoteComputePlacement, useRemoteComputeSelectionRevision } from '#lib/remote-compute-placement.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFocusedChatReadState } from '#hooks/use-focused-chat-read-state.js';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';
import { Loader } from '#components/ui/loader.js';
import { Button } from '@taucad/ui/components/button';
import { ProjectNotFound } from '#routes/w.$workspace.$project/project-not-found.js';
import { ProjectLoadError } from '#routes/w.$workspace.$project/project-load-error.js';

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

function ProjectSession({
  children,
  projectId,
  requestedChatId,
  onFocusedChatResolved,
  onFlushRegistration,
}: {
  readonly children?: React.ReactNode;
  readonly projectId: string;
  readonly requestedChatId?: string;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly onFlushRegistration: (registration: ProjectSessionFlushRegistration | undefined) => void;
}): React.ReactNode {
  const placement = useRemoteComputePlacement();
  const selectionRevision = useRemoteComputeSelectionRevision();
  // Desktop resolves the local kernel to a utility process rooted at this
  // project's directory on disk; the browser keeps the debug web worker.
  const localOptions = useMemo(() => localKernelOptions(projectId), [projectId]);
  const kernelOptionsFactory = placement.state === 'local' ? localOptions : remoteKernelOptions;
  return (
    <HomeFileManagerProvider projectId={projectId} rootDirectory={`/projects/${projectId}`}>
      <ChatRpcSocketProvider>
        <WebglContextTrackerProvider>
          <ProjectProvider
            key={`${placement.state === 'local' ? 'local' : placement.deviceId}:${String(selectionRevision)}`}
            projectId={projectId}
            requestedChatId={requestedChatId}
            onFocusedChatResolved={onFocusedChatResolved}
            kernelOptionsFactory={kernelOptionsFactory}
          >
            <ProjectPersistenceGuard projectId={projectId} onFlushRegistration={onFlushRegistration} />
            <MonacoModelServiceProvider>
              <RevisionProvider>
                <ChatWorkspaceAuthorityProvider>
                  <ProjectWorkspaceProvider>
                    <ProjectShareRouteIntent />
                    {children}
                  </ProjectWorkspaceProvider>
                </ChatWorkspaceAuthorityProvider>
              </RevisionProvider>
            </MonacoModelServiceProvider>
          </ProjectProvider>
        </WebglContextTrackerProvider>
      </ChatRpcSocketProvider>
    </HomeFileManagerProvider>
  );
}

export function ProjectRouteGate({
  children,
  onFocusedChatResolved,
  requestedProjectId,
  requestedChatId,
}: {
  readonly children?: React.ReactNode;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly requestedProjectId: string;
  readonly requestedChatId?: string;
}): React.ReactNode {
  const projectManager = useProjectManager();
  const latestRequestedProjectIdRef = useRef(requestedProjectId);
  const latestRequestedChatIdRef = useRef(requestedChatId);
  const activeSessionFlushRef = useRef<ProjectSessionFlushRegistration | undefined>(undefined);
  const [resolved, setResolved] = useState<ResolvedProjectRouteAccess>();
  const [routeError, setRouteError] = useState<ProjectRouteError>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  latestRequestedProjectIdRef.current = requestedProjectId;
  latestRequestedChatIdRef.current = requestedChatId;
  const registerSessionFlush = useRef((registration: ProjectSessionFlushRegistration | undefined): void => {
    activeSessionFlushRef.current = registration;
  }).current;

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
      content = (
        <ProjectSession
          key={projectId}
          projectId={projectId}
          requestedChatId={pending ? resolved.requestedChatId : requestedChatId}
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
}: {
  readonly children?: React.ReactNode;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly projectId: string;
  readonly requestedChatId?: string;
}): React.JSX.Element {
  return (
    <SharedWorkerGate>
      <ProjectRouteGate
        requestedProjectId={projectId}
        requestedChatId={requestedChatId}
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
  enableFloatingSidebar: true,
  enablePageHeader: false,
};

// Chat component - handles keyboard shortcuts. The Socket.IO RPC connection
// is wired up by `<ProjectChatRpcBindings>` once per chatId from the
// app-shell `ChatSessionStore` (RPC join/leave is per-session, not
// per-route — see `apps/ui/app/routes/w.$workspace.$project/project-chat-rpc-bindings.tsx`).
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
 * - `<ProjectChatRpcBindings>` reads chat ids from the app-shell
 *   `ChatSessionStore` directly (no `<ActiveChatProvider>` dependency),
 *   so RPC bindings persist across `focusedChatId` changes and across
 *   `ensureFocusedChatActor` retries — no socket churn on editor-machine
 *   transitions.
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
      <ProjectChatRpcBindings />
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
  useBlockBrowserNavigation();

  return <ChatWithProvider />;
}
