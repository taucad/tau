/**
 * Chat Persistence Machine
 *
 * XState machine for managing chat persistence with debouncing.
 * Uses event-driven persistence triggered by onFinish callbacks from useChat.
 *
 * Actors are provided via machine.provide() in the consumer (use-chat.tsx)
 * following the pattern from use-project.tsx.
 */

import { setup, assign, emit, raise } from 'xstate';
import type { Chat, MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import type { KernelId } from '@taucad/types/constants';
import { getRetryDelay } from '#utils/backoff.utils.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

// Input types
export type ChatPersistenceMachineInput = {
  activeChatId?: string;
  resourceId?: string;
  /**
   * Override the auto-retry budget for this session. Tests use a small value
   * (e.g. 2) to keep the retry-exhaustion path fast; production keeps the
   * default of 5.
   */
  retryMaxAttempts?: number;
};

/**
 * A chat request kicked off by the UI. Routed through the requestLifecycle
 * sub-machine so every entry point clears persistedError synchronously.
 *
 * - `send`: brand-new user message
 * - `regenerate`: re-roll the last assistant turn with the existing message tail
 * - `edit`: replace a user message and regenerate from there
 * - `retry`: roll back to a prior user message (optionally re-targeting a model) and regenerate
 * - `continue`: resume a stream that was interrupted (network failure, manual
 *   banner click, or transparent auto-retry). Distinct from `regenerate`
 *   because it must NOT slice the assistant tail — partial parts already
 *   visible to the user are preserved end-to-end. The consumer translates
 *   this into AI SDK's private `Chat.makeRequest({ trigger: 'submit-message' })`
 *   so `chat.messages` stays untouched.
 */
/**
 * Per-request body the chat-client composes from `useCadAgentConfig` and
 * forwards through the persistence machine to the chat-session-store
 * `dispatchRequest` listener. The listener merges this object into the
 * `chat.sendMessage` / `chat.regenerate` call so the wire body always carries
 * an `agent` block — never the cookie-bleed-prone per-message metadata path.
 *
 * Optional because the legacy hydration-driven `regenerate` (auto-fired on
 * pending-tail load) still runs before the chat-client mounts; the
 * `regenerateTail` chat-client verb is what eventually replaces that
 * untyped path (see t17).
 *
 * @public
 */
export type ChatRequestBody = Readonly<Record<string, unknown>>;

export type ChatRequest =
  | { kind: 'send'; message: MyUIMessage; body?: ChatRequestBody }
  | { kind: 'regenerate'; body?: ChatRequestBody }
  | {
      kind: 'edit';
      messageId: string;
      content: string;
      imageUrls?: string[];
      body?: ChatRequestBody;
    }
  | { kind: 'retry'; messageId: string; body?: ChatRequestBody }
  | { kind: 'continue'; body?: ChatRequestBody };

/**
 * Why the in-flight chat request ended, forwarded to `finalizeInterruptedToolParts`
 * so persisted tool errors reflect user-stop vs transport vs stream failure.
 */
export type RequestTerminationCause = 'user_stop' | 'preempt' | 'disconnect' | 'error' | 'success';

function deriveFinishedRequestCause(event: {
  isAbort: boolean;
  isError: boolean;
  isDisconnect: boolean;
}): RequestTerminationCause {
  if (event.isError) {
    if (event.isAbort) {
      return 'user_stop';
    }

    if (event.isDisconnect) {
      return 'disconnect';
    }

    return 'error';
  }

  if (event.isAbort) {
    return 'user_stop';
  }

  return 'success';
}

/** Default retry budget. Mirrors Claude Code's transient-error allowance. */
const defaultRetryMaxAttempts = 5;

// Context
export type ChatPersistenceMachineContext = {
  activeChatId?: string;
  resourceId?: string;
  // Loading state
  isLoadingChat: boolean;
  loadError?: Error;
  // Pending messages to persist (set by queuePersist, consumed by debounced persist)
  pendingMessages?: MyUIMessage[];
  /**
   * Snapshot of `activeChatId` captured at `queuePersist` time. The debounced
   * `persistMessagesActor` reads this — never `activeChatId` directly — so a
   * mid-pending `setActiveChatId` swap (focus flipping between chats inside
   * the 100 ms debounce window) cannot mis-target the write at the new chat.
   */
  pendingChatId?: string;
  // Persisted error - survives page reload
  persistedError?: ChatError;
  // Request queued while a previous request is being stopped; consumed on requestFinished
  pendingRequest?: ChatRequest;
  /**
   * Chat-scoped active model id. Hydrated from the loaded `Chat.activeModel`
   * row and updated by `setActiveModel`. Mirrors the chat row so consumers
   * can read the chat-local choice off the persistence machine snapshot
   * without an extra storage read per render.
   */
  activeModel?: string;
  /**
   * Chat-scoped active CAD kernel. Same hydration + propagation semantics
   * as {@link ChatPersistenceMachineContext.activeModel}.
   */
  activeKernel?: KernelId;
  /**
   * Number of consecutive transparent auto-retry attempts the
   * `requestLifecycle.retrying` substate has dispatched for the current
   * stream. Reset to 0 once a turn settles successfully or the user takes
   * a fresh action. `0` means we are not in a retry chain.
   */
  retryAttempt: number;
  /**
   * Hard cap on auto-retry attempts before we hand off to the manual error
   * banner. Reads from machine input; defaults to {@link defaultRetryMaxAttempts}.
   */
  retryMaxAttempts: number;
};

export type ChatRetrievedEvent = { type: 'chatRetrieved'; chat: Chat | undefined };

// Events
type ChatPersistenceMachineEvents =
  | { type: 'setActiveChatId'; chatId: string }
  | { type: 'queuePersist'; messages: MyUIMessage[] }
  | { type: 'handleError'; error: Error }
  | { type: 'setPersistedError'; error: ChatError }
  | { type: 'clearPersistedError' }
  // Flush pending state immediately (bypasses debounce, used on tab close)
  | { type: 'flushNow' }
  // Request lifecycle
  | { type: 'startRequest'; request: ChatRequest }
  | { type: 'stopRequest' }
  | {
      type: 'requestFinished';
      messages: MyUIMessage[];
      isAbort: boolean;
      isError: boolean;
      /**
       * `true` when AI SDK classifies the failure as a transport-level
       * disconnect (`TypeError: Failed to fetch` and friends) rather than a
       * structured 4xx/5xx returned by the API. Used by `requestLifecycle`
       * to gate transparent auto-retry on truly transient breaks.
       */
      isDisconnect: boolean;
    }
  // Active selection (chat-scoped model / kernel)
  | { type: 'setActiveModel'; model: string | undefined }
  | { type: 'setActiveKernel'; kernel: KernelId | undefined }
  /**
   * AI SDK entered `status: 'streaming'` again — bytes are flowing after a
   * transport blip. Resets the transparent retry counter and clears the
   * persisted error layer in the same frame as `chat.error` clears (see
   * `ChatSessionStore` `~registerStatusCallback`).
   */
  | { type: 'streamResumed' }
  | ChatRetrievedEvent;

/**
 * Events emitted by the machine for the React shell (`<ChatInstance>`) to
 * translate into AI SDK side effects via `actor.on(...)` subscriptions.
 *
 * These run synchronously inside the originating transition, so any
 * `assign({ persistedError: undefined })` in the same transition lands
 * before the listener calls `chat.sendMessage`/`regenerate` and the AI
 * SDK clears its own `chat.error` — both error layers reset in a single
 * React frame, eliminating the stale-banner flicker.
 */
type ChatPersistenceMachineEmitted =
  | { type: 'dispatchRequest'; request: ChatRequest }
  | { type: 'dispatchStop' }
  | { type: 'applyFinishedRequest'; messages: MyUIMessage[]; cause: RequestTerminationCause }
  | { type: 'applyStoppedRequest'; messages: MyUIMessage[]; cause: 'user_stop' }
  /**
   * User-initiated stop that landed before any assistant content streamed
   * in. The store listener lifts `userMessage` back into the composer draft
   * (via `draftMachine.loadDraftFromMessage`) and replaces `chat.messages`
   * with `truncatedMessages` so the cancelled turn disappears from the
   * transcript entirely. `chat-history.tsx` also subscribes to refocus the
   * composer in the same frame.
   *
   * The split from `applyStoppedRequest` lets the machine pre-compute the
   * trim and surface a single typed payload — the store does no message
   * shape work, mirroring how `applyResumedRequest` already carries its
   * derived `pendingRequest`.
   */
  | {
      type: 'restoreCancelledDraft';
      userMessage: MyUIMessage;
      truncatedMessages: MyUIMessage[];
      cause: 'user_stop';
    }
  | { type: 'applyResumedRequest'; messages: MyUIMessage[]; pendingRequest: ChatRequest; cause: 'preempt' };

/**
 * Discriminator for the empty-cancel restore path. Returns `true` when no
 * assistant content has streamed in for the current turn — either the
 * trailing message is still the user's prompt (assistant placeholder not
 * yet appended by AI SDK), or the assistant message exists but holds zero
 * parts. Strict zero-parts check keeps the predicate conservative: any
 * surfaced text/tool/reasoning part flips this back to the stay-in-transcript
 * branch so partial output is never silently discarded.
 */
function hasNoAssistantContent(messages: readonly MyUIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last) {
    return true;
  }
  if (last.role === 'user') {
    return true;
  }
  return last.role === 'assistant' && last.parts.length === 0;
}

