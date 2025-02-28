import { Build } from '@/types/build';
import { storage } from '@/db/storage';
import { useQuery } from '@tanstack/react-query';

// Function to fetch builds
export const fetchBuilds = async (): Promise<Build[]> => {
  const clientBuilds = storage.getBuilds();
  if (!clientBuilds) {
    throw new Error('Builds not found');
  }
  return clientBuilds;
};

export function useBuilds() {
  const {
    data: builds = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['builds'],
    queryFn: fetchBuilds,
  });

  return {
    builds,
    isLoading,
    error: error instanceof Error ? error.message : undefined,
  };
}
