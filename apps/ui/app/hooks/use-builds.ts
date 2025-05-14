import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Build } from '~/types/build.js';
import { storage } from '~/db/storage.js';

// Function to fetch builds
export const fetchBuilds = async (): Promise<Build[]> => {
  const clientBuilds = await storage.getBuilds();
  if (!clientBuilds) {
    throw new Error('Builds not found');
  }

  return clientBuilds;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useBuilds() {
  const queryClient = useQueryClient();

  const {
    data: builds = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['builds'],
    queryFn: fetchBuilds,
  });

  const deleteMutation = useMutation({
    mutationFn: async (buildId: string) => storage.deleteBuild(buildId),
    async onSuccess() {
      // Invalidate and refetch builds after deletion
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },
  });

  const duplicateMutation = useMutation({
    async mutationFn(buildId: string) {
      const sourceBuild = await storage.getBuild(buildId);
      if (!sourceBuild) {
        throw new Error('Build not found');
      }

      return storage.createBuild({
        name: `${sourceBuild.name} (Copy)`,
        description: sourceBuild.description,
        thumbnail: sourceBuild.thumbnail,
        stars: 0,
        forks: 0,
        author: sourceBuild.author,
        tags: sourceBuild.tags || [],
        assets: sourceBuild.assets,
        messages: sourceBuild.messages || [],
      });
    },
    onSuccess(createdBuild) {
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
      return createdBuild;
    },
    onError(error) {
      console.error('Failed to duplicate build:', error);
      throw error;
    },
  });

  return {
    builds,
    isLoading,
    error: error instanceof Error ? error.message : undefined,
    deleteBuild: deleteMutation.mutate,
    duplicateBuild: duplicateMutation.mutateAsync,
  };
}
