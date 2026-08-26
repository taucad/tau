import { useEffect, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { toast } from 'sonner';
import { ChatInterface } from '#routes/w.$workspace.$project/chat-interface.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import type { Handle } from '#types/matches.types.js';
import { ProjectChatRpcBindings } from '#routes/w.$workspace.$project/project-chat-rpc-bindings.js';
import { ProjectNameEditor } from '#routes/w.$workspace.$project/project-name-editor.js';
import { ViewContextProvider } from '#routes/w.$workspace.$project/chat-interface-view-context.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { ProjectCommandPaletteItems } from '#routes/w.$workspace.$project/project-command-items.js';
import { ProjectExportAction } from '#routes/w.$workspace.$project/project-export-action.js';
import { ProjectShareAction } from '#routes/w.$workspace.$project/project-share-action.js';
import { HomeFileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { ChatRpcSocketProvider } from '#hooks/use-chat-rpc-socket.js';
import { MonacoModelServiceProvider } from '#hooks/use-monaco-model-service.js';
import { RevisionProvider } from '#routes/w.$workspace.$project/revision-provider.js';
import { RevisionChip } from '#routes/w.$workspace.$project/active-revision-indicator.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useBlockBrowserNavigation } from '#hooks/use-block-browser-navigation.js';
// Chat persistence + draft flush is handled centrally by `<GlobalChatFlushGuard>`
// (see `apps/ui/app/components/global-chat-flush-guard.tsx`). The project
// route only needs to flush its own project + editor machine state below.
import { WebglContextTrackerProvider } from '#hooks/use-webgl-context-tracker.js';
import { debugKernelOptions } from '#constants/kernel-options.presets.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';
import { Loader } from '#components/ui/loader.js';
import { Button } from '#components/ui/button.js';
import { ProjectNotFound } from '#routes/w.$workspace.$project/project-not-found.js';
import { ProjectLoadError } from '#routes/w.$workspace.$project/project-load-error.js';

type ResolvedProjectRouteAccess = {
  readonly projectId: string;
  readonly access: ProjectRouteAccess;
};

function ProjectSession({
  children,
  projectId,
}: {
  readonly children?: React.ReactNode;
  readonly projectId: string;
}): React.ReactNode {
  return (
    <HomeFileManagerProvider projectId={projectId} rootDirectory={`/projects/${projectId}`}>
      <ChatRpcSocketProvider>
        <WebglContextTrackerProvider>
          <ProjectProvider projectId={projectId} kernelOptionsFactory={debugKernelOptions}>
            <MonacoModelServiceProvider>
              <RevisionProvider>{children}</RevisionProvider>
            </MonacoModelServiceProvider>
          </ProjectProvider>
        </WebglContextTrackerProvider>
      </ChatRpcSocketProvider>
    </HomeFileManagerProvider>
  );
}

export function ProjectRouteGate({
  children,
  requestedProjectId,
}: {
  readonly children?: React.ReactNode;
  readonly requestedProjectId: string;
}): React.ReactNode {
  const projectManager = useProjectManager();
  const latestRequestedProjectIdRef = useRef(requestedProjectId);
  const [resolved, setResolved] = useState<ResolvedProjectRouteAccess>();
  const [loadErrorProjectId, setLoadErrorProjectId] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  latestRequestedProjectIdRef.current = requestedProjectId;

  useEffect(() => {
    let cancelled = false;
    const loadAccess = async (): Promise<void> => {
      try {
        const access = await projectManager.getProjectRouteAccess(requestedProjectId);
        if (!cancelled) {
          setLoadErrorProjectId(undefined);
          setResolved({ projectId: requestedProjectId, access });
        }
      } catch {
        if (!cancelled) {
          setLoadErrorProjectId(requestedProjectId);
        }
      }
    };
    // async-iife: bootstrap -- the effect cancellation flag owns this route-access request.
    void loadAccess();
    return () => {
      cancelled = true;
    };
  }, [requestedProjectId, projectManager, loadAttempt]);

  const handleRetryLoad = (): void => {
    setLoadErrorProjectId(undefined);
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
        ? { projectId, access: { status: 'ready', project: access.project } }
        : current,
    );
  };

  if (!resolved && loadErrorProjectId === requestedProjectId) {
    return (
      <div className='relative h-full'>
        <ProjectLoadError
          error={new Error('Tau could not check this project. Try again.')}
          onReload={handleRetryLoad}
        />
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
        <ProjectSession key={projectId} projectId={projectId}>
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
      {pending && loadErrorProjectId !== requestedProjectId ? (
        <div
          className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center'
          role='status'
          aria-label='Opening project'
        >
          <Loader className='size-8' />
        </div>
      ) : null}
      {loadErrorProjectId === requestedProjectId ? (
        <ProjectLoadError
          error={new Error('Tau could not check this project. Try again.')}
          onReload={handleRetryLoad}
        />
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
  projectId,
}: {
  readonly children?: React.ReactNode;
  readonly projectId: string;
}): React.JSX.Element {
  return (
    <SharedWorkerGate>
      <ProjectRouteGate requestedProjectId={projectId}>{children}</ProjectRouteGate>
    </SharedWorkerGate>
  );
}

/** Chrome shared by every project route; each route module adds `providers`. */
export const projectRouteHandle: Omit<Handle, 'providers'> = {
  breadcrumb() {
    return [
      //
      <ProjectNameEditor key='project-name-editor' />,
      // Disabled until publishing is implemented
      // <ChatModeSelector key={`${id}-chat-mode-selector`} />
    ];
  },
  actions() {
    return (
      <>
        <RevisionChip />
        <ProjectShareAction />
        <ProjectExportAction />
      </>
    );
  },
  commandPalette(match) {
    return <ProjectCommandPaletteItems match={match} />;
  },
  enableFloatingSidebar: true,
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
 * - `<ChatInterface>` mounts the full editor layout (viewer, file tree,
 *   parameters, editor, kernel, explorer, details, converter, and the
 *   chat panel) unconditionally. The chat panel itself wraps its
 *   `<ChatHistory>` child in `<ChatHistoryGate>` (see
 *   [`focused-chat-gate.tsx`](./focused-chat-gate.tsx)), which is the
 *   sole owner of `<ActiveChatProvider>` mounting + the
 *   focused-chat skeleton/error UI. This keeps every non-chat pane
 *   independent of the editor machine's chat lifecycle, restoring the
 *   pre-fix elegant load behaviour (placeholder -> opacity fade-in).
 * - `<ProjectChatRpcBindings>` reads chat ids from the app-shell
 *   `ChatSessionStore` directly (no `<ActiveChatProvider>` dependency),
 *   so RPC bindings persist across `focusedChatId` changes and across
 *   `ensureFocusedChatActor` retries — no socket churn on editor-machine
 *   transitions.
 *
 * Persistence + draft `flushNow` is dispatched centrally by
 * `<GlobalChatFlushGuard>` (mounted in `apps/ui/app/root.tsx`) — every
 * live session in the store is fanned out automatically. Project + editor
 * machine flushing remains route-scoped via `FlushOnCloseGuard` below.
 */
function ChatWithProvider(): React.JSX.Element {
  const { projectRef } = useProject();
  const name = useSelector(projectRef, (state) => state.context.project?.name);
  const description = useSelector(projectRef, (state) => state.context.project?.description);

  return (
    <ViewContextProvider>
      {name ? <title>{name}</title> : null}
      {description ? <meta name='description' content={description} /> : null}
      <FlushOnCloseGuard />
      <ProjectChatRpcBindings />
      <Chat />
    </ViewContextProvider>
  );
}

/**
 * Inner component that wires up the flush-on-close handler.
 * Needs to be a child of ProjectProvider to access project + editor refs.
 */
function FlushOnCloseGuard(): React.JSX.Element {
  const { projectRef, editorRef } = useProject();

  useFlushOnClose(() => {
    projectRef.send({ type: 'flushNow' });
  });
  useFlushOnClose(() => {
    editorRef.send({ type: 'flushNow' });
  });

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- Headless component
  return <></>;
}

export function ProjectChatRoute(): React.JSX.Element {
  useBlockBrowserNavigation();

  return <ChatWithProvider />;
}
