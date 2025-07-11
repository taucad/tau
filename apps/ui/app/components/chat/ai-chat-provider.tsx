/**
 * XState-powered AI Chat Provider
 *
 * This provider wraps the useChat hook from @ai-sdk/react with XState for:
 * - Performance optimized state subscriptions via useSelector
 * - Centralized state management
 * - Debounced state synchronization using XState delayed transitions
 * - Proxy actions through XState for consistent state management
 */

import { useChat } from '@ai-sdk/react';
import { createActorContext } from '@xstate/react';
import { setup, assign } from 'xstate';
import { useEffect } from 'react';
import type { JSX } from 'react';
import type { Message } from '@ai-sdk/react';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { messageStatus } from '~/types/chat.types.js';

type UseChatArgs = NonNullable<Parameters<typeof useChat>[0]>;
type UseChatReturn = ReturnType<typeof useChat>;

// Define the machine context to mirror useChat state
type ChatMachineContext = {
  messages: Message[]; // Keep array for compatibility with useChat
  messagesById: Map<string, Message>; // O(1) lookup map
  messageOrder: string[]; // Preserve message order
  input: string;
  isLoading: boolean;
  error?: Error;
  data?: unknown;
  status: UseChatReturn['status'];
  // Pending sync data to batch updates during debounce period
  pendingSyncData?: Partial<Omit<ChatMachineContext, '_chatActions' | 'pendingSyncData'>>;
  // Internal refs to useChat actions - prefixed with _ to indicate internal use
  _chatActions?: {
    append: UseChatReturn['append'];
    reload: UseChatReturn['reload'];
    stop: UseChatReturn['stop'];
    setInput: UseChatReturn['setInput'];
    setMessages: UseChatReturn['setMessages'];
    setData: UseChatReturn['setData'];
    handleSubmit: UseChatReturn['handleSubmit'];
  };
};

// Define events for the machine
// Helper function to normalize messages for O(1) lookup
function normalizeMessages(messages: Message[]): {
  messagesById: Map<string, Message>;
  messageOrder: string[];
} {
  const messagesById = new Map<string, Message>();
  const messageOrder: string[] = [];

  for (const message of messages) {
    messagesById.set(message.id, message);
    messageOrder.push(message.id);
  }

  return { messagesById, messageOrder };
}

type ChatMachineEvents =
  | { type: 'queueSync'; payload: Partial<Omit<ChatMachineContext, '_chatActions' | 'pendingSyncData'>> }
  | { type: 'registerChatActions'; actions: NonNullable<ChatMachineContext['_chatActions']> }
  | { type: 'append'; message: Parameters<UseChatReturn['append']>[0] }
  | { type: 'reload' }
  | { type: 'stop' }
  | { type: 'setInput'; input: string }
  | { type: 'setMessages'; messages: Message[] }
  | { type: 'setData'; data: Parameters<UseChatReturn['setData']>[0] }
  | { type: 'submit' }
  | { type: 'editMessage'; messageId: string; content: string; model: string; metadata?: unknown; imageUrls?: string[] }
  | { type: 'retryMessage'; messageId: string; modelId?: string };

