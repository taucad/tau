import { Build } from '@/types/build';
import { mockModels } from '@/components/mock-code';
import { storage } from '@/db/storage';
import { useQuery } from '@tanstack/react-query';

// Sample data
export const sampleBuilds: Build[] = mockModels.map((model) => ({
  id: model.id,
  assets: {
    mechanical: {
      files: { 'model.ts': { content: model.code } },
      main: 'model.ts',
      language: 'replicad' as const,
      parameters: {},
    },
  },
  name: model.name,
  description: `A 3D ${model.name} model built with Replicad`,
  author: {
    name: 'Replicad Team',
    avatar: '/avatar-sample.png',
  },
  version: '1.0.0',
  createdAt: 1_740_702_000_000,
  updatedAt: 1_740_702_000_000,
  tags: ['3d-printing', 'parametric', 'replicad'],
  isFavorite: false,
  stars: 0,
  forks: 0,
  thumbnail: '/placeholder.svg',
  messages: [],
}));

// Function to fetch builds
export const fetchBuilds = async (): Promise<Build[]> => {
  const clientBuilds = storage.getBuilds();
  if (!clientBuilds) {
    throw new Error('Builds not found');
  }
  return [...clientBuilds, ...sampleBuilds];
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
