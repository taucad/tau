import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Project } from '@taucad/types';
import type { ProjectLocator } from '@taucad/filesystem';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { CreatedProject } from '#runtime/project-library-commands.js';
import { projectLibraryEntryToListItem } from '#types/project-library.types.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { viewExceptions } from '#workbench-records/view-exceptions.js';

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useProjects(options?: { includeDeleted?: boolean }) {
  const chatSessions = useChatSessionStore();
  const includeDeleted = options?.includeDeleted ?? false;
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
    closeProjectSession,
  } = useProjectManager();

  const {
    data: listing = { projects: [], conflicts: [], recoveries: [], workspaceBindingRepairs: [] },
    isLoading,
    isSuccess,
    error,
    refetch,
  } = useQuery({
    // One key for one whole-workspace discovery pass per navigation: the deleted rows are
    // filtered below rather than scanned again under a second key (W21). The library writes it (D9).
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
      await requireQuiescentProject(projectId);
      await closeProjectSession(projectId);
      // Live composer records must stop before their directory is removed, or they write it back (D11).
      await chatSessions.removeProject(projectId);
      await permanentlyDeleteProject(projectId);
      // This device's view exceptions for the project go with it; a trashed project keeps them for its restore.
      viewExceptions.dropProject(projectId);
    },
    [chatSessions, closeProjectSession, permanentlyDeleteProject, requireQuiescentProject],
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
    projects: listing.projects
      .map(projectLibraryEntryToListItem)
      .filter((project) => includeDeleted || project.deletedAt === undefined),
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