// Create the XState machine with delayed transitions for debouncing
const chatMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    context: {} as ChatMachineContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    events: {} as ChatMachineEvents,
  },
}).createMachine({
  id: 'ai-chat',
  context: {
    messages: [],
    messagesById: new Map(),
    messageOrder: [],
    input: '',
    isLoading: false,
    error: undefined,
    data: undefined,
    status: 'ready',
    pendingSyncData: undefined,
    _chatActions: undefined,
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        queueSync: {
          target: 'pendingSync',
          actions: assign({
            pendingSyncData: ({ context, event }) => ({
              ...context.pendingSyncData,
              ...event.payload,
            }),
          }),
        },
        registerChatActions: {
          actions: assign({
            _chatActions: ({ event }) => event.actions,
          }),
        },
        // Direct action events
        append: {
          actions: [
            assign({ error: undefined }),
            ({ context, event }) => {
              void context._chatActions?.append(event.message);
            },
          ],
        },
        reload: {
          actions: [
            assign({ error: undefined }),
            ({ context }) => {
              void context._chatActions?.reload();
            },
          ],
        },
        stop: {
          actions({ context }) {
            context._chatActions?.stop();
          },
        },
        setInput: {
          actions({ context, event }) {
            context._chatActions?.setInput(event.input);
          },
        },
        setMessages: {
          actions: [
            assign({ error: undefined }),
            ({ context, event }) => {
              context._chatActions?.setMessages(event.messages);
            },
          ],
        },
        setData: {
          actions({ context, event }) {
            context._chatActions?.setData(event.data);
          },
        },
        submit: {
          actions: [
            assign({ error: undefined }),
            ({ context }) => {
              context._chatActions?.handleSubmit();
            },
          ],
        },
        editMessage: {
          actions: [
            assign({ error: undefined }),
            ({ context, event }) => {
              if (!context._chatActions) {
                return;
              }

              // Find message index
              const messageIndex = context.messages.findIndex((m) => m.id === event.messageId);
              if (messageIndex === -1) {
                return;
              }

              // Create new message with updated content
              const newMessage: Message = {
                id: event.messageId,
                role: 'user',
                content: event.content,
                createdAt: new Date(),
                model: event.model,
                status: messageStatus.pending,
              };

              // Update messages array - keep messages up to and including the edited one
              const newMessages = [...context.messages.slice(0, messageIndex), newMessage];

              // Set messages and reload
              context._chatActions.setMessages(newMessages);
              void context._chatActions.reload();
            },
          ],
        },
        retryMessage: {
          actions: [
            assign({ error: undefined }),
            ({ context, event }) => {
              if (!context._chatActions) {
                return;
              }

              // Get messages up to (but not including) the message at messageIndex
              const messageIndex = context.messages.findIndex((m) => m.id === event.messageId);
              if (messageIndex === -1) {
                return;
              }

              const newMessages = context.messages.slice(0, messageIndex);

              // Set messages and reload to retry
              context._chatActions.setMessages(newMessages);
              void context._chatActions.reload();
            },
          ],
        },
      },
    },
    pendingSync: {
      // Debounce sync updates using XState's delayed transitions
      after: {
        // 16ms delay for ~60fps update rate
        // eslint-disable-next-line @typescript-eslint/naming-convention -- XState uses numeric keys for delays
        16: {
          target: 'idle',
          actions: [
            // Apply the pending sync data to the context
            assign({
              messages: ({ context }) => context.pendingSyncData?.messages ?? context.messages,
              input: ({ context }) => context.pendingSyncData?.input ?? context.input,
              isLoading: ({ context }) => context.pendingSyncData?.isLoading ?? context.isLoading,
              error: ({ context }) => context.pendingSyncData?.error ?? context.error,
              data: ({ context }) => context.pendingSyncData?.data ?? context.data,
              status: ({ context }) => context.pendingSyncData?.status ?? context.status,
              // Update normalized data when messages change
              messagesById({ context }) {
                const messages = context.pendingSyncData?.messages ?? context.messages;
                return normalizeMessages(messages).messagesById;
              },
              messageOrder({ context }) {
                const messages = context.pendingSyncData?.messages ?? context.messages;
                return normalizeMessages(messages).messageOrder;
              },
              // Clear pending sync data
              pendingSyncData: undefined,
            }),
          ],
        },
      },
      on: {
        // If more sync data comes in while pending, merge it and reset timer
        queueSync: {
          actions: assign({
            pendingSyncData: ({ context, event }) => ({
              ...context.pendingSyncData,
              ...event.payload,
            }),
          }),
          // Stay in pendingSync state to reset the timer
          reenter: true,
        },
        // Allow other actions to still work while pending sync
        registerChatActions: {
          actions: assign({
            _chatActions: ({ event }) => event.actions,
          }),
        },
        append: {
          actions: [
            assign({ error: undefined }),
            ({ context, event }) => {
              void context._chatActions?.append(event.message);
            },
          ],
        },
        reload: {
          actions: [
            assign({ error: undefined }),
            ({ context }) => {
              void context._chatActions?.reload();
            },
          ],
        },
        stop: {
          actions({ context }) {
            context._chatActions?.stop();
          },
        },
        setInput: {
          actions({ context, event }) {
            context._chatActions?.setInput(event.input);
          },
        },
        setMessages: {
          actions: [
            assign({ error: undefined }),
            ({ context, event }) => {
              context._chatActions?.setMessages(event.messages);
            },
          ],
        },
        setData: {
          actions({ context, event }) {
            context._chatActions?.setData(event.data);
          },
        },
        submit: {
          actions: [
            assign({ error: undefined }),
            ({ context }) => {
              context._chatActions?.handleSubmit();
            },
          ],
        },
        editMessage: {
          actions: [
            assign({ error: undefined }),
            ({ context, event }) => {
              if (!context._chatActions) {
                return;
              }

              // Find message index
              const messageIndex = context.messages.findIndex((m) => m.id === event.messageId);
              if (messageIndex === -1) {
                return;
              }

              // Create new message with updated content
              const newMessage: Message = {
                id: event.messageId,
                role: 'user',
                content: event.content,
                model: event.model,
                status: messageStatus.pending,
                createdAt: new Date(),
              };

              // Update messages array - keep messages up to and including the edited one
              const newMessages = [...context.messages.slice(0, messageIndex), newMessage];

              // Set messages and reload
              context._chatActions.setMessages(newMessages);
              void context._chatActions.reload();
            },
          ],
        },
        retryMessage: {
          actions: [
            assign({ error: undefined }),
            ({ context, event }) => {
              if (!context._chatActions) {
                return;
              }

              // Original business logic: get messages up to (but not including) the message at messageIndex
              // But handle the case where there's a previous message to retry with a different model
              const messageIndex = context.messages.findIndex((m) => m.id === event.messageId);
              if (messageIndex === -1) {
                return;
              }

              const sliceIndex = Math.max(messageIndex - 1, 0);
              const previousMessage = context.messages[sliceIndex];

              if (previousMessage && event.modelId) {
                // Update the previous message with the new model
                const updatedMessages = [
                  ...context.messages.slice(0, sliceIndex),
                  { ...previousMessage, model: event.modelId },
                ];
                context._chatActions.setMessages(updatedMessages);
              } else {
                // Just slice the messages array
                const newMessages = context.messages.slice(0, messageIndex);
                context._chatActions.setMessages(newMessages);
              }

              void context._chatActions.reload();
            },
          ],
        },
      },
    },
  },
});

