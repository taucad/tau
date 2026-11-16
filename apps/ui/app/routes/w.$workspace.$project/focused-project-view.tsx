/**
 * The focused project's view, inside the app shell's outlet (D24, I19; plan § 4 A11).
 *
 * The shell renders at one tree position in the root layout on every route, so it can no longer sit inside the focused
 * session's subtree to reach the project's providers. This view re-homes them where the route's content renders: the
 * session's file manager, the WebGL context tracker, the project runtime, the editor document session, the chat
 * workspace authority and the project workspace, over the eight siblings that belong to the focused project only.
 *
 * Every provider here is a view of the session's own actors (A6c, A6d, A8b): the session owns the file manager and the
 * runtime, so mounting this view twice over one session, or unmounting it, creates or stops no actor. Its file manager
 * scope is a view too: the file manager's own reports stay with the session's scope, so each fires once. The caller
 * keys it by project, so the project being left supplies nothing to the next.
 *
 * The command palette's project items register from in here (programme-control ruling, 2026-11-15): their registry
 * sits above the shell, so the palette stays in the shell while its items read the focused session's view.
 */
import type { ReactNode } from 'react';
import { useSelector } from '@xstate/react';
import { WebglContextTrackerProvider } from '@taucad/viewer/hooks/use-webgl-context-tracker';
import { SessionProjectProvider } from '#hooks/project-provider.js';
import { SessionFileManagerProvider } from '#hooks/use-file-manager.js';
import { EditorDocumentSessionProvider } from '#hooks/use-editor-document-session.js';
import { useProjectSession } from '#hooks/use-sessions.js';
import { ChatWorkspaceAuthorityProvider } from '#providers/chat-workspace-authority-provider.js';
import { selectProjectSessionFileManager, selectProjectSessionRuntime } from '#services/sessions-store.js';
import { ProjectWorkspaceProvider } from '#routes/w.$workspace.$project/project-workspace-provider.js';
import { WorkbenchRecordHost } from '#routes/w.$workspace.$project/workbench-record-host.js';
import { ProjectPrintRouteIntent } from '#routes/w.$workspace.$project/project-print-route-intent.js';
import { ProjectShareRouteIntent } from '#routes/w.$workspace.$project/project-share-action.js';
import { RevisionConflictChat } from '#routes/w.$workspace.$project/revision-conflict-chat.js';
import { RevisionRestore } from '#routes/w.$workspace.$project/revision-restore.js';
import { WorkbenchCheckoutRoot } from '#routes/w.$workspace.$project/workbench-checkout-root.js';
import { RevisionOutcomes } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { RevisionSaveShortcut } from '#routes/w.$workspace.$project/revision-save-shortcut.js';
import { ProjectCommandPaletteItems } from '#routes/w.$workspace.$project/project-command-items.js';

/**
 * The palette registration of the focused project's items: one view is mounted at a time. The palette lists deeper
 * ids first, so the id keeps the project route's depth and its items stay above the shell's global groups.
 */
const focusedProjectPaletteId = 'routes/w.$workspace.$project';

/**
 * The focused project's providers and its focused-only siblings, over the route's content.
 *
 * @param props - The focused project, and the route's content to render inside its providers.
 * @returns The view, or nothing until the session has built its file manager and runtime.
 */
export function FocusedProjectView({
  children,
  projectId,
}: {
  readonly children: ReactNode;
  readonly projectId: string;
}): ReactNode {
  const session = useProjectSession(projectId);
  const fileManagerRef = useSelector(session, (snapshot) =>
    snapshot === undefined ? undefined : selectProjectSessionFileManager(snapshot),
  );
  const runtimeRef = useSelector(session, (snapshot) =>
    snapshot === undefined ? undefined : selectProjectSessionRuntime(snapshot),
  );
  return (
    <SessionFileManagerProvider
      fileManagerRef={fileManagerRef}
      projectId={projectId}
      rootDirectory={`/projects/${projectId}`}
      isView
    >
      <WebglContextTrackerProvider>
        <SessionProjectProvider projectId={projectId} runtimeRef={runtimeRef}>
          <RevisionSaveShortcut />
          <EditorDocumentSessionProvider>
            <ChatWorkspaceAuthorityProvider>
              <ProjectWorkspaceProvider>
                <WorkbenchRecordHost />
                <ProjectShareRouteIntent />
                <ProjectPrintRouteIntent />
                <RevisionRestore />
                {/* AC14: *Ask chat to resolve* seeds one chat, bound to the conflict its turn is being started for. */}
                <RevisionConflictChat />
                {/* S27: the workbench follows the selected checkout's route. */}
                <WorkbenchCheckoutRoot />
                {/* A4: the two outcomes that record no revision are not silent. */}
                <RevisionOutcomes />
                <ProjectCommandPaletteItems paletteId={focusedProjectPaletteId} />
                {children}
              </ProjectWorkspaceProvider>
            </ChatWorkspaceAuthorityProvider>
          </EditorDocumentSessionProvider>
        </SessionProjectProvider>
      </WebglContextTrackerProvider>
    </SessionFileManagerProvider>
  );
}
