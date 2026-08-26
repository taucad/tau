/**
 * Draft Machine
 *
 * XState machine for managing draft and edit state with debounced persistence.
 * Actors are provided via machine.provide() in the consumer (use-chat.tsx)
 * following the pattern from use-project.tsx.
 *
 * ## Image resize chokepoint
 *
 * The `imageProcessing` parallel sub-region is the SINGLE source of truth for
 * chat-image resizing. `addDraftImage` and `addEditDraftImage` events accept
 * RAW data URLs (any length) and enqueue them in `context.imageQueue`. The
 * `resizing` state invokes `resizeImageActor` (provided via `.provide` from
 * `apps/ui/app/hooks/resize-image.actor.ts`) FIFO. Success appends the resized
 * URL to `draftImages` / `editDraftImages`. Failure shifts the queue and emits
 * `imageResizeFailed`, observed by `<ActiveChatProvider>` to surface a toast.
 *
 * Callers MUST send raw URLs and MUST NOT pre-resize — pre-sized URLs would
 * still pass through the queue but waste CPU and confuse the byte-ceiling
 * contract.
 */

import { setup, assign, emit } from 'xstate';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { extractMimeTypeFromDataUrl } from '#utils/chat.utils.js';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';

// FIFO image-resize queue entry. The machine processes one entry at a time
// via the `imageProcessing.resizing` state, preserving submission order.
type ImageQueueTarget = 'main' | 'edit';
type ImageQueueEntry = {
  /** Stable id for trace/debug; not consumed by the UI. */
  readonly id: string;
  readonly raw: string;
  readonly target: ImageQueueTarget;
};

// Context for draft state
export type DraftMachineContext = {
  chatId?: string;
  // Main draft state
  draftText: string;
  draftImages: string[];
  draftToolChoice: string | string[];
  draftMode: ChatMode;
  // Edit draft state
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId?: string;
  editDraftText: string;
  editDraftImages: string[];
  /** FIFO queue of raw image data URLs awaiting resize via `imageProcessing.resizing`. */
  imageQueue: readonly ImageQueueEntry[];
};

/**
 * Events the machine emits via `emit(...)`. Subscribed to by
 * `<ActiveChatProvider>` (see `useDraftImageErrorToast`) so resize failures
 * surface as a single global toast — no per-caller try/catch needed.
 */