// Define the state type from the machine
type ChatMachineState = ReturnType<typeof chatMachine.getInitialSnapshot>;

// Create the actor context using XState's createActorContext
const AiChatContext = createActorContext(chatMachine);

// Provider component that wraps useChat and syncs with XState
export function AiChatProvider({
  children,
  value,
}: {
  readonly children: React.ReactNode;
  readonly value: Omit<UseChatArgs, 'onFinish' | 'onError' | 'onResponse'>;
}): JSX.Element {
  return (
    <AiChatContext.Provider>
      <ChatSyncWrapper value={value}>{children}</ChatSyncWrapper>
    </AiChatContext.Provider>
  );
}

// Internal component that handles useChat and syncing
function ChatSyncWrapper({
  children,
  value,
}: {
  readonly children: React.ReactNode;
  readonly value: Omit<UseChatArgs, 'onFinish' | 'onError' | 'onResponse'>;
}): JSX.Element {
  const actorRef = AiChatContext.useActorRef();

  // Initialize useChat with sync callbacks
  const chat = useChat({
    ...value,
    credentials: 'include',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- experimental API
    experimental_prepareRequestBody(requestBody) {
      const cadActorState = cadActor.getSnapshot();
      const feedback = {
        code: cadActorState.context.code,
        codeErrors: cadActorState.context.codeErrors,
        kernelError: cadActorState.context.kernelError,
      };

      return {
        ...requestBody,
        ...feedback,
      };
    },
    onFinish(...args) {
      console.log('Chat finished:', args);
      // Queue sync instead of immediate sync - XState will debounce
      queueSyncChatState();
    },
    onError(...args) {
      console.error('Chat error:', args);
      queueSyncChatState();
    },
    onResponse(...args) {
      console.log('Chat response:', args);
      queueSyncChatState();
    },
  });

  // Function to queue chat state sync (will be debounced by XState)
  const queueSyncChatState = () => {
    actorRef.send({
      type: 'queueSync',
      payload: {
        messages: chat.messages,
        input: chat.input,
        isLoading: chat.status === 'streaming',
        error: chat.error,
        data: chat.data,
        status: chat.status,
      },
    });
  };

  // Register useChat actions with XState on mount and when chat changes
  useEffect(() => {
    actorRef.send({
      type: 'registerChatActions',
      actions: {
        append: chat.append,
        reload: chat.reload,
        stop: chat.stop,
        setInput: chat.setInput,
        setMessages: chat.setMessages,
        setData: chat.setData,
        handleSubmit: chat.handleSubmit,
      },
    });
  }, [chat, actorRef]);

  // Queue sync on key changes (XState will handle debouncing)
  useEffect(() => {
    queueSyncChatState();
  }, [chat.messages, chat.input, chat.status, chat.error, chat.data]);

  return children as JSX.Element;
}

