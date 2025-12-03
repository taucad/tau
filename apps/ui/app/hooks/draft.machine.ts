/**
 * Draft Machine
 *
 * XState machine for managing draft and edit state with debounced persistence.
 * Actors are provided via machine.provide() in the consumer (use-chat.tsx)
 * following the pattern from use-build.tsx.
 */

import { setup, assign, fromPromise } from 'xstate';
import type { Chat, MyUIMessage } from '@taucad/chat';

// Context for draft state
export type DraftMachineContext = {
  chatId?: string;
  // Main draft state
  draftText: string;
  draftImages: string[];
  draftToolChoice: string | string[];
  // Edit draft state
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId?: string;
  editDraftText: string;
  editDraftImages: string[];
};

export type DraftMachineInput = {
  chatId?: string;
};

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

// Events
type DraftMachineEvents =
  | { type: 'initializeFromChat'; chat: Chat }
  | { type: 'setChatId'; chatId: string }
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
  | { type: 'startEditingMessage'; messageId: string; originalMessage?: MyUIMessage }
  | { type: 'exitEditMode' }
  | { type: 'clearEditDraft' }
  | { type: 'clearMessageEdit'; messageId: string };

// Placeholder actors - actual implementations provided via machine.provide()
const persistDraftActor = fromPromise<void, { chatId: string; draft: MyUIMessage }>(async () => {
  throw new Error('persistDraftActor not provided');
});

const persistEditDraftActor = fromPromise<void, { chatId: string; messageId: string; draft: MyUIMessage }>(async () => {
  throw new Error('persistEditDraftActor not provided');
});

const clearMessageEditActor = fromPromise<void, { chatId: string; messageId: string }>(async () => {
  throw new Error('clearMessageEditActor not provided');
});

export const draftMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    context: {} as DraftMachineContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    events: {} as DraftMachineEvents,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    input: {} as DraftMachineInput,
  },
  actors: {
    persistDraftActor,
    persistEditDraftActor,
    clearMessageEditActor,
  },
  guards: {
    isValidChatId: ({ context }) => Boolean(context.chatId?.startsWith('chat_')),
    canPersist: ({ context }) => Boolean(context.chatId?.startsWith('chat_')),
  },
  delays: {
    saveDebounce: 200,
  },
}).createMachine({
  id: 'draft',
  context({ input }) {
    return {
      chatId: input.chatId,
      draftText: '',
      draftImages: [],
      draftToolChoice: 'auto',
      messageEdits: {},
      activeEditMessageId: undefined,
      editDraftText: '',
      editDraftImages: [],
    };
  },
  type: 'parallel',
  states: {
    // Handles all draft events and updates context
    events: {
      on: {
        initializeFromChat: {
          actions: assign(({ event }) => {
            const { id: chatId, draft, messageEdits } = event.chat;

            // Handle undefined/null draft
            const draftMessage = draft ?? createEmptyDraftMessage();
            const textPart = draftMessage.parts.find((p) => p.type === 'text');
            const draftText = textPart?.text ?? '';
            const imageParts = draftMessage.parts.filter((p) => p.type === 'file');
            const draftImages = imageParts.map((p) => p.url);

            // Handle undefined/null messageEdits
            const edits = messageEdits ?? {};

            return {
              chatId,
              draftText,
              draftImages,
              messageEdits: edits,
              // Clear any active edit state when switching chats
              activeEditMessageId: undefined,
              editDraftText: '',
              editDraftImages: [],
            };
          }),
        },
        setChatId: {
          actions: assign({
            chatId: ({ event }) => event.chatId,
          }),
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
              const existingEditDraft = context.messageEdits[event.messageId];
              const draftToLoad = existingEditDraft ?? event.originalMessage;

              const textPart = draftToLoad?.parts.find((p) => p.type === 'text');
              const imageParts = draftToLoad?.parts.filter((p) => p.type === 'file') ?? [];

              return {
                messageEdits: {
                  ...context.messageEdits,
                  [context.activeEditMessageId]: currentEditDraft,
                },
                activeEditMessageId: event.messageId,
                editDraftText: textPart?.text ?? '',
                editDraftImages: imageParts.map((p) => p.url),
              };
            }

            // Load new edit
            const editDraft = context.messageEdits[event.messageId];
            const draftToLoad = editDraft ?? event.originalMessage;

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
        clearEditDraft: {
          actions: assign({
            editDraftText: '',
            editDraftImages: [],
          }),
        },
        clearMessageEdit: {
          actions: assign(({ context, event }) => {
            const newEdits = { ...context.messageEdits };
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove message edit
            delete newEdits[event.messageId];

            return { messageEdits: newEdits };
          }),
        },
      },
    },
    // Debounced saving for new message input draft
    inputSaving: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setDraftText: 'pending',
            addDraftImage: 'pending',
            removeDraftImage: 'pending',
            // Handle draft clearing with immediate persistence
            clearDraft: {
              target: 'persisting',
              guard: 'canPersist',
            },
          },
        },
        pending: {
          after: {
            saveDebounce: [
              {
                guard: 'canPersist',
                target: 'persisting',
              },
              {
                target: 'idle',
              },
            ],
          },
          on: {
            setDraftText: {
              target: 'pending',
              reenter: true,
            },
            addDraftImage: {
              target: 'pending',
              reenter: true,
            },
            removeDraftImage: {
              target: 'pending',
              reenter: true,
            },
          },
        },
        persisting: {
          invoke: {
            src: 'persistDraftActor',
            input: ({ context }) => ({
              chatId: context.chatId!,
              draft: buildDraftMessage(context.draftText, context.draftImages),
            }),
            onDone: 'idle',
            onError: 'idle',
          },
          on: {
            // Queue new changes while persisting
            setDraftText: 'pending',
            addDraftImage: 'pending',
            removeDraftImage: 'pending',
          },
        },
      },
    },
    // Debounced saving for message edit draft
    editSaving: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setEditDraftText: 'pending',
            addEditDraftImage: 'pending',
            removeEditDraftImage: 'pending',
          },
        },
        pending: {
          after: {
            saveDebounce: [
              {
                guard: 'canPersist',
                target: 'persisting',
              },
              {
                target: 'idle',
              },
            ],
          },
          on: {
            setEditDraftText: {
              target: 'pending',
              reenter: true,
            },
            addEditDraftImage: {
              target: 'pending',
              reenter: true,
            },
            removeEditDraftImage: {
              target: 'pending',
              reenter: true,
            },
          },
        },
        persisting: {
          invoke: {
            src: 'persistEditDraftActor',
            input: ({ context }) => ({
              chatId: context.chatId!,
              messageId: context.activeEditMessageId!,
              draft: buildDraftMessage(context.editDraftText, context.editDraftImages),
            }),
            onDone: 'idle',
            onError: 'idle',
          },
          on: {
            // Queue new changes while persisting
            setEditDraftText: 'pending',
            addEditDraftImage: 'pending',
            removeEditDraftImage: 'pending',
          },
        },
      },
    },
    // Async clearing of message edits
    editClearing: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            clearMessageEdit: {
              target: 'clearing',
              guard: 'canPersist',
            },
          },
        },
        clearing: {
          invoke: {
            src: 'clearMessageEditActor',
            input({ context, event }) {
              const { messageId } = event as { type: 'clearMessageEdit'; messageId: string };

              return {
                chatId: context.chatId!,
                messageId,
              };
            },
            onDone: 'idle',
            onError: 'idle',
          },
        },
      },
    },
  },
});
