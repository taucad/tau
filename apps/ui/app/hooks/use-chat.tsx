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
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import type { ChatError } from '@taucad/types';
import type { KernelId } from '@taucad/types/constants';
import type { ActorRefFrom } from 'xstate';
import { useActiveChatSession, useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import type { ChatSession } from '#services/chat-session-store.js';
import type { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import type {
  DraftAttachment,
  DraftAttachmentModel,
  DraftAttachmentSource,
  draftMachine,
} from '#hooks/draft.machine.js';
import type { AttachmentReference } from '#utils/attachment.utils.js';
import type { ChatMode } from '#routes/w.$workspace.$project/chat-mode-selector.js';

type ChatInstance = AiSdkChat<MyUIMessage>;

type SendMessageInput = Parameters<ChatInstance['sendMessage']>[0];

const emptyMessages: readonly MyUIMessage[] = Object.freeze([]);
const emptyMessageOrder: readonly string[] = Object.freeze([]);
const emptyMessagesById: ReadonlyMap<string, MyUIMessage> = new Map();

const messagesByIdCache = new WeakMap<readonly MyUIMessage[], Map<string, MyUIMessage>>();
const messageOrderCache = new WeakMap<
  ChatInstance,
  {
    readonly length: number;
    readonly order: readonly string[];
  }
>();

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

function getMessageOrder(chat: ChatInstance | undefined, messages: readonly MyUIMessage[]): readonly string[] {
  if (!chat || messages.length === 0) {
    return emptyMessageOrder;
  }
  const cached = messageOrderCache.get(chat);
  if (
    cached &&
    cached.length === messages.length &&
    messages.every((message, index) => cached.order[index] === message.id)
  ) {
    return cached.order;
  }
  const order = messages.map((message) => message.id);
  messageOrderCache.set(chat, { length: messages.length, order });
  return order;
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
};

const emptySessionSnapshot: SessionSnapshotFields = {
  chat: undefined,
  persistenceActorRef: undefined,
};

function selectSessionSnapshot(session: ChatSession | undefined): SessionSnapshotFields {
  if (!session) {
    return emptySessionSnapshot;
  }
  return {
    chat: session.chat,
    persistenceActorRef: session.persistenceActorRef,
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
  /** Chat-scoped execution target mirrored from durable persistence. */
  activeExecution: CadAgentExecution | undefined;
  /**
   * Chat-scoped active CAD kernel, mirrored from the persistence machine's
   * `Chat.activeKernel`. When undefined the consumer falls back to the
   * cookie default (see `useActiveChatKernel`).
   */
  activeKernel: KernelId | undefined;
  draftText: string;
  draftAttachments: readonly DraftAttachment[];
  draftToolChoice: string | string[];
  draftMode: ChatMode;
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId: string | undefined;
  editDraftText: string;
  editDraftAttachments: readonly DraftAttachment[];
};

function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => Object.is(value, b[index]))
    );
  }
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) {
    return false;
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  if (aKeys.length !== Object.keys(bRecord).length) {
    return false;
  }
  return aKeys.every((key) => Object.is(aRecord[key], bRecord[key]));
}

/**
 * Primary hook for reading chat + draft state. Combines the live AI SDK
 * snapshot from the store with the draft state from `<ActiveChatProvider>`.
 * Session-required — composer-only subtrees should call
 * {@link useDraftSelector} instead.
 *
 * The combined external-store subscription caches the selected value, so a
 * token update only re-renders consumers whose selected data changed.
 */
