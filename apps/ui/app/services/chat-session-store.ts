/**
 * ChatSessionStore
 *
 * Vanilla, dual-lifetime store that owns the long-lived per-chat objects:
 * the AI SDK `Chat` instance, the `chatPersistenceMachine` actor, and the
 * `draftMachine` actor. React components subscribe but never own — every
 * lifetime survives subtree unmount/remount cycles, eliminating the class of
 * "headless component reuse" races that plagued the prior `<ChatInstance>`
 * design (load wipes in-flight messages, persist dropped while loading,
 * draft `setChatId` lost across an async hop, draft state leaking across
 * chats, cross-chat persist mis-targeting).
 *
 * Lifetime ownership:
 * - `acquire(chatId)` / `release(chatId)` track React views only.
 * - `startRun(chatId)` owns the session independently while a request is
 *   active, so navigation cannot stop its transport or persistence actor.
 * - A session is disposed only when its final view and active run are both
 *   released.
 *
 * Subscriptions:
 * - `subscribeMembership` wakes on first acquire / final release per chatId.
 * - `subscribeChat(chatId, listener)` wakes on the underlying `Chat`'s
 *   messages/status/error callbacks (mirrored via the `~register*Callback`
 *   APIs) — scoped per chatId so a token streaming into chat A never wakes
 *   subscribers bound to chat B.
 *
 * Dependencies (`setDependencies`) are mirrored on every render of the
 * provider so the store always invokes the latest closures from
 * `useProjectManager()`, held in a ref so effect identity does not churn.
 */

import type { Chat } from '@ai-sdk/react';
import type { ChatStatus } from 'ai';
import { Topic } from '@taucad/events';
import { z } from 'zod';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import { isAnyToolPart } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import type { ChatRequest } from '#hooks/chat-persistence.machine.js';
import { draftMachine } from '#hooks/draft.machine.js';
import { resizeImageActor } from '#hooks/resize-image.actor.js';
import { inspect } from '#machines/inspector.js';
import { clearLedger } from '#services/rpc-ledger.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';
import { extractMimeTypeFromDataUrl, finalizeInterruptedToolParts, stampMessageCreatedAt } from '#utils/chat.utils.js';
import {
  bindDurableChatRun,
  createChatInstance,
  getBoundDurableChatRunId,
} from '#chat-clients/_internal/shared-chat-transport.js';
import { registerAgentHostRunReset } from '#chat-clients/_internal/browser-agent-host-transport.js';
import type { CommitCancelledDraftRestoreInput } from '#types/storage.types.js';

const admissionEnvelopeSchema = z.strictObject({
  version: z.literal(1),
  idempotencyKey: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Closures the store needs from the project manager. Stored in a single
 * object so `setDependencies` is one atomic swap (no torn reads if a render
 * mid-acquire updates one closure at a time).
 */
export type ChatSessionDeps = {
  getChat: (chatId: string) => Promise<ChatEntity | undefined>;
  patchChat: <K extends keyof ChatEntity>(
    chatId: string,
    key: K,
    value: ChatEntity[K],
  ) => Promise<ChatEntity | undefined>;
  touchChatRecency: (chatId: string, requestedAt: number) => Promise<ChatEntity | undefined>;
  setChatUnreadState: (chatId: string, hasUnreadTurn: boolean) => Promise<ChatEntity | undefined>;
  consumeChatStartupRequest: (chatId: string, requestId: string) => Promise<ChatEntity | undefined>;
  commitCancelledDraftRestore: (
    chatId: string,
    input: CommitCancelledDraftRestoreInput,
  ) => Promise<ChatEntity | undefined>;
  setMessageEdit: (chatId: string, messageId: string, draft: MyUIMessage) => Promise<ChatEntity | undefined>;
  clearMessageEdit: (chatId: string, messageId: string) => Promise<ChatEntity | undefined>;
};

/** Snapshot of the latest aggregated cost for a chat (derived from `data-usage` parts). */
export type UsageSnapshot = {
  totalCost: number;
  /** Wall-clock millis when the snapshot was last updated. */
  lastUpdatedAt: number;
};

export type ChatSession = {
  readonly chatId: string;
  readonly chat: Chat<MyUIMessage>;
  readonly persistenceActorRef: ActorRefFrom<typeof chatPersistenceMachine>;
  readonly draftActorRef: ActorRefFrom<typeof draftMachine>;
};

// ---------------------------------------------------------------------------
// Module-scoped singletons / helpers
// ---------------------------------------------------------------------------

/**
 * Rebuilds the user message currently being edited. Resets only the
 * user-facing fields — text/image parts, `createdAt`, and `status` — and
 * spreads the original message's metadata through untouched. Per-turn
 * agent config travels via `body.agent` on the wire (composed by the
 * chat-client from `useCadAgentConfig`), never via per-message metadata.
 */
function buildEditedMessage(original: MyUIMessage, request: Extract<ChatRequest, { kind: 'edit' }>): MyUIMessage {
  return {
    id: request.messageId,
    role: 'user',
    parts: [
      { type: 'text', text: request.content },
      ...(request.imageUrls?.map(
        (url) =>
          ({
            type: 'file',
            url,
            mediaType: extractMimeTypeFromDataUrl(url),
          }) as const,
      ) ?? []),
    ],
    metadata: {
      ...original.metadata,
      createdAt: Date.now(),
      status: 'pending',
    },
  };
}

/**
 * Slices the message tail so a subsequent `chat.regenerate(...)` re-runs
 * the assistant turn after the retried message. Model overrides (e.g. "Try
 * with a different model") travel via `request.body.agent.execution` composed
 * by `useCadChatClient.retry`, not by mutating persisted metadata.
 */
function buildRetryMessages(
  messages: MyUIMessage[],
  request: Extract<ChatRequest, { kind: 'retry' }>,
): MyUIMessage[] | undefined {
  const messageIndex = messages.findIndex((m) => m.id === request.messageId);
  if (messageIndex === -1) {
    return undefined;
  }
  return messages.slice(0, messageIndex);
}

function aggregateUsageCost(messages: readonly MyUIMessage[]): number {
  let total = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'data-usage') {
        total += part.data.totalCost;
      }
    }
  }
  return total;
}

