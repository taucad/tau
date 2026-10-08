import { filesystemSourceIdentity } from '#services/filesystem-source-identity.js';
import { useQuery } from '@tanstack/react-query';
import type { ChatRecord } from '@taucad/chat/schemas';
import { useProjectManager } from '#hooks/use-project-manager.js';

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
    metadataObservationError,
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
      return records;
    },
    enabled: options?.enabled !== false && !isWorkerLoading && Boolean(resourceId),
  });

  return {
    chats,
    isLoading: isWorkerLoading || isLoading,
    error: metadataObservationError ?? (error instanceof Error ? error.message : undefined),
    retry: async () => {
      refreshFilesystemObservations();
      return refetch();
    },
  };
}
