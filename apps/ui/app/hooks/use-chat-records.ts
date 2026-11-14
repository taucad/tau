import { filesystemSourceIdentity } from '@taucad/ui-core/services/filesystem-source-identity';
import { useQuery } from '@tanstack/react-query';
import type { ChatRecord } from '@taucad/chat/schemas';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectListShapeStore } from '#lib/project-list-shape.lib.js';
import { isUnownedChatObservation } from '@taucad/ui-core/lib/chat-observation-guard';

/** Chat metadata for navigation surfaces that do not display transcripts. */
export function useChatRecords(
  resourceId: string,
  options?: { includeDeleted?: boolean; enabled?: boolean },
): {
  readonly chats: ChatRecord[];
  readonly isLoading: boolean;
  readonly error: string | undefined;
  readonly retry: () => Promise<unknown>;
} {
  const {
    getChatRecordsForResource,
    isLoading: isWorkerLoading,
    getMetadataObservationError,
    refreshFilesystemObservations,
  } = useProjectManager();
  const includeDeleted = options?.includeDeleted ?? false;
  const {
    data: chats = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['chats', resourceId, 'records', filesystemSourceIdentity(getChatRecordsForResource), { includeDeleted }],
    queryFn: async ({ signal }) => {
      const records = await getChatRecordsForResource(resourceId, { includeDeleted });
      signal.throwIfAborted();
      /* A13: remember the sidebar's chat rows, so the next load draws them before this listing answers. */
      projectListShapeStore.rememberChats(resourceId, records, (chatId) => !isUnownedChatObservation(chatId));
      return records;
    },
    enabled: options?.enabled !== false && !isWorkerLoading && Boolean(resourceId),
  });

  return {
    chats,
    isLoading: isWorkerLoading || isLoading,
    error: getMetadataObservationError(resourceId) ?? (error instanceof Error ? error.message : undefined),
    retry: async () => {
      refreshFilesystemObservations(resourceId);
      return refetch();
    },
  };
}