function buildDraftFromUserMessage(message: MyUIMessage): MyUIMessage {
  return {
    id: 'draft',
    role: 'user',
    parts: message.parts.filter((part) => part.type === 'text' || part.type === 'file'),
    metadata: {
      createdAt: Date.now(),
      status: 'pending',
    },
  };
}

function buildPendingTailDraftRestore(messages: readonly MyUIMessage[]):
  | {
      userMessage: MyUIMessage;
      truncatedMessages: MyUIMessage[];
    }
  | undefined {
  const last = messages.at(-1);
  if (last?.role === 'user' && last.metadata?.status === 'pending') {
    return {
      userMessage: last,
      truncatedMessages: messages.slice(0, -1),
    };
  }

  if (last?.role !== 'assistant' || last.parts.length > 0) {
    return undefined;
  }

  const userMessage = messages.at(-2);
  if (userMessage?.role !== 'user' || userMessage.metadata?.status !== 'pending') {
    return undefined;
  }

  return {
    userMessage,
    truncatedMessages: messages.slice(0, -2),
  };
}

function countPersistMilestones(message: MyUIMessage): number {
  let count = 0;
  for (const part of message.parts) {
    if (isAnyToolPart(part) && (part.state === 'output-available' || part.state === 'output-error')) {
      count += 1;
      continue;
    }

    if (part.type === 'text' && 'state' in part && part.state === 'done') {
      count += 1;
      continue;
    }

    if (part.type === 'reasoning' && 'state' in part && part.state === 'done') {
      count += 1;
    }
  }

  return count;
}

function hasPendingApproval(messages: readonly MyUIMessage[]): boolean {
  return messages.some((message) =>
    message.parts.some((part) => isAnyToolPart(part) && part.state === 'approval-requested'),
  );
}

// ---------------------------------------------------------------------------
// ChatSessionStore
// ---------------------------------------------------------------------------

/**
 * Composes one per-request wire body, admitting the chat's durable workspace on
 * the way. Owned by the profile-scoped chat client; called by the store only for
 * dispatches that carry no body of their own.
 *
 * @public
 */
export type LatestAgentBodyFactory = () => Promise<Readonly<Record<string, unknown>>>;

type InternalSession = ChatSession & {
  /** React/view consumers currently observing this session. */
  viewRefcount: number;
  /** Non-view ownership held while one logical run is active. */
  runHeld: boolean;
  /** Exact server-authoritative run selected by project reload discovery. */
  durableRunId: string | undefined;
  durableRunState: 'reattaching' | 'active' | 'terminal' | undefined;
  /** Host this session has already reattached to; see `reattachHostChat`. */
  reattachedHostId: string | undefined;
  /**
   * This load dispatched the chat's seeded first turn, so the host stream is
   * this page's own and there is nothing to reattach to; see
   * {@link ChatSessionStore.reattachHostChat}.
   */
  seededDispatch: boolean;
  /** Immutable wire body for the active logical run, including admission. */
  activeRunBody: Readonly<Record<string, unknown>> | undefined;
  status: ChatStatus;
  usage: UsageSnapshot | undefined;
  /**
   * How the active profile-scoped chat client composes a per-request body for
   * this chat. Published via {@link ChatSessionStore.setLatestAgentBody} from
   * `useCadChatClient`. The `dispatchRequest` listener calls it when a request
   * enters the persistence machine without an explicit `body` (the
   * startup-request hydration regenerate in `loadChatActor`), so the seeded turn
   * admits the same workspace an explicit submit would — a stored snapshot
   * could name a workspace that a later `prepare` had already discarded.
   */
  latestAgentBody: LatestAgentBodyFactory | undefined;
  /** Bodyless startup/continue dispatches waiting for the profile client to publish its body factory. */
  latestAgentBodyWaiters: Set<(compose: LatestAgentBodyFactory | undefined) => void>;
  /** Cleanups for the per-chat subscriptions wired up at session creation. */
  dispose: () => void;
};

