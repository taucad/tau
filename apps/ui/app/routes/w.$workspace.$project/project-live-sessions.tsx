/**
 * Every live project's resource subtree, and the focused project's chat route.
 *
 * Split out of `project-route.tsx` so the root layout does not statically reach it (D19/W21): this
 * module is what pulls in the editor, three.js, syntax assets and the chat surface, and none of that belongs in
 * the chunk a page that only lists projects evaluates. `project-route.tsx` loads it lazily the moment
 * a project is live, and the project route imports its own entry point from here directly.
 */
import { ProjectSyncAnnouncement } from '#routes/w.$workspace.$project/project-sync-placeholder.js';
import { usePublishCloudProjectPreview } from '#hooks/use-publish-cloud-project-preview.js';
import { useEffect } from 'react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { ChatInterface } from '#routes/w.$workspace.$project/chat-interface.js';
import { SessionProjectProvider, useProject } from '#hooks/use-project.js';
import { ViewSettingsSyncHost } from '#routes/w.$workspace.$project/view-settings-sync-host.js';
import { SessionFileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
// Chat persistence + draft flush is handled centrally by `<GlobalChatFlushGuard>`
// (see `apps/ui/app/components/global-chat-flush-guard.tsx`). The project
// route only needs to flush its own project + editor machine state below.
import { WebglContextTrackerProvider } from '@taucad/viewer/hooks/use-webgl-context-tracker';
import { useFocusedChatReadState } from '#hooks/use-focused-chat-read-state.js';
import { useProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import { ProjectRouteNotice } from '#routes/w.$workspace.$project/project-route-notices.js';
import { FocusedProjectView } from '#routes/w.$workspace.$project/focused-project-view.js';
import { useProjectSession } from '#hooks/use-sessions.js';
import {
  registerProjectSessionServices,
  selectProjectSessionFileManager,
  selectProjectSessionRuntime,
} from '#services/sessions-store.js';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { useTauCloudIntent, useTauCloudIntentConnection } from '#hooks/use-cloud-projects.js';
import type { TauCloudIntent } from '#lib/tau-cloud-intent.js';
import {
  useRevisionClient,
  useRevisionClientStatus,
  useRevisionCommands,
  useProjectRole,
} from '#hooks/use-revision-status.js';
import { peekRevisionClient } from '#services/revision-client-registry.js';
import type { RevisionCommands } from '#hooks/use-revision-status.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import { closeProjectRuntime } from '#machines/project.machine.js';
import type { projectMachine } from '#machines/project.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { UnsavedParameterDraftsDialog } from '#routes/w.$workspace.$project/unsaved-parameter-drafts-dialog.js';
import { refuseCloseWhileRecording } from '#lib/editor-document-session.js';

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
  projectId,
  parameterService,
  projectRef,
  editorRef,
  flushWorkbenchRecords,
  closeFlushMilliseconds,
}: Readonly<{
  /** The project closing: refused, before anything is torn down, while an editor's conflict is being recorded. */
  projectId?: string;
  parameterService: ParameterSetService;
  projectRef: ActorRefFrom<typeof projectMachine>;
  editorRef: ActorRefFrom<typeof editorMachine>;
  flushWorkbenchRecords?: () => Promise<void>;
  closeFlushMilliseconds: number;
}>): Promise<void> {
  if (projectId !== undefined) {
    refuseCloseWhileRecording(projectId);
  }
  // A record refusal keeps this session live, including its parameter editing authority.
  await flushWorkbenchRecords?.();
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
 * The registry decides *whether* a project is live, and the session's children
 * report whether its resources came up and wire its facts (A6c, A6d, A7b): the
 * revision client, the host connector, the revision facts, visibility and
 * parking need nothing mounted. This hands the session the four things
 * `closing` has to do and relays what only the subtree holds yet. It is mounted
 * inside the project's providers, which is the only place that can reach them.
 */
function ProjectSessionBinding({
  projectId,
  isFocused,
}: {
  readonly projectId: string;
  readonly isFocused: boolean;
}): React.JSX.Element {
  const { workerChangeChannel } = useFileManager();
  const { parameterService, projectRef, editorRef, flushWorkbenchRecordProducers, retryManifestObservation } =
    useProject();
  /* A passive reader: the session's `revisions` child owns the client's lifecycle (A7b). */
  const client = useRevisionClient();
  const revisionCommands = useRevisionCommands();
  const cloudIntent = useTauCloudIntent(projectId);
  const chatSessions = useChatSessionStore();
  const session = useProjectSession(projectId);
  const status = useRevisionClientStatus(client);
  useEffect(() => {
    if (cloudIntent === 'open' && status?.sync.hasAppliedRemote === true) {
      retryManifestObservation();
    }
  }, [cloudIntent, retryManifestObservation, status?.sync.hasAppliedRemote]);
  const role = useProjectRole();
  usePublishCloudProjectPreview({
    projectId,
    enabled:
      status?.remote.kind === 'tau' &&
      status.remote.phase === 'connected' &&
      !status.remote.fetchOnly &&
      status.sync.hasAppliedRemote === true &&
      status.sync.state === 'backedUp' &&
      (role === 'owner' || role === 'write'),
  });
  /* Fetch writes name only a foreign segment path. The projection owns the bytes and transcript; a local host
   * log is still followed exclusively through its cursor. */
  useEffect(() => {
    if (workerChangeChannel === undefined) {
      return;
    }
    const prefix = `/projects/${projectId}/.tau/chats/`;
    const refresh = async (chatId: string): Promise<void> => {
      try {
        await chatSessions.refreshRemoteSegments(chatId, projectId);
      } catch (error) {
        console.warn('[ProjectSessionBinding] foreign chat log could not be read', chatId, error);
      }
    };
    return workerChangeChannel.onFileWritten({
      interestedIn: (path) => path.startsWith(prefix) && /\/events\/[^/]+\.jsonl$/.test(path),
      handler: ({ path }) => {
        const chatId = path.slice(prefix.length).split('/')[0];
        if (chatId === undefined || !chatSessions.observedChatIdsOf(projectId).includes(chatId)) {
          return;
        }
        void refresh(chatId);
      },
    });
  }, [chatSessions, projectId, workerChangeChannel]);

  useEffect(() => {
    return registerProjectSessionServices(projectId, {
      closeRuntime: async () => closeProjectRuntime(projectRef),
      flushProducers: async () =>
        flushProjectSessionPersistence({
          projectId,
          parameterService,
          projectRef,
          editorRef,
          flushWorkbenchRecords: flushWorkbenchRecordProducers,
          closeFlushMilliseconds: editorFlushTimeoutMilliseconds,
        }),
      /* W13's seam, called: the worker's `release()` takes the close cut and awaits `awaitSyncSettled` before it
       * answers this. The client is the one the session's `revisions` child opened, from the module's table (A7b). */
      flushSync: async () => {
        await peekRevisionClient(projectId)?.quiesce();
      },
      cancelRuns: async (chatIds) => {
        const outcomes = await Promise.all(chatIds.map(async (chatId) => chatSessions.cancelProjectedRun(chatId)));
        if (outcomes.includes('continuing')) {
          throw new Error('A run changed holder and could not be stopped. Review the current Close plan.');
        }
      },
    });
  }, [chatSessions, editorRef, flushWorkbenchRecordProducers, parameterService, projectId, projectRef]);

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

  return (
    <>
      {isFocused ? <ProjectSyncAnnouncement /> : null}
      <UnsavedParameterDraftsDialog projectId={projectId} />
      {cloudIntent === undefined || cloudIntent === 'connected' || client === undefined ? null : (
        <TauCloudIntentConnector
          projectId={projectId}
          intent={cloudIntent}
          status={status}
          commands={revisionCommands}
        />
      )}
    </>
  );
}

/**
 * Acts on what this device owes the project's Tau Cloud backup (W11: D19's
 * backup by default, D20's materialized projects). Mounted only while something
 * is owed, so a project without an intent never asks for the session or the plan.
 *
 * @param props - The project, its intent, its projection, and the session's remote verbs.
 * @returns Nothing; it only acts.
 */
function TauCloudIntentConnector({
  projectId,
  intent,
  status,
  commands,
}: {
  readonly projectId: string;
  readonly intent: TauCloudIntent;
  readonly status: RevisionStatusProjection | undefined;
  readonly commands: RevisionCommands;
}): undefined {
  useTauCloudIntentConnection({
    projectId,
    intent,
    status,
    commands,
  });
  return undefined;
}

function ProjectSession({
  projectId,
  isFocused,
  onFlushRegistration,
}: {
  readonly projectId: string;
  readonly isFocused?: boolean;
  readonly onFlushRegistration: (registration: ProjectSessionFlushRegistration | undefined) => void;
}): React.ReactNode {
  const session = useProjectSession(projectId);
  /* A6c: the session's `fileManager` child built this project's file manager through the host; the provider is a view
   * of it and creates nothing. */
  const fileManagerRef = useSelector(session, (snapshot) =>
    snapshot === undefined ? undefined : selectProjectSessionFileManager(snapshot),
  );
  /* A6d: the session's `project` child built its runtime from its file manager, `choices` and its open request, which
   * carries the native kernel id and the chat; the provider is a view of it and creates nothing. */
  const runtimeRef = useSelector(session, (snapshot) =>
    snapshot === undefined ? undefined : selectProjectSessionRuntime(snapshot),
  );
  const focused = isFocused === true;
  return (
    <SessionFileManagerProvider
      fileManagerRef={fileManagerRef}
      projectId={projectId}
      rootDirectory={`/projects/${projectId}`}
    >
      <WebglContextTrackerProvider>
        <SessionProjectProvider projectId={projectId} runtimeRef={runtimeRef}>
          <ProjectPersistenceGuard projectId={projectId} onFlushRegistration={onFlushRegistration} />
          <ViewSettingsSyncHost />
          <ProjectSessionBinding projectId={projectId} isFocused={focused} />
        </SessionProjectProvider>
      </WebglContextTrackerProvider>
    </SessionFileManagerProvider>
  );
}

type FocusedProjectSession = Readonly<{
  projectId: string;
}>;

/**
 * The app-level keyed host for every live project's resource subtree. The chat each session shows and the kernel it
 * runs are its open request's (A6d), so the route passes neither.
 */
export function LiveProjectSessions({
  focused,
  liveProjectIds,
  onFlushRegistration,
}: {
  readonly focused?: FocusedProjectSession;
  readonly liveProjectIds: readonly string[];
  readonly onFlushRegistration: (registration: ProjectSessionFlushRegistration | undefined) => void;
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
            onFlushRegistration={isFocused ? onFlushRegistration : noFlushRegistration}
          />
        );
      })}
    </>
  );
}

