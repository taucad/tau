import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { Message } from '@ai-sdk/react';
import { storage } from '~/db/storage.js';
import type { Build } from '~/types/build.js';
import { createBuildMutations } from '~/hooks/build-mutations.js';

// Function to fetch builds
const fetchBuild = async (buildId: string): Promise<Build> => {
  const clientBuild = await storage.getBuild(buildId);

  if (clientBuild) {
    return clientBuild;
  }

  throw new Error('Build not found');
};

type BuildContextType = {
  isLoading: boolean;
  build: Build | undefined;
  error: unknown;
  code: string;
  parameters: Record<string, unknown>;
  setCode: (code: string) => void;
  setParameters: (parameters: Record<string, unknown>) => void;
  setMessages: (messages: Message[]) => void;
  updateName: (name: string) => void;
  updateThumbnail: (thumbnail: string) => void;
};

const BuildContext = createContext<BuildContextType | undefined>(undefined);

export function BuildProvider({
  children,
  buildId,
}: {
  readonly children: ReactNode;
  readonly buildId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const mutations = useMemo(() => createBuildMutations(queryClient), [queryClient]);

  // Query for fetching build data
  const buildQuery = useQuery({
    queryKey: ['build', buildId],
    queryFn: async () => fetchBuild(buildId),
  });

  const value = useMemo(() => {
    const { data, isLoading, error } = buildQuery;

    return {
      build: data,
      isLoading,
      error,
      code: data?.assets.mechanical?.files[data.assets.mechanical.main]?.content ?? '',
      parameters: data?.assets.mechanical?.parameters ?? {},
      setCode: async (code: string) => mutations.updateCode(buildId, code),
      setParameters: async (parameters: Record<string, unknown>) => mutations.updateParameters(buildId, parameters),
      setMessages: async (messages: Message[]) => mutations.updateMessages(buildId, messages),
      updateName: async (name: string) => mutations.updateName(buildId, name),
      updateThumbnail: async (thumbnail: string) => mutations.updateThumbnail(buildId, thumbnail),
    };
  }, [buildQuery, mutations, buildId]);

  return <BuildContext.Provider value={value}>{children}</BuildContext.Provider>;
}

export function useBuild(): BuildContextType {
  const context = useContext(BuildContext);
  if (context === undefined) {
    throw new Error('useBuild must be used within a BuildProvider');
  }

  return context;
}
