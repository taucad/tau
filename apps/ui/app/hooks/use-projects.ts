import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { ProjectManifest } from '@taucad/types';
import type { ProjectLocator } from '@taucad/filesystem';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { CreatedProject } from '#hooks/use-project-manager.js';
import { projectLibraryEntryToListItem } from '#types/project.types.js';

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useProjects(options?: { includeDeleted?: boolean }) {
  const queryClient = useQueryClient();
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
    data: listing = { projects: [], conflicts: [], recoveries: [] },
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

  const handleDeleteProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      const trashed = await deleteProject(projectId);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      return trashed;
    },
    [deleteProject, queryClient],
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
      await permanentlyDeleteProject(projectId);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.removeQueries({ queryKey: ['project', projectId] });
    },
    [permanentlyDeleteProject, queryClient],
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
    isLoading,
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
