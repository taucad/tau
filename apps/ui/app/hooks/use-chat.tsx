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
 *   {@link useChatActions} / {@link useChatById}):
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
 *   wrapping the subtree in `<ActiveChatProvider chatId={chatId} projectId={projectId}>` or
 *   calling `useChatSession(chatId, projectId)` directly). When the explicit chat is
 *   not the active session (cross-chat read), action mutators warn-and-no-op
 *   on missing sessions to keep cross-chat dispatch safe.
 */

import type { ChatStatus } from 'ai';
import { useSelector } from '@xstate/react';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import type { CadReference } from '@taucad/chat/references';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import type { ChatError } from '@taucad/types';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import type { KernelId } from '@taucad/types/constants';
import type { ActorRefFrom } from 'xstate';
import { useActiveChatSession, useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import { selectChatTranscript } from '#services/chat-session-store.js';
import type { ChatSession, ChatTranscriptState, StopOrigin } from '#services/chat-session-store.js';
import { noComposerTrays } from '@taucad/chat-ui/services/chat-composer-trays';
import type { ComposerTray } from '@taucad/chat-ui/services/chat-composer-trays';
import type { ChatMessageQueueIntent } from '@taucad/chat-ui/db/chat-message-queue-store';
import type { TurnGroup } from '#routes/w.$workspace.$project/chat-turn-groups.js';
import type { chatPersistenceMachine } from '@taucad/chat-ui/hooks/chat-persistence.machine';
import type {
  DraftAttachment,
  DraftAttachmentModel,
  DraftAttachmentSource,
  draftMachine,
  PendingDraftImage,
} from '@taucad/chat-ui/hooks/draft.machine';
import { pendingDraftImages } from '@taucad/chat-ui/hooks/draft.machine';
import type { StoredAttachmentRef } from '@taucad/chat-ui/utils/attachment.utils';
import type { ChatMode } from '#routes/w.$workspace.$project/chat-mode-selector.js';

type SendMessageInput = MyUIMessage;

const emptyMessages: readonly MyUIMessage[] = Object.freeze([]);

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
  persistenceActorRef: ActorRefFrom<typeof chatPersistenceMachine> | undefined;
};

const emptySessionSnapshot: SessionSnapshotFields = {
  persistenceActorRef: undefined,
};

function selectSessionSnapshot(session: ChatSession | undefined): SessionSnapshotFields {
  if (!session) {
    return emptySessionSnapshot;
  }
  return {
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
      persistenceActorRef: snapshot.persistenceActorRef,
      draftActorRef: active.draftActorRef,
    }),
    [resolvedChatId, snapshot.persistenceActorRef, active.draftActorRef],
  );
}

// ---------------------------------------------------------------------------
// State + selector surface
// ---------------------------------------------------------------------------

