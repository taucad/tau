/**
 * Every live project's resource subtree, and the focused project's chat route.
 *
 * Split out of `project-route.tsx` so the root layout does not statically reach it (D19/W21): this
 * module is what pulls in Monaco, three.js, shiki and the chat surface, and none of that belongs in
 * the chunk a page that only lists projects evaluates. `project-route.tsx` loads it lazily the moment
 * a project is live, and the project route imports its own entry point from here directly.
 */
import { useEffect } from 'react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { ChatInterface } from '#routes/w.$workspace.$project/chat-interface.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import { ProjectChatRunSettlement } from '#routes/w.$workspace.$project/project-chat-run-settlement.js';
import { ProjectWorkspaceProvider } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { ProjectShareRouteIntent } from '#routes/w.$workspace.$project/project-share-action.js';
import { ViewSettingsSyncHost } from '#routes/w.$workspace.$project/view-settings-sync-host.js';
import { HomeFileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';
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
import { useFocusedChatReadState } from '#hooks/use-focused-chat-read-state.js';
import { useProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import { ProjectRouteNotice } from '#routes/w.$workspace.$project/project-route-notices.js';
import { useProjectSession } from '#hooks/use-sessions.js';
import { forgetProjectRegions, registerProjectSessionServices, reportRegionReady } from '#services/sessions-store.js';
import type { ChatSyncState } from '#machines/chat-session.machine.js';
import {
  useRevisionClientLifecycle,
  useRevisionClientStatus,
  useRevisionCommands,
} from '#hooks/use-revision-status.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import type { projectMachine } from '#machines/project.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { UnsavedParameterDraftsDialog } from '#routes/w.$workspace.$project/unsaved-parameter-drafts-dialog.js';

export type ProjectSessionFlushRegistration = {
  projectId: string;
  flush: () => Promise<void>;
  inFlight?: Promise<void>;
};

const editorFlushTimeoutMilliseconds = 10_000;

/**
 * Settle checked parameters and both UI stores.
 *
 * The producers half of a project's close: the revision owner takes its cut in
 * `flushSync`, which the session runs after this, so every producer's bytes are
 * on disk before the cut rather than beside it.
 */
export async function flushProjectSessionPersistence({
  parameterService,
  projectRef,
  editorRef,
  closeFlushMilliseconds,
}: Readonly<{
  parameterService: ParameterSetService;
  projectRef: ActorRefFrom<typeof projectMachine>;
  editorRef: ActorRefFrom<typeof editorMachine>;
  closeFlushMilliseconds: number;
}>): Promise<void> {
  await parameterService.close();
  projectRef.send({ type: 'flushNow' });
  editorRef.send({ type: 'flushNow' });
  const [projectSnapshot, editorSnapshot] = await Promise.all([
    waitFor(projectRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
      timeout: closeFlushMilliseconds,
    }),
    waitFor(editorRef, (state) => state.matches({ ready: { storing: 'idle' } }), {
      timeout: closeFlushMilliseconds,
    }),
  ]);
  if (projectSnapshot.context.error !== undefined) {
    throw projectSnapshot.context.error;
  }
  if (editorSnapshot.context.error !== undefined) {
    throw editorSnapshot.context.error;
  }
}

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
  shouldOpenFromTauCloud,
}: {
  readonly projectId: string;
  readonly isFocused: boolean;
  readonly shouldOpenFromTauCloud?: boolean;
}): React.JSX.Element {
  const { fileManagerRef } = useFileManager();
  const { parameterService, projectRef, editorRef } = useProject();
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
      flushProducers: async () =>
        flushProjectSessionPersistence({
          parameterService,
          projectRef,
          editorRef,
          closeFlushMilliseconds: editorFlushTimeoutMilliseconds,
        }),
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
  }, [chatSessions, client, editorRef, parameterService, projectId, projectRef]);

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

  return <UnsavedParameterDraftsDialog projectId={projectId} />;
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
          <ViewSettingsSyncHost />
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
export function LiveProjectSessions({
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
