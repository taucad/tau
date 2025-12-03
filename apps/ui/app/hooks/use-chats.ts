import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { PartialDeep } from 'type-fest';
import type { Chat } from '@taucad/chat';
import { useChatManager } from '#hooks/use-chat-manager.js';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- let types be inferred
export function useChats(resourceId: string, options?: { includeDeleted?: boolean }) {
  const queryClient = useQueryClient();
  const includeDeleted = options?.includeDeleted ?? false;
  const {
    getChatsForResource,
    getChat,
    createChat: createChatInManager,
    updateChat: updateChatInManager,
    deleteChat: deleteChatInManager,
    duplicateChat: duplicateChatInManager,
    isLoading: isWorkerLoading,
  } = useChatManager();

  const {
    data: chats = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['chats', resourceId, { includeDeleted }],
    async queryFn() {
      return getChatsForResource(resourceId, { includeDeleted });
    },
    enabled: !isWorkerLoading && Boolean(resourceId),
  });

  const createChat = useCallback(
    async (chatData: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'>): Promise<Chat> => {
      const newChat = await createChatInManager(resourceId, chatData);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      return newChat;
    },
    [createChatInManager, resourceId, queryClient],
  );

  const updateChat = useCallback(
    async (
      chatId: string,
      update: PartialDeep<Chat>,
      updateOptions?: {
        ignoreKeys?: string[];
        noUpdatedAt?: boolean;
      },
    ): Promise<Chat | undefined> => {
      const updatedChat = await updateChatInManager(chatId, update, updateOptions);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      return updatedChat;
    },
    [updateChatInManager, resourceId, queryClient],
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<void> => {
      await deleteChatInManager(chatId);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    },
    [deleteChatInManager, resourceId, queryClient],
  );

  const duplicateChat = useCallback(
    async (chatId: string): Promise<Chat> => {
      const newChat = await duplicateChatInManager(chatId);
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      return newChat;
    },
    [duplicateChatInManager, resourceId, queryClient],
  );

  const updateChatName = useCallback(
    async (chatId: string, name: string): Promise<Chat | undefined> => {
      const updatedChat = await updateChatInManager(chatId, { name });
      void queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
      void queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      return updatedChat;
    },
    [updateChatInManager, resourceId, queryClient],
  );

  return {
    chats,
    isLoading,
    error: error instanceof Error ? error.message : undefined,
    getChat,
    createChat,
    updateChat,
    deleteChat,
    duplicateChat,
    updateChatName,
  };
}
