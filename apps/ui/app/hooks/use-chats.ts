import { filesystemSourceIdentity } from '#services/filesystem-source-identity.js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { PartialDeep } from 'type-fest';
import type { Chat } from '@taucad/chat';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import type { ChatHistoricalUsage, ChatSessionStore } from '#services/chat-session-store.js';

/** Keep an observation slot until its host read settles, without holding every project log open. */
const waitForUsageProjection = async ({
  store,
  chatId,
  projectId,
  signal,
}: {
  store: ChatSessionStore;
  chatId: string;
  projectId: string;
  signal: AbortSignal;
}): Promise<boolean> =>
  new Promise((resolve) => {
    let unsubscribe = (): void => undefined;
    const finish = (ready: boolean): void => {
      clearTimeout(usageWaitTimeout);
      unsubscribe();
      signal.removeEventListener('abort', check);
      resolve(ready);
    };
    const check = (): void => {
      const attachment = store.getAttachmentStatus(chatId);
      if (signal.aborted || attachment === 'refused' || attachment === 'lost') {
        finish(false);
      } else if (store.historicalUsageReady(chatId, projectId)) {
        finish(true);
      }
    };
    const usageWaitTimeout = setTimeout(() => {
      finish(false);
    }, 15_000);
    unsubscribe = store.subscribeProjection(chatId, check);
    signal.addEventListener('abort', check, { once: true });
    check();
  });

