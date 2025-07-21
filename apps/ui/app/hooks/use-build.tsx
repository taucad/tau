import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';
import type { Message } from '@ai-sdk/react';
import { storage } from '~/db/storage.js';
import type { Build, Chat } from '~/types/build.types.js';
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
  activeChat: Chat | undefined;
  activeChatId: string | undefined;
  setChatMessages: (chatId: string, messages: Message[]) => void;
  setCodeParameters: (files: Record<string, { content: string }>, parameters: Record<string, unknown>) => void;
  updateName: (name: string) => void;
  updateThumbnail: (thumbnail: string) => void;
  // Chat related functions
  addChat: (initialMessages?: Message[]) => Promise<Chat>;
  setActiveChat: (chatId: string) => void;
  updateChatName: (chatId: string, name: string) => void;
  deleteChat: (chatId: string) => Promise<void>;
};

const BuildContext = createContext<BuildContextType | undefined>(undefined);

export function BuildProvider({
  children,
  buildId,
}: {
  readonly children: ReactNode;
  readonly buildId: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const mutations = useMemo(() => createBuildMutations(queryClient), [queryClient]);

  // Query for fetching build data
  const buildQuery = useQuery({
    queryKey: ['build', buildId],
    queryFn: async () => fetchBuild(buildId),
  });

  const value = useMemo(() => {
    const { data, isLoading, error } = buildQuery;

    const activeChatId = data?.lastChatId;
    const activeChat = data?.chats.find((chat) => chat.id === activeChatId);

    return {
      build: data,
      isLoading,
      error,
      code: data?.assets.mechanical?.files[data.assets.mechanical.main]?.content ?? '',
      parameters: data?.assets.mechanical?.parameters ?? {},
      activeChatId,
      activeChat,
      async setChatMessages(chatId: string, messages: Message[]) {
        await mutations.updateChatMessages(buildId, chatId, messages);
      },
      setCodeParameters: async (files: Record<string, { content: string }>, parameters: Record<string, unknown>) =>
        mutations.updateCodeParameters(buildId, files, parameters),
      updateName: async (name: string) => mutations.updateName(buildId, name),
      updateThumbnail: async (thumbnail: string) => mutations.updateThumbnail(buildId, thumbnail),
      // Chat related functions
      async addChat(initialMessages?: Message[]) {
        const newChat = await mutations.addChat(buildId, initialMessages);
        return newChat;
      },
      setActiveChat(chatId: string) {
        void mutations.setActiveChat(buildId, chatId);
      },
      async updateChatName(chatId: string, name: string) {
        return mutations.updateChatName(buildId, chatId, name);
      },
      async deleteChat(chatId: string) {
        return mutations.deleteChat(buildId, chatId);
      },
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

// New selector hook that allows selecting specific properties from the build
export function useBuildSelector<T>(selector: (state: BuildContextType) => T): T {
  const buildContext = useBuild();

  // Use useMemo to only recompute when the selected value changes
  return useMemo(() => selector(buildContext), [buildContext, selector]);
}
