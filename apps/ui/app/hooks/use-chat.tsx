/**
 * Chat Provider and Hooks
 *
 * Event-driven architecture using AI SDK callbacks + XState debouncing.
 * - useChat from AI SDK is the source of truth for messages
 * - chatPersistenceMachine handles message persistence with debouncing
 * - draftMachine handles drafts/edits with direct persistence
 */

import { useChat } from '@ai-sdk/react';
import { useActorRef, useSelector } from '@xstate/react';
import { fromPromise } from 'xstate';
import { createContext, useContext, useEffect, useRef, useMemo, useCallback } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatOnToolCallCallback } from 'ai';
import { DefaultChatTransport } from 'ai';
import { draftMachine } from '#hooks/draft.machine.js';
import { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import { useChats } from '#hooks/use-chats.js';
import { inspect } from '#machines/inspector.js';
import { ENV } from '#config.js';

type UseChatReturn = ReturnType<typeof useChat<MyUIMessage>>;
type UseChatArgs = NonNullable<Parameters<typeof useChat<MyUIMessage>>[0]>;
type ChatProviderValue = Omit<UseChatArgs, 'onFinish' | 'onError' | 'onResponse' | 'id'> & {
  onToolCall?: ChatOnToolCallCallback<MyUIMessage>;
};

// Single context for all chat state
type ChatContextValue = {
  chat: UseChatReturn;
  activeChatId: string | undefined;
  resourceId: string | undefined;
  isLoadingChat: boolean;
  queuePersist: (messages: MyUIMessage[]) => void;
  draftActorRef: ReturnType<typeof useActorRef<typeof draftMachine>>;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// Provider component - manages all chat state
export function ChatProvider({
  children,
  resourceId,
  chatId: activeChatId,
  value,
}: {
  readonly children: React.ReactNode;
  readonly resourceId?: string;
  readonly chatId?: string;
  readonly value?: ChatProviderValue;
}): React.JSX.Element {
  const { getChat, updateChat } = useChats(resourceId ?? '');

  // Refs for functions that actors need access to (set after useChat is created)
  const setMessagesRef = useRef<UseChatReturn['setMessages'] | undefined>(undefined);
  const regenerateRef = useRef<UseChatReturn['regenerate'] | undefined>(undefined);
  const initializeDraftRef = useRef<((chat: NonNullable<Awaited<ReturnType<typeof getChat>>>) => void) | undefined>(
    undefined,
  );

  // Create draft machine with provided actors (like use-build.tsx pattern)
  const draftActorRef = useActorRef(
    draftMachine.provide({
      actors: {
        persistDraftActor: fromPromise(async ({ input }) => {
          await updateChat(input.chatId, { draft: input.draft }, { ignoreKeys: ['draft'] });
        }),
        persistEditDraftActor: fromPromise(async ({ input }) => {
          await updateChat(
            input.chatId,
            { messageEdits: { [input.messageId]: input.draft } },
            { ignoreKeys: ['messageEdits'] },
          );
        }),
        clearMessageEditActor: fromPromise(async ({ input }) => {
          const loadedChat = await getChat(input.chatId);
          if (loadedChat?.messageEdits?.[input.messageId]) {
            const updatedEdits = { ...loadedChat.messageEdits };
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove message edit
            delete updatedEdits[input.messageId];
            await updateChat(input.chatId, { messageEdits: updatedEdits }, { ignoreKeys: ['messageEdits'] });
          }
        }),
      },
    }),
    {
      input: {
        chatId: activeChatId,
      },
      inspect,
    },
  );

  // Create persistence machine with provided actors
  // Actors handle the complete load flow: fetch → setMessages → initialize draft
  const persistenceActorRef = useActorRef(
    chatPersistenceMachine.provide({
      actors: {
        loadChatActor: fromPromise(async ({ input }) => {
          const loadedChat = await getChat(input.chatId);

          // Set messages directly in the actor (no React effect needed)
          if (loadedChat) {
            setMessagesRef.current?.(loadedChat.messages);
            initializeDraftRef.current?.(loadedChat);

            // Check if last message needs AI response (pending user message).
            // This happens when the user creates a message (i.e. on home page) and the
            // AI response is not yet generated.
            const lastMessage = loadedChat.messages.at(-1);
            if (lastMessage?.role === 'user' && lastMessage.metadata?.status === 'pending') {
              void regenerateRef.current?.();
            }
          } else {
            // New chat - clear messages
            setMessagesRef.current?.([]);
          }

          return loadedChat;
        }),
        persistMessagesActor: fromPromise(async ({ input }) => {
          await updateChat(input.chatId, { messages: input.messages }, { ignoreKeys: ['messages'] });
        }),
      },
    }),
    {
      input: {
        activeChatId,
        resourceId,
      },
      inspect,
    },
  );

  // Track loading state from persistence machine
  const isLoadingChat = useSelector(persistenceActorRef, (state) => state.context.isLoadingChat);

  // Initialize useChat with callbacks for event-driven persistence
  const chat = useChat<MyUIMessage>({
    ...value,
    id: activeChatId,
    transport: new DefaultChatTransport({
      api: `${ENV.TAU_API_URL}/v1/chat`,
      credentials: 'include',
    }),
    onFinish({ messages }) {
      // Persist when AI finishes - machine guards against persisting during load
      persistenceActorRef.send({ type: 'queuePersist', messages });
    },
    onError(error) {
      persistenceActorRef.send({ type: 'handleError', error });
    },
  });

  // Update refs so actors can access current functions
  setMessagesRef.current = chat.setMessages;
  regenerateRef.current = chat.regenerate;
  initializeDraftRef.current = (loadedChat) => {
    draftActorRef.send({ type: 'initializeFromChat', chat: loadedChat });
  };

  // Load chat when activeChatId changes
  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    // Tell persistence machine to load chat (actor handles setMessages)
    persistenceActorRef.send({ type: 'setActiveChatId', chatId: activeChatId });

    // Update draft machine with new chat ID
    draftActorRef.send({ type: 'setChatId', chatId: activeChatId });
  }, [activeChatId, persistenceActorRef, draftActorRef]);

  // Queue persistence function for use by actions
  const queuePersist = useCallback(
    (messages: MyUIMessage[]) => {
      if (activeChatId) {
        persistenceActorRef.send({ type: 'queuePersist', messages });
      }
    },
    [activeChatId, persistenceActorRef],
  );

  const contextValue = useMemo<ChatContextValue>(
    () => ({
      chat,
      activeChatId,
      resourceId,
      isLoadingChat,
      queuePersist,
      draftActorRef,
    }),
    [chat, activeChatId, resourceId, isLoadingChat, queuePersist, draftActorRef],
  );

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
}

