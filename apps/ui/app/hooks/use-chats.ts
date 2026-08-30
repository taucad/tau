import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { PartialDeep } from 'type-fest';
import type { Chat } from '@taucad/chat';
import { useProjectManager } from '#hooks/use-project-manager.js';

// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useChats(resourceId: string, options?: { includeDeleted?: boolean }) {
  const queryClient = useQueryClient();
  const includeDeleted = options?.includeDeleted ?? false;
  const {
    getChatsForResource,
    getChat,
    createChat: createChatInManager,
    updateChat: updateChatInManager,
    applyGeneratedChatName: applyGeneratedChatNameInManager,
    patchChat: patchChatInManager,
    setMessageEdit: setMessageEditInManager,
    clearMessageEdit: clearMessageEditInManager,
    softDeleteChat: softDeleteChatInManager,
    deleteChat: deleteChatInManager,
    duplicateChat: duplicateChatInManager,
    isLoading: isWorkerLoading,
  } = useProjectManager();

  const {
    data: chats = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['chats', resourceId, { includeDeleted }],
    async queryFn() {
      return getChatsForResource(resourceId, { includeDeleted });
    },
    enabled: !isWorkerLoading && Boolean(resourceId),
  });

  const createChat = useCallback(
    async (
      chatData: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt' | 'recencyAt' | 'hasUnreadTurn'>,
    ): Promise<Chat> => {
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
      await deleteChatInManager(chatId);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    },
    [deleteChatInManager, resourceId, queryClient],
  );

  const duplicateChat = useCallback(
    async (chatId: string): Promise<Chat> => {
      const newChat = await duplicateChatInManager(chatId);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
      return newChat;
    },
    [duplicateChatInManager, resourceId, queryClient],
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

  const setMessageEdit = useCallback(
    async (
      chatId: string,
      messageId: string,
      draft: NonNullable<Chat['messageEdits']>[string],
    ): Promise<Chat | undefined> => {
      const updatedChat = await setMessageEditInManager(chatId, messageId, draft);
      if (updatedChat) {
        void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
        void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
        void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      }
      return updatedChat;
    },
    [setMessageEditInManager, resourceId, queryClient],
  );

  const clearMessageEdit = useCallback(
    async (chatId: string, messageId: string): Promise<Chat | undefined> => {
      const updatedChat = await clearMessageEditInManager(chatId, messageId);
      if (updatedChat) {
        void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
        void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
        void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      }
      return updatedChat;
    },
    [clearMessageEditInManager, resourceId, queryClient],
  );

  const softDeleteChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      const updatedChat = await softDeleteChatInManager(chatId);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['all-chats'] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      return updatedChat;
    },
    [softDeleteChatInManager, resourceId, queryClient],
  );

  return {
    chats,
    isLoading,
    error: error instanceof Error ? error.message : undefined,
    retry: refetch,
    getChat,
    createChat,
    updateChat,
    patchChat,
    applyGeneratedChatName,
    setMessageEdit,
    clearMessageEdit,
    softDeleteChat,
    deleteChat,
    duplicateChat,
    updateChatName,
  };
}
