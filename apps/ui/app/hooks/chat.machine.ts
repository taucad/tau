/**
 * Chat Machine
 *
 * XState machine for managing chat state with AI SDK integration:
 * - Performance optimized state subscriptions via useSelector
 * - Centralized state management
 * - Debounced state synchronization using XState delayed transitions
 * - Proxy actions through XState for consistent state management
 */

import type { useChat } from '@ai-sdk/react';
import { setup, assign, enqueueActions } from 'xstate';
import { messageStatus } from '@taucad/chat/constants';
import type { Chat, MyUIMessage } from '@taucad/chat';
import { createMessage } from '#utils/chat.utils.js';

type UseChatReturn = ReturnType<typeof useChat<MyUIMessage>>;

// Define the machine context to mirror useChat state
export type ChatMachineContext = {
  chatId?: string; // Current chat ID for emissions
  resourceId?: string; // Resource ID this chat belongs to
  lastInitializedChatId?: string; // Track last chat that was initialized to prevent stale sync overwrites
  messages: MyUIMessage[]; // Keep array for compatibility with useChat
  messagesById: Map<string, MyUIMessage>; // O(1) lookup map
  messageOrder: string[]; // Preserve message order
  input: string;
  isLoading: boolean;
  error?: Error;
  data?: unknown;
  status: UseChatReturn['status'];
  // Draft message state (minimal - MyUIMessage is built on emission)
  draftText: string; // Draft text content
  draftImages: string[]; // Draft image URLs
  draftToolChoice: string | string[]; // Selected tool choice for draft
  // Edit draft state (for editing existing messages)
  messageEdits: Record<string, MyUIMessage>; // Mirrored from buildMachine
  activeEditMessageId?: string; // Currently editing
  editDraftText: string; // Edit draft text content
  editDraftImages: string[]; // Edit draft image URLs
  // Pending sync data to batch updates during debounce period
  pendingSyncData?: Partial<Omit<ChatMachineContext, '_chatActions' | 'pendingSyncData' | 'pendingReload'>>;
  // Flag to track if regenerate should be called after _chatActions is registered
  pendingReload?: boolean;
  // Internal refs to useChat actions - prefixed with _ to indicate internal use
  _chatActions?: {
    sendMessage: UseChatReturn['sendMessage'];
    regenerate: UseChatReturn['regenerate'];
    stop: UseChatReturn['stop'];
    setMessages: UseChatReturn['setMessages'];
  };
};

export type ChatMachineInput = {
  chatId?: string;
  resourceId?: string;
};

// Helper function to normalize messages for O(1) lookup
function normalizeMessages(messages: MyUIMessage[]): {
  messagesById: Map<string, MyUIMessage>;
  messageOrder: string[];
} {
  const messagesById = new Map<string, MyUIMessage>();
  const messageOrder: string[] = [];

  for (const message of messages) {
    messagesById.set(message.id, message);
    messageOrder.push(message.id);
  }

  return { messagesById, messageOrder };
}

// Helper to build draft message from text and images
function buildDraftMessage(text: string, images: string[]): MyUIMessage {
  const parts: MyUIMessage['parts'] = [];

  if (text.trim().length > 0) {
    parts.push({
      type: 'text',
      text,
    });
  }

  for (const image of images) {
    parts.push({
      type: 'file',
      url: image,
      mediaType: 'image/png',
    });
  }

  return {
    id: 'draft',
    role: 'user',
    metadata: {
      createdAt: Date.now(),
      status: 'pending',
    },
    parts,
  };
}

// Helper to create empty draft
export function createEmptyDraftMessage(): MyUIMessage {
  return {
    id: '',
    role: 'user',
    parts: [],
    metadata: {
      createdAt: Date.now(),
      status: 'pending',
    },
  };
}