export type DraftEmittedEvents = {
  type: 'imageResizeFailed';
  error: Error;
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
      mediaType: extractMimeTypeFromDataUrl(image),
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
  | { type: 'setDraftMode'; mode: ChatMode }
  | { type: 'clearDraft' }
  | { type: 'loadDraftFromMessageTransient'; draft: MyUIMessage }
  | { type: 'setEditDraftText'; text: string }
  | { type: 'addEditDraftImage'; image: string }
  | { type: 'removeEditDraftImage'; index: number }
  | { type: 'loadAllMessageEdits'; edits: Record<string, MyUIMessage> }
  | {
      type: 'startEditingMessage';
      messageId: string;
      originalMessage?: MyUIMessage;
    }
  | { type: 'exitEditMode' }
  | { type: 'clearEditDraft' }
  | { type: 'clearMessageEdit'; messageId: string }
  // Flush pending state immediately (bypasses debounce, used on tab close)
  | { type: 'flushNow' }
  // Emitted by `resizeImageActor` when a queued image finishes resizing.
  // Internal — callers must not send this directly.
  | { type: 'imageResized'; resized: string };

// Placeholder actors - actual implementations provided via machine.provide()
const persistDraftActor = fromSafeAsync<void, { chatId: string; draft: MyUIMessage }>(async () => {
  throw new Error('persistDraftActor not provided');
});

const persistEditDraftActor = fromSafeAsync<void, { chatId: string; messageId: string; draft: MyUIMessage }>(
  async () => {
    throw new Error('persistEditDraftActor not provided');
  },
);

const clearMessageEditActor = fromSafeAsync<void, { chatId: string; messageId: string }>(async () => {
  throw new Error('clearMessageEditActor not provided');
});

/**
 * Placeholder resize actor. The real implementation lives in
 * `apps/ui/app/hooks/resize-image.actor.ts` and is provided via
 * `.provide({ actors: { resizeImageActor } })` by both ownership sites
 * (`EphemeralActiveChatProvider`, `ChatSessionStore`). Tests override with
 * a deterministic fake.
 */
const resizeImageActor = fromSafeAsync<{ type: 'imageResized'; resized: string }, { image: string }>(async () => {
  throw new Error('resizeImageActor not provided');
});

export const draftMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    context: {} as DraftMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    events: {} as DraftMachineEvents,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    input: {} as DraftMachineInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    emitted: {} as DraftEmittedEvents,
  },
  actors: {
    persistDraftActor,
    persistEditDraftActor,
    clearMessageEditActor,
    resizeImageActor,
  },
  guards: {
    isValidChatId: ({ context }) => Boolean(context.chatId?.startsWith('chat_')),
    canPersist: ({ context }) => Boolean(context.chatId?.startsWith('chat_')),
    hasQueuedImage: ({ context }) => context.imageQueue.length > 0,
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
      draftMode: 'agent' as ChatMode,
      messageEdits: {},
      activeEditMessageId: undefined,
      editDraftText: '',
      editDraftImages: [],
      imageQueue: [],
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
            imageQueue: ({ context, event }) => [
              ...context.imageQueue,
              {
                id: generatePrefixedId(idPrefix.log),
                raw: event.image,
                target: 'main' as ImageQueueTarget,
              },
            ],
          }),
        },
        removeDraftImage: {
          actions: assign({
            draftImages: ({ context, event }) => context.draftImages.filter((_, index) => index !== event.index),
          }),
        },
        imageResized: {
          actions: assign(({ context, event }) => {
            const head = context.imageQueue[0];
            if (!head) {
              return {};
            }
            const remaining = context.imageQueue.slice(1);
            if (head.target === 'main') {
              return {
                draftImages: [...context.draftImages, event.resized],
                imageQueue: remaining,
              };
            }
            return {
              editDraftImages: [...context.editDraftImages, event.resized],
              imageQueue: remaining,
            };
          }),
        },
        setDraftToolChoice: {
          actions: assign({
            draftToolChoice: ({ event }) => event.toolChoice,
          }),
        },
        setDraftMode: {
          actions: assign({
            draftMode: ({ event }) => event.mode,
          }),
        },
        clearDraft: {
          actions: assign({
            draftText: '',
            draftImages: [],
            draftToolChoice: 'auto',
            // Purge any pending main-target resizes so a cleared composer
            // doesn't sprout images from in-flight uploads.
            imageQueue: ({ context }) => context.imageQueue.filter((entry) => entry.target !== 'main'),
          }),
        },
        loadDraftFromMessageTransient: {
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
            imageQueue: ({ context, event }) => [
              ...context.imageQueue,
              {
                id: generatePrefixedId(idPrefix.log),
                raw: event.image,
                target: 'edit' as ImageQueueTarget,
              },
            ],
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
            imageQueue: ({ context }) => context.imageQueue.filter((entry) => entry.target !== 'edit'),
          }),
        },
        clearMessageEdit: {
          actions: assign(({ context, event }) => {
            const newEdits = { ...context.messageEdits };
            // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove message edit
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
            // Persist after the resize completes (when draftImages actually changes).
            // `addDraftImage` no longer mutates visible state; it only enqueues.
            imageResized: 'pending',
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
            imageResized: {
              target: 'pending',
              reenter: true,
            },
            removeDraftImage: {
              target: 'pending',
              reenter: true,
            },
            // Immediately bypass debounce and persist
            flushNow: {
              target: 'persisting',
              guard: 'canPersist',
            },
            // Bypass debounce — persist the (now-empty) draft immediately
            clearDraft: {
              target: 'persisting',
              guard: 'canPersist',
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
            imageResized: 'pending',
            removeDraftImage: 'pending',
            // Cancel stale in-flight persist and re-persist with empty draft
            clearDraft: {
              target: 'persisting',
              reenter: true,
            },
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
            // Persist after the resize completes; addEditDraftImage only enqueues.
            imageResized: 'pending',
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
            imageResized: {
              target: 'pending',
              reenter: true,
            },
            removeEditDraftImage: {
              target: 'pending',
              reenter: true,
            },
            // Immediately bypass debounce and persist
            flushNow: {
              target: 'persisting',
              guard: 'canPersist',
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
            imageResized: 'pending',
            removeEditDraftImage: 'pending',
          },
        },
      },
    },
    /**
     * Image-resize FIFO chokepoint.
     *
     * `addDraftImage` / `addEditDraftImage` events enqueue raw URLs into
     * `context.imageQueue`. While a queue entry exists, this region invokes
     * `resizeImageActor` against the queue head. The actor returns an
     * `imageResized` event consumed by the `events` region (which appends the
     * resized URL to the appropriate draft images array and shifts the queue)
     * and by the `inputSaving` / `editSaving` regions (which trigger debounced
     * persistence).
     *
     * Only one image is processed at a time to preserve insertion order under
     * adversarial actor latency. On failure we shift the queue defensively and
     * `emit('imageResizeFailed')` so a single global toast subscriber renders
     * an error — failures never block subsequent images.
     */
    imageProcessing: {
      initial: 'idle',
      states: {
        idle: {
          always: {
            target: 'resizing',
            guard: 'hasQueuedImage',
          },
        },
        resizing: {
          invoke: {
            src: 'resizeImageActor',
            input: ({ context }) => ({
              image: context.imageQueue[0]!.raw,
            }),
            onDone: 'idle',
            onError: {
              target: 'idle',
              actions: [
                emit(({ event }): DraftEmittedEvents => {
                  const error =
                    event.error instanceof Error
                      ? event.error
                      : new Error(typeof event.error === 'string' ? event.error : 'Image resize failed');
                  return { type: 'imageResizeFailed', error };
                }),
                assign({
                  imageQueue: ({ context }) => context.imageQueue.slice(1),
                }),
              ],
            },
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
              const { messageId } = event as {
                type: 'clearMessageEdit';
                messageId: string;
              };

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
