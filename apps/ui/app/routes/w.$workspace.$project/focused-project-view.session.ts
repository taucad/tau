/**
 * The focused project's session, for the shell's own readers (A11): Settings sits in the shell, outside the focused
 * project's view, so it reads the session the route shows from focus and the registry instead of provider ancestry.
 * With no focused session it reads the runtime's standalone project (the owned preview route) instead.
 */
import { useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import { useAppRuntime } from '#runtime/app-runtime-provider.js';
import { standaloneProjectPortOf } from '#runtime/standalone-project-port.js';
import { useSessions } from '#hooks/use-sessions.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { useProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import { sessionProjectRuntimeOf } from '#runtime/project-runtime.session.js';
import type { ProjectRuntimeViewSource } from '#runtime/project-runtime.session.js';
import {
  selectProjectSession,
  selectProjectSessionFileManager,
  selectProjectSessionRuntime,
} from '#services/sessions-store.js';

/** The focused project's session as the shell reads it: its id, its file manager and its runtime, once built. */
export type FocusedProjectSession = Readonly<{
  projectId: string;
  fileManagerRef: FileManagerRef | undefined;
  runtime: ProjectRuntimeViewSource | undefined;
}>;

/**
 * The session of the project the route shows in the editor, read from the route state (focus, the registry and the
 * committed route) and the registry. It is the project whose view the outlet holds, and nothing while the route shows
 * a notice or is not a project route, as provider ancestry was. Without one, it is the standalone project the
 * runtime's port holds (the owned preview's), which the preview route's providers supplied before.
 *
 * @returns The focused project's session, the standalone project, or `undefined`.
 */
export function useFocusedProjectSession(): FocusedProjectSession | undefined {
  const state = useProjectRouteState();
  const projectId = state?.kind === 'editor' ? state.projectId : undefined;
  const session = useSelector(useSessions(), (snapshot) =>
    projectId === undefined ? undefined : selectProjectSession(snapshot.context, projectId),
  );
  const fileManagerRef = useSelector(session, (snapshot) =>
    snapshot === undefined ? undefined : selectProjectSessionFileManager(snapshot),
  );
  const runtimeRef = useSelector(session, (snapshot) =>
    snapshot === undefined ? undefined : selectProjectSessionRuntime(snapshot),
  );
  const port = standaloneProjectPortOf(useAppRuntime());
  const standalone = useSyncExternalStore(port.subscribe, port.get, port.get);
  if (projectId === undefined || session === undefined) {
    return standalone;
  }
  return {
    projectId,
    fileManagerRef,
    runtime: runtimeRef === undefined ? undefined : sessionProjectRuntimeOf(runtimeRef),
  };
}