export type CombinedChatState = {
  messages: readonly MyUIMessage[];
  messagesById: ReadonlyMap<string, MyUIMessage>;
  messageOrder: readonly string[];
  turnGroups: readonly TurnGroup[];
  agentInvocations: string;
  /** The transcript's load state (I21): the lane draws no empty-chat state while it is `loading`. */
  transcript: ChatTranscriptState;
  /**
   * The newest request in `messages` while it is still on its way to the host: shown as sent, but not yet a turn of
   * the transcript, so it cannot be edited or rated yet.
   */
  departingMessageId: string | undefined;
  /** What the chat says while a send waits for its host to take it (PERF-5). */
  hostWait: string | undefined;
  /** The composer trays whose height the lane reserves while their reads are pending (U10). */
  rememberedComposerTrays: readonly ComposerTray[];
  /** The run phase, else the command in flight (T3). */
  status: ChatStatus;
  /** Persisted error survives reload (from the chat entity in IndexedDB). */
  persistedError: ChatError | undefined;
  /** Durable host facts and the current read-only attachment, not SDK stream state. */
  projection?: ChatProjection;
  attachmentStatus?: ReturnType<ReturnType<typeof useChatSessionStore>['getAttachmentStatus']>;
  /** The host whose log the chat is attached to, which is where its refusals came from. */
  attachedHostId?: ReturnType<ReturnType<typeof useChatSessionStore>['getAttachedHostId']>;
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
  /** The new-message draft's comments and annotated pictures. */
  draftAnnotations: MessageAnnotations | undefined;
  draftToolChoice: string | string[];
  draftMode: ChatMode;
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId: string | undefined;
  editDraftText: string;
  editDraftAttachments: readonly DraftAttachment[];
  /** The open edit's comments and annotated pictures. */
  editDraftAnnotations: MessageAnnotations | undefined;
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

/** Which sources a selector read on its last evaluation; a source it did not read cannot change its result. */
type SelectorReads = { store: boolean; draft: boolean; persistence: boolean };

/**
 * Primary hook for reading chat + draft state. Combines the chat's transcript
 * and projection from the store with the draft state from `<ActiveChatProvider>`.
 * Session-required — composer-only subtrees should call
 * {@link useDraftSelector} instead.
 *
 * Every field is read on demand, and a selector is woken only by the sources it
 * read on its last evaluation (WP-06a, D3): a selector of the transcript does
 * not run on a draft keystroke, and a selector of the draft does not run on a
 * streamed delta. The selected value is cached, so a wake only re-renders
 * consumers whose selected data changed.
 */
export function useChatSelector<T>(selector: (state: CombinedChatState) => T, chatId?: string): T {
  const { activeChatId, persistenceActorRef, draftActorRef } = useChatContext(chatId);
  const store = useChatSessionStore();
  const cacheRef = useRef<{ readonly value: T } | undefined>(undefined);
  /* Before the first evaluation every source counts as read. */
  const readsRef = useRef<SelectorReads>({ store: true, draft: true, persistence: true });

  const subscribe = useCallback(
    (listener: () => void) => {
      const fromStore = (): void => {
        if (readsRef.current.store) {
          listener();
        }
      };
      const unsubscribeChat = store.subscribeChat(activeChatId, fromStore);
      const unsubscribeProjection = store.subscribeProjection(activeChatId, fromStore);
      const draftSubscription = draftActorRef.subscribe(() => {
        if (readsRef.current.draft) {
          listener();
        }
      });
      const persistenceSubscription = persistenceActorRef?.subscribe(() => {
        if (readsRef.current.persistence) {
          listener();
        }
      });
      return () => {
        unsubscribeChat();
        unsubscribeProjection();
        draftSubscription.unsubscribe();
        persistenceSubscription?.unsubscribe();
      };
    },
    [activeChatId, draftActorRef, persistenceActorRef, store],
  );
  const getSnapshot = useCallback((): T => {
    const reads: SelectorReads = { store: false, draft: false, persistence: false };
    const fromStore = <V,>(read: () => V): V => {
      reads.store = true;
      return read();
    };
    const session = store.get(activeChatId);
    const draft = () => {
      reads.draft = true;
      return draftActorRef.getSnapshot().context;
    };
    const persistence = () => {
      reads.persistence = true;
      return persistenceActorRef?.getSnapshot().context;
    };
    const status = () => fromStore(() => store.getChatStatus(activeChatId));
    const state: CombinedChatState = {
      get messages() {
        return fromStore(() => session?.messages ?? emptyMessages);
      },
      get messagesById() {
        return fromStore(() => store.getMessagePresentation(activeChatId).messagesById);
      },
      get messageOrder() {
        return fromStore(() => store.getMessagePresentation(activeChatId).order);
      },
      get turnGroups() {
        return fromStore(() => store.getMessagePresentation(activeChatId).groups);
      },
      get agentInvocations() {
        return fromStore(() => store.getMessagePresentation(activeChatId).agentInvocations);
      },
      get transcript() {
        return fromStore(() => selectChatTranscript(session));
      },
      get departingMessageId() {
        return fromStore(() => store.departingSendOf(activeChatId));
      },
      get hostWait() {
        return fromStore(() => store.hostWaitOf(activeChatId));
      },
      get rememberedComposerTrays() {
        return fromStore(() => session?.rememberedComposerTrays ?? noComposerTrays);
      },
      get status() {
        return status();
      },
      get persistedError() {
        return persistence()?.persistedError;
      },
      get projection() {
        return fromStore(() => store.getProjection(activeChatId));
      },
      get attachmentStatus() {
        return fromStore(() => store.getAttachmentStatus(activeChatId));
      },
      get attachedHostId() {
        return fromStore(() => store.getAttachedHostId(activeChatId));
      },
      get isLoading() {
        return status() === 'streaming';
      },
      get activeExecution() {
        return persistence()?.activeExecution;
      },
      get activeKernel() {
        return persistence()?.activeKernel;
      },
      get draftText() {
        return draft().draftText;
      },
      get draftAttachments() {
        return draft().draftAttachments;
      },
      get draftAnnotations() {
        return draft().draftAnnotations;
      },
      get draftToolChoice() {
        return draft().draftToolChoice;
      },
      get draftMode() {
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- ChatMode is the agent/plan superset narrowed at the consumer layer
        return draft().draftMode as ChatMode;
      },
      get messageEdits() {
        return draft().messageEdits;
      },
      get activeEditMessageId() {
        return draft().activeEditMessageId;
      },
      get editDraftText() {
        return draft().editDraftText;
      },
      get editDraftAttachments() {
        return draft().editDraftAttachments;
      },
      get editDraftAnnotations() {
        return draft().editDraftAnnotations;
      },
    };
    const next = selector(state);
    readsRef.current = reads;
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
 * by mounting `<ActiveChatProvider chatId={chatId} projectId={projectId}>` higher up or calling
 * `useChatSession(chatId, projectId)` in the same component).
 */
export function useChatById<T>(chatId: string, selector: (state: CombinedChatState) => T): T {
  return useChatSelector(selector, chatId);
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
  /** The new-message draft's comments and annotated pictures. */
  draftAnnotations: MessageAnnotations | undefined;
  draftToolChoice: string | string[];
  draftMode: ChatMode;
  messageEdits: Record<string, MyUIMessage>;
  activeEditMessageId: string | undefined;
  editDraftText: string;
  editDraftAttachments: readonly DraftAttachment[];
  /** The open edit's comments and annotated pictures. */
  editDraftAnnotations: MessageAnnotations | undefined;
  /** An attachment for the main draft is still resizing or storing, so it is not in `draftAttachments` yet. */
  attachingMain: boolean;
  /** The same for the open edit. */
  attachingEdit: boolean;
  /** The main draft's images still converting or storing, whose thumbnail slots the composer holds. */
  pendingMain: readonly PendingDraftImage[];
  /** The same for the open edit. */
  pendingEdit: readonly PendingDraftImage[];
};

/**
 * Composer-required selector for draft-only state. Works under either
 * provider; safe to call from marketing-route composers.
 */
export function useDraftSelector<T>(selector: (state: DraftState) => T): T {
  const { draftActorRef } = useChatComposer();
  const draftContext = useSelector(draftActorRef, (state) => state.context);
  /* Derived only when the queue or the open edit changes, so a keystroke keeps the lists' identity. */
  const { attachmentQueue, activeEditMessageId } = draftContext;
  const pending = useMemo(
    () => ({
      main: pendingDraftImages({ attachmentQueue, activeEditMessageId }, 'main'),
      edit: pendingDraftImages({ attachmentQueue, activeEditMessageId }, 'edit'),
    }),
    [attachmentQueue, activeEditMessageId],
  );

  const draftState = useMemo<DraftState>(
    () => ({
      draftText: draftContext.draftText,
      draftAttachments: draftContext.draftAttachments,
      draftAnnotations: draftContext.draftAnnotations,
      draftToolChoice: draftContext.draftToolChoice,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- ChatMode is the agent/plan superset narrowed at the consumer layer
      draftMode: draftContext.draftMode as ChatMode,
      messageEdits: draftContext.messageEdits,
      activeEditMessageId: draftContext.activeEditMessageId,
      editDraftText: draftContext.editDraftText,
      editDraftAttachments: draftContext.editDraftAttachments,
      editDraftAnnotations: draftContext.editDraftAnnotations,
      attachingMain: draftContext.attachmentQueue.some((entry) => entry.target === 'main'),
      attachingEdit: draftContext.attachmentQueue.some((entry) => entry.target === 'edit'),
      pendingMain: pending.main,
      pendingEdit: pending.edit,
    }),
    [draftContext, pending],
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
  /** The picked, dropped or pasted file's declared `type`, for the intake counter; the bytes decide the label (I1). */
  readonly declaredType?: string;
  /** The annotated image this attachment is the picture of: once stored, that image names it. */
  readonly annotationImageId?: string;
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
   * chokepoint (see `apps/libs/chat-ui/src/hooks/draft.machine.ts`), which converts
   * images through the storage policy and stores the bytes before the draft references them. Pass the
   * original data URL. Generated captures pass `preserveOriginal` so their
   * lossless bytes bypass upload compression. Failures and refusals are
   * emitted by the machine for one toast subscriber, so callers MUST NOT wrap
   * this in try/catch.
   */
  addDraftAttachment: (source: DraftAttachmentSource, options: DraftAttachmentOptions) => void;
  removeDraftAttachment: (index: number) => void;
  /** Replace the new-message draft's comments and annotated pictures; a record over a limit is refused. */
  setDraftAnnotations: (annotations: MessageAnnotations | undefined) => void;
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
  /** Replace the open edit's comments and annotated pictures; a record over a limit is refused. */
  setEditDraftAnnotations: (annotations: MessageAnnotations | undefined) => void;
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
      setDraftAnnotations(annotations: MessageAnnotations | undefined) {
        draftActorRef.send({ type: 'setDraftAnnotations', annotations });
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
      setEditDraftAnnotations(annotations: MessageAnnotations | undefined) {
        draftActorRef.send({ type: 'setEditDraftAnnotations', annotations });
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
  sendMessage: (
    message: SendMessageInput,
    options?: {
      attachments?: readonly StoredAttachmentRef[];
      execution?: CadAgentExecution;
      queueIntent?: ChatMessageQueueIntent;
    },
  ) => Promise<void>;
  regenerate: () => void;
  /**
   * Resume a run the host still holds, preserving its already-settled work.
   * An unavailable resume is refused; replay is the separate regenerate verb.
   */
  continueChat: () => void;
  stop: (origin: StopOrigin) => void;
  editMessage: (
    messageId: string,
    content: string,
    options?: {
      attachments?: readonly StoredAttachmentRef[];
      references?: readonly CadReference[];
      annotations?: MessageAnnotations;
    },
  ) => void;
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
      async sendMessage(message: SendMessageInput, options) {
        if (!requireSession('sendMessage')) {
          return;
        }
        const outgoingMessage = message;
        /* I5: the composer is this message's only copy until the dispatch
         * appends it to the transcript, so `requestTurn` owns when it is
         * cleared — and when the draft-stage bytes behind it are released. It
         * is the only caller that knows whether the gesture was taken, queued,
         * displaced or refused. Clearing here first meant the last two deleted
         * what the person wrote; releasing here afterwards
         * deleted the files of the very message it had just handed back. */
        await store.requestTurn(resolvedChatId, {
          kind: 'send',
          message: outgoingMessage,
          ...(options?.queueIntent === undefined ? {} : { queueIntent: options.queueIntent }),
          ...(options?.execution === undefined ? {} : { execution: options.execution }),
          ...(options?.attachments === undefined ? {} : { attachments: options.attachments }),
        });
      },
      regenerate() {
        if (!requireSession('regenerate')) {
          return;
        }
        void store.requestTurn(resolvedChatId, { kind: 'regenerate' });
      },
      continueChat() {
        if (!requireSession('continueChat')) {
          return;
        }
        void store.requestTurn(resolvedChatId, { kind: 'continue' });
      },
      stop(origin) {
        const session = requireSession('stop');
        if (!session) {
          return;
        }
        store.stopRun(resolvedChatId, origin);
      },
      startEditingMessage(messageId: string, originalMessage?: MyUIMessage) {
        const session = resolveSession();
        const resolved =
          originalMessage ??
          (session === undefined
            ? undefined
            : store.getCurrentTranscript(resolvedChatId).find((m) => m.id === messageId));
        draftActorRef.send({ type: 'startEditingMessage', messageId, originalMessage: resolved });
      },

      editMessage(messageId: string, content: string, options?) {
        draftActorRef.send({ type: 'clearMessageEdit', messageId });
        const session = requireSession('editMessage');
        if (!session) {
          return;
        }
        if (!store.getCurrentTranscript(resolvedChatId).some((m) => m.id === messageId)) {
          return;
        }
        void store.requestTurn(resolvedChatId, {
          kind: 'edit',
          messageId,
          text: content,
          ...(options?.attachments === undefined ? {} : { attachments: options.attachments }),
          ...(options?.references === undefined ? {} : { references: options.references }),
          ...(options?.annotations === undefined ? {} : { annotations: options.annotations }),
        });
      },
    };
  }, [store, resolvedChatId, isActiveChat, draftActorRef, draftActions]);
}