export function useChatSelector<T>(selector: (state: CombinedChatState) => T, chatId?: string): T {
  const { activeChatId, persistenceActorRef, draftActorRef } = useChatContext(chatId);
  const store = useChatSessionStore();
  const cacheRef = useRef<{ readonly value: T } | undefined>(undefined);

  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribeChat = store.subscribeChat(activeChatId, listener);
      const draftSubscription = draftActorRef.subscribe(listener);
      const persistenceSubscription = persistenceActorRef?.subscribe(listener);
      return () => {
        unsubscribeChat();
        draftSubscription.unsubscribe();
        persistenceSubscription?.unsubscribe();
      };
    },
    [activeChatId, draftActorRef, persistenceActorRef, store],
  );
  const getSnapshot = useCallback((): T => {
    const chat = store.get(activeChatId)?.chat;
    const messages = chat?.messages ?? emptyMessages;
    const status = chat?.status ?? 'ready';
    const draftContext = draftActorRef.getSnapshot().context;
    const persistenceContext = persistenceActorRef?.getSnapshot().context;
    const state: CombinedChatState = {
      messages,
      get messagesById() {
        return getMessagesById(messages);
      },
      get messageOrder() {
        return getMessageOrder(chat, messages);
      },
      status,
      error: chat?.error,
      persistedError: persistenceContext?.persistedError,
      isLoading: status === 'streaming',
      activeExecution: persistenceContext?.activeExecution,
      activeKernel: persistenceContext?.activeKernel,
      draftText: draftContext.draftText,
      draftAttachments: draftContext.draftAttachments,
      draftToolChoice: draftContext.draftToolChoice,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- ChatMode is the agent/plan superset narrowed at the consumer layer
      draftMode: draftContext.draftMode as ChatMode,
      messageEdits: draftContext.messageEdits,
      activeEditMessageId: draftContext.activeEditMessageId,
      editDraftText: draftContext.editDraftText,
      editDraftAttachments: draftContext.editDraftAttachments,
    };
    const next = selector(state);
    const cached = cacheRef.current;
    if (cached && shallowEqual(cached.value, next)) {
      return cached.value;
    }
    cacheRef.current = { value: next };
    return next;
  }, [activeChatId, draftActorRef, persistenceActorRef, selector, store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
 * doesn't depend on a live `Chat` session. A composer derives its send gate
 * from `draftAttachments` with `attachmentSendBlockReason` (`#utils/chat.utils.js`).
 */
export type DraftState = {
  draftText: string;
  draftAttachments: readonly DraftAttachment[];
  draftToolChoice: string | string[];
  draftMode: ChatMode;
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId: string | undefined;
  editDraftText: string;
  editDraftAttachments: readonly DraftAttachment[];
  /** An attachment for the main draft is still resizing or storing, so it is not in `draftAttachments` yet. */
  attachingMain: boolean;
  /** The same for the open edit. */
  attachingEdit: boolean;
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
      draftAttachments: draftContext.draftAttachments,
      draftToolChoice: draftContext.draftToolChoice,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- ChatMode is the agent/plan superset narrowed at the consumer layer
      draftMode: draftContext.draftMode as ChatMode,
      messageEdits: draftContext.messageEdits,
      activeEditMessageId: draftContext.activeEditMessageId,
      editDraftText: draftContext.editDraftText,
      editDraftAttachments: draftContext.editDraftAttachments,
      attachingMain: draftContext.attachmentQueue.some((entry) => entry.target === 'main'),
      attachingEdit: draftContext.attachmentQueue.some((entry) => entry.target === 'edit'),
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
export type DraftAttachmentOptions = {
  /** The selected model; an attachment kind it cannot read is refused before any byte is stored (D20). */
  readonly model: DraftAttachmentModel;
  /** Shown on a document chip and sent to the provider. */
  readonly filename?: string;
  /** Keep a generated lossless artifact byte-for-byte instead of applying the upload compression policy. */
  readonly preserveOriginal?: boolean;
};

const sourceFields = (
  source: DraftAttachmentSource,
): { dataUrl: string } | { bytes: Uint8Array<ArrayBuffer>; mediaType: string } =>
  typeof source === 'string' ? { dataUrl: source } : source;

export type DraftActions = {
  setDraftText: (text: string) => void;
  /**
   * Add a raw image or PDF data URL to the new-message draft. Synchronous: the
   * `draftMachine` enqueues it through its single `attachmentProcessing`
   * chokepoint (see `apps/ui/app/hooks/draft.machine.ts`), which resizes
   * images and stores the bytes before the draft references them. Pass the
   * original data URL. Generated captures pass `preserveOriginal` so their
   * lossless bytes bypass upload compression. Failures and refusals are
   * emitted by the machine for one toast subscriber, so callers MUST NOT wrap
   * this in try/catch.
   */
  addDraftAttachment: (source: DraftAttachmentSource, options: DraftAttachmentOptions) => void;
  removeDraftAttachment: (index: number) => void;
  setDraftToolChoice: (toolChoice: string | string[]) => void;
  setDraftMode: (mode: string) => void;
  clearDraft: () => void;
  startEditingMessage: (messageId: string, originalMessage?: MyUIMessage) => void;
  exitEditMode: () => void;
  setEditDraftText: (text: string) => void;
  /**
   * Add a raw data URL (or a document's bytes) to the message-edit draft. Same contract as
   * {@link DraftActions.addDraftAttachment}.
   */
  addEditDraftAttachment: (source: DraftAttachmentSource, options: DraftAttachmentOptions) => void;
  removeEditDraftAttachment: (index: number) => void;
  clearMessageEdit: (messageId: string) => void;
};

export function useDraftActions(): DraftActions {
  const { draftActorRef } = useChatComposer();

  return useMemo<DraftActions>(
    () => ({
      setDraftText(text: string) {
        draftActorRef.send({ type: 'setDraftText', text });
      },
      addDraftAttachment(source: DraftAttachmentSource, options: DraftAttachmentOptions) {
        draftActorRef.send({ type: 'addDraftAttachment', ...sourceFields(source), ...options });
      },
      removeDraftAttachment(index: number) {
        draftActorRef.send({ type: 'removeDraftAttachment', index });
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
      addEditDraftAttachment(source: DraftAttachmentSource, options: DraftAttachmentOptions) {
        draftActorRef.send({ type: 'addEditDraftAttachment', ...sourceFields(source), ...options });
      },
      removeEditDraftAttachment(index: number) {
        draftActorRef.send({ type: 'removeEditDraftAttachment', index });
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

/*
 * The verbs are gestures, not dispatches (C3).
 *
 * None of them carries a `body` any more: the chat's session actor owns the
 * turn, so it is the actor's admission that derives the rewind point, leases
 * the checkout and composes the wire body. A verb that composed its own body
 * was a second admission policy, and the two disagreed (F10).
 */
export type ChatActions = DraftActions & {
  sendMessage: (message: SendMessageInput, options?: { attachments?: readonly AttachmentReference[] }) => Promise<void>;
  regenerate: () => void;
  /**
   * Re-run the chat's last turn after a failure the person chose to retry.
   *
   * A stream the host can still continue is resumed rather than re-run, so
   * assistant parts that already landed survive; the admission decides which,
   * because only it knows whether the run is resumable.
   */
  continueChat: () => void;
  stop: () => void;
  setMessages: (messages: MyUIMessage[]) => void;
  editMessage: (messageId: string, content: string, options?: { attachments?: readonly AttachmentReference[] }) => void;
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

    // The draft no longer references what a send promoted; its draft-stage copies go.
    const releaseDraftAttachments = async (): Promise<void> => {
      try {
        await store.releaseDraftAttachments(resolvedChatId);
      } catch (error) {
        // An unreleased blob is reclaimed by the next `retainOnly`; nothing the person sent is affected.
        console.warn('[useChatActions] draft attachments could not be released', error);
      }
    };

    return {
      ...draftActions,
      async sendMessage(message: SendMessageInput, options) {
        draftActorRef.send({ type: 'clearDraft' });
        void releaseDraftAttachments();
        if (!requireSession('sendMessage')) {
          return;
        }
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- AI SDK sendMessage union narrows to MyUIMessage at all call sites
        const outgoingMessage = message as MyUIMessage;
        void store.touchChatRecency(resolvedChatId, outgoingMessage.metadata?.createdAt ?? Date.now());
        await store.requestTurn(resolvedChatId, {
          kind: 'send',
          message: outgoingMessage,
          ...(options?.attachments === undefined ? {} : { attachments: options.attachments }),
        });
      },
      regenerate() {
        if (!requireSession('regenerate')) {
          return;
        }
        void store.touchChatRecency(resolvedChatId, Date.now());
        void store.requestTurn(resolvedChatId, { kind: 'regenerate' });
      },
      continueChat() {
        if (!requireSession('continueChat')) {
          return;
        }
        void store.touchChatRecency(resolvedChatId, Date.now());
        void store.requestTurn(resolvedChatId, { kind: 'continue' });
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
        void releaseDraftAttachments();
        const session = requireSession('editMessage');
        if (!session) {
          return;
        }
        if (!session.chat.messages.some((m) => m.id === messageId)) {
          return;
        }
        void store.touchChatRecency(resolvedChatId, Date.now());
        void store.requestTurn(resolvedChatId, {
          kind: 'edit',
          messageId,
          text: content,
          ...(options?.attachments === undefined ? {} : { attachments: options.attachments }),
        });
      },
    };
  }, [store, resolvedChatId, isActiveChat, draftActorRef, draftActions]);
}
