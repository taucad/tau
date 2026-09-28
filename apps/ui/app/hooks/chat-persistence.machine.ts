/**
 * Chat Persistence Machine
 *
 * XState machine for managing chat persistence with debouncing.
 * Uses event-driven persistence triggered by onFinish callbacks from useChat.
 *
 * Actors are provided via machine.provide() in the consumer (use-chat.tsx)
 * following the pattern from use-project.tsx.
 */

import { createAsyncLogic, setup, types } from 'xstate';
import type { CadAgentExecution, Chat, MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import type { KernelId } from '@taucad/types/constants';
import { eventSchemas } from '#lib/xstate.lib.js';
import type { ChatRequest } from '#machines/chat-session.machine.js';

// Input types
export type ChatPersistenceMachineInput = {
  activeChatId?: string;
  resourceId?: string;
};

/**
 * A chat request kicked off by the UI. Routed through the requestLifecycle
 * sub-machine so every entry point clears persistedError synchronously.
 *
 * - `send`: brand-new user message
 * - `regenerate`: re-roll the last assistant turn with the existing message tail
 * - `edit`: replace a user message and regenerate from there
 * - `retry`: roll back to a prior user message (optionally re-targeting a model) and regenerate
 * - `continue`: explicitly resume a stream that was interrupted. Distinct from `regenerate`
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
  /** The in-flight request is being ended to make room for a queued turn. */
  preempting: boolean;
  /** An effect or child failure no transition modelled; the machine keeps answering (MC-R12). */
  fault?: string;
};

/** What loading a chat answers: its row, or `undefined` when it has none yet. */
export type ChatLoadOutput = Readonly<{ chat: Chat | undefined }>;

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
       * structured 4xx/5xx returned by the API. The ended tool parts retain this cause.
       */
      isDisconnect: boolean;
    }
  // Active selection (chat-scoped execution / kernel)
  | { type: 'setActiveExecution'; execution: CadAgentExecution | undefined }
  | { type: 'setActiveKernel'; kernel: KernelId | undefined }
  /**
   * AI SDK entered `status: 'streaming'` again — bytes are flowing after a
   * transport blip. Clears the persisted error layer in the same frame as `chat.error` clears (see
   * `ChatSessionStore` `~registerStatusCallback`).
   */
  | { type: 'streamResumed' };

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

const loadChatActor = createAsyncLogic<ChatLoadOutput, { chatId: string }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the loadChatActor actor was not provided.');
  },
});

const persistMessagesActor = createAsyncLogic<void, { chatId: string; messages: MyUIMessage[] }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the persistMessagesActor actor was not provided.');
  },
});

const persistErrorActor = createAsyncLogic<void, { chatId: string; error: ChatError }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the persistErrorActor actor was not provided.');
  },
});

const clearErrorActor = createAsyncLogic<void, { chatId: string }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the clearErrorActor actor was not provided.');
  },
});

const persistActiveExecutionActor = createAsyncLogic<
  void,
  { chatId: string; activeExecution: CadAgentExecution | undefined }
>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the persistActiveExecutionActor actor was not provided.');
  },
});

const persistActiveKernelActor = createAsyncLogic<void, { chatId: string; activeKernel: KernelId | undefined }>({
  run: async () => {
    throw new Error('chatPersistenceMachine: the persistActiveKernelActor actor was not provided.');
  },
});