type ChatMachineEvents =
  | {
      type: 'queueSync';
      payload: Partial<Omit<ChatMachineContext, '_chatActions' | 'pendingSyncData'>>;
    }
  | { type: 'registerChatActions'; actions: NonNullable<ChatMachineContext['_chatActions']> }
  | { type: 'sendMessage'; message: Parameters<UseChatReturn['sendMessage']>[0] }
  | { type: 'regenerate' }
  | { type: 'stop' }
  | { type: 'setMessages'; messages: MyUIMessage[] }
  | { type: 'setDraftText'; text: string }
  | { type: 'addDraftImage'; image: string }
  | { type: 'removeDraftImage'; index: number }
  | { type: 'setDraftToolChoice'; toolChoice: string | string[] }
  | { type: 'clearDraft' }
  | { type: 'loadDraftFromMessage'; draft: MyUIMessage }
  | { type: 'setEditDraftText'; text: string }
  | { type: 'addEditDraftImage'; image: string }
  | { type: 'removeEditDraftImage'; index: number }
  | { type: 'loadAllMessageEdits'; edits: Record<string, MyUIMessage> }
  | { type: 'startEditingMessage'; messageId: string }
  | { type: 'exitEditMode' }
  | { type: 'loadEditDraftFromMessage'; messageId: string; draft: MyUIMessage }
  | { type: 'clearEditDraft' }
  | { type: 'editMessage'; messageId: string; content: string; model: string; metadata?: unknown; imageUrls?: string[] }
  | { type: 'retryMessage'; messageId: string; modelId?: string }
  | { type: 'initializeChat'; chat: Chat };

export type ChatMachineEmitted =
  | { type: 'draftChanged'; chatId: string; draft: MyUIMessage }
  | { type: 'editDraftChanged'; chatId: string; messageId: string; draft: MyUIMessage }
  | { type: 'messageEditCleared'; chatId: string; messageId: string }
  | { type: 'messagesChanged'; chatId: string; messages: MyUIMessage[] };