/** Projected host-log usage, computed only for views that request it. */
export function useProjectChatUsage(
  resourceId: string,
  chatIds: readonly string[],
  enabled = true,
): ReadonlyMap<string, ChatHistoricalUsage> {
  const store = useChatSessionStore();
  const [usage, setUsage] = useState<ReadonlyMap<string, ChatHistoricalUsage>>(() => new Map());

  useEffect(() => {
    if (!enabled || !resourceId) {
      return;
    }
    let stopped = false;
    const controller = new AbortController();
    let active = 0;
    const activeIds = new Set<string>();
    const readingIds = new Set<string>();
    const dirtyIds = new Set<string>();
    const pending = new Set<string>();
    const retries = new Map<string, ReturnType<typeof setTimeout>>();
    async function load(chatId: string): Promise<void> {
      let release = (): void => undefined;
      let complete = false;
      try {
        release = store.observe(chatId, resourceId);
        const ready = await waitForUsageProjection({ store, chatId, projectId: resourceId, signal: controller.signal });
        if (controller.signal.aborted || !ready) {
          return;
        }
        readingIds.add(chatId);
        const summary = await store.getHistoricalUsage(chatId);
        if (!stopped && !dirtyIds.has(chatId)) {
          complete = true;
          setUsage((previous) => {
            if (previous.get(chatId) === summary) {
              return previous;
            }
            return new Map(previous).set(chatId, summary);
          });
        }
      } catch (error) {
        console.warn('[Chat] historical usage could not be read', chatId, error);
      } finally {
        readingIds.delete(chatId);
        release();
        active--;
        activeIds.delete(chatId);
        if (!stopped) {
          if (dirtyIds.delete(chatId)) {
            pending.add(chatId);
          }
          pump();
          if (!complete && !pending.has(chatId) && !activeIds.has(chatId)) {
            const retry = setTimeout(() => {
              retries.delete(chatId);
              enqueue(chatId);
            }, 1000);
            retries.set(chatId, retry);
          }
        }
      }
    }
    function pump(): void {
      while (active < 4 && pending.size > 0) {
        const chatId = pending.values().next().value!;
        pending.delete(chatId);
        active++;
        activeIds.add(chatId);
        void load(chatId);
      }
    }
    const enqueue = (chatId: string): void => {
      const retry = retries.get(chatId);
      if (retry !== undefined) {
        clearTimeout(retry);
        retries.delete(chatId);
      }
      if (activeIds.has(chatId)) {
        if (readingIds.has(chatId)) {
          dirtyIds.add(chatId);
        }
        return;
      }
      pending.add(chatId);
      pump();
    };
    const unsubscribers = chatIds.map((chatId) =>
      store.subscribeProjection(chatId, () => {
        enqueue(chatId);
      }),
    );
    for (const chatId of chatIds) {
      enqueue(chatId);
    }
    return () => {
      stopped = true;
      controller.abort();
      for (const retry of retries.values()) {
        clearTimeout(retry);
      }
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [chatIds, enabled, resourceId, store]);

  return usage;
}

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useChats(resourceId: string, options?: { includeDeleted?: boolean; enabled?: boolean }) {
  const queryClient = useQueryClient();
  const includeDeleted = options?.includeDeleted ?? false;
  const {
    getChatsForResource,
    metadataObservationError,
    refreshFilesystemObservations,
    getChat,
    createChat: createChatInManager,
    updateChat: updateChatInManager,
    applyGeneratedChatName: applyGeneratedChatNameInManager,
    patchChat: patchChatInManager,
    softDeleteChat: softDeleteChatInManager,
    deleteChat: deleteChatInManager,
    purgeChat: purgeChatInManager,
    isLoading: isWorkerLoading,
  } = useProjectManager();
  const chatSessions = useChatSessionStore();

  const {
    data: chats = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['chats', resourceId, filesystemSourceIdentity(getChatsForResource), { includeDeleted }],
    async queryFn({ signal }) {
      const records = await getChatsForResource(resourceId, { includeDeleted });
      signal.throwIfAborted();
      return records;
    },
    enabled: options?.enabled !== false && !isWorkerLoading && Boolean(resourceId),
  });

  const createChat = useCallback(
    async (chatData: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt'>): Promise<Chat> => {
      const newChat = await createChatInManager(resourceId, chatData);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
      return newChat;
    },
    [createChatInManager, resourceId, queryClient],
  );

  const updateChat = useCallback(
    async (chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> => {
      const updatedChat = await updateChatInManager(chatId, update);
      if (updatedChat) {
        void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
        void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
        void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      }
      return updatedChat;
    },
    [updateChatInManager, resourceId, queryClient],
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<void> => {
      // A live composer must stop writing before its record is removed, or it writes the record back (D11).
      await chatSessions.removeChat(chatId);
      await deleteChatInManager(chatId);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    },
    [chatSessions, deleteChatInManager, resourceId, queryClient],
  );

  const purgeChat = useCallback(
    async (chatId: string): Promise<void> => {
      await chatSessions.removeChat(chatId);
      await purgeChatInManager(chatId);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    },
    [chatSessions, purgeChatInManager, resourceId, queryClient],
  );

  const updateChatName = useCallback(
    async (chatId: string, name: string): Promise<Chat | undefined> => {
      const updatedChat = await patchChatInManager(chatId, 'name', name);
      if (updatedChat) {
        void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
        void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
        void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      }
      return updatedChat;
    },
    [patchChatInManager, resourceId, queryClient],
  );

  const applyGeneratedChatName = useCallback(
    async (chatId: string, name: string): Promise<Chat | undefined> => {
      const updatedChat = await applyGeneratedChatNameInManager(chatId, name);
      if (updatedChat) {
        void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
        void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
        void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      }
      return updatedChat;
    },
    [applyGeneratedChatNameInManager, resourceId, queryClient],
  );

  const patchChat = useCallback(
    async <K extends keyof Chat>(chatId: string, key: K, value: Chat[K]): Promise<Chat | undefined> => {
      const updatedChat = await patchChatInManager(chatId, key, value);
      if (updatedChat) {
        void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
        void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
        void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      }
      return updatedChat;
    },
    [patchChatInManager, resourceId, queryClient],
  );

  const restoreChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => patchChat(chatId, 'deletedAt', undefined),
    [patchChat],
  );

  const softDeleteChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      await chatSessions.removeChat(chatId);
      const updatedChat = await softDeleteChatInManager(chatId);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      return updatedChat;
    },
    [chatSessions, softDeleteChatInManager, resourceId, queryClient],
  );

  return {
    chats,
    isLoading,
    error: metadataObservationError ?? (error instanceof Error ? error.message : undefined),
    retry: async (): ReturnType<typeof refetch> => {
      refreshFilesystemObservations();
      return refetch();
    },
    getChat,
    createChat,
    updateChat,
    patchChat,
    applyGeneratedChatName,
    softDeleteChat,
    deleteChat,
    purgeChat,
    restoreChat,
    updateChatName,
  };
}