// Internal hook to get chat context
function useChatContext(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }

  return context;
}

// Combined state type for useChatSelector - the primary way to read chat state
type CombinedChatState = {
  messages: MyUIMessage[];
  messagesById: Map<string, MyUIMessage>;
  messageOrder: string[];
  status: UseChatReturn['status'];
  error: Error | undefined;
  isLoading: boolean;
  // Draft state from machine
  draftText: string;
  draftImages: string[];
  draftToolChoice: string | string[];
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId: string | undefined;
  editDraftText: string;
  editDraftImages: string[];
};

// Cache for messagesById to avoid recreating on every render
const messagesByIdCache = new WeakMap<MyUIMessage[], Map<string, MyUIMessage>>();

function getMessagesById(messages: MyUIMessage[]): Map<string, MyUIMessage> {
  let cached = messagesByIdCache.get(messages);
  if (!cached) {
    cached = new Map<string, MyUIMessage>();
    for (const message of messages) {
      cached.set(message.id, message);
    }

    messagesByIdCache.set(messages, cached);
  }

  return cached;
}

/**
 * Primary hook for reading chat state.
 * Combines AI SDK useChat state with draft machine state.
 */
export function useChatSelector<T>(selector: (state: CombinedChatState) => T): T {
  const { chat, draftActorRef } = useChatContext();
  const draftContext = useSelector(draftActorRef, (state) => state.context);

  // Use cached messagesById based on messages array identity
  const messagesById = getMessagesById(chat.messages);
  const messageOrder = useMemo(() => chat.messages.map((m) => m.id), [chat.messages]);

  // Combine chat state with draft state
  const combinedState = useMemo<CombinedChatState>(
    () => ({
      messages: chat.messages,
      messagesById,
      messageOrder,
      status: chat.status,
      error: chat.error,
      isLoading: chat.status === 'streaming',
      // Draft state
      draftText: draftContext.draftText,
      draftImages: draftContext.draftImages,
      draftToolChoice: draftContext.draftToolChoice,
      messageEdits: draftContext.messageEdits,
      activeEditMessageId: draftContext.activeEditMessageId,
      editDraftText: draftContext.editDraftText,
      editDraftImages: draftContext.editDraftImages,
    }),
    [chat.messages, messagesById, messageOrder, chat.status, chat.error, draftContext],
  );

  return selector(combinedState);
}