// Create the XState machine with delayed transitions for debouncing
export const chatMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    context: {} as ChatMachineContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    events: {} as ChatMachineEvents,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    emitted: {} as ChatMachineEmitted,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    input: {} as ChatMachineInput,
  },
  guards: {
    isValidChatId: ({ context }) => Boolean(context.chatId?.startsWith('chat_')),
  },
}).createMachine({
  id: 'chat',
  context({ input }) {
    return {
      chatId: input.chatId,
      resourceId: input.resourceId,
      lastInitializedChatId: undefined,
      messages: [],
      messagesById: new Map(),
      messageOrder: [],
      input: '',
      isLoading: false,
      error: undefined,
      data: undefined,
      status: 'ready',
      draftText: '',
      draftImages: [],
      draftToolChoice: 'auto',
      messageEdits: {},
      activeEditMessageId: undefined,
      editDraftText: '',
      editDraftImages: [],
      pendingSyncData: undefined,
      pendingReload: undefined,
      _chatActions: undefined,
    };
  },
  type: 'parallel',
  states: {
    sync: {
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
              actions: [
                assign({
                  _chatActions: ({ event }) => event.actions,
                }),
                enqueueActions(({ context, enqueue }) => {
                  // If messages exist but useChat might not have them yet, sync them
                  // This handles the case where initializeChat fired before _chatActions was registered
                  if (context.messages.length > 0 && context._chatActions) {
                    context._chatActions.setMessages(context.messages);
                  }

                  // If regenerate was pending, execute it now that _chatActions is registered
                  if (context.pendingReload && context._chatActions) {
                    enqueue.assign({
                      pendingReload: undefined,
                    });
                    void context._chatActions.regenerate();
                  }
                }),
              ],
            },
            // Direct action events
            sendMessage: {
              actions: [
                assign({ error: undefined }),
                assign({
                  draftText: '',
                  draftImages: [],
                }),
                ({ context, event }) => {
                  void context._chatActions?.sendMessage(event.message);
                },
              ],
            },
            regenerate: {
              actions: [
                assign({ error: undefined }),
                ({ context }) => {
                  void context._chatActions?.regenerate();
                },
              ],
            },
            stop: {
              actions({ context }) {
                void context._chatActions?.stop();
              },
            },
            setMessages: {
              actions: [
                assign({ error: undefined }),
                assign(({ context, event }) => {
                  // Update useChat's internal state
                  context._chatActions?.setMessages(event.messages);
                  // Also directly update chatMachine context synchronously
                  // This ensures messagesById and messageOrder are updated immediately
                  const normalized = normalizeMessages(event.messages);
                  return {
                    messages: event.messages,
                    messagesById: normalized.messagesById,
                    messageOrder: normalized.messageOrder,
                  };
                }),
              ],
            },
            initializeChat: {
              actions: [
                assign({ error: undefined }),
                assign(({ context, event }) => {
                  // Extract fields from chat object
                  const { id: chatId, messages, draft, messageEdits } = event.chat;

                  // Sync messages to useChat first to ensure it has the correct state
                  // This will trigger a sync back, but that's okay since we're setting the same messages
                  context._chatActions?.setMessages(messages);

                  // Atomically set all chat state
                  const normalized = normalizeMessages(messages);

                  // Handle undefined/null draft - provide default empty draft
                  const draftMessage = draft ?? createEmptyDraftMessage();
                  const textPart = draftMessage.parts.find((p) => p.type === 'text');
                  const draftText = textPart?.text ?? '';
                  const imageParts = draftMessage.parts.filter((p) => p.type === 'file');
                  const draftImages = imageParts.map((p) => p.url);

                  // Handle undefined/null messageEdits - provide default empty object
                  const edits = messageEdits ?? {};

                  // Check if we need to auto-regenerate (last message from user)
                  const lastMessage = messages.at(-1);
                  const shouldReload = lastMessage?.role === 'user';

                  return {
                    chatId,
                    lastInitializedChatId: chatId, // Track which chat was initialized
                    messages,
                    messagesById: normalized.messagesById,
                    messageOrder: normalized.messageOrder,
                    draftText,
                    draftImages,
                    messageEdits: edits,
                    // Clear any active edit state when switching chats
                    activeEditMessageId: undefined,
                    editDraftText: '',
                    editDraftImages: [],
                    // Set pending regenerate flag if needed (will be executed when _chatActions is registered)
                    pendingReload: shouldReload ? true : undefined,
                  };
                }),
              ],
            },
            editMessage: [
              {
                guard: 'isValidChatId',
                actions: [
                  assign({ error: undefined }),
                  assign(({ context, event }) => {
                    // Remove from messageEdits
                    const newEdits = { ...context.messageEdits };
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove message edit
                    delete newEdits[event.messageId];
                    return { messageEdits: newEdits };
                  }),
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
                    const newMessage: MyUIMessage = createMessage({
                      id: event.messageId,
                      content: event.content,
                      role: 'user',
                      imageUrls: event.imageUrls,
                      metadata: {
                        status: messageStatus.pending,
                        model: event.model,
                      },
                    });

                    // Update messages array - keep messages up to and including the edited one
                    const newMessages = [...context.messages.slice(0, messageIndex), newMessage];

                    // Set messages and regenerate
                    context._chatActions.setMessages(newMessages);
                    void context._chatActions.regenerate();
                  },
                  enqueueActions(({ context, event, enqueue }) => {
                    enqueue.emit({
                      type: 'messageEditCleared' as const,
                      chatId: context.chatId!,
                      messageId: event.messageId,
                    });
                  }),
                ],
              },
              {
                actions: [
                  assign({ error: undefined }),
                  assign(({ context, event }) => {
                    // Remove from messageEdits
                    const newEdits = { ...context.messageEdits };
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove message edit
                    delete newEdits[event.messageId];
                    return { messageEdits: newEdits };
                  }),
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
                    const newMessage: MyUIMessage = createMessage({
                      id: event.messageId,
                      content: event.content,
                      role: 'user',
                      imageUrls: event.imageUrls,
                      metadata: {
                        status: messageStatus.pending,
                        model: event.model,
                      },
                    });

                    // Update messages array - keep messages up to and including the edited one
                    const newMessages = [...context.messages.slice(0, messageIndex), newMessage];

                    // Set messages and regenerate
                    context._chatActions.setMessages(newMessages);
                    void context._chatActions.regenerate();
                  },
                ],
              },
            ],
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

                  // Set messages and regenerate to retry
                  context._chatActions.setMessages(newMessages);
                  void context._chatActions.regenerate();
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
                  messages({ context }) {
                    const pendingMessages = context.pendingSyncData?.messages;

                    // Guard: Prevent stale sync from overwriting initialized chat state
                    // If we just initialized a chat, ignore sync data that doesn't match
                    if (context.lastInitializedChatId && pendingMessages) {
                      // If pending messages are different from current, they're likely stale
                      // This happens when useChat still has old messages after initializeChat
                      const currentMessageIds = new Set(context.messageOrder);
                      const pendingMessageIds = new Set(pendingMessages.map((m) => m.id));
                      const areDifferent =
                        currentMessageIds.size !== pendingMessageIds.size ||
                        ![...currentMessageIds].every((id) => pendingMessageIds.has(id));
                      if (areDifferent) {
                        // Stale sync data from previous chat - ignore it
                        return context.messages;
                      }
                    }

                    // Prevent overwriting messages with empty array if we already have messages
                    // This prevents flicker when setMessages is called explicitly
                    if (pendingMessages && pendingMessages.length === 0 && context.messages.length > 0) {
                      return context.messages;
                    }

                    return pendingMessages ?? context.messages;
                  },
                  input: ({ context }) => context.pendingSyncData?.input ?? context.input,
                  isLoading: ({ context }) => context.pendingSyncData?.isLoading ?? context.isLoading,
                  error: ({ context }) => context.pendingSyncData?.error ?? context.error,
                  data: ({ context }) => context.pendingSyncData?.data ?? context.data,
                  status: ({ context }) => context.pendingSyncData?.status ?? context.status,
                  // Update normalized data when messages change
                  messagesById({ context }) {
                    const pendingMessages = context.pendingSyncData?.messages;

                    // Guard: Prevent stale sync from overwriting initialized chat state
                    if (context.lastInitializedChatId && pendingMessages) {
                      const currentMessageIds = new Set(context.messageOrder);
                      const pendingMessageIds = new Set(pendingMessages.map((m) => m.id));
                      const areDifferent =
                        currentMessageIds.size !== pendingMessageIds.size ||
                        ![...currentMessageIds].every((id) => pendingMessageIds.has(id));
                      if (areDifferent) {
                        // Stale sync data - ignore it
                        return context.messagesById;
                      }
                    }

                    // Prevent overwriting messages with empty array if we already have messages
                    if (pendingMessages && pendingMessages.length === 0 && context.messages.length > 0) {
                      return context.messagesById;
                    }

                    const messages = pendingMessages ?? context.messages;

                    return normalizeMessages(messages).messagesById;
                  },
                  messageOrder({ context }) {
                    const pendingMessages = context.pendingSyncData?.messages;

                    // Guard: Prevent stale sync from overwriting initialized chat state
                    if (context.lastInitializedChatId && pendingMessages) {
                      const currentMessageIds = new Set(context.messageOrder);
                      const pendingMessageIds = new Set(pendingMessages.map((m) => m.id));
                      const areDifferent =
                        currentMessageIds.size !== pendingMessageIds.size ||
                        ![...currentMessageIds].every((id) => pendingMessageIds.has(id));
                      if (areDifferent) {
                        // Stale sync data - ignore it
                        return context.messageOrder;
                      }
                    }

                    // Prevent overwriting messages with empty array if we already have messages
                    if (pendingMessages && pendingMessages.length === 0 && context.messages.length > 0) {
                      return context.messageOrder;
                    }

                    const messages = pendingMessages ?? context.messages;

                    return normalizeMessages(messages).messageOrder;
                  },
                  // Clear pending sync data
                  pendingSyncData: undefined,
                  // Clear initialization guard if sync data matches (useChat has caught up)
                  lastInitializedChatId({ context }) {
                    const pendingMessages = context.pendingSyncData?.messages;
                    if (context.lastInitializedChatId && pendingMessages) {
                      const currentMessageIds = new Set(context.messageOrder);
                      const pendingMessageIds = new Set(pendingMessages.map((m) => m.id));
                      const areSame =
                        currentMessageIds.size === pendingMessageIds.size &&
                        [...currentMessageIds].every((id) => pendingMessageIds.has(id));

                      // If sync data matches, useChat has caught up - clear the guard
                      return areSame ? undefined : context.lastInitializedChatId;
                    }

                    return context.lastInitializedChatId;
                  },
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
          },
        },
      },
      on: {
        // Common events that work in any sync state
        registerChatActions: {
          actions: assign({
            _chatActions: ({ event }) => event.actions,
          }),
        },
        sendMessage: {
          actions: [
            assign({ error: undefined }),
            assign({
              draftText: '',
              draftImages: [],
            }),
            ({ context, event }) => {
              void context._chatActions?.sendMessage(event.message);
            },
          ],
        },
        regenerate: {
          actions: [
            assign({ error: undefined }),
            ({ context }) => {
              void context._chatActions?.regenerate();
            },
          ],
        },
        stop: {
          actions({ context }) {
            void context._chatActions?.stop();
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
        setDraftText: {
          actions: assign({
            draftText: ({ event }) => event.text,
          }),
        },
        addDraftImage: {
          actions: assign({
            draftImages: ({ context, event }) => [...context.draftImages, event.image],
          }),
        },
        removeDraftImage: {
          actions: assign({
            draftImages: ({ context, event }) => context.draftImages.filter((_, index) => index !== event.index),
          }),
        },
        setDraftToolChoice: {
          actions: assign({
            draftToolChoice: ({ event }) => event.toolChoice,
          }),
        },
        clearDraft: {
          actions: assign({
            draftText: '',
            draftImages: [],
            draftToolChoice: 'auto',
          }),
        },
        loadDraftFromMessage: {
          actions: assign({
            draftText({ event }) {
              const textPart = event.draft.parts.find((p) => p.type === 'text');
              return textPart?.text ?? '';
            },
            draftImages({ event }) {
              const imageParts = event.draft.parts.filter((p) => p.type === 'file');
              return imageParts.map((p) => p.url);
            },
          }),
        },
        loadAllMessageEdits: {
          actions: assign({
            messageEdits: ({ event }) => event.edits,
          }),
        },
        startEditingMessage: {
          actions: assign(({ context, event }) => {
            // Save current edit if switching between edits
            if (context.activeEditMessageId && context.activeEditMessageId !== event.messageId) {
              const currentEditDraft = buildDraftMessage(context.editDraftText, context.editDraftImages);
              return {
                messageEdits: {
                  ...context.messageEdits,
                  [context.activeEditMessageId]: currentEditDraft,
                },
                activeEditMessageId: event.messageId,
                editDraftText: (() => {
                  const editDraft = context.messageEdits[event.messageId];
                  const originalMessage = context.messagesById.get(event.messageId);
                  const draftToLoad = editDraft ?? originalMessage;
                  const textPart = draftToLoad?.parts.find((p) => p.type === 'text');
                  return textPart?.text ?? '';
                })(),
                editDraftImages: (() => {
                  const editDraft = context.messageEdits[event.messageId];
                  const originalMessage = context.messagesById.get(event.messageId);
                  const draftToLoad = editDraft ?? originalMessage;
                  const imageParts = draftToLoad?.parts.filter((p) => p.type === 'file') ?? [];
                  return imageParts.map((p) => p.url);
                })(),
              };
            }

            // Load new edit
            const editDraft = context.messageEdits[event.messageId];
            const originalMessage = context.messagesById.get(event.messageId);
            const draftToLoad = editDraft ?? originalMessage;

            const textPart = draftToLoad?.parts.find((p) => p.type === 'text');
            const imageParts = draftToLoad?.parts.filter((p) => p.type === 'file') ?? [];

            return {
              activeEditMessageId: event.messageId,
              editDraftText: textPart?.text ?? '',
              editDraftImages: imageParts.map((p) => p.url),
            };
          }),
        },
        exitEditMode: {
          actions: assign(({ context }) => {
            if (!context.activeEditMessageId) {
              return {};
            }

            const currentEditDraft = buildDraftMessage(context.editDraftText, context.editDraftImages);
            return {
              messageEdits: {
                ...context.messageEdits,
                [context.activeEditMessageId]: currentEditDraft,
              },
              activeEditMessageId: undefined,
              editDraftText: '',
              editDraftImages: [],
            };
          }),
        },
        setEditDraftText: {
          actions: assign({
            editDraftText: ({ event }) => event.text,
          }),
        },
        addEditDraftImage: {
          actions: assign({
            editDraftImages: ({ context, event }) => [...context.editDraftImages, event.image],
          }),
        },
        removeEditDraftImage: {
          actions: assign({
            editDraftImages: ({ context, event }) =>
              context.editDraftImages.filter((_, index) => index !== event.index),
          }),
        },
        loadEditDraftFromMessage: {
          actions: assign({
            editDraftText({ event }) {
              const textPart = event.draft.parts.find((p) => p.type === 'text');
              return textPart?.text ?? '';
            },
            editDraftImages({ event }) {
              const imageParts = event.draft.parts.filter((p) => p.type === 'file');
              return imageParts.map((p) => p.url);
            },
          }),
        },
        clearEditDraft: {
          actions: assign({
            editDraftText: '',
            editDraftImages: [],
          }),
        },
        editMessage: [
          {
            guard: 'isValidChatId',
            actions: [
              assign({ error: undefined }),
              assign(({ context, event }) => {
                // Remove from messageEdits
                const newEdits = { ...context.messageEdits };
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove message edit
                delete newEdits[event.messageId];
                return { messageEdits: newEdits };
              }),
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
                const newMessage: MyUIMessage = createMessage({
                  id: event.messageId,
                  content: event.content,
                  imageUrls: event.imageUrls ?? [],
                  role: 'user',
                  metadata: {
                    status: messageStatus.pending,
                    model: event.model,
                  },
                });

                // Update messages array - keep messages up to and including the edited one
                const newMessages = [...context.messages.slice(0, messageIndex), newMessage];

                // Set messages and regenerate
                context._chatActions.setMessages(newMessages);
                void context._chatActions.regenerate();
              },
              enqueueActions(({ context, event, enqueue }) => {
                enqueue.emit({
                  type: 'messageEditCleared' as const,
                  chatId: context.chatId!,
                  messageId: event.messageId,
                });
              }),
            ],
          },
          {
            actions: [
              assign({ error: undefined }),
              assign(({ context, event }) => {
                // Remove from messageEdits
                const newEdits = { ...context.messageEdits };
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove message edit
                delete newEdits[event.messageId];
                return { messageEdits: newEdits };
              }),
              ({ context, event }) => {
                if (!context._chatActions) {
                  return;
                }

                // Find message index
                const messageIndex = context.messages.findIndex((m) => m.id === event.messageId);
                if (messageIndex === -1) {
                  return;
                }

                const newMessage = createMessage({
                  content: event.content,
                  imageUrls: event.imageUrls,
                  id: event.messageId,
                  role: 'user',
                  metadata: {
                    status: messageStatus.pending,
                    model: event.model,
                  },
                });

                // Update messages array - keep messages up to and including the edited one
                const newMessages = [...context.messages.slice(0, messageIndex), newMessage];

                // Set messages and regenerate
                context._chatActions.setMessages(newMessages);
                void context._chatActions.regenerate();
              },
            ],
          },
        ],
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

              void context._chatActions.regenerate();
            },
          ],
        },
      },
    },
    draftEmission: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setDraftText: 'pendingEmit',
            addDraftImage: 'pendingEmit',
            removeDraftImage: 'pendingEmit',
            // Handle draft clearing events with immediate emission
            sendMessage: [
              {
                guard: 'isValidChatId',
                actions: enqueueActions(({ context, enqueue }) => {
                  enqueue.emit({
                    type: 'draftChanged' as const,
                    chatId: context.chatId!,
                    draft: createEmptyDraftMessage(),
                  });
                }),
              },
            ],
            clearDraft: [
              {
                guard: 'isValidChatId',
                actions: enqueueActions(({ context, enqueue }) => {
                  enqueue.emit({
                    type: 'draftChanged' as const,
                    chatId: context.chatId!,
                    draft: createEmptyDraftMessage(),
                  });
                }),
              },
            ],
          },
        },
        pendingEmit: {
          after: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- XState uses numeric keys for delays
            200: [
              {
                guard: 'isValidChatId',
                target: 'idle',
                actions: enqueueActions(({ context, enqueue }) => {
                  enqueue.emit({
                    type: 'draftChanged' as const,
                    chatId: context.chatId!,
                    draft: buildDraftMessage(context.draftText, context.draftImages),
                  });
                }),
              },
              {
                target: 'idle',
              },
            ],
          },
          on: {
            setDraftText: {
              target: 'pendingEmit',
              reenter: true,
            },
            addDraftImage: {
              target: 'pendingEmit',
              reenter: true,
            },
            removeDraftImage: {
              target: 'pendingEmit',
              reenter: true,
            },
          },
        },
      },
    },
    editDraftEmission: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setEditDraftText: 'pendingEmit',
            addEditDraftImage: 'pendingEmit',
            removeEditDraftImage: 'pendingEmit',
          },
        },
        pendingEmit: {
          after: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- XState uses numeric keys for delays
            200: [
              {
                guard: 'isValidChatId',
                target: 'idle',
                actions: enqueueActions(({ context, enqueue }) => {
                  enqueue.emit({
                    type: 'editDraftChanged' as const,
                    chatId: context.chatId!,
                    messageId: context.activeEditMessageId!,
                    draft: buildDraftMessage(context.editDraftText, context.editDraftImages),
                  });
                }),
              },
              {
                target: 'idle',
              },
            ],
          },
          on: {
            setEditDraftText: {
              target: 'pendingEmit',
              reenter: true,
            },
            addEditDraftImage: {
              target: 'pendingEmit',
              reenter: true,
            },
            removeEditDraftImage: {
              target: 'pendingEmit',
              reenter: true,
            },
          },
        },
      },
    },
  },
});

// Define the state type from the machine
export type ChatMachineState = ReturnType<typeof chatMachine.getInitialSnapshot>;

export type ChatMachineActor = typeof chatMachine;
