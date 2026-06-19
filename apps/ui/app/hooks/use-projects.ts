import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Project } from '@taucad/types';
import { useProjectManager } from '#hooks/use-project-manager.js';

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useProjects(options?: { includeDeleted?: boolean }) {
  const queryClient = useQueryClient();
  const includeDeleted = options?.includeDeleted ?? false;
  const {
    getProjects,
    updateProject,
    getProject,
    deleteProject,
    isLoading: isWorkerLoading,
    duplicateProject,
  } = useProjectManager();

  const {
    data: projects = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['projects', { includeDeleted }],
    async queryFn() {
      return getProjects({ includeDeleted });
    },
    enabled: !isWorkerLoading,
  });

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      await deleteProject(projectId);
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
    [deleteProject, queryClient],
  );

  const handleRestoreProject = useCallback(
    async (projectId: string) => {
      const project = await getProject(projectId);

      if (!project) {
        throw new Error('Project not found');
      }

      const restored = await updateProject(projectId, { deletedAt: undefined });
      if (restored) {
        void queryClient.invalidateQueries({ queryKey: ['projects'] });
        void queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      }
    },
    [getProject, updateProject, queryClient],
  );

  const handleDuplicateProject = useCallback(
    async (projectId: string): Promise<Project> => {
      const newProject = await duplicateProject(projectId);

      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      return newProject;
    },
    [duplicateProject, queryClient],
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
    projects,
    isLoading,
    error: error instanceof Error ? error.message : undefined,
    deleteProject: handleDeleteProject,
    restoreProject: handleRestoreProject,
    duplicateProject: handleDuplicateProject,
    updateName: handleUpdateName,
  };
}
