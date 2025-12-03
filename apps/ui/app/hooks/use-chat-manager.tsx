import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Chat } from '@taucad/chat';
import type { Remote } from 'comlink';
import { chatManagerMachine } from '#hooks/chat-manager.machine.js';
import type { ObjectStoreWorker } from '#hooks/object-store.worker.js';

type ChatManagerContextType = {
  isLoading: boolean;
  error: Error | undefined;
  chatManagerRef: ActorRefFrom<typeof chatManagerMachine>;
  createChat: (
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & { id?: string },
  ) => Promise<Chat>;
  updateChat: (
    chatId: string,
    update: PartialDeep<Chat>,
    options?: {
      ignoreKeys?: string[];
      noUpdatedAt?: boolean;
    },
  ) => Promise<Chat | undefined>;
  duplicateChat: (chatId: string) => Promise<Chat>;
  getChatsForResource: (resourceId: string, options?: { includeDeleted?: boolean }) => Promise<Chat[]>;
  getChat: (chatId: string) => Promise<Chat | undefined>;
  deleteChat: (chatId: string) => Promise<void>;
};

const ChatManagerContext = createContext<ChatManagerContextType | undefined>(undefined);

export function ChatManagerProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const actorRef = useActorRef(chatManagerMachine);

  // Select state from the machine
  const error = useSelector(actorRef, (state) => state.context.error);
  const isLoading = useSelector(actorRef, (state) => {
    return state.matches('initializing') || state.matches('creatingWorker');
  });

  useEffect(() => {
    // Initialize the machine on mount
    actorRef.send({ type: 'initialize' });
  }, [actorRef]);

  const getReadiedWorker = useCallback(async (): Promise<Remote<ObjectStoreWorker>> => {
    const snapshot = await waitFor(actorRef, (state) => state.matches('ready') || state.matches('error'));
    if (snapshot.matches('error')) {
      throw new Error('Chat manager worker failed to initialize');
    }

    if (!snapshot.context.wrappedWorker) {
      throw new Error('Chat manager worker not initialized');
    }

    return snapshot.context.wrappedWorker;
  }, [actorRef]);

  const createChat = useCallback(
    async (
      resourceId: string,
      chatData: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & { id?: string },
    ): Promise<Chat> => {
      const worker = await getReadiedWorker();
      return worker.createChat(resourceId, chatData);
    },
    [getReadiedWorker],
  );

  const updateChat = useCallback(
    async (
      chatId: string,
      update: PartialDeep<Chat>,
      options?: {
        ignoreKeys?: string[];
        noUpdatedAt?: boolean;
      },
    ): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.updateChat(chatId, update, options);
    },
    [getReadiedWorker],
  );

  const duplicateChat = useCallback(
    async (chatId: string): Promise<Chat> => {
      const worker = await getReadiedWorker();
      return worker.duplicateChat(chatId);
    },
    [getReadiedWorker],
  );

  const getChatsForResource = useCallback(
    async (resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]> => {
      const worker = await getReadiedWorker();
      return worker.getChatsForResource(resourceId, options);
    },
    [getReadiedWorker],
  );

  const getChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.getChat(chatId);
    },
    [getReadiedWorker],
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<void> => {
      const worker = await getReadiedWorker();
      return worker.deleteChat(chatId);
    },
    [getReadiedWorker],
  );

  const value = useMemo<ChatManagerContextType>(() => {
    return {
      isLoading,
      error,
      chatManagerRef: actorRef,
      createChat,
      updateChat,
      duplicateChat,
      getChatsForResource,
      getChat,
      deleteChat,
    };
  }, [isLoading, error, actorRef, createChat, updateChat, duplicateChat, getChatsForResource, getChat, deleteChat]);

  return <ChatManagerContext.Provider value={value}>{children}</ChatManagerContext.Provider>;
}

export function useChatManager(): ChatManagerContextType {
  const context = useContext(ChatManagerContext);

  if (context === undefined) {
    throw new Error('useChatManager must be used within a ChatManagerProvider');
  }

  return context;
}
