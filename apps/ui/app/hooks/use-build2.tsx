import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { Message } from '@ai-sdk/react';
import { storage } from '@/db/storage.js';
import type { Build } from '@/types/build.js';

// Function to fetch builds
const fetchBuild = async (buildId: string): Promise<Build> => {
  const clientBuild = storage.getBuild(buildId);

  if (clientBuild) {
    return clientBuild;
  }

  throw new Error('Build not found');
};

type BuildContextType = {
  build: Build | undefined;
  isLoading: boolean;
  error: Error | undefined;
  code: string;
  parameters: Record<string, unknown>;
  setCode: (code: string) => void;
  setParameters: (parameters: Record<string, unknown>) => void;
  setMessages: (messages: Message[]) => void;
  updateName: (name: string) => void;
  updateThumbnail: (thumbnail: string) => void;
};

const BuildContext = createContext<BuildContextType | undefined>(undefined);

export function BuildProvider({ children, buildId }: { readonly children: ReactNode; readonly buildId: string }) {
  const queryClient = useQueryClient();

  // Query for fetching build data
  const buildQuery = useQuery({
    queryKey: ['build', buildId],
    queryFn: async () => fetchBuild(buildId),
  });

  // Mutation for updating code
  const codeUpdate = useMutation({
    mutationFn: async (code: string) =>
      storage.updateBuild(buildId, {
        assets: {
          mechanical: {
            files: {
              // eslint-disable-next-line @typescript-eslint/naming-convention -- filenames include extensions
              'model.ts': {
                content: code,
              },
            },
          },
        },
      }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  // Mutation for updating parameters
  const parameterUpdate = useMutation({
    async mutationFn(parameters: Record<string, unknown>) {
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
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  // Mutation for updating messages
  const messageUpdate = useMutation({
    async mutationFn(messages: Message[]) {
      return storage.updateBuild(
        buildId,
        {
          messages,
        },
        { ignoreKeys: ['messages'] },
      );
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  // Mutation for updating name
  const nameUpdate = useMutation({
    async mutationFn(name: string) {
      return storage.updateBuild(buildId, { name });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },
  });

  // Mutation for updating thumbnail
  const thumbnailUpdate = useMutation({
    async mutationFn(thumbnail: string) {
      return storage.updateBuild(buildId, { thumbnail });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  });

  const build = buildQuery.data;

  const value = useMemo(
    () => ({
      build,
      isLoading: buildQuery.isLoading,
      error: buildQuery.error as Error | undefined,
      code: build?.assets.mechanical?.files[build.assets.mechanical.main]?.content ?? '',
      parameters: build?.assets.mechanical?.parameters ?? {},
      setCode: codeUpdate.mutate,
      setParameters: parameterUpdate.mutate,
      setMessages: messageUpdate.mutate,
      updateName: nameUpdate.mutate,
      updateThumbnail: thumbnailUpdate.mutate,
    }),
    [
      build,
      buildQuery.isLoading,
      buildQuery.error,
      codeUpdate.mutate,
      parameterUpdate.mutate,
      messageUpdate.mutate,
      nameUpdate.mutate,
      thumbnailUpdate.mutate,
    ],
  );

  return <BuildContext.Provider value={value}>{children}</BuildContext.Provider>;
}

export function useBuild() {
  const context = useContext(BuildContext);
  if (context === undefined) {
    throw new Error('useBuild must be used within a BuildProvider');
  }

  return context;
}
