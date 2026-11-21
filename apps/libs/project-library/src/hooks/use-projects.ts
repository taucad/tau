/**
 * The project listing and the project gestures over it: the library's listing query filtered to a scope, and the
 * delete, restore, duplicate, adopt, repair, relink and rename gestures that compose the project manager's commands.
 * The app passes its project manager, its chat session store and its view exceptions (`ProjectsInputs`).
 *
 * @module
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Project } from '@taucad/types';
import type { ProjectLocator } from '@taucad/filesystem';
import type { ProjectManagerContextType } from '#hooks/use-project-manager.js';
import type { CreatedProject } from '#runtime/project-library-commands.js';
import { isInProjectScope, projectLibraryEntryToListItem } from '#types/project-library.types.js';
import type { ProjectScope } from '#types/project-library.types.js';

/**
 * What `useProjects` reads from the app.
 *
 * @public
 */
export type ProjectsInputs = Readonly<{
  /** The project manager, as `useProjectManager` returns it. */
  projectManager: Pick<
    ProjectManagerContextType,
    | 'projectListingQuery'
    | 'discoveryObservationError'
    | 'refreshFilesystemObservations'
    | 'updateProject'
    | 'getProject'
    | 'deleteProject'
    | 'restoreProject'
    | 'permanentlyDeleteProject'
    | 'isLoading'
    | 'duplicateProject'
    | 'adoptProject'
    | 'repairProject'
    | 'chooseProjectDirectory'
    | 'verifyProjectQuiescent'
    | 'leaseQuiescentProject'
    | 'closeProjectSession'
  >;
  /** The chat session store: a permanently deleted project's live composer records stop before its directory goes. */
  chatSessions: Readonly<{ removeProject: (projectId: string) => Promise<void> }>;
  /** This device's view exceptions: a permanently deleted project's go with it. */
  viewExceptions: Readonly<{ dropProject: (projectId: string) => void }>;
}>;

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useProjects(inputs: ProjectsInputs, options?: { scope?: ProjectScope }) {
  const { projectManager, chatSessions, viewExceptions } = inputs;
  /* `live` by default: the Trash is asked for by name (`trash`), and only callers that resolve any held project
   * (a slug, an import's name check) ask for `all`. */
  const scope = options?.scope ?? 'live';
  const {
    projectListingQuery,
    discoveryObservationError,
    refreshFilesystemObservations,
    updateProject,
    getProject,
    deleteProject,
    restoreProject,
    permanentlyDeleteProject,
    isLoading: isWorkerLoading,
    duplicateProject,
    adoptProject,
    repairProject,
    chooseProjectDirectory,
    verifyProjectQuiescent: requireQuiescentProject,
    leaseQuiescentProject,
    closeProjectSession,
  } = projectManager;

  const {
    data: listing = { projects: [], conflicts: [], recoveries: [], workspaceBindingRepairs: [] },
    isLoading,
    isSuccess,
    error,
    refetch,
  } = useQuery({
    // One key for one whole-workspace discovery pass per navigation: each scope is filtered
    // below rather than scanned again under a second key (W21). The library writes it (D9).
    ...projectListingQuery,
    enabled: !isWorkerLoading,
    // No poll: worker filesystem events and cross-tab root broadcasts already
    // invalidate this key (coalesced in the project library), and the
    // default window-focus refetch covers a tab returning from the background.
    // The stale window only stops rapid navigations re-running the scan.
    staleTime: 3000,
  });

  /* Row L7: the quiescence check and the session close are library commands that ask the registry. */
  const handleDeleteProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      await requireQuiescentProject(projectId);
      await closeProjectSession(projectId);
      /* The library refetches the listing and the project's own queries (D9). */
      return deleteProject(projectId);
    },
    [closeProjectSession, deleteProject, requireQuiescentProject],
  );

  const handleRestoreProject = useCallback(
    async (projectId: string) => {
      const project = await getProject(projectId);

      if (!project) {
        throw new Error('Project not found');
      }

      await restoreProject(projectId);
    },
    [getProject, restoreProject],
  );

  const handlePermanentlyDeleteProject = useCallback(
    async (projectId: string) => {
      /* A session this tab holds is verified through it before it closes; the closed project is then held quiescent
       * by its chat-log lease until its bytes are gone (W30), so no tab can start a run in between. */
      await requireQuiescentProject(projectId);
      await closeProjectSession(projectId);
      const lease = await leaseQuiescentProject(projectId);
      try {
        // Live composer records must stop before their directory is removed, or they write it back (D11).
        await chatSessions.removeProject(projectId);
        if (lease.lost()) {
          throw new Error("Another tab opened one of this project's chats. Close it there before deleting.");
        }
        await permanentlyDeleteProject(projectId);
      } finally {
        lease.release();
      }
      // This device's view exceptions for the project go with it; a trashed project keeps them for its restore.
      viewExceptions.dropProject(projectId);
    },
    [
      chatSessions,
      closeProjectSession,
      leaseQuiescentProject,
      permanentlyDeleteProject,
      requireQuiescentProject,
      viewExceptions,
    ],
  );

  const handleDuplicateProject = useCallback(
    async (projectId: string): Promise<CreatedProject> => duplicateProject(projectId),
    [duplicateProject],
  );

  const handleAdoptProject = useCallback(
    async (locator: ProjectLocator): Promise<Project> => adoptProject(locator),
    [adoptProject],
  );

  const handleRepairProject = useCallback(
    async (projectId: string): Promise<void> => {
      await repairProject(projectId);
    },
    [repairProject],
  );

  const handleChooseProjectDirectory = useCallback(
    async (locator: ProjectLocator, projectId: string): Promise<void> => {
      // An open session reads the folder the route named when it opened.
      await closeProjectSession(projectId);
      await chooseProjectDirectory(locator, projectId);
    },
    [chooseProjectDirectory, closeProjectSession],
  );

  const handleUpdateName = useCallback(
    async (projectId: string, name: string) => {
      /* A written rename refetches the listing and the project's queries in the library (D9). */
      await updateProject(projectId, { name });
    },
    [updateProject],
  );

  return {
    projects: listing.projects.map(projectLibraryEntryToListItem).filter((project) => isInProjectScope(project, scope)),
    conflicts: listing.conflicts,
    recoveries: listing.recoveries,
    workspaceBindingRepairs: listing.workspaceBindingRepairs,
    /* The worker window counts as loading (P67): the query is disabled until
     * the object store is up, and a disabled query is pending-but-not-loading,
     * so without this every consumer reads an empty listing that never ran as
     * "no projects" — which is how the sidebar came to say `No projects yet`
     * over a project it was counting as live. */
    isLoading: isLoading || isWorkerLoading,
    /* A discovery pass has answered this listing. `isLoading` is no proof of that: a first scan that is
     * cancelled (a filesystem event cancels the key before it refetches) reverts to pending-but-idle, so for
     * that moment the listing reads empty with no load and no error, though it never finished. */
    isListed: isSuccess,
    error: discoveryObservationError
      ? new Error(discoveryObservationError)
      : error instanceof Error
        ? error
        : undefined,
    retry: async (): ReturnType<typeof refetch> => {
      refreshFilesystemObservations();
      return refetch();
    },
    verifyProjectQuiescent: requireQuiescentProject,
    deleteProject: handleDeleteProject,
    restoreProject: handleRestoreProject,
    permanentlyDeleteProject: handlePermanentlyDeleteProject,
    duplicateProject: handleDuplicateProject,
    adoptProject: handleAdoptProject,
    repairProject: handleRepairProject,
    chooseProjectDirectory: handleChooseProjectDirectory,
    updateName: handleUpdateName,
  };
}
