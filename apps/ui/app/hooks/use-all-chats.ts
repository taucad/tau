import { useQuery } from '@tanstack/react-query';
import type { Chat } from '@taucad/chat';
import { useProjectManager } from '#hooks/use-project-manager.js';

type AllChatsResult = {
  readonly chats: Chat[];
  readonly isLoading: boolean;
  readonly error: Error | undefined;
};

/** Non-deleted global chat inventory for command-palette navigation. */
export function useAllChats(): AllChatsResult {
  const { getAllChats, isLoading: isWorkerLoading } = useProjectManager();
  const {
    data: chats = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['all-chats'],
    queryFn: async () => getAllChats(),
    enabled: !isWorkerLoading,
  });

  return {
    chats,
    isLoading: isWorkerLoading || isLoading,
    error: error instanceof Error ? error : undefined,
  };
}
