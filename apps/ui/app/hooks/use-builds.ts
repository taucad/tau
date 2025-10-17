import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Build } from '@taucad/types';
import { storage } from '#db/storage.js';
import { createBuildMutations } from '#hooks/build-mutations.js';

// Function to fetch builds
export const fetchBuilds = async (options?: { includeDeleted?: boolean }): Promise<Build[]> => {
  const clientBuilds = await storage.getBuilds({ includeDeleted: options?.includeDeleted ?? false });
  return clientBuilds;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useBuilds(options?: { includeDeleted?: boolean }) {
  const queryClient = useQueryClient();
  const includeDeleted = options?.includeDeleted ?? false;
  const mutations = useMemo(() => createBuildMutations(queryClient), [queryClient]);

  const {
    data: builds = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['builds', { includeDeleted }],
    queryFn: async () => fetchBuilds(options),
  });

  return {
    builds,
    isLoading,
    error: error instanceof Error ? error.message : undefined,
    deleteBuild: mutations.deleteBuild,
    restoreBuild: mutations.restoreBuild,
    duplicateBuild: mutations.duplicateBuild,
    updateName: mutations.updateName,
  };
}