/**
 * Build the `restoreCancelledDraft` emit payload from the in-flight
 * messages array. The trailing zero-part assistant placeholder (if any)
 * and the trailing user message are sliced off; the user message itself
 * is forwarded so the listener can hand it to `draftMachine.loadDraftFromMessage`.
 *
 * Caller guarantees `hasNoAssistantContent(messages) === true`, so the
 * walk lands on a user message within at most two steps from the tail.
 */
function buildRestoreCancelledDraftEmit(messages: MyUIMessage[]): {
  type: 'restoreCancelledDraft';
  userMessage: MyUIMessage;
  truncatedMessages: MyUIMessage[];
  cause: 'user_stop';
} {
  const last = messages.at(-1);
  const trimmedTail = last?.role === 'assistant' && last.parts.length === 0 ? messages.slice(0, -1) : messages;
  const userMessage = trimmedTail.at(-1)!;
  const truncatedMessages = trimmedTail.slice(0, -1);
  return {
    type: 'restoreCancelledDraft',
    userMessage,
    truncatedMessages,
    cause: 'user_stop',
  };
}

const loadChatActor = fromSafeAsync<ChatRetrievedEvent, { chatId: string }>(async () => {
  throw new Error('loadChatActor not provided');
});

const persistMessagesActor = fromSafeAsync<void, { chatId: string; messages: MyUIMessage[] }>(async () => {
  throw new Error('persistMessagesActor not provided');
});

