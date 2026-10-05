import { filesystemSourceIdentity } from '#services/filesystem-source-identity.js';
import { useQuery } from '@tanstack/react-query';
import type { ChatRecord } from '@taucad/chat/schemas';
import { useProjectManager } from '#hooks/use-project-manager.js';

type AllChatsResult = {
  readonly chats: ChatRecord[];
  readonly isLoading: boolean;
  readonly error: Error | undefined;
};

/** Non-deleted global chat inventory for command-palette navigation. */
export function useAllChats(): AllChatsResult {
  const { getAllChatRecords, isLoading: isWorkerLoading } = useProjectManager();
  const {
    data: chats = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['all-chats', 'records', filesystemSourceIdentity(getAllChatRecords)],
    queryFn: async ({ signal }) => {
      const records = await getAllChatRecords();
      signal.throwIfAborted();
      return records;
    },
    enabled: !isWorkerLoading,
  });

  return {
    chats,
    isLoading: isWorkerLoading || isLoading,
    error: error instanceof Error ? error : undefined,
  };
}
