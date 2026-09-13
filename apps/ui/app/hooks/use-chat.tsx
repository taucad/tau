/**
 * Chat Hooks
 *
 * Store-resolved hooks for reading chat state and dispatching chat actions
 * from anywhere in the React tree. The streaming + persistence + draft +
 * RPC layer lives in the vanilla `ChatSessionStore`
 * (`apps/ui/app/services/chat-session-store.ts`); these hooks compose:
 *
 * - `useChatSessionSnapshot` for re-rendering on per-chatId AI SDK updates
 *   (messages / status / error).
 * - `<ChatComposerProvider>` / `<ActiveChatProvider>` for owning the draft
 *   actor and resolving the implicit "current chat".
 *
 * The composer surface (model/kernel/status/stop/contextUsage/draft) is
 * unified at the provider layer — see `useChatComposer()` in
 * `active-chat-provider.tsx`. Hooks below split into two families:
 *
 * - **Draft sugar** ({@link useDraftActions} / {@link useDraftSelector}):
 *   thin wrappers over `useChatComposer().draftActorRef`. Work under either
 *   provider — marketing-route composers consume these for clearDraft /
 *   draft-image dispatch without pulling the rest of the contract.
 * - **Session-required** ({@link useChatContext} / {@link useChatSelector} /
 *   {@link useChatActions} / {@link useChatById} / {@link useChatRetrySnapshot}):
 *   work under `<ActiveChatProvider>` only. The session's existence is a
 *   compile-time guarantee through {@link useActiveChatSession}.
 *
 * Resolution rules (mirrored across `useChatContext` / `useChatSelector` /
 * `useChatActions`):
 *
 * - Omitting `chatId` resolves to the active chat from the nearest
 *   `<ActiveChatProvider>` — always defined. A subtree wired only with
 *   `<ChatComposerProvider>` cannot call these hooks.
 * - Passing `chatId` resolves to that exact chat from the store. The
 *   caller is responsible for keeping the session live (typically by
 *   wrapping the subtree in `<ActiveChatProvider chatId={chatId}>` or
 *   calling `useChatSession(chatId)` directly). When the explicit chat is
 *   not the active session (cross-chat read), action mutators warn-and-no-op
 *   on missing sessions to keep cross-chat dispatch safe.
 */