export class ChatSessionStore {
  readonly #sessions = new Map<string, InternalSession>();
  readonly #membershipTopic = new Topic<void>({ name: 'ChatSessionStore.membership' });
  readonly #chatTopics = new Map<string, Topic<void>>();
  readonly #statusTopics = new Map<string, Topic<void>>();
  readonly #usageTopics = new Map<string, Topic<void>>();
  #snapshot: readonly string[] = [];
  /**
   * Coalesces membership notifications onto a microtask so an `acquire`/
   * `release` triggered during another component's render (e.g. the React
   * `useChatSession` lazy initializer) never schedules a `setState` on a
   * concurrently-rendering subscriber. Without this, `<ProjectChatRpcBindings>`'s
   * `useSyncExternalStore` would wake mid-render of `<SessionBackedActiveChatProvider>`
   * and React would log the "Cannot update a component while rendering a
   * different component" warning. Snapshot mutation stays synchronous so
   * `getSnapshot` callers always observe the latest membership.
   */
  #membershipNotifyScheduled = false;
  // Default deps throw — `setDependencies` must be called before any acquire.
  // Stored as a single object so swaps are atomic (no torn reads).
  #deps: ChatSessionDeps = {
    async getChat() {
      throw new Error('ChatSessionStore: getChat not provided');
    },
    async patchChat() {
      throw new Error('ChatSessionStore: patchChat not provided');
    },
    async touchChatRecency() {
      throw new Error('ChatSessionStore: touchChatRecency not provided');
    },
    async setChatUnreadState() {
      throw new Error('ChatSessionStore: setChatUnreadState not provided');
    },
    async consumeChatStartupRequest() {
      throw new Error('ChatSessionStore: consumeChatStartupRequest not provided');
    },
    async commitCancelledDraftRestore() {
      throw new Error('ChatSessionStore: commitCancelledDraftRestore not provided');
    },
    async setMessageEdit() {
      throw new Error('ChatSessionStore: setMessageEdit not provided');
    },
    async clearMessageEdit() {
      throw new Error('ChatSessionStore: clearMessageEdit not provided');
    },
  };

  /**
   * Update the closures the store invokes on behalf of every session. Safe to
   * call on every render — closures are read through `this.#deps` at call
   * time, so swapping never tears in-flight work.
   */
  public setDependencies(deps: ChatSessionDeps): void {
    this.#deps = deps;
  }

  /** Record one accepted user action independently of transcript persistence. */
  public async touchChatRecency(chatId: string, requestedAt: number): Promise<ChatEntity | undefined> {
    return this.#deps.touchChatRecency(chatId, requestedAt);
  }

  public acquire(chatId: string): ChatSession {
    const existing = this.#sessions.get(chatId);
    if (existing) {
      existing.viewRefcount += 1;
      return existing;
    }

    const session = this.#createSession(chatId);
    this.#sessions.set(chatId, session);
    this.#refreshSnapshot();
    this.#notifyMembership();
    return session;
  }

  /**
   * Rehydrate an API-discovered durable run without acquiring a React view.
   * Its non-view hold keeps the session alive while the exact run resumes.
   */
  public retainDurableRun(input: {
    readonly chatId: string;
    readonly runId: string;
    readonly state?: 'active' | 'terminal';
  }): ChatSession {
    bindDurableChatRun(input.chatId, input.runId);
    const existing = this.#sessions.get(input.chatId);
    if (existing) {
      const runChanged = existing.durableRunId !== input.runId;
      const priorState = existing.durableRunState;
      const nextState = !runChanged && priorState === 'terminal' ? 'terminal' : (input.state ?? 'reattaching');
      const shouldResume =
        nextState !== 'terminal' &&
        existing.status === 'ready' &&
        !existing.persistenceActorRef.getSnapshot().context.isLoadingChat &&
        (runChanged || priorState === undefined);
      existing.runHeld = true;
      existing.durableRunId = input.runId;
      existing.durableRunState = nextState;
      this.#statusTopics.get(input.chatId)?.emit();
      if (shouldResume) {
        queueMicrotask(() => {
          if (
            this.#sessions.get(input.chatId) === existing &&
            existing.durableRunId === input.runId &&
            existing.durableRunState !== 'terminal'
          ) {
            void existing.chat.resumeStream();
          }
        });
      }
      return existing;
    }
    const session = this.#createSession(input.chatId);
    session.viewRefcount = 0;
    session.runHeld = true;
    session.durableRunId = input.runId;
    session.durableRunState = input.state ?? 'reattaching';
    this.#sessions.set(input.chatId, session);
    this.#refreshSnapshot();
    this.#notifyMembership();
    return session;
  }

  /**
   * Reattach one host-placed chat to its host's durable log.
   *
   * Reload discovery substantiates a run from this browser's *workspace claim*
   * (`ProjectChatRpcBindings` → {@link ChatSessionStore.retainDurableRun}). A
   * chat placed on a daemon writes no claim — the daemon owns its workspace,
   * its files and its tools — so nothing ever retained its run, the load-time
   * resume gate never opened, and a reloaded page rebuilt its transcript from
   * local storage while the daemon finished the turn unattended.
   *
   * The host's log is the authority (PH19) and the transport resolves the run
   * from it, so the trigger here is the *placement*, not a run id. Idempotent
   * per host: the caller is the host registration effect, which re-runs
   * whenever the per-turn agent config changes.
   *
   * A chat whose seeded first turn *this load* dispatched is excluded: that
   * dispatch is already the host stream, and reattaching over it opened a
   * second one — on rung 2, a second relay session, refused by a capacity-1
   * daemon with 409 BUSY before the seeded turn had run at all. `status` alone
   * does not cover it: the registration effect can observe `ready` in the same
   * tick the dispatch is queued.
   *
   * @param input - The chat and the host it is placed on.
   */
  public reattachHostChat(input: { readonly chatId: string; readonly hostId: string }): void {
    const session = this.#sessions.get(input.chatId);
    if (
      !session ||
      session.reattachedHostId === input.hostId ||
      session.seededDispatch ||
      session.status !== 'ready' ||
      session.persistenceActorRef.getSnapshot().context.isLoadingChat
    ) {
      // Marked only when it actually reattaches, so a later registration pass
      // still reattaches a chat that was loading or busy on this one.
      return;
    }
    session.reattachedHostId = input.hostId;
    queueMicrotask(() => {
      if (this.#sessions.get(input.chatId) === session) {
        void session.chat.resumeStream();
      }
    });
  }

  /** Release reload-discovery ownership after project-wide settlement. */
  public releaseDurableRun(input: { readonly chatId: string; readonly runId: string }): void {
    const session = this.#sessions.get(input.chatId);
    if (!session || session.durableRunId !== input.runId) {
      return;
    }
    session.durableRunId = undefined;
    session.durableRunState = undefined;
    this.#disposeIfUnreferenced(session);
  }

  /** Idempotently restore the canonical user row ahead of its durable assistant run. */
  public reconcileDurableUserMessage(input: {
    readonly chatId: string;
    readonly runId: string;
    readonly message: MyUIMessage;
  }): boolean {
    const session = this.#sessions.get(input.chatId);
    if (!session || session.durableRunId !== input.runId || input.message.role !== 'user') {
      return false;
    }
    const existingIndex = session.chat.messages.findIndex((message) => message.id === input.message.id);
    if (existingIndex === -1) {
      const assistantIndex = session.chat.messages.findIndex(
        (message) => message.role === 'assistant' && message.id === input.runId,
      );
      const insertAt = assistantIndex === -1 ? session.chat.messages.length : assistantIndex;
      session.chat.messages = [
        ...session.chat.messages.slice(0, insertAt),
        input.message,
        ...session.chat.messages.slice(insertAt),
      ];
    } else {
      if (session.chat.messages[existingIndex] === input.message) {
        return false;
      }
      session.chat.messages = session.chat.messages.with(existingIndex, input.message);
    }
    session.persistenceActorRef.send({ type: 'queuePersist', messages: session.chat.messages });
    return true;
  }

  public release(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (!session) {
      return;
    }
    session.viewRefcount -= 1;
    this.#disposeIfUnreferenced(session);
  }

  public get(chatId: string): ChatSession | undefined {
    return this.#sessions.get(chatId);
  }

  public list(): readonly string[] {
    return this.#snapshot;
  }

  public subscribeMembership(listener: () => void): () => void {
    return this.#membershipTopic.subscribe(listener);
  }

  public subscribeChat(chatId: string, listener: () => void): () => void {
    return this.#addPerChatListener({ bucket: this.#chatTopics, namePrefix: 'chat', chatId, listener });
  }

  public getStatus(chatId: string): ChatStatus | undefined {
    return this.#sessions.get(chatId)?.status;
  }

  public getDurableRunState(chatId: string): InternalSession['durableRunState'] {
    return this.#sessions.get(chatId)?.durableRunState;
  }

  public getDurableRunId(chatId: string): string | undefined {
    return this.#sessions.get(chatId)?.durableRunId;
  }

  public subscribeStatus(chatId: string, listener: () => void): () => void {
    return this.#addPerChatListener({ bucket: this.#statusTopics, namePrefix: 'status', chatId, listener });
  }

  public getUsage(chatId: string): UsageSnapshot | undefined {
    return this.#sessions.get(chatId)?.usage;
  }

  public subscribeUsage(chatId: string, listener: () => void): () => void {
    return this.#addPerChatListener({ bucket: this.#usageTopics, namePrefix: 'usage', chatId, listener });
  }

  /**
   * Publish how the active profile-scoped chat client (`useCadChatClient`
   * today, future name/commit clients tomorrow) composes a per-request body for
   * this chat. The `dispatchRequest` listener inside `#createSession` calls it
   * when a request hits the persistence machine without an explicit `body`
   * (notably the startup-request hydration regenerate — see `loadChatActor`).
   *
   * A factory, not a snapshot: composing at dispatch time is what makes the
   * seeded first turn admit the workspace it is about to write to.
   */
  public setLatestAgentBody(chatId: string, compose: LatestAgentBodyFactory | undefined): void {
    const session = this.#sessions.get(chatId);
    if (!session) {
      return;
    }
    session.latestAgentBody = compose;
    if (!compose) {
      return;
    }
    for (const resolve of session.latestAgentBodyWaiters) {
      resolve(compose);
    }
    session.latestAgentBodyWaiters.clear();
  }

  /**
   * Begin non-view ownership for one logical run and return its immutable,
   * versioned wire body. Repeated calls while the persistence machine
   * preempts or retries a run keep one hold but may replace the active body
   * when a newly admitted user operation supplies its own idempotency key.
   */
  public startRun(chatId: string, body: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    const session = this.#sessions.get(chatId);
    if (!session) {
      throw new Error(`ChatSessionStore: cannot start a run for inactive chat ${chatId}`);
    }

    const admittedBody = this.#withAdmission(body);
    session.runHeld = true;
    session.activeRunBody = admittedBody;
    return admittedBody;
  }

  /** Release a direct run that failed before AI SDK could emit `onFinish`. */
  public endRun(chatId: string): void {
    const session = this.#sessions.get(chatId);
    if (!session || !session.runHeld) {
      return;
    }
    session.runHeld = false;
    session.activeRunBody = undefined;
    this.#disposeIfUnreferenced(session);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  #createSession(chatId: string): InternalSession {
    // Defensive aliases so closures bound to the AI SDK's internal scheduler
    // always read through `this.#deps` (the latest provider snapshot).
    const depsRef = (): ChatSessionDeps => this.#deps;

    // oxlint-disable-next-line eslint/prefer-const -- initialised only after the actor/chat callbacks that close over it are constructed.
    let session: InternalSession;
    let approvalWasPending = false;

    const markUnreadIfUnattended = (): void => {
      const documentIsActive =
        typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());
      if (session.viewRefcount > 0 && documentIsActive) {
        return;
      }
      void depsRef().setChatUnreadState(chatId, true);
    };

    const persistenceActorRef = createActor(
      chatPersistenceMachine.provide({
        actors: {
          loadChatActor: fromSafeAsync(async ({ input }) => {
            const loadedChat = await depsRef().getChat(input.chatId);

            if (!loadedChat) {
              if (session.durableRunId && session.durableRunState !== 'terminal') {
                queueMicrotask(() => {
                  void session.chat.resumeStream();
                });
              }
              if (session.chat.messages.length === 0) {
                session.chat.messages = [];
              }

              return { type: 'chatRetrieved', chat: undefined };
            }

            // Defensive guard: only seed messages from the loaded chat when
            // the live `Chat` instance has not started accumulating its own
            // (a brand-new chat that's already in-flight). Prevents the
            // classic "load wipes in-flight messages" race.
            if (session.chat.messages.length === 0) {
              session.chat.messages = loadedChat.messages;
            }

            let hydratedChat = loadedChat;
            const lastMessage = session.chat.messages.at(-1);
            const { startupRequest } = loadedChat;
            if (startupRequest) {
              const isEligibleStartupRequest =
                lastMessage?.role === 'user' &&
                lastMessage.id === startupRequest.messageId &&
                lastMessage.metadata?.status === 'pending';
              const consumedChat = await depsRef().consumeChatStartupRequest(input.chatId, startupRequest.id);
              if (consumedChat) {
                hydratedChat = consumedChat;
              }

              if (isEligibleStartupRequest && consumedChat) {
                session.draftActorRef.send({ type: 'initializeFromChat', chat: consumedChat });
                session.chat.messages = consumedChat.messages;

                /* This dispatch *is* the host stream for the chat's first turn.
                 * Marked before it is sent, because the host registration that
                 * would otherwise reattach lands in the same tick and would open
                 * a second stream — a second relay session on rung 2, which a
                 * capacity-1 daemon refuses. */
                session.seededDispatch = true;
                persistenceActorRef.send({
                  type: 'startRequest',
                  request: { kind: 'regenerate' },
                });

                return { type: 'chatRetrieved', chat: { ...consumedChat, error: undefined } };
              }
            }

            const pendingTailRestore = buildPendingTailDraftRestore(session.chat.messages);
            if (pendingTailRestore) {
              const draft = buildDraftFromUserMessage(pendingTailRestore.userMessage);
              const restoredChat = await depsRef().commitCancelledDraftRestore(input.chatId, {
                messages: pendingTailRestore.truncatedMessages,
                draft,
                clearStartupRequestId: startupRequest?.id,
              });
              const healedChat = restoredChat ?? {
                ...hydratedChat,
                messages: pendingTailRestore.truncatedMessages,
                draft,
                startupRequest: undefined,
              };
              session.chat.messages = pendingTailRestore.truncatedMessages;
              session.draftActorRef.send({ type: 'initializeFromChat', chat: healedChat });

              return { type: 'chatRetrieved', chat: healedChat };
            }

            session.draftActorRef.send({ type: 'initializeFromChat', chat: hydratedChat });
            // Reattach to any admitted queued/running/waiting run after a
            // reload. The host transport replays the whole durable log from
            // cursor 0 — nothing persists a cursor — and drops this
            // transcript's copy of the run it is about to rebuild through the
            // reset registered above, so the replay cannot double any part it
            // already applied.
            if (session.durableRunId && session.durableRunState !== 'terminal') {
              queueMicrotask(() => {
                void session.chat.resumeStream();
              });
            }
            return { type: 'chatRetrieved', chat: hydratedChat };
          }),
          persistMessagesActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'messages', stampMessageCreatedAt(input.messages));
          }),
          persistErrorActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'error', input.error);
          }),
          clearErrorActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'error', undefined);
          }),
          persistActiveExecutionActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'activeExecution', input.activeExecution);
          }),
          persistActiveKernelActor: fromSafeAsync(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'activeKernel', input.activeKernel);
          }),
        },
      }),
      {
        input: {
          activeChatId: chatId,
          resourceId: undefined,
        },
        inspect,
      },
    );

    const draftActorRef = createActor(
      draftMachine.provide({
        actors: {
          persistDraftActor: fromSafeAsync<void, { chatId: string; draft: MyUIMessage }>(async ({ input }) => {
            await depsRef().patchChat(input.chatId, 'draft', input.draft);
          }),
          persistEditDraftActor: fromSafeAsync<void, { chatId: string; messageId: string; draft: MyUIMessage }>(
            async ({ input }) => {
              await depsRef().setMessageEdit(input.chatId, input.messageId, input.draft);
            },
          ),
          clearMessageEditActor: fromSafeAsync<void, { chatId: string; messageId: string }>(async ({ input }) => {
            await depsRef().clearMessageEdit(input.chatId, input.messageId);
          }),
          resizeImageActor,
        },
      }),
      {
        input: { chatId },
        inspect,
      },
    );

    const chat = createChatInstance({
      chatId,
      onFinish: ({ messages, isAbort, isError, isDisconnect }) => {
        const durableRunId = session.durableRunId ?? getBoundDurableChatRunId(chatId);
        if (durableRunId && !isDisconnect) {
          session.durableRunId = durableRunId;
          session.durableRunState = 'terminal';
          this.#statusTopics.get(chatId)?.emit();
        }
        persistenceActorRef.send({ type: 'requestFinished', messages, isAbort, isError, isDisconnect });
        if (!isAbort && !isDisconnect) {
          markUnreadIfUnattended();
        }
        this.#scheduleRunReleaseIfTerminal(session);
      },
      onError(error) {
        persistenceActorRef.send({ type: 'handleError', error });
        persistenceActorRef.send({
          type: 'setPersistedError',
          error: parseErrorForPersistence(error),
        });
      },
    });

    const milestonePersistState = {
      lastPersistedMilestoneIndex: -1,
      lastPersistedMilestonePartCount: 0,
    };

    const resetMilestonePersistTracking = (): void => {
      milestonePersistState.lastPersistedMilestoneIndex = -1;
      milestonePersistState.lastPersistedMilestonePartCount = 0;
    };

    // Translate persistence-actor emits into AI SDK side effects on the
    // store-owned `Chat`. Identical wiring to the prior `<ChatInstance>` —
    // moved outside React so the listeners outlive any subtree mount cycle.
    //
    // The listener body is deferred onto a microtask so that
    // `chat.sendMessage` / `chat.regenerate` / `chatShim.makeRequest` never
    // run nested inside another `Chat.makeRequest`'s `finally` block. AI SDK
    // v6's `makeRequest` clobbers `this.activeResponse = void 0` AFTER its
    // `onFinish` callback returns; a synchronous re-entry from `onFinish` →
    // `requestFinished` → `stopping → invoking` → emit `dispatchRequest`
    // would let the new `makeRequest` assign `this.activeResponse =
    // activeResponse_B` only to have the outer finally null it back out.
    // The new `makeRequest`'s own finally would then access
    // `this.activeResponse.state.message` (no optional chaining in ai@6.0.175)
    // and throw a TypeError that the surrounding try/catch swallows,
    // suppressing `onFinish` and stranding the persistence machine in
    // `invoking`. See docs/research/chat-followup-message-swallow.md.
    //
    // The microtask deferral is strictly local to this listener: the
    // sibling `applyResumedRequest` listener still runs synchronously so
    // its `chat.messages = sanitized` mutation is observable to the deferred
    // `chat.sendMessage(B)` call when it fires on the next tick.
    const dispatchSubscription = persistenceActorRef.on('dispatchRequest', ({ request }) => {
      const availableBody = request.body ? this.startRun(chatId, request.body) : session.activeRunBody;

      queueMicrotask(() => {
        // A bodyless dispatch composes its body *now*, through the chat
        // client's own admission path. It used to reuse a body snapshot the
        // client had published at mount, whose `execution` named a workspace
        // that a later `prepare` had already discarded: the run then executed
        // against a workspace id no claim on disk carried, nothing ever marked
        // the claim admitted, and the turn could never settle.
        const composeBody = async (): Promise<Readonly<Record<string, unknown>> | undefined> => {
          const compose = session.latestAgentBody ?? (await this.#waitForLatestAgentBody(session));
          if (!compose) {
            return undefined;
          }
          try {
            return await compose();
          } catch (error) {
            console.error('[ChatSessionStore] durable workspace admission failed for a seeded dispatch', error);
            return undefined;
          }
        };
        const dispatch = async (): Promise<void> => {
          const composed = availableBody ?? (await composeBody());
          if (!composed || this.#sessions.get(chatId) !== session) {
            return;
          }
          const requestBody = availableBody ?? this.startRun(chatId, composed);

          // The chat-client always supplies `request.body` when it dispatches
          // a verb it originated (submit / retry / regenerateTail / stop). Two
          // request kinds are *bodyless* by construction:
          //
          //   - Startup-request hydration regenerate (see `loadChatActor`),
          //     which may fire before any client has attached a body.
          //   - `continue` (manual Try again on a transient-network banner via
          //     `continueChat`, and the persistence machine's transparent
          //     auto-retry in `retrying`), which resumes the in-flight stream
          //     and has no producer that owns the per-turn agent payload.
          //
          // Every wire call must still carry the Tau wire shape's top-level
          // `agent` block (see `chatTurnRequestSchema`), so we fall back to the
          // latest body the chat-client published via `setLatestAgentBody`. This
          // keeps the `agent` invariant true for every transport call, not just
          // the verbs that originated with an explicit body.
          switch (request.kind) {
            case 'send': {
              void chat.sendMessage(request.message, { body: requestBody });
              return;
            }

            case 'regenerate': {
              void chat.regenerate({ body: requestBody });
              return;
            }

            case 'edit': {
              const messageIndex = chat.messages.findIndex((m) => m.id === request.messageId);
              if (messageIndex === -1) {
                return;
              }
              const originalMessage = chat.messages[messageIndex]!;
              chat.messages = [...chat.messages.slice(0, messageIndex), buildEditedMessage(originalMessage, request)];
              void chat.regenerate({ body: requestBody });
              return;
            }

            case 'retry': {
              const next = buildRetryMessages(chat.messages, request);
              if (!next) {
                return;
              }
              chat.messages = next;
              void chat.regenerate({ body: requestBody });
              return;
            }

            // Resume the exact admitted run without slicing chat.messages. The
            // transport decides whether this attaches to a browser-host log or
            // the API's resumable stream.
            case 'continue': {
              void chat.resumeStream({ body: requestBody });
            }
          }
        };
        void dispatch();
      });
    });

    const stopSubscription = persistenceActorRef.on('dispatchStop', () => {
      void chat.stop();
    });

    const finishedSubscription = persistenceActorRef.on('applyFinishedRequest', ({ messages, cause }) => {
      resetMilestonePersistTracking();
      const sanitized = finalizeInterruptedToolParts(messages, chatId, cause);
      if (sanitized !== messages) {
        chat.messages = sanitized;
      }
      persistenceActorRef.send({ type: 'queuePersist', messages: sanitized });
    });

    const stoppedSubscription = persistenceActorRef.on('applyStoppedRequest', ({ messages, cause }) => {
      resetMilestonePersistTracking();
      let sanitized = finalizeInterruptedToolParts(messages, chatId, cause);

      const last = sanitized.at(-1);
      if (last?.role === 'user' && last.metadata?.status === 'pending') {
        sanitized = sanitized.with(-1, {
          ...last,
          metadata: { ...last.metadata, status: 'cancelled' },
        });
      }

      chat.messages = sanitized;
      persistenceActorRef.send({ type: 'queuePersist', messages: sanitized });
    });

    // Empty-cancel companion to `applyStoppedRequest`: commit the truncated
    // transcript and restored composer draft as one durable chat-row
    // transition. The draft-machine event is intentionally transient; storage
    // durability is owned by `commitCancelledDraftRestore`.
    //
    // `chat-history.tsx` subscribes to the same emit independently to
    // refocus the composer in the next animation frame.
    const restoreSubscription = persistenceActorRef.on(
      'restoreCancelledDraft',
      async ({ userMessage, truncatedMessages }) => {
        resetMilestonePersistTracking();
        const draft = buildDraftFromUserMessage(userMessage);
        chat.messages = truncatedMessages;
        draftActorRef.send({ type: 'loadDraftFromMessageTransient', draft });
        try {
          await depsRef().commitCancelledDraftRestore(chatId, {
            messages: truncatedMessages,
            draft,
          });
        } catch (error) {
          const persistenceError =
            error instanceof Error ? error : new Error('Failed to restore cancelled draft', { cause: error });
          persistenceActorRef.send({
            type: 'setPersistedError',
            error: parseErrorForPersistence(persistenceError),
          });
        }
      },
    );

    const resumedSubscription = persistenceActorRef.on('applyResumedRequest', ({ messages, cause }) => {
      resetMilestonePersistTracking();
      const sanitized = finalizeInterruptedToolParts(messages, chatId, cause);
      chat.messages = sanitized;
      persistenceActorRef.send({ type: 'queuePersist', messages: sanitized });
    });

    /*
     * A host reattach replays the whole durable log from cursor 0, because the
     * host may have finished the turn with no client attached. The AI SDK
     * *continues* a trailing assistant message on a resume instead of starting
     * a new one, and it keys tool parts by `toolCallId` and data parts by `id`
     * but keys text and reasoning parts by nothing — so a replay over the
     * transcript this store restored from local persistence merged the tool
     * cards in place and appended a second copy of every text block. Each later
     * turn then froze that doubling into history: the operator's four-run chat
     * rendered its third turn four times and its first turn twice
     * (2026-09-03).
     *
     * The log is the authority (PH19), so the transport hands over the
     * transcript the whole log implies and this store splices it in — every run
     * the log names is replaced, healing whatever earlier reloads left behind.
     * It is called only once the host has answered `attach`, so a chat whose
     * log this host does not hold keeps the transcript it had.
     */
    const unregisterRunReset = registerAgentHostRunReset(chatId, (rebuild) => {
      resetMilestonePersistTracking();
      chat.messages = [...rebuild(chat.messages)];
    });

    // Wire the AI SDK Chat's snapshot callbacks into per-chatId subscriber
    // sets. `~registerMessagesCallback` etc. are public (the `~` prefix is
    // the AI SDK's "internal-but-intended-for-subscribers" marker — see
    // node_modules/@ai-sdk/react/dist/index.d.ts).
    const unregisterMessages = chat['~registerMessagesCallback'](() => {
      const approvalIsPending = hasPendingApproval(chat.messages);
      if (approvalIsPending && !approvalWasPending) {
        markUnreadIfUnattended();
      }
      approvalWasPending = approvalIsPending;

      const lastIndex = chat.messages.length - 1;
      const last = chat.messages[lastIndex];
      if (last?.role === 'assistant') {
        const milestoneCount = countPersistMilestones(last);
        if (
          lastIndex !== milestonePersistState.lastPersistedMilestoneIndex ||
          milestoneCount > milestonePersistState.lastPersistedMilestonePartCount
        ) {
          milestonePersistState.lastPersistedMilestoneIndex = lastIndex;
          milestonePersistState.lastPersistedMilestonePartCount = milestoneCount;
          persistenceActorRef.send({ type: 'queuePersist', messages: chat.messages });
        }
      }

      // Track per-turn cost aggregated across `data-usage` parts.
      const totalCost = aggregateUsageCost(chat.messages);
      if (totalCost !== session.usage?.totalCost) {
        session.usage = { totalCost, lastUpdatedAt: Date.now() };
        this.#usageTopics.get(chatId)?.emit();
      }
      this.#chatTopics.get(chatId)?.emit();
    });
    const unregisterStatus = chat['~registerStatusCallback'](() => {
      const next = chat.status;
      if (session.status !== next) {
        session.status = next;
        if (next === 'streaming') {
          persistenceActorRef.send({ type: 'streamResumed' });
        }
        if (session.durableRunId && (next === 'submitted' || next === 'streaming')) {
          session.durableRunState = 'active';
        }
        this.#statusTopics.get(chatId)?.emit();
      }
      this.#chatTopics.get(chatId)?.emit();
    });
    const unregisterError = chat['~registerErrorCallback'](() => {
      this.#chatTopics.get(chatId)?.emit();
    });

    persistenceActorRef.start();
    draftActorRef.start();

    // oxlint-disable-next-line eslint/prefer-const -- assigned after `session.dispose` captures it so immediate actor emissions cannot observe a partial session.
    let lifecycleSubscription: { unsubscribe: () => void } | undefined;
    let requestLifecycleWasActive = false;
    session = {
      chatId,
      chat,
      persistenceActorRef,
      draftActorRef,
      viewRefcount: 1,
      runHeld: false,
      durableRunId: undefined,
      durableRunState: undefined,
      reattachedHostId: undefined,
      seededDispatch: false,
      activeRunBody: undefined,
      status: chat.status,
      usage: undefined,
      latestAgentBody: undefined,
      latestAgentBodyWaiters: new Set(),
      dispose: () => {
        for (const resolve of session.latestAgentBodyWaiters) {
          resolve(undefined);
        }
        session.latestAgentBodyWaiters.clear();
        dispatchSubscription.unsubscribe();
        stopSubscription.unsubscribe();
        finishedSubscription.unsubscribe();
        stoppedSubscription.unsubscribe();
        restoreSubscription.unsubscribe();
        resumedSubscription.unsubscribe();
        lifecycleSubscription?.unsubscribe();
        unregisterRunReset();
        unregisterMessages();
        unregisterStatus();
        unregisterError();
      },
    };

    lifecycleSubscription = persistenceActorRef.subscribe((snapshot) => {
      const idle = snapshot.matches({ requestLifecycle: 'idle' });
      if (!idle) {
        requestLifecycleWasActive = true;
        return;
      }
      if (!requestLifecycleWasActive) {
        return;
      }
      requestLifecycleWasActive = false;
      this.#scheduleRunReleaseIfTerminal(session);
    });

    // Kick off chat hydration only after the session record exists. The load
    // actor may dispatch a startup run, whose non-view hold must be able to
    // reference the fully initialised session.
    persistenceActorRef.send({ type: 'setActiveChatId', chatId });

    return session;
  }

  #withAdmission(body: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (admissionEnvelopeSchema.safeParse(body['admission']).success) {
      return body;
    }

    return Object.freeze({
      ...body,
      admission: Object.freeze({
        version: 1,
        idempotencyKey: generatePrefixedId(idPrefix.request),
      }),
    });
  }

  async #waitForLatestAgentBody(session: InternalSession): Promise<LatestAgentBodyFactory | undefined> {
    if (session.latestAgentBody) {
      return session.latestAgentBody;
    }
    return new Promise((resolve) => {
      session.latestAgentBodyWaiters.add(resolve);
    });
  }

  #scheduleRunReleaseIfTerminal(session: InternalSession): void {
    queueMicrotask(() => {
      if (!session.runHeld || !session.persistenceActorRef.getSnapshot().matches({ requestLifecycle: 'idle' })) {
        return;
      }
      session.runHeld = false;
      session.activeRunBody = undefined;
      this.#disposeIfUnreferenced(session);
    });
  }

  #disposeIfUnreferenced(session: InternalSession): void {
    if (
      session.viewRefcount > 0 ||
      session.runHeld ||
      session.durableRunId !== undefined ||
      this.#sessions.get(session.chatId) !== session
    ) {
      return;
    }

    session.dispose();
    session.persistenceActorRef.stop();
    session.draftActorRef.stop();
    this.#sessions.delete(session.chatId);
    clearLedger(session.chatId);
    this.#disposeChatTopics(session.chatId);
    this.#refreshSnapshot();
    this.#notifyMembership();
  }

  #addPerChatListener({
    bucket,
    namePrefix,
    chatId,
    listener,
  }: {
    bucket: Map<string, Topic<void>>;
    namePrefix: string;
    chatId: string;
    listener: () => void;
  }): () => void {
    let topic = bucket.get(chatId);
    if (!topic) {
      topic = new Topic<void>({ name: `ChatSessionStore.${namePrefix}[${chatId}]` });
      bucket.set(chatId, topic);
    }
    const unsubscribe = topic.subscribe(listener);
    return () => {
      unsubscribe();
      if (topic.size === 0) {
        bucket.delete(chatId);
        topic.dispose();
      }
    };
  }

  #disposeChatTopics(chatId: string): void {
    for (const bucket of [this.#chatTopics, this.#statusTopics, this.#usageTopics]) {
      const topic = bucket.get(chatId);
      if (topic) {
        topic.dispose();
        bucket.delete(chatId);
      }
    }
  }

  #refreshSnapshot(): void {
    this.#snapshot = [...this.#sessions.keys()];
  }

  #notifyMembership(): void {
    if (this.#membershipNotifyScheduled) {
      return;
    }
    this.#membershipNotifyScheduled = true;
    queueMicrotask(() => {
      this.#membershipNotifyScheduled = false;
      this.#membershipTopic.emit();
    });
  }
}