// Chat component - handles keyboard shortcuts. A turn is settled by the host
// that ran it, which appends the settlement row to the chat's log (W8 TS-S6).
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
  const { projectRef, editorRef, flushWorkbenchRecordProducers } = useProject();

  useFlushOnClose(
    async () => {
      await flushWorkbenchRecordProducers();
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
        await flushWorkbenchRecordProducers();
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
  }, [editorRef, flushWorkbenchRecordProducers, onFlushRegistration, projectId]);

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- Headless component
  return <></>;
}

export function ProjectChatRoute(): React.ReactNode {
  const state = useProjectRouteState();
  /*
   * W2/W3: the editor is the only state that renders the project's providers
   * (`FocusedProjectView`, A11), so `ChatWithProvider`'s `useProject()` stays inside that branch. Every other
   * state renders its notice in the same shell, with the sidebar intact. The gate
   * publishes a state for every project route since A5b, so no state means no
   * project route and nothing to show (the editor is never assumed, A6d).
   */
  if (state === undefined) {
    return null;
  }
  /* A11: the shell's outlet holds the focused project's view, keyed by project, so the project being left supplies
   * nothing to the next. */
  return state.kind === 'editor' ? (
    <FocusedProjectView key={state.projectId} projectId={state.projectId}>
      <ChatWithProvider />
    </FocusedProjectView>
  ) : (
    <ProjectRouteNotice state={state} />
  );
}
