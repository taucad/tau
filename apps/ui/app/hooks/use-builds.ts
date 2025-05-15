import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Build } from '~/types/build.js';
import { storage } from '~/db/storage.js';

// Function to fetch builds
export const fetchBuilds = async (options?: { includeDeleted?: boolean }): Promise<Build[]> => {
  const clientBuilds = await storage.getBuilds({ includeDeleted: options?.includeDeleted ?? false });
  if (!clientBuilds) {
    throw new Error('Builds not found');
  }

  return clientBuilds;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useBuilds(options?: { includeDeleted?: boolean }) {
  const queryClient = useQueryClient();
  const includeDeleted = options?.includeDeleted ?? false;

  const {
    data: builds = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['builds', { includeDeleted }],
    queryFn: async () => fetchBuilds(options),
  });

  const deleteMutation = useMutation({
    mutationFn: async (buildId: string) => storage.deleteBuild(buildId),
    async onSuccess() {
      // Invalidate and refetch builds after deletion
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },
  });

  // Add restore mutation for restoring deleted builds
  const restoreMutation = useMutation({
    async mutationFn(buildId: string) {
      // Get the build first
      const build = await storage.getBuild(buildId);
      if (!build) {
        throw new Error('Build not found');
      }

      // Remove the deletedAt property by setting it to undefined
      return storage.updateBuild(buildId, { deletedAt: undefined });
    },
    async onSuccess() {
      // Invalidate and refetch builds after restoration
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

  // Function to reload builds with specific options
  const loadBuilds = (loadOptions?: { includeDeleted?: boolean }) => {
    void queryClient.invalidateQueries({
      queryKey: ['builds', { includeDeleted: loadOptions?.includeDeleted ?? includeDeleted }],
    });
  };

  return {
    builds,
    isLoading,
    error: error instanceof Error ? error.message : undefined,
    deleteBuild: deleteMutation.mutate,
    restoreBuild: restoreMutation.mutate,
    duplicateBuild: duplicateMutation.mutateAsync,
    loadBuilds,
  };
}
