/**
 * Chat Persistence Machine
 *
 * XState machine for managing chat persistence with debouncing.
 * Uses event-driven persistence triggered by onFinish callbacks from useChat.
 *
 * Actors are provided via machine.provide() in the consumer (use-chat.tsx)
 * following the pattern from use-build.tsx.
 */

import { setup, assign, fromPromise } from 'xstate';
import type { Chat, MyUIMessage } from '@taucad/chat';

// Input types
export type ChatPersistenceMachineInput = {
  activeChatId?: string;
  resourceId?: string;
};

// Context
export type ChatPersistenceMachineContext = {
  activeChatId?: string;
  resourceId?: string;
  // Loading state
  isLoadingChat: boolean;
  loadError?: Error;
  // Pending messages to persist (set by queuePersist, consumed by debounced persist)
  pendingMessages?: MyUIMessage[];
};

// Events
type ChatPersistenceMachineEvents =
  | { type: 'setActiveChatId'; chatId: string }
  | { type: 'queuePersist'; messages: MyUIMessage[] }
  | { type: 'handleError'; error: Error };

// Placeholder actors - actual implementations provided via machine.provide()
const loadChatActor = fromPromise<Chat | undefined, { chatId: string }>(async () => {
  throw new Error('loadChatActor not provided');
});

const persistMessagesActor = fromPromise<void, { chatId: string; messages: MyUIMessage[] }>(async () => {
  throw new Error('persistMessagesActor not provided');
});

export const chatPersistenceMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    context: {} as ChatPersistenceMachineContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    events: {} as ChatPersistenceMachineEvents,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    input: {} as ChatPersistenceMachineInput,
  },
  actors: {
    loadChatActor,
    persistMessagesActor,
  },
  guards: {
    hasValidChatId({ context, event }) {
      // Check event.chatId for setActiveChatId event, otherwise check context
      const chatId = 'chatId' in event ? event.chatId : context.activeChatId;

      return Boolean(chatId?.startsWith('chat_'));
    },
    hasPendingMessages: ({ context }) => Boolean(context.pendingMessages && context.pendingMessages.length >= 0),
    canPersist({ context, event }) {
      // Can persist if: not loading AND has valid chatId
      const chatId = 'chatId' in event ? event.chatId : context.activeChatId;

      return !context.isLoadingChat && Boolean(chatId?.startsWith('chat_'));
    },
  },
  delays: {
    persistDebounce: 100,
  },
}).createMachine({
  id: 'chatPersistence',
  context({ input }) {
    return {
      activeChatId: input.activeChatId,
      resourceId: input.resourceId,
      isLoadingChat: false,
      loadError: undefined,
      pendingMessages: undefined,
    };
  },
  type: 'parallel',
  states: {
    // Chat loading state
    chatLoading: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveChatId: {
              target: 'loading',
              guard: 'hasValidChatId',
              actions: assign({
                activeChatId: ({ event }) => event.chatId,
                isLoadingChat: true,
                loadError: undefined,
              }),
            },
          },
        },
        loading: {
          invoke: {
            src: 'loadChatActor',
            input: ({ context }) => ({
              chatId: context.activeChatId!,
            }),
            onDone: {
              target: 'idle',
              actions: assign({
                isLoadingChat: false,
              }),
            },
            onError: {
              target: 'idle',
              actions: assign({
                isLoadingChat: false,
                loadError: ({ event }) => event.error as Error,
              }),
            },
          },
          on: {
            // If chat changes while loading, restart loading
            setActiveChatId: {
              target: 'loading',
              reenter: true,
              actions: assign({
                activeChatId: ({ event }) => event.chatId,
                loadError: undefined,
              }),
            },
          },
        },
      },
    },
    // Message persistence with debouncing
    messagePersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            queuePersist: {
              target: 'pending',
              guard: 'canPersist',
              actions: assign({
                pendingMessages: ({ event }) => event.messages,
              }),
            },
          },
        },
        pending: {
          after: {
            persistDebounce: {
              target: 'persisting',
              guard: 'hasPendingMessages',
            },
          },
          on: {
            // Reset timer if new messages come in
            queuePersist: {
              target: 'pending',
              reenter: true,
              actions: assign({
                pendingMessages: ({ event }) => event.messages,
              }),
            },
          },
        },
        persisting: {
          invoke: {
            src: 'persistMessagesActor',
            input: ({ context }) => ({
              chatId: context.activeChatId!,
              messages: context.pendingMessages!,
            }),
            onDone: {
              target: 'idle',
              actions: assign({
                pendingMessages: undefined,
              }),
            },
            onError: {
              target: 'idle',
              actions: assign({
                pendingMessages: undefined,
              }),
            },
          },
          on: {
            // Queue new messages while persisting
            queuePersist: {
              actions: assign({
                pendingMessages: ({ event }) => event.messages,
              }),
            },
          },
        },
      },
    },
  },
  on: {
    handleError: {
      actions({ event }) {
        console.error('Chat persistence error:', event.error);
      },
    },
  },
});

export type ChatPersistenceMachineState = ReturnType<typeof chatPersistenceMachine.getInitialSnapshot>;
export type ChatPersistenceMachineActor = typeof chatPersistenceMachine;
