import { useQuery } from '@tanstack/react-query';
import type { ChatRecord } from '@taucad/chat/schemas';
import { useProjectManager } from '#hooks/use-project-manager.js';

/** Chat metadata for navigation surfaces that do not display transcripts. */
export function useChatRecords(
  resourceId: string,
  options?: { includeDeleted?: boolean },
): {
  readonly chats: ChatRecord[];
  readonly isLoading: boolean;
  readonly error: string | undefined;
} {
  const { getChatRecordsForResource, isLoading: isWorkerLoading } = useProjectManager();
  const includeDeleted = options?.includeDeleted ?? false;
  const {
    data: chats = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['chats', resourceId, 'records', { includeDeleted }],
    queryFn: async () => getChatRecordsForResource(resourceId, { includeDeleted }),
    enabled: !isWorkerLoading && Boolean(resourceId),
  });

  return { chats, isLoading: isWorkerLoading || isLoading, error: error instanceof Error ? error.message : undefined };
}