import type { Chat as AiSdkChat } from '@ai-sdk/react';
import { useSelector } from '@xstate/react';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import type { KernelId } from '@taucad/types/constants';
import type { ActorRefFrom } from 'xstate';
import { useActiveChatSession, useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import type { ChatSession } from '#services/chat-session-store.js';
import type { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import type { draftMachine } from '#hooks/draft.machine.js';
import type { ChatMode } from '#routes/projects_.$id/chat-mode-selector.js';

type ChatInstance = AiSdkChat<MyUIMessage>;

type SendMessageInput = Parameters<ChatInstance['sendMessage']>[0];

const emptyMessages: readonly MyUIMessage[] = Object.freeze([]);
const emptyMessageOrder: readonly string[] = Object.freeze([]);
const emptyMessagesById: ReadonlyMap<string, MyUIMessage> = new Map();

const messagesByIdCache = new WeakMap<readonly MyUIMessage[], Map<string, MyUIMessage>>();

function getMessagesById(messages: readonly MyUIMessage[]): ReadonlyMap<string, MyUIMessage> {
  if (messages === emptyMessages) {
    return emptyMessagesById;
  }
  let cached = messagesByIdCache.get(messages);
  if (!cached) {
    cached = new Map<string, MyUIMessage>();
    for (const message of messages) {
      cached.set(message.id, message);
    }
    messagesByIdCache.set(messages, cached);
  }
  return cached;
}

// ---------------------------------------------------------------------------
// Context surface (session-required)
// ---------------------------------------------------------------------------

export type ChatContextValue = {
  /**
   * The resolved chat id. Post-split this is always `string` — the
   * session-required hooks resolve it from `<ActiveChatProvider>` (or the
   * explicit `chatId` argument).
   */
  activeChatId: string;
  /**
   * The live AI SDK `Chat` instance for the resolved chat. Always defined
   * for the active chat (the provider guarantees the session). May be
   * `undefined` only when the caller passes an explicit `chatId` that is
   * not currently mounted (cross-chat read pattern).
   */
  chat: ChatInstance | undefined;
  /**
   * Persistence machine for the resolved chat. Always defined for the
   * active chat; may be `undefined` for cross-chat reads of non-mounted
   * sessions.
   */
  persistenceActorRef: ActorRefFrom<typeof chatPersistenceMachine> | undefined;
  /**
   * Draft machine for the active chat — always sourced from
   * `<ActiveChatProvider>`. Note: when `chatId` overrides for cross-chat
   * reads, the draft still belongs to the active chat (drafts are
   * per-active-subtree, not per-read-target).
   */
  draftActorRef: ActorRefFrom<typeof draftMachine>;
};

type SessionSnapshotFields = {
  chat: ChatInstance | undefined;
  persistenceActorRef: ActorRefFrom<typeof chatPersistenceMachine> | undefined;
  messages: readonly MyUIMessage[];
  status: ChatInstance['status'];
  error: Error | undefined;
};

const emptySessionSnapshot: SessionSnapshotFields = {
  chat: undefined,
  persistenceActorRef: undefined,
  messages: emptyMessages,
  status: 'ready',
  error: undefined,
};

function selectSessionSnapshot(session: ChatSession | undefined): SessionSnapshotFields {
  if (!session) {
    return emptySessionSnapshot;
  }
  return {
    chat: session.chat,
    persistenceActorRef: session.persistenceActorRef,
    messages: session.chat.messages,
    status: session.chat.status,
    error: session.chat.error,
  };
}

/**
 * Resolve the live session snapshot + draft binding for the active (or
 * explicit) chat. Requires an `<ActiveChatProvider>` upstream — calling this
 * from a subtree wired only with `<ChatComposerProvider>` throws.
 */
export function useChatContext(chatId?: string): ChatContextValue {
  const active = useActiveChatSession();
  const resolvedChatId = chatId ?? active.activeChatId;
  const snapshot = useChatSessionSnapshot(resolvedChatId, selectSessionSnapshot);

  return useMemo<ChatContextValue>(
    () => ({
      activeChatId: resolvedChatId,
      chat: snapshot.chat,
      persistenceActorRef: snapshot.persistenceActorRef,
      draftActorRef: active.draftActorRef,
    }),
    [resolvedChatId, snapshot.chat, snapshot.persistenceActorRef, active.draftActorRef],
  );
}

// ---------------------------------------------------------------------------
// State + selector surface
// ---------------------------------------------------------------------------

export type CombinedChatState = {
  messages: readonly MyUIMessage[];
  messagesById: ReadonlyMap<string, MyUIMessage>;
  messageOrder: readonly string[];
  status: ChatInstance['status'];
  error: Error | undefined;
  /** Persisted error survives reload (from the chat entity in IndexedDB). */
  persistedError: ChatError | undefined;
  isLoading: boolean;
  /**
   * Chat-scoped active model id, mirrored from the persistence machine's
   * `Chat.activeModel`. When undefined the consumer falls back to the
   * cookie default (see `useActiveChatModel`).
   */
  activeModel: string | undefined;
  /**
   * Chat-scoped active CAD kernel, mirrored from the persistence machine's
   * `Chat.activeKernel`. When undefined the consumer falls back to the
   * cookie default (see `useActiveChatKernel`).
   */
  activeKernel: KernelId | undefined;
  draftText: string;
  draftImages: string[];
  draftToolChoice: string | string[];
  draftMode: ChatMode;
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId: string | undefined;
  editDraftText: string;
  editDraftImages: string[];
};

type PersistenceSliceFields = {
  persistedError: ChatError | undefined;
  activeModel: string | undefined;
  activeKernel: KernelId | undefined;
};

const emptyPersistenceSlice: PersistenceSliceFields = {
  persistedError: undefined,
  activeModel: undefined,
  activeKernel: undefined,
};

const persistenceSliceCache = new WeakMap<
  ActorRefFrom<typeof chatPersistenceMachine>,
  { context: unknown; slice: PersistenceSliceFields }
>();

/**
 * Subscribe to a possibly-undefined persistence actor's chat-scoped fields
 * (`persistedError`, `activeModel`, `activeKernel`) without violating the
 * rules of hooks when the actor is not yet present. Slices are cached per
 * actor + context reference so `useSyncExternalStore` returns the same
 * object reference across notifications that did not change the slice.
 */
function usePersistenceSlice(
  persistenceActorRef: ActorRefFrom<typeof chatPersistenceMachine> | undefined,
): PersistenceSliceFields {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!persistenceActorRef) {
        return () => undefined;
      }
      const sub = persistenceActorRef.subscribe(callback);
      return () => {
        sub.unsubscribe();
      };
    },
    [persistenceActorRef],
  );
  const getSnapshot = useCallback((): PersistenceSliceFields => {
    if (!persistenceActorRef) {
      return emptyPersistenceSlice;
    }
    const { context } = persistenceActorRef.getSnapshot();
    const cached = persistenceSliceCache.get(persistenceActorRef);
    if (
      cached &&
      cached.context === context &&
      cached.slice.persistedError === context.persistedError &&
      cached.slice.activeModel === context.activeModel &&
      cached.slice.activeKernel === context.activeKernel
    ) {
      return cached.slice;
    }
    const slice: PersistenceSliceFields = {
      persistedError: context.persistedError,
      activeModel: context.activeModel,
      activeKernel: context.activeKernel,
    };
    persistenceSliceCache.set(persistenceActorRef, { context, slice });
    return slice;
  }, [persistenceActorRef]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Primary hook for reading chat + draft state. Combines the live AI SDK
 * snapshot from the store with the draft state from `<ActiveChatProvider>`.
 * Session-required — composer-only subtrees should call
 * {@link useDraftSelector} instead.
 *
 * Selectors run on every notification — the `messagesById` and
 * `messageOrder` derivations are memoised on the message array reference
 * so equivalent reads are O(1).
 */
export function useChatSelector<T>(selector: (state: CombinedChatState) => T, chatId?: string): T {
  const { chat, persistenceActorRef, draftActorRef } = useChatContext(chatId);
  const draftContext = useSelector(draftActorRef, (state) => state.context);
  const persistenceSlice = usePersistenceSlice(persistenceActorRef);

  const messages = chat?.messages ?? emptyMessages;
  const status = chat?.status ?? 'ready';
  const error = chat?.error;
  const isLoading = status === 'streaming';

  const messagesById = getMessagesById(messages);
  const messageOrder = useMemo<readonly string[]>(
    () => (messages === emptyMessages ? emptyMessageOrder : messages.map((m) => m.id)),
    [messages],
  );

  const combinedState = useMemo<CombinedChatState>(
    () => ({
      messages,
      messagesById,
      messageOrder,
      status,
      error,
      persistedError: persistenceSlice.persistedError,
      isLoading,
      activeModel: persistenceSlice.activeModel,
      activeKernel: persistenceSlice.activeKernel,
      draftText: draftContext.draftText,
      draftImages: draftContext.draftImages,
      draftToolChoice: draftContext.draftToolChoice,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- ChatMode is the agent/plan superset narrowed at the consumer layer
      draftMode: draftContext.draftMode as ChatMode,
      messageEdits: draftContext.messageEdits,
      activeEditMessageId: draftContext.activeEditMessageId,
      editDraftText: draftContext.editDraftText,
      editDraftImages: draftContext.editDraftImages,
    }),
    [messages, messagesById, messageOrder, status, error, persistenceSlice, isLoading, draftContext],
  );

  return selector(combinedState);
}

/**
 * Read state from a non-active chat (e.g. an agents-panel row showing a
 * background chat's status while a different chat is focused). The caller
 * is responsible for ensuring a session for `chatId` is alive (typically
 * by mounting `<ActiveChatProvider chatId={chatId}>` higher up or calling
 * `useChatSession(chatId)` in the same component).
 */
export function useChatById<T>(chatId: string, selector: (state: CombinedChatState) => T): T {
  return useChatSelector(selector, chatId);
}

/**
 * Snapshot of the chatPersistenceMachine's transparent auto-retry counters
 * for the resolved chat. Returns `{ retryAttempt: 0 }` when no session is
 * mounted so consumers can render unconditionally.
 *
 * Components use this (instead of reaching into `persistenceActorRef`
 * directly) to render a "Reconnecting... N/M" indicator while the
 * `requestLifecycle.retrying` substate is active between attempts.
 */
export type ChatRetrySnapshot = {
  retryAttempt: number;
  retryMaxAttempts: number;
};

const emptyRetrySnapshot: ChatRetrySnapshot = { retryAttempt: 0, retryMaxAttempts: 0 };

export function useChatRetrySnapshot(chatId?: string): ChatRetrySnapshot {
  const { persistenceActorRef } = useChatContext(chatId);
  return useSelector(
    persistenceActorRef,
    (state) => {
      if (!state) {
        return emptyRetrySnapshot;
      }
      const { retryAttempt, retryMaxAttempts } = state.context;
      return { retryAttempt, retryMaxAttempts };
    },
    (a, b) => a.retryAttempt === b.retryAttempt && a.retryMaxAttempts === b.retryMaxAttempts,
  );
}

// ---------------------------------------------------------------------------
// Composer-only surface (draft state + draft mutators)
//
// These hooks work under `<ChatComposerProvider>` OR `<ActiveChatProvider>`.
// They never touch the session — marketing composers (CTA section, library
// empty state) and the dual-mode `<ChatTextarea>` rely on them so the
// draft surface is available without a chat session.
// ---------------------------------------------------------------------------

/**
 * Draft-only state shape. Strict subset of {@link CombinedChatState} that
 * doesn't depend on a live `Chat` session.
 */
export type DraftState = {
  draftText: string;
  draftImages: string[];
  draftToolChoice: string | string[];
  draftMode: ChatMode;
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId: string | undefined;
  editDraftText: string;
  editDraftImages: string[];
};

/**
 * Composer-required selector for draft-only state. Works under either
 * provider; safe to call from marketing-route composers.
 */
export function useDraftSelector<T>(selector: (state: DraftState) => T): T {
  const { draftActorRef } = useChatComposer();
  const draftContext = useSelector(draftActorRef, (state) => state.context);

  const draftState = useMemo<DraftState>(
    () => ({
      draftText: draftContext.draftText,
      draftImages: draftContext.draftImages,
      draftToolChoice: draftContext.draftToolChoice,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- ChatMode is the agent/plan superset narrowed at the consumer layer
      draftMode: draftContext.draftMode as ChatMode,
      messageEdits: draftContext.messageEdits,
      activeEditMessageId: draftContext.activeEditMessageId,
      editDraftText: draftContext.editDraftText,
      editDraftImages: draftContext.editDraftImages,
    }),
    [draftContext],
  );

  return selector(draftState);
}

/**
 * Composer-required draft-mutator surface. Splits the draft mutators out of
 * the session-required {@link ChatActions} so marketing-route composers can
 * write to the draft without a session.
 */
export type DraftActions = {
  setDraftText: (text: string) => void;
  /**
   * Add a raw image data URL to the new-message draft. Synchronous: the
   * `draftMachine` enqueues the URL and resizes it through the single
   * `imageProcessing` chokepoint (see `apps/ui/app/hooks/draft.machine.ts`).
   * Pass the original (un-resized) data URL — the machine handles
   * dimension/compression caps via `resizeImageForChat()`. Failures surface
   * as a single global `toast.error` from the provider's
   * `useDraftImageErrorToast` subscriber, so callers MUST NOT wrap this in
   * try/catch or await any resize step.
   */
  addDraftImage: (image: string) => void;
  removeDraftImage: (index: number) => void;
  setDraftToolChoice: (toolChoice: string | string[]) => void;
  setDraftMode: (mode: string) => void;
  clearDraft: () => void;
  startEditingMessage: (messageId: string, originalMessage?: MyUIMessage) => void;
  exitEditMode: () => void;
  setEditDraftText: (text: string) => void;
  /**
   * Add a raw image data URL to the message-edit draft. Same contract as
   * {@link DraftActions.addDraftImage}.
   */
  addEditDraftImage: (image: string) => void;
  removeEditDraftImage: (index: number) => void;
  clearMessageEdit: (messageId: string) => void;
};

export function useDraftActions(): DraftActions {
  const { draftActorRef } = useChatComposer();

  return useMemo<DraftActions>(
    () => ({
      setDraftText(text: string) {
        draftActorRef.send({ type: 'setDraftText', text });
      },
      addDraftImage(image: string) {
        draftActorRef.send({ type: 'addDraftImage', image });
      },
      removeDraftImage(index: number) {
        draftActorRef.send({ type: 'removeDraftImage', index });
      },
      setDraftToolChoice(toolChoice: string | string[]) {
        draftActorRef.send({ type: 'setDraftToolChoice', toolChoice });
      },
      setDraftMode(mode: string) {
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- mode is one of the ChatMode literals at every call site
        draftActorRef.send({ type: 'setDraftMode', mode: mode as 'agent' | 'plan' });
      },
      clearDraft() {
        draftActorRef.send({ type: 'clearDraft' });
      },
      startEditingMessage(messageId: string, originalMessage?: MyUIMessage) {
        draftActorRef.send({ type: 'startEditingMessage', messageId, originalMessage });
      },
      exitEditMode() {
        draftActorRef.send({ type: 'exitEditMode' });
      },
      setEditDraftText(text: string) {
        draftActorRef.send({ type: 'setEditDraftText', text });
      },
      addEditDraftImage(image: string) {
        draftActorRef.send({ type: 'addEditDraftImage', image });
      },
      removeEditDraftImage(index: number) {
        draftActorRef.send({ type: 'removeEditDraftImage', index });
      },
      clearMessageEdit(messageId: string) {
        draftActorRef.send({ type: 'clearMessageEdit', messageId });
      },
    }),
    [draftActorRef],
  );
}

// ---------------------------------------------------------------------------
// Session action surface
// ---------------------------------------------------------------------------

export type ChatActions = DraftActions & {
  sendMessage: (message: SendMessageInput, options?: { body?: Readonly<Record<string, unknown>> }) => void;
  regenerate: (options?: { body?: Readonly<Record<string, unknown>> }) => void;
  /**
   * Resume an interrupted stream WITHOUT re-running the trailing user
   * message or slicing any assistant parts that already landed. Use this
   * for the network-error banner's primary CTA -- `regenerate()` would
   * destroy partial assistant content and is the wrong tool for transient
   * transport failures.
   */
  continueChat: () => void;
  stop: () => void;
  setMessages: (messages: MyUIMessage[]) => void;
  editMessage: (
    messageId: string,
    content: string,
    options?: { imageUrls?: string[]; body?: Readonly<Record<string, unknown>> },
  ) => void;
  retryMessage: (messageId: string, options?: { body?: Readonly<Record<string, unknown>> }) => void;
};

function warnNoCrossChatSession(action: string, chatId: string): void {
  console.warn(`[useChatActions] ${action} ignored: no session mounted for explicit chatId=${chatId}.`);
}

/**
 * Returns the full action surface for the active (or explicit) chat.
 *
 * Session-required — calling without an `<ActiveChatProvider>` in scope
 * throws. The active-chat session is guaranteed by the provider, so
 * lifecycle mutators dispatch unconditionally. When the explicit `chatId`
 * resolves to a chat that is NOT currently mounted (cross-chat dispatch
 * to a stale id), session mutators warn-and-no-op rather than throwing so
 * the active subtree's behaviour stays robust.
 *
 * Composer-only routes should call {@link useDraftActions} instead.
 */
export function useChatActions(chatId?: string): ChatActions {
  const store = useChatSessionStore();
  const active = useActiveChatSession();
  const resolvedChatId = chatId ?? active.activeChatId;
  const isActiveChat = resolvedChatId === active.activeChatId;
  const { draftActorRef } = active;
  const draftActions = useDraftActions();

  return useMemo<ChatActions>(() => {
    const resolveSession = (): ChatSession | undefined => {
      if (isActiveChat) {
        // Active session is guaranteed by `<ActiveChatProvider>` —
        // `store.get` returns the same `ChatSession` the provider acquired.
        return store.get(resolvedChatId);
      }
      return store.get(resolvedChatId);
    };

    const requireSession = (action: string): ChatSession | undefined => {
      const session = resolveSession();
      if (!session) {
        // Active-chat sessions are guaranteed by the provider; this branch
        // only fires for cross-chat dispatch to a non-mounted id.
        warnNoCrossChatSession(action, resolvedChatId);
        return undefined;
      }
      return session;
    };

    return {
      ...draftActions,
      sendMessage(message: SendMessageInput, options) {
        draftActorRef.send({ type: 'clearDraft' });
        const session = requireSession('sendMessage');
        if (!session) {
          return;
        }
        session.persistenceActorRef.send({
          type: 'startRequest',
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- AI SDK sendMessage union narrows to MyUIMessage at all call sites
          request: { kind: 'send', message: message as MyUIMessage, body: options?.body },
        });
      },
      regenerate(options) {
        const session = requireSession('regenerate');
        if (!session) {
          return;
        }
        session.persistenceActorRef.send({
          type: 'startRequest',
          request: { kind: 'regenerate', body: options?.body },
        });
      },
      continueChat() {
        const session = requireSession('continueChat');
        if (!session) {
          return;
        }
        session.persistenceActorRef.send({ type: 'startRequest', request: { kind: 'continue' } });
      },
      stop() {
        const session = requireSession('stop');
        if (!session) {
          return;
        }
        session.persistenceActorRef.send({ type: 'stopRequest' });
      },
      setMessages(messages: MyUIMessage[]) {
        const session = requireSession('setMessages');
        if (!session) {
          return;
        }
        session.chat.messages = messages;
      },

      startEditingMessage(messageId: string, originalMessage?: MyUIMessage) {
        const session = resolveSession();
        const resolved = originalMessage ?? session?.chat.messages.find((m) => m.id === messageId);
        draftActorRef.send({ type: 'startEditingMessage', messageId, originalMessage: resolved });
      },

      editMessage(messageId: string, content: string, options?) {
        draftActorRef.send({ type: 'clearMessageEdit', messageId });
        const session = requireSession('editMessage');
        if (!session) {
          return;
        }
        if (!session.chat.messages.some((m) => m.id === messageId)) {
          return;
        }
        session.persistenceActorRef.send({
          type: 'startRequest',
          request: { kind: 'edit', messageId, content, imageUrls: options?.imageUrls, body: options?.body },
        });
      },

      retryMessage(messageId: string, options?) {
        const session = requireSession('retryMessage');
        if (!session) {
          return;
        }
        if (!session.chat.messages.some((m) => m.id === messageId)) {
          return;
        }
        session.persistenceActorRef.send({
          type: 'startRequest',
          request: { kind: 'retry', messageId, body: options?.body },
        });
      },
    };
  }, [store, resolvedChatId, isActiveChat, draftActorRef, draftActions]);
}
