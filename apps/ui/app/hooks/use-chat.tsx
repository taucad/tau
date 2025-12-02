/**
 * Chat Provider and Hooks
 *
 * Provides XState-driven chat functionality with AI SDK integration.
 * This is the new architecture replacing the deprecated chat-provider.tsx.
 */

import { useChat } from '@ai-sdk/react';
import { createActorContext } from '@xstate/react';
import { useEffect, useCallback } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatOnToolCallCallback } from 'ai';
import { DefaultChatTransport } from 'ai';
import { chatMachine } from '#hooks/chat.machine.js';
import type { ChatMachineInput, ChatMachineState } from '#hooks/chat.machine.js';
import { inspect } from '#machines/inspector.js';
import { ENV } from '#config.js';

type UseChatArgs = NonNullable<Parameters<typeof useChat<MyUIMessage>>[0]>;
type UseChatReturn = ReturnType<typeof useChat<MyUIMessage>>;
type ChatProviderValue = Omit<UseChatArgs, 'onFinish' | 'onError' | 'onResponse' | 'id'> & {
  onToolCall?: ChatOnToolCallCallback<MyUIMessage>;
};

// Create the actor context using XState's createActorContext
export const ChatContext = createActorContext(chatMachine, {
  inspect,
});

// Provider component that wraps useChat and syncs with XState
export function ChatProvider({
  children,
  resourceId,
  chatId,
  value,
}: {
  readonly children: React.ReactNode;
  readonly resourceId?: string; // Optional for routes that don't need chat persistence
  readonly chatId?: string;
  readonly value?: ChatProviderValue;
}): React.JSX.Element {
  const input: ChatMachineInput = { chatId, resourceId };

  return (
    <ChatContext.Provider options={{ input }}>
      <ChatSyncWrapper value={value}>{children}</ChatSyncWrapper>
    </ChatContext.Provider>
  );
}

// Internal component that handles useChat and syncing
function ChatSyncWrapper({
  children,
  value,
}: {
  readonly children: React.ReactNode;
  readonly value?: ChatProviderValue;
}): React.JSX.Element {
  const actorRef = ChatContext.useActorRef();
  const chatId = ChatContext.useSelector((state) => state.context.chatId);

  // Use chat ID when available for thread persistence
  const threadId = chatId;

  // Initialize useChat with sync callbacks
  const chat = useChat<MyUIMessage>({
    ...value,
    id: threadId,
    transport: new DefaultChatTransport({
      api: `${ENV.TAU_API_URL}/v1/chat`,
      credentials: 'include',
    }),
    onFinish(..._args) {
      // Queue sync instead of immediate sync - XState will debounce
      queueSyncChatState();
    },
    onError(...args) {
      console.error('Chat error:', args);
      queueSyncChatState();
    },
  });

  // Function to queue chat state sync (will be debounced by XState)
  const queueSyncChatState = useCallback(() => {
    actorRef.send({
      type: 'queueSync',
      payload: {
        messages: chat.messages,
        isLoading: chat.status === 'streaming',
        error: chat.error,
        status: chat.status,
      },
    });
  }, [actorRef, chat.messages, chat.status, chat.error]);

  // Register useChat actions with XState on mount and when chat changes
  useEffect(() => {
    actorRef.send({
      type: 'registerChatActions',
      actions: {
        sendMessage: chat.sendMessage,
        regenerate: chat.regenerate,
        stop: chat.stop,
        setMessages: chat.setMessages,
      },
    });
  }, [actorRef, chat.sendMessage, chat.regenerate, chat.setMessages, chat.stop]);

  // Queue sync on key changes (XState will handle debouncing)
  useEffect(() => {
    queueSyncChatState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queueSyncChatState is stable and captures latest values
  }, [chat.messages, chat.status, chat.error]);

  return children as React.JSX.Element;
}

// Type-safe selector hook with full TypeScript support
export function useChatSelector<T>(
  selector: (state: ChatMachineState) => T,
  equalityFn?: (previous: T, next: T) => boolean,
): T {
  return ChatContext.useSelector(selector, equalityFn);
}

// Hook for chat actions (proxied through XState)
export function useChatActions(): {
  sendMessage: (message: Parameters<UseChatReturn['sendMessage']>[0]) => void;
  regenerate: () => void;
  stop: () => void;
  setDraftText: (text: string) => void;
  addDraftImage: (image: string) => void;
  removeDraftImage: (index: number) => void;
  setDraftToolChoice: (toolChoice: string | string[]) => void;
  startEditingMessage: (messageId: string) => void;
  exitEditMode: () => void;
  setEditDraftText: (text: string) => void;
  addEditDraftImage: (image: string) => void;
  removeEditDraftImage: (index: number) => void;
  editMessage: (messageId: string, content: string, model: string, metadata?: unknown, imageUrls?: string[]) => void;
  retryMessage: (messageId: string, modelId?: string) => void;
} {
  const actorRef = ChatContext.useActorRef();

  return {
    sendMessage(message: Parameters<UseChatReturn['sendMessage']>[0]) {
      actorRef.send({ type: 'sendMessage', message });
    },
    regenerate() {
      actorRef.send({ type: 'regenerate' });
    },
    stop() {
      actorRef.send({ type: 'stop' });
    },
    setDraftText(text: string) {
      actorRef.send({ type: 'setDraftText', text });
    },
    addDraftImage(image: string) {
      actorRef.send({ type: 'addDraftImage', image });
    },
    removeDraftImage(index: number) {
      actorRef.send({ type: 'removeDraftImage', index });
    },
    setDraftToolChoice(toolChoice: string | string[]) {
      actorRef.send({ type: 'setDraftToolChoice', toolChoice });
    },
    startEditingMessage(messageId: string) {
      actorRef.send({ type: 'startEditingMessage', messageId });
    },
    exitEditMode() {
      actorRef.send({ type: 'exitEditMode' });
    },
    setEditDraftText(text: string) {
      actorRef.send({ type: 'setEditDraftText', text });
    },
    addEditDraftImage(image: string) {
      actorRef.send({ type: 'addEditDraftImage', image });
    },
    removeEditDraftImage(index: number) {
      actorRef.send({ type: 'removeEditDraftImage', index });
    },
    editMessage(messageId: string, content: string, model: string, metadata?: unknown, imageUrls?: string[]) {
      actorRef.send({
        type: 'editMessage',
        messageId,
        content,
        model,
        metadata,
        imageUrls,
      });
    },
    retryMessage(messageId: string, modelId?: string) {
      actorRef.send({
        type: 'retryMessage',
        messageId,
        modelId,
      });
    },
  };
}