// Hook for chat actions
export function useChatActions(): {
  sendMessage: (message: Parameters<UseChatReturn['sendMessage']>[0]) => void;
  regenerate: () => void;
  stop: () => void;
  setMessages: (messages: MyUIMessage[]) => void;
  setDraftText: (text: string) => void;
  addDraftImage: (image: string) => void;
  removeDraftImage: (index: number) => void;
  setDraftToolChoice: (toolChoice: string | string[]) => void;
  clearDraft: () => void;
  startEditingMessage: (messageId: string) => void;
  exitEditMode: () => void;
  setEditDraftText: (text: string) => void;
  addEditDraftImage: (image: string) => void;
  removeEditDraftImage: (index: number) => void;
  clearMessageEdit: (messageId: string) => void;
  editMessage: (messageId: string, content: string, model: string, metadata?: unknown, imageUrls?: string[]) => void;
  retryMessage: (messageId: string, modelId?: string) => void;
} {
  const { chat, queuePersist, draftActorRef } = useChatContext();

  return useMemo(
    () => ({
      // UseChat actions (direct)
      sendMessage(message: Parameters<UseChatReturn['sendMessage']>[0]) {
        // Clear draft when sending
        draftActorRef.send({ type: 'clearDraft' });

        // Persist immediately with user message included
        queuePersist([...chat.messages, message as MyUIMessage]);

        void chat.sendMessage(message);
      },
      regenerate() {
        void chat.regenerate();
      },
      stop() {
        void chat.stop();
      },
      setMessages(messages: MyUIMessage[]) {
        chat.setMessages(messages);
      },

      // Draft actions (via XState)
      setDraftText(text: string) {
        draftActorRef.send({ type: 'setDraftText', text });
      },
      addDraftImage(image: string) {
        draftActorRef.send({ type: 'addDraftImage', image });
      },
      removeDraftImage(index: number) {
        draftActorRef.send({ type: 'removeDraftImage', index });
      },
      setDraftToolChoice(toolChoice: string | string[]) {
        draftActorRef.send({ type: 'setDraftToolChoice', toolChoice });
      },
      clearDraft() {
        draftActorRef.send({ type: 'clearDraft' });
      },

      // Edit actions (via XState)
      startEditingMessage(messageId: string) {
        const originalMessage = chat.messages.find((m) => m.id === messageId);
        draftActorRef.send({ type: 'startEditingMessage', messageId, originalMessage });
      },
      exitEditMode() {
        draftActorRef.send({ type: 'exitEditMode' });
      },
      setEditDraftText(text: string) {
        draftActorRef.send({ type: 'setEditDraftText', text });
      },
      addEditDraftImage(image: string) {
        draftActorRef.send({ type: 'addEditDraftImage', image });
      },
      removeEditDraftImage(index: number) {
        draftActorRef.send({ type: 'removeEditDraftImage', index });
      },
      clearMessageEdit(messageId: string) {
        draftActorRef.send({ type: 'clearMessageEdit', messageId });
      },

      // Edit and retry - uses both useChat and draft machine
      editMessage(messageId: string, content: string, model: string, _metadata?: unknown, imageUrls?: string[]) {
        // Clear the edit from draft machine
        draftActorRef.send({ type: 'clearMessageEdit', messageId });

        // Find message index
        const messageIndex = chat.messages.findIndex((m) => m.id === messageId);
        if (messageIndex === -1) {
          return;
        }

        // Create new message with updated content
        const newMessage: MyUIMessage = {
          id: messageId,
          role: 'user',
          parts: [
            { type: 'text', text: content },
            ...(imageUrls?.map((url) => ({ type: 'file' as const, url, mediaType: 'image/png' as const })) ?? []),
          ],
          metadata: {
            createdAt: Date.now(),
            status: 'pending',
            model,
          },
        };

        // Update messages array - keep messages up to the edited one
        const newMessages = [...chat.messages.slice(0, messageIndex), newMessage];
        chat.setMessages(newMessages);
        void chat.regenerate();
      },

      retryMessage(messageId: string, modelId?: string) {
        const messageIndex = chat.messages.findIndex((m) => m.id === messageId);
        if (messageIndex === -1) {
          return;
        }

        const sliceIndex = Math.max(messageIndex - 1, 0);
        const previousMessage = chat.messages[sliceIndex];

        if (previousMessage && modelId) {
          // Update the previous message with the new model
          const updatedMessages = [
            ...chat.messages.slice(0, sliceIndex),
            { ...previousMessage, metadata: { ...previousMessage.metadata, model: modelId } },
          ];
          chat.setMessages(updatedMessages);
        } else {
          // Just slice the messages array
          const newMessages = chat.messages.slice(0, messageIndex);
          chat.setMessages(newMessages);
        }

        void chat.regenerate();
      },
    }),
    [chat, draftActorRef, queuePersist],
  );
}