const persistErrorActor = fromSafeAsync<void, { chatId: string; error: ChatError }>(async () => {
  throw new Error('persistErrorActor not provided');
});

const clearErrorActor = fromSafeAsync<void, { chatId: string }>(async () => {
  throw new Error('clearErrorActor not provided');
});

const persistActiveModelActor = fromSafeAsync<void, { chatId: string; activeModel: string | undefined }>(async () => {
  throw new Error('persistActiveModelActor not provided');
});

const persistActiveKernelActor = fromSafeAsync<void, { chatId: string; activeKernel: KernelId | undefined }>(
  async () => {
    throw new Error('persistActiveKernelActor not provided');
  },
);

export const chatPersistenceMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    context: {} as ChatPersistenceMachineContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    events: {} as ChatPersistenceMachineEvents,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    emitted: {} as ChatPersistenceMachineEmitted,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate types
    input: {} as ChatPersistenceMachineInput,
  },
  actors: {
    loadChatActor,
    persistMessagesActor,
    persistErrorActor,
    clearErrorActor,
    persistActiveModelActor,
    persistActiveKernelActor,
  },
  guards: {
    hasValidChatId({ context, event }) {
      // Check event.chatId for setActiveChatId event, otherwise check context
      const chatId = 'chatId' in event ? event.chatId : context.activeChatId;

      return Boolean(chatId?.startsWith('chat_'));
    },
    hasPendingMessages: ({ context }) =>
      Boolean(context.pendingMessages && context.pendingMessages.length > 0 && context.pendingChatId),
    /**
     * Allow `queuePersist` whenever a chat is selected — even while loading.
     * The actual write is gated separately so a brand-new chat that's still
     * hydrating can buffer the user's first message instead of swallowing it.
     */
    canQueuePersist({ context, event }) {
      const chatId = 'chatId' in event ? event.chatId : context.activeChatId;
      return Boolean(chatId?.startsWith('chat_'));
    },
    canPersist({ context, event }) {
      // Can persist if: not loading AND has valid chatId
      const chatId = 'chatId' in event ? event.chatId : context.activeChatId;

      return !context.isLoadingChat && Boolean(chatId?.startsWith('chat_'));
    },
  },
  delays: {
    persistDebounce: 100,
    /**
     * Computed at scheduling time off the post-`assign` `retryAttempt`
     * counter, so each `retrying` re-entry advances the curve. See
     * {@link getRetryDelay} for the curve specification.
     */
    streamRetryDelay({ context }) {
      return getRetryDelay(context.retryAttempt);
    },
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
      pendingChatId: undefined,
      persistedError: undefined,
      pendingRequest: undefined,
      activeModel: undefined,
      activeKernel: undefined,
      retryAttempt: 0,
      retryMaxAttempts: input.retryMaxAttempts ?? defaultRetryMaxAttempts,
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
            chatRetrieved: {
              actions: assign({
                persistedError: ({ event }) => event.chat?.error,
                activeModel: ({ event }) => event.chat?.activeModel,
                activeKernel: ({ event }) => event.chat?.activeKernel,
              }),
            },
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
              guard: 'canQueuePersist',
              actions: assign({
                pendingMessages: ({ event }) => event.messages,
                pendingChatId: ({ context }) => context.activeChatId,
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
                pendingChatId: ({ context }) => context.activeChatId,
              }),
            },
            // Immediately bypass debounce and persist
            flushNow: {
              target: 'persisting',
              guard: 'hasPendingMessages',
            },
          },
        },
        persisting: {
          invoke: {
            src: 'persistMessagesActor',
            // Read the chatId snapshot, NOT context.activeChatId — the user
            // may have flipped focus to a different chat inside the debounce
            // window and we must still write to the chat the messages were
            // queued for.
            input: ({ context }) => ({
              chatId: context.pendingChatId!,
              messages: context.pendingMessages!,
            }),
            onDone: {
              target: 'idle',
              actions: assign({
                pendingMessages: undefined,
                pendingChatId: undefined,
              }),
            },
            onError: {
              target: 'idle',
              actions: assign({
                pendingMessages: undefined,
                pendingChatId: undefined,
              }),
            },
          },
          on: {
            // Queue new messages while persisting
            queuePersist: {
              actions: assign({
                pendingMessages: ({ event }) => event.messages,
                pendingChatId: ({ context }) => context.activeChatId,
              }),
            },
          },
        },
      },
    },
    // Chat request lifecycle - centralizes send/regenerate/edit/retry/stop so
    // every "request starts" path clears persistedError synchronously, eliminating
    // the stale error banner flicker. Side effects flow out via emits to the
    // ChatInstance listeners (which drive the AI SDK calls).
    requestLifecycle: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            startRequest: {
              target: 'invoking',
              actions: [
                assign({ persistedError: undefined }),
                emit(({ event }) => ({ type: 'dispatchRequest', request: event.request })),
              ],
            },
          },
        },
        invoking: {
          on: {
            // A new request while one is in flight: queue it, stop the in-flight one,
            // and resume the queued one in `requestFinished`.
            startRequest: {
              target: 'stopping',
              actions: [
                assign({
                  persistedError: undefined,
                  pendingRequest: ({ event }) => event.request,
                  // User initiated a fresh action -- abandon any in-flight retry chain.
                  retryAttempt: 0,
                }),
                emit({ type: 'dispatchStop' }),
              ],
            },
            stopRequest: {
              target: 'stopping',
              actions: emit({ type: 'dispatchStop' }),
            },
            streamResumed: {
              actions: [assign({ retryAttempt: 0, persistedError: undefined }), raise({ type: 'clearPersistedError' })],
            },
            // Three-way guarded transition:
            //   1. Transient transport disconnect with budget remaining --> retrying
            //   2. Any other failure --> idle, leave persistedError so the banner stays up
            //   3. Success/abort --> idle, clear persistedError, reset retry counter
            requestFinished: [
              {
                guard: ({ context, event }) =>
                  event.isError && event.isDisconnect && context.retryAttempt < context.retryMaxAttempts,
                target: 'retrying',
              },
              {
                guard: ({ event }) => event.isError,
                target: 'idle',
                actions: [
                  // Mid-stream errors keep persistedError (set by onError) visible.
                  assign({ retryAttempt: 0 }),
                  emit(({ event }) => ({
                    type: 'applyFinishedRequest',
                    messages: event.messages,
                    cause: deriveFinishedRequestCause(event),
                  })),
                ],
              },
              {
                target: 'idle',
                actions: [
                  // Success/abort clears persistedError and the retry counter.
                  assign({ persistedError: undefined, retryAttempt: 0 }),
                  emit(({ event }) => ({
                    type: 'applyFinishedRequest',
                    messages: event.messages,
                    cause: deriveFinishedRequestCause(event),
                  })),
                ],
              },
            ],
          },
        },
        // Transparent auto-retry on transport-level disconnects.
        // Persisted error stays set so consumers can render a "Reconnecting..."
        // indicator instead of the destructive failure banner. After
        // `streamRetryDelay` (exponential backoff with jitter) we re-dispatch
        // the in-flight stream as a `continue` request so partial assistant
        // parts stay in `chat.messages`.
        retrying: {
          entry: assign({ retryAttempt: ({ context }) => context.retryAttempt + 1 }),
          after: {
            streamRetryDelay: {
              target: 'invoking',
              actions: emit({ type: 'dispatchRequest', request: { kind: 'continue' } }),
            },
          },
          on: {
            // User submitted a fresh action mid-backoff -- exit `retrying`
            // (XState auto-cancels the `after` timer) and dispatch the new
            // request through the same path as `idle.startRequest`.
            startRequest: {
              target: 'invoking',
              actions: [
                assign({ persistedError: undefined, retryAttempt: 0 }),
                emit(({ event }) => ({ type: 'dispatchRequest', request: event.request })),
              ],
            },
            // User explicitly bailed during backoff -- drop the chain.
            // The `after` timer is auto-cancelled on state exit.
            stopRequest: {
              target: 'idle',
              actions: assign({ retryAttempt: 0 }),
            },
            // Late `streaming` status callbacks during the backoff window — ignore.
            streamResumed: {},
          },
        },
        stopping: {
          on: {
            // Allow the queued request to be replaced by a newer tap before the
            // stop completes. The newest pendingRequest wins.
            startRequest: {
              actions: assign({
                persistedError: undefined,
                pendingRequest: ({ event }) => event.request,
              }),
            },
            requestFinished: [
              {
                guard: ({ context }) => context.pendingRequest !== undefined,
                target: 'invoking',
                actions: [
                  emit(({ context, event }) => ({
                    type: 'applyResumedRequest',
                    messages: event.messages,
                    pendingRequest: context.pendingRequest!,
                    cause: 'preempt',
                  })),
                  emit(({ context }) => ({
                    type: 'dispatchRequest',
                    request: context.pendingRequest!,
                  })),
                  assign({ pendingRequest: undefined }),
                ],
              },
              // Empty-cancel: the user stopped before any assistant content
              // streamed in. Emit the restore variant so the store listener
              // lifts the user message back into the composer draft and
              // truncates `chat.messages` — see `restoreCancelledDraft`.
              {
                guard: ({ event }) => hasNoAssistantContent(event.messages),
                target: 'idle',
                actions: emit(({ event }) => buildRestoreCancelledDraftEmit(event.messages)),
              },
              {
                target: 'idle',
                actions: emit(({ event }) => ({
                  type: 'applyStoppedRequest',
                  messages: event.messages,
                  cause: 'user_stop',
                })),
              },
            ],
          },
        },
      },
    },
    // Active model persistence — chat-scoped active model.
    // Mirrors errorPersistence: idle → persisting → idle, where the second
    // `setActiveModel` while persisting re-enters so the latest value wins.
    activeModelPersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveModel: {
              target: 'persisting',
              guard: 'hasValidChatId',
              actions: assign({
                activeModel: ({ event }) => event.model,
              }),
            },
          },
        },
        persisting: {
          invoke: {
            src: 'persistActiveModelActor',
            input: ({ context }) => ({
              chatId: context.activeChatId!,
              activeModel: context.activeModel,
            }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            setActiveModel: {
              target: 'persisting',
              reenter: true,
              guard: 'hasValidChatId',
              actions: assign({
                activeModel: ({ event }) => event.model,
              }),
            },
          },
        },
      },
    },
    // Active kernel persistence — chat-scoped active CAD kernel. Same shape
    // as activeModelPersistence.
    activeKernelPersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveKernel: {
              target: 'persisting',
              guard: 'hasValidChatId',
              actions: assign({
                activeKernel: ({ event }) => event.kernel,
              }),
            },
          },
        },
        persisting: {
          invoke: {
            src: 'persistActiveKernelActor',
            input: ({ context }) => ({
              chatId: context.activeChatId!,
              activeKernel: context.activeKernel,
            }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            setActiveKernel: {
              target: 'persisting',
              reenter: true,
              guard: 'hasValidChatId',
              actions: assign({
                activeKernel: ({ event }) => event.kernel,
              }),
            },
          },
        },
      },
    },
    // Error persistence - persists errors to storage for display after page reload
    errorPersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setPersistedError: {
              target: 'persisting',
              guard: 'canPersist',
              actions: assign({
                persistedError: ({ event }) => event.error,
              }),
            },
            clearPersistedError: {
              target: 'clearing',
              guard: 'canPersist',
              actions: assign({
                persistedError: undefined,
              }),
            },
          },
        },
        persisting: {
          invoke: {
            src: 'persistErrorActor',
            input: ({ context }) => ({
              chatId: context.activeChatId!,
              error: context.persistedError!,
            }),
            onDone: {
              target: 'idle',
            },
            onError: {
              target: 'idle',
            },
          },
          on: {
            // If a new error comes in while persisting, update context and restart
            setPersistedError: {
              target: 'persisting',
              reenter: true,
              actions: assign({
                persistedError: ({ event }) => event.error,
              }),
            },
            // If clearing is requested while persisting, switch to clearing
            clearPersistedError: {
              target: 'clearing',
              actions: assign({
                persistedError: undefined,
              }),
            },
          },
        },
        clearing: {
          invoke: {
            src: 'clearErrorActor',
            input: ({ context }) => ({
              chatId: context.activeChatId!,
            }),
            onDone: {
              target: 'idle',
              actions: assign({
                persistedError: undefined,
              }),
            },
            onError: {
              target: 'idle',
              actions: assign({
                persistedError: undefined,
              }),
            },
          },
          on: {
            // If a new error comes in while clearing, switch to persisting
            setPersistedError: {
              target: 'persisting',
              actions: assign({
                persistedError: ({ event }) => event.error,
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