// Export the context for direct access if needed
export { AiChatContext };

// Type-safe selector hook with full TypeScript support
export function useChatSelector<T>(
  selector: (state: ChatMachineState) => T,
  equalityFn?: (previous: T, next: T) => boolean,
): T {
  return AiChatContext.useSelector(selector, equalityFn);
}

// Hook for accessing sync state (useful for debugging)
export function useChatSyncState(): {
  isInSyncState: boolean;
  hasPendingSync: boolean;
} {
  return useChatSelector((state) => ({
    isInSyncState: state.matches('pendingSync'),
    hasPendingSync: Boolean(state.context.pendingSyncData),
  }));
}

// Hook for chat actions (proxied through XState)
export function useChatActions(): {
  append: (message: Parameters<UseChatReturn['append']>[0]) => void;
  reload: () => void;
  stop: () => void;
  setInput: (input: string) => void;
  setMessages: (messages: Message[]) => void;
  setData: (data: Parameters<UseChatReturn['setData']>[0]) => void;
  submit: () => void;
  editMessage: (messageId: string, content: string, model: string, metadata?: unknown, imageUrls?: string[]) => void;
  retryMessage: (messageId: string, modelId?: string) => void;
} {
  const actorRef = AiChatContext.useActorRef();

  return {
    append(message: Parameters<UseChatReturn['append']>[0]) {
      actorRef.send({ type: 'append', message });
    },
    reload() {
      actorRef.send({ type: 'reload' });
    },
    stop() {
      actorRef.send({ type: 'stop' });
    },
    setInput(input: string) {
      actorRef.send({ type: 'setInput', input });
    },
    setMessages(messages: Message[]) {
      actorRef.send({ type: 'setMessages', messages });
    },
    setData(data: Parameters<UseChatReturn['setData']>[0]) {
      actorRef.send({ type: 'setData', data });
    },
    submit() {
      actorRef.send({ type: 'submit' });
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

// Hook for accessing the actor ref directly (for advanced use cases)
export function useChatActorRef(): ReturnType<typeof AiChatContext.useActorRef> {
  return AiChatContext.useActorRef();
}

// Legacy compatibility - simple hook that returns the useChat-like interface
export function useAiChat(): {
  messages: Message[];
  input: string;
  isLoading: boolean;
  error: Error | undefined;
  data: unknown;
  status: UseChatReturn['status'];
  append: (message: Parameters<UseChatReturn['append']>[0]) => void;
  reload: () => void;
  stop: () => void;
  setInput: (input: string) => void;
  setMessages: (messages: Message[]) => void;
  setData: (data: Parameters<UseChatReturn['setData']>[0]) => void;
  handleSubmit: () => void;
} {
  const messages = useChatSelector((state) => state.context.messages);
  const input = useChatSelector((state) => state.context.input);
  const isLoading = useChatSelector((state) => state.context.isLoading);
  const error = useChatSelector((state) => state.context.error);
  const data = useChatSelector((state) => state.context.data);
  const status = useChatSelector((state) => state.context.status);
  const actions = useChatActions();

  return {
    messages,
    input,
    isLoading,
    error,
    data,
    status,
    append: actions.append,
    reload: actions.reload,
    stop: actions.stop,
    setInput: actions.setInput,
    setMessages: actions.setMessages,
    setData: actions.setData,
    handleSubmit: actions.submit,
  };
}
