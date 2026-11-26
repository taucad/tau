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
import { ChatInterface } from '#routes/w.$workspace.$project/chat-interface.js';
import { SessionProjectProvider } from '#hooks/project-provider.js';
import { useProject } from '#hooks/use-project.js';
import { SessionFileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';
// Chat persistence + draft flush is handled centrally by `<GlobalChatFlushGuard>`
// (see `apps/ui/app/components/global-chat-flush-guard.tsx`). The project and
// editor machines are flushed by the project's session (A7c).
import { WebglContextTrackerProvider } from '@taucad/viewer/hooks/use-webgl-context-tracker';
import { useFocusedChatReadState } from '#hooks/use-focused-chat-read-state.js';
import { useProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import { ProjectRouteNotice } from '#routes/w.$workspace.$project/project-route-notices.js';
import { FocusedProjectView } from '#routes/w.$workspace.$project/focused-project-view.js';
import { useProjectSession } from '#hooks/use-sessions.js';
import { selectProjectSessionFileManager, selectProjectSessionRuntime } from '#services/sessions-store.js';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { useTauCloudIntent, useTauCloudIntentConnection } from '#hooks/use-cloud-projects.js';
import type { TauCloudIntent } from '#lib/tau-cloud-intent.js';
import {
  useRevisionClient,
  useRevisionClientStatus,
  useRevisionCommands,
  useProjectRole,
} from '#hooks/use-revision-status.js';
import type { RevisionCommands } from '@taucad/revisions-ui/hooks/use-revision-status';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { UnsavedParameterDraftsDialog } from '#routes/w.$workspace.$project/unsaved-parameter-drafts-dialog.js';

import { warmWorkspaceLayout as warmViewportLayout } from '#routes/w.$workspace.$project/chat-interface-layouts.js';

/**
 * Warm the layout this viewport will mount (STO-25 SP5): the open calls it through this module once it has loaded it
 * (`openProjectWorkspace`), so the app runtime's graph never names a layout. Never throws.
 */
export function warmWorkspaceLayout(): void {
  warmViewportLayout();
}

/**
 * The session's half of a project subtree (S44), reduced to render (A7c).
 *
 * The registry decides *whether* a project is live, and the session's children report whether its resources came up,
 * wire its facts and do its close, leave and unload flushes (A6c, A6d, A7b, A7c), with nothing mounted. What is left
 * here is the project's own surfaces: the sync announcement, the unsaved-drafts dialog, the cloud intent's connector and
 * preview, and the foreign chat logs the mounted file manager's change channel reports.
 */
function ProjectSessionBinding({
  projectId,
  isFocused,
}: {
  readonly projectId: string;
  readonly isFocused: boolean;
}): React.JSX.Element {
  const { workerChangeChannel } = useFileManager();
  const { retryManifestObservation } = useProject();
  /* A passive reader: the session's `revisions` child owns the client's lifecycle (A7b). */
  const client = useRevisionClient();
  const revisionCommands = useRevisionCommands();
  const cloudIntent = useTauCloudIntent(projectId);
  const chatSessions = useChatSessionStore();
  const status = useRevisionClientStatus(client);
  useEffect(() => {
    if (cloudIntent === 'open' && status?.sync.hasAppliedRemote === true) {
      retryManifestObservation();
    }
  }, [cloudIntent, retryManifestObservation, status?.sync.hasAppliedRemote]);
  /* STO-25: once a tree write's closure has landed its `tau.json`, the manifest is read again, so the model surfaces
     know from the first view whether the project holds that manifest. */
  useEffect(() => {
    if (cloudIntent === 'open' && status?.entryManifest !== undefined) {
      retryManifestObservation();
    }
  }, [cloudIntent, retryManifestObservation, status?.entryManifest]);
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
}: {
  readonly projectId: string;
  readonly isFocused?: boolean;
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
 * runs are its open request's (A6d), so the route passes neither, and its leave flush is the session's (A7c).
 */
export function LiveProjectSessions({
  focused,
  liveProjectIds,
}: {
  readonly focused?: FocusedProjectSession;
  readonly liveProjectIds: readonly string[];
}): React.JSX.Element {
  return (
    <>
      {liveProjectIds.map((projectId) => {
        const isFocused = focused?.projectId === projectId;
        return <ProjectSession key={projectId} projectId={projectId} isFocused={isFocused} />;
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
 * machine flushing is the session's own (A7c): its `project` child flushes the
 * runtime on close, on a leave and at the unload's producer stage.
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
