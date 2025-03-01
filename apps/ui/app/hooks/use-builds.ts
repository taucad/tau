import { Build } from '@/types/build';
import { storage } from '@/db/storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Function to fetch builds
export const fetchBuilds = async (): Promise<Build[]> => {
  const clientBuilds = storage.getBuilds();
  if (!clientBuilds) {
    throw new Error('Builds not found');
  }
  return clientBuilds;
};

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
    mutationFn: (buildId: string) => storage.deleteBuild(buildId),
    onSuccess: () => {
      // Invalidate and refetch builds after deletion
      queryClient.invalidateQueries({ queryKey: ['builds'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (buildId: string) => {
      const sourceBuild = storage.getBuild(buildId);
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
    onSuccess: (createdBuild) => {
      queryClient.invalidateQueries({ queryKey: ['builds'] });
      return createdBuild;
    },
    onError: (error) => {
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