/* The persistence error log, a named effect (MC-R8). */
const logPersistenceError = (error: unknown): void => {
  console.error('Chat persistence error:', error);
};

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
  delays: { persistDebounce: 100 },
}).createMachine({
  id: 'chatPersistence',
  version: '1',
  /* A fault no transition modelled is recorded and the machine keeps answering (MC-R12). */
  onError: ({ event }) => ({
    context: { fault: event.error instanceof Error ? event.error.message : 'chat persistence fault' },
  }),
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
            onDone: {
              target: 'idle',
              context: ({ event }) => ({
                isLoadingChat: false,
                persistedError: event.output.chat?.error,
                activeExecution: event.output.chat?.activeExecution,
                activeKernel: event.output.chat?.activeKernel,
              }),
            },
            onError: {
              target: 'idle',
              context: ({ event }) => ({ isLoadingChat: false, loadError: event.error as Error }),
            },
          },
          on: {
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
            /* A queue with nothing in it has nothing to write: back to idle, never an unanswered timer (MC-R16). */
            persistDebounce: ({ context }) =>
              hasPendingMessages(context) ? { target: 'persisting' } : { target: 'idle' },
          },
          on: {
            // Reset timer if new messages come in
            queuePersist: { target: 'pending', reenter: true, ...queuePending },
            // Immediately bypass debounce and persist
            flushNow: ({ context }) => (hasPendingMessages(context) ? { target: 'persisting' } : { target: 'idle' }),
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
            /* A reattached run streams without a request of its own, so this
             * state is where the person's Stop lands for it. Dropping it left
             * the host run going (W0.3); with nothing streaming it stops nothing. */
            stopRequest: (_, enq) => {
              enq.emit({ type: 'dispatchStop' });
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
                },
              };
            },
            stopRequest: (_, enq) => {
              enq.emit({ type: 'dispatchStop' });
              return { target: 'stopping' };
            },
            preemptRequest: (_, enq) => {
              enq.emit({ type: 'dispatchStop' });
              return { target: 'stopping', context: { preempting: true } };
            },
            streamResumed: (_, enq) => {
              enq.raise({ type: 'clearPersistedError' });
              return { context: { persistedError: undefined } };
            },
            // A dropped stream ends this request. Attachment backoff follows
            // the host log; the SDK never changes this gesture into Continue.
            requestFinished: ({ event }, enq) => {
              enq.emit({
                type: 'applyFinishedRequest',
                messages: event.messages,
                cause: deriveFinishedRequestCause(event),
              });
              return event.isError
                ? // Mid-stream errors keep persistedError (set by onError) visible.
                  { target: 'idle' }
                : { target: 'idle', context: { persistedError: undefined } };
            },
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
    turnRequested: { context: { persistedError: undefined } },
    handleError: ({ event }, enq) => {
      enq(logPersistenceError, event.error);
      return {};
    },
  },
});

/**
 * The (state, event) pairs `chatPersistenceMachine` leaves unanswered on purpose (MC-R17).
 *
 * @public
 */
export const chatPersistenceIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  /* A chat with no valid id, or one still loading, has nothing to persist yet (`hasValidChatId`, `canPersist`). */
  ['messagePersistence.idle', 'queuePersist'],
  ['errorPersistence.idle', 'setPersistedError'],
  ['errorPersistence.idle', 'clearPersistedError'],
  ['activeExecutionPersistence.idle', 'setActiveExecution'],
  ['activeExecutionPersistence.persisting', 'setActiveExecution'],
  ['activeKernelPersistence.idle', 'setActiveKernel'],
  ['activeKernelPersistence.persisting', 'setActiveKernel'],
  /* Nothing is waiting out the debounce: there is nothing to flush. */
  ['messagePersistence.idle', 'flushNow'],
  ['messagePersistence.persisting', 'flushNow'],
  /* No request is in flight to pre-empt, finish or resume, or it is already stopping. */
  ['requestLifecycle.idle', 'preemptRequest'],
  ['requestLifecycle.stopping', 'preemptRequest'],
  ['requestLifecycle.idle', 'requestFinished'],
  ['requestLifecycle.idle', 'streamResumed'],
  ['requestLifecycle.stopping', 'streamResumed'],
  ['requestLifecycle.stopping', 'stopRequest'],
];

export type ChatPersistenceMachineState = ReturnType<typeof chatPersistenceMachine.getInitialSnapshot>;
export type ChatPersistenceMachineActor = typeof chatPersistenceMachine;
