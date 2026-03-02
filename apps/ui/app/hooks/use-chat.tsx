/**
 * Chat Provider and Hooks
 *
 * Event-driven architecture using AI SDK callbacks + XState debouncing.
 * - useChat from AI SDK is the source of truth for messages
 * - chatPersistenceMachine handles message persistence with debouncing
 * - draftMachine handles drafts/edits with direct persistence
 * - useChatRpcConnection handles RPC execution via Socket.IO
 */

import { useChat } from '@ai-sdk/react';
import { useActorRef, useSelector } from '@xstate/react';
import { fromPromise } from 'xstate';
import { createContext, useContext, useEffect, useRef, useMemo, useCallback } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import { DefaultChatTransport } from 'ai';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { ChatError } from '@taucad/types';
import { draftMachine } from '#hooks/draft.machine.js';
import { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import { useChats } from '#hooks/use-chats.js';
import { inspect } from '#machines/inspector.js';
import { ENV } from '#environment.config.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import { finalizeInterruptedToolParts } from '#utils/chat.utils.js';

type UseChatReturn = ReturnType<typeof useChat<MyUIMessage>>;

type PendingMessage = Parameters<UseChatReturn['sendMessage']>[0];

// Single context for all chat state
type ChatContextValue = {
  chat: UseChatReturn;
  activeChatId: string | undefined;
  resourceId: string | undefined;
  chatName: string;
  isLoadingChat: boolean;
  queuePersist: (messages: MyUIMessage[]) => void;
  pendingMessageRef: React.RefObject<PendingMessage | undefined>;
  draftActorRef: ReturnType<typeof useActorRef<typeof draftMachine>>;
  persistenceActorRef: ReturnType<typeof useActorRef<typeof chatPersistenceMachine>>;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// Provider component - manages all chat state
export function ChatProvider({
  children,
  resourceId,
  chatId: activeChatId,
}: {
  readonly children: React.ReactNode;
  readonly resourceId?: string;
  readonly chatId?: string;
}): React.JSX.Element {
  const { getChat, updateChat, chats } = useChats(resourceId ?? '');

  // Refs for functions that actors need access to (set after useChat is created)
  const setMessagesRef = useRef<UseChatReturn['setMessages'] | undefined>(undefined);
  const regenerateRef = useRef<UseChatReturn['regenerate'] | undefined>(undefined);
  const initializeDraftRef = useRef<((chat: NonNullable<Awaited<ReturnType<typeof getChat>>>) => void) | undefined>(
    undefined,
  );

  // Pending message ref for interrupt-then-send flow.
  // When user sends while streaming/submitted, the message is queued here
  // and processed in onFinish after the old request fully completes.
  const pendingMessageRef = useRef<PendingMessage | undefined>(undefined);

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
  // The machine's onDone action sets persistedError from the returned chat
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

              // Strip stale error — we're auto-regenerating so the previous error is
              // outdated. A fresh error will be set if regeneration fails; cleared on
              // success via onFinish. This prevents a UI flash of the old error.
              return { ...loadedChat, error: undefined };
            }
          } else {
            // New chat - clear messages
            setMessagesRef.current?.([]);
          }

          // Return the chat - the machine's onDone action will extract persistedError
          return loadedChat;
        }),
        persistMessagesActor: fromPromise(async ({ input }) => {
          await updateChat(input.chatId, { messages: input.messages }, { ignoreKeys: ['messages'] });
        }),
        persistErrorActor: fromPromise(async ({ input }) => {
          await updateChat(input.chatId, { error: input.error }, { ignoreKeys: ['error'] });
        }),
        clearErrorActor: fromPromise(async ({ input }) => {
          await updateChat(input.chatId, { error: undefined }, { ignoreKeys: ['error'] });
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
  // Tool execution is handled via WebSocket, not onToolCall/sendAutomaticallyWhen
  const chat = useChat<MyUIMessage>({
    id: activeChatId,
    transport: new DefaultChatTransport({
      api: `${ENV.TAU_API_URL}/v1/chat`,
      credentials: 'include',
    }),
    generateId: () => generatePrefixedId(idPrefix.message),
    onFinish({ messages, isAbort, isError }) {
      if (isAbort) {
        // If a message is queued (user sent while streaming/submitted),
        // finalize interrupted tool parts and trigger the new request.
        const pendingMessage = pendingMessageRef.current;
        if (pendingMessage) {
          pendingMessageRef.current = undefined;

          const sanitizedMessages = finalizeInterruptedToolParts(messages);
          const newMessages = [...sanitizedMessages, pendingMessage as MyUIMessage];

          setMessagesRef.current?.(newMessages);
          persistenceActorRef.send({ type: 'queuePersist', messages: newMessages });

          // Defer to next microtask so the old makeRequest's finally block
          // (which nulls activeResponse) completes before we start a new one.
          queueMicrotask(() => {
            void regenerateRef.current?.();
          });
        } else {
          // Pure stop (no follow-up message).
          // Finalize any interrupted tool parts and persist current state.
          let sanitizedMessages = finalizeInterruptedToolParts(messages);

          // If stopped before any AI response, the last message is the user's
          // pending message. Mark it as cancelled to prevent auto-regeneration
          // on page reload (loadChatActor checks for pending user messages).
          const lastMessage = sanitizedMessages.at(-1);
          if (lastMessage?.role === 'user' && lastMessage.metadata?.status === 'pending') {
            sanitizedMessages = sanitizedMessages.with(-1, {
              ...lastMessage,
              metadata: { ...lastMessage.metadata, status: 'cancelled' },
            });
          }

          setMessagesRef.current?.(sanitizedMessages);
          persistenceActorRef.send({ type: 'queuePersist', messages: sanitizedMessages });
        }

        return;
      }

      if (isError) {
        // Error mid-stream: finalize any interrupted tool parts and persist messages
        // so partial AI output survives reload and is available on retry.
        const sanitizedMessages = finalizeInterruptedToolParts(messages);
        setMessagesRef.current?.(sanitizedMessages);
        persistenceActorRef.send({ type: 'queuePersist', messages: sanitizedMessages });
        // Error itself is already persisted via the onError callback
        return;
      }

      // Success: persist messages and clear any stale persisted error.
      // clearPersistedError acts as a safety net for cases where the error
      // was not cleared before the request (e.g. auto-regeneration on load).
      persistenceActorRef.send({ type: 'queuePersist', messages });
      persistenceActorRef.send({ type: 'clearPersistedError' });
    },
    onError(error) {
      persistenceActorRef.send({ type: 'handleError', error });
      // Parse and persist the error for display after page reload
      const normalizedError = parseErrorForPersistence(error);
      persistenceActorRef.send({ type: 'setPersistedError', error: normalizedError });
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

  const chatName = useMemo(
    () => chats.find((c) => c.id === activeChatId)?.name ?? 'Chat Transcript',
    [chats, activeChatId],
  );

  const contextValue = useMemo<ChatContextValue>(
    () => ({
      chat,
      activeChatId,
      resourceId,
      chatName,
      isLoadingChat,
      queuePersist,
      pendingMessageRef,
      draftActorRef,
      persistenceActorRef,
    }),
    [chat, activeChatId, resourceId, chatName, isLoadingChat, queuePersist, draftActorRef, persistenceActorRef],
  );

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
}

/**
 * Hook to get the chat context values.
 * Returns activeChatId, isLoadingChat, and other context values.
 */
export function useChatContext(): ChatContextValue {
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
  // Persisted error - survives page reload (from chat entity)
  persistedError: ChatError | undefined;
  isLoading: boolean;
  chatName: string;
  // Draft state from machine
  draftText: string;
  draftImages: string[];
  draftToolChoice: string | string[];
  draftMode: string;
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
 * Combines AI SDK useChat state with draft machine state and persistence state.
 */
export function useChatSelector<T>(selector: (state: CombinedChatState) => T): T {
  const { chat, chatName, draftActorRef, persistenceActorRef } = useChatContext();
  const draftContext = useSelector(draftActorRef, (state) => state.context);
  const persistedError = useSelector(persistenceActorRef, (state) => state.context.persistedError);

  // Use cached messagesById based on messages array identity
  const messagesById = getMessagesById(chat.messages);
  const messageOrder = useMemo(() => chat.messages.map((m) => m.id), [chat.messages]);

  // Combine chat state with draft state and persistence state
  const combinedState = useMemo<CombinedChatState>(
    () => ({
      messages: chat.messages,
      messagesById,
      messageOrder,
      status: chat.status,
      error: chat.error,
      persistedError,
      isLoading: chat.status === 'streaming',
      chatName,
      // Draft state
      draftText: draftContext.draftText,
      draftImages: draftContext.draftImages,
      draftToolChoice: draftContext.draftToolChoice,
      draftMode: draftContext.draftMode,
      messageEdits: draftContext.messageEdits,
      activeEditMessageId: draftContext.activeEditMessageId,
      editDraftText: draftContext.editDraftText,
      editDraftImages: draftContext.editDraftImages,
    }),
    [chat.messages, messagesById, messageOrder, chat.status, chat.error, persistedError, chatName, draftContext],
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
  setDraftMode: (mode: string) => void;
  clearDraft: () => void;
  startEditingMessage: (messageId: string) => void;
  exitEditMode: () => void;
  setEditDraftText: (text: string) => void;
  addEditDraftImage: (image: string) => void;
  removeEditDraftImage: (index: number) => void;
  clearMessageEdit: (messageId: string) => void;
  // eslint-disable-next-line max-params -- callback signature shared across chat components; refactoring would require updating many call sites
  editMessage: (messageId: string, content: string, model: string, metadata?: unknown, imageUrls?: string[]) => void;
  retryMessage: (messageId: string, modelId?: string) => void;
} {
  const { chat, queuePersist, pendingMessageRef, draftActorRef, persistenceActorRef } = useChatContext();

  return useMemo(
    () => ({
      // UseChat actions (direct)
      sendMessage(message: Parameters<UseChatReturn['sendMessage']>[0]) {
        // Clear draft when sending
        draftActorRef.send({ type: 'clearDraft' });

        // Clear any persisted error when starting a new request
        persistenceActorRef.send({ type: 'clearPersistedError' });

        // If currently streaming or submitted, queue the message and stop.
        // The pending message will be processed in onFinish(isAbort) after
        // the old makeRequest fully completes, avoiding concurrent requests.
        if (chat.status === 'streaming' || chat.status === 'submitted') {
          pendingMessageRef.current = message;
          void chat.stop();
          return;
        }

        // Normal path: no request in progress
        queuePersist([...chat.messages, message as MyUIMessage]);
        void chat.sendMessage(message);
      },
      regenerate() {
        // Clear any persisted error when retrying
        persistenceActorRef.send({ type: 'clearPersistedError' });
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
      setDraftMode(mode: string) {
        draftActorRef.send({ type: 'setDraftMode', mode: mode as 'agent' | 'plan' });
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
      // eslint-disable-next-line max-params -- matches the callback signature used across chat components
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
    [chat, pendingMessageRef, draftActorRef, persistenceActorRef, queuePersist],
  );
}
