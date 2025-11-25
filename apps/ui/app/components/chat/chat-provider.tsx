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
import { setup, assign, enqueueActions } from 'xstate';
import { useEffect, useCallback } from 'react';
import type { Message } from '@ai-sdk/react';
import { messageStatus } from '@taucad/types/constants';
import type { Chat, KernelProvider } from '@taucad/types';
import { useBuild } from '#hooks/use-build.js';
import { inspect } from '#machines/inspector.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { decodeTextFile } from '#utils/filesystem.utils.js';

type UseChatArgs = NonNullable<Parameters<typeof useChat>[0]>;
type UseChatReturn = ReturnType<typeof useChat>;

// Define the machine context to mirror useChat state
export type ChatMachineContext = {
  chatId?: string; // Current chat ID for emissions
  lastInitializedChatId?: string; // Track last chat that was initialized to prevent stale sync overwrites
  messages: Message[]; // Keep array for compatibility with useChat
  messagesById: Map<string, Message>; // O(1) lookup map
  messageOrder: string[]; // Preserve message order
  input: string;
  isLoading: boolean;
  error?: Error;
  data?: unknown;
  status: UseChatReturn['status'];
  // Draft message state (minimal - Message is built on emission)
  draftText: string; // Draft text content
  draftImages: string[]; // Draft image URLs
  draftToolChoice: string | string[]; // Selected tool choice for draft
  // Edit draft state (for editing existing messages)
  messageEdits: Record<string, Message>; // Mirrored from buildMachine
  activeEditMessageId?: string; // Currently editing
  editDraftText: string; // Edit draft text content
  editDraftImages: string[]; // Edit draft image URLs
  // Pending sync data to batch updates during debounce period
  pendingSyncData?: Partial<Omit<ChatMachineContext, '_chatActions' | 'pendingSyncData' | 'pendingReload'>>;
  // Flag to track if reload should be called after _chatActions is registered
  pendingReload?: boolean;
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

// Helper to build draft message from text and images
function buildDraftMessage(text: string, images: string[]): Message {
  const parts: Message['parts'] = [];

  if (text.trim().length > 0) {
    parts.push({
      type: 'text',
      text,
    });
  }

  for (const image of images) {
    parts.push({
      type: 'file',
      data: image,
      mimeType: 'image/png',
    });
  }

  return {
    id: 'draft',
    role: 'user',
    content: parts.map((part) => (part.type === 'text' ? part.text : '')).join(''),
    parts,
    model: '',
    status: 'pending',
  };
}

// Helper to create empty draft
export function createEmptyDraftMessage(): Message {
  return {
    id: '',
    role: 'user',
    content: '',
    parts: [],
    model: '',
    status: 'pending',
  };
}

type ChatMachineEvents =
  | {
      type: 'queueSync';
      payload: Partial<Omit<ChatMachineContext, '_chatActions' | 'pendingSyncData'>>;
    }
  | { type: 'registerChatActions'; actions: NonNullable<ChatMachineContext['_chatActions']> }
  | { type: 'append'; message: Parameters<UseChatReturn['append']>[0] }
  | { type: 'reload' }
  | { type: 'stop' }
  | { type: 'setInput'; input: string }
  | { type: 'setMessages'; messages: Message[] }
  | { type: 'setData'; data: Parameters<UseChatReturn['setData']>[0] }
  | { type: 'submit' }
  | { type: 'setDraftText'; text: string }
  | { type: 'addDraftImage'; image: string }
  | { type: 'removeDraftImage'; index: number }
  | { type: 'setDraftToolChoice'; toolChoice: string | string[] }
  | { type: 'clearDraft' }
  | { type: 'loadDraftFromMessage'; draft: Message }
  | { type: 'setEditDraftText'; text: string }
  | { type: 'addEditDraftImage'; image: string }
  | { type: 'removeEditDraftImage'; index: number }
  | { type: 'loadAllMessageEdits'; edits: Record<string, Message> }
  | { type: 'startEditingMessage'; messageId: string }
  | { type: 'exitEditMode' }
  | { type: 'loadEditDraftFromMessage'; messageId: string; draft: Message }
  | { type: 'clearEditDraft' }
  | { type: 'editMessage'; messageId: string; content: string; model: string; metadata?: unknown; imageUrls?: string[] }
  | { type: 'retryMessage'; messageId: string; modelId?: string }
  | {
      type: 'initializeChat';
      chat: Chat;
    };

type ChatMachineEmitted =
  | { type: 'draftChanged'; chatId: string; draft: Message }
  | { type: 'editDraftChanged'; chatId: string; messageId: string; draft: Message }
  | { type: 'messageEditCleared'; chatId: string; messageId: string };

// Create the XState machine with delayed transitions for debouncing
const chatMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    context: {} as ChatMachineContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    events: {} as ChatMachineEvents,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    emitted: {} as ChatMachineEmitted,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    input: {} as { chatId?: string },
  },
  guards: {
    isValidChatId: ({ context }) => Boolean(context.chatId?.startsWith('chat_')),
  },
}).createMachine({
  id: 'ai-chat',
  context({ input }) {
    return {
      chatId: input.chatId,
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

                  // If reload was pending, execute it now that _chatActions is registered
                  if (context.pendingReload && context._chatActions) {
                    enqueue.assign({
                      pendingReload: undefined,
                    });
                    void context._chatActions.reload();
                  }
                }),
              ],
            },
            // Direct action events
            append: {
              actions: [
                assign({ error: undefined }),
                assign({
                  draftText: '',
                  draftImages: [],
                }),
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
                  const textPart = draftMessage.parts?.find((p) => p.type === 'text');
                  const draftText = textPart && 'text' in textPart ? textPart.text : '';
                  const imageParts = draftMessage.parts?.filter((p) => p.type === 'file') ?? [];
                  const draftImages = imageParts.map((p) => ('data' in p ? p.data : '')).filter((url) => url !== '');

                  // Handle undefined/null messageEdits - provide default empty object
                  const edits = messageEdits ?? {};

                  // Check if we need to auto-reload (last message from user)
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
                    // Set pending reload flag if needed (will be executed when _chatActions is registered)
                    pendingReload: shouldReload ? true : undefined,
                  };
                }),
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
        append: {
          actions: [
            assign({ error: undefined }),
            assign({
              draftText: '',
              draftImages: [],
            }),
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
            assign({
              draftText: '',
              draftImages: [],
            }),
            ({ context }) => {
              context._chatActions?.handleSubmit();
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
              const textPart = event.draft.parts?.find((p) => p.type === 'text');
              return textPart && 'text' in textPart ? textPart.text : '';
            },
            draftImages({ event }) {
              const imageParts = event.draft.parts?.filter((p) => p.type === 'file') ?? [];
              return imageParts.map((p) => ('data' in p ? p.data : '')).filter((url) => url !== '');
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
                  const textPart = draftToLoad?.parts?.find((p) => p.type === 'text');
                  return textPart && 'text' in textPart ? textPart.text : '';
                })(),
                editDraftImages: (() => {
                  const editDraft = context.messageEdits[event.messageId];
                  const originalMessage = context.messagesById.get(event.messageId);
                  const draftToLoad = editDraft ?? originalMessage;
                  const imageParts = draftToLoad?.parts?.filter((p) => p.type === 'file') ?? [];
                  return imageParts.map((p) => ('data' in p ? p.data : '')).filter((url) => url !== '');
                })(),
              };
            }

            // Load new edit
            const editDraft = context.messageEdits[event.messageId];
            const originalMessage = context.messagesById.get(event.messageId);
            const draftToLoad = editDraft ?? originalMessage;

            const textPart = draftToLoad?.parts?.find((p) => p.type === 'text');
            const imageParts = draftToLoad?.parts?.filter((p) => p.type === 'file') ?? [];

            return {
              activeEditMessageId: event.messageId,
              editDraftText: textPart && 'text' in textPart ? textPart.text : '',
              editDraftImages: imageParts.map((p) => ('data' in p ? p.data : '')).filter((url) => url !== ''),
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
              const textPart = event.draft.parts?.find((p) => p.type === 'text');
              return textPart && 'text' in textPart ? textPart.text : '';
            },
            editDraftImages({ event }) {
              const imageParts = event.draft.parts?.filter((p) => p.type === 'file') ?? [];
              return imageParts.map((p) => ('data' in p ? p.data : '')).filter((url) => url !== '');
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

              void context._chatActions.reload();
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
            append: [
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
            submit: [
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
type ChatMachineState = ReturnType<typeof chatMachine.getInitialSnapshot>;

// Create the actor context using XState's createActorContext
export const ChatContext = createActorContext(chatMachine, {
  inspect,
});

// Provider component that wraps useChat and syncs with XState
export function ChatProvider({
  children,
  value,
  chatId,
}: {
  readonly children: React.ReactNode;
  readonly value: Omit<UseChatArgs, 'onFinish' | 'onError' | 'onResponse'>;
  readonly chatId?: string;
}): React.JSX.Element {
  return (
    <ChatContext.Provider options={{ input: { chatId } }}>
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
  readonly value: Omit<UseChatArgs, 'onFinish' | 'onError' | 'onResponse'>;
}): React.JSX.Element {
  const actorRef = ChatContext.useActorRef();
  const buildContext = useBuild({ enableNoContext: true });
  const fileManager = useFileManager();
  const [kernel] = useCookie<KernelProvider>(cookieName.cadKernel, 'openscad');

  // Initialize useChat with sync callbacks
  const chat = useChat({
    ...value,
    credentials: 'include',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- experimental API
    experimental_prepareRequestBody(requestBody) {
      let feedback = {};
      if (buildContext) {
        const buildSnapshot = buildContext.buildRef.getSnapshot();
        const mainFilePath = buildSnapshot.context.build?.assets.mechanical?.main;

        // Try to get the current code, but don't fail if it's not available
        let code: string | undefined;
        if (mainFilePath) {
          const fileManagerSnapshot = fileManager.fileManagerRef.getSnapshot();
          const fileData = fileManagerSnapshot.context.openFiles.get(mainFilePath);

          if (fileData) {
            code = decodeTextFile(fileData);
          }
        }

        // Get error state from CAD machine
        const cadActorState = buildContext.cadRef.getSnapshot();
        feedback = {
          code,
          kernel,
          codeErrors: cadActorState.context.codeErrors,
          kernelError: cadActorState.context.kernelError,
        };
      }

      // Send messages needed for LangGraph to process the request:
      // - Last user message (for model ID and context)
      // - Last assistant message + messages after it (for resuming with tool results)
      // LangGraph checkpointer maintains full conversation history via thread_id
      const { messages } = requestBody;

      // Find the last user message (needed for model ID)
      const lastUserMessage = messages.findLast((m) => m.role === 'user');

      // Find messages from last assistant onward (includes assistant + tool results for resume)
      const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');
      const hasAssistantMessage = lastAssistantIndex !== -1;
      const messagesFromAssistant = hasAssistantMessage
        ? messages.slice(lastAssistantIndex).filter((m) => m.role !== 'user')
        : [];

      // Combine: last user message + [assistant message + tool results] if present
      const newMessages = lastUserMessage ? [lastUserMessage, ...messagesFromAssistant] : [];

      const body = {
        ...requestBody,
        messages: newMessages,
        ...feedback,
      } as const satisfies typeof requestBody;

      return body;
    },
    onFinish(..._args) {
      // Queue sync instead of immediate sync - XState will debounce
      queueSyncChatState();
    },
    onError(...args) {
      console.error('Chat error:', args);
      queueSyncChatState();
    },
    onResponse(..._args) {
      queueSyncChatState();
    },
  });

  // Function to queue chat state sync (will be debounced by XState)
  const queueSyncChatState = useCallback(() => {
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
  }, [actorRef, chat.messages, chat.input, chat.status, chat.error, chat.data]);

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
  }, [actorRef, chat.append, chat.handleSubmit, chat.reload, chat.setData, chat.setInput, chat.setMessages, chat.stop]);

  // Queue sync on key changes (XState will handle debouncing)
  useEffect(() => {
    queueSyncChatState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queueSyncChatState is stable and captures latest values
  }, [chat.messages, chat.input, chat.status, chat.error, chat.data]);

  return children as React.JSX.Element;
}

// Type-safe selector hook with full TypeScript support
export function useChatSelector<T>(
  selector: (state: ChatMachineState) => T,
  equalityFn?: (previous: T, next: T) => boolean,
): T {
  return ChatContext.useSelector(selector, equalityFn);
}

// Hook for accessing sync state (useful for debugging)
export function useChatSyncState(): {
  isInSyncState: boolean;
  hasPendingSync: boolean;
} {
  return useChatSelector((state) => ({
    isInSyncState: state.matches({ sync: 'pendingSync' }),
    hasPendingSync: Boolean(state.context.pendingSyncData),
  }));
}

// Hook for chat actions (proxied through XState)
export function useChatActions(): {
  append: (message: Parameters<UseChatReturn['append']>[0]) => void;
  reload: () => void;
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
    append(message: Parameters<UseChatReturn['append']>[0]) {
      actorRef.send({ type: 'append', message });
    },
    reload() {
      actorRef.send({ type: 'reload' });
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
