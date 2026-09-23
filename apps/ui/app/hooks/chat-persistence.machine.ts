/**
 * Chat Persistence Machine
 *
 * XState machine for managing chat persistence with debouncing.
 * Uses event-driven persistence triggered by onFinish callbacks from useChat.
 *
 * Actors are provided via machine.provide() in the consumer (use-chat.tsx)
 * following the pattern from use-project.tsx.
 */

import { setup, types } from 'xstate';
import type { CadAgentExecution, Chat, MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import type { KernelId } from '@taucad/types/constants';
import { getRetryDelay } from '#utils/backoff.utils.js';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import type { ChatRequest } from '#machines/chat-session.machine.js';

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
   * Chat-scoped execution target. Selections contain opaque host and agent
   * ids only; credentials never enter durable chat state.
   */
  activeExecution?: CadAgentExecution;
  /**
   * Chat-scoped active CAD kernel. Same hydration + propagation semantics
   * as {@link ChatPersistenceMachineContext.activeExecution}.
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
  /** The in-flight request is being ended to make room for a queued turn. */
  preempting: boolean;
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
  /**
   * The person asked the chat's session actor for a turn.
   *
   * The dispatch that follows is one admission away — a lease, a model resolve
   * and a credit pre-flight — so the banner can no longer be cleared by
   * `startRequest` arriving in the same frame as the gesture. This says the
   * gesture was accepted, which is what the no-flicker contract is about.
   */
  | { type: 'turnRequested' }
  /**
   * End the in-flight request because another turn is queued behind it.
   *
   * Distinct from `stopRequest`, which is the person stopping: a pre-empted
   * turn keeps its transcript, where a stopped one hands its trailing prompt
   * back to the composer. The queued turn itself is the chat session actor's,
   * and it dispatches once the pre-empted one has settled.
   */
  | { type: 'preemptRequest' }
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
  // Active selection (chat-scoped execution / kernel)
  | { type: 'setActiveExecution'; execution: CadAgentExecution | undefined }
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
   * (via `draftMachine.loadDraftFromMessageTransient`) and replaces `chat.messages`
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
 * is forwarded so the listener can hand it to `draftMachine.loadDraftFromMessageTransient`.
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

const persistActiveExecutionActor = fromSafeAsync<
  void,
  { chatId: string; activeExecution: CadAgentExecution | undefined }
>(async () => {
  throw new Error('persistActiveExecutionActor not provided');
});

const persistActiveKernelActor = fromSafeAsync<void, { chatId: string; activeKernel: KernelId | undefined }>(
  async () => {
    throw new Error('persistActiveKernelActor not provided');
  },
);

/** The chat an event names, or the active chat when it names none. */
const chatIdOf = (context: ChatPersistenceMachineContext, event: ChatPersistenceMachineEvents): string | undefined =>
  'chatId' in event ? event.chatId : context.activeChatId;

const hasValidChatId = (context: ChatPersistenceMachineContext, event: ChatPersistenceMachineEvents): boolean =>
  Boolean(chatIdOf(context, event)?.startsWith('chat_'));

const hasPendingMessages = (context: ChatPersistenceMachineContext): boolean =>
  Boolean(context.pendingMessages && context.pendingMessages.length > 0 && context.pendingChatId);

/* Can persist if: not loading AND has valid chatId. Queueing is allowed while
 * loading (`hasValidChatId` alone), so a brand-new chat that's still hydrating
 * can buffer the user's first message instead of swallowing it. */
const canPersist = (context: ChatPersistenceMachineContext, event: ChatPersistenceMachineEvents): boolean =>
  !context.isLoadingChat && hasValidChatId(context, event);

const queuePending = {
  context: ({
    context,
    event,
  }: Readonly<{
    context: ChatPersistenceMachineContext;
    event: Extract<ChatPersistenceMachineEvents, { type: 'queuePersist' }>;
  }>) => ({ pendingMessages: event.messages, pendingChatId: context.activeChatId }),
};

const clearPending = { target: 'idle', context: { pendingMessages: undefined, pendingChatId: undefined } } as const;

export const chatPersistenceMachine = setup({
  schemas: {
    context: types<ChatPersistenceMachineContext>(),
    events: eventSchemas<ChatPersistenceMachineEvents>(),
    emitted: eventSchemas<ChatPersistenceMachineEmitted>(),
    input: types<ChatPersistenceMachineInput>(),
  },
  actors: {
    loadChatActor,
    persistMessagesActor,
    persistErrorActor,
    clearErrorActor,
    persistActiveExecutionActor,
    persistActiveKernelActor,
  },
  delays: {
    persistDebounce: 100,
    /**
     * Computed at scheduling time off the post-entry `retryAttempt`
     * counter, so each `retrying` re-entry advances the curve. See
     * {@link getRetryDelay} for the curve specification.
     */
    streamRetryDelay: ({ context }) => getRetryDelay(context.retryAttempt),
  },
}).createMachine({
  id: 'chatPersistence',
  context: ({ input }) => ({
    activeChatId: input.activeChatId,
    resourceId: input.resourceId,
    isLoadingChat: false,
    loadError: undefined,
    pendingMessages: undefined,
    pendingChatId: undefined,
    persistedError: undefined,
    pendingRequest: undefined,
    activeExecution: undefined,
    activeKernel: undefined,
    retryAttempt: 0,
    retryMaxAttempts: input.retryMaxAttempts ?? defaultRetryMaxAttempts,
    preempting: false,
  }),
  type: 'parallel',
  states: {
    // Chat loading state
    chatLoading: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveChatId: ({ context, event }) =>
              hasValidChatId(context, event)
                ? {
                    target: 'loading',
                    context: { activeChatId: event.chatId, isLoadingChat: true, loadError: undefined },
                  }
                : undefined,
          },
        },
        loading: {
          invoke: {
            src: 'loadChatActor',
            input: ({ context }) => ({ chatId: context.activeChatId! }),
            onDone: { target: 'idle', context: { isLoadingChat: false } },
            onError: {
              target: 'idle',
              context: ({ event }) => ({ isLoadingChat: false, loadError: event.error as Error }),
            },
          },
          on: {
            chatRetrieved: {
              context: ({ event }) => ({
                persistedError: event.chat?.error,
                activeExecution: event.chat?.activeExecution,
                activeKernel: event.chat?.activeKernel,
              }),
            },
            setActiveChatId: {
              target: 'loading',
              reenter: true,
              context: ({ event }) => ({ activeChatId: event.chatId, loadError: undefined }),
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
            queuePersist: ({ context, event }) =>
              hasValidChatId(context, event)
                ? {
                    target: 'pending',
                    context: { pendingMessages: event.messages, pendingChatId: context.activeChatId },
                  }
                : undefined,
          },
        },
        pending: {
          after: {
            persistDebounce: ({ context }) => (hasPendingMessages(context) ? { target: 'persisting' } : undefined),
          },
          on: {
            // Reset timer if new messages come in
            queuePersist: { target: 'pending', reenter: true, ...queuePending },
            // Immediately bypass debounce and persist
            flushNow: ({ context }) => (hasPendingMessages(context) ? { target: 'persisting' } : undefined),
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
            onDone: clearPending,
            onError: clearPending,
          },
          on: {
            // Queue new messages while persisting
            queuePersist: queuePending,
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
            startRequest: ({ event }, enq) => {
              enq.emit({ type: 'dispatchRequest', request: event.request });
              return { target: 'invoking', context: { persistedError: undefined } };
            },
          },
        },
        invoking: {
          on: {
            // A new request while one is in flight: queue it, stop the in-flight one,
            // and resume the queued one in `requestFinished`.
            startRequest: ({ event }, enq) => {
              enq.emit({ type: 'dispatchStop' });
              return {
                target: 'stopping',
                context: {
                  persistedError: undefined,
                  pendingRequest: event.request,
                  // User initiated a fresh action -- abandon any in-flight retry chain.
                  retryAttempt: 0,
                },
              };
            },
            stopRequest: (_, enq) => {
              enq.emit({ type: 'dispatchStop' });
              return { target: 'stopping' };
            },
            preemptRequest: (_, enq) => {
              enq.emit({ type: 'dispatchStop' });
              return { target: 'stopping', context: { preempting: true, retryAttempt: 0 } };
            },
            streamResumed: (_, enq) => {
              enq.raise({ type: 'clearPersistedError' });
              return { context: { retryAttempt: 0, persistedError: undefined } };
            },
            // Three-way transition:
            //   1. Transient transport disconnect with budget remaining --> retrying
            //   2. Any other failure --> idle, leave persistedError so the banner stays up
            //   3. Success/abort --> idle, clear persistedError, reset retry counter
            requestFinished: ({ context, event }, enq) => {
              if (event.isError && event.isDisconnect && context.retryAttempt < context.retryMaxAttempts) {
                return { target: 'retrying' };
              }
              enq.emit({
                type: 'applyFinishedRequest',
                messages: event.messages,
                cause: deriveFinishedRequestCause(event),
              });
              return event.isError
                ? // Mid-stream errors keep persistedError (set by onError) visible.
                  { target: 'idle', context: { retryAttempt: 0 } }
                : // Success/abort clears persistedError and the retry counter.
                  { target: 'idle', context: { persistedError: undefined, retryAttempt: 0 } };
            },
          },
        },
        // Transparent auto-retry on transport-level disconnects.
        // Persisted error stays set so consumers can render a "Reconnecting..."
        // indicator instead of the destructive failure banner. After
        // `streamRetryDelay` (exponential backoff with jitter) we re-dispatch
        // the in-flight stream as a `continue` request so partial assistant
        // parts stay in `chat.messages`.
        retrying: {
          entry: ({ context }) => ({ context: { retryAttempt: context.retryAttempt + 1 } }),
          after: {
            streamRetryDelay: (_, enq) => {
              enq.emit({ type: 'dispatchRequest', request: { kind: 'continue' } });
              return { target: 'invoking' };
            },
          },
          on: {
            // User submitted a fresh action mid-backoff -- exit `retrying`
            // (XState auto-cancels the `after` timer) and dispatch the new
            // request through the same path as `idle.startRequest`.
            startRequest: ({ event }, enq) => {
              enq.emit({ type: 'dispatchRequest', request: event.request });
              return { target: 'invoking', context: { persistedError: undefined, retryAttempt: 0 } };
            },
            // User explicitly bailed during backoff -- drop the chain.
            // The `after` timer is auto-cancelled on state exit.
            stopRequest: { target: 'idle', context: { retryAttempt: 0 } },
            // Late `streaming` status callbacks during the backoff window — ignore.
            streamResumed: {},
          },
        },
        stopping: {
          on: {
            // Allow the queued request to be replaced by a newer tap before the
            // stop completes. The newest pendingRequest wins.
            startRequest: {
              context: ({ event }) => ({ persistedError: undefined, pendingRequest: event.request, preempting: false }),
            },
            requestFinished: ({ context, event }, enq) => {
              /* Pre-empted, not stopped: the transcript stays exactly as it
               * is and the queued turn dispatches from its own owner. */
              if (context.preempting) {
                enq.emit({ type: 'applyFinishedRequest', messages: event.messages, cause: 'preempt' });
                return { target: 'idle', context: { preempting: false } };
              }
              if (context.pendingRequest !== undefined) {
                enq.emit({
                  type: 'applyResumedRequest',
                  messages: event.messages,
                  pendingRequest: context.pendingRequest,
                  cause: 'preempt',
                });
                enq.emit({ type: 'dispatchRequest', request: context.pendingRequest });
                return { target: 'invoking', context: { pendingRequest: undefined } };
              }
              // Empty-cancel: the user stopped before any assistant content
              // streamed in. Emit the restore variant so the store listener
              // lifts the user message back into the composer draft and
              // truncates `chat.messages` — see `restoreCancelledDraft`.
              if (hasNoAssistantContent(event.messages)) {
                enq.emit(buildRestoreCancelledDraftEmit(event.messages));
                return { target: 'idle' };
              }
              enq.emit({ type: 'applyStoppedRequest', messages: event.messages, cause: 'user_stop' });
              return { target: 'idle' };
            },
          },
        },
      },
    },
    // Active execution persistence — chat-scoped execution target.
    // Mirrors errorPersistence: idle → persisting → idle, where the second
    // `setActiveExecution` while persisting re-enters so the latest value wins.
    activeExecutionPersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveExecution: ({ context, event }) =>
              hasValidChatId(context, event)
                ? { target: 'persisting', context: { activeExecution: event.execution } }
                : undefined,
          },
        },
        persisting: {
          invoke: {
            src: 'persistActiveExecutionActor',
            input: ({ context }) => ({
              chatId: context.activeChatId!,
              activeExecution: context.activeExecution,
            }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            setActiveExecution: ({ context, event }) =>
              hasValidChatId(context, event)
                ? { target: 'persisting', reenter: true, context: { activeExecution: event.execution } }
                : undefined,
          },
        },
      },
    },
    // Active kernel persistence — chat-scoped active CAD kernel. Same shape
    // as activeExecutionPersistence.
    activeKernelPersistence: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            setActiveKernel: ({ context, event }) =>
              hasValidChatId(context, event)
                ? { target: 'persisting', context: { activeKernel: event.kernel } }
                : undefined,
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
            setActiveKernel: ({ context, event }) =>
              hasValidChatId(context, event)
                ? { target: 'persisting', reenter: true, context: { activeKernel: event.kernel } }
                : undefined,
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
            setPersistedError: ({ context, event }) =>
              canPersist(context, event)
                ? { target: 'persisting', context: { persistedError: event.error } }
                : undefined,
            clearPersistedError: ({ context, event }) =>
              canPersist(context, event) ? { target: 'clearing', context: { persistedError: undefined } } : undefined,
          },
        },
        persisting: {
          invoke: {
            src: 'persistErrorActor',
            input: ({ context }) => ({
              chatId: context.activeChatId!,
              error: context.persistedError!,
            }),
            onDone: { target: 'idle' },
            onError: { target: 'idle' },
          },
          on: {
            // If a new error comes in while persisting, update context and restart
            setPersistedError: {
              target: 'persisting',
              reenter: true,
              context: ({ event }) => ({ persistedError: event.error }),
            },
            // If clearing is requested while persisting, switch to clearing
            clearPersistedError: { target: 'clearing', context: { persistedError: undefined } },
          },
        },
        clearing: {
          invoke: {
            src: 'clearErrorActor',
            input: ({ context }) => ({ chatId: context.activeChatId! }),
            onDone: { target: 'idle', context: { persistedError: undefined } },
            onError: { target: 'idle', context: { persistedError: undefined } },
          },
          on: {
            // If a new error comes in while clearing, switch to persisting
            setPersistedError: { target: 'persisting', context: ({ event }) => ({ persistedError: event.error }) },
          },
        },
      },
    },
  },
  on: {
    turnRequested: { context: { persistedError: undefined, retryAttempt: 0 } },
    handleError: ({ event }, enq) => {
      enq(() => {
        console.error('Chat persistence error:', event.error);
      });
      return {};
    },
  },
});

export type ChatPersistenceMachineState = ReturnType<typeof chatPersistenceMachine.getInitialSnapshot>;
export type ChatPersistenceMachineActor = typeof chatPersistenceMachine;
