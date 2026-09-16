import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { ProjectManifest } from '@taucad/types';
import type { ProjectLocator } from '@taucad/filesystem';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { CreatedProject } from '#hooks/use-project-manager.js';
import { projectLibraryEntryToListItem } from '#types/project.types.js';
import { useSessions } from '#hooks/use-sessions.js';

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useProjects(options?: { includeDeleted?: boolean }) {
  const queryClient = useQueryClient();
  const sessions = useSessions();
  const includeDeleted = options?.includeDeleted ?? false;
  const {
    getProjectListing,
    updateProject,
    getProject,
    deleteProject,
    restoreProject,
    permanentlyDeleteProject,
    isLoading: isWorkerLoading,
    duplicateProject,
    adoptProject,
  } = useProjectManager();

  const {
    data: listing = { projects: [], conflicts: [], recoveries: [], workspaceBindingRepairs: [] },
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['projects', { includeDeleted }],
    async queryFn() {
      return getProjectListing({ includeDeleted });
    },
    enabled: !isWorkerLoading,
    // No poll: worker filesystem events and cross-tab root broadcasts already
    // invalidate this key (debounced in ProjectManagerProvider), and the
    // default window-focus refetch covers a tab returning from the background.
    // The stale window only stops rapid navigations re-running the scan.
    staleTime: 3000,
  });

  const closeProjectSession = useCallback(
    async (projectId: string): Promise<void> => {
      if (sessions.getSnapshot().context.refs[projectId] === undefined) {
        return;
      }
      await new Promise<void>((resolve) => {
        const subscription = sessions.subscribe((snapshot) => {
          if (snapshot.context.refs[projectId] === undefined) {
            subscription.unsubscribe();
            resolve();
          }
        });
        sessions.send({ type: 'close', projectId, reason: 'user' });
      });
    },
    [sessions],
  );

  const handleDeleteProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      await closeProjectSession(projectId);
      const trashed = await deleteProject(projectId);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      return trashed;
    },
    [closeProjectSession, deleteProject, queryClient],
  );

  const handleRestoreProject = useCallback(
    async (projectId: string) => {
      const project = await getProject(projectId);

      if (!project) {
        throw new Error('Project not found');
      }

      await restoreProject(projectId);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    [getProject, restoreProject, queryClient],
  );

  const handlePermanentlyDeleteProject = useCallback(
    async (projectId: string) => {
      await closeProjectSession(projectId);
      await permanentlyDeleteProject(projectId);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.removeQueries({ queryKey: ['project', projectId] });
    },
    [closeProjectSession, permanentlyDeleteProject, queryClient],
  );

  const handleDuplicateProject = useCallback(
    async (projectId: string): Promise<CreatedProject> => {
      const newProject = await duplicateProject(projectId);

      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      return newProject;
    },
    [duplicateProject, queryClient],
  );

  const handleAdoptProject = useCallback(
    async (locator: ProjectLocator): Promise<ProjectManifest> => {
      const adopted = await adoptProject(locator);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      return adopted;
    },
    [adoptProject, queryClient],
  );

  const handleUpdateName = useCallback(
    async (projectId: string, name: string) => {
      const updated = await updateProject(projectId, { name });
      if (updated) {
        void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        void queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
    },
    [updateProject, queryClient],
  );

  return {
    projects: listing.projects.map(projectLibraryEntryToListItem),
    conflicts: listing.conflicts,
    recoveries: listing.recoveries,
    workspaceBindingRepairs: listing.workspaceBindingRepairs,
    /* The worker window counts as loading (P67): the query is disabled until
     * the object store is up, and a disabled query is pending-but-not-loading,
     * so without this every consumer reads an empty listing that never ran as
     * "no projects" — which is how the sidebar came to say `No projects yet`
     * over a project it was counting as live. */
    isLoading: isLoading || isWorkerLoading,
    error: error instanceof Error ? error : undefined,
    retry: refetch,
    deleteProject: handleDeleteProject,
    restoreProject: handleRestoreProject,
    permanentlyDeleteProject: handlePermanentlyDeleteProject,
    duplicateProject: handleDuplicateProject,
    adoptProject: handleAdoptProject,
    updateName: handleUpdateName,
  };
}
