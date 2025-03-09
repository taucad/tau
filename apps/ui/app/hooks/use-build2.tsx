import { storage } from '@/db/storage';
import type { Build } from '@/types/build';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, ReactNode } from 'react';
import { Message } from '@/types/chat';

// Function to fetch builds
const fetchBuild = async (buildId: string): Promise<Build> => {
  const clientBuild = storage.getBuild(buildId);

  if (clientBuild) {
    return clientBuild;
  } else {
    throw new Error('Build not found');
  }
};

interface BuildContextType {
  build: Build | undefined;
  isLoading: boolean;
  error: Error | null;
  code: string;
  parameters: Record<string, unknown>;
  name: string;
  setCode: (code: string) => void;
  setParameters: (parameters: Record<string, unknown>) => void;
  setMessages: (messages: Message[]) => void;
  updateName: (name: string) => void;
  updateThumbnail: (thumbnail: string) => void;
}

const BuildContext = createContext<BuildContextType | undefined>(undefined);

export function BuildProvider({ children, buildId }: { children: ReactNode; buildId: string }) {
  const queryClient = useQueryClient();

  // Query for fetching build data
  const buildQuery = useQuery({
    queryKey: ['build', buildId],
    queryFn: () => fetchBuild(buildId),
  });

  // Mutation for updating code
  const codeUpdate = useMutation({
    mutationFn: (code: string) =>
      storage.updateBuild(buildId, {
        assets: {
          mechanical: {
            files: {
              'model.ts': {
                content: code,
              },
            },
          },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  // Mutation for updating parameters
  const parameterUpdate = useMutation({
    mutationFn: (parameters: Record<string, unknown>) => {
      return storage.updateBuild(
        buildId,
        {
          assets: {
            mechanical: {
              parameters,
            },
          },
        },
        { ignoreKeys: ['parameters'] },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  // Mutation for updating messages
  const messageUpdate = useMutation({
    mutationFn: (messages: Message[]) => {
      return storage.updateBuild(
        buildId,
        {
          messages,
        },
        { ignoreKeys: ['messages'] },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  // Mutation for updating name
  const nameUpdate = useMutation({
    mutationFn: (name: string) => {
      return storage.updateBuild(buildId, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  // Mutation for updating thumbnail
  const thumbnailUpdate = useMutation({
    mutationFn: (thumbnail: string) => {
      return storage.updateBuild(buildId, { thumbnail });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  const build = buildQuery.data;
  const code = build?.assets.mechanical?.files[build.assets.mechanical.main]?.content || '';
  const parameters = build?.assets.mechanical?.parameters || {};

  const value = {
    build,
    isLoading: buildQuery.isLoading,
    error: buildQuery.error as Error | null,
    code,
    parameters,
    name: build?.name || '',
    setCode: codeUpdate.mutate,
    setParameters: parameterUpdate.mutate,
    setMessages: messageUpdate.mutate,
    updateName: nameUpdate.mutate,
    updateThumbnail: thumbnailUpdate.mutate,
  };

  return <BuildContext.Provider value={value}>{children}</BuildContext.Provider>;
}

export function useBuild() {
  const context = useContext(BuildContext);
  if (context === undefined) {
    throw new Error('useBuild must be used within a BuildProvider');
  }
  return context;
}
