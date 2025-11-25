import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Build } from '@taucad/types';
import { useBuildManager } from '#hooks/use-build-manager.js';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useBuilds(options?: { includeDeleted?: boolean }) {
  const queryClient = useQueryClient();
  const includeDeleted = options?.includeDeleted ?? false;
  const {
    getBuilds,
    updateBuild,
    getBuild,
    deleteBuild,
    isLoading: isWorkerLoading,
    duplicateBuild,
  } = useBuildManager();

  const {
    data: builds = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['builds', { includeDeleted }],
    async queryFn() {
      return getBuilds({ includeDeleted });
    },
    enabled: !isWorkerLoading,
  });

  const handleDeleteBuild = useCallback(
    async (buildId: string) => {
      await deleteBuild(buildId);
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
    [deleteBuild, queryClient],
  );

  const handleRestoreBuild = useCallback(
    async (buildId: string) => {
      const build = await getBuild(buildId);

      if (!build) {
        throw new Error('Build not found');
      }

      await updateBuild(buildId, { deletedAt: undefined });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
    [getBuild, updateBuild, queryClient],
  );

  const handleDuplicateBuild = useCallback(
    async (buildId: string): Promise<Build> => {
      const newBuild = await duplicateBuild(buildId);

      void queryClient.invalidateQueries({ queryKey: ['builds'] });
      return newBuild;
    },
    [duplicateBuild, queryClient],
  );

  const handleUpdateName = useCallback(
    async (buildId: string, name: string) => {
      await updateBuild(buildId, { name });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },
    [updateBuild, queryClient],
  );

  return {
    builds,
    isLoading,
    error: error instanceof Error ? error.message : undefined,
    deleteBuild: handleDeleteBuild,
    restoreBuild: handleRestoreBuild,
    duplicateBuild: handleDuplicateBuild,
    updateName: handleUpdateName,
  };
}
